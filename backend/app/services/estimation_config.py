"""All tunable constants & rate tables in one place.

NKK sir: "you only need a table — for every machine, for every type of printing,
how much wastage / colours / spoilage." These are sensible defaults drawn from
the transcript and the Wastage/Margin/GST rule sheets. TUNE THEM against real
jobs — the structure is fixed, the numbers are meant to be edited.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal


def D(x) -> Decimal:
    return Decimal(str(x))


# ---- sheet layout allowances (mm) -- from the PDF imposition diagram ----
TRIM_MARGIN_MM = D("3.0")    # standard trim if caller doesn't specify
BLEED_MM = D("3.0")          # print beyond finish, trimmed off
GUTTER_MM = D("6.0")         # space between ups (≈ 2 × bleed)
GRIPPER_MM = D("12.0")       # machine grip edge (no print)
SIDE_LAY_MM = D("5.0")       # side registration margin
COLOR_BAR_MM = D("10.0")     # colour control strip on gripper edge

# ---- commercial ----
OVERHEAD_PCT = D("12.0")     # blanket overhead before margin


# ---- wastage / spoilage table ----
# setup_sheets: fixed make-ready sheets PER COLOUR (per plate change), independent
#               of run length. running_pct: spoilage as % of the good run.
@dataclass(frozen=True)
class WastageBand:
    max_qty: int                 # upper bound of this band (inclusive); huge number = "and above"
    setup_sheets_per_forme: int  # make-ready sheets per forme (sheet side / plate set)
    running_pct: Decimal


# offset, by run quantity — higher qty => lower running %.
# Make-ready is per FORME (one side of the sheet = one plate set), NOT per
# individual colour. A both-sided job has 2 formes per signature.
WASTAGE_OFFSET: list[WastageBand] = [
    WastageBand(1_000, 100, D("8")),
    WastageBand(5_000, 125, D("5")),
    WastageBand(20_000, 150, D("3")),
    WastageBand(10_000_000, 200, D("2")),
]
# digital: negligible setup, small flat spoilage
WASTAGE_DIGITAL: list[WastageBand] = [
    WastageBand(10_000_000, 0, D("2")),
]


def wastage_band(process: str, qty: int) -> WastageBand:
    table = WASTAGE_DIGITAL if process.lower().startswith("dig") else WASTAGE_OFFSET
    for band in table:
        if qty <= band.max_qty:
            return band
    return table[-1]


# ---- printing (offset) defaults; override per machine from print_rate_master ----
PLATE_COST_PER_COLOUR_SMALL = D("180")    # ₹ per plate, small machine
PLATE_COST_PER_COLOUR_BIG = D("450")      # ₹ per plate, big machine
IMPRESSION_RATE_PER_SHEET = D("0.40")     # ₹ per impression (per colour pass)
PRINTING_MIN_CHARGE = D("1500")           # minimum printing charge per job/form


# ---- component-wise margin (markup on cost) -- from Margin Rules sheet ----
MARGIN_PCT = {
    "paper": D("12"),
    "printing": D("25"),
    "finishing": D("30"),
    "bought_out": D("15"),
    "transport": D("10"),
}
# job-tier minimum margin (markup on total cost) by selling-value tier
MARGIN_TIER = [
    (D("10000"), D("40")),     # small job  < ₹10k
    (D("100000"), D("28")),    # medium     ₹10k–₹1L
    (Decimal("9" * 12), D("18")),  # large    > ₹1L
]


def margin_tier_pct(cost: Decimal) -> Decimal:
    for ceiling, pct in MARGIN_TIER:
        if cost <= ceiling:
            return pct
    return MARGIN_TIER[-1][1]


# ---- GST -- from GST Rules sheet (verify current rates with CA) ----
# Total GST. Intra-state = CGST + SGST (each = rate/2); inter-state = IGST = rate.
# Printed brochures/leaflets & printing services attract 18% (9% + 9%).
GST_PCT = {
    "book": D("0"),          # printed books — generally exempt
    "brochure": D("18"),     # printed brochures/leaflets — 18% (9% CGST + 9% SGST)
    "cards": D("18"),
    "packaging": D("18"),
    "printing_service": D("18"),
    "default": D("18"),
}


def gst_pct(category: str | None) -> Decimal:
    return GST_PCT.get((category or "default").lower(), GST_PCT["default"])


# ---- packing / freight ----
@dataclass(frozen=True)
class PackingConfig:
    carton_inner_volume_cc: Decimal = D("40000")   # usable cc per carton (~40×33×30cm)
    carton_max_weight_kg: Decimal = D("15")
    carton_cost: Decimal = D("35")                  # ₹ per carton
    freight_per_kg: Decimal = D("8")                # ₹ per kg
    freight_min: Decimal = D("300")


PACKING = PackingConfig()
