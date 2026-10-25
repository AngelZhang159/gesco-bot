import type { Db } from "../index.js";
import { now } from "../index.js";
import type { Category } from "../../types.js";

export class SubscriptionRepo {
  constructor(private readonly db: Db) {}

  /** Devuelve true si la suscripción es nueva. */
  subscribe(guildId: string, userId: string, category: Category): boolean {
    const res = this.db
      .prepare("INSERT OR IGNORE INTO subscriptions (guild_id, user_id, category, created_at) VALUES (?, ?, ?, ?)")
      .run(guildId, userId, category, now());
    return res.changes > 0;
  }

  /** Devuelve true si existía. */
  unsubscribe(guildId: string, userId: string, category: Category): boolean {
    const res = this.db
      .prepare("DELETE FROM subscriptions WHERE guild_id = ? AND user_id = ? AND category = ?")
      .run(guildId, userId, category);
    return res.changes > 0;
  }

  listForUser(guildId: string, userId: string): Category[] {
    const rows = this.db
      .prepare("SELECT category FROM subscriptions WHERE guild_id = ? AND user_id = ? ORDER BY category")
      .all(guildId, userId) as { category: Category }[];
    return rows.map((r) => r.category);
  }

  usersFor(guildId: string, category: Category): string[] {
    const rows = this.db
      .prepare("SELECT user_id FROM subscriptions WHERE guild_id = ? AND category = ? ORDER BY created_at")
      .all(guildId, category) as { user_id: string }[];
    return rows.map((r) => r.user_id);
  }
}
