# Deploying the AI Print platform (make it a real, reachable site)

The platform is **not** static — the pricing engine runs headless Chromium on the server — so it can't live
on GitHub Pages (that only serves the single-file estimator). This deploys the whole thing as one container
that serves the **AI discovery homepage** on one port.

> Two different things, don't conflate them:
> - **Estimator** (`index.html`) → static, already on **GitHub Pages** (your existing URL).
> - **This platform** (AI discovery + quote/order/… services) → a Node app you host here.

## Quick start — Docker (any host)

Build **from the repo root** (the engine HTML must be in the build context):

```bash
docker build -f platform/Dockerfile -t print-platform .
docker run -p 8080:8080 -v print-data:/data print-platform
# open http://localhost:8080   (or your server's public URL)
```

First request takes a second while Chromium warms up. The confidential `db/` and all runtime data are
excluded from the image (see `.dockerignore`) — nothing sensitive ships in it.

## Quick start — no Docker (a VM / your machine)

```bash
cd platform
npm install && npx playwright install chromium
PORT=8080 node start-all.mjs
# open http://localhost:8080
```

(Verified: `start-all.mjs` boots pricing + history + quote and serves the homepage.)

## Environment

| Var | Default | Meaning |
|---|---|---|
| `PORT` | 8080 | public port for the AI homepage |
| `DATA_ROOT` | `/data` (Docker) | writable dir for saved quotes — **mount a volume to persist** |
| `HISTORY_JOBS` | the committed **synthetic** fixture | path to anonymised job specs for B1 samples; point at your own to use real ones |
| `START_FULL` | unset | `1` also boots order/production/vendor (internal ports — see below) |

## Deploy to Fly.io (config included — `fly.toml` at the repo root)

```bash
# 1. one-time: install flyctl + log in
curl -L https://fly.io/install.sh | sh          # (or: brew install flyctl)
fly auth login

# 2. from the REPO ROOT (fly.toml + the engine HTML are here)
fly apps create andreal-print-platform          # pick a unique name; edit `app =` in fly.toml to match
fly volumes create print_data --size 1 --region bom --app andreal-print-platform
fly deploy                                       # builds platform/Dockerfile, ~a few min (Chromium)

fly open                                          # opens https://<app>.fly.dev  → the AI homepage
fly logs                                          # watch it boot ("AI Print platform up")
```

`fly.toml` is preset: Mumbai region (`bom`), **2 GB RAM** (Chromium OOMs on the 256 MB default), a `/health`
check with a warm-up grace period, and a `/data` volume so saved quotes persist. It **scales to zero when
idle** (cheapest) — the first visit cold-starts in ~10 s; set `min_machines_running = 1` for always-on.

## Auto-deploy via GitHub (no local Docker/flyctl — the "hands-off" path)

`.github/workflows/fly-deploy.yml` deploys to Fly with Fly's **remote builder** (nothing to install locally).
You do exactly **one** thing:

1. Create a Fly deploy token — either `fly tokens create deploy -x 8760h` (from any machine with flyctl), or
   in the Fly dashboard → your app → **Tokens**.
2. In GitHub → **Settings → Secrets and variables → Actions → New repository secret**: name `FLY_API_TOKEN`,
   value = the token.

Then trigger it: **Actions → "Deploy to Fly.io" → Run workflow** (or just push to `main`). The workflow
creates the app + volume if missing and deploys — the run log prints `https://<app>.fly.dev`.

> The app name (`andreal-print-platform`) must be globally unique. If Fly says it's taken, change `app =` in
> `fly.toml` **and** `FLY_APP` in the workflow to a unique name, then re-run.

## Render (backend) + Vercel (frontend) — the split, mostly free

The AI UI is static → **Vercel (free)**. The backend runs the pricing engine (headless Chromium) → **Render**.
They talk cross-origin; CORS is already open (`*`) on the services.

**Backend on Render** — `render.yaml` (repo root) is a Blueprint:
1. Render → **New → Blueprint** → pick this repo. It builds `platform/Dockerfile` from the repo root.
2. Deploy → you get `https://<name>.onrender.com`. Check `…/health`.

> **Memory reality:** the pricing engine runs **headless Chromium (~1–2 GB)**. Render's **free/starter tiers
> are 512 MB and will OOM** — `render.yaml` uses `standard` (2 GB). There is **no truly-free tier that runs
> Chromium**. To make the backend fit the **free 512 MB** tier, the pricing service must drop the browser and
> run the engine via **jsdom** (no Chromium) — a change I can make on request; it's the real path to a $0 backend.

**Frontend on Vercel** — see `frontend/README.md`:
1. Vercel → **Add New → Project** → import this repo, **Root Directory = `frontend`**, framework **Other**.
2. Deploy → `https://<project>.vercel.app`.
3. Set `frontend/config.js` → `window.API_BASE = "https://<name>.onrender.com"` → redeploy.

Now the Vercel URL is your public AI site, pricing on the Render backend.

## Other hosts

Any Docker host with **~2 GB RAM**: a small **VM** (`docker run -p 80:8080 …`), **Render** / **Railway**
(point them at `platform/Dockerfile`, build context = repo root), or Kubernetes. Set `PORT` to whatever the
host injects.

## What's exposed, and what's next

- **Exposed:** the AI discovery homepage — chat, instant estimate, samples, save & share quote. This is the
  full customer-facing experience.
- **Internal (`START_FULL=1`):** order / production / vendor services run on internal ports. To make the
  **checkout** (confirm & pay) reachable, put a reverse proxy in front routing e.g. `/order/*` →
  order-service and set `ORDER_CHECKOUT_URL` to that public path. (Left off by default so the demo has no
  dead links — saved quotes show a shareable link.)
- **Product photos:** the gallery shows placeholders until `product_photos.json` is filled (the sheet's
  Photo URL column / the daily sync).
- **Real work samples (B1):** ship the anonymised `jobs.jsonl` via a mounted volume + `HISTORY_JOBS`; the
  synthetic fixture is the safe default so no confidential data is baked into the image.
