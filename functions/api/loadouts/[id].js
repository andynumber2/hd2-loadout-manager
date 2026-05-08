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

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const {
    name, enemy_faction, is_public, stratagems = [],
    primary_weapon_id = null, secondary_weapon_id = null,
    grenade_id = null, armor_id = null, booster_id = null,
  } = body;

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
