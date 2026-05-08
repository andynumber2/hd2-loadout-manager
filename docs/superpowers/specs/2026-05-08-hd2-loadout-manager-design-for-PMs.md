# HD2 Loadout Manager — Product Spec
Date: 2026-05-08

## What We're Building

A web application that lets Helldivers 2 players plan and save their gear loadouts. A loadout is the complete kit a player brings into a mission: four stratagems (special abilities called in during a mission), a primary weapon, secondary weapon, grenade, armor, and a booster (a team-wide passive buff, one per player). Players can save multiple named loadouts and tag each one with the enemy faction it's designed for — Terminids (bugs), Automatons (bots), or Illuminate (squids).

Players can mark any loadout as public and share it via a short link. Anyone with the link can view the loadout without an account.

The app has user accounts, so your private loadouts are yours alone and available from any device.

---

## Why We're Building It

Helldivers 2 has dozens of stratagems and weapons with no in-game loadout-saving system. Players currently plan loadouts in their heads, in Discord messages, or in spreadsheets. This gives them a clean, purpose-built tool for it — and a way to share builds with squadmates.

---

## User Flow

1. User visits the site and creates an account (username + password — no email required)
2. After logging in, they see a dashboard listing all their saved loadouts
3. They click "New Loadout" and are taken to the loadout builder
4. In the builder they:
   - Give the loadout a name
   - Select which enemy faction it's for
   - Pick 4 stratagems from a searchable, filterable list (shown with images from the game wiki)
   - Pick a primary weapon, secondary weapon, grenade, and armor from dropdowns
   - Optionally check "Make Public" to get a shareable link
5. They save it — it appears on their dashboard
6. They can return to edit or delete any loadout at any time
7. If they shared a public loadout, anyone with the link can view it in a read-only layout

---

## Sharing

Each loadout gets a permanent short URL at creation time (e.g., `hd2loadouts.com/s/xK7mNp2q`). The URL is always generated but only works publicly when the owner has checked "Make Public." If the owner makes a loadout private again, the link stops working. The URL never changes, so sharing it is safe even before making it public.

---

## Key Design Decisions

**Accounts are username + password only.** No email, no OAuth, no magic links. Keeps registration friction as low as possible.

**Game data lives in the database, not in the code.** Helldivers 2 receives balance patches every 1–3 months that add or change stratagems and weapons. By storing game entities in the database and updating them via migration scripts (a task handled by the maintainer after each patch), we can keep the app current without a full redeploy.

**Items removed from the game are soft-disabled, not deleted.** If a stratagem gets removed in a patch, we flag it inactive rather than deleting it, so existing saved loadouts that used it are not broken.

**Images are downloaded from the game wiki and self-hosted.** Stratagem and gear images are pulled from helldivers.wiki.gg and stored in a Cloudflare R2 bucket we control. This avoids any dependency on the wiki's image hosting remaining stable. Image URLs in the database point to our R2 bucket. After each patch, the maintainer downloads new images to R2 alongside the game data update.

**Visual style mirrors the game's aesthetic.** The UI uses a military operations terminal look: dark navy background, gold and electric blue accents, monospace typography. It should feel like filing a mission brief inside the game universe.

---

## What's Not Included (v1)

- **Loadout discovery feed** — there is no way to browse other players' public loadouts. Sharing requires sending the link directly.
- **Import/export** — no JSON export or clipboard sharing for now.
- **Mobile optimization** — the app will be functional on mobile but is not designed mobile-first.
- **Automated patch sync** — game data updates after patches are applied manually by the maintainer.

---

## Success Criteria

The feature is complete when:

1. A new user can register and log in without assistance
2. A logged-in user can build a full loadout (all 4 stratagem slots + all gear slots filled), name it, tag it with a faction, and save it
3. Stratagem images (from the game wiki) are displayed in the stratagem picker and on saved loadouts
4. A user can mark a loadout public and get a short shareable URL
5. Anyone with a share link can view the loadout without logging in
6. A user can view, edit, and delete any of their saved loadouts from the dashboard
7. When a game patch adds new stratagems, the maintainer can update the database with a migration script and the new options appear in the builder — no code deployment required
8. The UI matches the Military Ops Terminal visual style described in the engineering spec
