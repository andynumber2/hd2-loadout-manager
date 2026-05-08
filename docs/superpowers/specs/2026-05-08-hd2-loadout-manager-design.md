# HD2 Loadout Manager — Design Spec
Date: 2026-05-08

## Overview

A web-based loadout manager for Helldivers 2. Users create accounts, build named loadouts, and tag each loadout with the enemy faction it targets (Terminids, Automatons, Illuminate). Each loadout captures the full gear kit: 4 stratagems, primary weapon, secondary weapon, grenade, and armor.

Hosted on Cloudflare Pages with a D1 database. No build step — vanilla JS, HTML, CSS.

---

## Architecture

```
Browser
  └── Cloudflare Pages (static HTML/CSS/JS)
        └── Pages Functions (/functions/api/*)
              └── D1 Database
```

- **Frontend**: Vanilla JS modules, HTML, CSS. No framework, no bundler.
- **Backend**: Cloudflare Pages Functions — one file per endpoint under `/functions/api/`.
- **Database**: Cloudflare D1 (SQLite). All persistence: auth, game entities, loadouts.
- **Auth pattern**: Lifted directly from the sheepshead project (username+password, PBKDF2-SHA256, session tokens in D1, HttpOnly cookie).

---

## Visual Style

Military Ops Terminal aesthetic:
- Background: `#0a0e1a` (dark navy)
- Primary accent: `#ffd700` (gold)
- Secondary accent: `#4fc3f7` (electric blue)
- Danger/active: `#ff4444` (red)
- Font: monospace for labels/headings, sans-serif for body
- UI elements: sharp corners, thin borders, uppercase labels with letter-spacing

---

## Data Model

### Auth Tables (identical to sheepshead)

```sql
users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt         TEXT NOT NULL,
  is_admin     INTEGER DEFAULT 0,
  created_at   TEXT DEFAULT (datetime('now'))
)

sessions (
  id         TEXT PRIMARY KEY,   -- 32-byte hex token
  user_id    INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
)
```

### Game Entity Tables

Seeded via SQL migration files. Updated per game patch by adding a new migration — no application code changes required.

```sql
stratagems (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  category         TEXT NOT NULL,  -- Orbital | Eagle | Support Weapon | Backpack | Mission
  call_in_sequence TEXT,           -- e.g. "up,down,right,left"
  is_active        INTEGER DEFAULT 1
)

weapons_primary (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL,
  type      TEXT,
  is_active INTEGER DEFAULT 1
)

weapons_secondary (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL,
  is_active INTEGER DEFAULT 1
)

grenades (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL,
  is_active INTEGER DEFAULT 1
)

armor (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  armor_class TEXT,   -- light | medium | heavy
  passive     TEXT,
  is_active   INTEGER DEFAULT 1
)
```

`is_active = 0` soft-disables items removed from the game without breaking saved loadouts that reference them.

### Loadout Tables

```sql
loadouts (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id              INTEGER NOT NULL REFERENCES users(id),
  name                 TEXT NOT NULL,
  enemy_faction        TEXT NOT NULL,  -- terminids | automatons | illuminate
  primary_weapon_id    INTEGER REFERENCES weapons_primary(id),
  secondary_weapon_id  INTEGER REFERENCES weapons_secondary(id),
  grenade_id           INTEGER REFERENCES grenades(id),
  armor_id             INTEGER REFERENCES armor(id),
  created_at           TEXT DEFAULT (datetime('now')),
  updated_at           TEXT DEFAULT (datetime('now'))
)

loadout_stratagems (
  loadout_id   INTEGER NOT NULL REFERENCES loadouts(id) ON DELETE CASCADE,
  stratagem_id INTEGER NOT NULL REFERENCES stratagems(id),
  slot         INTEGER NOT NULL,  -- 1–4
  PRIMARY KEY (loadout_id, slot)
)
```

---

## Frontend Pages

| Path | Description |
|------|-------------|
| `/` | Login and register forms. Redirects to `/loadouts` if session is active. |
| `/loadouts` | Lists all of the current user's loadouts. Each card shows name, faction tag, and edit/delete actions. "New Loadout" button. |
| `/loadouts/new` | Loadout builder in create mode. |
| `/loadouts/:id` | Loadout builder in edit mode, pre-populated. |

### Loadout Builder UX

- **Name**: text input
- **Faction**: three toggle buttons — TERMINIDS / AUTOMATONS / ILLUMINATE (one active at a time)
- **Stratagems**: 4 slot tiles. Clicking an empty slot opens a modal overlay with:
  - Category filter tabs: ALL / ORBITAL / EAGLE / SUPPORT / BACKPACK / MISSION
  - Text search input
  - Scrollable grid of stratagem names
  - Click to assign; click assigned slot again to clear
- **Primary / Secondary / Grenade / Armor**: dropdown selectors populated from game entity tables
- **Save Loadout** / **Discard** buttons

---

## API Endpoints

### Auth (no session required)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create account, return session cookie |
| POST | `/api/auth/login` | Verify credentials, return session cookie |
| POST | `/api/auth/logout` | Clear session |
| GET | `/api/auth/me` | Return current user or 401 |

### Game Data (no auth required — public read)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/game/stratagems` | All active stratagems |
| GET | `/api/game/weapons` | All active primary + secondary weapons |
| GET | `/api/game/grenades` | All active grenades |
| GET | `/api/game/armor` | All active armor |

### Loadouts (session required)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/loadouts` | All loadouts for current user |
| POST | `/api/loadouts` | Create loadout |
| GET | `/api/loadouts/:id` | Single loadout (must belong to user) |
| PUT | `/api/loadouts/:id` | Update loadout |
| DELETE | `/api/loadouts/:id` | Delete loadout |

---

## File Structure

```
/
├── public/
│   ├── index.html          # Login/register
│   ├── loadouts.html       # Loadout list
│   ├── builder.html        # Loadout builder (new + edit)
│   ├── css/
│   │   └── main.css
│   └── js/
│       ├── api.js          # fetch wrapper, session handling
│       ├── auth.js         # login/register logic
│       ├── loadouts.js     # list page logic
│       └── builder.js      # builder page logic
├── functions/
│   └── api/
│       ├── _helpers.js     # getUser, hashPassword, sessionCookie
│       ├── auth/
│       │   ├── login.js
│       │   ├── register.js
│       │   ├── logout.js
│       │   └── me.js
│       ├── game/
│       │   ├── stratagems.js
│       │   ├── weapons.js
│       │   ├── grenades.js
│       │   └── armor.js
│       └── loadouts/
│           ├── index.js    # GET list, POST create
│           └── [id].js     # GET, PUT, DELETE single
├── migrations/
│   ├── 0001_init.sql       # users, sessions, game entities, loadouts
│   └── 0002_seed_game_data.sql  # initial stratagem/weapon/etc. data
└── wrangler.toml
```

---

## Out of Scope / Deferred

- Stratagem icons/images (text names only for v1)
- Loadout sharing or public visibility
- Loadout import/export
- Admin UI for game data management (SQL migrations only)
- Automated game data sync from wiki or API
- Mobile-optimized layout (responsive is a stretch goal, not required)

---

## Success Criteria

1. Users can register, log in, and log out
2. Users can create, name, edit, and delete loadouts
3. Each loadout stores 4 stratagems, primary, secondary, grenade, armor, and enemy faction
4. Multiple loadouts can be saved per user account
5. Game data (stratagems, weapons, etc.) can be updated via a SQL migration file without any application code changes
6. UI matches the Military Ops Terminal aesthetic
