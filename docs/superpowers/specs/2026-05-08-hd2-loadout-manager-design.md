# HD2 Loadout Manager — Design Spec
Date: 2026-05-08

## Overview

A web-based loadout manager for Helldivers 2. Users create accounts, build named loadouts, and tag each loadout with the enemy faction it targets (Terminids, Automatons, Illuminate). Each loadout captures the full gear kit: 4 stratagems, primary weapon, secondary weapon, grenade, armor, and booster.

Hosted on Cloudflare Pages with a D1 database and R2 bucket for game images. No build step — vanilla JS, HTML, CSS.

---

## Architecture

```
Browser
  └── Cloudflare Pages (static HTML/CSS/JS)
        └── Pages Functions (/functions/api/*)
              ├── D1 Database
              └── R2 Bucket (hd2-assets) — game entity images
```

- **Frontend**: Vanilla JS modules, HTML, CSS. No framework, no bundler.
- **Backend**: Cloudflare Pages Functions — one file per endpoint under `/functions/api/`.
- **Database**: Cloudflare D1 (SQLite). All persistence: auth, game entities, loadouts.
- **Image storage**: Cloudflare R2 bucket (`hd2-assets`). Game entity images are downloaded from the wiki and uploaded to R2. The DB stores the public R2 URL for each item, not the wiki URL.
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
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  is_admin      INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now'))
)

sessions (
  id         TEXT PRIMARY KEY,   -- 32-byte hex token
  user_id    INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
)
```

### Game Entity Tables

Seeded via SQL migration files. After each game patch, Claude reviews the wiki and produces a new migration with additions or `is_active` updates. No application code changes required for content updates.

```sql
stratagems (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  category         TEXT NOT NULL,  -- Orbital | Eagle | Support Weapon | Backpack | Mission
  call_in_sequence TEXT,           -- e.g. "up,down,right,left"
  image_url        TEXT,           -- R2 public URL, e.g. https://assets.hd2loadouts.com/stratagems/orbital-laser.png
  is_active        INTEGER DEFAULT 1
)

weapons_primary (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL,
  type      TEXT,
  image_url TEXT,
  is_active INTEGER DEFAULT 1
)

weapons_secondary (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL,
  image_url TEXT,
  is_active INTEGER DEFAULT 1
)

grenades (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL,
  image_url TEXT,
  is_active INTEGER DEFAULT 1
)

armor (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  armor_class TEXT,   -- light | medium | heavy
  passive     TEXT,
  image_url   TEXT,
  is_active   INTEGER DEFAULT 1
)

