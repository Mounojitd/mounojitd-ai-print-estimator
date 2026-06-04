"""V1 cost engine.

Computes a fully-itemised estimate from master data. Documented assumptions
(tune these to match the shop's actual costing):

  * `sheets_required` is supplied by the caller (press sheets BEFORE wastage).
    A later version can derive it from product geometry + paper sheet size.
  * Printing wastage (`wastage_rules.process_name = 'printing'`, else 'default')
    is added to sheets before applying the per-sheet print and paper rates.
  * print_rate is selected by the band whose [min_qty, max_qty] contains the
    line quantity, for the chosen machine. The per-sheet rate used is:
        single  -> rate_single_color
        4color + big   -> rate_4_color_big_machine
        4color + small -> rate_4_color_small_machine
    Plate charge is a one-off: plate_charge_big / plate_charge_small.
  * Finishing masters with rate_type:
        per_sheet -> rate * effective_sheets
        per_unit  -> rate * quantity
        flat      -> rate (one-off)
    Die cutting = setup_cost (one-off) + running_cost * quantity.
    Binding / packaging = rate_per_unit * quantity.
    Transport = transport_cost (one-off).
  * Margin: first margin_rules band containing production_cost.
  * GST: gst_rules row for the request category, else 'default'.

All money is Decimal, rounded to 2 dp at the line and total level.
"""
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models, schemas

Q2 = Decimal("0.01")
HUNDRED = Decimal("100")


def _money(v) -> Decimal:
    return Decimal(v or 0).quantize(Q2, rounding=ROUND_HALF_UP)


def _dec(v) -> Decimal:
    return Decimal(v) if v is not None else Decimal(0)


def _wastage_factor(db: Session, process: str) -> Decimal:
    row = db.scalar(
        select(models.WastageRule).where(
            models.WastageRule.process_name == process, models.WastageRule.active.is_(True)
        )
    )
    if row is None:
        row = db.scalar(
            select(models.WastageRule).where(
                models.WastageRule.process_name == "default", models.WastageRule.active.is_(True)
            )
        )
    pct = _dec(row.wastage_percentage) if row else Decimal(0)
    return Decimal(1) + pct / HUNDRED


def _finishing_cost(master, rate_type_default, eff_sheets: Decimal, qty: int) -> Decimal:
    if master is None or master.rate is None:
        return Decimal(0)
    rate = _dec(master.rate)
    rt = (master.rate_type or rate_type_default or "per_sheet").lower()
    if rt == "per_unit":
        return rate * Decimal(qty)
    if rt == "flat":
        return rate
    return rate * eff_sheets  # per_sheet


def _get(db: Session, model, pk_attr: str, pk: str | None):
    if pk is None:
        return None
    return db.get(model, pk)


