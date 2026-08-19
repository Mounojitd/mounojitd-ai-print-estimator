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

What you can quote right now (map to the tool's "product"):
- booklet  → book, booklet, brochure, catalogue, magazine, notebook, diary, prospectus, annual report
- card     → visiting card, ID card, business card, certificate, menu card, greeting/invite, ticket, warranty card
- insert   → letterhead, leaflet, flyer, form, sticker, label
- poster   → poster, floor plan, large flat sheet

Specs the tool needs:
- Always: product, copies (quantity).
- Size: W and H in inches (closed/finished size for booklets). If the client says "A4" use 8.27 x 11.69; standard visiting card 3.5 x 2.
- Paper: gsm (inside). For booklets also coverGsm (0 if self-cover).
- Colours: cf and cb (front/back), e.g. "4 colour both sides" = cf 4, cb 4; "single side 4 colour" = cf 4, cb 0.
- booklet: pages (inside page count) and binding (saddle = centre stitch, perfect, sewn_perfect = section sewn, wireo).
- Optional finishing: coverLam (matt/gloss/velvet/none) and gold (screen_gold/screen_silver, with sides 1 for cover-only or 2 for cover+back).

If asked for something you can't quote yet (rigid box, calendar, envelope, bag, pouch, lanyard, tag, folder), say so honestly and offer the closest supported option or the full estimator page. Keep replies short. Be helpful and confident.`;

const TOOLS = [{
  name: 'quote',
  description: 'Price a print job using the validated Andreal engine and the LIVE vendor rates. Call only once you have the required specs; the app runs the real engine and returns the itemised quote.',
  input_schema: {
    type: 'object',
    properties: {
      product:  { type: 'string', enum: ['booklet','card','insert','poster'], description: 'engine product family' },
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
      sides:    { type: 'number', description: 'gold screen sides: 1 cover-only, 2 cover+back' }
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
