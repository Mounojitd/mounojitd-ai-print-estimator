"""Natural-language → quote. The "AI inside" layer.

You type the job the way NKK sir described ("just say a few things") and Claude
parses it into a typed JobSpec via structured output; the deterministic engine
(rates.py + auto_estimate.py) then computes the real number from your master
data. Claude reads intent — it never invents prices.

    python -m app.services.nl_estimate "10,000 A4 brochures, 170gsm art, 4+4, matte lamination"

Requires:  pip install anthropic   and   ANTHROPIC_API_KEY in the environment.

Design (per the claude-api skill):
  * model claude-opus-4-8
  * structured output via client.messages.parse(output_format=JobSpec)
  * the master-data reference lives in a prompt-cached system prompt
  * the NL→spec step (parse_job) is separate from the spec→quote step
    (spec_to_estimate), so the mapping is unit-testable WITHOUT an API key.
"""
from __future__ import annotations

import re
import sys
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from .auto_estimate import auto_quote
from .estimate_engine import print_estimate
from .rates import RateBook
from .types import Estimate, Finishing, Size

MODEL = "claude-opus-4-8"

# Standard finished sizes (mm, width × height portrait).
STANDARD_SIZES: dict[str, Size] = {
    "A3": Size(Decimal("297"), Decimal("420")),
    "A4": Size(Decimal("210"), Decimal("297")),
    "A5": Size(Decimal("148"), Decimal("210")),
    "A6": Size(Decimal("105"), Decimal("148")),
    "DL": Size(Decimal("99"), Decimal("210")),
    "LETTER": Size(Decimal("216"), Decimal("279")),
    "LEGAL": Size(Decimal("216"), Decimal("356")),
}

# Placeholder finishing rates (your data's lamination unit is ambiguous —
# see rates.py). basis/rate/min are tunable; surfaced in the quote notes.
FINISHING_RATES = {
    ("lamination", "matt"): ("per_sheet", Decimal("4.00"), Decimal("500")),
    ("lamination", "gloss"): ("per_sheet", Decimal("3.50"), Decimal("500")),
    ("uv", "spot"): ("per_sheet", Decimal("1.50"), Decimal("500")),
    ("uv", "full"): ("per_sheet", Decimal("1.00"), Decimal("400")),
    ("foiling", "any"): ("per_sheet", Decimal("2.00"), Decimal("600")),
    ("embossing", "any"): ("per_sheet", Decimal("1.60"), Decimal("500")),
}


# ---------------------------------------------------------------- schema
class FinishingSpec(BaseModel):
    name: str = Field(description="Human label, e.g. 'Matt lamination'")
    kind: Literal["lamination", "uv", "foiling", "embossing", "die_cutting", "binding"]
    variant: str = Field(default="any", description="matt|gloss|spot|full|any")


class JobSpec(BaseModel):
    """Structured print job extracted from a free-text request."""
    product: str = Field(description="Short product description echoing the request")
    category: Literal["book", "brochure", "cards", "packaging", "printing_service", "default"]
    quantity: int = Field(gt=0)
    size_name: Literal["A3", "A4", "A5", "A6", "DL", "LETTER", "LEGAL", "CUSTOM"]
    page_width_mm: float | None = Field(default=None, description="Only if size_name=CUSTOM")
    page_height_mm: float | None = Field(default=None, description="Only if size_name=CUSTOM")
    gsm: int = Field(gt=0)
    paper_grade: str = Field(description="Grade keyword to match in the paper master, e.g. 'ART PAPER', 'MAPLITHO', 'ART BOARD'")
    colours_front: int = Field(ge=0, le=6, description="Ink colours on front (4 = full colour / CMYK)")
    colours_back: int = Field(ge=0, le=6, description="Ink colours on back (0 = single sided)")
    finishing: list[FinishingSpec] = Field(default_factory=list)
    inter_state: bool = Field(default=False, description="True if delivery is to another state (IGST)")


