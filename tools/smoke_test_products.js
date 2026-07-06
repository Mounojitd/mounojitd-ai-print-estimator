// Full-engine smoke test: load the app script under a mocked DOM, run every product type, check outputs.
const fs = require("fs");
const html = fs.readFileSync("paper_calculator.html", "utf8");
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// ---- DOM mock ----
const reg = {};
function makeEl(id) {
  const el = {
    id, _val: "", checked: false, _text: "", _html: "", disabled: false, readOnly: false,
    style: {}, dataset: {}, options: [], selectedOptions: [{ text: "" }], children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild() {}, removeChild() {}, remove() {}, insertBefore() {}, setAttribute() {},
    getAttribute() { return null; }, addEventListener() {}, removeAttribute() {},
    querySelector() { return makeEl("_q"); }, querySelectorAll() { return []; },
    getContext() { return { fillRect() {}, clearRect() {} }; },
    getBoundingClientRect() { return { width: 100, height: 100, top: 0, left: 0 }; },
    parentElement: null, previousElementSibling: null, nextElementSibling: null, firstChild: null,
    remove2() {},
  };
  Object.defineProperty(el, "value", { get() { return el._val; }, set(v) { el._val = v == null ? "" : String(v); } });
  Object.defineProperty(el, "textContent", { get() { return el._text; }, set(v) { el._text = v; } });
  Object.defineProperty(el, "innerHTML", { get() { return el._html; }, set(v) { el._html = v; } });
  el.parentElement = { querySelector() { return makeEl("_p"); } };
  return el;
}
function gid(id) { return reg[id] || (reg[id] = makeEl(id)); }
global.document = {
  getElementById: gid,
  createElement: () => makeEl("_new"),
  querySelector: () => makeEl("_qs"),
  querySelectorAll: (sel) => {
    if (sel && sel.indexOf(".ss") >= 0) {
      return ["20,30", "23,36", "25,36", "28,40", "30,40"].map((v) => ({ value: v, checked: true, classList: { add() {}, remove() {} } }));
    }
    return [];
  },
  addEventListener() {}, body: makeEl("body"), documentElement: makeEl("html"),
};
global.window = global;
global.requestAnimationFrame = (f) => { };
global.setTimeout = (f) => 0;
global.localStorage = { getItem() { return null; }, setItem() {} };
global.navigator = { userAgent: "node" };

// ---- load the app ----
try { (0, eval)(code); } catch (e) { console.log("LOAD ERROR:", e.message); process.exit(1); }
// The real UI sets bindingEdited=true via the dropdown so the chosen binding sticks. This harness sets values
// directly, so neutralise the spine auto-override — else binding-driven modes (case/b2b/wireo…) get silently
// converted to saddle/perfect and never exercise their plans.
global.autoBindingBySpine = function () {};
console.log("app loaded OK\n");

// ---- helpers ----
function set(fields) { for (const k in fields) gid(k).value = String(fields[k]); }
function setChecked(id, v) { gid(id).checked = v; }
function selOpt(id, text) { gid(id).selectedOptions = [{ text }]; }

