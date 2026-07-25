-- Platform data model — Phase 0.4b (PLATFORM_PLAN.md §2).
-- Catalog + rate cards as VERSIONED DATA (roadmap reframe #2), so any historical quote can be
-- reproduced exactly. Production target: Postgres. The dev API uses a JSON-file store with the
-- same shape (see store.mjs); this file is the production DDL.

CREATE TABLE IF NOT EXISTS product_template (
  id                 SERIAL PRIMARY KEY,
  key                TEXT UNIQUE NOT NULL,          -- stable slug
  label              TEXT NOT NULL,                 -- catalogue display name
  family             TEXT NOT NULL,                 -- book | flat | converting | rigid | largeformat | perpiece | calendar
  engine_product_key TEXT NOT NULL,                 -- maps to the pricing engine's product value
  active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Configurable spec per template (Phase 0.1). Every future product type is new rows here, not new code.
CREATE TABLE IF NOT EXISTS attribute (
  id           SERIAL PRIMARY KEY,
  template_id  INTEGER NOT NULL REFERENCES product_template(id) ON DELETE CASCADE,
  key          TEXT NOT NULL,                       -- e.g. trim_size, pages, gsm, colours, binding
  label        TEXT NOT NULL,
  data_type    TEXT NOT NULL,                       -- number | text | enum | bool
  required     BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (template_id, key)
);
CREATE TABLE IF NOT EXISTS attribute_value (   -- allowed options for enum attributes
  id           SERIAL PRIMARY KEY,
  attribute_id INTEGER NOT NULL REFERENCES attribute(id) ON DELETE CASCADE,
  value        TEXT NOT NULL,
  label        TEXT
);
CREATE TABLE IF NOT EXISTS validation_rule (   -- e.g. "saddle-stitch max ~80pp", "pages multiple of 4"
  id           SERIAL PRIMARY KEY,
  template_id  INTEGER NOT NULL REFERENCES product_template(id) ON DELETE CASCADE,
  rule         TEXT NOT NULL,
  message      TEXT
);

-- Rate cards (Phase 0.2). One row per rate entity; `values` holds the shape for its category.
-- Categories seeded from the engine: press_source, binding, product_margin, largeformat_media,
-- pouch_media, lanyard_media, ncr_ply_rate, rigidbox_style.
CREATE TABLE IF NOT EXISTS rate_card (
  id          SERIAL PRIMARY KEY,
  category    TEXT NOT NULL,
  key         TEXT NOT NULL,
  label       TEXT,
  version     INTEGER NOT NULL DEFAULT 1,
  values      JSONB NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category, key)
);

-- Append-only history so an old quote's exact rates can be reproduced (PLATFORM_PLAN §5).
CREATE TABLE IF NOT EXISTS rate_card_history (
  id          SERIAL PRIMARY KEY,
  rate_card_id INTEGER NOT NULL REFERENCES rate_card(id) ON DELETE CASCADE,
  category    TEXT NOT NULL,
  key         TEXT NOT NULL,
  version     INTEGER NOT NULL,
  values      JSONB NOT NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by  TEXT
);

CREATE INDEX IF NOT EXISTS idx_rate_card_category ON rate_card(category);
CREATE INDEX IF NOT EXISTS idx_template_family    ON product_template(family);
