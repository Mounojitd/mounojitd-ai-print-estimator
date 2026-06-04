"""GST — applied on the pre-tax selling price, by product category.

Rates come from gst_rules (verify with CA). Books are often exempt, printed
matter 5/12%, packaging & cards 18%.
"""
from __future__ import annotations

from decimal import Decimal

from .estimation_config import D, gst_pct


def calculate(
    category: str | None, pre_tax: Decimal, inter_state: bool = False
) -> tuple[Decimal, Decimal, Decimal, Decimal, Decimal]:
    """Return (gst_total, gst_pct, cgst, sgst, igst).

    Intra-state: CGST + SGST, each = rate/2. Inter-state: a single IGST = rate.
    """
    pct = gst_pct(category)
    gst = (pre_tax * pct / D(100)).quantize(D("0.01"))
    if inter_state:
        return gst, pct, D("0.00"), D("0.00"), gst
    half = (gst / D(2)).quantize(D("0.01"))
    cgst = half
    sgst = (gst - half).quantize(D("0.01"))   # keep cgst+sgst == gst exactly
    return gst, pct, cgst, sgst, D("0.00")
