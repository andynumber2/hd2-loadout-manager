import { json } from '../_helpers.js';

export async function onRequestGet({ env }) {
  const [primary, secondary] = await Promise.all([
    env.DB.prepare('SELECT id, name, type, image_url FROM weapons_primary WHERE is_active = 1 ORDER BY name').all(),
    env.DB.prepare('SELECT id, name, image_url FROM weapons_secondary WHERE is_active = 1 ORDER BY name').all(),
  ]);
  return json({ primary: primary.results, secondary: secondary.results });
}
