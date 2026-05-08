import { hashPassword, genToken, sessionCookie, json } from '../_helpers.js';

export async function onRequestPost({ request, env }) {
  const { username, password } = await request.json();
  if (!username || !password) return json({ error: 'Username and password required' }, 400);

  const user = await env.DB.prepare(
    'SELECT id, username, password_hash, salt FROM users WHERE username = ?'
  ).bind(username).first();
  if (!user) return json({ error: 'Invalid credentials' }, 401);

  const hash = await hashPassword(password, user.salt);
  if (hash !== user.password_hash) return json({ error: 'Invalid credentials' }, 401);

  const token = genToken();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, user.id, expires).run();

  return new Response(JSON.stringify({ id: user.id, username: user.username }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie(token) },
  });
}
