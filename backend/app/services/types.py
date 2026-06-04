"""Shared dataclasses for the estimation services (DB-independent)."""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal


@dataclass
class Size:
    """Width × Height in millimetres."""
    w: Decimal
    h: Decimal

    def __str__(self) -> str:
        return f"{self.w:.1f}×{self.h:.1f}mm"


@dataclass
class Component:
    """One printable part of a job (a single sheet, or a book's cover / text).

    NKK sir splits books into components (cover vs text); each can use different
    paper and is imposed separately.
    """
    name: str                       # 'single' | 'cover' | 'text'
    page_size: Size                 # finished page (trimmed) size, W×H
    pages: int                      # number of pages in this component (1 leaf = 2 pages)
    colours_front: int = 4          # ink colours on the front
    colours_back: int = 0           # ink colours on the back (0 = single sided)
    gsm: int = 130
    paper_id: str | None = None
    cost_per_sheet: Decimal = Decimal("0")
    signature_pages: int = 16       # folding unit for this component (book text); 2 for a flat single sheet
    trim: bool = True               # ink bleeds → needs trimming


@dataclass
class Job:
    """A complete estimate request."""
    product: str
    category: str                   # drives GST: book|brochure|cards|packaging|...
    quantity: int
    components: list[Component]
    machine_sheet: Size             # press sheet size of the chosen machine
    machine_size_class: str = "big"  # 'big' | 'small' (plate cost & rate)
    machine_name: str | None = None  # selected machine (display)
    plate_per_colour: Decimal | None = None  # real ₹/plate from RateBook (else config)
    impression_rate_per_sheet: Decimal | None = None  # real run rate (else config)
    printing_min_charge: Decimal | None = None        # real min charge (else config)
    process: str = "offset"          # 'offset' | 'digital'
    finishing: list["Finishing"] = field(default_factory=list)
    transport_id: str | None = None
    transport_flat: Decimal = Decimal("0")
    inter_state: bool = False        # True → IGST; False → CGST + SGST split


@dataclass
class Finishing:
    """A post-press operation with minimum + recurring cost.

    basis: 'per_sheet' | 'per_piece' | 'per_sqin' | 'flat'
    """
    name: str
    basis: str
    rate: Decimal
    min_charge: Decimal = Decimal("0")
    setup_cost: Decimal = Decimal("0")      # e.g. die/block one-time
    bought_out: bool = False                # margin bucket


# ---- results ----
@dataclass
class ComponentResult:
    name: str
    ups: int
    orientation: str
    flat_piece: Size
    forms: int                      # signatures / printing forms
    good_sheets: int
    setup_waste_sheets: int
    running_waste_sheets: int
    total_sheets: int
    paper_cost: Decimal
    plate_cost: Decimal
    printing_cost: Decimal
    paper_weight_kg: Decimal
    notes: list[str] = field(default_factory=list)


@dataclass
class Estimate:
    job_product: str
    quantity: int
    components: list[ComponentResult]
    paper_cost: Decimal
    plate_cost: Decimal
    printing_cost: Decimal
    finishing_cost: Decimal
    packing_cost: Decimal
    freight_cost: Decimal
    total_weight_kg: Decimal
    production_cost: Decimal        # sum of the above (with overhead)
    overhead: Decimal
    margin: Decimal
    pre_tax: Decimal
    gst_pct: Decimal
    gst: Decimal               # total GST
    cgst: Decimal              # intra-state half (0 if inter-state)
    sgst: Decimal              # intra-state half (0 if inter-state)
    igst: Decimal              # inter-state full (0 if intra-state)
    inter_state: bool
    grand_total: Decimal
    unit_price: Decimal
    notes: list[str] = field(default_factory=list)