# ---------------------------------------------------------------- system prompt
def build_system_prompt(rb: RateBook) -> list[dict]:
    """Master-data reference for the parser, as a prompt-cached system block."""
    machines = ", ".join(
        f"{m.machine} ({int(m.max_sheet.w/Decimal('25.4'))}×{int(m.max_sheet.h/Decimal('25.4'))}in, "
        f"{m.colours}col)" for m in rb.machines()
    )
    grades = sorted({p.description.split("(")[0].strip().upper() for p in rb.papers()})
    grade_list = ", ".join(g for g in grades if g)[:1500]

    text = f"""You convert a printer's plain-English job request into a structured JobSpec.

This is a Kolkata offset print shop. Use ONLY the schema fields. Rules:
- quantity: the finished piece count the client wants.
- size_name: pick the standard size named or implied; use CUSTOM only if given explicit dimensions, then fill page_width_mm/page_height_mm.
- "4+4" / "4 colour both sides" → colours_front=4, colours_back=4. "4+0" or "single side" → back=0. "1 colour"/"black only" → 1.
- paper_grade: output the grade KEYWORD that appears in the paper master so it can be matched. Available grade keywords include: {grade_list}.
  Map common terms: "art paper"→"ART PAPER", "matt art"→"ART PAPER(MATT)", "art card"/"art board"→"ART BOARD", "maplitho"/"natural shade"→"MAPLITHO", "sbs"→"SBS", "fbb"→"FBB".
- category drives GST: a book→book; brochure/leaflet/flyer/catalogue→brochure; visiting/business cards→cards; carton/box→packaging; pure job-work→printing_service.
- finishing: list each post-press op (lamination matt/gloss, spot/full UV, foiling, embossing, die cutting, binding) with kind + variant.
- inter_state: only true if the request clearly says another state / outstation.

Machines available (for context, you do not pick one): {machines}.
Do not guess prices — only extract the specification."""

    return [{"type": "text", "text": text, "cache_control": {"type": "ephemeral"}}]


# ---------------------------------------------------------------- NL → spec
def parse_job(nl_text: str, rb: RateBook, client=None) -> JobSpec:
    """Call Claude to turn free text into a validated JobSpec."""
    import anthropic

    client = client or anthropic.Anthropic()
    resp = client.messages.parse(
        model=MODEL,
        max_tokens=2048,
        system=build_system_prompt(rb),
        messages=[{"role": "user", "content": nl_text}],
        output_format=JobSpec,
    )
    return resp.parsed_output


# ---------------------------------------------------------------- rule-based fallback
_SIZES = ["A3", "A4", "A5", "A6", "DL", "LETTER", "LEGAL"]
_GRADES = [
    ("art board", "ART BOARD"), ("art card", "ART BOARD"),
    ("matt art", "ART PAPER(MATT)"), ("matte art", "ART PAPER(MATT)"),
    ("art paper", "ART PAPER"), ("art", "ART PAPER"),
    ("maplitho", "MAPLITHO"), ("natural shade", "MAPLITHO"),
    ("sbs", "SBS"), ("fbb", "FBB"),
]


def heuristic_spec(text: str) -> JobSpec:
    """Parse a job from free text using rules — no LLM, no API key needed."""
    t = " " + text.lower() + " "

    gsm = 170
    m = re.search(r"(\d{2,3})\s*gsm", t)
    if m:
        gsm = int(m.group(1))

    cf, cb = 4, 4
    m = re.search(r"(\d)\s*\+\s*(\d)", t)
    if m:
        cf, cb = int(m.group(1)), int(m.group(2))
    elif re.search(r"single\s*side|one\s*side|front\s*only", t):
        cb = 0
    elif re.search(r"\b1\s*colou?r|black\s*only|single\s*colou?r", t):
        cf, cb = 1, 0

    # quantity: strip gsm + colour tokens, take the first plausible number
    cleaned = re.sub(r"\d{2,3}\s*gsm", " ", t)
    cleaned = re.sub(r"\d\s*\+\s*\d", " ", cleaned)
    qty = 1000
    for mm in re.finditer(r"(\d[\d,]*)\s*(k)?\b", cleaned):
        raw = mm.group(1).replace(",", "")
        if not raw.isdigit():
            continue
        val = int(raw) * (1000 if mm.group(2) else 1)
        if val >= 50:
            qty = val
            break

    size = next((s for s in _SIZES if re.search(rf"\b{s.lower()}\b", t)), "A4")
    grade = next((g for kw, g in _GRADES if kw in t), "ART PAPER")

    fin: list[FinishingSpec] = []
    if re.search(r"mat?t?e?\s*lam", t):
        fin.append(FinishingSpec(name="Matt lamination", kind="lamination", variant="matt"))
    elif re.search(r"gloss\s*lam", t):
        fin.append(FinishingSpec(name="Gloss lamination", kind="lamination", variant="gloss"))
    elif "lamination" in t or "lam " in t:
        fin.append(FinishingSpec(name="Lamination", kind="lamination", variant="matt"))
    if "spot uv" in t:
        fin.append(FinishingSpec(name="Spot UV", kind="uv", variant="spot"))
    elif re.search(r"\buv\b", t):
        fin.append(FinishingSpec(name="Full UV", kind="uv", variant="full"))
    if "foil" in t:
        fin.append(FinishingSpec(name="Foiling", kind="foiling", variant="any"))
    if "emboss" in t:
        fin.append(FinishingSpec(name="Embossing", kind="embossing", variant="any"))

    if re.search(r"\bbook\b|\bbooks\b", t):   # 'booklet' is a brochure, not an exempt book
        category = "book"
    elif re.search(r"card|visiting", t):
        category = "cards"
    elif re.search(r"box|carton|packag", t):
        category = "packaging"
    elif re.search(r"brochure|leaflet|flyer|catalog|pamphlet|booklet", t):
        category = "brochure"
    else:
        category = "brochure"

    inter = bool(re.search(r"outstation|other\s*state|inter[\s-]*state", t))
    product = text.strip()[:80] or f"{size} {category}"

    return JobSpec(
        product=product, category=category, quantity=qty, size_name=size, gsm=gsm,
        paper_grade=grade, colours_front=cf, colours_back=cb, finishing=fin, inter_state=inter,
    )


