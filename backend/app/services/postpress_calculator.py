"""Post-press / finishing — each op has minimum + recurring cost.

NKK sir: "minimum cost if 10... then additional pieces are recurring cost."
basis: per_sheet (× sheets) | per_piece (× qty) | per_sqin (× area × qty) | flat.
One-time setup (die/block) is added on top; the minimum charge is a floor.
"""
from __future__ import annotations

from decimal import Decimal

from .estimation_config import D
from .types import Finishing, Job


def calculate(op: Finishing, job: Job, sheets: int, piece_sqin: Decimal = D(0)) -> Decimal:
    basis = op.basis.lower()
    if basis == "per_sheet":
        variable = op.rate * D(sheets)
    elif basis == "per_piece":
        variable = op.rate * D(job.quantity)
    elif basis == "per_sqin":
        variable = op.rate * piece_sqin * D(job.quantity)
    else:  # flat
        variable = op.rate
    return (max(variable, op.min_charge) + op.setup_cost).quantize(D("0.01"))
