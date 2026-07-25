// Download real product photos from a { "<engine_product_key>": "<image url>" } map into PHOTOS_DIR, then
// write data/product_photos.json pointing at the LOCAL served copies (/photos/<key>.<ext>).
//
// Why download instead of linking the URL directly: the showcase then serves the image from our own
// service — no hotlinking to Google Drive (which rate-limits and blocks <img> embedding), no broken
// pictures if a share link changes. Run this once whenever the URL map changes.
//
// Input (arg or data/photo_urls.json): a JSON object mapping engine product key -> a DIRECT image URL, e.g.
//   { "booklet": "https://…/booklet.jpg", "card": "https://drive.google.com/uc?export=view&id=FILEID" }
// Only keys present in templates.json are kept. Failures are reported and left null (never a broken image).
//
// Usage:  node download_photos.mjs [photo_urls.json]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dir, '..', 'data');
const PHOTOS_DIR = process.env.PHOTOS_DIR || resolve(DATA, 'photos');
const OUT = resolve(DATA, 'product_photos.json');
const SRC = process.argv[2] || resolve(DATA, 'photo_urls.json');

const EXT_BY_CT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' };

const keys = new Set(JSON.parse(readFileSync(resolve(DATA, 'templates.json'), 'utf8')).map((t) => t.engine_product_key));
if (!existsSync(SRC)) { console.error(`no URL map at ${SRC}. Create it as { "<product key>": "<image url>" }.`); process.exit(1); }
const urls = JSON.parse(readFileSync(SRC, 'utf8'));
if (!existsSync(PHOTOS_DIR)) mkdirSync(PHOTOS_DIR, { recursive: true });

const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
for (const k of keys) if (!(k in out)) out[k] = null;

let ok = 0, fail = 0, skip = 0;
for (const [key, url] of Object.entries(urls)) {
  if (!keys.has(key)) { console.warn(`skip: '${key}' is not an engine product key`); skip++; continue; }
  if (!url || typeof url !== 'string') { out[key] = null; continue; }
  try {
    const r = await fetch(url, { redirect: 'follow' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const ct = (r.headers.get('content-type') || '').split(';')[0].trim();
    const ext = EXT_BY_CT[ct];
    if (!ext) throw new Error(`not an image (content-type: ${ct || 'unknown'})`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 64) throw new Error('image too small / empty');
    const file = `${key}.${ext}`;
    writeFileSync(resolve(PHOTOS_DIR, file), buf);
    out[key] = `/photos/${file}`;
    ok++; console.log(`✓ ${key} → ${file} (${(buf.length / 1024).toFixed(0)} KB)`);
  } catch (e) { fail++; console.warn(`✗ ${key}: ${e.message}`); }
}
writeFileSync(OUT, JSON.stringify(out, null, 1));
const filled = Object.values(out).filter(Boolean).length;
console.log(`\n${ok} downloaded, ${fail} failed, ${skip} skipped. product_photos.json now has ${filled}/${keys.size} photos.`);