boosters (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL,
  image_url TEXT,
  is_active INTEGER DEFAULT 1
)
```

`is_active = 0` soft-disables items removed from the game without breaking saved loadouts that reference them.

`image_url` values point to the R2 bucket, not the wiki. Images are downloaded from helldivers.wiki.gg and uploaded to R2 during the game data seeding/update process.

### Loadout Tables

```sql
loadouts (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id              INTEGER NOT NULL REFERENCES users(id),
  name                 TEXT NOT NULL,
  enemy_faction        TEXT NOT NULL,  -- terminids | automatons | illuminate
  is_public            INTEGER DEFAULT 0,
  share_id             TEXT UNIQUE,    -- 8-char base62, generated on creation
  primary_weapon_id    INTEGER REFERENCES weapons_primary(id),
  secondary_weapon_id  INTEGER REFERENCES weapons_secondary(id),
  grenade_id           INTEGER REFERENCES grenades(id),
  armor_id             INTEGER REFERENCES armor(id),
  booster_id           INTEGER REFERENCES boosters(id),
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

**`share_id`** is an 8-character base62 string (a-zA-Z0-9) generated via Web Crypto on creation for every loadout. 62^8 ≈ 218 trillion combinations — collision-safe at any realistic scale. The share URL is `/s/:share_id`.

A loadout at `/s/xK7mNp2q` is only accessible to the public when `is_public = 1`. If `is_public = 0`, the route returns 404.

---

## Frontend Pages

| Path | Description |
|------|-------------|
| `/` | Login and register forms. Redirects to `/loadouts` if session is active. |
| `/loadouts` | Lists all of the current user's loadouts. Each card shows name, faction tag, public badge (if public), share link, and edit/delete actions. "New Loadout" button. |
| `/loadouts/new` | Loadout builder in create mode. |
| `/loadouts/:id` | Loadout builder in edit mode, pre-populated. |
| `/s/:share_id` | Public read-only view of a loadout. No auth required. Returns 404 if loadout is private. |

### Loadout Builder UX

- **Name**: text input
- **Faction**: three toggle buttons — TERMINIDS / AUTOMATONS / ILLUMINATE (one active at a time)
- **Stratagems**: 4 slot tiles. Each slot shows the stratagem's image (from wiki) and name. Clicking an empty slot opens a modal overlay with:
  - Category filter tabs: ALL / ORBITAL / EAGLE / SUPPORT / BACKPACK / MISSION
  - Text search input
  - Scrollable grid of stratagem icons + names
  - Click to assign; click assigned slot again to clear
- **Primary / Secondary / Grenade / Armor / Booster**: dropdown selectors showing image + name, populated from game entity tables
- **Make Public**: checkbox. When checked, displays the share URL (`/s/:share_id`) for easy copying.
- **Save Loadout** / **Discard** buttons

### Public Share View (`/s/:share_id`)

Read-only display of the full loadout: name, owner username, faction, all 4 stratagems with images, and all gear slots. No edit controls. "Login to build your own" CTA at the bottom.

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
| GET | `/api/game/stratagems` | All active stratagems (includes image_url) |
| GET | `/api/game/weapons` | All active primary + secondary weapons |
| GET | `/api/game/grenades` | All active grenades |
| GET | `/api/game/armor` | All active armor |
| GET | `/api/game/boosters` | All active boosters |

### Loadouts (session required)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/loadouts` | All loadouts for current user |
| POST | `/api/loadouts` | Create loadout (generates share_id) |
| GET | `/api/loadouts/:id` | Single loadout (must belong to user) |
| PUT | `/api/loadouts/:id` | Update loadout |
| DELETE | `/api/loadouts/:id` | Delete loadout |

### Public Share (no auth required)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/share/:share_id` | Return loadout data if is_public = 1, else 404 |

---

## File Structure

```
/
├── public/
│   ├── index.html          # Login/register
│   ├── loadouts.html       # Loadout list
│   ├── builder.html        # Loadout builder (new + edit)
│   ├── share.html          # Public read-only loadout view
│   ├── css/
│   │   └── main.css
│   └── js/
│       ├── api.js          # fetch wrapper, session handling
│       ├── auth.js         # login/register logic
│       ├── loadouts.js     # list page logic
│       ├── builder.js      # builder page logic
│       └── share.js        # public share view logic
├── functions/
│   └── api/
│       ├── _helpers.js     # getUser, hashPassword, sessionCookie, genShareId
│       ├── auth/
│       │   ├── login.js
│       │   ├── register.js
│       │   ├── logout.js
│       │   └── me.js
│       ├── game/
│       │   ├── stratagems.js
│       │   ├── weapons.js
│       │   ├── grenades.js
│       │   ├── armor.js
│       │   └── boosters.js
│       ├── loadouts/
│       │   ├── index.js    # GET list, POST create
│       │   └── [id].js     # GET, PUT, DELETE single
│       └── share/
│           └── [share_id].js  # GET public loadout
├── migrations/
│   ├── 0001_init.sql            # users, sessions, game entities, loadouts
│   └── 0002_seed_game_data.sql  # initial stratagem/weapon/etc. data from wiki
└── wrangler.toml
```

---

## Game Data Maintenance

Game entity data (stratagems, weapons, grenades, armor) lives in D1; their images live in R2. After each Helldivers 2 patch, Claude:

1. Reviews helldivers.wiki.gg for additions, changes, and removals
2. Downloads any new or changed images from the wiki and uploads them to the `hd2-assets` R2 bucket under a stable path (e.g., `stratagems/<slug>.png`)
3. Produces a new SQL migration file with:
   - `INSERT` statements for new items (with R2 `image_url`)
   - `UPDATE` statements for renamed or rebalanced items
   - `SET is_active = 0` for removed items

No application code deployment is required for these updates. R2 image paths use stable slugs derived from item names, so URLs don't change when the wiki reorganizes its own image hosting.

---

## Out of Scope / Deferred

- Loadout import/export
- Browsing other users' public loadouts (discovery feed)
- Mobile-optimized layout (responsive is a stretch goal, not required)
- Automated game data sync

---

## Success Criteria

1. Users can register, log in, and log out
2. Users can create, name, edit, and delete loadouts
3. Each loadout stores 4 stratagems (with images), primary, secondary, grenade, armor, booster, and enemy faction
4. Multiple loadouts can be saved per user account
5. A loadout can be marked public, generating a short shareable URL (`/s/:share_id`)
6. The public share page displays the full loadout to anyone with the link, no login required
7. Game data can be updated via a SQL migration file without any application code changes
8. Stratagem and gear images sourced from the wiki are displayed in the builder and share view
9. UI matches the Military Ops Terminal aesthetic
