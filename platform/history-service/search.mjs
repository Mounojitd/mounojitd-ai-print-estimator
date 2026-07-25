// History match (B1) — pure-Node lexical search over past job specs. No external calls: deterministic
// TF-IDF cosine + a small curated synonym expansion (so "annual report" reaches Book/Brochure jobs).
// This is the MVP scorer; an embeddings backend (pgvector / API) is a drop-in behind the same buildIndex/
// search seam — swap the vectors, keep the ranking + the anonymised recommendation shaping below.

// Domain synonyms: the words a customer uses -> the words our shop jobs are described with.
const SYNONYMS = {
  'annual': ['book', 'report', 'brochure'], 'report': ['book', 'brochure', 'annual'],
  'magazine': ['book', 'magazine'], 'catalogue': ['catalog', 'book', 'brochure'], 'catalog': ['catalogue', 'book'],
  'booklet': ['book', 'booklet'], 'directory': ['book', 'directory'], 'yearbook': ['book'],
  'flyer': ['leaflet', 'flyer', 'handbill'], 'pamphlet': ['leaflet', 'brochure'], 'handbill': ['leaflet', 'flyer'],
  'invite': ['card', 'invitation'], 'invitation': ['card', 'invite'], 'wedding': ['card', 'invitation'],
  'menu': ['card', 'menu'], 'visiting': ['card'], 'business': ['card'],
  'letterhead': ['letterhead', 'stationery'], 'envelope': ['envelope', 'stationery'],
  'poster': ['poster', 'largeformat', 'flex'], 'banner': ['banner', 'flex', 'largeformat'], 'standee': ['standee', 'largeformat'],
  'box': ['box', 'carton', 'packaging'], 'carton': ['box', 'packaging'], 'packaging': ['box', 'carton', 'packaging'],
  'bag': ['bag', 'paperbag'], 'lanyard': ['lanyard'], 'pouch': ['pouch'], 'sticker': ['sticker', 'label'], 'label': ['label', 'sticker'],
  'calendar': ['calendar'], 'diary': ['diary', 'book'], 'tag': ['tag'], 'certificate': ['certificate', 'card'],
  'school': [], 'college': [], 'company': [], 'corporate': [],
};
const STOP = new Set('a an the of for and or to in on with is are our we i you my your me it this that job print printing need want make get some'.split(' '));

const tokenize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t));

function expand(tokens) {
  const out = [];
  for (const t of tokens) { out.push(t); if (SYNONYMS[t]) out.push(...SYNONYMS[t]); }
  return out;
}

// Build a TF-IDF index over the docs' search text (doc._text) + product type.
export function buildIndex(docs) {
  const N = docs.length;
  const df = new Map();
  const tfs = docs.map((d) => {
    const toks = tokenize(d._text + ' ' + (d.productType || '') + ' ' + (d.productType || ''));  // product type weighted x2
    const tf = new Map();
    for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    return tf;
  });
  const idf = new Map();
  for (const [t, c] of df) idf.set(t, Math.log(1 + N / c));
  // precompute weighted vectors + norms
  const vecs = tfs.map((tf) => {
    const v = new Map(); let norm = 0;
    for (const [t, c] of tf) { const w = c * (idf.get(t) || 0); v.set(t, w); norm += w * w; }
    return { v, norm: Math.sqrt(norm) || 1 };
  });
  return { docs, idf, vecs, N };
}

// Search returns ranked, ANONYMISED matches. Each match carries only the spec + a ready-to-quote brief —
// never the historical amount, client identity, or raw text.
export function search(index, query, { limit = 5, minScore = 0.04 } = {}) {
  const qToks = expand(tokenize(query));
  const qtf = new Map();
  for (const t of qToks) qtf.set(t, (qtf.get(t) || 0) + 1);
  const qv = new Map(); let qnorm = 0;
  for (const [t, c] of qtf) { const w = c * (index.idf.get(t) || 0); if (w > 0) { qv.set(t, w); qnorm += w * w; } }
  qnorm = Math.sqrt(qnorm) || 1;

  const scored = [];
  for (let i = 0; i < index.docs.length; i++) {
    const { v, norm } = index.vecs[i];
    let dot = 0;
    // iterate the smaller map
    const [small, big] = qv.size < v.size ? [qv, v] : [v, qv];
    for (const [t, w] of small) { const w2 = big.get(t); if (w2) dot += w * w2; }
    const score = dot / (qnorm * norm);
    if (score >= minScore) scored.push({ i, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ i, score }) => shape(index.docs[i], score));
}

// Defence-in-depth: even though amounts are dropped at ingest, a spec free-text field can still carry an
// embedded price (e.g. "...and application Rs. 6000"). Scrub any currency mention from anything we surface.
export function scrubMoney(s) {
  if (s == null) return s;
  return String(s)
    .replace(/(?:₹|rs\.?|inr)\s*[\d,]+(?:\.\d+)?\s*\/?-?/gi, ' ')
    .replace(/\b[\d,]+\s*(?:\/-|rupees?|rs\.?)\b/gi, ' ')
    .replace(/\s{2,}/g, ' ').replace(/^[\s,]+|[\s,]+$/g, '').trim() || null;
}

// The ONLY fields that leave the server: spec + a suggested brief the customer can price live via /intake.
function shape(doc, score) {
  const s = doc.spec || {};
  return {
    score: +score.toFixed(3),
    productType: doc.productType || null,
    spec: {
      size: scrubMoney(s.size), extent: scrubMoney(s.extent), paper: scrubMoney(s.paper),
      printing: scrubMoney(s.printing), coating: scrubMoney(s.coating), binding: scrubMoney(s.binding),
      typicalQuantity: s.quantity || null,
    },
    suggestedBrief: buildBrief(doc.productType, s),
  };
}

// Compose a plain-language brief from spec fields only (no names, no amounts) — feedable straight to /intake.
export function buildBrief(product, s = {}) {
  const parts = [];
  if (product) parts.push(product.toLowerCase());
  if (s.size) parts.push(scrubMoney(String(s.size).replace(/["”]/g, ' inch').replace(/\s+/g, ' ').trim()));
  if (s.extent) parts.push(scrubMoney(s.extent));
  if (s.paper) parts.push(scrubMoney(s.paper));
  if (s.printing) parts.push(scrubMoney(s.printing));
  if (s.coating) parts.push(scrubMoney(s.coating));
  if (s.binding) parts.push(scrubMoney(s.binding));
  if (s.quantity) parts.push('quantity ' + s.quantity);
  return parts.filter(Boolean).join(', ');
}

// Distinct product types + counts, for a "browse what we've made" view. No confidential data.
export function productSummary(docs) {
  const m = new Map();
  for (const d of docs) { const p = d.productType || 'Other'; m.set(p, (m.get(p) || 0) + 1); }
  return [...m.entries()].map(([productType, count]) => ({ productType, count })).sort((a, b) => b.count - a.count);
}
