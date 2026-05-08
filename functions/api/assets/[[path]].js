export async function onRequestGet({ params, env }) {
  const key = params.path.join('/');
  const obj = await env.IMAGES.get(key);
  if (!obj) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  headers.set('Content-Type', obj.httpMetadata?.contentType || 'image/png');
  headers.set('Cache-Control', 'public, max-age=86400');
  return new Response(obj.body, { headers });
}
