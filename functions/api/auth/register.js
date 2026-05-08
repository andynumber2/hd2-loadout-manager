import { hashPassword, genSalt, genToken, sessionCookie, json } from '../_helpers.js';

export async function onRequestPost({ request, env }) {
  let username, password;
  try {
    ({ username, password } = await request.json());
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (!username || !password) return json({ error: 'Username and password required' }, 400);
  if (username.length < 2 || username.length > 32) return json({ error: 'Username must be 2-32 characters' }, 400);
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) return json({ error: 'Username may only contain letters, numbers, _ and -' }, 400);
  if (password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);

  const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
  if (existing) return json({ error: 'Username already taken' }, 409);

  const salt = genSalt();
  const hash = await hashPassword(password, salt);
  const { meta } = await env.DB.prepare(
    'INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)'
  ).bind(username, hash, salt).run();

  const token = genToken();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, meta.last_row_id, expires).run();

  return new Response(JSON.stringify({ id: meta.last_row_id, username }), {
    status: 201,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie(token) },
  });
}
