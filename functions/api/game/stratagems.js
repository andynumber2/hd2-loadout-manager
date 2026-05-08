import { json } from '../_helpers.js';

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, category, call_in_sequence, image_url FROM stratagems WHERE is_active = 1 ORDER BY category, name'
  ).all();
  return json(results);
}
