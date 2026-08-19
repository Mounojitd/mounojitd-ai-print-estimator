// Andreal AI Quoter — secure backend for the conversational quoting assistant.
// "AI guides, math decides": Claude handles the natural-language conversation; the VALIDATED pricing engine
// (index.html, driven client-side in the browser) does every number. This server is a thin, stateless proxy
// that (a) serves the static pages and (b) forwards chat turns to the Anthropic API with the key kept
// server-side (an HF Space secret). The system prompt + the `quote` tool are defined HERE so the browser
// can't tamper with them.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PORT  = Number(process.env.PORT || 7860);
const MODEL = process.env.MODEL || 'claude-sonnet-5';   // override via Space variable MODEL if needed
const KEY   = process.env.ANTHROPIC_API_KEY || '';       // set as a Space SECRET
const MAX_TOKENS = Number(process.env.MAX_TOKENS || 1024);

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.ico':'image/x-icon' };

const SYSTEM = `You are the Andreal print-shop quoting assistant, built for NK Sir (Nand Kishor Kanoi) of Andreal, Kolkata.
You quote print jobs by CONVERSATION — like a smart estimator sitting across the desk. NEVER dump a form.

How you work:
- Understand the job in plain language (the client may give everything at once, or a little at a time).
- Ask ONLY for the specs you still need to price it — one or two short questions at a time, warm and to the point. Use Indian print terms (GSM, art paper, montblanc, saddle/perfect/section-sewn binding, lamination, etc.).
- If the client already gave a spec, don't ask again.
- When you have enough, briefly confirm the job in one line, then call the \`quote\` tool. The tool prices it from the LIVE vendor rates in NK Sir's master sheet — you never guess numbers yourself.
- After the tool returns, present: the GRAND TOTAL, the per-piece price, and a short plain-language cost breakdown. Then offer to adjust anything (qty, paper, binding, gold, etc.).

What you can quote right now (map to the tool's "product" — pick the closest):
BOUND / SIGNATURE (need pages + binding + cover):
- booklet         → book, booklet, notebook, diary, membership directory
- catalogue       → catalogue, prospectus, admission kit
- magazine        → magazine
- annual          → annual report
- brochure_multi  → brochure (multi-page / multi-fold)
FLAT SHEET (no pages/binding):
- card            → visiting card, ID card, business card, certificate, menu card, greeting/invite, ticket, warranty card
- insert          → letterhead, form, sticker, label, loose insert
- leaflet         → leaflet, flyer, single/folded sheet
- dangler         → dangler, tent card, shelf-talker
- pasted_tag      → hang tag, pasted tag (two sheets pasted back-to-back)
- poster          → poster, floor plan, large flat sheet
DIELINE / CONVERTING (flat blank → die-cut → fold/glue; give finished size + board GSM, and depth for boxes):
- envelope        → envelope
- folder          → presentation folder / folder with pocket
- sleeve          → sleeve / wrap
- carton_tuck     → mono carton, tuck-end box
- carton_seal     → mono carton, seal-end (glued-bottom) box
RIGID SET-UP BOX (per-piece, hand-assembled greyboard box — give L×W×H + style + qty):
- rigidbox        → rigid box, gift box, set-up box, magnetic box, shoulder/neck box, drawer/slider box
CALENDARS (leaves priced via the paper fields; give W×H of a leaf + gsm + colours + extent = number of leaves):
- calendar_table  → table / desk calendar (wire-o + tent stand)
- calendar_sheet  → wall calendar (wire-o from top + hanger + backboard)
PER-PIECE / LARGE-FORMAT (priced per piece; most rates default, editable in the estimator):
- bag             → printed paper carry bag — give finished W×H (inches), board gsm, depth (gusset), copies
- pouch           → fabric/board pouch — give copies (material defaults to velvet + foil)
- lanyard         → printed neck strap — give copies (optional width_mm 10/15/20/25, and cf/cb for print sides)
- ncr             → NCR / carbonless form — give copies (sets), parts (2/3/4), paper_size (a6/a5/half/a4)
- banner          → flex / vinyl banner (large format, per sq.ft) — give W×H + unit (ft or in) + copies
- standee         → roll-up standee (large format) — give W×H + unit + copies (roller stand auto-added)

Specs the tool needs:
- Always: product, copies (quantity).
- Size: W and H in inches (closed/finished size for bound jobs). If the client says "A4" use 8.27 x 11.69; A5 5.83 x 8.27; standard visiting card 3.5 x 2.
- Paper: gsm (inside). For bound jobs also coverGsm (0 if self-cover).
- Colours: cf and cb (front/back), e.g. "4 colour both sides" = cf 4, cb 4; "single side 4 colour" = cf 4, cb 0.
- Bound jobs (booklet/catalogue/magazine/annual/brochure_multi): pages (inside page count) and binding (saddle = centre stitch, perfect, sewn_perfect = section sewn, wireo).
- Optional finishing: coverLam (matt/gloss/velvet/none) and gold (screen_gold/screen_silver, with sides 1 for cover-only or 2 for cover+back).
- Pick the bound type by what the client calls it — a "catalogue"/"brochure"/"annual report" is design-heavy (higher standard margin) vs a plain "book/booklet".
- Dieline jobs (envelope/folder/sleeve/carton_tuck/carton_seal): W and H are the FINISHED (assembled) size in inches; gsm is the board (usually 250-350). For a box/carton also give depth (inches). The engine computes the flat blank and adds standard die + cutting + gluing charges (editable in the full estimator). Cartons usually print one side (cf 4, cb 0).
- Rigid box (rigidbox): a hand-assembled greyboard box. Give the internal size as W = length, H = width, depth = box height (all inches), copies = quantity, and style (topbottom / traylid / shoulder / slider / magnetic). Board, wrap-print, lining, lid depth and box-making labour use standard editable defaults; gsm/pages/binding don't apply. If they mention foil or a partition/insert, note it's an editable add-on in the full estimator.
- Calendars: W and H are one LEAF's size (inches), gsm is the leaf paper, extent = number of leaves (e.g. 12), copies = quantity. calendar_table (desk): defaults to full wire-o + tent stand — set wiro (none/part/full) and stand (none/tent) if the client specifies otherwise. calendar_sheet (wall): wire-o + hanger + backboard + pack are included by default. Jacket/pouch and all finishing rates are editable in the full estimator.
- bag: finished W×H in inches, gsm = board (usually 250-350), depth = side gusset in inches, copies = quantity. Bag-making (eyelets/rope/paste) uses standard editable defaults.
- pouch: give copies; material defaults to velvet with foil decoration (editable). lanyard: give copies; width_mm (default 20) and cf/cb (print sides) optional; strap/hardware default. ncr: copies = number of sets, parts = plies (2/3/4), paper_size = a6/a5/half/a4; numbering/perf/padding default on.
- banner/standee (large format): W×H is the finished size — set unit to "ft" for feet or "in" for inches — and copies = pieces. Media defaults (vinyl for banner) and per-sq-ft rate are editable; a standee auto-includes the roller stand. No paper/plates.

If a request is genuinely outside all of the above, say honestly it's not wired in yet and offer the full estimator page. Keep replies short. Be helpful and confident.`;

