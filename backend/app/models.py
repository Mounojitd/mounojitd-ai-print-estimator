"""SQLAlchemy ORM models mapping the print-estimator schema."""
import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


# ---------------- Masters ----------------
class Vendor(Base):
    __tablename__ = "vendors"
    vendor_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    vendor_name: Mapped[str] = mapped_column(String(255), nullable=False)
    vendor_type: Mapped[str | None] = mapped_column(String(100))
    contact_person: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    email: Mapped[str | None] = mapped_column(String(255))
    gst_number: Mapped[str | None] = mapped_column(String(50))
    address: Mapped[str | None] = mapped_column(Text)
    lead_time_days: Mapped[int | None] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Product(Base):
    __tablename__ = "products"
    product_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    product_name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str | None] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text)
    default_gsm: Mapped[int | None] = mapped_column(Integer)
    default_binding: Mapped[str | None] = mapped_column(String(100))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Paper(Base):
    __tablename__ = "paper_master"
    paper_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    paper_name: Mapped[str] = mapped_column(String(255), nullable=False)
    gsm: Mapped[int | None] = mapped_column(Integer)
    sheet_length_mm: Mapped[float | None] = mapped_column(Numeric(10, 2))
    sheet_width_mm: Mapped[float | None] = mapped_column(Numeric(10, 2))
    cost_per_sheet: Mapped[float | None] = mapped_column(Numeric(12, 4))
    cost_per_kg: Mapped[float | None] = mapped_column(Numeric(12, 4))
    vendor_id: Mapped[str | None] = mapped_column(ForeignKey("vendors.vendor_id"))
    moq: Mapped[int | None] = mapped_column(Integer)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Machine(Base):
    __tablename__ = "machine_master"
    machine_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    vendor_id: Mapped[str | None] = mapped_column(ForeignKey("vendors.vendor_id"))
    machine_name: Mapped[str] = mapped_column(String(255), nullable=False)
    machine_type: Mapped[str | None] = mapped_column(String(100))
    max_sheet_size_name: Mapped[str | None] = mapped_column(String(100))
    color_capability: Mapped[str | None] = mapped_column(String(50))
    pricing_model: Mapped[str | None] = mapped_column(String(100))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class PrintRate(Base):
    __tablename__ = "print_rate_master"
    rate_record_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    machine_id: Mapped[str | None] = mapped_column(ForeignKey("machine_master.machine_id"))
    vendor_id: Mapped[str | None] = mapped_column(ForeignKey("vendors.vendor_id"))
    min_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    max_qty: Mapped[int] = mapped_column(Integer, nullable=False)
    rate_single_color: Mapped[float | None] = mapped_column(Numeric(12, 4))
    rate_4_color_big_machine: Mapped[float | None] = mapped_column(Numeric(12, 4))
    rate_4_color_small_machine: Mapped[float | None] = mapped_column(Numeric(12, 4))
    plate_charge_small: Mapped[float | None] = mapped_column(Numeric(12, 4))
    plate_charge_big: Mapped[float | None] = mapped_column(Numeric(12, 4))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class _SimpleRate(Base):
    """Shared shape for per_sheet/per_unit/flat finishing masters."""
    __abstract__ = True
    rate_type: Mapped[str | None] = mapped_column(String(50))
    rate: Mapped[float | None] = mapped_column(Numeric(12, 4))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Lamination(_SimpleRate):
    __tablename__ = "lamination_master"
    lamination_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    lamination_type: Mapped[str] = mapped_column(String(100), nullable=False)
    vendor_id: Mapped[str | None] = mapped_column(ForeignKey("vendors.vendor_id"))


class Uv(_SimpleRate):
    __tablename__ = "uv_master"
    uv_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    uv_type: Mapped[str] = mapped_column(String(100), nullable=False)


class Foil(_SimpleRate):
    __tablename__ = "foiling_master"
    foil_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    foil_type: Mapped[str] = mapped_column(String(100), nullable=False)


class Embossing(_SimpleRate):
    __tablename__ = "embossing_master"
    embossing_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    embossing_type: Mapped[str] = mapped_column(String(100), nullable=False)


