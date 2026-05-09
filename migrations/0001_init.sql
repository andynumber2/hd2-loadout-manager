CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  is_admin      INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stratagems (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL UNIQUE,
  category         TEXT NOT NULL,
  call_in_sequence TEXT,
  image_url        TEXT,
  is_active        INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS weapons_primary (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL UNIQUE,
  type      TEXT,
  image_url TEXT,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS weapons_secondary (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL UNIQUE,
  image_url TEXT,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS grenades (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL UNIQUE,
  image_url TEXT,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS armor (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  armor_class TEXT,
  passive     TEXT,
  image_url   TEXT,
  is_active   INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS boosters (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL UNIQUE,
  image_url TEXT,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS loadouts (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  enemy_faction       TEXT NOT NULL,
  is_public           INTEGER DEFAULT 0,
  share_id            TEXT UNIQUE NOT NULL,
  primary_weapon_id   INTEGER REFERENCES weapons_primary(id),
  secondary_weapon_id INTEGER REFERENCES weapons_secondary(id),
  grenade_id          INTEGER REFERENCES grenades(id),
  armor_id            INTEGER REFERENCES armor(id),
  booster_id          INTEGER REFERENCES boosters(id),
  created_at          TEXT DEFAULT (datetime('now')),
  updated_at          TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS loadout_stratagems (
  loadout_id   INTEGER NOT NULL REFERENCES loadouts(id) ON DELETE CASCADE,
  stratagem_id INTEGER NOT NULL REFERENCES stratagems(id),
  slot         INTEGER NOT NULL,
  PRIMARY KEY (loadout_id, slot)
);
