# HD2 Loadout Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Cloudflare Pages app where Helldivers 2 players can save and share full gear loadouts, with accounts, D1 persistence, R2 image hosting, and a Military Ops Terminal UI.

**Architecture:** Vanilla JS frontend on Cloudflare Pages. Pages Functions handle all API routes under `/functions/api/`. D1 stores auth + loadouts; R2 stores game entity images served through a proxy function. Auth pattern lifted directly from the sheepshead project.

**Tech Stack:** Cloudflare Pages, Pages Functions, D1 (SQLite), R2, Wrangler CLI, Vitest (unit tests for helpers), vanilla JS/HTML/CSS.

---

## File Map

```
public/
  index.html            login + register
  loadouts.html         loadout list
  builder.html          loadout builder (new + edit via ?id=N)
  share.html            public read-only view (served for /s/* via _redirects)
  _redirects            SPA routing rules
  css/main.css          Military Ops Terminal theme
  js/api.js             fetch wrapper + 401 redirect + escape() helper
  js/auth.js            login/register page logic
  js/loadouts.js        list page logic
  js/builder.js         builder page logic
  js/share.js           public share page logic

functions/api/
  _helpers.js           hashPassword, genSalt, genToken, genShareId, getUser, sessionCookie, json
  auth/login.js
  auth/register.js
  auth/logout.js
  auth/me.js
  assets/[[path]].js    R2 image proxy
  game/stratagems.js
  game/weapons.js       returns { primary: [], secondary: [] }
  game/grenades.js
  game/armor.js
  game/boosters.js
  loadouts/index.js     GET list, POST create
  loadouts/[id].js      GET, PUT, DELETE single
  share/[share_id].js   public loadout read

migrations/
  0001_init.sql         all tables
  0002_seed_game_data.sql  game entities from wiki

scripts/
  upload-images.mjs     download wiki images + wrangler r2 object put

wrangler.toml
package.json
vitest.config.js
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `wrangler.toml`
- Create: `package.json`
- Create: `vitest.config.js`
- Create: `public/_redirects`

- [ ] **Step 1: Create the D1 database and R2 bucket**

```bash
wrangler d1 create hd2-loadout-manager
wrangler r2 bucket create hd2-assets
```

The first command prints a `database_id`. Copy it — you need it in `wrangler.toml`.

- [ ] **Step 2: Write `wrangler.toml`**

```toml
name = "hd2-loadout-manager"
compatibility_date = "2024-09-23"
pages_build_output_dir = "./public"

[[d1_databases]]
binding = "DB"
database_name = "hd2-loadout-manager"
database_id = "PASTE_DATABASE_ID_HERE"

