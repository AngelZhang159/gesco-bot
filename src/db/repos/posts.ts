import type { Db } from "../index.js";
import { now } from "../index.js";

export interface Post {
  guild_id: string;
  source: string;
  item_id: string;
  channel_id: string | null;
  message_id: string | null;
  posted_at: number;
}

export class PostRepo {
  constructor(private readonly db: Db) {}

  has(guildId: string, source: string, itemId: string): boolean {
    return !!this.db
      .prepare("SELECT 1 FROM posts WHERE guild_id = ? AND source = ? AND item_id = ?")
      .get(guildId, source, itemId);
  }

  get(guildId: string, source: string, itemId: string): Post | undefined {
    return this.db
      .prepare("SELECT * FROM posts WHERE guild_id = ? AND source = ? AND item_id = ?")
      .get(guildId, source, itemId) as Post | undefined;
  }

  /** channelId/messageId null = marcar como visto sin publicar. */
  record(guildId: string, source: string, itemId: string, channelId: string | null, messageId: string | null): void {
    this.db
      .prepare(
        `INSERT INTO posts (guild_id, source, item_id, channel_id, message_id, posted_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (guild_id, source, item_id) DO UPDATE SET channel_id = excluded.channel_id, message_id = excluded.message_id`,
      )
      .run(guildId, source, itemId, channelId, messageId, now());
  }

  /** Todas las publicaciones de un elemento (en todos los servidores), para editarlas. */
  listForItem(source: string, itemId: string): Post[] {
    return this.db
      .prepare("SELECT * FROM posts WHERE source = ? AND item_id = ? AND message_id IS NOT NULL")
      .all(source, itemId) as Post[];
  }

  delete(guildId: string, source: string, itemId: string): void {
    this.db.prepare("DELETE FROM posts WHERE guild_id = ? AND source = ? AND item_id = ?").run(guildId, source, itemId);
  }
}
