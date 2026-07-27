# Frontend (Vercel) — AI Print discovery UI

Static AI-first UI (the "What would you like to print today?" experience). It calls the **backend API on
Render** cross-origin, so this can be hosted free on Vercel.

## Deploy to Vercel

1. Vercel → **Add New → Project** → import this repo.
2. Set **Root Directory** to `frontend`. Framework preset: **Other** (no build step — it's static).
3. Deploy. You get `https://<project>.vercel.app`.
4. Edit **`frontend/config.js`** → set `window.API_BASE` to your Render backend URL, e.g.
   `https://print-platform-api.onrender.com` — then redeploy (or edit + push).

That's it — the UI loads the catalogue, runs the AI `/discover` conversation, prices, and saves quotes,
all against the Render backend. CORS is already open (`*`) on the services.

## Local check

```bash
# point at a running backend and serve this folder statically
# (config.js API_BASE = http://localhost:8080), then open index.html
python3 -m http.server 3000    # from frontend/, open http://localhost:3000
```

## Notes
- `config.js` is the only thing you edit — the backend URL. It's served `no-store` so changes take effect.
- Product photos + work samples come from the backend; they show placeholders until photos/history are wired.
- "Save quote" links to the backend's classic quote view (`<API_BASE>/classic#/q/<token>`).
