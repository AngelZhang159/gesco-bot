import type { AppContext } from "../context.js";
import { channelFor } from "../db/repos/guilds.js";
import type { Pickem } from "../db/repos/pickems.js";
import { logger } from "../logger.js";
import { pickemMessage, pickemReminderMessage } from "../notifier/embeds.js";
import { decideMerge, sortCandidates } from "../sources/pickem/dedupe.js";
import { findPickemCandidates, type PickemCandidate } from "../sources/pickem/newsProvider.js";
import { loadPickemSources } from "../sources/pickem/sources.js";
import { Exclusive } from "./exclusive.js";
import { reminderTime } from "./reminder.js";

const SOURCE = "pickem";
/** Un pick'em sin fecha solo se publica si la noticia es muy reciente (si no, puede haber cerrado ya). */
const UNDATED_MAX_AGE_MS = 36 * 3600_000;
const ARTICLE_CACHE_MS = 30 * 24 * 3600_000;

export class PickemJob {
  private readonly lock = new Exclusive();

  constructor(private readonly ctx: AppContext) {}

  active(): Pickem[] {
    return this.ctx.repos.pickems.listActive();
  }

  /** Busca pick'em nuevos en las noticias, los fusiona con los conocidos y publica/edita. */
  run(): Promise<void> {
    return this.lock.run(async () => {
      try {
        await this.detect();
      } catch (err) {
        logger.warn({ err: String(err) }, "Fallo detectando pick'em");
      }
      await this.publishPending();
    });
  }

  forceForGuild(guildId: string): Promise<string> {
    return this.lock.run(async () => {
      let detectError = "";
      try {
        await this.detect();
      } catch (err) {
        detectError = ` (aviso: la búsqueda en noticias falló: ${String(err)})`;
      }
      const published = await this.publishPending(guildId);
      if (published > 0) return `Publicados ${published} pick'em.${detectError}`;

      const latest = this.active().at(-1);
      if (!latest) return `No hay pick'em activos ahora mismo.${detectError}`;
      const ok = await this.publishTo(guildId, latest);
      return ok
        ? `No había pick'em nuevos; republicado de ejemplo el de ${latest.game_name}.${detectError}`
        : "No pude publicar: revisa el canal y mis permisos.";
    });
  }

  private async detect(): Promise<void> {
    const { pickems } = this.ctx.repos;
    const sources = loadPickemSources(this.ctx.config.CONFIG_DIR);
    const candidates = await findPickemCandidates(sources, {
      tz: this.ctx.config.TZ,
      cache: { get: (l) => pickems.getArticle(l), put: (l, a) => pickems.putArticle(l, a) },
    });

    const now = Date.now();
    const active = pickems.listActive(now);
    const upgraded = new Set<number>();

    for (const c of sortCandidates(candidates)) {
      if (c.closed) continue;
      if (c.deadlineAt === null && now - c.publishedAt > UNDATED_MAX_AGE_MS) continue;
      const decision = decideMerge(c, active);
      if (decision.type === "new") {
        const p = pickems.insert(toNewPickem(c));
        active.push(p);
        logger.info({ id: p.id, game: p.game_name, title: p.title, deadline: p.deadline_at }, "Pick'em detectado");
      } else if (decision.type === "upgrade") {
        pickems.updateDeadline(decision.target.id, c.deadlineAt, c.confidence, c.title, c.url);
        const updated = pickems.get(decision.target.id)!;
        active.splice(active.indexOf(decision.target), 1, updated);
        upgraded.add(updated.id);
        logger.info({ id: updated.id, deadline: updated.deadline_at }, "Fecha límite de pick'em actualizada");
      }
    }

    for (const id of upgraded) await this.editPosts(pickems.get(id)!);
    pickems.pruneArticles(ARTICLE_CACHE_MS);
  }

  /** Publica en cada servidor los pick'em activos que aún no tenga. Devuelve cuántos ha publicado. */
  private async publishPending(onlyGuild?: string): Promise<number> {
    const active = this.active();
    let count = 0;
    for (const cfg of this.ctx.repos.guilds.listConfigured()) {
      if (onlyGuild && cfg.guild_id !== onlyGuild) continue;
      if (!channelFor(cfg, "pickem")) continue;
      for (const p of active) {
        if (this.ctx.repos.posts.has(cfg.guild_id, SOURCE, String(p.id))) continue;
        if (await this.publishTo(cfg.guild_id, p)) count++;
      }
    }
    return count;
  }

  private async publishTo(guildId: string, p: Pickem): Promise<boolean> {
    const cfg = this.ctx.repos.guilds.get(guildId);
    const channelId = cfg && channelFor(cfg, "pickem");
    if (!channelId) return false;
    const users = this.ctx.repos.subs.usersFor(guildId, "pickem");
    const ref = await this.ctx.publisher.publish(channelId, pickemMessage(p), users);
    if (!ref) return false;
    this.ctx.repos.posts.record(guildId, SOURCE, String(p.id), ref.channelId, ref.messageId);
    return true;
  }

  private async editPosts(p: Pickem): Promise<void> {
    for (const post of this.ctx.repos.posts.listForItem(SOURCE, String(p.id))) {
      await this.ctx.publisher.editEmbeds(post.channel_id!, post.message_id!, pickemMessage(p));
    }
  }

  /** Envía el recordatorio del último día en los servidores donde se publicó el pick'em. */
  runReminders(at = Date.now()): Promise<void> {
    return this.lock.run(async () => {
      const { posts, pickems, guilds, subs } = this.ctx.repos;
      for (const p of pickems.listActive(at)) {
        if (p.deadline_at === null) continue;
        for (const cfg of guilds.listConfigured()) {
          const channelId = channelFor(cfg, "pickem");
          if (!channelId || pickems.hasReminder(cfg.guild_id, p.id)) continue;
          const remindAt = reminderTime(p.deadline_at, cfg.tz);
          if (at < remindAt) continue;

          const post = posts.get(cfg.guild_id, SOURCE, String(p.id));
          if (!post?.message_id) continue;
          // Si se publicó ya dentro del último día, la publicación hace de recordatorio
          if (post.posted_at >= remindAt) {
            pickems.recordReminder(cfg.guild_id, p.id);
            continue;
          }

          const originalUrl = this.ctx.publisher.messageUrl(cfg.guild_id, post.channel_id!, post.message_id);
          const ref = await this.ctx.publisher.publish(
            channelId,
            pickemReminderMessage(p, originalUrl),
            subs.usersFor(cfg.guild_id, "pickem"),
          );
          if (ref) {
            pickems.recordReminder(cfg.guild_id, p.id);
            logger.info({ guildId: cfg.guild_id, id: p.id }, "Recordatorio de pick'em enviado");
          }
        }
      }
    });
  }

  /** Descarta un pick'em (falso positivo) y borra sus mensajes en todos los servidores. */
  async discard(id: number): Promise<boolean> {
    const p = this.ctx.repos.pickems.get(id);
    if (!p || p.discarded) return false;
    this.ctx.repos.pickems.discard(id);
    for (const post of this.ctx.repos.posts.listForItem(SOURCE, String(id))) {
      await this.ctx.publisher.delete(post.channel_id!, post.message_id!);
    }
    return true;
  }
}

function toNewPickem(c: PickemCandidate) {
  return {
    game_key: c.gameKey,
    game_name: c.gameName,
    title: c.title,
    url: c.url,
    deadline_at: c.deadlineAt,
    deadline_confidence: c.confidence,
    published_at: c.publishedAt,
  };
}
