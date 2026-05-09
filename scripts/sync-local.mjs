#!/usr/bin/env node
/**
 * Downloads images from the production R2 bucket into ~/.hd2-dev-state for local dev.
 * Run once per machine; `npm run dev` reads from the same path.
 *
 * Usage:
 *   npm run sync-local
 *
 * Requires wrangler to be authenticated (`wrangler login`).
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

const BUCKET               = 'hd2-assets';
const WRANGLER             = join(__dirname, '../node_modules/.bin/wrangler');
const PERSIST_DIR          = `${process.env.HOME}/.hd2-dev-state`;
const DOWNLOAD_CONCURRENCY = 10;
const MAX_IMAGE_BYTES      = 50 * 1024 * 1024;

function parseKeys() {
  const sql = readFileSync(join(__dirname, '../migrations/0002_seed_game_data.sql'), 'utf8');
  const keys = new Set();
  for (const line of sql.split('\n')) {
    const match = line.match(/'(\/api\/assets\/[^']+\.png)'/);
    if (match) keys.add(match[1].replace('/api/assets/', ''));
  }
  return [...keys];
}

async function main() {
  const keys = parseKeys();
  console.log(`\nSyncing ${keys.length} images from R2 to ${PERSIST_DIR}\n`);

  const { Miniflare } = require(join(__dirname, '../node_modules/miniflare'));
  const mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok"); } }',
    r2Buckets: { IMAGES: BUCKET },
    r2Persist: `${PERSIST_DIR}/v3/r2`,
  });
  const bucket = await mf.getR2Bucket('IMAGES');

  let ok = 0;
  const failed = [];
  let index = 0;

  async function worker() {
    while (index < keys.length) {
      const i = index++;
      const key = keys[i];
      try {
        const { stdout } = await execFileAsync(
          WRANGLER,
          ['r2', 'object', 'get', `${BUCKET}/${key}`, '--pipe'],
          { encoding: 'buffer', maxBuffer: MAX_IMAGE_BYTES }
        );
        const isSvg = stdout.slice(0, 512).includes(Buffer.from('<svg'));
        await bucket.put(key, new Uint8Array(stdout), {
          httpMetadata: { contentType: isSvg ? 'image/svg+xml' : 'image/png' },
        });
        console.log(`[${String(i + 1).padStart(3)}/${keys.length}] ${key} ... OK`);
        ok++;
      } catch (err) {
        console.log(`[${String(i + 1).padStart(3)}/${keys.length}] ${key} ... ERROR — ${err.stderr?.toString().trim() || err.message}`);
        failed.push(key);
      }
    }
  }

  await Promise.all(Array.from({ length: DOWNLOAD_CONCURRENCY }, worker));
  await mf.dispose();

  console.log(`\n${'─'.repeat(60)}`);
  if (failed.length === 0) {
    console.log(`All ${keys.length} images synced.`);
  } else {
    console.log(`${ok}/${keys.length} synced. ${failed.length} failed — re-run to retry.`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
