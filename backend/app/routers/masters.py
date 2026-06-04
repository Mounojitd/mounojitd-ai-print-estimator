"""Read-only listing endpoints for the master tables (drive UI dropdowns)."""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db

router = APIRouter(prefix="/masters", tags=["masters"])


def _list(db: Session, model):
    active_col = getattr(model, "active", None)
    stmt = select(model)
    if active_col is not None:
        stmt = stmt.where(active_col.is_(True))
    return db.scalars(stmt).all()


@router.get("/vendors")
def vendors(db: Session = Depends(get_db)):
    return _list(db, models.Vendor)


@router.get("/products")
def products(db: Session = Depends(get_db)):
    return _list(db, models.Product)


@router.get("/papers")
def papers(db: Session = Depends(get_db)):
    return _list(db, models.Paper)


@router.get("/machines")
def machines(db: Session = Depends(get_db)):
    return _list(db, models.Machine)


@router.get("/print-rates")
def print_rates(db: Session = Depends(get_db)):
    return _list(db, models.PrintRate)


@router.get("/finishing")
def finishing(db: Session = Depends(get_db)):
    return {
        "lamination": _list(db, models.Lamination),
        "uv": _list(db, models.Uv),
        "foiling": _list(db, models.Foil),
        "embossing": _list(db, models.Embossing),
        "die_cutting": _list(db, models.DieCutting),
        "binding": _list(db, models.Binding),
        "packaging": _list(db, models.Packaging),
        "transport": _list(db, models.Transport),
    }


@router.get("/rules")
def rules(db: Session = Depends(get_db)):
    return {
        "wastage": _list(db, models.WastageRule),
        "margin": _list(db, models.MarginRule),
        "gst": _list(db, models.GstRule),
    }
