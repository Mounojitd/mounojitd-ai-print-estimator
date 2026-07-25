-- History-match service (Phase B1) — Postgres schema for the ANONYMISED job-spec index.
-- The confidential source workbook is NEVER loaded here; tools/export_history.py produces the anonymised
-- rows (no amount, no client identity, no raw message) that populate this table. The dev store is the
-- JSONL file the service reads at startup; this is the production shape.

CREATE TABLE IF NOT EXISTS job_history (
  id            BIGSERIAL PRIMARY KEY,
  product_type  TEXT,
  spec          JSONB NOT NULL DEFAULT '{}',   -- size, extent, paper, printing, process, coating, binding, packaging, quantity
  search_text   TEXT NOT NULL DEFAULT ''       -- server-side ONLY: used for scoring, never returned to a client
  -- Deliberately absent: amount, order total, client identity, raised-by, billing note, original message.
);

-- MVP scorer is lexical TF-IDF in the service. To upgrade to embeddings, add pgvector and an embedding
-- column, and swap search.mjs's buildIndex/search for a vector query — the API + anonymised output stay the same:
--   CREATE EXTENSION IF NOT EXISTS vector;
--   ALTER TABLE job_history ADD COLUMN embedding vector(1536);
--   CREATE INDEX ON job_history USING ivfflat (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS job_history_product_idx ON job_history (product_type);
