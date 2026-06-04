"""Orchestrates the full estimate: paper → print → finishing → packing →
freight → overhead → margin → GST, per NKK sir's flow.

Run the worked example (no database needed):
    python -m app.services.estimate_engine
"""
from __future__ import annotations

import math
from decimal import Decimal

from . import (
    gst_calculator,
    margin_calculator,
    paper_calculator,
    plate_calculator,
    postpress_calculator,
    print_calculator,
)
from .estimation_config import OVERHEAD_PCT, PACKING, D
from .types import Component, Estimate, Finishing, Job, Size


def estimate(job: Job) -> Estimate:
    notes: list[str] = []
    comp_results = []
    total_sheets_all = 0
    total_weight = D(0)

    for comp in job.components:
        r = paper_calculator.calculate(comp, job)
        r.plate_cost = plate_calculator.calculate(comp, job, r.forms)
        r.printing_cost = print_calculator.calculate(comp, job, r.total_sheets)
        comp_results.append(r)
        total_sheets_all += r.good_sheets
        total_weight += r.paper_weight_kg
        notes.extend(f"[{r.name}] {n}" for n in r.notes)

    paper_cost = sum((r.paper_cost for r in comp_results), D(0))
    plate_cost = sum((r.plate_cost for r in comp_results), D(0))
    printing_cost = sum((r.printing_cost for r in comp_results), D(0))

    # ---- finishing ----
    finishing_cost = D(0)
    bought_out = D(0)
    for op in job.finishing:
        c = postpress_calculator.calculate(op, job, total_sheets_all)
        if op.bought_out:
            bought_out += c
        else:
            finishing_cost += c

    # ---- packing & freight (weight driven) ----
    cartons = max(1, math.ceil(float(total_weight) / float(PACKING.carton_max_weight_kg)))
    packing_cost = (D(cartons) * PACKING.carton_cost).quantize(D("0.01"))
    freight_cost = max(total_weight * PACKING.freight_per_kg, PACKING.freight_min).quantize(D("0.01"))
    if job.transport_flat:
        freight_cost = job.transport_flat

    # ---- overhead, margin, gst ----
    base = paper_cost + plate_cost + printing_cost + finishing_cost + bought_out + packing_cost + freight_cost
    overhead = (base * OVERHEAD_PCT / D(100)).quantize(D("0.01"))
    production_cost = (base + overhead).quantize(D("0.01"))

    buckets = {
        "paper": paper_cost,
        "printing": plate_cost + printing_cost,
        "finishing": finishing_cost,
        "bought_out": bought_out + packing_cost,
        "transport": freight_cost,
    }
    margin, eff_pct, margin_note = margin_calculator.calculate(buckets, production_cost)
    notes.append(f"margin: {margin_note} ({eff_pct}%)")

    pre_tax = (production_cost + margin).quantize(D("0.01"))
    gst, gst_p, cgst, sgst, igst = gst_calculator.calculate(job.category, pre_tax, job.inter_state)
    grand_total = (pre_tax + gst).quantize(D("0.01"))
    unit_price = (grand_total / D(job.quantity)).quantize(D("0.0001"))

    return Estimate(
        job_product=job.product,
        quantity=job.quantity,
        components=comp_results,
        paper_cost=paper_cost.quantize(D("0.01")),
        plate_cost=plate_cost.quantize(D("0.01")),
        printing_cost=printing_cost.quantize(D("0.01")),
        finishing_cost=finishing_cost.quantize(D("0.01")),
        packing_cost=packing_cost,
        freight_cost=freight_cost,
        total_weight_kg=total_weight.quantize(D("0.001")),
        production_cost=production_cost,
        overhead=overhead,
        margin=margin,
        pre_tax=pre_tax,
        gst_pct=gst_p,
        gst=gst,
        cgst=cgst,
        sgst=sgst,
        igst=igst,
        inter_state=job.inter_state,
        grand_total=grand_total,
        unit_price=unit_price,
        notes=notes,
    )


# --------------------------------------------------------------------------
# Worked example  —  edit these numbers and re-run to test the logic
# --------------------------------------------------------------------------
def _demo() -> None:
    import sys
    try:
        sys.stdout.reconfigure(encoding="utf-8")   # ₹ on Windows consoles
    except Exception:
        pass
    # NKK sir's example: a 16-page A5 booklet, self-cover, 4-colour both sides,
    # 170gsm art paper, saddle-stitched, 2000 copies, printed on a big machine.
    a5 = Size(D("148"), D("210"))           # A5 page, mm
    text = Component(
        name="text", page_size=a5, pages=16, colours_front=4, colours_back=4,
        gsm=170, cost_per_sheet=D("6.20"), signature_pages=16, trim=True,
    )
    job = Job(
        product="A5 16pp booklet (self-cover)",
        category="brochure",
        quantity=2000,
        components=[text],
        machine_sheet=Size(D("508"), D("711")),   # 20×28 in SRA-ish sheet
        machine_size_class="big",
        process="offset",
        finishing=[
            Finishing("Gloss lamination (cover)", "per_sheet", D("0.90"), min_charge=D("300")),
            Finishing("Saddle stitch", "per_piece", D("0.50"), min_charge=D("400")),
        ],
    )

    print_estimate(estimate(job))


def print_estimate(e: Estimate) -> None:
    """Pretty-print a full estimate breakdown to the console."""
    import sys
    try:
        sys.stdout.reconfigure(encoding="utf-8")   # ₹ on Windows consoles
    except Exception:
        pass
    print(f"\n=== {e.job_product}  ×{e.quantity} ===")
    for c in e.components:
        print(f"  {c.name:5s} flat {c.flat_piece}  ups={c.ups} ({c.orientation})  forms={c.forms}")
        print(f"        sheets: good={c.good_sheets} +setup={c.setup_waste_sheets} "
              f"+run={c.running_waste_sheets} = {c.total_sheets}")
        print(f"        paper ₹{c.paper_cost}  plate ₹{c.plate_cost}  print ₹{c.printing_cost}"
              f"  wt {c.paper_weight_kg}kg")
    print(f"\n  Paper       ₹{e.paper_cost}")
    print(f"  Plates      ₹{e.plate_cost}")
    print(f"  Printing    ₹{e.printing_cost}")
    print(f"  Finishing   ₹{e.finishing_cost}")
    print(f"  Packing     ₹{e.packing_cost}   ({e.total_weight_kg}kg)")
    print(f"  Freight     ₹{e.freight_cost}")
    print(f"  Overhead    ₹{e.overhead}  ({OVERHEAD_PCT}%)")
    print(f"  ----------------------------")
    print(f"  Production  ₹{e.production_cost}")
    print(f"  Margin      ₹{e.margin}")
    print(f"  Pre-tax     ₹{e.pre_tax}")
    half = e.gst_pct / D(2)
    if e.inter_state:
        print(f"  IGST {e.gst_pct}%    ₹{e.igst}")
    else:
        print(f"  CGST {half}%   ₹{e.cgst}")
        print(f"  SGST {half}%   ₹{e.sgst}")
    print(f"  ============================")
    print(f"  GRAND TOTAL ₹{e.grand_total}     unit ₹{e.unit_price}")
    if e.notes:
        print("\n  notes:")
        for n in e.notes:
            print(f"   - {n}")


if __name__ == "__main__":
    _demo()
