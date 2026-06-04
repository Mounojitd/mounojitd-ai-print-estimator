"""Real worked job: 10,000 A4 brochures, 170gsm art, 4+4, matte lamination.

Uses a real paper price from the imported master (Paramount 170gsm art paper,
25×36" sheet, ₹11.934/sheet). Process rates (plate/impression/lamination/
overhead/margin) are still the placeholders in estimation_config.py — give a
real quoted price for this job and we calibrate them.

    python -m app.services.example_brochure

ASSUMPTION: a brochure here = one flat A4 sheet printed both sides (2 pages,
4+4). If it's folded or multi-page, the imposition (and price) changes.
"""
from __future__ import annotations

from .estimation_config import D
from .estimate_engine import estimate, print_estimate
from .types import Component, Finishing, Job, Size


def build() -> Job:
    a4 = Size(D("210"), D("297"))
    sheet = Component(
        name="sheet",
        page_size=a4,
        pages=2,                 # single leaf, printed both sides
        colours_front=4,
        colours_back=4,          # 4+4
        gsm=170,
        cost_per_sheet=D("11.934"),   # Paramount 170gsm art, 25×36" — real master price
        signature_pages=2,            # flat sheet, no folding
        trim=True,
    )
    return Job(
        product="10,000 A4 brochure · 170gsm art · 4+4 · matt lam",
        category="brochure",
        quantity=10_000,
        components=[sheet],
        machine_sheet=Size(D("635"), D("914")),   # 25×36" paper sheet on big machine
        machine_size_class="big",
        process="offset",
        finishing=[
            # matt lamination on the printed press sheet (one side); rate is a
            # placeholder per 25×36" sheet — calibrate against a real quote.
            Finishing("Matt lamination", "per_sheet", D("4.00"), min_charge=D("500")),
        ],
    )


if __name__ == "__main__":
    print_estimate(estimate(build()))
