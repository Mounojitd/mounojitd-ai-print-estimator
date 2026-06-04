"""Promote the clean master workbooks into the V1 engine masters.

Loads the per-master files (Vendor / Process / Paper / Product / Transport /
Material) into the normalised tables the cost engine reads. Run this BEFORE
import_excel.py so vendor names in the rate sheets resolve to the canonical
VEN### ids defined in Vendor_Master.

Reuses the header-driven parsing engine from import_excel.py.

Order:
    1. Vendor_Master      -> vendors           (canonical ids, upsert)
    2. Process_Master     -> machine_master    (MAC### generated)
    3. Paper_Master       -> paper_master (Paper Pricing) + paper_types
    4. Product_Master     -> products          (PRD### generated)
    5. Transport_Master   -> transport_master
    6. Material_Master    -> materials_master

Usage:
    python -m app.scripts.import_masters --dir ../db/files
    python -m app.scripts.import_masters --dir ../db/files --dry-run
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from decimal import Decimal

from openpyxl import load_workbook
from sqlalchemy import create_engine, text

from app.scripts.import_excel import VendorResolver, parse_sheet

IN_TO_MM = Decimal("25.4")


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def nz(v):
    """Treat the workbook's '0' / '' sentinels for missing text as NULL."""
    if v is None:
        return None
    s = str(v).strip()
    return None if s in ("", "0") else s


def size_to_mm(value) -> tuple[Decimal | None, Decimal | None]:
    """'25*36' / '28X40' / '23"x36"' (inches) -> (length_mm, width_mm)."""
    if value is None:
        return None, None
    nums = re.findall(r"\d+(?:\.\d+)?", str(value))
    if len(nums) >= 2:
        return Decimal(nums[0]) * IN_TO_MM, Decimal(nums[1]) * IN_TO_MM
    return None, None


# --------------------------------------------------------------------------
# per-master column maps  (normalized header -> (db_column, kind))
# kind: text|decimal|int|bool ; "_xxx" columns are scratch (consumed in xform)
# --------------------------------------------------------------------------
VENDOR_COLS = {
    "vendor id": ("vendor_id", "text"), "vendor name": ("vendor_name", "text"),
    "type": ("vendor_type", "text"), "contact person": ("contact_person", "text"),
    "phone primary": ("phone", "text"), "phone alt": ("phone_alt", "text"),
    "email": ("email", "text"), "address": ("address", "text"),
    "gst number": ("gst_number", "text"), "pan": ("pan", "text"),
    "payment terms": ("payment_terms", "text"), "discount": ("discount_pct", "decimal"),
    "min delivery chg": ("min_delivery_charge", "decimal"), "quality": ("quality", "text"),
    "on time": ("on_time_pct", "decimal"), "preferred": ("preferred", "bool"),
    "status": ("status", "text"),
}
MACHINE_COLS = {
    "vendor": ("vendor_name", "text"), "machine": ("machine_name", "text"),
    "type": ("machine_type", "text"), "max sheet size": ("max_sheet_size_name", "text"),
    "size in": ("_size_in", "text"), "colours": ("color_capability", "text"),
    "speed imp hr": ("machine_speed_iph", "int"),
}
PAPER_COLS = {
    "id": ("paper_id", "text"), "vendor": ("vendor_name", "text"),
    "paper type": ("paper_type", "text"), "grade": ("grade", "text"),
    "brand": ("brand", "text"), "gsm": ("gsm", "int"), "finish": ("finish", "text"),
    "colour": ("colour", "text"), "sheet size in": ("_size_in", "text"),
    "sq metre": ("sq_metre", "decimal"), "price sheet": ("cost_per_sheet", "decimal"),
    "price kg": ("cost_per_kg", "decimal"), "price ream": ("price_per_ream", "decimal"),
    "sheets ream": ("sheets_per_ream", "int"), "moq": ("moq", "int"),
    "stock": ("stock", "text"),
}
PAPER_TYPE_COLS = {
    "paper type": ("paper_type", "text"), "brand mill": ("brand", "text"),
    "standard sizes": ("standard_sizes", "text"), "gsm range": ("gsm_range", "text"),
    "grain": ("grain", "text"), "primary uses": ("primary_uses", "text"),
}
PRODUCT_COLS = {
    "form factor": ("form_factor", "text"), "product": ("product_name", "text"),
    "usage category": ("category", "text"), "paper board": ("paper_board", "text"),
    "gsm spec": ("gsm_spec", "text"),
}
TRANSPORT_COLS = {
    "id": ("transport_id", "text"), "vendor": ("vendor_name", "text"),
    "vehicle": ("vehicle", "text"), "origin": ("origin", "text"),
    "destination": ("destination", "text"), "customer": ("customer", "text"),
    "job": ("job", "text"), "qty pcs": ("qty_pcs", "decimal"),
    "rate trip": ("rate_per_trip", "decimal"), "rate pc": ("rate_per_pc", "decimal"),
    "delivery": ("delivery", "text"),
}
MATERIAL_COLS = {
    "id": ("material_id", "text"), "vendor": ("vendor_name", "text"),
    "category": ("category", "text"), "material type": ("material_type", "text"),
    "description": ("description", "text"), "size l in": ("size_l_in", "decimal"),
    "size w in": ("size_w_in", "decimal"), "unit": ("unit", "text"),
    "rate unit": ("rate_per_unit", "decimal"), "moq": ("moq", "decimal"),
    "lead days": ("lead_days", "int"), "stock": ("stock", "text"),
}


