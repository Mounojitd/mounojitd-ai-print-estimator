// AI discovery — intent classification + adaptive "ask only what's missing" logic (Phase 1 of the AI-first
// front-end). Honest scope: the "AI" here is a deterministic intent classifier + the VALIDATED engine parser
// (reconciled on NK Sir's 341 jobs) + the engine's own "what's missing" signal. A conversational LLM is a
// DROP-IN behind classifyIntent()/friendlyMissing() with the same in/out shape — see AI_DISCOVERY_PLAN.md.

// Phrase → engine product key. First match wins. Grounded in the 28-product catalogue.
export const CATEGORIES = [
  { key: 'card',           label: 'Visiting / Business card', re: /visiting card|business card|calling card|premium card/i },
  { key: 'card',           label: 'Wedding / Invite card',    re: /wedding|invitation|invite|greeting card/i },
  { key: 'insert',         label: 'Letterhead',               re: /letter ?head/i },
  { key: 'catalogue',      label: 'Catalogue',                re: /catalogue|catalog|corporate profile|company profile|product profile/i },
  { key: 'brochure_multi', label: 'Brochure',                 re: /brochure|pamphlet|tri.?fold|leaflet/i },
  { key: 'carton_tuck',    label: 'Packaging box',            re: /packag|carton|\bbox|boxes|mono ?carton/i },
  { key: 'insert',         label: 'Sticker / Label',          re: /sticker|\blabel|decal/i },
  { key: 'calendar_table', label: 'Calendar',                 re: /calendar/i },
  { key: 'booklet',        label: 'Diary / Notebook / Book',  re: /diary|note ?book|\bbook\b|booklet|manual/i },
  { key: 'folder',         label: 'Folder',                   re: /folder/i },
  { key: 'poster',         label: 'Poster',                   re: /poster/i },
  { key: 'bag',            label: 'Paper bag',                re: /paper ?bag|carry ?bag|shopping ?bag|\bbag\b/i },
  { key: 'banner',         label: 'Banner / Flex',            re: /banner|flex|hoarding/i },
  { key: 'standee',        label: 'Standee',                  re: /standee|roll.?up/i },
  { key: 'lanyard',        label: 'Lanyard',                  re: /lanyard/i },
  { key: 'pouch',          label: 'Pouch',                    re: /pouch/i },
  { key: 'annual',         label: 'Annual report',            re: /annual report|annual/i },
  { key: 'magazine',       label: 'Magazine',                 re: /magazine/i },
];

// "I want to print this / something similar" → an upload/design-match path (a Phase-2 seam; flagged here).
const WANTS_UPLOAD = /similar to this|print this|this design|like this|upload|same as/i;

export function classifyIntent(text) {
  const t = String(text || '');
  if (WANTS_UPLOAD.test(t)) return { key: null, label: null, wantsUpload: true };
  for (const c of CATEGORIES) if (c.re.test(t)) return { key: c.key, label: c.label };
  return null; // unknown → custom mode
}

// Turn the engine's unpriceable reason ("Please enter: width, height, GSM.") into friendly missing fields.
const FIELD_LABEL = { width: 'the size (width × height)', height: 'the size (width × height)', gsm: 'the paper weight (GSM)', pages: 'the number of pages', quantity: 'the quantity', qty: 'the quantity' };
export function friendlyMissing(reason) {
  if (!reason) return [];
  const m = /please enter:?\s*(.+?)\.?$/i.exec(String(reason).trim());
  const raw = m ? m[1].split(/,|and/).map((s) => s.trim().toLowerCase()).filter(Boolean) : [];
  const out = [];
  for (const f of raw) { const l = FIELD_LABEL[f] || f; if (!out.includes(l)) out.push(l); }
  return out;
}

// The full set of parameters a custom job may need — used to prompt in custom mode, asking only what's absent.
export const CUSTOM_PARAMS = ['product type', 'finished size', 'quantity', 'pages (if a book/booklet)', 'paper & GSM', 'printing colours & sides', 'lamination / UV / foil', 'binding', 'delivery timeline'];
