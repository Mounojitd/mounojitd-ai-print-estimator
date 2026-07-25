# AI-first Print Discovery & Estimation — architecture & phasing

Response to the "AI-Powered Print Product Discovery & Estimation Interface" brief. The headline finding: **most
of the backend the brief asks for already exists** as validated services. Phase 1 is the AI-first *front-end*
that ties them together — built, not mocked.

## The spec vs what already exists

| Brief asks for | Status | Where |
|---|---|---|
| Dynamic product catalogue (no hardcoded products) | ✅ built | `api` (28 templates, families) |
| Pricing rules / paper / machine / finishing / rate DB | ✅ built | the validated engine + `pricing-service`; press/paper/finishing all live in it |
| Instant price + itemised breakdown + delivery | ✅ built | `pricing-service /estimate` → paper/print/plates/coating/margin/gst + lead time |
| Product images (served dynamically) | ◑ seam ready | `product_photos.json` + `/photos`; **0 wired** (awaiting the sheet's URL column) |
| Existing work samples ("what did we do for X") | ✅ built | `history-service` (B1), anonymised |
| Save / share a quote, hand off to full estimator | ✅ built | `quote-service /quotes`, `/#/q/:token`; order+production+vendor downstream |
| **AI conversation: greet → intent → discover → ask-only-missing → price → custom** | ✅ **Phase 1 (this)** | `quote-service /discover` + `public/discover.html` |
| Voice input, image/design upload, gallery filters, comparison mode | ◑ seams / later | flagged in the UI as next-phase |

## Phase 1 (delivered here)

**`POST /discover`** — one conversational turn (stateless; the client keeps the accumulating brief):
1. **Classify intent** from the message (`discover.mjs` — brochure, visiting card, letterhead, catalogue, box,
   sticker, diary/notebook, calendar, folder, poster, bag, banner, standee, lanyard, pouch, …).
2. **Price** the accumulated brief on the validated engine.
3. If it prices → return the **instant estimate + breakdown + lead time**.
   If not → return **only the fields the engine says are missing**, phrased as a question (adaptive — never
   asks for what it already parsed).
4. On first identification, attach **real work samples** from B1 (with the photo seam).
5. Unknown product → **custom mode**; "print this design" → **upload seam** (flagged, not faked).

**`public/discover.html`** — the AI-first homepage (served at `/`; the classic form moves to `/classic`):
hero "What would you like to print today?", suggested prompts, a persistent chat panel, discovery sample
cards, an instant-estimate card with breakdown + save/share + "confirm & pay" handoff, and a popular-products
grid from the real catalogue. Voice/upload are visible but honestly labelled "coming soon".

## Honest scope — the one thing to be clear about

The brief describes ChatGPT-like NL understanding. **Today the "intelligence" is a deterministic intent
classifier + the engine's parser reconciled against NK Sir's 341 jobs + the engine's own "what's missing"
signal** — it is conversational and adaptive, but it is *not* an LLM. That is deliberate: the estimate is
never guessed. A conversational LLM is a **drop-in** behind `classifyIntent()` / `friendlyMissing()` (same
in/out), so it can be added for free-form phrasing, up-sell and ask-back without touching the pricing path —
*AI guides, math decides.*

## Next phases (modular, on the same services)

- **P-AI-2:** LLM behind the classify/ask seam; free-form chat, comparison mode, recommendation.
- **P-AI-3:** image/design upload → match to B1 samples (vision); voice input.
- **P-AI-4:** gallery filters (industry / premium / budget / corporate); per-sample live "starting price".
- Everything already flows into the existing **order → production → vendor** chain for the full workflow.
