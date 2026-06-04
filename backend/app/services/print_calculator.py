"""Printing (impression) cost — offset & digital.

NKK sir: after plates, "the impression will be charged" with a make-ready loss,
and a minimum charge applies if the quantity doesn't fulfil it. One pass of a
4-colour machine = one impression per sheet; >4 colours needs extra passes.
The make-ready loss is already in total_sheets (setup waste from paper calc).
"""
from __future__ import annotations

import math
from decimal import Decimal

from .estimation_config import IMPRESSION_RATE_PER_SHEET, PRINTING_MIN_CHARGE, D
from .types import Component, Job


def calculate(component: Component, job: Job, total_sheets: int) -> Decimal:
    colours = max(1, component.colours_front + component.colours_back)
    passes = math.ceil(colours / 4)                      # 4-colour heads per pass
    impressions = total_sheets * passes
    rate = job.impression_rate_per_sheet if job.impression_rate_per_sheet is not None else IMPRESSION_RATE_PER_SHEET
    min_charge = job.printing_min_charge if job.printing_min_charge is not None else PRINTING_MIN_CHARGE
    cost = D(impressions) * rate
    return max(cost, min_charge).quantize(D("0.01"))
