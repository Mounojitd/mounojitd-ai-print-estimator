"""Step 1 — Paper calculation endpoint (the desk-calendar style calc)."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..services import paper_calc

router = APIRouter(prefix="/api", tags=["paper"])


class PaperRequest(BaseModel):
    page_w: float = Field(gt=0, description="Finished width, inches")
    page_h: float = Field(gt=0, description="Finished height, inches")
    total_pages: int = Field(gt=0)
    books: int = Field(gt=0)
    double_sided: bool = True
    bleed: float = 0.125
    safety: float = 0.125
    gripper_mm: float = 13.0
    sidelay_mm: float = 3.0
    allow_rotation: bool = False
    gsm: int = Field(default=300, gt=0)
    sheet_sizes: list[tuple[float, float]] | None = None
    setup_waste: int = 100
    running_pct: float = 5.0


@router.post("/paper")
def paper(req: PaperRequest) -> dict:
    return paper_calc.compute(
        page_w=req.page_w, page_h=req.page_h, total_pages=req.total_pages, books=req.books,
        double_sided=req.double_sided, bleed=req.bleed, safety=req.safety,
        gripper_mm=req.gripper_mm, sidelay_mm=req.sidelay_mm,
        allow_rotation=req.allow_rotation, gsm=req.gsm, sheet_sizes=req.sheet_sizes,
        setup_waste=req.setup_waste, running_pct=req.running_pct,
    )