def parse_job_best(nl_text: str, rb: RateBook, client=None) -> tuple[JobSpec, str]:
    """Parse with Claude if available (key + SDK), else the rule-based fallback.

    Returns (spec, method) where method is 'claude' or 'rules'.
    """
    try:
        return parse_job(nl_text, rb, client=client), "claude"
    except Exception:
        return heuristic_spec(nl_text), "rules"


# ---------------------------------------------------------------- spec → quote
def _page_size(spec: JobSpec) -> Size:
    if spec.size_name == "CUSTOM":
        if not (spec.page_width_mm and spec.page_height_mm):
            raise ValueError("CUSTOM size needs page_width_mm and page_height_mm")
        return Size(Decimal(str(spec.page_width_mm)), Decimal(str(spec.page_height_mm)))
    return STANDARD_SIZES[spec.size_name]


def _finishing(spec: JobSpec) -> list[Finishing]:
    out: list[Finishing] = []
    for f in spec.finishing:
        key = (f.kind, f.variant if (f.kind, f.variant) in FINISHING_RATES else "any")
        rate = FINISHING_RATES.get(key) or FINISHING_RATES.get((f.kind, "any"))
        if rate is None:
            continue  # die_cutting / binding need their own real rates — skip for now
        basis, r, mn = rate
        out.append(Finishing(name=f.name, basis=basis, rate=r, min_charge=mn))
    return out


def spec_to_estimate(spec: JobSpec, rb: RateBook | None = None) -> Estimate:
    """Deterministic: JobSpec → real data-driven Estimate. No API needed."""
    rb = rb or RateBook()
    has_lam = any(f.kind == "lamination" for f in spec.finishing)
    grade_u = spec.paper_grade.upper()
    # if laminating, use the gloss-art body (matt finish comes from the film)
    exclude = "MATT" if (has_lam and "ART PAPER" in grade_u and "MATT" not in grade_u) else None

    return auto_quote(
        product=spec.product,
        category=spec.category,
        quantity=spec.quantity,
        page=_page_size(spec),
        gsm=spec.gsm,
        grade=spec.paper_grade,
        colours_front=spec.colours_front,
        colours_back=spec.colours_back,
        finishing=_finishing(spec),
        inter_state=spec.inter_state,
        exclude_grade=exclude,
        rate_book=rb,
    )


def quote_from_text(nl_text: str, rb: RateBook | None = None, client=None) -> Estimate:
    rb = rb or RateBook()
    spec, method = parse_job_best(nl_text, rb, client=client)
    print(f"\nParsed by {method}: {spec.model_dump_json(indent=2)}")
    return spec_to_estimate(spec, rb)


def main() -> None:
    if len(sys.argv) < 2:
        print('Usage: python -m app.services.nl_estimate "<job description>"')
        sys.exit(1)
    print_estimate(quote_from_text(" ".join(sys.argv[1:])))


if __name__ == "__main__":
    main()
