import { getUser, json } from '../_helpers.js';

export async function onRequestGet({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  return json({ id: user.id, username: user.username, is_admin: user.is_admin });
}
