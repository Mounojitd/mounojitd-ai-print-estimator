"""Estimate API — the data-driven engine exposed over HTTP.

POST /api/estimate       structured JobSpec  → quote   (no API key needed)
POST /api/estimate/nl    {"text": "..."}     → quote   (needs ANTHROPIC_API_KEY)
"""
from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services import estimate_engine
from ..services.nl_estimate import FinishingSpec, JobSpec, finishing_from_specs, parse_job_best, spec_to_estimate
from ..services.rates import RateBook
from ..services.types import Estimate

router = APIRouter(prefix="/api", tags=["estimate"])

# One shared RateBook (caches the master data in memory).
RB = RateBook()


def _f(x) -> float | None:
    return float(x) if isinstance(x, Decimal) else x


def _serialize(e: Estimate) -> dict:
    return {
        "product": e.job_product,
        "quantity": e.quantity,
        "components": [
            {
                "name": c.name,
                "ups": c.ups,
                "orientation": c.orientation,
                "flat_piece": str(c.flat_piece),
                "forms": c.forms,
                "good_sheets": c.good_sheets,
                "setup_waste_sheets": c.setup_waste_sheets,
                "running_waste_sheets": c.running_waste_sheets,
                "total_sheets": c.total_sheets,
                "weight_kg": _f(c.paper_weight_kg),
            }
            for c in e.components
        ],
        "lines": {
            "paper": _f(e.paper_cost),
            "plates": _f(e.plate_cost),
            "printing": _f(e.printing_cost),
            "finishing": _f(e.finishing_cost),
            "packing": _f(e.packing_cost),
            "freight": _f(e.freight_cost),
            "overhead": _f(e.overhead),
        },
        "weight_kg": _f(e.total_weight_kg),
        "production_cost": _f(e.production_cost),
        "margin": _f(e.margin),
        "pre_tax": _f(e.pre_tax),
        "gst_pct": _f(e.gst_pct),
        "gst": _f(e.gst),
        "cgst": _f(e.cgst),
        "sgst": _f(e.sgst),
        "igst": _f(e.igst),
        "inter_state": e.inter_state,
        "grand_total": _f(e.grand_total),
        "unit_price": _f(e.unit_price),
        "notes": e.notes,
    }


class NLRequest(BaseModel):
    text: str


class FromPaperRequest(BaseModel):
    """Price a job using the Paper Calculator's real sheet decision (Step 1 → 3)."""
    product: str = "Job"
    category: str = "brochure"
    quantity: int
    gsm: int
    sheet_w_in: float
    sheet_h_in: float
    ups: int
    good_sheets: int
    total_sheets: int
    total_weight_kg: float
    paper_cost: float
    colours_front: int = 4
    colours_back: int = 4
    finishing: list[FinishingSpec] = []
    inter_state: bool = False


@router.post("/estimate/from-paper")
def estimate_from_paper(req: FromPaperRequest) -> dict:
    e = estimate_engine.estimate_from_paper(
        product=req.product, category=req.category, quantity=req.quantity, gsm=req.gsm,
        sheet_w_in=req.sheet_w_in, sheet_h_in=req.sheet_h_in, ups=req.ups,
        good_sheets=req.good_sheets, total_sheets=req.total_sheets,
        total_weight_kg=req.total_weight_kg, paper_cost=req.paper_cost,
        colours_front=req.colours_front, colours_back=req.colours_back,
        finishing=finishing_from_specs(req.finishing), inter_state=req.inter_state,
        rate_book=RB,
    )
    return _serialize(e)


@router.post("/estimate")
def estimate_structured(spec: JobSpec) -> dict:
    """Quote from a structured spec (the form). No LLM, no API key."""
    try:
        return _serialize(spec_to_estimate(spec, RB))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/estimate/nl")
def estimate_nl(req: NLRequest) -> dict:
    """Quote from plain English. Uses Claude when ANTHROPIC_API_KEY is set,
    otherwise a built-in rule-based parser — so it always works."""
    if not req.text.strip():
        raise HTTPException(status_code=422, detail="Please describe the job.")
    spec, method = parse_job_best(req.text, RB)
    try:
        result = _serialize(spec_to_estimate(spec, RB))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    result["parsed_spec"] = spec.model_dump()
    result["parsed_by"] = method
    if method == "rules":
        result["notes"].insert(0, "Parsed by built-in rules (set ANTHROPIC_API_KEY + `pip install anthropic` for AI parsing).")
    return result