[[r2_buckets]]
binding = "IMAGES"
bucket_name = "hd2-assets"
```

- [ ] **Step 3: Write `package.json`**

```json
{
  "name": "hd2-loadout-manager",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "wrangler pages dev"
  },
  "devDependencies": {
    "vitest": "^2.0.0",
    "wrangler": "^3.0.0"
  }
}
```

- [ ] **Step 4: Install dependencies**

```bash
npm install
```

- [ ] **Step 5: Write `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node' },
});
```

- [ ] **Step 6: Write `public/_redirects`**

```
/loadouts /loadouts.html 200
/s/* /share.html 200
```

- [ ] **Step 7: Commit**

```bash
git add wrangler.toml package.json package-lock.json vitest.config.js public/_redirects
git commit -m "feat: project scaffolding — wrangler, vitest, redirects"
```

---

## Task 2: D1 Schema Migration

**Files:**
- Create: `migrations/0001_init.sql`

- [ ] **Step 1: Write `migrations/0001_init.sql`**

```sql
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
  name             TEXT NOT NULL,
  category         TEXT NOT NULL,
  call_in_sequence TEXT,
  image_url        TEXT,
  is_active        INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS weapons_primary (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL,
  type      TEXT,
  image_url TEXT,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS weapons_secondary (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL,
  image_url TEXT,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS grenades (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL,
  image_url TEXT,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS armor (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  armor_class TEXT,
  passive     TEXT,
  image_url   TEXT,
  is_active   INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS boosters (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL,
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
```

- [ ] **Step 2: Apply migration to local D1**

```bash
wrangler d1 execute hd2-loadout-manager --local --file=migrations/0001_init.sql
```

Expected output: `✅ Applied 1 migration`

- [ ] **Step 3: Verify tables**

```bash
wrangler d1 execute hd2-loadout-manager --local --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

Expected: armor, boosters, grenades, loadout_stratagems, loadouts, sessions, stratagems, users, weapons_primary, weapons_secondary

- [ ] **Step 4: Commit**

```bash
git add migrations/0001_init.sql
git commit -m "feat: D1 schema — all tables"
```

---

## Task 3: Helper Functions (TDD)

**Files:**
- Create: `functions/api/_helpers.js`
- Create: `tests/helpers.test.js`

- [ ] **Step 1: Write the failing tests first**

Create `tests/helpers.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { hashPassword, genSalt, genToken, genShareId } from '../functions/api/_helpers.js';

describe('genSalt', () => {
  it('returns a 32-char hex string', () => {
    expect(genSalt()).toMatch(/^[0-9a-f]{32}$/);
  });
  it('returns a different value each call', () => {
    expect(genSalt()).not.toBe(genSalt());
  });
});

describe('genToken', () => {
  it('returns a 64-char hex string', () => {
    expect(genToken()).toMatch(/^[0-9a-f]{64}$/);
  });
  it('returns a different value each call', () => {
    expect(genToken()).not.toBe(genToken());
  });
});

describe('genShareId', () => {
  it('returns an 8-char alphanumeric string', () => {
    expect(genShareId()).toMatch(/^[A-Za-z0-9]{8}$/);
  });
  it('returns a different value each call', () => {
    expect(genShareId()).not.toBe(genShareId());
  });
});

describe('hashPassword', () => {
  it('returns a 64-char hex string', async () => {
    const hash = await hashPassword('password123', 'testsalt');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
  it('is deterministic for the same inputs', async () => {
    const h1 = await hashPassword('password123', 'testsalt');
    const h2 = await hashPassword('password123', 'testsalt');
    expect(h1).toBe(h2);
  });
  it('produces different hashes for different passwords', async () => {
    const h1 = await hashPassword('pass1', 'testsalt');
    const h2 = await hashPassword('pass2', 'testsalt');
    expect(h1).not.toBe(h2);
  });
  it('produces different hashes for different salts', async () => {
    const h1 = await hashPassword('password', 'salt1');
    const h2 = await hashPassword('password', 'salt2');
    expect(h1).not.toBe(h2);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test
```

Expected: FAIL — `_helpers.js` does not exist yet.

- [ ] **Step 3: Write `functions/api/_helpers.js`**

```js
export async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    key, 256
  );
  return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('');
}

export function genSalt() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), b =>
    b.toString(16).padStart(2, '0')).join('');
}

export function genToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), b =>
    b.toString(16).padStart(2, '0')).join('');
}

export function genShareId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), b =>
    chars[b % 62]).join('');
}

export async function getUser(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return null;
  return await env.DB.prepare(
    `SELECT s.user_id AS id, u.username, u.is_admin
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > datetime('now')`
  ).bind(match[1]).first() || null;
}

export function sessionCookie(token, maxAge = 604800) {
  return `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test
```

Expected: PASS — 10 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add functions/api/_helpers.js tests/helpers.test.js
git commit -m "feat: helper functions with unit tests"
```

---

## Task 4: Auth Endpoints

**Files:**
- Create: `functions/api/auth/register.js`
- Create: `functions/api/auth/login.js`
- Create: `functions/api/auth/logout.js`
- Create: `functions/api/auth/me.js`

- [ ] **Step 1: Write `functions/api/auth/register.js`**

```js
import { hashPassword, genSalt, genToken, sessionCookie, json } from '../_helpers.js';

export async function onRequestPost({ request, env }) {
  const { username, password } = await request.json();
  if (!username || !password) return json({ error: 'Username and password required' }, 400);
  if (username.length < 2 || username.length > 32) return json({ error: 'Username must be 2-32 characters' }, 400);
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) return json({ error: 'Username may only contain letters, numbers, _ and -' }, 400);
  if (password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);

  const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
  if (existing) return json({ error: 'Username already taken' }, 409);

  const salt = genSalt();
  const hash = await hashPassword(password, salt);
  const { meta } = await env.DB.prepare(
    'INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)'
  ).bind(username, hash, salt).run();

  const token = genToken();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, meta.last_row_id, expires).run();

  return new Response(JSON.stringify({ id: meta.last_row_id, username }), {
    status: 201,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie(token) },
  });
}
```

- [ ] **Step 2: Write `functions/api/auth/login.js`**

```js
import { hashPassword, genToken, sessionCookie, json } from '../_helpers.js';

export async function onRequestPost({ request, env }) {
  const { username, password } = await request.json();
  if (!username || !password) return json({ error: 'Username and password required' }, 400);

  const user = await env.DB.prepare(
    'SELECT id, username, password_hash, salt FROM users WHERE username = ?'
  ).bind(username).first();
  if (!user) return json({ error: 'Invalid credentials' }, 401);

  const hash = await hashPassword(password, user.salt);
  if (hash !== user.password_hash) return json({ error: 'Invalid credentials' }, 401);

  const token = genToken();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, user.id, expires).run();

  return new Response(JSON.stringify({ id: user.id, username: user.username }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie(token) },
  });
}
```

- [ ] **Step 3: Write `functions/api/auth/logout.js`**

```js
import { sessionCookie, json } from '../_helpers.js';

export async function onRequestPost({ request, env }) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/session=([^;]+)/);
  if (match) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(match[1]).run();
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie('', 0) },
  });
}
```

- [ ] **Step 4: Write `functions/api/auth/me.js`**

```js
import { getUser, json } from '../_helpers.js';

export async function onRequestGet({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  return json({ id: user.id, username: user.username, is_admin: user.is_admin });
}
```

- [ ] **Step 5: Start dev server and smoke-test auth**

```bash
wrangler pages dev
```

In a separate terminal:

```bash
curl -s -c /tmp/jar.txt -X POST http://localhost:8788/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"testuser","password":"password123"}' | jq .
# Expected: {"id":1,"username":"testuser"}

curl -s -b /tmp/jar.txt http://localhost:8788/api/auth/me | jq .
# Expected: {"id":1,"username":"testuser","is_admin":0}

curl -s -b /tmp/jar.txt -c /tmp/jar.txt -X POST http://localhost:8788/api/auth/logout | jq .
# Expected: {"ok":true}

curl -s -b /tmp/jar.txt http://localhost:8788/api/auth/me | jq .
# Expected: {"error":"Unauthorized"}
```

- [ ] **Step 6: Commit**

```bash
git add functions/api/auth/
git commit -m "feat: auth endpoints"
```

---

## Task 5: R2 Image Proxy Endpoint

**Files:**
- Create: `functions/api/assets/[[path]].js`

- [ ] **Step 1: Write `functions/api/assets/[[path]].js`**

```js
export async function onRequestGet({ params, env }) {
  const key = params.path.join('/');
  const obj = await env.IMAGES.get(key);
  if (!obj) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  headers.set('Content-Type', obj.httpMetadata?.contentType || 'image/png');
  headers.set('Cache-Control', 'public, max-age=86400');
  return new Response(obj.body, { headers });
}
```

- [ ] **Step 2: Verify 404 for missing objects**

```bash
curl -I http://localhost:8788/api/assets/stratagems/test.png
# Expected: HTTP/1.1 404
```

- [ ] **Step 3: Commit**

```bash
git add functions/api/assets/
git commit -m "feat: R2 image proxy endpoint"
```

---

## Task 6: Game Data API Endpoints

**Files:**
- Create: `functions/api/game/stratagems.js`
- Create: `functions/api/game/weapons.js`
- Create: `functions/api/game/grenades.js`
- Create: `functions/api/game/armor.js`
- Create: `functions/api/game/boosters.js`

- [ ] **Step 1: Write `functions/api/game/stratagems.js`**

```js
import { json } from '../_helpers.js';

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, category, call_in_sequence, image_url FROM stratagems WHERE is_active = 1 ORDER BY category, name'
  ).all();
  return json(results);
}
```

- [ ] **Step 2: Write `functions/api/game/weapons.js`**

```js
import { json } from '../_helpers.js';

export async function onRequestGet({ env }) {
  const [primary, secondary] = await Promise.all([
    env.DB.prepare('SELECT id, name, type, image_url FROM weapons_primary WHERE is_active = 1 ORDER BY name').all(),
    env.DB.prepare('SELECT id, name, image_url FROM weapons_secondary WHERE is_active = 1 ORDER BY name').all(),
  ]);
  return json({ primary: primary.results, secondary: secondary.results });
}
```

- [ ] **Step 3: Write `functions/api/game/grenades.js`**

```js
import { json } from '../_helpers.js';

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, image_url FROM grenades WHERE is_active = 1 ORDER BY name'
  ).all();
  return json(results);
}
```

- [ ] **Step 4: Write `functions/api/game/armor.js`**

```js
import { json } from '../_helpers.js';

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, armor_class, passive, image_url FROM armor WHERE is_active = 1 ORDER BY armor_class, name'
  ).all();
  return json(results);
}
```

- [ ] **Step 5: Write `functions/api/game/boosters.js`**

```js
import { json } from '../_helpers.js';

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, image_url FROM boosters WHERE is_active = 1 ORDER BY name'
  ).all();
  return json(results);
}
```

- [ ] **Step 6: Smoke-test**

```bash
curl -s http://localhost:8788/api/game/stratagems | jq length
# Expected: 0 (before seeding)

curl -s http://localhost:8788/api/game/weapons | jq .
# Expected: {"primary":[],"secondary":[]}
```

- [ ] **Step 7: Commit**

```bash
git add functions/api/game/
git commit -m "feat: game data API endpoints"
```

---

## Task 7: Game Data Seeding (Wiki + R2)

**Files:**
- Create: `scripts/upload-images.mjs`
- Create: `migrations/0002_seed_game_data.sql`

### Phase A — Image Upload Script

- [ ] **Step 1: Write `scripts/upload-images.mjs`**

Uses `execFileSync` (arguments as array, no shell) to avoid command injection.

```js
import { execFileSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BUCKET = 'hd2-assets';

export async function uploadToR2(wikiImageUrl, r2Key) {
  console.log(`  Uploading ${r2Key}...`);
  const res = await fetch(wikiImageUrl);
  if (!res.ok) {
    console.warn(`  SKIP ${wikiImageUrl} — HTTP ${res.status}`);
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const tmp = join(tmpdir(), `hd2-${Date.now()}.png`);
  writeFileSync(tmp, buf);
  try {
    execFileSync('wrangler', [
      'r2', 'object', 'put',
      `${BUCKET}/${r2Key}`,
      `--file=${tmp}`,
      '--content-type=image/png',
    ], { stdio: 'inherit' });
  } finally {
    unlinkSync(tmp);
  }
  return `/api/assets/${r2Key}`;
}
```

### Phase B — Wiki data + seed SQL

- [ ] **Step 2: Fetch wiki pages**

Fetch these pages (use WebFetch tool):
- `https://helldivers.wiki.gg/wiki/Stratagems`
- `https://helldivers.wiki.gg/wiki/Weapons`
- `https://helldivers.wiki.gg/wiki/Grenades`
- `https://helldivers.wiki.gg/wiki/Armor`
- `https://helldivers.wiki.gg/wiki/Boosters`

Extract for each item: name, category (stratagems), armor_class + passive (armor), wiki image URL.

- [ ] **Step 3: Upload all images to R2**

Derive slug: `name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')`

R2 key structure:
- Stratagems: `stratagems/<slug>.png`
- Primary weapons: `weapons/primary/<slug>.png`
- Secondary weapons: `weapons/secondary/<slug>.png`
- Grenades: `grenades/<slug>.png`
- Armor: `armor/<slug>.png`
- Boosters: `boosters/<slug>.png`

Call `uploadToR2(wikiImageUrl, r2Key)` for each item. The returned path (`/api/assets/...`) is the `image_url` to store in the DB.

- [ ] **Step 4: Write `migrations/0002_seed_game_data.sql`**

Structure (fill in all rows from the wiki — every row must be complete before applying):

```sql
INSERT INTO stratagems (name, category, call_in_sequence, image_url) VALUES
  ('Orbital Laser', 'Orbital', 'right,down,up,right,down', '/api/assets/stratagems/orbital-laser.png'),
  ('Eagle Airstrike', 'Eagle', 'up,right,down,right', '/api/assets/stratagems/eagle-airstrike.png');

INSERT INTO weapons_primary (name, type, image_url) VALUES
  ('AR-23 Liberator', 'Assault Rifle', '/api/assets/weapons/primary/ar-23-liberator.png');

INSERT INTO weapons_secondary (name, image_url) VALUES
  ('P-2 Peacemaker', '/api/assets/weapons/secondary/p-2-peacemaker.png');

INSERT INTO grenades (name, image_url) VALUES
  ('G-12 High Explosive', '/api/assets/grenades/g-12-high-explosive.png');

INSERT INTO armor (name, armor_class, passive, image_url) VALUES
  ('CM-09 Bonesnapper', 'medium', 'Extra Padding', '/api/assets/armor/cm-09-bonesnapper.png');

INSERT INTO boosters (name, image_url) VALUES
  ('Vitality Enhancement', '/api/assets/boosters/vitality-enhancement.png');
```

- [ ] **Step 5: Apply seed migration**

```bash
wrangler d1 execute hd2-loadout-manager --local --file=migrations/0002_seed_game_data.sql
```

- [ ] **Step 6: Verify**

```bash
curl -s http://localhost:8788/api/game/stratagems | jq length
# Expected: > 0

curl -s http://localhost:8788/api/game/boosters | jq .
# Expected: array of objects with name and image_url
```

- [ ] **Step 7: Commit**

```bash
git add scripts/upload-images.mjs migrations/0002_seed_game_data.sql
git commit -m "feat: game data seed — wiki images in R2, D1 populated"
```

---

## Task 8: Loadout CRUD API

**Files:**
- Create: `functions/api/loadouts/index.js`
- Create: `functions/api/loadouts/[id].js`

- [ ] **Step 1: Write `functions/api/loadouts/index.js`**

```js
import { getUser, genShareId, json } from '../_helpers.js';

export async function onRequestGet({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const { results } = await env.DB.prepare(
    `SELECT l.id, l.name, l.enemy_faction, l.is_public, l.share_id, l.updated_at,
            wp.name AS primary_weapon_name,
            ws.name AS secondary_weapon_name,
            g.name  AS grenade_name,
            a.name  AS armor_name,
            b.name  AS booster_name
     FROM loadouts l
     LEFT JOIN weapons_primary   wp ON wp.id = l.primary_weapon_id
     LEFT JOIN weapons_secondary ws ON ws.id = l.secondary_weapon_id
     LEFT JOIN grenades          g  ON g.id  = l.grenade_id
     LEFT JOIN armor             a  ON a.id  = l.armor_id
     LEFT JOIN boosters          b  ON b.id  = l.booster_id
     WHERE l.user_id = ?
     ORDER BY l.updated_at DESC`
  ).bind(user.id).all();

  return json(results);
}

export async function onRequestPost({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const {
    name, enemy_faction, is_public = 0, stratagems = [],
    primary_weapon_id = null, secondary_weapon_id = null,
    grenade_id = null, armor_id = null, booster_id = null,
  } = await request.json();

  if (!name || !enemy_faction) return json({ error: 'name and enemy_faction are required' }, 400);
  if (!['terminids', 'automatons', 'illuminate'].includes(enemy_faction))
    return json({ error: 'enemy_faction must be terminids, automatons, or illuminate' }, 400);
  if (stratagems.length > 4) return json({ error: 'Maximum 4 stratagems per loadout' }, 400);

  const share_id = genShareId();
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const { meta } = await env.DB.prepare(
    `INSERT INTO loadouts
       (user_id, name, enemy_faction, is_public, share_id,
        primary_weapon_id, secondary_weapon_id, grenade_id, armor_id, booster_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    user.id, name, enemy_faction, is_public ? 1 : 0, share_id,
    primary_weapon_id, secondary_weapon_id, grenade_id, armor_id, booster_id, now
  ).run();

  for (const s of stratagems) {
    await env.DB.prepare(
      'INSERT INTO loadout_stratagems (loadout_id, stratagem_id, slot) VALUES (?, ?, ?)'
    ).bind(meta.last_row_id, s.stratagem_id, s.slot).run();
  }

  return json({ id: meta.last_row_id, share_id }, 201);
}
```

- [ ] **Step 2: Write `functions/api/loadouts/[id].js`**

```js
import { getUser, json } from '../_helpers.js';

async function fetchFull(env, loadoutId) {
  const loadout = await env.DB.prepare(
    `SELECT l.*,
            wp.name AS primary_weapon_name,   wp.image_url AS primary_weapon_image,
            ws.name AS secondary_weapon_name, ws.image_url AS secondary_weapon_image,
            g.name  AS grenade_name,          g.image_url  AS grenade_image,
            a.name  AS armor_name,            a.image_url  AS armor_image,
            b.name  AS booster_name,          b.image_url  AS booster_image
     FROM loadouts l
     LEFT JOIN weapons_primary   wp ON wp.id = l.primary_weapon_id
     LEFT JOIN weapons_secondary ws ON ws.id = l.secondary_weapon_id
     LEFT JOIN grenades          g  ON g.id  = l.grenade_id
     LEFT JOIN armor             a  ON a.id  = l.armor_id
     LEFT JOIN boosters          b  ON b.id  = l.booster_id
     WHERE l.id = ?`
  ).bind(loadoutId).first();
  if (!loadout) return null;

  const { results: stratagems } = await env.DB.prepare(
    `SELECT ls.slot, s.id AS stratagem_id, s.name, s.category, s.image_url
     FROM loadout_stratagems ls
     JOIN stratagems s ON s.id = ls.stratagem_id
     WHERE ls.loadout_id = ?
     ORDER BY ls.slot`
  ).bind(loadoutId).all();

  return { ...loadout, stratagems };
}

export async function onRequestGet({ params, request, env }) {
  const user = await getUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const loadout = await fetchFull(env, params.id);
  if (!loadout || loadout.user_id !== user.id) return json({ error: 'Not found' }, 404);
  return json(loadout);
}

export async function onRequestPut({ params, request, env }) {
  const user = await getUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const existing = await env.DB.prepare('SELECT user_id FROM loadouts WHERE id = ?').bind(params.id).first();
  if (!existing || existing.user_id !== user.id) return json({ error: 'Not found' }, 404);

  const {
    name, enemy_faction, is_public, stratagems = [],
    primary_weapon_id = null, secondary_weapon_id = null,
    grenade_id = null, armor_id = null, booster_id = null,
  } = await request.json();

  if (!name || !enemy_faction) return json({ error: 'name and enemy_faction are required' }, 400);
  if (!['terminids', 'automatons', 'illuminate'].includes(enemy_faction))
    return json({ error: 'enemy_faction must be terminids, automatons, or illuminate' }, 400);
  if (stratagems.length > 4) return json({ error: 'Maximum 4 stratagems per loadout' }, 400);

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  await env.DB.prepare(
    `UPDATE loadouts SET
       name=?, enemy_faction=?, is_public=?,
       primary_weapon_id=?, secondary_weapon_id=?, grenade_id=?, armor_id=?, booster_id=?,
       updated_at=?
     WHERE id=?`
  ).bind(
    name, enemy_faction, is_public ? 1 : 0,
    primary_weapon_id, secondary_weapon_id, grenade_id, armor_id, booster_id,
    now, params.id
  ).run();

  await env.DB.prepare('DELETE FROM loadout_stratagems WHERE loadout_id = ?').bind(params.id).run();
  for (const s of stratagems) {
    await env.DB.prepare(
      'INSERT INTO loadout_stratagems (loadout_id, stratagem_id, slot) VALUES (?, ?, ?)'
    ).bind(params.id, s.stratagem_id, s.slot).run();
  }

  return json({ ok: true });
}

export async function onRequestDelete({ params, request, env }) {
  const user = await getUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const existing = await env.DB.prepare('SELECT user_id FROM loadouts WHERE id = ?').bind(params.id).first();
  if (!existing || existing.user_id !== user.id) return json({ error: 'Not found' }, 404);
  await env.DB.prepare('DELETE FROM loadouts WHERE id = ?').bind(params.id).run();
  return json({ ok: true });
}
```

- [ ] **Step 3: Smoke-test**

```bash
curl -s -c /tmp/jar.txt -X POST http://localhost:8788/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"testuser","password":"password123"}'

curl -s -b /tmp/jar.txt -X POST http://localhost:8788/api/loadouts \
  -H 'Content-Type: application/json' \
  -d '{"name":"Bug Stomp","enemy_faction":"terminids","stratagems":[{"stratagem_id":1,"slot":1}]}' | jq .
# Expected: {"id":1,"share_id":"<8chars>"}

curl -s -b /tmp/jar.txt http://localhost:8788/api/loadouts | jq .

curl -s -b /tmp/jar.txt http://localhost:8788/api/loadouts/1 | jq .

curl -s -b /tmp/jar.txt -X DELETE http://localhost:8788/api/loadouts/1 | jq .
# Expected: {"ok":true}
```

- [ ] **Step 4: Commit**

```bash
git add functions/api/loadouts/
git commit -m "feat: loadout CRUD API"
```

---

## Task 9: Public Share API

**Files:**
- Create: `functions/api/share/[share_id].js`

- [ ] **Step 1: Write `functions/api/share/[share_id].js`**

```js
import { json } from '../_helpers.js';

export async function onRequestGet({ params, env }) {
  const loadout = await env.DB.prepare(
    `SELECT l.name, l.enemy_faction, l.share_id,
            u.username AS owner,
            wp.name AS primary_weapon_name,   wp.image_url AS primary_weapon_image,
            ws.name AS secondary_weapon_name, ws.image_url AS secondary_weapon_image,
            g.name  AS grenade_name,          g.image_url  AS grenade_image,
            a.name  AS armor_name,            a.image_url  AS armor_image,
            b.name  AS booster_name,          b.image_url  AS booster_image
     FROM loadouts l
     JOIN users u ON u.id = l.user_id
     LEFT JOIN weapons_primary   wp ON wp.id = l.primary_weapon_id
     LEFT JOIN weapons_secondary ws ON ws.id = l.secondary_weapon_id
     LEFT JOIN grenades          g  ON g.id  = l.grenade_id
     LEFT JOIN armor             a  ON a.id  = l.armor_id
     LEFT JOIN boosters          b  ON b.id  = l.booster_id
     WHERE l.share_id = ? AND l.is_public = 1`
  ).bind(params.share_id).first();

  if (!loadout) return json({ error: 'Not found' }, 404);

  const { results: stratagems } = await env.DB.prepare(
    `SELECT ls.slot, s.id AS stratagem_id, s.name, s.category, s.image_url
     FROM loadout_stratagems ls
     JOIN stratagems s ON s.id = ls.stratagem_id
     JOIN loadouts l ON l.id = ls.loadout_id
     WHERE l.share_id = ?
     ORDER BY ls.slot`
  ).bind(params.share_id).all();

  return json({ ...loadout, stratagems });
}
```

- [ ] **Step 2: Smoke-test**

```bash
curl -s -b /tmp/jar.txt -X POST http://localhost:8788/api/loadouts \
  -H 'Content-Type: application/json' \
  -d '{"name":"Public Build","enemy_faction":"terminids","is_public":1}' | jq .
# Note the share_id

SHARE_ID="<share_id from above>"
curl -s http://localhost:8788/api/share/$SHARE_ID | jq .
# Expected: loadout with owner field, no cookie needed

# Private loadout returns 404
curl -s -b /tmp/jar.txt -X POST http://localhost:8788/api/loadouts \
  -H 'Content-Type: application/json' \
  -d '{"name":"Private","enemy_faction":"terminids","is_public":0}' | jq .
PRIV_ID="<share_id from above>"
curl -s http://localhost:8788/api/share/$PRIV_ID | jq .
# Expected: {"error":"Not found"}
```

- [ ] **Step 3: Commit**

```bash
git add functions/api/share/
git commit -m "feat: public share API endpoint"
```

---

## Task 10: CSS — Military Ops Terminal Theme

**Files:**
- Create: `public/css/main.css`

- [ ] **Step 1: Write `public/css/main.css`**

```css
:root {
  --bg:        #0a0e1a;
  --bg-card:   #0d1b2e;
  --bg-input:  #060a12;
  --border:    #1e3a5f;
  --border-hi: #2a5298;
  --gold:      #ffd700;
  --blue:      #4fc3f7;
  --red:       #ff4444;
  --muted:     #4a6080;
  --text:      #c0d8f0;
  --text-dim:  #7a9ab8;
  --font-mono: 'Courier New', Courier, monospace;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body { background: var(--bg); color: var(--text); font-family: var(--font-mono); min-height: 100vh; }

.nav { display: flex; justify-content: space-between; align-items: center; padding: 12px 24px; border-bottom: 1px solid var(--border); }
.nav-brand { color: var(--gold); font-size: 11px; letter-spacing: 3px; text-decoration: none; }
.nav-user { color: var(--blue); font-size: 11px; }
.nav-user a { color: var(--red); text-decoration: none; margin-left: 12px; }
.nav-user a:hover { text-decoration: underline; }

.container { max-width: 900px; margin: 0 auto; padding: 32px 24px; }

.label { display: block; font-size: 10px; letter-spacing: 1.5px; color: var(--text-dim); margin-bottom: 6px; text-transform: uppercase; }

input[type="text"], input[type="password"], select { background: var(--bg-input); border: 1px solid var(--border-hi); color: var(--text); font-family: var(--font-mono); font-size: 13px; padding: 8px 12px; width: 100%; outline: none; }
input:focus, select:focus { border-color: var(--blue); }

.btn { background: transparent; border: 1px solid var(--border-hi); color: var(--muted); font-family: var(--font-mono); font-size: 11px; letter-spacing: 1px; padding: 8px 18px; cursor: pointer; text-transform: uppercase; text-decoration: none; display: inline-block; }
.btn:hover { border-color: var(--blue); color: var(--blue); }
.btn-primary { background: #1a3a6e; border-color: var(--gold); color: var(--gold); }
.btn-primary:hover { background: #1e4a8e; }
.btn-danger { border-color: var(--red); color: var(--red); }
.btn-danger:hover { background: rgba(255,68,68,.1); }

.auth-wrap { max-width: 380px; margin: 80px auto; }
.auth-title { color: var(--gold); font-size: 11px; letter-spacing: 3px; text-align: center; margin-bottom: 32px; line-height: 1.8; }
.auth-tabs { display: flex; border-bottom: 1px solid var(--border); margin-bottom: 24px; }
.auth-tab { flex: 1; padding: 10px; text-align: center; font-size: 11px; letter-spacing: 1px; cursor: pointer; color: var(--muted); border-bottom: 2px solid transparent; }
.auth-tab.active { color: var(--blue); border-bottom-color: var(--blue); }
.auth-form { display: flex; flex-direction: column; gap: 16px; }
.auth-form .btn { margin-top: 8px; }
.error-msg { color: var(--red); font-size: 11px; min-height: 16px; margin-top: 8px; }

.page-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 16px; margin-bottom: 28px; }
.page-title { color: var(--gold); font-size: 11px; letter-spacing: 3px; }

.loadout-grid { display: flex; flex-direction: column; gap: 12px; }
.loadout-card { background: var(--bg-card); border: 1px solid var(--border); padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.loadout-card:hover { border-color: var(--border-hi); }
.loadout-info { flex: 1; }
.loadout-name { font-size: 14px; color: var(--text); margin-bottom: 6px; }
.loadout-meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.faction-tag { font-size: 9px; letter-spacing: 1.5px; padding: 3px 8px; border: 1px solid; }
.faction-tag.terminids  { color: #f4a300; border-color: #f4a300; }
.faction-tag.automatons { color: var(--blue); border-color: var(--blue); }
.faction-tag.illuminate { color: #b57bee; border-color: #b57bee; }
.public-badge { font-size: 9px; letter-spacing: 1px; color: var(--gold); border: 1px solid var(--gold); padding: 2px 6px; }
.share-link { font-size: 10px; color: var(--blue); }
.loadout-actions { display: flex; gap: 8px; }
.empty-state { color: var(--muted); font-size: 12px; padding: 40px 0; text-align: center; }

.builder { display: flex; flex-direction: column; gap: 24px; }
.builder-row { display: flex; gap: 16px; flex-wrap: wrap; }
.builder-field { display: flex; flex-direction: column; }
.builder-field.grow { flex: 1; min-width: 180px; }
.faction-btns { display: flex; gap: 8px; }
.faction-btn { font-family: var(--font-mono); font-size: 10px; letter-spacing: 1.5px; padding: 8px 14px; border: 1px solid var(--border-hi); background: transparent; color: var(--muted); cursor: pointer; }
.faction-btn.active.terminids  { border-color: #f4a300; color: #f4a300; }
.faction-btn.active.automatons { border-color: var(--blue); color: var(--blue); }
.faction-btn.active.illuminate { border-color: #b57bee; color: #b57bee; }

.slots { display: flex; gap: 10px; }
.slot { width: 80px; height: 80px; background: var(--bg-card); border: 1px dashed var(--border-hi); display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; position: relative; overflow: hidden; }
.slot:hover { border-color: var(--blue); }
.slot.filled { border-style: solid; border-color: var(--blue); }
.slot img { width: 48px; height: 48px; object-fit: contain; }
.slot-name { font-size: 8px; color: var(--blue); text-align: center; margin-top: 4px; padding: 0 4px; line-height: 1.2; }
.slot-empty-icon { color: var(--border-hi); font-size: 24px; }
.slot-empty-label { font-size: 9px; color: var(--muted); margin-top: 4px; }
.slot-clear { position: absolute; top: 2px; right: 4px; font-size: 10px; color: var(--red); cursor: pointer; display: none; background: none; border: none; padding: 0; }
.slot.filled:hover .slot-clear { display: block; }

.gear-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
.gear-field select { margin-top: 4px; }

.public-row { display: flex; align-items: center; gap: 12px; }
.public-row label { font-size: 11px; color: var(--text-dim); cursor: pointer; }
.share-url-box { display: none; background: var(--bg-card); border: 1px solid var(--gold); padding: 8px 12px; margin-top: 8px; align-items: center; gap: 8px; }
.share-url-box.visible { display: flex; }
.share-url-text { color: var(--gold); font-size: 12px; word-break: break-all; }
.copy-btn { font-size: 10px; color: var(--blue); cursor: pointer; white-space: nowrap; background: none; border: none; font-family: var(--font-mono); }

.modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.85); z-index: 100; padding: 40px 20px; overflow-y: auto; }
.modal-overlay.open { display: block; }
.modal { max-width: 720px; margin: 0 auto; background: var(--bg-card); border: 1px solid var(--border-hi); padding: 24px; }
.modal-title { color: var(--gold); font-size: 11px; letter-spacing: 2px; margin-bottom: 16px; }
.modal-filters { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
.cat-btn { font-family: var(--font-mono); font-size: 9px; letter-spacing: 1px; padding: 4px 10px; border: 1px solid var(--border-hi); background: transparent; color: var(--muted); cursor: pointer; }
.cat-btn.active { background: #1a3a6e; border-color: var(--blue); color: var(--blue); }
.modal-search { background: var(--bg-input); border: 1px solid var(--border-hi); color: var(--text); font-family: var(--font-mono); font-size: 12px; padding: 8px 12px; width: 100%; outline: none; margin-bottom: 16px; }
.strat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px; max-height: 400px; overflow-y: auto; }
.strat-tile { background: var(--bg-input); border: 1px solid var(--border); padding: 8px 4px; display: flex; flex-direction: column; align-items: center; cursor: pointer; gap: 4px; }
.strat-tile:hover { border-color: var(--blue); }
.strat-tile img { width: 40px; height: 40px; object-fit: contain; }
.strat-tile-name { font-size: 8px; color: var(--text-dim); text-align: center; line-height: 1.3; }
.modal-close-row { text-align: right; margin-top: 16px; }

.builder-actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 8px; }

.share-header { text-align: center; padding: 32px 0 24px; border-bottom: 1px solid var(--border); margin-bottom: 28px; }
.share-header h1 { color: var(--gold); font-size: 18px; letter-spacing: 2px; margin-top: 12px; }
.share-header .owner { color: var(--text-dim); font-size: 11px; margin-top: 8px; }
.share-section { margin-bottom: 28px; }
.share-section-title { color: var(--text-dim); font-size: 10px; letter-spacing: 2px; margin-bottom: 12px; }
.share-slots { display: flex; gap: 10px; flex-wrap: wrap; }
.share-slot { width: 80px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.share-slot img { width: 56px; height: 56px; object-fit: contain; border: 1px solid var(--border-hi); }
.share-slot-name { font-size: 8px; color: var(--text-dim); text-align: center; line-height: 1.3; }
.share-gear { display: flex; gap: 20px; flex-wrap: wrap; }
.share-gear-item { display: flex; align-items: center; gap: 8px; }
.share-gear-item img { width: 36px; height: 36px; object-fit: contain; }
.share-gear-name { font-size: 12px; color: var(--text); }
.share-cta { text-align: center; margin-top: 40px; padding-top: 24px; border-top: 1px solid var(--border); }
.share-cta p { color: var(--text-dim); font-size: 11px; margin-bottom: 12px; }
```

- [ ] **Step 2: Commit**

```bash
git add public/css/main.css
git commit -m "feat: Military Ops Terminal CSS theme"
```

---

## Task 11: Login / Register Page

**Files:**
- Create: `public/index.html`
- Create: `public/js/api.js`
- Create: `public/js/auth.js`

- [ ] **Step 1: Write `public/js/api.js`**

Exports both `api` (fetch wrapper) and `esc` (HTML escape helper used by all pages to safely interpolate user data into DOM).

```js
const BASE = '/api';

async function req(method, path, body) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, opts);
  if (res.status === 401 && path !== '/auth/me') {
    window.location.href = '/';
    return null;
  }
  return res;
}

export const api = {
  get:    (path)       => req('GET',    path),
  post:   (path, body) => req('POST',   path, body),
  put:    (path, body) => req('PUT',    path, body),
  delete: (path)       => req('DELETE', path),
};

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (str) => String(str ?? '').replace(/[&<>"']/g, c => ESC_MAP[c]);
```

- [ ] **Step 2: Write `public/js/auth.js`**

```js
import { api } from './api.js';

const loginForm    = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const errorEl      = document.getElementById('error-msg');
const tabs         = document.querySelectorAll('.auth-tab');

async function checkAuth() {
  const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
  if (res.ok) window.location.href = '/loadouts.html';
}

function switchTab(tab) {
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  loginForm.style.display    = tab === 'login'    ? 'flex' : 'none';
  registerForm.style.display = tab === 'register' ? 'flex' : 'none';
  errorEl.textContent = '';
}

tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.textContent = '';
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const res  = await api.post('/auth/login', { username, password });
  const data = await res.json();
  if (!res.ok) { errorEl.textContent = data.error; return; }
  window.location.href = '/loadouts.html';
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.textContent = '';
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  const res  = await api.post('/auth/register', { username, password });
  const data = await res.json();
  if (!res.ok) { errorEl.textContent = data.error; return; }
  window.location.href = '/loadouts.html';
});

switchTab('login');
checkAuth();
```

- [ ] **Step 3: Write `public/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HD2 Loadout Manager</title>
  <link rel="stylesheet" href="/css/main.css">
</head>
<body>
  <div class="auth-wrap">
    <div class="auth-title">SUPER EARTH ARMED FORCES<br>LOADOUT MANAGEMENT SYSTEM</div>
    <div class="auth-tabs">
      <div class="auth-tab" data-tab="login">LOGIN</div>
      <div class="auth-tab" data-tab="register">REGISTER</div>
    </div>
    <form id="login-form" class="auth-form" style="display:none">
      <div>
        <label class="label" for="login-username">USERNAME</label>
        <input type="text" id="login-username" autocomplete="username" required>
      </div>
      <div>
        <label class="label" for="login-password">PASSWORD</label>
        <input type="password" id="login-password" autocomplete="current-password" required>
      </div>
      <button type="submit" class="btn btn-primary">AUTHENTICATE</button>
    </form>
    <form id="register-form" class="auth-form" style="display:none">
      <div>
        <label class="label" for="reg-username">USERNAME</label>
        <input type="text" id="reg-username" autocomplete="username" required minlength="2" maxlength="32">
      </div>
      <div>
        <label class="label" for="reg-password">PASSWORD</label>
        <input type="password" id="reg-password" autocomplete="new-password" required minlength="6">
      </div>
      <button type="submit" class="btn btn-primary">ENLIST</button>
    </form>
    <p id="error-msg" class="error-msg"></p>
  </div>
  <script type="module" src="/js/auth.js"></script>
</body>
</html>
```

- [ ] **Step 4: Verify in browser**

Open `http://localhost:8788`. Register a user, confirm redirect to `/loadouts.html`.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/js/api.js public/js/auth.js
git commit -m "feat: login/register page"
```

---

## Task 12: Loadout List Page

**Files:**
- Create: `public/loadouts.html`
- Create: `public/js/loadouts.js`

- [ ] **Step 1: Write `public/js/loadouts.js`**

Uses `esc()` for all user-supplied content (loadout names, usernames) interpolated into DOM.

```js
import { api, esc } from './api.js';

const listEl     = document.getElementById('loadout-list');
const usernameEl = document.getElementById('nav-username');
const logoutBtn  = document.getElementById('logout-btn');

async function init() {
  const meRes = await api.get('/auth/me');
  if (!meRes) return;
  usernameEl.textContent = (await meRes.json()).username;

  const res  = await api.get('/loadouts');
  const list = await res.json();
  render(list);
}

function render(loadouts) {
  if (!loadouts.length) {
    listEl.textContent = '';
    const p = document.createElement('p');
    p.className = 'empty-state';
    p.textContent = 'NO LOADOUTS ON FILE. DEPLOY A NEW ONE.';
    listEl.appendChild(p);
    return;
  }
  listEl.innerHTML = loadouts.map(l => `
    <div class="loadout-card">
      <div class="loadout-info">
        <div class="loadout-name">${esc(l.name)}</div>
        <div class="loadout-meta">
          <span class="faction-tag ${esc(l.enemy_faction)}">${esc(l.enemy_faction.toUpperCase())}</span>
          ${l.is_public ? '<span class="public-badge">PUBLIC</span>' : ''}
          ${l.is_public ? `<span class="share-link">/s/${esc(l.share_id)}</span>` : ''}
        </div>
      </div>
      <div class="loadout-actions">
        <button class="btn" data-edit="${l.id}">EDIT</button>
        <button class="btn btn-danger" data-delete="${l.id}">DELETE</button>
      </div>
    </div>`).join('');
}

listEl.addEventListener('click', async (e) => {
  const editBtn   = e.target.closest('[data-edit]');
  const deleteBtn = e.target.closest('[data-delete]');
  if (editBtn) {
    window.location.href = `/builder.html?id=${editBtn.dataset.edit}`;
  } else if (deleteBtn) {
    if (!confirm('Delete this loadout?')) return;
    await api.delete(`/loadouts/${deleteBtn.dataset.delete}`);
    init();
  }
});

logoutBtn.addEventListener('click', async () => {
  await api.post('/auth/logout');
  window.location.href = '/';
});

init();
```

- [ ] **Step 2: Write `public/loadouts.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Loadouts — HD2</title>
  <link rel="stylesheet" href="/css/main.css">
</head>
<body>
  <nav class="nav">
    <a href="/loadouts.html" class="nav-brand">HD2 LOADOUT MANAGER</a>
    <div class="nav-user">
      HELLDIVER: <span id="nav-username"></span>
      <a href="#" id="logout-btn">LOGOUT</a>
    </div>
  </nav>
  <div class="container">
    <div class="page-header">
      <div class="page-title">MY LOADOUTS</div>
      <a href="/builder.html" class="btn btn-primary">+ NEW LOADOUT</a>
    </div>
    <div id="loadout-list" class="loadout-grid"></div>
  </div>
  <script type="module" src="/js/loadouts.js"></script>
</body>
</html>
```

- [ ] **Step 3: Verify in browser**

Open `http://localhost:8788/loadouts.html`. Username appears in nav. Empty state message shows until a loadout is created.

- [ ] **Step 4: Commit**

```bash
git add public/loadouts.html public/js/loadouts.js
git commit -m "feat: loadout list page"
```

---

## Task 13: Loadout Builder Page

**Files:**
- Create: `public/builder.html`
- Create: `public/js/builder.js`

- [ ] **Step 1: Write `public/builder.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Loadout Builder — HD2</title>
  <link rel="stylesheet" href="/css/main.css">
</head>
<body>
  <nav class="nav">
    <a href="/loadouts.html" class="nav-brand">HD2 LOADOUT MANAGER</a>
    <div class="nav-user">HELLDIVER: <span id="nav-username"></span></div>
  </nav>
  <div class="container">
    <div class="page-header">
      <div class="page-title" id="page-title">NEW LOADOUT</div>
    </div>
    <div class="builder">
      <div class="builder-row">
        <div class="builder-field grow">
          <label class="label" for="loadout-name">LOADOUT NAME</label>
          <input type="text" id="loadout-name" maxlength="64" placeholder="Enter name...">
        </div>
        <div class="builder-field">
          <span class="label">TARGET ENEMY</span>
          <div class="faction-btns">
            <button class="faction-btn" data-faction="terminids">TERMINIDS</button>
            <button class="faction-btn" data-faction="automatons">AUTOMATONS</button>
            <button class="faction-btn" data-faction="illuminate">ILLUMINATE</button>
          </div>
        </div>
      </div>
      <div>
        <span class="label">STRATAGEMS</span>
        <div class="slots" id="strat-slots">
          <div class="slot" data-slot="0"><span class="slot-empty-icon">+</span><span class="slot-empty-label">SLOT 1</span></div>
          <div class="slot" data-slot="1"><span class="slot-empty-icon">+</span><span class="slot-empty-label">SLOT 2</span></div>
          <div class="slot" data-slot="2"><span class="slot-empty-icon">+</span><span class="slot-empty-label">SLOT 3</span></div>
          <div class="slot" data-slot="3"><span class="slot-empty-icon">+</span><span class="slot-empty-label">SLOT 4</span></div>
        </div>
      </div>
      <div>
        <span class="label">EQUIPMENT</span>
        <div class="gear-grid">
          <div class="gear-field"><label class="label" for="primary">PRIMARY</label><select id="primary"></select></div>
          <div class="gear-field"><label class="label" for="secondary">SECONDARY</label><select id="secondary"></select></div>
          <div class="gear-field"><label class="label" for="grenade">GRENADE</label><select id="grenade"></select></div>
          <div class="gear-field"><label class="label" for="armor">ARMOR</label><select id="armor"></select></div>
          <div class="gear-field"><label class="label" for="booster">BOOSTER</label><select id="booster"></select></div>
        </div>
      </div>
      <div>
        <div class="public-row">
          <input type="checkbox" id="is-public">
          <label for="is-public">MAKE PUBLIC (generates share link)</label>
        </div>
        <div class="share-url-box" id="share-url-box">
          <span class="share-url-text" id="share-url-text"></span>
          <button class="copy-btn" id="copy-btn">[ COPY ]</button>
        </div>
      </div>
      <div class="builder-actions">
        <a href="/loadouts.html" class="btn">DISCARD</a>
        <button class="btn btn-primary" id="save-btn">SAVE LOADOUT</button>
      </div>
    </div>
  </div>

  <div class="modal-overlay" id="modal">
    <div class="modal">
      <div class="modal-title">SELECT STRATAGEM</div>
      <div class="modal-filters">
        <button class="cat-btn active" data-cat="all">ALL</button>
        <button class="cat-btn" data-cat="Orbital">ORBITAL</button>
        <button class="cat-btn" data-cat="Eagle">EAGLE</button>
        <button class="cat-btn" data-cat="Support Weapon">SUPPORT</button>
        <button class="cat-btn" data-cat="Backpack">BACKPACK</button>
        <button class="cat-btn" data-cat="Mission">MISSION</button>
      </div>
      <input type="text" class="modal-search" id="modal-search" placeholder="Search stratagems...">
      <div class="strat-grid" id="strat-grid"></div>
      <div class="modal-close-row"><button class="btn" id="modal-close">CLOSE</button></div>
    </div>
  </div>

  <script type="module" src="/js/builder.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `public/js/builder.js`**

All user-supplied content (loadout name, gear names from DB) is inserted via `textContent` or `esc()` — never raw into `innerHTML`.

```js
import { api, esc } from './api.js';

const state = {
  gameData: { stratagems: [], primary: [], secondary: [], grenades: [], armor: [], boosters: [] },
  slots: [null, null, null, null],
  modalSlot: null,
  modalCat: 'all',
  loadoutId: null,
  shareId: null,
};

const nameInput    = document.getElementById('loadout-name');
const factionBtns  = document.querySelectorAll('.faction-btn');
const slotEls      = document.querySelectorAll('.slot');
const saveBtn      = document.getElementById('save-btn');
const isPublicCb   = document.getElementById('is-public');
const shareBox     = document.getElementById('share-url-box');
const shareUrlText = document.getElementById('share-url-text');
const copyBtn      = document.getElementById('copy-btn');
const modal        = document.getElementById('modal');
const modalSearch  = document.getElementById('modal-search');
const stratGrid    = document.getElementById('strat-grid');
const catBtns      = document.querySelectorAll('.cat-btn');
const usernameEl   = document.getElementById('nav-username');
const pageTitle    = document.getElementById('page-title');

async function init() {
  const meRes = await api.get('/auth/me');
  if (!meRes) return;
  usernameEl.textContent = (await meRes.json()).username;

  const [stratRes, weapRes, grenRes, armorRes, boostRes] = await Promise.all([
    api.get('/game/stratagems'),
    api.get('/game/weapons'),
    api.get('/game/grenades'),
    api.get('/game/armor'),
    api.get('/game/boosters'),
  ]);
  state.gameData.stratagems = await stratRes.json();
  const weapons = await weapRes.json();
  state.gameData.primary   = weapons.primary;
  state.gameData.secondary = weapons.secondary;
  state.gameData.grenades  = await grenRes.json();
  state.gameData.armor     = await armorRes.json();
  state.gameData.boosters  = await boostRes.json();

  populateSelects();

  const params = new URLSearchParams(window.location.search);
  if (params.has('id')) {
    state.loadoutId = Number(params.get('id'));
    pageTitle.textContent = 'EDIT LOADOUT';
    await loadExisting(state.loadoutId);
  }
}

function populateSelects() {
  fillSelect('primary',   state.gameData.primary,   'Select primary weapon');
  fillSelect('secondary', state.gameData.secondary, 'Select secondary weapon');
  fillSelect('grenade',   state.gameData.grenades,  'Select grenade');
  fillSelect('armor',     state.gameData.armor,     'Select armor');
  fillSelect('booster',   state.gameData.boosters,  'Select booster');
}

function fillSelect(id, items, placeholder) {
  const sel = document.getElementById(id);
  sel.innerHTML = `<option value="">-- ${esc(placeholder)} --</option>` +
    items.map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join('');
}

async function loadExisting(id) {
  const res  = await api.get(`/loadouts/${id}`);
  const data = await res.json();
  nameInput.value    = data.name;
  isPublicCb.checked = !!data.is_public;
  state.shareId      = data.share_id;
  setFaction(data.enemy_faction);
  updateShareBox();
  data.stratagems.forEach(s => { state.slots[s.slot - 1] = s; });
  renderSlots();
  if (data.primary_weapon_id)   document.getElementById('primary').value   = data.primary_weapon_id;
  if (data.secondary_weapon_id) document.getElementById('secondary').value = data.secondary_weapon_id;
  if (data.grenade_id)          document.getElementById('grenade').value   = data.grenade_id;
  if (data.armor_id)            document.getElementById('armor').value     = data.armor_id;
  if (data.booster_id)          document.getElementById('booster').value   = data.booster_id;
}

function setFaction(faction) {
  factionBtns.forEach(b => {
    const match = b.dataset.faction === faction;
    b.classList.toggle('active', match);
    b.classList.remove('terminids', 'automatons', 'illuminate');
    if (match) b.classList.add(faction);
  });
}

factionBtns.forEach(b => b.addEventListener('click', () => setFaction(b.dataset.faction)));

function getActiveFaction() {
  return [...factionBtns].find(b => b.classList.contains('active'))?.dataset.faction || null;
}

function renderSlots() {
  slotEls.forEach((el, i) => {
    const s = state.slots[i];
    el.textContent = '';
    el.classList.toggle('filled', !!s);
    if (s) {
      const clearBtn = document.createElement('button');
      clearBtn.className = 'slot-clear';
      clearBtn.textContent = 'x';
      clearBtn.dataset.slot = i;
      el.appendChild(clearBtn);
      if (s.image_url) {
        const img = document.createElement('img');
        img.src = s.image_url;
        img.alt = s.name;
        el.appendChild(img);
      }
      const nameEl = document.createElement('span');
      nameEl.className = 'slot-name';
      nameEl.textContent = s.name;
      el.appendChild(nameEl);
    } else {
      const icon = document.createElement('span');
      icon.className = 'slot-empty-icon';
      icon.textContent = '+';
      el.appendChild(icon);
      const lbl = document.createElement('span');
      lbl.className = 'slot-empty-label';
      lbl.textContent = `SLOT ${i + 1}`;
      el.appendChild(lbl);
    }
  });
}

document.getElementById('strat-slots').addEventListener('click', (e) => {
  const clearBtn = e.target.closest('.slot-clear');
  if (clearBtn) {
    state.slots[Number(clearBtn.dataset.slot)] = null;
    renderSlots();
    return;
  }
  const slot = e.target.closest('.slot');
  if (slot) {
    state.modalSlot = Number(slot.dataset.slot);
    openModal();
  }
});

function openModal() {
  modalSearch.value = '';
  state.modalCat = 'all';
  catBtns.forEach(b => b.classList.toggle('active', b.dataset.cat === 'all'));
  renderStratGrid();
  modal.classList.add('open');
  modalSearch.focus();
}

document.getElementById('modal-close').addEventListener('click', () => modal.classList.remove('open'));
modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });

catBtns.forEach(b => b.addEventListener('click', () => {
  state.modalCat = b.dataset.cat;
  catBtns.forEach(x => x.classList.toggle('active', x === b));
  renderStratGrid();
}));

modalSearch.addEventListener('input', renderStratGrid);

function renderStratGrid() {
  const search  = modalSearch.value.toLowerCase();
  const taken   = new Set(state.slots.filter(Boolean).map(s => s.stratagem_id));
  const visible = state.gameData.stratagems.filter(s => {
    if (taken.has(s.id)) return false;
    if (state.modalCat !== 'all' && s.category !== state.modalCat) return false;
    if (search && !s.name.toLowerCase().includes(search)) return false;
    return true;
  });

  stratGrid.textContent = '';
  if (!visible.length) {
    const p = document.createElement('p');
    p.style.cssText = 'color:var(--muted);font-size:11px;padding:8px;grid-column:1/-1';
    p.textContent = 'No results';
    stratGrid.appendChild(p);
    return;
  }
  visible.forEach(s => {
    const tile = document.createElement('div');
    tile.className = 'strat-tile';
    tile.dataset.id = s.id;
    if (s.image_url) {
      const img = document.createElement('img');
      img.src = s.image_url;
      img.alt = s.name;
      tile.appendChild(img);
    }
    const nameEl = document.createElement('span');
    nameEl.className = 'strat-tile-name';
    nameEl.textContent = s.name;
    tile.appendChild(nameEl);
    stratGrid.appendChild(tile);
  });
}

stratGrid.addEventListener('click', (e) => {
  const tile = e.target.closest('.strat-tile');
  if (!tile) return;
  const id    = Number(tile.dataset.id);
  const strat = state.gameData.stratagems.find(s => s.id === id);
  state.slots[state.modalSlot] = { stratagem_id: strat.id, slot: state.modalSlot + 1, name: strat.name, image_url: strat.image_url };
  renderSlots();
  modal.classList.remove('open');
});

isPublicCb.addEventListener('change', updateShareBox);

function updateShareBox() {
  const show = isPublicCb.checked && state.shareId;
  shareBox.classList.toggle('visible', !!show);
  if (show) shareUrlText.textContent = `${window.location.origin}/s/${state.shareId}`;
}

copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(shareUrlText.textContent);
  copyBtn.textContent = '[ COPIED ]';
  setTimeout(() => { copyBtn.textContent = '[ COPY ]'; }, 2000);
});

saveBtn.addEventListener('click', async () => {
  const name          = nameInput.value.trim();
  const enemy_faction = getActiveFaction();
  if (!name)          { alert('Enter a loadout name.'); return; }
  if (!enemy_faction) { alert('Select a target enemy.'); return; }

  const stratagems = state.slots
    .map((s, i) => s ? { stratagem_id: s.stratagem_id, slot: i + 1 } : null)
    .filter(Boolean);

  const body = {
    name, enemy_faction,
    is_public:           isPublicCb.checked ? 1 : 0,
    stratagems,
    primary_weapon_id:   Number(document.getElementById('primary').value)   || null,
    secondary_weapon_id: Number(document.getElementById('secondary').value) || null,
    grenade_id:          Number(document.getElementById('grenade').value)   || null,
    armor_id:            Number(document.getElementById('armor').value)     || null,
    booster_id:          Number(document.getElementById('booster').value)   || null,
  };

  let res;
  if (state.loadoutId) {
    res = await api.put(`/loadouts/${state.loadoutId}`, body);
  } else {
    res = await api.post('/loadouts', body);
    if (res && res.ok) {
      const data      = await res.json();
      state.loadoutId = data.id;
      state.shareId   = data.share_id;
      pageTitle.textContent = 'EDIT LOADOUT';
      window.history.replaceState(null, '', `/builder.html?id=${state.loadoutId}`);
      updateShareBox();
      return;
    }
  }
  if (res && !res.ok) {
    const err = await res.json();
    alert(err.error || 'Save failed.');
  }
});

init();
```

- [ ] **Step 3: Test the builder end-to-end in browser**

1. Open `http://localhost:8788/builder.html`
2. Enter a name, pick a faction — faction button highlights in faction color
3. Click a stratagem slot — modal opens with images
4. Filter by category, search — live filtering works
5. Click a stratagem — fills the slot, modal closes
6. Click ✕ — clears the slot
7. Fill gear dropdowns, click Save — URL becomes `?id=N`
8. Check Make Public — share URL box appears
9. Reload — all fields re-populate correctly

- [ ] **Step 4: Commit**

```bash
git add public/builder.html public/js/builder.js
git commit -m "feat: loadout builder page"
```

---

## Task 14: Public Share Page

**Files:**
- Create: `public/share.html`
- Create: `public/js/share.js`

- [ ] **Step 1: Write `public/js/share.js`**

Uses `textContent` and DOM methods for all user-supplied fields — no `innerHTML` with dynamic data.

```js
const shareId   = window.location.pathname.split('/').pop();
const container = document.getElementById('share-container');
const notFound  = document.getElementById('not-found');

async function init() {
  const res = await fetch(`/api/share/${shareId}`);
  if (!res.ok) {
    container.style.display = 'none';
    notFound.style.display  = 'block';
    return;
  }
  const d = await res.json();

  document.title = `${d.name} — HD2 Loadout`;
  document.getElementById('loadout-name').textContent  = d.name;
  document.getElementById('loadout-owner').textContent = `by ${d.owner}`;

  const factionEl       = document.getElementById('faction-tag');
  factionEl.textContent = d.enemy_faction.toUpperCase();
  factionEl.className   = `faction-tag ${d.enemy_faction}`;

  renderSlots(d.stratagems);
  renderGear(d);
}

function renderSlots(stratagems) {
  const container = document.getElementById('share-slots');
  container.textContent = '';
  if (!stratagems.length) {
    const p = document.createElement('span');
    p.style.cssText = 'color:var(--muted);font-size:11px';
    p.textContent = 'No stratagems selected';
    container.appendChild(p);
    return;
  }
  stratagems.forEach(s => {
    const div = document.createElement('div');
    div.className = 'share-slot';
    if (s.image_url) {
      const img = document.createElement('img');
      img.src = s.image_url;
      img.alt = s.name;
      div.appendChild(img);
    }
    const nameEl = document.createElement('span');
    nameEl.className = 'share-slot-name';
    nameEl.textContent = s.name;
    div.appendChild(nameEl);
    container.appendChild(div);
  });
}

function renderGear(d) {
  const container = document.getElementById('share-gear');
  container.textContent = '';
  const items = [
    { name: d.primary_weapon_name,   img: d.primary_weapon_image },
    { name: d.secondary_weapon_name, img: d.secondary_weapon_image },
    { name: d.grenade_name,          img: d.grenade_image },
    { name: d.armor_name,            img: d.armor_image },
    { name: d.booster_name,          img: d.booster_image },
  ].filter(g => g.name);

  items.forEach(g => {
    const div = document.createElement('div');
    div.className = 'share-gear-item';
    if (g.img) {
      const img = document.createElement('img');
      img.src = g.img;
      img.alt = g.name;
      div.appendChild(img);
    }
    const nameEl = document.createElement('span');
    nameEl.className = 'share-gear-name';
    nameEl.textContent = g.name;
    div.appendChild(nameEl);
    container.appendChild(div);
  });
}

init();
```

- [ ] **Step 2: Write `public/share.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HD2 Loadout</title>
  <link rel="stylesheet" href="/css/main.css">
</head>
<body>
  <nav class="nav">
    <a href="/" class="nav-brand">HD2 LOADOUT MANAGER</a>
  </nav>
  <div class="container">
    <div id="not-found" style="display:none">
      <p class="empty-state">LOADOUT NOT FOUND OR NOT PUBLIC.</p>
      <div style="text-align:center;margin-top:16px">
        <a href="/" class="btn btn-primary">RETURN TO BASE</a>
      </div>
    </div>
    <div id="share-container">
      <div class="share-header">
        <span class="faction-tag" id="faction-tag"></span>
        <h1 id="loadout-name"></h1>
        <div class="owner" id="loadout-owner"></div>
      </div>
      <div class="share-section">
        <div class="share-section-title">STRATAGEMS</div>
        <div class="share-slots" id="share-slots"></div>
      </div>
      <div class="share-section">
        <div class="share-section-title">EQUIPMENT</div>
        <div class="share-gear" id="share-gear"></div>
      </div>
      <div class="share-cta">
        <p>WANT TO BUILD YOUR OWN?</p>
        <a href="/" class="btn btn-primary">ENLIST NOW</a>
      </div>
    </div>
  </div>
  <script type="module" src="/js/share.js"></script>
</body>
</html>
```

- [ ] **Step 3: Test in browser**

1. Build a loadout, check Make Public, save
2. Copy share URL, open in incognito
3. Faction tag, name, owner, stratagem tiles with images, gear list all render
4. Try `/s/xxxxxxxx` — shows "LOADOUT NOT FOUND"

- [ ] **Step 4: Commit**

```bash
git add public/share.html public/js/share.js
git commit -m "feat: public share page"
```

---

## Task 15: Deploy to Production

- [ ] **Step 1: Apply schema to production D1**

```bash
wrangler d1 execute hd2-loadout-manager --file=migrations/0001_init.sql
wrangler d1 execute hd2-loadout-manager --file=migrations/0002_seed_game_data.sql
```

- [ ] **Step 2: Push to GitHub**

```bash
git push -u origin main
```

- [ ] **Step 3: Connect repo in Cloudflare Pages dashboard**

Pages → Create a project → Connect to Git → `andynumber2/hd2-loadout-manager`

Build settings: Framework preset: None, Build command: (empty), Build output directory: `public`

- [ ] **Step 4: Add bindings in Pages dashboard**

Settings → Functions → D1 bindings: `DB` → `hd2-loadout-manager`
Settings → Functions → R2 bindings: `IMAGES` → `hd2-assets`

- [ ] **Step 5: Smoke-test production**

Visit the Pages URL. Register, create a loadout with all slots filled, verify images load, verify share link works in incognito.
