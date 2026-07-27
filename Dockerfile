# AI-first Print platform — one image that boots every service and serves the AI homepage.
# This is the CANONICAL Dockerfile at the repo root (Render/any host default ./Dockerfile just works).
# Build context = repo root (needs the validated engine paper_calculator.html + platform/).
#     docker build -t print-platform .
#     docker run -p 8080:8080 -v print-data:/data print-platform   # open http://localhost:8080
FROM node:22-bookworm-slim

# System libraries Chromium needs (the pricing engine runs headless).
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 ca-certificates fonts-liberation \
      libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
      libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
      libgbm1 libpango-1.0-0 libcairo2 libasound2 libxshmfence1 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Playwright + the Chromium browser (own layer for build caching).
COPY platform/package.json platform/package.json
RUN cd platform && npm install --no-audit --no-fund && npx playwright install chromium

# App code (repo root: the engine HTML + the platform services). See .dockerignore — the confidential
# db/ and all runtime data dirs are excluded, so nothing sensitive enters the image.
COPY . .

ENV NODE_ENV=production PORT=8080 DATA_ROOT=/data
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "platform/start-all.mjs"]
