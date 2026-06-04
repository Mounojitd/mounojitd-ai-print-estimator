"""Margin — component-wise markup, floored by a job-tier minimum.

NKK sir: standard margin, different by cost type; the master may reduce it to
win the job. Paper is low markup (pass-through), finishing is high (value-add).
"""
from __future__ import annotations

from decimal import Decimal

from .estimation_config import MARGIN_PCT, D, margin_tier_pct


def calculate(buckets: dict[str, Decimal], production_cost: Decimal) -> tuple[Decimal, Decimal, str]:
    """Return (margin_amount, effective_pct, note)."""
    component_margin = sum(
        (amt * MARGIN_PCT.get(name, D(0)) / D(100) for name, amt in buckets.items()),
        D(0),
    )
    tier_pct = margin_tier_pct(production_cost)
    tier_floor = production_cost * tier_pct / D(100)

    if tier_floor > component_margin:
        margin = tier_floor
        note = f"job-tier floor {tier_pct}% applied"
    else:
        margin = component_margin
        note = "component-wise margin"

    margin = margin.quantize(D("0.01"))
    eff = (margin / production_cost * D(100)).quantize(D("0.01")) if production_cost else D(0)
    return margin, eff, note
