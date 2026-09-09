// Compare the engine with EY's public 2025 calculator (scripts/ey-scrape.py output).
// EY's figure is total income tax (federal + provincial) on employment income X with ONLY the
// basic personal amount — no CPP/EI credits, no Canada employment amount, no enhanced-CPP
// deduction, no Ontario health premium (established by matching Manitoba at $30,000 to the cent).
// So the engine is run with CPP/EI boxes at zero, the CEA credit is added back, and the Ontario
// health premium is removed. What this validates: every bracket table and BPA (with phase-outs).
// Usage: node scripts/crosscheck.ts <ey.json>
import { readFileSync } from "node:fs";
import { compute } from "../src/lib/engine.ts";
import { EMPTY_PROFILE, emptyReturn, type TaxReturn } from "../src/lib/model.ts";
import { CPP, FEDERAL, PROVINCES, PROVINCE_LIST, type ProvinceCode } from "../src/lib/rules2025.ts"; // EY snapshot is 2025

const ey = JSON.parse(readFileSync(process.argv[2], "utf8")) as Record<string, Record<string, { taxpay: number; marginal: string }>>;

function employee(income: number, province: ProvinceCode): TaxReturn {
  const pensionable = Math.min(income, CPP.ympe);
  return {
    ...emptyReturn(2025),
    profile: { ...EMPTY_PROFILE, province, dateOfBirth: "1990-01-01" },
    slips: [{ id: "t4", kind: "t4", issuer: "Employer", values: { b14: income, b16: 0, b16a: 0, b18: 0, b26: pensionable } }], // CPP/EI zero: EY ignores them
  };
}

let worst = 0;
const lines: string[] = [];
lines.push(`income   prov   engine      EY          diff      note`);
for (const [incomeStr, byProv] of Object.entries(ey)) {
  const income = Number(incomeStr);
  for (const p of PROVINCE_LIST) {
    const e = byProv[({ NL: "NF", YT: "YK" } as Record<string, string>)[p.code] ?? p.code]; // EY's codes for Newfoundland and Yukon
    if (!e) continue;
    const r = compute(employee(income, p.code));
    // total income tax = federal + provincial (+ Quebec: EY shows combined incl. Quebec provincial, which we do not model)
    const cea = r.lines.find((l) => l.line === "31260")?.value ?? 0;
    const provCea = r.lines.find((l) => l.line === "58310")?.value ?? 0; // Yukon mirrors the federal CEA; EY ignores it
    const ohp = r.lines.find((l) => l.line === "89")?.value ?? 0;
    const engine = Math.round((r.summary.federalTax + r.summary.provincialTax + cea * FEDERAL.creditRate + provCea * PROVINCES[p.code].creditRate - ohp) * 100) / 100;
    const diff = engine - e.taxpay;
    if (p.code !== "QC") worst = Math.max(worst, Math.abs(diff));
    const note = p.code === "QC" ? "QC provincial not modelled" : Math.abs(diff) > 5 ? "CHECK" : "";
    lines.push(`${String(income).padEnd(8)} ${p.code.padEnd(6)} ${engine.toFixed(2).padStart(10)}  ${e.taxpay.toFixed(2).padStart(10)}  ${diff.toFixed(2).padStart(9)}  ${note}`);
  }
}
console.log(lines.join("\n"));
console.log(`\nworst absolute difference outside Quebec: $${worst.toFixed(2)}`);
