# Real product photos (one per product type)

Goal: show a **real photo of our work** on each product in the customer showcase and on B1 history-match
results, instead of a text-only chip. NK Sir's photo sheet (the "data" Google Sheet) is the source of the
pictures; this doc is how they get into the platform.

## The seam

`platform/api/data/product_photos.json` maps every engine product key → an image URL (or `null`):

```json
{ "booklet": "/photos/booklet.jpg", "card": "https://…/card.jpg", "rigidbox": null, … }
```

- The quote-service `/catalog` and history-service `/search` attach `photo` from this map.
- The showcase renders a photo card when a photo exists, and **falls back to the text chip** otherwise —
  so a missing or broken photo is never a broken page.
- Both services serve local photo files at `GET /photos/<file>` from `PHOTOS_DIR`
  (default `platform/api/data/photos/`, gitignored). Hosted/Drive URLs work too — then no local file is needed.

Rebuild the map after adding photos:

```bash
node platform/api/tools/build_product_photos.mjs            # from local files in PHOTOS_DIR
node platform/api/tools/build_product_photos.mjs urls.json  # from a { "<key>": "https://…" } URL map
```

## Getting the pictures out of the sheet — the honest constraint

The photos in the "data" sheet are **pasted directly into cells**. Google's API returns every text column
but **not** in-cell images, and the workbook is too large to pull wholesale — so the pictures can't be
harvested from the sheet programmatically as-is. Two reliable ways to make them reachable, easiest first:

1. **A Drive folder of named images** — export/drag the photos into a folder, one per product type, named by
   the engine key: `booklet.jpg`, `carton_tuck.jpg`, `card.jpg`, … Share the folder; the keys are listed at
   the bottom of this file. I can then read them and build the map (or you drop them into `PHOTOS_DIR`).
2. **An image-URL column in the sheet** — add a column with each row's photo as a link or `=IMAGE("https://…")`.
   Those URLs I can read directly and turn into the map.

Either path fills `product_photos.json`; the showcase and B1 light up immediately, no code change.

Note on confidentiality: only the **photo + product type** are shown. The recorded amounts and client names
in that sheet are never surfaced (same rule as the private DB).

## Engine product keys (name the files/URLs by these)

booklet, catalogue, magazine, manual, annual, brochure_multi, leaflet, poster, card, banner, standee,
lanyard, pouch, rigidbox, jacket, ncr, calendar_sheet, calendar_table, dangler, insert, pasted_tag,
carton_tuck, carton_seal, sleeve, folder, envelope, bag, slipcase
