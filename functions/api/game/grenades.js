import { json } from '../_helpers.js';

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, image_url FROM grenades WHERE is_active = 1 ORDER BY name'
  ).all();
  return json(results);
}
