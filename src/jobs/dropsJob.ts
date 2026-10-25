import type { AppContext } from "../context.js";
import { channelFor } from "../db/repos/guilds.js";
import { logger } from "../logger.js";
import { dropsMessage } from "../notifier/embeds.js";
import { dropsRecipients } from "../notifier/mentions.js";
import type { DropCampaign } from "../sources/drops/types.js";
import { Exclusive } from "./exclusive.js";

const SOURCE = "drops";
/** Marca de que el servidor ya tiene su "línea base" (los drops existentes no se publican). */
const BASELINE = "__baseline__";

export class DropsJob {
  private readonly lock = new Exclusive();

  constructor(private readonly ctx: AppContext) {}

  /** Campañas activas o próximas según la última consulta correcta. */
  cached(): DropCampaign[] {
    const now = Date.now();
    return this.ctx.repos.items.list<DropCampaign>(SOURCE).filter((c) => new Date(c.endAt).getTime() > now);
  }

  /** Nombres de juego conocidos (para el autocompletado). */
  knownGames(): { key: string; name: string }[] {
    const map = new Map<string, string>();
    for (const c of this.cached()) map.set(c.gameKey, c.gameName);
    return [...map].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name));
  }

  private async fetch(): Promise<DropCampaign[]> {
    const campaigns = await this.ctx.dropsSource.fetch();
    this.ctx.repos.items.replaceAll(SOURCE, campaigns.map((c) => ({ id: c.id, data: c })));
    return campaigns;
  }

  run(): Promise<void> {
    return this.lock.run(async () => {
      let campaigns: DropCampaign[];
      try {
        campaigns = await this.fetch();
      } catch (err) {
        // Nunca tratamos un fallo como "no hay drops": se conserva la caché y se reintenta
        logger.warn({ err: String(err), source: this.ctx.dropsSource.name }, "No se pudieron obtener los Twitch Drops");
        return;
      }
      for (const cfg of this.ctx.repos.guilds.listConfigured()) {
        if (!channelFor(cfg, "drops")) continue;
        await this.publishNew(cfg.guild_id, campaigns);
      }
    });
  }

  forceForGuild(guildId: string): Promise<string> {
    return this.lock.run(async () => {
      let campaigns: DropCampaign[];
      try {
        campaigns = await this.fetch();
      } catch (err) {
        campaigns = this.cached();
        if (campaigns.length === 0) return `No se pudo consultar la fuente de drops: ${String(err)}`;
      }
      const published = await this.publishNew(guildId, campaigns);
      if (published > 0) return `Publicados drops nuevos de ${published} juego(s).`;
      if (campaigns.length === 0) return "La fuente no tiene campañas de drops activas ahora mismo.";

      // Nada nuevo: publicamos de muestra el juego con la campaña más reciente
      const latest = [...campaigns].sort((a, b) => b.startAt.localeCompare(a.startAt))[0]!;
      const sample = campaigns.filter((c) => c.gameKey === latest.gameKey);
      const ok = await this.publishGame(guildId, sample);
      return ok
        ? `No había drops nuevos; publicado de ejemplo ${latest.gameName}. Usa /drops activos para ver todos.`
        : "No pude publicar: revisa el canal y mis permisos.";
    });
  }

  /** Devuelve cuántos juegos se han publicado. */
  private async publishNew(guildId: string, campaigns: DropCampaign[]): Promise<number> {
    const { posts } = this.ctx.repos;
    if (!posts.has(guildId, SOURCE, BASELINE)) {
      for (const c of campaigns) posts.record(guildId, SOURCE, c.id, null, null);
      posts.record(guildId, SOURCE, BASELINE, null, null);
      logger.info({ guildId, campaigns: campaigns.length }, "Línea base de drops creada (no se publican los existentes)");
      return 0;
    }

    const fresh = campaigns.filter((c) => !posts.has(guildId, SOURCE, c.id));
    const byGame = Map.groupBy(fresh, (c) => c.gameKey);
    let published = 0;
    for (const group of byGame.values()) {
      if (await this.publishGame(guildId, group)) published++;
    }
    return published;
  }

  private async publishGame(guildId: string, campaigns: DropCampaign[]): Promise<boolean> {
    const cfg = this.ctx.repos.guilds.get(guildId);
    const channelId = cfg && channelFor(cfg, "drops");
    const first = campaigns[0];
    if (!channelId || !first) return false;

    const recipients = dropsRecipients(
      this.ctx.repos.subs.usersFor(guildId, "drops"),
      this.ctx.repos.filters.listForGuild(guildId),
      first.gameKey,
    );
    const ref = await this.ctx.publisher.publish(channelId, dropsMessage(first.gameName, first.gameKey, campaigns), recipients);
    if (!ref) return false;
    for (const c of campaigns) this.ctx.repos.posts.record(guildId, SOURCE, c.id, ref.channelId, ref.messageId);
    logger.info({ guildId, game: first.gameName, campaigns: campaigns.length }, "Twitch Drops publicados");
    return true;
  }
}
