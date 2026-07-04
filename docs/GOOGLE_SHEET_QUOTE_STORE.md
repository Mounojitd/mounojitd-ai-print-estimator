# Central quotation store — Google Sheet (Apps Script)

Goal: every time anyone clicks **💾 Save quote** in the estimator, the quote is appended as a row to ONE
Google Sheet you own. That sheet becomes your quotation database (and later, what the AI reads to answer
"what did we quote for a hard-case book last month?" etc.).

Why this way (not a GitHub folder): the app is a **static** page with no server. A browser cannot push files
into a GitHub repo, and putting a GitHub write-token in a public page would let anyone wreck the repo. A
Google Apps Script web app is the safe, free, 5-minute way — the token/permission stays on Google's side.

The local **CSV download stays as a backup**, so nothing is lost even if the internet is down.

## One-time setup (~5 min)

1. Create a new Google Sheet (e.g. "ANDREAL Quotations"). Note it will get a tab named **Quotes**.
2. In the Sheet: **Extensions → Apps Script**.
3. Delete anything there and paste the script below. **Save**.
4. **Deploy → New deployment → type: Web app.**
   - Description: `quote store`
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy**, authorise when prompted.
5. Copy the **Web app URL** (ends in `/exec`).
6. In the estimator, paste that URL into **☁ Cloud save URL (Google Sheet)** (below the print/save buttons).
   It's remembered on that device. Now every **Save quote** appends a row to your Sheet.

To test: price any job → **Save quote** → you should see a new row appear in the **Quotes** tab.

## The Apps Script (paste this)

```javascript
// Receives a quote from the estimator (JSON) and appends it as a row to the "Quotes" tab.
function doPost(e) {
  var COLS = ["date","quoteNo","customer","product","name","size","pages","qty","gsm","sheet","machine",
    "paper","printing","plates","coating","packing","freight","overhead","margin","gst","grand","unit"];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Quotes") || ss.insertSheet("Quotes");
  if (sh.getLastRow() === 0) sh.appendRow(["received_at"].concat(COLS));   // header row, once
  var d = {};
  try { d = JSON.parse(e.postData.contents); } catch (err) { d = {}; }
  var row = [new Date()].concat(COLS.map(function (c) { return d[c] != null ? d[c] : ""; }));
  sh.appendRow(row);
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
                       .setMimeType(ContentService.MimeType.JSON);
}
```

## Notes
- Column order matches the app's `QUOTE_COLS` exactly, so the sheet stays tidy.
- If you change the app's quote fields later, update `COLS` here to match.
- Re-deploying: use **Deploy → Manage deployments → edit (pencil) → Version: New version** so the URL stays
  the same. (A brand-new deployment gives a new URL you'd have to paste again.)
- The app posts with `mode:"no-cors"`, so it can't read the response — it reports "sent" optimistically. The
  row still lands in the Sheet. The downloaded CSV is your guaranteed backup.
- Later (sir's Phase 4): this same POST can point at a real backend/DB instead — only the URL changes.
```
