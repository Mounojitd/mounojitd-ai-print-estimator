"""Pydantic v2 request/response models."""
import uuid
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


# ---------- estimation input ----------
class EstimateItemRequest(BaseModel):
    """One line to estimate. Selections reference master IDs."""
    product_id: str
    quantity: int = Field(gt=0)
    paper_id: str
    sheets_required: int = Field(gt=0, description="Press sheets needed before wastage")
    machine_id: str
    color_mode: Literal["single", "4color"] = "4color"
    machine_size: Literal["small", "big"] = "big"

    lamination_id: str | None = None
    uv_id: str | None = None
    foil_id: str | None = None
    embossing_id: str | None = None
    die_id: str | None = None
    binding_id: str | None = None
    packaging_id: str | None = None
    transport_id: str | None = None


class EstimateRequest(BaseModel):
    category: str | None = Field(None, description="Drives GST lookup; falls back to 'default'")
    items: list[EstimateItemRequest] = Field(min_length=1)


# ---------- estimation output ----------
class CostBreakdown(BaseModel):
    paper_cost: Decimal
    printing_cost: Decimal
    plate_cost: Decimal
    lamination_cost: Decimal
    uv_cost: Decimal
    foil_cost: Decimal
    embossing_cost: Decimal
    die_cutting_cost: Decimal
    binding_cost: Decimal
    packaging_cost: Decimal
    transport_cost: Decimal
    total_cost: Decimal


class EstimateItemResult(EstimateItemRequest):
    breakdown: CostBreakdown


class EstimateResult(BaseModel):
    items: list[EstimateItemResult]
    production_cost: Decimal
    margin_percentage: Decimal
    margin_amount: Decimal
    gst_percentage: Decimal
    gst_amount: Decimal
    grand_total: Decimal
    notes: list[str] = []


# ---------- persistence ----------
class SaveQuotationRequest(BaseModel):
    customer_id: uuid.UUID | None = None
    vendor_id: str | None = None
    quotation_number: str | None = None
    estimate: EstimateRequest


class QuotationItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    item_id: uuid.UUID
    product_id: str | None
    quantity: int
    total_cost: Decimal


class QuotationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    quotation_id: uuid.UUID
    quotation_number: str
    customer_id: uuid.UUID | None
    quotation_date: date | None
    production_cost: Decimal | None
    margin_amount: Decimal | None
    gst_amount: Decimal | None
    grand_total: Decimal | None
    status: str
    items: list[QuotationItemOut] = []
