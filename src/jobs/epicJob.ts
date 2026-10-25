import type { AppContext } from "../context.js";
import { channelFor } from "../db/repos/guilds.js";
import { logger } from "../logger.js";
import { epicMessage } from "../notifier/embeds.js";
import { epicBatchId, fetchEpicFreeGames, type EpicFreeGames } from "../sources/epic.js";
import { Exclusive } from "./exclusive.js";

const SOURCE = "epic";
const CACHE_ID = "latest";

export class EpicJob {
  private readonly lock = new Exclusive();

  constructor(private readonly ctx: AppContext) {}

  /** Últimos datos buenos (para /epic si Epic no responde). */
  cached(): EpicFreeGames | null {
    return this.ctx.repos.items.list<EpicFreeGames>(SOURCE)[0] ?? null;
  }

  async fetch(): Promise<EpicFreeGames> {
    const data = await fetchEpicFreeGames(this.ctx.config.EPIC_LOCALE, this.ctx.config.EPIC_COUNTRY);
    this.ctx.repos.items.replaceAll(SOURCE, [{ id: CACHE_ID, data }]);
    return data;
  }

  /** Datos frescos o, si falla la petición, los de caché. */
  async current(): Promise<EpicFreeGames | null> {
    try {
      return await this.fetch();
    } catch (err) {
      logger.warn({ err: String(err) }, "Epic no responde, usando caché");
      return this.cached();
    }
  }

  run(): Promise<void> {
    return this.lock.run(async () => {
      let data: EpicFreeGames;
      try {
        data = await this.fetch();
      } catch (err) {
        logger.warn({ err: String(err) }, "No se pudieron obtener los juegos gratis de Epic");
        return;
      }
      if (data.current.length === 0) return;

      const batch = epicBatchId(data.current);
      for (const cfg of this.ctx.repos.guilds.listConfigured()) {
        if (this.ctx.repos.posts.has(cfg.guild_id, SOURCE, batch)) continue;
        await this.publishTo(cfg.guild_id, data, batch);
      }
    });
  }

  /** Publica los juegos actuales en un servidor aunque ya se hubieran publicado. */
  forceForGuild(guildId: string): Promise<string> {
    return this.lock.run(async () => {
      const data = await this.current();
      if (!data) return "No se pudo contactar con Epic Games y no hay datos en caché.";
      if (data.current.length === 0) return "Ahora mismo no hay juegos gratis en Epic.";
      const ok = await this.publishTo(guildId, data, epicBatchId(data.current));
      return ok ? `Publicados ${data.current.length} juegos gratis de Epic.` : "No pude publicar: revisa el canal y mis permisos.";
    });
  }

  private async publishTo(guildId: string, data: EpicFreeGames, batch: string): Promise<boolean> {
    const cfg = this.ctx.repos.guilds.get(guildId);
    const channelId = cfg && channelFor(cfg, "epic");
    if (!channelId) return false;
    const users = this.ctx.repos.subs.usersFor(guildId, "epic");
    const ref = await this.ctx.publisher.publish(channelId, epicMessage(data), users);
    if (!ref) return false;
    this.ctx.repos.posts.record(guildId, SOURCE, batch, ref.channelId, ref.messageId);
    logger.info({ guildId, games: data.current.map((g) => g.title) }, "Juegos gratis de Epic publicados");
    return true;
  }
}
