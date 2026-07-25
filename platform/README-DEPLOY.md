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