def estimate_item(db: Session, item: schemas.EstimateItemRequest) -> schemas.CostBreakdown:
    qty = item.quantity
    base_sheets = Decimal(item.sheets_required)
    eff_sheets = (base_sheets * _wastage_factor(db, "printing")).quantize(Q2, rounding=ROUND_HALF_UP)

    # --- paper ---
    paper = _get(db, models.Paper, "paper_id", item.paper_id)
    if paper is None:
        raise ValueError(f"Unknown paper_id '{item.paper_id}'")
    paper_cost = _dec(paper.cost_per_sheet) * eff_sheets

    # --- printing + plate ---
    rate = db.scalar(
        select(models.PrintRate).where(
            models.PrintRate.machine_id == item.machine_id,
            models.PrintRate.active.is_(True),
            models.PrintRate.min_qty <= qty,
            models.PrintRate.max_qty >= qty,
        )
    )
    if rate is None:
        raise ValueError(
            f"No active print rate band for machine '{item.machine_id}' at quantity {qty}"
        )

    if item.color_mode == "single":
        per_sheet_rate = _dec(rate.rate_single_color)
    elif item.machine_size == "big":
        per_sheet_rate = _dec(rate.rate_4_color_big_machine)
    else:
        per_sheet_rate = _dec(rate.rate_4_color_small_machine)
    printing_cost = per_sheet_rate * eff_sheets

    plate_cost = _dec(rate.plate_charge_big if item.machine_size == "big" else rate.plate_charge_small)

    # --- finishing ---
    lamination_cost = _finishing_cost(_get(db, models.Lamination, "", item.lamination_id), "per_sheet", eff_sheets, qty)
    uv_cost = _finishing_cost(_get(db, models.Uv, "", item.uv_id), "per_sheet", eff_sheets, qty)
    foil_cost = _finishing_cost(_get(db, models.Foil, "", item.foil_id), "per_sheet", eff_sheets, qty)
    embossing_cost = _finishing_cost(_get(db, models.Embossing, "", item.embossing_id), "per_sheet", eff_sheets, qty)

    die = _get(db, models.DieCutting, "", item.die_id)
    die_cutting_cost = (_dec(die.setup_cost) + _dec(die.running_cost) * Decimal(qty)) if die else Decimal(0)

    binding = _get(db, models.Binding, "", item.binding_id)
    binding_cost = _dec(binding.rate_per_unit) * Decimal(qty) if binding else Decimal(0)

    packaging = _get(db, models.Packaging, "", item.packaging_id)
    packaging_cost = _dec(packaging.rate_per_unit) * Decimal(qty) if packaging else Decimal(0)

    transport = _get(db, models.Transport, "", item.transport_id)
    transport_cost = _dec(transport.transport_cost) if transport else Decimal(0)

    components = [
        paper_cost, printing_cost, plate_cost, lamination_cost, uv_cost, foil_cost,
        embossing_cost, die_cutting_cost, binding_cost, packaging_cost, transport_cost,
    ]
    total = sum(components, Decimal(0))

    return schemas.CostBreakdown(
        paper_cost=_money(paper_cost),
        printing_cost=_money(printing_cost),
        plate_cost=_money(plate_cost),
        lamination_cost=_money(lamination_cost),
        uv_cost=_money(uv_cost),
        foil_cost=_money(foil_cost),
        embossing_cost=_money(embossing_cost),
        die_cutting_cost=_money(die_cutting_cost),
        binding_cost=_money(binding_cost),
        packaging_cost=_money(packaging_cost),
        transport_cost=_money(transport_cost),
        total_cost=_money(total),
    )


def _margin_pct(db: Session, production_cost: Decimal) -> Decimal:
    row = db.scalar(
        select(models.MarginRule).where(
            models.MarginRule.active.is_(True),
            models.MarginRule.min_amount <= production_cost,
            (models.MarginRule.max_amount.is_(None)) | (models.MarginRule.max_amount >= production_cost),
        ).order_by(models.MarginRule.min_amount.desc())
    )
    return _dec(row.margin_percentage) if row else Decimal(0)


def _gst_pct(db: Session, category: str | None) -> Decimal:
    row = None
    if category:
        row = db.scalar(
            select(models.GstRule).where(
                models.GstRule.category == category, models.GstRule.active.is_(True)
            )
        )
    if row is None:
        row = db.scalar(
            select(models.GstRule).where(
                models.GstRule.category == "default", models.GstRule.active.is_(True)
            )
        )
    return _dec(row.gst_percentage) if row else Decimal(0)


def estimate(db: Session, req: schemas.EstimateRequest) -> schemas.EstimateResult:
    notes: list[str] = []
    item_results: list[schemas.EstimateItemResult] = []
    production_cost = Decimal(0)

    for item in req.items:
        bd = estimate_item(db, item)
        production_cost += bd.total_cost
        item_results.append(schemas.EstimateItemResult(**item.model_dump(), breakdown=bd))

    production_cost = _money(production_cost)

    margin_pct = _margin_pct(db, production_cost)
    margin_amount = _money(production_cost * margin_pct / HUNDRED)
    subtotal = production_cost + margin_amount

    gst_pct = _gst_pct(db, req.category)
    gst_amount = _money(subtotal * gst_pct / HUNDRED)
    grand_total = _money(subtotal + gst_amount)

    if margin_pct == 0:
        notes.append("No matching margin band — margin set to 0%. Check margin_rules.")
    if gst_pct == 0:
        notes.append("No matching GST rule — GST set to 0%. Check gst_rules.")

    return schemas.EstimateResult(
        items=item_results,
        production_cost=production_cost,
        margin_percentage=margin_pct,
        margin_amount=margin_amount,
        gst_percentage=gst_pct,
        gst_amount=gst_amount,
        grand_total=grand_total,
        notes=notes,
    )
