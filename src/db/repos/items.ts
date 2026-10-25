import type { Db } from "../index.js";
import { now } from "../index.js";

/** Caché de los últimos datos buenos de cada fuente. */
export class ItemRepo {
  constructor(private readonly db: Db) {}

  /** Sustituye el contenido de una fuente por la lista actual (en una transacción). */
  replaceAll<T>(source: string, items: { id: string; data: T }[]): void {
    const t = now();
    const upsert = this.db.prepare(
      `INSERT INTO items (source, item_id, payload, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (source, item_id) DO UPDATE SET payload = excluded.payload, last_seen = excluded.last_seen`,
    );
    this.db.transaction(() => {
      for (const item of items) upsert.run(source, item.id, JSON.stringify(item.data), t, t);
      // Lo que ya no aparece en la fuente deja de estar en caché
      this.db
        .prepare("DELETE FROM items WHERE source = ? AND item_id NOT IN (SELECT value FROM json_each(?))")
        .run(source, JSON.stringify(items.map((i) => i.id)));
    })();
  }

  list<T>(source: string): T[] {
    const rows = this.db
      .prepare("SELECT payload FROM items WHERE source = ? ORDER BY first_seen")
      .all(source) as { payload: string }[];
    return rows.map((r) => JSON.parse(r.payload) as T);
  }
}