// baseline defaults present in the real form
const BASE = {
  unit: "in", orientation: "portrait", gsm: "130", cf: "4", cb: "4",
  sigPages: "auto", workStyle: "back", colpreset: "4+4",
  lam: "none", coatArea: "all", printSrc: "anderson", coatSrc: "card",
  paperTypeSel: "", paperGrade: "__auto", paperRate: "",
  coverTypeSel: "", coverGrade: "__auto", coverGsm: "300", coverCf: "4", coverCb: "4", coverLam: "none", coverSetup: "150",
  margin: "28", overhead: "0", gst: "0", setup: "100", running: "5", finishMR: "25",
  bleed: "3", gripper: "10", sidelay: "3", backside: "3", paperTrim: "3",
  bulk: "1.0", binding: "saddle", bindingRate: "3.5", bindingMin: "500",
  coverEmb1: "none", coverEmb2: "none", coverEmb3: "none",
  // hardcase
  hcBoard: "2.5", hcBoardRate: "0.05", hcSquare: "3", hcJoint: "8", hcTurnin: "15", hcMaterial: "plc",
  hcBoardParentW: "32", hcBoardParentH: "44", hcMatRate: "0.12", hcCaseLabour: "95",
  hcEndGsm: "120", hcEndGrade: "__auto", hcEndTypeSel: "", hcEndRate: "", hcEndPrinted: "no", hcEndCf: "1", hcEndCb: "0",
  hcHeadband: "0", hcRibbon: "0", hcJacket: "no",
  // boardbook
  bbBoard: "2", bbBoardRate: "0.05", bbCore: "board", bbPaste: "2", bbAssembly: "15", bbCorner: "square", bbCornerRate: "0",
  // mech
  mbPunch: "1.5", mbElement: "", mbHang: "none", mbHangRate: "0", mbBoard: "none", mbBoardTh: "2", mbBoardRate: "0.05",
  // dieline
  dlC: "0", dlGlue: "15", dlFlap: "30", dlDie: "3500", dlCut: "350", dlGlueRate: "0.5",
  // slipcase
  scDepth: "1", scType: "hard", scTurnin: "15", scBoard: "2.5", scBoardRate: "0.05", scBoardParentW: "32", scBoardParentH: "44", scInsideRate: "0.02", scMaking: "20",
};

const TESTS = [
  // signature
  { name: "Book / Booklet", f: { product: "booklet", W: "8.5", H: "10.75", pages: "80", copies: "1000", coverType: "separate" } },
  { name: "Catalogue", f: { product: "catalogue", W: "8.5", H: "11", pages: "48", copies: "2000", coverType: "separate" } },
  { name: "Magazine", f: { product: "magazine", W: "8.5", H: "11", pages: "64", copies: "5000", coverType: "self" } },
  { name: "Manual", f: { product: "manual", W: "6", H: "9", pages: "120", copies: "500", coverType: "separate" } },
  { name: "Annual report", f: { product: "annual", W: "8.27", H: "11.69", pages: "96", copies: "1000", coverType: "separate" } },
  { name: "Brochure (multi)", f: { product: "brochure_multi", W: "8.5", H: "11", pages: "16", copies: "3000", coverType: "none" } },
  // non-signature flat
  { name: "Leaflet / Flyer", f: { product: "leaflet", W: "8.5", H: "11", copies2: "5000", extentFlat: "1" } },
  { name: "Poster", f: { product: "poster", W: "19", H: "25", copies2: "1000", extentFlat: "1" } },
  { name: "Visiting / Greeting card", f: { product: "card", W: "3.5", H: "2", copies2: "5000", extentFlat: "1" } },
  { name: "Single-sheet calendar", f: { product: "calendar_sheet", W: "15", H: "20", copies2: "2000", extentFlat: "1" } },
  { name: "Table calendar", f: { product: "calendar_table", W: "8", H: "6", copies2: "3000", extentFlat: "12" } },
  { name: "Dangler / Tent card", f: { product: "dangler", W: "5", H: "8", copies2: "4000", extentFlat: "1" } },
  { name: "Loose insert", f: { product: "insert", W: "8.5", H: "11", copies2: "10000", extentFlat: "1" } },
  // dieline / converting
  { name: "Carton (tuck-end)", f: { product: "carton_tuck", W: "3.5", H: "2", dlC: "6", dlGlue: "0.5", copies2: "2000" } },
  { name: "Sleeve / wrap", f: { product: "sleeve", W: "4", H: "2", dlC: "5", dlGlue: "0.5", copies2: "3000" } },
  { name: "Presentation folder", f: { product: "folder", W: "9", H: "12", dlC: "0.3", dlGlue: "0.5", dlFlap: "3", copies2: "1000" } },
  { name: "Envelope", f: { product: "envelope", W: "9", H: "4", dlC: "0", dlGlue: "0.5", dlFlap: "1.5", copies2: "5000" } },
  { name: "Envelope (gusseted)", f: { product: "envelope", W: "9", H: "4", dlC: "1", dlGlue: "0.5", dlFlap: "1.5", copies2: "5000" } },
  { name: "Mono carton (seal-end)", f: { product: "carton_seal", W: "3.5", H: "2", dlC: "6", dlGlue: "0.5", copies2: "2000" } },
  // case / packaging
  { name: "Slipcase (book sleeve)", f: { product: "slipcase", W: "8.5", H: "11", scDepth: "1", copies2: "1000" } },
  // binding-driven modes (signature base)
  { name: "Hard case book", f: { product: "booklet", W: "8.5", H: "10.75", pages: "200", copies: "1000", coverType: "separate", binding: "case" } },
  { name: "Board book (b2b)", f: { product: "booklet", W: "7", H: "7", pages: "24", copies: "2000", coverType: "self", binding: "b2b" } },
  { name: "Wire-O notebook", f: { product: "booklet", W: "8.5", H: "11", pages: "120", copies: "1000", coverType: "separate", binding: "wireo" } },
  { name: "Spiral", f: { product: "booklet", W: "8.5", H: "11", pages: "100", copies: "800", coverType: "separate", binding: "spiral" } },
  { name: "Perfect bound", f: { product: "booklet", W: "6", H: "9", pages: "160", copies: "2000", coverType: "separate", binding: "perfect" } },
];