class DieCutting(Base):
    __tablename__ = "die_cutting_master"
    die_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    die_type: Mapped[str] = mapped_column(String(100), nullable=False)
    setup_cost: Mapped[float | None] = mapped_column(Numeric(12, 4))
    running_cost: Mapped[float | None] = mapped_column(Numeric(12, 4))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Binding(Base):
    __tablename__ = "binding_master"
    binding_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    binding_type: Mapped[str] = mapped_column(String(100), nullable=False)
    rate_per_unit: Mapped[float | None] = mapped_column(Numeric(12, 4))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Packaging(Base):
    __tablename__ = "packaging_master"
    packaging_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    packaging_type: Mapped[str] = mapped_column(String(100), nullable=False)
    rate_per_unit: Mapped[float | None] = mapped_column(Numeric(12, 4))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Transport(Base):
    __tablename__ = "transport_master"
    transport_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    location_name: Mapped[str] = mapped_column(String(255), nullable=False)
    transport_cost: Mapped[float | None] = mapped_column(Numeric(12, 4))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


# ---------------- Rule tables ----------------
class WastageRule(Base):
    __tablename__ = "wastage_rules"
    rule_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    process_name: Mapped[str] = mapped_column(String(100), nullable=False)
    wastage_percentage: Mapped[float | None] = mapped_column(Numeric(6, 2))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class MarginRule(Base):
    __tablename__ = "margin_rules"
    rule_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    min_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    max_amount: Mapped[float | None] = mapped_column(Numeric(12, 2))
    margin_percentage: Mapped[float | None] = mapped_column(Numeric(6, 2))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class GstRule(Base):
    __tablename__ = "gst_rules"
    gst_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    gst_percentage: Mapped[float | None] = mapped_column(Numeric(6, 2))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


# ---------------- Transactional ----------------
class Customer(Base):
    __tablename__ = "customers"
    customer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(50))
    email: Mapped[str | None] = mapped_column(String(255))
    gst_number: Mapped[str | None] = mapped_column(String(50))
    address: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Quotation(Base):
    __tablename__ = "quotations"
    quotation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    quotation_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("customers.customer_id"))
    quotation_date: Mapped[date | None] = mapped_column(Date)
    production_cost: Mapped[float | None] = mapped_column(Numeric(14, 2))
    margin_amount: Mapped[float | None] = mapped_column(Numeric(14, 2))
    gst_amount: Mapped[float | None] = mapped_column(Numeric(14, 2))
    grand_total: Mapped[float | None] = mapped_column(Numeric(14, 2))
    vendor_id: Mapped[str | None] = mapped_column(ForeignKey("vendors.vendor_id"))
    status: Mapped[str] = mapped_column(String(50), default="draft")
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    items: Mapped[list["QuotationItem"]] = relationship(
        back_populates="quotation", cascade="all, delete-orphan", lazy="selectin"
    )


class QuotationItem(Base):
    __tablename__ = "quotation_items"
    item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    quotation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("quotations.quotation_id", ondelete="CASCADE"))
    product_id: Mapped[str | None] = mapped_column(ForeignKey("products.product_id"))

    paper_id: Mapped[str | None] = mapped_column(ForeignKey("paper_master.paper_id"))
    machine_id: Mapped[str | None] = mapped_column(ForeignKey("machine_master.machine_id"))
    lamination_id: Mapped[str | None] = mapped_column(ForeignKey("lamination_master.lamination_id"))
    uv_id: Mapped[str | None] = mapped_column(ForeignKey("uv_master.uv_id"))
    foil_id: Mapped[str | None] = mapped_column(ForeignKey("foiling_master.foil_id"))
    embossing_id: Mapped[str | None] = mapped_column(ForeignKey("embossing_master.embossing_id"))
    die_id: Mapped[str | None] = mapped_column(ForeignKey("die_cutting_master.die_id"))
    binding_id: Mapped[str | None] = mapped_column(ForeignKey("binding_master.binding_id"))
    packaging_id: Mapped[str | None] = mapped_column(ForeignKey("packaging_master.packaging_id"))
    transport_id: Mapped[str | None] = mapped_column(ForeignKey("transport_master.transport_id"))

    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    sheets_required: Mapped[int | None] = mapped_column(Integer)
    color_mode: Mapped[str | None] = mapped_column(String(20))
    machine_size: Mapped[str | None] = mapped_column(String(20))

    paper_cost: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    printing_cost: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    plate_cost: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    lamination_cost: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    uv_cost: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    foil_cost: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    embossing_cost: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    die_cutting_cost: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    binding_cost: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    packaging_cost: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    transport_cost: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    total_cost: Mapped[float] = mapped_column(Numeric(14, 2), default=0)

    quotation: Mapped["Quotation"] = relationship(back_populates="items")
