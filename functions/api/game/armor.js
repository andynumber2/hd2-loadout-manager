import { json } from '../_helpers.js';

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, armor_class, passive, image_url FROM armor WHERE is_active = 1 ORDER BY armor_class, name'
  ).all();
  return json(results);
}
