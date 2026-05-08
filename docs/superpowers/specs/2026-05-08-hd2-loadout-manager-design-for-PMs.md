# HD2 Loadout Manager — Product Spec
Date: 2026-05-08

## What We're Building

A web application that lets Helldivers 2 players plan and save their gear loadouts. A loadout is the complete kit a player brings into a mission: four stratagems (special abilities called in during a mission), a primary weapon, secondary weapon, grenade, and armor. Players can save multiple named loadouts and tag each one with the enemy faction it's designed for — Terminids (bugs), Automatons (bots), or Illuminate (squids).

The app has user accounts, so your loadouts are private to you and available from any device.

---

## Why We're Building It

Helldivers 2 has dozens of stratagems and weapons with no in-game loadout-saving system. Players currently plan loadouts in their heads, in Discord messages, or in spreadsheets. This gives them a clean, purpose-built tool for it.

---

## User Flow

1. User visits the site and creates an account (username + password — no email required)
2. After logging in, they see a dashboard listing all their saved loadouts
3. They click "New Loadout" and are taken to the loadout builder
4. In the builder they:
   - Give the loadout a name
   - Select which enemy faction it's for
   - Pick 4 stratagems from a searchable, filterable list
   - Pick a primary weapon, secondary weapon, grenade, and armor from dropdowns
5. They save it — it appears on their dashboard
6. They can return to edit or delete any loadout at any time

---

## Key Design Decisions

**Accounts are username + password only.** No email, no OAuth, no magic links. Keeps registration friction as low as possible.

**Game data lives in the database, not in the code.** Helldivers 2 receives balance patches every 1–3 months that add or change stratagems and weapons. By storing game entities in the database and updating them via migration scripts, we can keep the app current with each patch without touching application code or doing a full redeploy.

**Items removed from the game are soft-disabled, not deleted.** If a stratagem gets removed in a patch, we flag it inactive rather than deleting it, so existing saved loadouts that used it are not broken.

**Visual style mirrors the game's aesthetic.** The UI uses a military operations terminal look: dark navy background, gold and electric blue accents, monospace typography. It should feel like filing a mission brief inside the game universe.

---

## What's Not Included (v1)

- **Sharing loadouts** — loadouts are private to the account that created them. No public links, no browse-other-players view.
- **Import/export** — no JSON export or clipboard sharing for now.
- **Stratagem icons** — stratagems are shown by name only; no game images.
- **Admin UI** — game data updates (new stratagems after a patch) are handled by the engineering team via SQL scripts, not a browser-based admin panel.
- **Mobile optimization** — the app will be functional on mobile but is not designed mobile-first.

---

## Success Criteria

The feature is complete when:

1. A new user can register and log in without assistance
2. A logged-in user can build a full loadout (all 4 stratagem slots + all gear slots filled), name it, tag it with a faction, and save it
3. A user can view, edit, and delete any of their saved loadouts from the dashboard
4. When a game patch adds new stratagems, an engineer can update the database with a script and the new options appear in the builder — no code deployment required
5. The UI matches the Military Ops Terminal visual style described in the engineering spec
