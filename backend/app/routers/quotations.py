"""Estimate, persist, and read quotations."""
import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import estimator, models, schemas
from ..database import get_db

router = APIRouter(prefix="/quotations", tags=["quotations"])


@router.post("/estimate", response_model=schemas.EstimateResult)
def create_estimate(req: schemas.EstimateRequest, db: Session = Depends(get_db)):
    """Compute an estimate without persisting it."""
    try:
        return estimator.estimate(db, req)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


def _next_quotation_number(db: Session) -> str:
    year = datetime.now().year
    prefix = f"Q{year}-"
    count = db.scalar(
        select(func.count()).select_from(models.Quotation).where(
            models.Quotation.quotation_number.like(f"{prefix}%")
        )
    )
    return f"{prefix}{(count or 0) + 1:05d}"


@router.post("", response_model=schemas.QuotationOut, status_code=201)
def save_quotation(req: schemas.SaveQuotationRequest, db: Session = Depends(get_db)):
    """Compute the estimate and persist it with snapshotted line costs."""
    try:
        result = estimator.estimate(db, req.estimate)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    quotation = models.Quotation(
        quotation_number=req.quotation_number or _next_quotation_number(db),
        customer_id=req.customer_id,
        vendor_id=req.vendor_id,
        quotation_date=date.today(),
        production_cost=result.production_cost,
        margin_amount=result.margin_amount,
        gst_amount=result.gst_amount,
        grand_total=result.grand_total,
        status="draft",
    )

    for line in result.items:
        bd = line.breakdown
        quotation.items.append(
            models.QuotationItem(
                product_id=line.product_id,
                paper_id=line.paper_id,
                machine_id=line.machine_id,
                lamination_id=line.lamination_id,
                uv_id=line.uv_id,
                foil_id=line.foil_id,
                embossing_id=line.embossing_id,
                die_id=line.die_id,
                binding_id=line.binding_id,
                packaging_id=line.packaging_id,
                transport_id=line.transport_id,
                quantity=line.quantity,
                sheets_required=line.sheets_required,
                color_mode=line.color_mode,
                machine_size=line.machine_size,
                paper_cost=bd.paper_cost,
                printing_cost=bd.printing_cost,
                plate_cost=bd.plate_cost,
                lamination_cost=bd.lamination_cost,
                uv_cost=bd.uv_cost,
                foil_cost=bd.foil_cost,
                embossing_cost=bd.embossing_cost,
                die_cutting_cost=bd.die_cutting_cost,
                binding_cost=bd.binding_cost,
                packaging_cost=bd.packaging_cost,
                transport_cost=bd.transport_cost,
                total_cost=bd.total_cost,
            )
        )

    db.add(quotation)
    db.commit()
    db.refresh(quotation)
    return quotation


@router.get("", response_model=list[schemas.QuotationOut])
def list_quotations(db: Session = Depends(get_db)):
    return db.scalars(select(models.Quotation).order_by(models.Quotation.created_at.desc())).all()


@router.get("/{quotation_id}", response_model=schemas.QuotationOut)
def get_quotation(quotation_id: uuid.UUID, db: Session = Depends(get_db)):
    q = db.get(models.Quotation, quotation_id)
    if q is None:
        raise HTTPException(status_code=404, detail="Quotation not found")
    return q
