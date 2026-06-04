# AI Print Estimator — container for permanent hosting (Render / Railway / Fly.io)
FROM python:3.12-slim

WORKDIR /app

# deps first (better layer caching)
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# app code + master data (db/files/*.xlsx must be committed)
COPY backend/ backend/
COPY db/ db/

ENV PORT=8000
EXPOSE 8000

# rates.py resolves db/files relative to backend/app/services → /app/db/files
CMD ["sh", "-c", "cd backend && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
