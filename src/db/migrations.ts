/**
 * Migraciones en orden. Nunca modifiques una ya publicada: añade una nueva al final.
 * Van en TS (y no en .sql) para que el build de Docker no tenga que copiar ficheros extra.
 */
export const migrations: string[] = [
  /* 001_init */ `
  CREATE TABLE guild_config (
    guild_id          TEXT PRIMARY KEY,
    channel_id        TEXT,
    epic_channel_id   TEXT,
    drops_channel_id  TEXT,
    pickem_channel_id TEXT,
    epic_on           INTEGER NOT NULL DEFAULT 1,
    drops_on          INTEGER NOT NULL DEFAULT 1,
    pickem_on         INTEGER NOT NULL DEFAULT 1,
    tz                TEXT NOT NULL DEFAULT 'Europe/Madrid',
    created_at        INTEGER NOT NULL
  );

  CREATE TABLE subscriptions (
    guild_id   TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    category   TEXT NOT NULL CHECK (category IN ('epic', 'drops', 'pickem')),
    created_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id, category)
  );

  CREATE TABLE drops_filters (
    guild_id  TEXT NOT NULL,
    user_id   TEXT NOT NULL,
    game_key  TEXT NOT NULL,
    game_name TEXT NOT NULL,
    mode      TEXT NOT NULL CHECK (mode IN ('allow', 'block')),
    PRIMARY KEY (guild_id, user_id, game_key)
  );

  -- Caché global de lo que devuelven las fuentes (epic, drops)
  CREATE TABLE items (
    source     TEXT NOT NULL,
    item_id    TEXT NOT NULL,
    payload    TEXT NOT NULL,
    first_seen INTEGER NOT NULL,
    last_seen  INTEGER NOT NULL,
    PRIMARY KEY (source, item_id)
  );

  -- Qué se ha publicado en cada servidor (message_id NULL = marcado como visto sin publicar)
  CREATE TABLE posts (
    guild_id   TEXT NOT NULL,
    source     TEXT NOT NULL,
    item_id    TEXT NOT NULL,
    channel_id TEXT,
    message_id TEXT,
    posted_at  INTEGER NOT NULL,
    PRIMARY KEY (guild_id, source, item_id)
  );

  CREATE TABLE pickems (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    game_key            TEXT NOT NULL,
    game_name           TEXT NOT NULL,
    title               TEXT NOT NULL,
    url                 TEXT NOT NULL,
    deadline_at         INTEGER,
    deadline_confidence TEXT NOT NULL CHECK (deadline_confidence IN ('alta', 'baja', 'ninguna')),
    published_at        INTEGER NOT NULL,
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL,
    discarded           INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX pickems_game ON pickems (game_key, discarded);

  CREATE TABLE reminders_sent (
    guild_id  TEXT NOT NULL,
    pickem_id INTEGER NOT NULL,
    sent_at   INTEGER NOT NULL,
    PRIMARY KEY (guild_id, pickem_id)
  );

  -- Artículos ya analizados, para no descargarlos en cada ciclo
  CREATE TABLE article_cache (
    url                 TEXT PRIMARY KEY,
    resolved_url        TEXT,
    fetched_at          INTEGER NOT NULL,
    deadline_at         INTEGER,
    deadline_confidence TEXT NOT NULL,
    closed              INTEGER NOT NULL DEFAULT 0
  );
  `,
];
