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

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const {
    name, enemy_faction, is_public = 0, stratagems = [],
    primary_weapon_id = null, secondary_weapon_id = null,
    grenade_id = null, armor_id = null, booster_id = null,
  } = body;

  if (!name || !enemy_faction) return json({ error: 'name and enemy_faction are required' }, 400);
  if (!['terminids', 'automatons', 'illuminate'].includes(enemy_faction))
    return json({ error: 'enemy_faction must be terminids, automatons, or illuminate' }, 400);
  if (stratagems.length > 4) return json({ error: 'Maximum 4 stratagems per loadout' }, 400);

  for (const s of stratagems) {
    if (!s.stratagem_id || !s.slot || s.slot < 1 || s.slot > 4)
      return json({ error: 'Each stratagem must have stratagem_id and slot (1-4)' }, 400);
  }

  const uniqueIds = new Set(stratagems.map(s => s.stratagem_id));
  if (uniqueIds.size !== stratagems.length)
    return json({ error: 'Duplicate stratagems are not allowed' }, 400);

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

  if (stratagems.length > 0) {
    await env.DB.batch(
      stratagems.map(s => env.DB.prepare(
        'INSERT INTO loadout_stratagems (loadout_id, stratagem_id, slot) VALUES (?, ?, ?)'
      ).bind(meta.last_row_id, s.stratagem_id, s.slot))
    );
  }

  return json({ id: meta.last_row_id, share_id }, 201);
}
