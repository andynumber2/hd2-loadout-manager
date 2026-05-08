import { execFileSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BUCKET = 'hd2-assets';

export async function uploadToR2(wikiImageUrl, r2Key) {
  console.log(`  Uploading ${r2Key}...`);
  const res = await fetch(wikiImageUrl);
  if (!res.ok) {
    console.warn(`  SKIP ${wikiImageUrl} — HTTP ${res.status}`);
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const tmp = join(tmpdir(), `hd2-${Date.now()}.png`);
  writeFileSync(tmp, buf);
  try {
    execFileSync('wrangler', [
      'r2', 'object', 'put',
      `${BUCKET}/${r2Key}`,
      `--file=${tmp}`,
      '--content-type=image/png',
    ], { stdio: 'inherit' });
  } finally {
    unlinkSync(tmp);
  }
  return `/api/assets/${r2Key}`;
}
