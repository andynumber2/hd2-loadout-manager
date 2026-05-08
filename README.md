# HD2 Loadout Manager

A web app for Helldivers 2 players to plan, save, and share gear loadouts. Built on Cloudflare Pages with D1 (SQLite) and R2.

## Stack

- **Frontend**: Vanilla JS/HTML/CSS, no framework, no build step
- **Backend**: Cloudflare Pages Functions (`functions/api/`)
- **Database**: Cloudflare D1 — binding `DB`
- **Images**: Cloudflare R2 (`hd2-assets`) — binding `IMAGES`

## Local Development

```bash
npm install
npm run dev       # wrangler pages dev
npm test          # vitest run
npm run test:watch
```

`wrangler pages dev` uses the local D1 database. Apply migrations first:

```bash
wrangler d1 execute hd2-loadout-manager --local --file=migrations/0001_init.sql
wrangler d1 execute hd2-loadout-manager --local --file=migrations/0002_seed_game_data.sql
```

## Deploy

1. Push to GitHub
2. Connect the repo in the Cloudflare Pages dashboard (build output dir: `public`, no build command)
3. In Pages Settings → Functions, add bindings:
   - D1: `DB` → `hd2-loadout-manager`
   - R2: `IMAGES` → `hd2-assets`
4. Apply migrations to production D1:

```bash
wrangler d1 execute hd2-loadout-manager --file=migrations/0001_init.sql
wrangler d1 execute hd2-loadout-manager --file=migrations/0002_seed_game_data.sql
```

5. Enable R2 in your Cloudflare account, create the `hd2-assets` bucket, and upload game images using `scripts/upload-images.mjs`.

## Game Data Updates

After a Helldivers 2 patch:

1. Review [helldivers.wiki.gg](https://helldivers.wiki.gg) for additions/changes/removals
2. Upload any new images to the `hd2-assets` R2 bucket using `scripts/upload-images.mjs`
3. Write a new migration file (`migrations/000N_patch_<date>.sql`) with `INSERT`, `UPDATE`, and/or `SET is_active = 0` statements
4. Apply: `wrangler d1 execute hd2-loadout-manager --file=migrations/000N_patch_<date>.sql`

No code deployment needed for content updates.

## Project Structure

```
public/           Static frontend (HTML/CSS/JS)
functions/api/    Cloudflare Pages Functions (one file per endpoint)
migrations/       D1 SQL migrations
scripts/          Maintenance scripts (image upload)
tests/            Vitest unit tests
```