let pass = 0, fail = 0;
for (const t of TESTS) {
  // reset selects/checks each time
  for (const k in BASE) { const el = gid(k); el.value = BASE[k]; }
  setChecked("rotate", true); setChecked("trimmed", true); setChecked("separateCover", t.f.coverType === "separate"); setChecked("forceBinding", true);
  set(t.f);
  // keep binding rate sane for the chosen binding
  selOpt("binding", gid("binding").value);
  try {
    global.RESULT = null; global.CHOSEN = null; global.LASTINP = null;
    gid("m_price")._html = ""; gid("err")._text = "";
    if (typeof run === "function") run();
    const panel = gid("m_price")._html, errMsg = gid("err")._text;
    const blocked = /No selected sheet|Please enter|Tick at least|Enter paper/i.test(panel) || errMsg;
    const m = panel.match(/GRAND TOTAL[\s\S]{0,160}?₹([\d,]+)/);
    const grand = m ? Number(m[1].replace(/,/g, "")) : null;
    const ok = panel.length > 200 && !blocked && grand != null && grand > 0;
    if (ok) { pass++; console.log("PASS  " + t.name.padEnd(26) + " grand ₹" + grand.toLocaleString("en-IN")); }
    else { fail++; console.log("FAIL  " + t.name.padEnd(26) + " panelLen=" + panel.length + " grand=" + grand + (errMsg ? " err='" + errMsg + "'" : "") + (blocked && !errMsg ? " [blocked]" : "")); }
  } catch (e) {
    fail++; console.log("THROW " + t.name.padEnd(26) + " :: " + e.message);
    if (fail === 1) console.log(e.stack.split("\n").slice(0, 4).join("\n"));
  }
}
console.log("\n==== " + pass + " passed, " + fail + " failed of " + TESTS.length + " ====");

// ---- digital press check (standard + special paper) ----
console.log("\n---- digital press (flat ₹/sheet) ----");
function digTest(label, fields, special) {
  for (const k in BASE) gid(k).value = BASE[k];
  setChecked("rotate", true); setChecked("trimmed", true);
  set(fields);
  gid("m_price")._html = "";
  if (special) { gid("paperTypeSel").value = "Special Paper"; }
  try {
    run();
    if (typeof setMachineMode === "function") setMachineMode("manual");
    if (typeof selectMachine === "function") selectMachine("Ricoh Pro C9500");
    run();
    const panel = gid("m_price")._html;
    const dm = panel.match(/Printing — digital \(₹(\d+)\/sheet/);
    console.log((dm ? "PASS " : "FAIL ") + label.padEnd(28) + (dm ? "digital ₹" + dm[1] + "/sheet applied" : "digital rate NOT shown"));
  } catch (e) { console.log("THROW " + label + " :: " + e.message); }
}
digTest("Card on digital (standard)", { product: "card", W: "3.5", H: "2", copies2: "2000", gsm: "300" }, false);
digTest("Card on digital (special)", { product: "card", W: "3.5", H: "2", copies2: "2000", gsm: "300" }, true);

