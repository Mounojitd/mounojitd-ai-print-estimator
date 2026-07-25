// Bought-out routing (B4): classify each production-traveller stage as made in-house or bought-out, and for
// bought-out stages say which vendor capability is needed. Rules are DATA (data/sourcing_rules.json), first
// match wins, default in-house. This turns a job's traveller into a sourcing plan the buyer can act on.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = process.env.SOURCING_RULES || resolve(__dir, 'data', 'sourcing_rules.json');

export function loadRules() {
  const j = existsSync(RULES_PATH) ? JSON.parse(readFileSync(RULES_PATH, 'utf8')) : { rules: [] };
  return (j.rules || []).map((r) => ({ ...r, re: new RegExp(r.match, 'i') }));
}

// Classify one stage name -> { sourcing, capability }.
export function classifyStage(stageName, rules = loadRules()) {
  for (const r of rules) if (r.re.test(String(stageName || ''))) return { sourcing: r.sourcing, capability: r.capability };
  return { sourcing: 'in-house', capability: null };
}

// Build a sourcing plan for a job's stages, suggesting vendors for each bought-out stage.
// `vendorsByCapability(cap)` returns the candidate vendors for a capability (injected so this stays pure).
export function sourcingPlan(stages, vendorsByCapability, rules = loadRules()) {
  const plan = (stages || []).map((s, i) => {
    const stage = s.stage || s;
    const { sourcing, capability } = classifyStage(stage, rules);
    const out = { index: i, stage, sourcing, capability };
    if (sourcing === 'bought-out') {
      const vs = (vendorsByCapability ? vendorsByCapability(capability) : []) || [];
      out.suggestedVendors = vs.map((v) => ({ id: v.id, name: v.name, type: v.type, paymentTerms: v.paymentTerms }));
    }
    return out;
  });
  const boughtOut = plan.filter((p) => p.sourcing === 'bought-out');
  return {
    stages: plan,
    summary: { total: plan.length, inHouse: plan.length - boughtOut.length, boughtOut: boughtOut.length,
               capabilitiesNeeded: [...new Set(boughtOut.map((p) => p.capability))] },
  };
}
