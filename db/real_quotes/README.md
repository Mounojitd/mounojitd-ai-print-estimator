# Real-quote historical dataset

Raw customer quote history captured from NKK sir's WhatsApp job cards.
Roughly 200 jobs across 2025-02-27 → 2026-07-16, each with the full spec
and the confirmed billed amount.

Purpose: ground-truth reconcile the estimator against — for every rate
change, we can back-test against these to see if we're getting closer
or breaking older jobs.

Files:
- `dataset_2025-02_to_2026-07.tsv` — one row per job. Tab-separated.
  Columns: date, client, product, orientation, close_size, open_size,
  pages, paper, printing, embellishment, process, binding, qty, amount,
  notes, full_original_spec.

Anonymisation: customer names are kept as-is because the estimator is
internal, but do NOT publish this dataset externally. Same policy as
the ai-print-estimator repo (private-use only).