def _cfg(columns, vendor_field):
    return {"columns": columns, "vendor_field": vendor_field, "category": None}


# --------------------------------------------------------------------------
# loaders
# --------------------------------------------------------------------------
class Importer:
    def __init__(self, conn, resolver: VendorResolver, dry_run: bool):
        self.conn = conn
        self.resolver = resolver
        self.dry_run = dry_run
        self.unmatched: set[str] = set()

    def _resolve(self, rec: dict):
        name = rec.pop("vendor_name", None)
        if name:
            before = len(self.resolver.by_name)
            rec["vendor_id"] = self.resolver.resolve(name)
            if len(self.resolver.by_name) > before:
                self.unmatched.add(str(name).strip())
        return rec

    def _reload(self, table: str, rows: list[dict]):
        if self.dry_run:
            return
        self.conn.execute(text(f"DELETE FROM {table}"))
        if rows:
            cols = sorted({c for r in rows for c in r})
            stmt = text(f"INSERT INTO {table} ({', '.join(cols)}) "
                        f"VALUES ({', '.join(':' + c for c in cols)})")
            self.conn.execute(stmt, [{c: r.get(c) for c in cols} for r in rows])

    # --- vendors: upsert by canonical id (don't wipe; FKs depend on it) ---
    def vendors(self, ws):
        rows = parse_sheet(ws, _cfg(VENDOR_COLS, None))
        out = []
        for r in rows:
            if not r.get("vendor_id"):
                continue
            for f in ("email", "gst_number", "pan", "contact_person", "address",
                      "phone", "phone_alt", "quality", "status", "payment_terms"):
                if f in r:
                    r[f] = nz(r[f])
            r["preferred"] = bool(r.get("preferred"))
            out.append(r)
        # seed resolver with canonical names so later sheets resolve correctly
        # (also makes --dry-run accurate without a database)
        for r in out:
            self.resolver.by_name[VendorResolver._key(r["vendor_name"])] = r["vendor_id"]
            m = re.fullmatch(r"VEN(\d+)", r["vendor_id"])
            if m:
                self.resolver._next = max(self.resolver._next, int(m.group(1)) + 1)
        if not self.dry_run:
            cols = ["vendor_id", "vendor_name", "vendor_type", "contact_person", "phone",
                    "phone_alt", "email", "address", "gst_number", "pan", "payment_terms",
                    "discount_pct", "min_delivery_charge", "quality", "on_time_pct",
                    "preferred", "status"]
            updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in cols if c != "vendor_id")
            stmt = text(
                f"INSERT INTO vendors ({', '.join(cols)}) "
                f"VALUES ({', '.join(':' + c for c in cols)}) "
                f"ON CONFLICT (vendor_id) DO UPDATE SET {updates}"
            )
            self.conn.execute(stmt, [{c: r.get(c) for c in cols} for r in out])
        return len(out)

    def machines(self, ws):
        rows = parse_sheet(ws, _cfg(MACHINE_COLS, "vendor"))
        out = []
        for i, r in enumerate(rows, 1):
            r = self._resolve(r)
            r["max_length_mm"], r["max_width_mm"] = size_to_mm(r.pop("_size_in", None))
            r["machine_id"] = f"MAC{i:03d}"
            r.pop("source_row", None)
            out.append(r)
        self._reload("machine_master", out)
        return len(out)

    def paper(self, ws):
        rows = parse_sheet(ws, _cfg(PAPER_COLS, "vendor"))
        out = []
        for r in rows:
            r = self._resolve(r)
            r["sheet_length_mm"], r["sheet_width_mm"] = size_to_mm(r.pop("_size_in", None))
            r["paper_name"] = r.get("grade") or r.get("brand") or r.get("paper_type") or r.get("paper_id")
            r.pop("source_row", None)
            if r.get("paper_id"):
                out.append(r)
        self._reload("paper_master", out)
        return len(out)

    def paper_types(self, ws):
        rows = [dict(r) for r in parse_sheet(ws, _cfg(PAPER_TYPE_COLS, None))]
        for r in rows:
            r.pop("source_row", None)
        self._reload("paper_types", rows)
        return len(rows)

    def products(self, ws):
        rows = parse_sheet(ws, _cfg(PRODUCT_COLS, None))
        out = []
        for i, r in enumerate(rows, 1):
            r.pop("source_row", None)
            if not r.get("product_name"):
                continue
            r["product_id"] = f"PRD{i:03d}"
            out.append(r)
        self._reload("products", out)
        return len(out)

    def transport(self, ws):
        rows = parse_sheet(ws, _cfg(TRANSPORT_COLS, "vendor"))
        out = []
        for r in rows:
            r = self._resolve(r)
            r["location_name"] = r.get("destination") or r.get("origin")
            r["transport_cost"] = r.get("rate_per_trip")
            r.pop("source_row", None)
            if r.get("transport_id"):
                out.append(r)
        self._reload("transport_master", out)
        return len(out)

    def materials(self, ws):
        rows = parse_sheet(ws, _cfg(MATERIAL_COLS, "vendor"))
        out = []
        for r in rows:
            r = self._resolve(r)
            r.pop("source_row", None)
            if r.get("material_id"):
                out.append(r)
        self._reload("materials_master", out)
        return len(out)


