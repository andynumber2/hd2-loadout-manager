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
