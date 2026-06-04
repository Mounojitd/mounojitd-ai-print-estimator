"""Data-driven quote: describe the job, the engine pulls REAL rates and decides.

Given a plain spec it will, from your master data:
  * find every matching paper and pick the one with the lowest cost PER FINISHED
    PIECE (price ÷ ups), not merely the cheapest sheet — so a big sheet that
    yields more ups can win over a cheaper small sheet;
  * auto-select the cheapest-plate machine that can take that sheet & colours;
  * use the real plate ₹/colour for that machine;
  * run the full estimate (paper/print/finishing/packing/freight/overhead/
    margin/GST) and report which selections it made.

Still from estimation_config (NOT in your data — flagged in the output):
  * the per-sheet impression/run rate, and the lamination rate/unit.

    python -m app.services.auto_estimate
"""
from __future__ import annotations

from decimal import Decimal

from . import geometry
from .estimate_engine import estimate, print_estimate
from .rates import RateBook
from .types import Component, Estimate, Finishing, Job, Size


def auto_quote(
    *,
    product: str,
    category: str,
    quantity: int,
    page: Size,
    gsm: int,
    grade: str,
    colours_front: int,
    colours_back: int,
    finishing: list[Finishing] | None = None,
    inter_state: bool = False,
    exclude_grade: str | None = None,
    rate_book: RateBook | None = None,
) -> Estimate:
    rb = rate_book or RateBook()

    # 1) choose paper by lowest cost per finished piece (price ÷ ups)
    cands = rb.find_papers(grade, gsm, exclude=exclude_grade)
    if not cands:
        raise ValueError(f"No paper matching '{grade}' {gsm}gsm in the master data")
    best = None
    for p in cands:
        ups, _, _ = geometry.impose(p.sheet, page, 2, trim=True)
        if ups <= 0:
            continue
        cpp = p.price_per_sheet / Decimal(ups)
        if best is None or cpp < best[0]:
            best = (cpp, p, ups)
    if best is None:
        raise ValueError("No candidate paper sheet can hold the page")
    _, paper, paper_ups = best

    # 2) select the cheapest-plate machine that fits the paper sheet & colours
    machine = rb.select_machine(paper.sheet, max(colours_front, colours_back))
    if machine is None:
        raise ValueError(f"No machine can print a {paper.sheet} sheet in "
                         f"{max(colours_front, colours_back)} colours")

    # 3) build the job from those real selections and estimate
    comp = Component(
        name="sheet", page_size=page, pages=2,
        colours_front=colours_front, colours_back=colours_back,
        gsm=gsm, cost_per_sheet=paper.price_per_sheet, signature_pages=2, trim=True,
    )
    job = Job(
        product=product, category=category, quantity=quantity, components=[comp],
        machine_sheet=paper.sheet, machine_size_class=machine.size_class,
        machine_name=machine.machine, plate_per_colour=machine.plate_per_colour,
        process="offset", finishing=finishing or [], inter_state=inter_state,
    )

    # real per-sheet run rate, once Printing_Rate_Master.xlsx is filled
    colour_mode = "single" if max(colours_front, colours_back) <= 1 else "4color"
    impr = rb.impression(machine.machine, quantity, colour_mode)
    impr_note = ""
    if impr:
        job.impression_rate_per_sheet = impr["rate"]
        job.printing_min_charge = impr["min_charge"]
        impr_note = f"  ⟵ real ₹{impr['rate']}/sheet"

    e = estimate(job)
    e.notes.insert(0, f"PAPER  → {paper.paper_id} {paper.description} {paper.gsm}gsm "
                      f"{paper.sheet} @ ₹{paper.price_per_sheet}/sheet from {paper.vendor} "
                      f"(cheapest of {len(cands)} by ₹/piece, {paper_ups}-up)")
    e.notes.insert(1, f"MACHINE→ {machine.machine} ({machine.vendor}) max {machine.max_sheet}, "
                      f"plate ₹{machine.plate_per_colour}/colour [{machine.size_class}]  ⟵ real rates")
    if not impr:
        e.notes.append("PRINTING uses placeholder rate — fill db/files/Printing_Rate_Master.xlsx to make it real")
    else:
        e.notes.insert(2, f"PRINTING→ {impr_note.strip()} (band {impr['min']}–{impr['max']}, {colour_mode})")
    return e


def _demo() -> None:
    e = auto_quote(
        product="10,000 A4 brochure · 170gsm art · 4+4 · matt lam",
        category="brochure",
        quantity=10_000,
        page=Size(Decimal("210"), Decimal("297")),
        gsm=170,
        grade="ART PAPER",
        exclude_grade="MATT",          # gloss art body; matt comes from lamination
        colours_front=4,
        colours_back=4,
        finishing=[Finishing("Matt lamination", "per_sheet", Decimal("4.00"), min_charge=Decimal("500"))],
        inter_state=False,
    )
    print_estimate(e)


if __name__ == "__main__":
    _demo()
