#!/usr/bin/env python3
"""Server-side ingest bridge for B1 (history match).

Reads the CONFIDENTIAL pre-production database (xlsx) and writes an ANONYMIZED job-spec file
(`data/jobs.jsonl`) that the history-service indexes. This is the only place the confidential
workbook is touched, and it runs LOCALLY on the server — the output is gitignored and, by design,
carries no recorded amounts, no client names as structured fields, and no raw messages.

What we keep: the SPEC (product type, size, paper, printing, process, coating, binding, quantity)
plus a free-text blob used ONLY for server-side search scoring. What we drop: Amount (INR),
Order Total, Client (as an identity), Raised By, Billing Note, Original Message. History informs the
SOLUTION; the live engine prices it — we never surface or reuse the historical price.

Usage:  python3 export_history.py <path-to.xlsx> [out.jsonl]
        (defaults: db/pre_production/Andreal_Pre_Production_Database.xlsx -> ../data/jobs.jsonl)
"""
import json, os, sys, re

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.abspath(os.path.join(here, '../../../db/pre_production/Andreal_Pre_Production_Database.xlsx'))
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(here, '..', 'data', 'jobs.jsonl')
    os.makedirs(os.path.dirname(out), exist_ok=True)

    import openpyxl
    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
    ws = wb['Job Database']
    rows = list(ws.iter_rows(values_only=True))
    hdr = [str(c) if c is not None else '' for c in rows[0]]
    idx = {h: i for i, h in enumerate(hdr)}

    def g(r, name):
        i = idx.get(name)
        v = r[i] if i is not None and i < len(r) else None
        return '' if v is None else str(v).strip()

    kept, n = [], 0
    for r in rows[1:]:
        product = g(r, 'Product Type')
        desc = g(r, 'Item Description') or g(r, 'Job Title')
        if not product and not desc:
            continue
        n += 1
        # SPEC (safe to surface, anonymised)
        spec = {
            'size': g(r, 'Closed / Finished Size') or g(r, 'Size'),
            'extent': g(r, 'Extent'),
            'paper': g(r, 'Paper / Board'),
            'printing': g(r, 'Printing'),
            'process': g(r, 'Process'),
            'coating': g(r, 'Coating & Lamination'),
            'embellishment': g(r, 'Embellishment'),
            'binding': g(r, 'Binding & Finishing'),
            'packaging': g(r, 'Packaging'),
            'quantity': _num(g(r, 'Quantity')),
        }
        # search text: server-side ONLY (may contain names) — never returned by the API.
        text = ' '.join([desc, product, spec['paper'], spec['printing'], spec['binding'], spec['coating'], spec['extent']])
        kept.append({
            'id': n,                       # positional, NOT the real Job ID
            'productType': product,
            'spec': {k: v for k, v in spec.items() if v not in ('', None)},
            '_text': _clean(text),         # underscore = private; the service strips it from responses
        })

    with open(out, 'w') as f:
        for j in kept:
            f.write(json.dumps(j, ensure_ascii=False) + '\n')
    print(f'wrote {len(kept)} anonymised job specs -> {out}')
    print('dropped (confidential): Amount, Order Total, Client identity, Raised By, Billing Note, Original Message')

def _num(s):
    try:
        return int(float(s))
    except Exception:
        return None

def _clean(s):
    return re.sub(r'\s+', ' ', (s or '').replace('“', '"').replace('”', '"')).strip()

if __name__ == '__main__':
    main()
