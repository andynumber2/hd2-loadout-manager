# HD2 Loadout Manager — Claude Instructions

## Tech Stack

- Cloudflare Pages (static), Pages Functions for API
- D1 SQLite — binding `DB` in all `functions/api/` files via `context.env.DB`
- R2 bucket `hd2-assets` — binding `IMAGES` via `context.env.IMAGES`
- Vanilla JS ES modules, no bundler, no TypeScript
- Vitest for unit tests (Node environment)

## Commands

```bash
npm test             # run unit tests
npm run test:watch   # watch mode
npm run dev          # wrangler pages dev (persists to ~/.hd2-dev-state)
npm run sync-local   # sync R2 images from production to local state (once per machine)
```

Apply migrations locally (must use same --persist-to as dev):
```bash
wrangler d1 execute hd2-loadout-manager --local --persist-to ~/.hd2-dev-state --file=migrations/0001_init.sql
wrangler d1 execute hd2-loadout-manager --local --persist-to ~/.hd2-dev-state --file=migrations/0002_seed_game_data.sql
```

## Key Conventions

- All `functions/api/` files export `onRequestGet`, `onRequestPost`, etc. — no default export.
- `getUser(context)` in `_helpers.js` reads the `session` cookie and returns the user row or null.
- Auth routes set `HttpOnly; SameSite=Lax; Secure` cookies via the `sessionCookie()` helper.
- Frontend `api.js` redirects to `/` on any 401 response.
- All user-facing HTML content uses `esc()` for attribute interpolation; slot/grid rendering uses DOM methods (`createElement` / `textContent`) — never `innerHTML` with unescaped data.
- Game entities use an `is_active` flag for soft-disable; never hard-delete game data.
- `share_id` is an 8-char base62 string generated with rejection sampling (see `genShareId` in `_helpers.js`).
- `loadout_stratagems` INSERT/DELETE uses `env.DB.batch()` for atomicity.
- Stratagem categories: `Orbital | Eagle | Support Weapon | Backpack | Mission | Defense`

## File Layout

```
functions/api/_helpers.js       shared auth/crypto utilities
functions/api/auth/             register, login, logout, me
functions/api/game/             stratagems, weapons, grenades, armor, boosters
functions/api/loadouts/index.js GET list + POST create
functions/api/loadouts/[id].js  GET + PUT + DELETE single
functions/api/share/[share_id].js public read-only
functions/api/assets/[[path]].js  R2 image proxy
public/js/api.js                fetch wrapper + esc() helper
migrations/                     numbered SQL files, never edit old ones
```

## Testing

Unit tests live in `tests/` and cover `_helpers.js` only (crypto utilities). API endpoints are not unit-tested — test them manually via `wrangler pages dev`. When adding a helper function, add a corresponding test in `tests/helpers.test.js`.
