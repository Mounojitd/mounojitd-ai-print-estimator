#!/usr/bin/env python3
"""Local ingest for the REAL Vendor Master (B4). Server-side only; the output is gitignored.

Reads db/files/Vendor_Master.xlsx and writes vendor-service/data/vendors.json with each vendor's
capabilities derived from its Type, so bought-out routing can suggest real vendors. Contacts/GST/PAN are
operational data kept LOCAL (never committed). Run once; re-run to refresh.

Usage:  python3 import_vendors.py [path-to-Vendor_Master.xlsx]
"""
import json, os, sys

CAPS = {
    'Paper Supplier': ['paper', 'board', 'material', 'cutting'],
    'Material Vendor': ['material', 'ink', 'foil', 'film', 'consumable'],
    'Postpress Vendor': ['lamination', 'coating', 'foil', 'diecut', 'gluing', 'binding', 'folding'],
    'Printing Vendor': ['offset', 'printing'],
    'Digital Vendor': ['digital', 'largeformat', 'printing'],
    'Transporter': ['dispatch', 'courier', 'transport'],
}

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.abspath(os.path.join(here, '../../../db/files/Vendor_Master.xlsx'))
    out = os.path.join(here, '..', 'data', 'vendors.json')
    os.makedirs(os.path.dirname(out), exist_ok=True)

    import openpyxl
    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
    ws = wb['Vendor Master']
    rows = list(ws.iter_rows(values_only=True))
    hi = next(i for i, r in enumerate(rows) if r and str(r[0]).strip() == 'Vendor ID')
    hdr = [str(c) if c is not None else '' for c in rows[hi]]
    ix = {h: i for i, h in enumerate(hdr)}

    def g(r, name):
        i = ix.get(name); v = r[i] if i is not None and i < len(r) else None
        return '' if v is None else str(v).strip()

    vendors = []
    for r in rows[hi + 1:]:
        if not r or not r[0]:
            continue
        vtype = g(r, 'Type')
        disc = g(r, 'Discount %').replace('%', '').strip()
        vendors.append({
            'id': g(r, 'Vendor ID'),
            'name': g(r, 'Vendor Name'),
            'type': vtype,
            'capabilities': CAPS.get(vtype, ['material']),
            'contact': {'person': g(r, 'Contact Person'), 'phone': g(r, 'Phone (Primary)'), 'email': g(r, 'Email')},
            'paymentTerms': g(r, 'Payment Terms') or 'COD',
            'discountPct': float(disc) if disc.replace('.', '').isdigit() else 0,
            'active': True,
        })

    with open(out, 'w') as f:
        json.dump(vendors, f, ensure_ascii=False, indent=1)
    print(f'wrote {len(vendors)} real vendors -> {out}  (LOCAL, gitignored)')
    from collections import Counter
    print('by type:', dict(Counter(v['type'] for v in vendors)))

if __name__ == '__main__':
    main()