# --------------------------------------------------------------------------
# driver
# --------------------------------------------------------------------------
def _open(directory: str, filename: str):
    path = os.path.join(directory, filename)
    if not os.path.exists(path):
        print(f"  ! missing file, skipping: {filename}")
        return None
    return load_workbook(path, data_only=True, read_only=True)


def run(directory: str, database_url: str | None, dry_run: bool) -> int:
    conn = trans = None
    if not dry_run:
        if not database_url:
            from app.config import settings
            database_url = settings.database_url
        engine = create_engine(database_url, future=True)
        conn = engine.connect()
        trans = conn.begin()
    resolver = VendorResolver(conn)
    imp = Importer(conn, resolver, dry_run)

    try:
        steps = []
        wb = _open(directory, "Vendor_Master.xlsx")
        if wb:
            steps.append(("vendors", imp.vendors(wb["Vendor Master"])))
        wb = _open(directory, "Process_Master.xlsx")
        if wb:
            steps.append(("machine_master", imp.machines(wb["Process Master"])))
        wb = _open(directory, "Paper_Master.xlsx")
        if wb:
            steps.append(("paper_master", imp.paper(wb["Paper Pricing"])))
            steps.append(("paper_types", imp.paper_types(wb["Paper Types"])))
        wb = _open(directory, "Product_Master.xlsx")
        if wb:
            steps.append(("products", imp.products(wb["Product Master"])))
        wb = _open(directory, "Transport_Master.xlsx")
        if wb:
            steps.append(("transport_master", imp.transport(wb["Transport Master"])))
        wb = _open(directory, "Material_Master.xlsx")
        if wb:
            steps.append(("materials_master", imp.materials(wb["Material Master"])))

        if not dry_run:
            trans.commit()

        print()
        for table, n in steps:
            print(f"  {table:20s} {n:4d} rows")
        if imp.unmatched:
            print("\n  vendor names NOT in Vendor_Master (auto-created, please merge):")
            for name in sorted(imp.unmatched):
                print(f"    - {name}")
        mode = "DRY-RUN (no writes)" if dry_run else "committed"
        print(f"\nDone [{mode}].")
        return 0
    except Exception:
        if trans is not None:
            trans.rollback()
        raise
    finally:
        if conn is not None:
            conn.close()


def main() -> None:
    ap = argparse.ArgumentParser(description="Import clean master workbooks into V1 masters.")
    ap.add_argument("--dir", required=True, help="Folder containing the *_Master.xlsx files")
    ap.add_argument("--database-url", default=None)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    sys.exit(run(args.dir, args.database_url, args.dry_run))


if __name__ == "__main__":
    main()
