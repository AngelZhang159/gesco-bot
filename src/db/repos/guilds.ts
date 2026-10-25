import type { Db } from "../index.js";
import { now } from "../index.js";
import type { Category } from "../../types.js";

export interface GuildConfig {
  guild_id: string;
  channel_id: string | null;
  epic_channel_id: string | null;
  drops_channel_id: string | null;
  pickem_channel_id: string | null;
  epic_on: number;
  drops_on: number;
  pickem_on: number;
  tz: string;
  created_at: number;
}

export class GuildRepo {
  constructor(private readonly db: Db) {}

  get(guildId: string): GuildConfig | undefined {
    return this.db.prepare("SELECT * FROM guild_config WHERE guild_id = ?").get(guildId) as GuildConfig | undefined;
  }

  ensure(guildId: string): GuildConfig {
    this.db
      .prepare("INSERT OR IGNORE INTO guild_config (guild_id, created_at) VALUES (?, ?)")
      .run(guildId, now());
    return this.get(guildId)!;
  }

  /** category = null cambia el canal por defecto. */
  setChannel(guildId: string, category: Category | null, channelId: string | null): void {
    this.ensure(guildId);
    const column = category ? `${category}_channel_id` : "channel_id";
    this.db.prepare(`UPDATE guild_config SET ${column} = ? WHERE guild_id = ?`).run(channelId, guildId);
  }

  setEnabled(guildId: string, category: Category, on: boolean): void {
    this.ensure(guildId);
    this.db.prepare(`UPDATE guild_config SET ${category}_on = ? WHERE guild_id = ?`).run(on ? 1 : 0, guildId);
  }

  /** Servidores con al menos un canal configurado. */
  listConfigured(): GuildConfig[] {
    return this.db
      .prepare(
        `SELECT * FROM guild_config
         WHERE channel_id IS NOT NULL OR epic_channel_id IS NOT NULL
            OR drops_channel_id IS NOT NULL OR pickem_channel_id IS NOT NULL`,
      )
      .all() as GuildConfig[];
  }

  remove(guildId: string): void {
    this.db.transaction(() => {
      for (const table of ["guild_config", "subscriptions", "drops_filters", "posts", "reminders_sent"]) {
        this.db.prepare(`DELETE FROM ${table} WHERE guild_id = ?`).run(guildId);
      }
    })();
  }
}

/** Canal donde publicar una categoría, o null si está desactivada o sin canal. */
export function channelFor(cfg: GuildConfig, category: Category): string | null {
  if (!cfg[`${category}_on`]) return null;
  return cfg[`${category}_channel_id`] ?? cfg.channel_id;
}
