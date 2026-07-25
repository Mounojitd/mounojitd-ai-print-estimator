// Shared static-photo serving for the platform. Product photos live as files under PHOTOS_DIR (default
// platform/api/data/photos), one per engine product key (e.g. booklet.jpg). product_photos.json points at
// them as `/photos/<file>`. This keeps the photo BYTES out of the JSON (and out of git — see .gitignore),
// while any service can serve them with a single route. A hosted/Drive URL also works — then this is unused.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename, extname } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
export const PHOTOS_DIR = process.env.PHOTOS_DIR || resolve(__dir, 'data', 'photos');

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' };

// Serve PHOTOS_DIR/<file> safely (basename only — no path traversal). Returns true if handled.
export function servePhoto(res, file) {
  const name = basename(String(file || ''));                 // strip any ../ etc.
  const ext = extname(name).toLowerCase();
  const path = resolve(PHOTOS_DIR, name);
  if (!MIME[ext] || !path.startsWith(PHOTOS_DIR) || !existsSync(path)) { res.writeHead(404); res.end('not found'); return true; }
  const buf = readFileSync(path);
  res.writeHead(200, { 'content-type': MIME[ext], 'cache-control': 'public, max-age=3600', 'content-length': buf.length });
  res.end(buf);
  return true;
}
