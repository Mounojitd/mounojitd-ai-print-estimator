# Logic Checklist — for NKK sir to review (tick ✓ correct / ✗ wrong)

For every ✗, please write the correct formula/number next to it. I'll fix and re-verify the same day.
Last updated: 2026-06-18 · Live app: https://mounojitd.github.io/mounojitd-ai-print-estimator/

---

## A. Paper / sheet calculation
| # | Column | Formula the app uses | ✓ / ✗ | Sir's correction |
|---|---|---|---|---|
| A1 | Open size | portrait → 2×width ; landscape → 2×height | ☐ | |
| A2 | Open size with bleed | open size + bleed both sides | ☐ | |
| A3 | Form (pp) | largest standard fold ≤ 4×ups, from {4,8,12,16,24,32} | ☐ | |
| A4 | Forms / book | ⌈ text pages ÷ form ⌉ | ☐ | |
| A5 | Gang / sheet | floor( 4×ups ÷ form ), capped to forms/book | ☐ | |
| A6 | Layouts | ⌈ forms ÷ gang ⌉ | ☐ | |
| A7 | Good sheets | layouts × copies | ☐ | |
| A8 | Running waste | formes × copies × running% (formes = layouts × sides) | ☐ | |
| A9 | Make-ready | layouts × make-ready sheets/forme | ☐ | |
| A10 | **Total sheets** | good + running + make-ready | ☐ | |
| A11 | Reams | total ÷ 500 | ☐ | |
| A12 | Weight / sheet | sheet m² × gsm ÷ 1000 | ☐ | |
| A13 | Waste % | 100 − (form pp × spread area) ÷ (4 × sheet area) | ☐ | |

## B. Cut sheet (on press) + parent buying
| # | Item | Formula the app uses | ✓ / ✗ | Sir's correction |
|---|---|---|---|---|
| B1 | Cut sheet (on press) | **required imaged size** (cols×cell + gripper/side-lay/trim), capped to press | ☐ | |
| B2 | Cuts per parent | floor(parent ÷ cut), best of both orientations | ☐ | |
| B3 | Parents to buy | ⌈ cut sheets ÷ cuts-per-parent ⌉ | ☐ | |
| B4 | Paper cost & weight | on the **parent** sheet | ☐ | |
| B5 | When to cut | cut only if a cheaper press needs it; else print whole | ☐ | |

## C. Machine selection
| # | Item | Logic the app uses | ✓ / ✗ | Sir's correction |
|---|---|---|---|---|
| C1 | Auto press | cheapest total route (paper+print+plates), whole or cut | ☐ | |
| C2 | Digital | excluded from Auto (click-rate pending); manual only | ☐ | |
| C3 | Band | big if max ≥ 34×22 in, else small | ☐ | |

## D. Pricing
| # | Line | Formula the app uses | ✓ / ✗ | Sir's correction |
|---|---|---|---|---|
| D1 | Paper | parent sheets × ₹/sheet | ☐ | |
| D2 | Printing | per forme: ⌈total÷layouts⌉ sheets × lot / per-1000 tier | ☐ | |
| D3 | Plates | (cf+cb) × layouts × plate rate (digital = 0) | ☐ | |
| D4 | Coating | rate/100 sq.in × sheets, min lot | ☐ | |
| D5 | Embellishment (×3) | rate/100 sq.in × cover sheets, min lot | ☐ | |
| D6 | Binding | ₹/book × copies, min | ☐ | |
| D7 | Finishing make-ready | (ops) × 10–50 sheets × parent rate | ☐ | |
| D8 | Packing | ⌈kg ÷ 15⌉ × ₹35 | ☐ | |
| D9 | Freight | ₹8/kg (min ₹300) | ☐ | |
| D10 | Overhead | 12% of (paper+print+plates+coating+binding+packing+freight) | ☐ | |
| D11 | Margin | 28% of production | ☐ | |
| D12 | GST | 18% (CGST 9 + SGST 9 / IGST 18) | ☐ | |

## E. Binding / spine
| # | Item | Rule the app uses | ✓ / ✗ | Sir's correction |
|---|---|---|---|---|
| E1 | Spine thickness | (pages ÷ 2) × gsm × bulk ÷ 1000 mm | ☐ | |
| E2 | ≤ 2.5 mm | recommend Saddle stitch | ☐ | |
| E3 | > 3 mm | warn → Section sewn / Perfect | ☐ | |
| E4 | > 4.5 mm | block Saddle (Force to override) | ☐ | |
| E5 | Binding rates | saddle 3.5 · side 4 · section-sewn 4.32 · sewn+perfect 6.75 · perfect 9 · hardcase 95 | ☐ | |

## F. Still pending sir's data (can't finish until provided)
| # | Item | What I need from sir |
|---|---|---|
| F1 | Wastage % schedule | which quantity → 15% vs 25% vs 5% |
| F2 | Grain direction | the grain-compatibility rule |
| F3 | 24pp / 32pp forms | hand-drawn fold patterns (8/12/16 already match) |
| F4 | Digital ₹/click card | the click-rate table per digital press |
| F5 | Printing/impression tiers | confirm the rate tables |
