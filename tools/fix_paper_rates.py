# Fix the paper price-per-sheet bug NKK sir found (2026-07-08):
# vendor Price_Per_Sheet was computed area(sqin)*gsm*kg/1e6 (wrong) instead of the real
# weight-based price = (w*h*gsm/3100/500)*price_per_kg. The two differ by exactly 1.55x.
# Rule: only rewrite an embedded PAPER_DB row when the vendor CSV gives a SANE price/kg AND the
# stored rate matches the buggy formula (so we never touch correctly-entered special-paper per-sheet rates).
import csv, json, re, sys
HTML="paper_calculator.html"
html=open(HTML,encoding="utf-8").read()
m=re.search(r'const PAPER_DB=(\[.*?\]);',html,re.S)
db=json.loads(m.group(1))
rows=list(csv.reader(open("db/files/vendor_db/PAPER_PRICING.csv",encoding="utf-8-sig")))
h=rows[0]; ix={n:i for i,n in enumerate(h)}
def gg(r,n):
    i=ix.get(n); return r[i] if i is not None and i<len(r) else ""
csvrows=[]
for r in rows[1:]:
    if len(r)<15: continue
    sz=gg(r,'Sheet_Size_Name (in)').replace('X','*').replace('x','*')
    try:
        w,hh=[float(x) for x in sz.split('*')[:2]]; gsm=float(gg(r,'GSM'))
        ps=float(gg(r,'Price_Per_Sheet') or 0); pk=float(gg(r,'Price_Per_Kg') or 0)
    except: continue
    csvrows.append(dict(grade=gg(r,'Paper_Grade').strip(),brand=gg(r,'Brand').strip(),
                        gsm=gsm,w=w,h=hh,ps=ps,pk=pk))
def weight_kg(w,hh,gsm): return w*hh*gsm/3100/500
def buggy(w,hh,gsm,pk): return w*hh*gsm*pk/1e6
def correct(w,hh,gsm,pk): return weight_kg(w,hh,gsm)*pk
SANE=(40,400)  # plausible ₹/kg band for real paper
def samesize(a,b,c,d): return (abs(a-c)<0.7 and abs(b-d)<0.7) or (abs(a-d)<0.7 and abs(b-c)<0.7)
changed=0; skipped_special=0; kept=0; report=[]
for o in db:
    cands=[c for c in csvrows if c['grade']==o['g'] and c['gsm']==o['gsm'] and samesize(o['w'],o['h'],c['w'],c['h'])]
    # prefer the vendor row whose stored per-sheet matches this embedded rate (the exact source row)
    src=None
    for c in cands:
        if abs(c['ps']-o['r'])<0.05: src=c; break
    if not src and cands: src=cands[0]
    if not src: kept+=1; continue
    pk=src['pk']
    if not (SANE[0]<=pk<=SANE[1]):
        skipped_special+=1; continue                       # garbage per-kg → trust existing per-sheet
    exp_buggy=buggy(o['w'],o['h'],o['gsm'],pk)
    if abs(o['r']-exp_buggy) <= max(0.15, 0.03*exp_buggy):  # stored rate came from the buggy formula
        new=round(correct(o['w'],o['h'],o['gsm'],pk),2)
        if abs(new-o['r'])>0.01:
            report.append((o['t'],o['g'],o['gsm'],f"{o['w']}x{o['h']}",o['r'],new,pk))
            o['r']=new; changed+=1
    else:
        kept+=1                                             # not buggy-shaped → leave as-is
print(f"rows total {len(db)} | corrected {changed} | left (special/garbage kg) {skipped_special} | kept (not buggy) {kept}")
print("\nsample corrections (type, grade, gsm, size, OLD/sheet -> NEW/sheet, @kg):")
for t,g,gsm,sz,old,new,pk in report[:18]:
    print(f"  {t[:14]:14} {g[:20]:20} {gsm:>4.0f} {sz:>9}  {old:6.2f} -> {new:5.2f}  @₹{pk:.0f}/kg")
# assertions vs sir's number
def find(grade,gsm):
    for o in db:
        if o['g']==grade and o['gsm']==gsm and samesize(o['w'],o['h'],25,36): return o['r']
    return None
print("\nVERIFY ART PAPER 170 25x36 ->", find('ART PAPER',170), "(sir: 7.80)")
if "--write" in sys.argv:
    html2=html[:m.start(1)]+json.dumps(db,separators=(",",":"))+html[m.end(1):]
    open(HTML,"w",encoding="utf-8").write(html2)
    print("\n*** WROTE paper_calculator.html ***")
else:
    print("\n(dry run — pass --write to apply)")
