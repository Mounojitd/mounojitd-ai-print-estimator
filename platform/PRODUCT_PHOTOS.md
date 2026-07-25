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
node platform/api/tools/build_product_photos.mjs urls.json  # map { "<key>": "https://…" } directly (links)
node platform/api/tools/download_photos.mjs photo_urls.json # DOWNLOAD each URL into PHOTOS_DIR (robust; no hotlinking)
```

## Chosen path: an image-URL column in the sheet (option 2)

The "data" sheet does **not** yet have a URL column — the photos are still pasted into cells, which the API
can't read. To use option 2, add the column, then I pull it in:

1. **Add one column** to the Job Database tab, header e.g. `Photo URL`.
2. For **one representative row per product type**, put a **direct image URL** in that column. You do NOT need
   to fill all 376 rows — 28 good photos (one per product type) is the whole job. Use the
   `Estimator product (mapped)` value already in that row to know which product a photo covers.
3. Make each image **viewable by anyone with the link**. A Google Drive image works as
   `https://drive.google.com/uc?export=view&id=FILE_ID` (get FILE_ID from the file's share link). A plain
   hosted image URL (ends in .jpg/.png) works too.
4. Tell me it's ready. I read the sheet, take the first URL per `Estimator product (mapped)` key, run
   `download_photos.mjs` so each image is copied into our own service (no flaky Drive hotlinks), write
   `product_photos.json`, and commit. The showcase + B1 go visual immediately.

`download_photos.mjs` validates content-type, skips 404s, and leaves a key `null` on any failure — a missing
or bad photo never becomes a broken image.

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
