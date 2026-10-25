import type { Db } from "../index.js";
import { now } from "../index.js";

export type DeadlineConfidence = "alta" | "baja" | "ninguna";

export interface Pickem {
  id: number;
  game_key: string;
  game_name: string;
  title: string;
  url: string;
  deadline_at: number | null;
  deadline_confidence: DeadlineConfidence;
  published_at: number;
  created_at: number;
  updated_at: number;
  discarded: number;
}

export type NewPickem = Pick<
  Pickem,
  "game_key" | "game_name" | "title" | "url" | "deadline_at" | "deadline_confidence" | "published_at"
>;

export interface CachedArticle {
  resolved_url: string | null;
  deadline_at: number | null;
  deadline_confidence: DeadlineConfidence;
  /** 1 si el artículo solo menciona cierres ya pasados. */
  closed: number;
}

/** Un pick'em sin fecha se considera activo durante estos días desde que se detectó. */
export const UNDATED_ACTIVE_MS = 5 * 24 * 3600_000;

export class PickemRepo {
  constructor(private readonly db: Db) {}

  insert(p: NewPickem): Pickem {
    const t = now();
    const res = this.db
      .prepare(
        `INSERT INTO pickems (game_key, game_name, title, url, deadline_at, deadline_confidence, published_at, created_at, updated_at)
         VALUES (@game_key, @game_name, @title, @url, @deadline_at, @deadline_confidence, @published_at, @t, @t)`,
      )
      .run({ ...p, t });
    return this.get(Number(res.lastInsertRowid))!;
  }

  updateDeadline(id: number, deadlineAt: number | null, confidence: DeadlineConfidence, title: string, url: string): void {
    this.db
      .prepare("UPDATE pickems SET deadline_at = ?, deadline_confidence = ?, title = ?, url = ?, updated_at = ? WHERE id = ?")
      .run(deadlineAt, confidence, title, url, now(), id);
  }

  get(id: number): Pickem | undefined {
    return this.db.prepare("SELECT * FROM pickems WHERE id = ?").get(id) as Pickem | undefined;
  }

  /** No descartados y con plazo abierto (o sin fecha y detectados hace poco). */
  listActive(at = now()): Pickem[] {
    return this.db
      .prepare(
        `SELECT * FROM pickems
         WHERE discarded = 0
           AND ((deadline_at IS NOT NULL AND deadline_at > @at) OR (deadline_at IS NULL AND created_at > @undated))
         ORDER BY COALESCE(deadline_at, created_at + ${UNDATED_ACTIVE_MS})`,
      )
      .all({ at, undated: at - UNDATED_ACTIVE_MS }) as Pickem[];
  }

  discard(id: number): boolean {
    return this.db.prepare("UPDATE pickems SET discarded = 1, updated_at = ? WHERE id = ?").run(now(), id).changes > 0;
  }

  hasReminder(guildId: string, pickemId: number): boolean {
    return !!this.db.prepare("SELECT 1 FROM reminders_sent WHERE guild_id = ? AND pickem_id = ?").get(guildId, pickemId);
  }

  recordReminder(guildId: string, pickemId: number): void {
    this.db
      .prepare("INSERT OR IGNORE INTO reminders_sent (guild_id, pickem_id, sent_at) VALUES (?, ?, ?)")
      .run(guildId, pickemId, now());
  }

  getArticle(url: string): CachedArticle | undefined {
    return this.db
      .prepare("SELECT resolved_url, deadline_at, deadline_confidence, closed FROM article_cache WHERE url = ?")
      .get(url) as CachedArticle | undefined;
  }

  putArticle(url: string, article: CachedArticle): void {
    this.db
      .prepare(
        `INSERT INTO article_cache (url, resolved_url, fetched_at, deadline_at, deadline_confidence, closed) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (url) DO UPDATE SET resolved_url = excluded.resolved_url, fetched_at = excluded.fetched_at,
           deadline_at = excluded.deadline_at, deadline_confidence = excluded.deadline_confidence, closed = excluded.closed`,
      )
      .run(url, article.resolved_url, now(), article.deadline_at, article.deadline_confidence, article.closed);
  }

  pruneArticles(olderThanMs: number): void {
    this.db.prepare("DELETE FROM article_cache WHERE fetched_at < ?").run(now() - olderThanMs);
  }
}
