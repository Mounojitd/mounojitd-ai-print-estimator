"""Step 1 — Paper calculation endpoint (desk-calendar style), with real paper cost."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..services import paper_calc
from ..services.rates import RateBook

router = APIRouter(prefix="/api", tags=["paper"])
RB = RateBook()


class PaperRequest(BaseModel):
    page_w: float = Field(gt=0)
    page_h: float = Field(gt=0)
    total_pages: int = Field(gt=0)
    books: int = Field(gt=0)
    double_sided: bool = True
    bleed: float = 0.125
    gutter: float = 0.0
    grain: str = "either"                    # either | long | short
    gripper_mm: float = 13.0
    sidelay_mm: float = 3.0
    allow_rotation: bool = False
    gsm: int = Field(default=300, gt=0)
    grade: str | None = None                 # e.g. "ART BOARD" — filters the price lookup
    sheet_sizes: list[tuple[float, float]] | None = None
    setup_waste: int = 100
    running_pct: float = 5.0
    with_cost: bool = True                   # look up real ₹/sheet from the master


@router.post("/paper")
def paper(req: PaperRequest) -> dict:
    price_fn = None
    if req.with_cost:
        def price_fn(sw, sh):  # noqa: E306 — closure over the request
            return RB.paper_price(req.gsm, sw, sh, grade=req.grade)

    return paper_calc.compute(
        page_w=req.page_w, page_h=req.page_h, total_pages=req.total_pages, books=req.books,
        double_sided=req.double_sided, bleed=req.bleed, gutter=req.gutter, grain=req.grain,
        gripper_mm=req.gripper_mm, sidelay_mm=req.sidelay_mm, allow_rotation=req.allow_rotation,
        gsm=req.gsm, sheet_sizes=req.sheet_sizes, setup_waste=req.setup_waste,
        running_pct=req.running_pct, price_fn=price_fn,
    )
