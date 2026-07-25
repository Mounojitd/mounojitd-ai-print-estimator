// Build data/product_photos.json from real product photos.
//
// Two ways to supply photos (pick whichever is easiest to produce from NK Sir's photo sheet):
//
//  A) LOCAL FILES  — drop one image per product key into PHOTOS_DIR (default ../data/photos), named by the
//     engine product key: booklet.jpg, carton_tuck.jpg, card.png, ...  Then run this with no args. Each key
//     that has a file gets url "/photos/<file>" (served by the quote/history services); the rest stay null.
//
//  B) URL MAP      — pass a JSON file of { "<key>": "https://…" } (Drive/hosted image URLs). Those win over
//     local files. Useful if the photos live in a Drive folder shared as links, or an IMAGE()-URL column.
//
// The engine product keys are the source of truth (from data/templates.json). Unknown keys are ignored;
// missing photos are left null so the showcase falls back to text — never a broken image.
//
// Usage:  node build_product_photos.mjs [urls.json]
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname, basename } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dir, '..', 'data');
const PHOTOS_DIR = process.env.PHOTOS_DIR || resolve(DATA, 'photos');
const OUT = resolve(DATA, 'product_photos.json');
const IMG = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg']);

const keys = JSON.parse(readFileSync(resolve(DATA, 'templates.json'), 'utf8')).map((t) => t.engine_product_key);
const urls = process.argv[2] && existsSync(process.argv[2]) ? JSON.parse(readFileSync(process.argv[2], 'utf8')) : {};

// index local files by their basename-without-extension (the product key)
const files = existsSync(PHOTOS_DIR) ? readdirSync(PHOTOS_DIR).filter((f) => IMG.has(extname(f).toLowerCase())) : [];
const byKey = {};
for (const f of files) byKey[basename(f, extname(f))] = f;

const out = {};
let filled = 0;
for (const k of keys) {
  if (urls[k]) { out[k] = urls[k]; filled++; }
  else if (byKey[k]) { out[k] = `/photos/${byKey[k]}`; filled++; }
  else out[k] = null;
}
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`product_photos.json: ${filled}/${keys.length} product types have a photo${files.length ? ` (from ${PHOTOS_DIR})` : ''}.`);
const missing = keys.filter((k) => !out[k]);
if (missing.length) console.log(`still missing (${missing.length}): ${missing.join(', ')}`);
