#!/usr/bin/env node
/**
 * Downloads stratagem/weapon/gear images from helldivers.wiki.gg and uploads
 * them to the hd2-assets R2 bucket.
 *
 * Usage:
 *   node scripts/upload-images.mjs
 *
 * Requires wrangler to be authenticated (`wrangler login`).
 */

import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BUCKET    = 'hd2-assets';
const WRANGLER  = join(__dirname, '../node_modules/.bin/wrangler');
const WIKI_API  = 'https://helldivers.wiki.gg/api.php';
const DELAY_MS  = 400; // polite delay between wiki API calls

// ---------------------------------------------------------------------------
// Parse items from seed SQL
// ---------------------------------------------------------------------------

function parseItems() {
  const sql = readFileSync(join(__dirname, '../migrations/0002_seed_game_data.sql'), 'utf8');
  const items = [];
  for (const line of sql.split('\n')) {
    if (!line.includes('/api/assets/')) continue;
    const nameMatch = line.match(/\('((?:[^']|'')+)'/);
    const imgMatch  = line.match(/'(\/api\/assets\/[^']+\.png)'/);
    if (nameMatch && imgMatch) {
      items.push({
        name:  nameMatch[1].replace(/''/g, "'"),
        r2Key: imgMatch[1].replace('/api/assets/', ''),
      });
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// Wiki API helpers
// ---------------------------------------------------------------------------

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function wikiRequest(params) {
  const url = new URL(WIKI_API);
  for (const [k, v] of Object.entries({ ...params, format: 'json', origin: '*' })) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'hd2-loadout-manager-importer/1.0 (github.com/hd2-loadout-manager)' },
  });
  if (!res.ok) throw new Error(`Wiki API HTTP ${res.status}`);
  return res.json();
}

async function getFileUrl(fileTitle) {
  const data = await wikiRequest({
    action: 'query',
    titles: fileTitle,
    prop:   'imageinfo',
    iiprop: 'url',
  });
  const pages = data.query?.pages;
  if (!pages) return null;
  const page = pages[Object.keys(pages)[0]];
  return page?.imageinfo?.[0]?.url ?? null;
}

async function findImageUrl(itemName) {
  // Strategy 1: use PageImages extension — returns the "lead" image for a page
  {
    const data = await wikiRequest({
      action: 'query',
      titles: itemName,
      prop:   'pageimages',
      piprop: 'original',
    });
    const pages = data.query?.pages;
    if (pages) {
      const page = pages[Object.keys(pages)[0]];
      if (page?.original?.source) return page.original.source;
    }
  }

  await sleep(DELAY_MS);

  // Strategy 2: list images referenced on the item's wiki page, prefer icon
  {
    const data = await wikiRequest({
      action: 'query',
      titles: itemName,
      prop:   'images',
    });
    const pages = data.query?.pages;
    if (pages) {
      const page = pages[Object.keys(pages)[0]];
      const images = page?.images ?? [];
      if (images.length) {
        const pick =
          images.find(i => /icon/i.test(i.title)) ||
          images.find(i => /\.png$/i.test(i.title)) ||
          images[0];
        await sleep(DELAY_MS);
        const url = await getFileUrl(pick.title);
        if (url) return url;
      }
    }
  }

  await sleep(DELAY_MS);

  // Strategy 3: search the File namespace for files matching the item name
  {
    const data = await wikiRequest({
      action:    'query',
      list:      'allimages',
      aisearch:  itemName,
      ailimit:   '5',
      aiprop:    'url',
    });
    const files = data.query?.allimages ?? [];
    if (files.length) {
      const pick =
        files.find(f => /icon/i.test(f.name)) ||
        files[0];
      return pick.url;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// R2 upload
// ---------------------------------------------------------------------------

async function uploadToR2(imageUrl, r2Key) {
  const res = await fetch(imageUrl, {
    headers: { 'User-Agent': 'hd2-loadout-manager-importer/1.0' },
  });
  if (!res.ok) throw new Error(`Download failed HTTP ${res.status}: ${imageUrl}`);

  const contentType = res.headers.get('content-type') || 'image/png';
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = contentType.includes('webp') ? 'webp' : contentType.includes('jpeg') ? 'jpg' : 'png';
  const tmp = join(tmpdir(), `hd2-upload-${Date.now()}.${ext}`);
  writeFileSync(tmp, buf);

  try {
    execFileSync(WRANGLER, [
      'r2', 'object', 'put',
      `${BUCKET}/${r2Key}`,
      `--file=${tmp}`,
      `--content-type=${contentType}`,
    ], { stdio: 'pipe' });
  } finally {
    unlinkSync(tmp);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const items = parseItems();
  console.log(`\nUploading ${items.length} images to R2 bucket "${BUCKET}"\n`);

  const failed = [];

  for (let i = 0; i < items.length; i++) {
    const { name, r2Key } = items[i];
    process.stdout.write(`[${String(i + 1).padStart(3)}/${items.length}] ${name} ... `);

    try {
      await sleep(DELAY_MS);
      const imageUrl = await findImageUrl(name);

      if (!imageUrl) {
        console.log('SKIP  — not found on wiki');
        failed.push({ name, r2Key, reason: 'not found on wiki' });
        continue;
      }

      await uploadToR2(imageUrl, r2Key);
      console.log('OK');
    } catch (err) {
      console.log(`ERROR — ${err.message}`);
      failed.push({ name, r2Key, reason: err.message });
    }
  }

  const bar = '─'.repeat(60);
  console.log(`\n${bar}`);

  if (failed.length === 0) {
    console.log(`All ${items.length} images uploaded successfully.`);
  } else {
    console.log(`${items.length - failed.length}/${items.length} succeeded. ${failed.length} failed:\n`);
    for (const { name, reason } of failed) {
      console.log(`  • ${name}  (${reason})`);
    }
    console.log('\nFix the failures above, then re-run: node scripts/upload-images.mjs');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
