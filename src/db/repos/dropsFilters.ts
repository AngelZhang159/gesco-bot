import type { Db } from "../index.js";

export type FilterMode = "allow" | "block";

export interface DropsFilter {
  user_id: string;
  game_key: string;
  game_name: string;
  mode: FilterMode;
}

export class DropsFilterRepo {
  constructor(private readonly db: Db) {}

  set(guildId: string, userId: string, gameKey: string, gameName: string, mode: FilterMode): void {
    this.db
      .prepare(
        `INSERT INTO drops_filters (guild_id, user_id, game_key, game_name, mode) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (guild_id, user_id, game_key) DO UPDATE SET mode = excluded.mode, game_name = excluded.game_name`,
      )
      .run(guildId, userId, gameKey, gameName, mode);
  }

  remove(guildId: string, userId: string, gameKey: string): boolean {
    return (
      this.db
        .prepare("DELETE FROM drops_filters WHERE guild_id = ? AND user_id = ? AND game_key = ?")
        .run(guildId, userId, gameKey).changes > 0
    );
  }

  listForUser(guildId: string, userId: string): DropsFilter[] {
    return this.db
      .prepare("SELECT user_id, game_key, game_name, mode FROM drops_filters WHERE guild_id = ? AND user_id = ? ORDER BY mode, game_name")
      .all(guildId, userId) as DropsFilter[];
  }

  listForGuild(guildId: string): DropsFilter[] {
    return this.db
      .prepare("SELECT user_id, game_key, game_name, mode FROM drops_filters WHERE guild_id = ?")
      .all(guildId) as DropsFilter[];
  }
}
