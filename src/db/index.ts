import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { migrations } from "./migrations.js";

export type Db = Database.Database;

/** Abre (o crea) la base de datos y aplica las migraciones pendientes. Usa ":memory:" en tests. */
export function openDb(file: string): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (let v = current; v < migrations.length; v++) {
    db.transaction(() => {
      db.exec(migrations[v]!);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

export const now = () => Date.now();
