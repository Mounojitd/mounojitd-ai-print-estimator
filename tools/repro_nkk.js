// Reproduce NKK sir's udyoki job to inspect internal numbers (waste doubling, cover parent, margin).
const fs = require("fs");
const html = fs.readFileSync("paper_calculator.html", "utf8");
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const reg = {};
function makeEl(id) {
  const el = { id, _val: "", checked: false, _text: "", _html: "", disabled: false, readOnly: false,
    style: {}, dataset: {}, options: [], selectedOptions: [{ text: "" }], children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild() {}, removeChild() {}, remove() {}, insertBefore() {}, setAttribute() {},
    getAttribute() { return null; }, addEventListener() {}, removeAttribute() {},
    querySelector() { return makeEl("_q"); }, querySelectorAll() { return []; },
    getContext() { return { fillRect() {}, clearRect() {} }; },
    getBoundingClientRect() { return { width: 100, height: 100, top: 0, left: 0 }; },
    parentElement: null };
  Object.defineProperty(el, "value", { get() { return el._val; }, set(v) { el._val = v == null ? "" : String(v); } });
  Object.defineProperty(el, "textContent", { get() { return el._text; }, set(v) { el._text = v; } });
  Object.defineProperty(el, "innerHTML", { get() { return el._html; }, set(v) { el._html = v; } });
  el.parentElement = { querySelector() { return makeEl("_p"); } };
  return el;
}
function gid(id) { return reg[id] || (reg[id] = makeEl(id)); }
global.document = { getElementById: gid, createElement: () => makeEl("_new"),
  querySelector: () => makeEl("_qs"),
  querySelectorAll: (sel) => (sel && sel.indexOf(".ss") >= 0)
    ? ["23,36", "25,36", "28,40"].map((v) => ({ value: v, checked: true, classList: { add() {}, remove() {} } })) : [],
  addEventListener() {}, body: makeEl("body"), documentElement: makeEl("html") };
global.window = global;
global.requestAnimationFrame = () => {}; global.setTimeout = () => 0;
global.localStorage = { getItem() { return null; }, setItem() {} };
global.navigator = { userAgent: "node" };
(0, eval)(code + "\n;globalThis.getState=function(){return {CHOSEN:CHOSEN,LASTINP:LASTINP};};");
global.autoBindingBySpine = function () {};

const BASE = {
  unit: "in", orientation: "portrait", gsm: "170", cf: "4", cb: "4",
  sigPages: "auto", workStyle: "back", colpreset: "4+4",
  lam: "none", coatArea: "all", printSrc: "anderson", coatSrc: "card",
  paperTypeSel: "Coated Paper (C2S)", paperGrade: "__auto", paperRate: "",
  coverTypeSel: "Coated Paper (C2S)", coverGrade: "__auto", coverGsm: "300", coverCf: "4", coverCb: "4", coverLam: "matt", coverSetup: "150",
  margin: "28", overhead: "0", gst: "0", setup: "100", running: "5", finishMR: "25",
  bleed: "3", gripper: "10", sidelay: "3", backside: "3", paperTrim: "3",
  bulk: "1.0", binding: "sewn_perfect", bindingRate: "6.75", bindingMin: "500",
  coverEmb1: "none", coverEmb2: "none", coverEmb3: "none",
  product: "booklet", W: "8.27", H: "11.69", pages: "40", copies: "10000", coverType: "separate",
};
for (const k in BASE) gid(k).value = BASE[k];
gid("rotate").checked = true; gid("trimmed").checked = true; gid("separateCover").checked = true; gid("forceBinding").checked = true;
gid("paperTypeSel").selectedOptions = [{ text: "Coated Paper (C2S)" }];
gid("coverTypeSel").selectedOptions = [{ text: "Coated Paper (C2S)" }];

run();
const o = getState().CHOSEN;
console.log("=== TEXT (inside) ===");
console.log("size", o.sw + "x" + o.sh, "ups", o.ups, "sig", o.sig, "layouts", o.layouts, "formsPerSheet", o.formsPerSheet);
console.log("good", o.good, "run(waste)", o.run, "make-ready", o.setupWaste, "TOTAL sheets", o.total);
console.log("formes", o.formes, "perForme", o.perForme, "paperRate", (typeof num==="function"?num("paperRate",0):"?"));
console.log("parent", o.paperSheetW + "x" + o.paperSheetH, "paperSheets(buy)", o.paperSheets, "weight", o.paperWeight, "kg");
const cp = coverPlan();
if (cp && cp.option) {
  const c = cp.option;
  console.log("\n=== COVER ===");
  console.log("press", cp.machine && cp.machine.name);
  console.log("cover sheet", c.sw + "x" + c.sh, "cutFrom", c.cutFrom, "cutTo", c.cutTo);
  console.log("parent(buy)", c.paperSheetW + "x" + c.paperSheetH, "paperSheets", c.paperSheets, "rate", c.paperRate, "weight", c.paperWeight, "kg");
}
const P = combinedPrice(), q = P.q || P;
console.log("\n=== PRICE ===");
for (const k of ["paper","printing","plates","lam","packing","freight","prod","margin","pretax","gst","grand"])
  if (q[k] != null) console.log(k, Math.round(q[k]));
const mpct = (q.margin / q.pretax) * 100;
console.log("margin as % of SALE (pretax) =", mpct.toFixed(2), "% (should equal input 28%)");
console.log("\n=== PER-LINE BREAKDOWN (text) ===");
if (P.text && P.text.explain) for (const k in P.text.explain) console.log(" ", k + ":", P.text.explain[k]);
console.log("=== PER-LINE BREAKDOWN (cover) ===");
if (P.cover && P.cover.explain) for (const k in P.cover.explain) console.log(" ", k + ":", P.cover.explain[k]);
const panel = (typeof gid === "function") ? null : null;
