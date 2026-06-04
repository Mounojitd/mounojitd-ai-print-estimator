"""Paper calculation per component — NKK sir's core logic.

For each component (single sheet / cover / text):
  open size → flat signature (trim + bleed + gutter) → ups on the machine sheet
  → signatures (forms) → good sheets for the run → + setup waste (per colour)
  + running waste (%) → total sheets → paper cost & weight.
"""
from __future__ import annotations

import math
from decimal import Decimal

from . import geometry
from .estimation_config import D, wastage_band
from .types import Component, ComponentResult, Job, Size


def _area_m2(size: Size) -> Decimal:
    return (size.w / D(1000)) * (size.h / D(1000))


def calculate(component: Component, job: Job) -> ComponentResult:
    notes: list[str] = []
    band = wastage_band(job.process, job.quantity)

    n_forms, forms = geometry.plan_forms(component.pages, component.signature_pages)
    if n_forms == 0:                       # treat as a flat single sheet
        n_forms, forms = 1, [2]

    good_sheets = 0
    disp_ups, disp_orient, disp_flat = 0, "n/a", Size(D(0), D(0))

    for idx, form_pages in enumerate(forms):
        ups, signote, flat = geometry.impose(
            job.machine_sheet, component.page_size, form_pages, component.trim
        )
        orient = signote
        if ups <= 0:
            notes.append(f"form {idx + 1}: piece {flat} larger than sheet {job.machine_sheet} — check machine")
            ups = 1
        sheets_for_form = math.ceil(job.quantity / ups)
        good_sheets += sheets_for_form
        if idx == 0:
            disp_ups, disp_orient, disp_flat = ups, orient, flat
            notes.append(signote)

    # Delivered paper weight = finished leaves actually shipped (not press sheets,
    # not the trimmed-off bleed). leaves = pages / 2.
    leaves = D(component.pages) / D(2)
    finished_weight = D(job.quantity) * _area_m2(component.page_size) * D(component.gsm) / D(1000) * leaves

    # wastage: setup (make-ready) is per forme = per sheet side; a both-sided job
    # has 2 formes per signature. running waste is % of the good run.
    sides = 2 if component.colours_back > 0 else 1
    formes = n_forms * sides
    setup_waste = band.setup_sheets_per_forme * formes
    running_waste = math.ceil(good_sheets * float(band.running_pct) / 100.0)
    total_sheets = good_sheets + setup_waste + running_waste

    paper_cost = D(total_sheets) * component.cost_per_sheet

    return ComponentResult(
        name=component.name,
        ups=disp_ups,
        orientation=disp_orient,
        flat_piece=disp_flat,
        forms=n_forms,
        good_sheets=good_sheets,
        setup_waste_sheets=setup_waste,
        running_waste_sheets=running_waste,
        total_sheets=total_sheets,
        paper_cost=paper_cost.quantize(D("0.01")),
        plate_cost=D(0),
        printing_cost=D(0),
        paper_weight_kg=finished_weight.quantize(D("0.001")),
        notes=notes,
    )