const TOOLS = [{
  name: 'quote',
  description: 'Price a print job using the validated Andreal engine and the LIVE vendor rates. Call only once you have the required specs; the app runs the real engine and returns the itemised quote.',
  input_schema: {
    type: 'object',
    properties: {
      product:  { type: 'string', enum: ['booklet','catalogue','magazine','annual','brochure_multi','card','insert','leaflet','dangler','pasted_tag','poster','envelope','folder','sleeve','carton_tuck','carton_seal','rigidbox','calendar_table','calendar_sheet','bag','pouch','lanyard','ncr','banner','standee'], description: 'engine product family — bound; flat; dieline; rigidbox; calendars; per-piece: bag/pouch/lanyard/ncr; large-format: banner/standee' },
      W:        { type: 'number', description: 'width in inches (finished/closed)' },
      H:        { type: 'number', description: 'height in inches (finished/closed)' },
      pages:    { type: 'number', description: 'inside page count (booklet only)' },
      copies:   { type: 'number', description: 'quantity' },
      gsm:      { type: 'number', description: 'inside paper GSM' },
      coverGsm: { type: 'number', description: 'cover GSM (booklet; 0 if self-cover)' },
      cf:       { type: 'number', description: 'front colours (e.g. 4)' },
      cb:       { type: 'number', description: 'back colours (e.g. 4, or 0)' },
      binding:  { type: 'string', enum: ['saddle','perfect','sewn_perfect','wireo','none'], description: 'booklet binding' },
      coverLam: { type: 'string', enum: ['matt','gloss','velvet','none'] },
      gold:     { type: 'string', enum: ['none','screen_gold','screen_silver'] },
      sides:    { type: 'number', description: 'gold screen sides: 1 cover-only, 2 cover+back' },
      depth:    { type: 'number', description: 'box depth/height in inches — dieline carton depth, or rigid-box height' },
      style:    { type: 'string', enum: ['topbottom','traylid','shoulder','slider','magnetic'], description: 'rigidbox only — box style' },
      extent:   { type: 'number', description: 'calendars only — number of leaves (e.g. 12)' },
      wiro:     { type: 'string', enum: ['none','part','full'], description: 'calendar_table only — wire-o binding (default full)' },
      stand:    { type: 'string', enum: ['none','tent'], description: 'calendar_table only — back stand (default tent)' },
      unit:     { type: 'string', enum: ['in','ft'], description: 'unit for W/H — use "ft" for banner/standee sizes given in feet; default in' },
      width_mm: { type: 'number', description: 'lanyard only — strap width in mm (10/15/20/25; default 20)' },
      parts:    { type: 'number', enum: [2,3,4], description: 'ncr only — plies per set (2/3/4)' },
      paper_size:{ type: 'string', enum: ['a6','a5','half','a4'], description: 'ncr only — form size' }
    },
    required: ['product','copies']
  }
}];

async function callClaude(messages) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: SYSTEM, tools: TOOLS, messages })
  });
  return { status: res.status, text: await res.text() };
}

function safeFile(urlPath) {
  const p = normalize(urlPath.split('?')[0]).replace(/^(\.\.[\/\\])+/, '');
  return join(__dir, p === '/' || p === '' ? 'chat.html' : p);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url.split('?')[0] === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, model: MODEL, keySet: !!KEY }));
    }
    if (req.method === 'POST' && req.url.split('?')[0] === '/api/chat') {
      if (!KEY) { res.writeHead(500, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not set. Add it as a Space secret.' })); }
      let body = ''; for await (const c of req) { body += c; if (body.length > 2e6) break; }
      let messages;
      try { messages = JSON.parse(body).messages; if (!Array.isArray(messages)) throw 0; }
      catch { res.writeHead(400, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'bad request' })); }
      const out = await callClaude(messages);
      res.writeHead(out.status, { 'content-type': 'application/json' });
      return res.end(out.text);
    }
    // static files (chat.html, index.html engine, assets)
    const data = await readFile(safeFile(req.url));
    res.writeHead(200, { 'content-type': MIME[extname(safeFile(req.url))] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found');
  }
});
server.listen(PORT, () => console.log(`Andreal AI Quoter on :${PORT} · model ${MODEL} · key ${KEY ? 'set' : 'MISSING'}`));
