"""Plate cost — offset only.

NKK sir: "the more colours you print, the more plates" — plate cost = per-colour
plate charge × colours × forms (each signature/forme is a separate plate set).
Both sides are imposed on the same work-and-turn sheet, so colours = front+back.
"""
from __future__ import annotations

from decimal import Decimal

from .estimation_config import (
    PLATE_COST_PER_COLOUR_BIG,
    PLATE_COST_PER_COLOUR_SMALL,
    D,
)
from .types import Component, Job


def calculate(component: Component, job: Job, forms: int) -> Decimal:
    if job.process.lower().startswith("dig"):
        return D(0)                      # digital: no plates
    colours = max(1, component.colours_front + component.colours_back)
    if job.plate_per_colour is not None:           # real rate from RateBook
        per_colour = job.plate_per_colour
    else:
        per_colour = (PLATE_COST_PER_COLOUR_BIG if job.machine_size_class == "big"
                      else PLATE_COST_PER_COLOUR_SMALL)
    return (per_colour * D(colours) * D(forms)).quantize(D("0.01"))
