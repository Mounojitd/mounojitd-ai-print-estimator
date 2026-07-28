# Deploying the AI Print Estimator

Two ways to share the app, depending on whether you need it temporary or permanent.

## A. Instant link (no account) — Cloudflare quick tunnel

Good for a quick demo. The link lives only while **your PC**, the **server**, and the
**tunnel** are all running, and the URL changes each restart.

```powershell
# 1. start the app
cd C:\git\ai-print-estimator\backend
python -m uvicorn app.main:app --port 8001

# 2. in a second terminal, open the tunnel (cloudflared.exe is in tools\)
C:\git\ai-print-estimator\tools\cloudflared.exe tunnel --url http://localhost:8001
```

cloudflared prints a `https://<random>.trycloudflare.com` URL — share that.

## B. Permanent link — Render.com (free, recommended)

The app stays online 24/7 with a stable URL; no need for your PC to be on.

1. **Put the repo on GitHub**
   ```powershell
   cd C:\git\ai-print-estimator
   git init
   git add .
   git commit -m "AI Print Estimator"
   git branch -M main
   git remote add origin https://github.com/<you>/ai-print-estimator.git
   git push -u origin main
   ```
2. Go to **render.com** → sign in with GitHub → **New + → Blueprint**.
3. Pick the repo. Render reads `render.yaml` and `Dockerfile` and builds it.
4. (Optional) In the service's **Environment**, add `ANTHROPIC_API_KEY` to enable
   Claude parsing in the "Estimate with AI" box. Without it, that box uses the
   built-in rules parser and still works.
5. You get a permanent URL like `https://ai-print-estimator.onrender.com`.

> The `db/files/*.xlsx` master sheets are committed, so the deployed app has your
> real paper/machine/plate data. To update rates later, edit those files (or add
> `db/files/Printing_Rate_Master.xlsx`), commit, and push — Render redeploys.

Railway works the same way off the `Dockerfile`.
