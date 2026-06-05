"""Real printing/finishing rate card — Naba Mudran Pvt Ltd ↔ Anderson agreement
(w.e.f. 01.06.2026). This is the actual contracted rate, so the quote is real.

PRINTING (section A, multicolor) — charged PER SIDE as a "lot charge":
  * up to 3000 sheets        → a flat lot charge (per side, by colours)
  * above 3000               → colours × (sheets/1000) × per-col-per-1000 rate
    (rate steps down in higher quantity bands)
Two sheet-size bands: ~19×29 (small press) and 23×36-and-above (big press).

LAMINATION → ₹ per 100 sq inch of sheet.   AQUEOUS VARNISH → ₹/100 sq in + min.
PLATES → ₹475 (small) / ₹575 (big) per plate.   DIE CUT → ₹400/1000, min 800.
"""
from __future__ import annotations

from decimal import Decimal

D = lambda x: Decimal(str(x))  # noqa: E731
LOT_LIMIT = 3000

# per-side printing: band -> { colours: {"lot": flat<=3000, "steps":[(max_sheets, per_col_per_1000)]}, "plate": ₹ }
PRINT = {
    "small": {  # 19" x 29"
        4: {"lot": 1500, "steps": [(10**12, 125)]},
        2: {"lot": 1000, "steps": [(10**12, 125)]},   # not in doc for small; estimated from 4-col
        1: {"lot": 600,  "steps": [(10**12, 125)]},   # estimated
        "plate": 475,
    },
    "big": {    # 23" x 36" and above
        4: {"lot": 2325, "steps": [(10000, 195), (10**12, 175)]},
        2: {"lot": 1225, "steps": [(10000, 205), (10**12, 185)]},
        1: {"lot": 625,  "steps": [(10000, 208), (10**12, 195)]},
        "plate": 575,
    },
}

# lamination ₹ per 100 sq inch
LAM_PER_100SQIN = {"gloss": D("0.35"), "bopp": D("0.40"), "matt": D("0.45")}
LAM_MIN = D("1000")
# aqueous varnish ₹ per 100 sq inch + minimum
AQUA = {"gloss": (D("0.18"), D("600")), "matt": (D("0.30"), D("1000"))}
# full UV (from the coatings table) ₹/100 sq in
UV_PER_100SQIN = D("0.30")
UV_MIN = D("1000")

DIE_PER_1000 = D("400")
DIE_MIN = D("800")


def size_band(sheet_w_in: float, sheet_h_in: float) -> str:
    """Pick the press band for a sheet. 23×36-and-up → big, else small."""
    long_, short = max(sheet_w_in, sheet_h_in), min(sheet_w_in, sheet_h_in)
    return "big" if (long_ >= 34 and short >= 22) else "small"


def _side_cost(band: str, colours: int, sheets: int) -> Decimal:
    if colours <= 0:
        return D(0)
    tbl = PRINT[band]
    spec = tbl.get(colours) or tbl.get(4)          # fall back to 4-col shape
    if sheets <= LOT_LIMIT:
        return D(spec["lot"])
    rate = next(r for mx, r in spec["steps"] if sheets <= mx)
    return D(colours) * (D(sheets) / D(1000)) * D(rate)


def printing_cost(sheet_w_in, sheet_h_in, colours_front, colours_back, sheets) -> tuple[Decimal, str]:
    band = size_band(sheet_w_in, sheet_h_in)
    cost = _side_cost(band, colours_front, sheets) + _side_cost(band, colours_back, sheets)
    return cost.quantize(D("0.01")), band


def plate_cost(sheet_w_in, sheet_h_in, colours_front, colours_back) -> Decimal:
    band = size_band(sheet_w_in, sheet_h_in)
    plates = max(0, colours_front) + max(0, colours_back)
    return (D(plates) * D(PRINT[band]["plate"])).quantize(D("0.01"))


def lamination_cost(kind: str, sheet_w_in, sheet_h_in, sheets) -> Decimal:
    rate = LAM_PER_100SQIN.get(kind, LAM_PER_100SQIN["matt"])
    area100 = D(sheet_w_in) * D(sheet_h_in) / D(100)
    return max(rate * area100 * D(sheets), LAM_MIN).quantize(D("0.01"))


def coating_cost(kind: str, sheet_w_in, sheet_h_in, sheets) -> Decimal:
    area100 = D(sheet_w_in) * D(sheet_h_in) / D(100)
    if kind == "uv":
        return max(UV_PER_100SQIN * area100 * D(sheets), UV_MIN).quantize(D("0.01"))
    rate, mn = AQUA.get(kind, AQUA["matt"])
    return max(rate * area100 * D(sheets), mn).quantize(D("0.01"))


def die_cut_cost(impressions: int) -> Decimal:
    return max(DIE_PER_1000 * D(impressions) / D(1000), DIE_MIN).quantize(D("0.01"))
