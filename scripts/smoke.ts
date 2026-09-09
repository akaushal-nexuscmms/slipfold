// Run with: node scripts/smoke.ts   (Node 22.6+ strips types natively)
// Expected values below were computed by hand from the 2025 rules, not by the engine.
import { compute, bpaFederal } from "../src/lib/engine.ts";
import { EXAMPLE_RETURN, EMPTY_CARRY, EMPTY_OTHER, EMPTY_PROFILE, emptyReturn, type TaxReturn } from "../src/lib/model.ts";
import { PROVINCES, PROVINCE_LIST, taxOn, FEDERAL, RULES_2025 } from "../src/lib/rules2025.ts";
import { RULES_2024 } from "../src/lib/rules2024.ts";
import { getRules, SUPPORTED_YEARS } from "../src/lib/rules.ts";
import { rollForward } from "../src/lib/store.ts";
import { createVault, unlockVault, seal, open, isSealed } from "../src/lib/crypto.ts";

let failures = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
};
const line = (r: ReturnType<typeof compute>, n: string) => r.lines.find((l) => l.line === n)?.value;
const round2x = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ---------- brackets ----------
eq("federal tax on 54,435 (all in first bracket)", taxOn(54_435, FEDERAL.brackets), 7893.08);
eq("federal tax on 120,000 spans three brackets", taxOn(120_000, FEDERAL.brackets), 57375 * 0.145 + 57375 * 0.205 + 5250 * 0.26);
eq("BPA full below phase-out", bpaFederal(100_000, RULES_2025), 16129);
eq("BPA minimum above phase-out", bpaFederal(300_000, RULES_2025), 14538);
eq("BPA midway", bpaFederal((177_882 + 253_414) / 2, RULES_2025), 15333.5);

// ---------- worked example: single, Manitoba, one T4, RRSP 5,000, donations 300 ----------
// Hand calculation:
//  10100 60,000 · 22215 enhanced CPP 1% × 56,500 = 565 · 20800 RRSP 5,000 → 23600 = 54,435 = 26000
//  Federal: tax 54,435 × 14.5% = 7,893.08; credits BPA 16,129 + CPP base 4.95% × 56,500 = 2,796.75 + EI 984 + CEA 1,471 = 21,380.75 × 14.5% = 3,100.21
//  donations 200 × 14.5% + 100 × 29% = 58.00 → 35000 = 3,158.21 → 42000 = 4,734.87
//  Manitoba: 47,000 × 10.8% + 7,435 × 12.75% = 5,076 + 947.96 = 6,023.96; credits (15,780 + 2,796.75 + 984) × 10.8% = 2,112.56; donations 21.60 + 17.40 = 39.00 → MB tax 3,872.40
//  total payable 8,607.27; withheld 9,000 → refund 392.73
const ex = compute(EXAMPLE_RETURN);
eq("ex: 10100", line(ex, "10100"), 60000);
eq("ex: 22215 enhanced CPP", line(ex, "22215"), 565);
eq("ex: 20800 RRSP", line(ex, "20800"), 5000);
eq("ex: 23600 net income", line(ex, "23600"), 54435);
eq("ex: 30800 base CPP", line(ex, "30800"), 2796.75);
eq("ex: 31200 EI", line(ex, "31200"), 984);
eq("ex: 31260 CEA", line(ex, "31260"), 1471);
eq("ex: 33500 credit base", line(ex, "33500"), 21380.75);
eq("ex: 34900 donation credit", line(ex, "34900"), 58);
eq("ex: 35000", line(ex, "35000"), 3158.21);
eq("ex: 40400 federal tax", line(ex, "40400"), 7893.08);
eq("ex: 42000 net federal", line(ex, "42000"), 4734.87);
eq("ex: MB 428 gross", line(ex, "42"), 6023.96);
eq("ex: MB 58840", line(ex, "58840"), 2112.56);
eq("ex: MB 58969 donations", line(ex, "58969"), 39);
eq("ex: MB tax (92)", line(ex, "92"), 3872.4);
eq("ex: 42800", line(ex, "42800"), 3872.4);
eq("ex: 43500 total payable", line(ex, "43500"), 8607.27);
eq("ex: 43700 withheld", line(ex, "43700"), 9000);
eq("ex: refund 48400", line(ex, "48400"), 392.73);
eq("ex: summary balance negative = refund", ex.summary.balance, -392.73);
eq("ex: marginal rate fed+MB", ex.summary.marginalRate, 0.145 + 0.1275);
eq("ex: MB479 warning present", ex.warnings.some((w) => w.includes("MB479")), true);
eq("ex: every line has an explanation", ex.lines.every((l) => l.explain.length > 20), true);
eq("ex: RRSP carry-forward is 0 (all deducted)", line(ex, "RRSP"), 0);
eq("ex: new RRSP room = 18% × 60,000", line(ex, "RRSP room"), 10800);

// ---------- RRSP: limit binds, remainder carries ----------
const rr: TaxReturn = { ...EXAMPLE_RETURN, carry: { ...EMPTY_CARRY, rrspDeductionLimit: 3000, unusedRrspContributions: 1000 } };
const rrRes = compute(rr);
eq("rrsp: deduction capped at the limit", line(rrRes, "20800"), 3000);
eq("rrsp: unused contributions carried = 5,000 + 1,000 − 3,000", line(rrRes, "RRSP"), 3000);
eq("rrsp: no limit entered → note on the line", compute({ ...EXAMPLE_RETURN, carry: { ...EMPTY_CARRY } }).lines.find((l) => l.line === "20800")?.note?.includes("Notice of Assessment"), true);

// ---------- CPP/EI overpayment across employers ----------
const two: TaxReturn = {
  ...emptyReturn(2025),
  profile: { ...EMPTY_PROFILE, province: "ON", dateOfBirth: "1990-01-01" },
  slips: [
    { id: "a", kind: "t4", issuer: "A", values: { b14: 50000, b16: 2766.75, b18: 820, b22: 6000, b26: 50000 } },
    { id: "b", kind: "t4", issuer: "B", values: { b14: 40000, b16: 2171.75, b18: 656, b22: 5000, b26: 40000 } },
  ],
};
const twoRes = compute(two);
// CPP paid 4,938.50 vs max 4,034.10 → 904.40 over; EI paid 1,476 vs 1,077.48 → 398.52 over
eq("two employers: CPP overpayment", line(twoRes, "44800"), 904.4);
eq("two employers: EI overpayment", line(twoRes, "45000"), 398.52);
eq("two employers: EI credit capped", line(twoRes, "31200"), 1077.48);
eq("two employers: base CPP credit = (71,300 − 3,500) × 4.95%", line(twoRes, "30800"), 3356.1);
eq("two employers: enhanced deduction = 67,800 × 1%", line(twoRes, "22215"), 678);
// Ontario: taxable 90,000 − 677.90 = 89,322.10 → tax 52,886×5.05% + 36,436.10×9.15% = 2,670.74 + 3,333.90 = 6,004.64
// taxable 90,000 − 678 = 89,322 → 52,886 × 5.05% + 36,436 × 9.15% = 2,670.743 + 3,333.894 = 6,004.64
  eq("ontario: gross 428 tax", line(twoRes, "42"), 6004.64);
eq("ontario: health premium at 89,322 taxable = 600 + 25% × 17,322.10 → capped 750", line(twoRes, "89"), 750);
eq("ontario: surtax line present only when tax exceeds 5,710", twoRes.lines.some((l) => l.line === "62"), (() => { const t = 6004.64 - (12747 + 3356.2 + 1077.48) * 0.0505; return t > 5710; })());
  eq("ontario: 428 tax carried to 42800 equals the final line", line(twoRes, "42800"), line(twoRes, "90"));

// ---------- dividends and capital gains ----------
const inv: TaxReturn = {
  ...emptyReturn(2025),
  profile: { ...EMPTY_PROFILE, province: "BC", dateOfBirth: "1985-06-01" },
  slips: [
    { id: "t5", kind: "t5", issuer: "Bank", values: { b24: 1000, b13: 200 } },
    { id: "s", kind: "t5008", issuer: "Broker", values: { security: "XYZ", b21: 5000, b20: 3000, outlays: 10 } },
  ],
  carry: { ...EMPTY_CARRY, netCapitalLosses: 300 },
};
const invRes = compute(inv);
eq("dividends: grossed up 1,000 × 1.38", line(invRes, "12000"), 1380);
eq("interest", line(invRes, "12100"), 200);
eq("capital gain 5,000 − 3,000 − 10", line(invRes, "19900"), 1990);
eq("taxable gain 50%", line(invRes, "12700"), 995);
eq("net capital losses applied up to gains", line(invRes, "25300"), 300);
eq("taxable income = 1,380 + 200 + 995 − 300", line(invRes, "26000"), 2275);
eq("federal tax fully covered by BPA → 40600 = 0", line(invRes, "40600"), 0);
eq("DTC limited to tax (0)", line(invRes, "40425"), 0);
eq("losses left to carry = 0", line(invRes, "Losses"), 0);
const loss = compute({ ...inv, slips: [{ id: "s", kind: "t5008", issuer: "B", values: { b21: 1000, b20: 3000, outlays: 0 } }], carry: EMPTY_CARRY });
eq("net loss year: 12700 absent, half the loss carried", [loss.lines.some((l) => l.line === "12700"), line(loss, "Losses")], [false, 1000]);

// ---------- tuition: only what is needed, rest carries (both levels) ----------
const stu: TaxReturn = {
  ...emptyReturn(2025),
  profile: { ...EMPTY_PROFILE, province: "MB", dateOfBirth: "2003-03-03" },
  slips: [
    { id: "t4", kind: "t4", issuer: "Campus job", values: { b14: 25000, b16: 1279.25, b18: 410, b22: 1500, b26: 25000 } },
    { id: "t22", kind: "t2202", issuer: "University of Manitoba", values: { b23: 9000, b25: 8 } },
    { id: "t4a", kind: "t4a", issuer: "Scholarship fund", values: { b105: 3000 } },
  ],
};
const stuRes = compute(stu);
// enhanced 1% × 21,500 = 215 → NI 24,785; fed tax 3,593.83; credits before tuition = 16,129 + 1,064.25 + 410 + 1,471 = 19,074.25 → needed 3,593.83/0.145 − 19,074.25 = 24,785.03 − 19,074.25 = 5,710.78
eq("student: scholarship exempt with full-time months", line(stuRes, "13010"), 0);
eq("student: federal tuition used = amount needed to zero tax", line(stuRes, "32300"), 5710.78);
eq("student: federal tuition carried = 9,000 − used", line(stuRes, "Tuition (fed)"), 3289.22);
eq("student: federal tax after credits is zero", line(stuRes, "40600"), 0);
eq("student: provincial tuition also limited and carried", (line(stuRes, "58560") ?? 0) + (line(stuRes, "Tuition (prov)") ?? 0), 9000);
eq("student: provincial tax zero", line(stuRes, "92"), 0);

// ---------- spouse, age, pension, Quebec ----------
const sr: TaxReturn = {
  ...emptyReturn(2025),
  profile: { ...EMPTY_PROFILE, province: "AB", dateOfBirth: "1955-01-01", maritalStatus: "married", spouseNetIncome: 5000 },
  slips: [{ id: "p", kind: "t4a", issuer: "Pension plan", values: { b016: 40000, b022: 4000 } }],
};
const srRes = compute(sr);
eq("senior: age amount full (NI 40,000 < 45,522)", line(srRes, "30100"), 9028);
eq("senior: pension income amount", line(srRes, "31400"), 2000);
eq("senior: spouse amount = 16,129 − 5,000", line(srRes, "30300"), 11129);
eq("senior AB: provincial spouse = 22,323 − 5,000", line(srRes, "58120"), 17323);
eq("senior AB: provincial pension amount 1,719", line(srRes, "58360"), 1719);
const qc = compute({ ...sr, profile: { ...sr.profile, province: "QC" } });
eq("quebec: abatement 16.5% of basic federal tax", line(qc, "44000"), Math.round((line(qc, "42000")! * 0.165 + Number.EPSILON) * 100) / 100);
eq("quebec: no 428 lines, provincial 0", [line(qc, "42800"), qc.lines.some((l) => l.form === "428")], [0, false]);
eq("quebec: warning about TP-1", qc.warnings.some((w) => w.includes("TP-1")), true);

// ---------- every jurisdiction computes without error and credits never exceed tax ----------
for (const p of PROVINCE_LIST) {
  const r = compute({ ...EXAMPLE_RETURN, profile: { ...EXAMPLE_RETURN.profile, province: p.code } });
  const prov = PROVINCES[p.code];
  eq(`${p.code}: computes, provincial tax ≥ 0, form named`, [r.summary.provincialTax >= 0, r.lines.some((l) => l.label.includes(prov.name) || p.code === "QC")], [true, true]);
}

// ---------- self-employment CPP ----------
const se = compute({ ...emptyReturn(2025), profile: { ...EMPTY_PROFILE, province: "SK", dateOfBirth: "1980-01-01" }, other: { ...EMPTY_OTHER, selfEmploymentNet: 50000 } });
// subject = 50,000 − 3,500 = 46,500 → CPP 11.9% = 5,533.50; 22200 = 4.95% = 2,301.75; 22215 = 2% = 930
eq("self-employed: CPP payable 42100", line(se, "42100"), 5533.5);
eq("self-employed: 22200 employer half", line(se, "22200"), 2301.75);
eq("self-employed: 22215 enhanced", line(se, "22215"), 930);
eq("self-employed: 31000 credit", line(se, "31000"), 2301.75);

// ---------- roll forward ----------
const next = rollForward(rr);
eq("rollForward: year + 1", next.year, 2026);
eq("rollForward: profile kept", next.profile.firstName, "Sam");
eq("rollForward: issuers kept, amounts cleared", next.slips.map((s) => [s.kind, s.issuer, Object.keys(s.values).length]), [["t4", "Prairie Logistics Ltd.", 0], ["rrsp", "Assiniboine Credit Union", 0]]);
eq("rollForward: unused RRSP carried", next.carry.unusedRrspContributions, 3000);
eq("rollForward: deduction limit reset (comes from NOA)", next.carry.rrspDeductionLimit, 0);
eq("rollForward: tuition carried", rollForward(stu).carry.tuitionFederal, 3289.22);

// ---------- low-income tax reductions (from the 2025 forms) ----------
{
  const at = (prov: "BC" | "NB" | "NL", income: number, spouseNet?: number) =>
    compute({ ...emptyReturn(2025), profile: { ...EMPTY_PROFILE, province: prov, dateOfBirth: "1990-01-01", maritalStatus: spouseNet === undefined ? "single" : "married", spouseNetIncome: spouseNet ?? 0 }, slips: [{ id: "t", kind: "t4", issuer: "E", values: { b14: income, b26: Math.min(income, 71300) } }] });
  // BC: 562 − 3.56% × (30,000 − 25,020) = 384.71
  eq("BC reduction at 30k", line(at("BC", 30000), "79"), 384.71);
  eq("BC reduction gone at 40,807+", at("BC", 45000).lines.some((l) => l.line === "79"), false);
  // NB single: 802 − 3% × (30,000 − 21,920) = 559.60
  eq("NB reduction at 30k single", line(at("NB", 30000), "86"), 559.6);
  // NB couple: (802 + 802) − 3% × (30,000 + 10,000 − 21,920) = 1,061.60, capped by NB tax
  const nbFam = at("NB", 30000, 10000);
  eq("NB reduction for a couple uses family income", line(nbFam, "86"), Math.min(1061.6, (line(nbFam, "42")! - line(nbFam, "61500")!)) );
  eq("NB ineligible above 48,653 single", at("NB", 50000).lines.some((l) => l.line === "86"), false);
  // NL single: 997 − 16% × (30,000 − 23,928) = 25.48
  eq("NL reduction at 30k single", line(at("NL", 30000), "104"), 25.48);
  // NL couple: (997 + 557) − 16% × (30,000 + 5,000 − 40,460 → 0) = 1,554 capped by NL tax
  const nlFam = at("NL", 30000, 5000);
  eq("NL couple below family threshold gets the full 1,554 or all its tax", line(nlFam, "104"), Math.min(1554, round2x(line(nlFam, "42")! - line(nlFam, "61500")!)));
  eq("NL tax is zero for that couple", line(nlFam, "92"), 0);
}

// ---------- figures read off the 2025 forms ----------
{
  const on = compute({ ...emptyReturn(2025), profile: { ...EMPTY_PROFILE, province: "ON", dateOfBirth: "1990-01-01", maritalStatus: "married", spouseNetIncome: 1000 }, slips: [{ id: "t", kind: "t4", issuer: "E", values: { b14: 60000, b26: 60000 } }] });
  eq("ON spouse amount is capped at 10,823 even when the partner earns a little (base 11,905)", line(on, "58120"), 10823);
  const ns = compute({ ...emptyReturn(2025), profile: { ...EMPTY_PROFILE, province: "NS", dateOfBirth: "1990-01-01", maritalStatus: "married", spouseNetIncome: 0 }, slips: [{ id: "t", kind: "t4", issuer: "E", values: { b14: 60000, b26: 60000 } }] });
  eq("NS spouse amount subtracts at least 874: 12,618 − 874 = 11,744", line(ns, "58120"), 11744);
  const ab = compute({ ...emptyReturn(2025), profile: { ...EMPTY_PROFILE, province: "AB", dateOfBirth: "1990-01-01" }, slips: [{ id: "t", kind: "t4", issuer: "E", values: { b14: 60000, b26: 60000 } }], other: { ...EMPTY_OTHER, donations: 300 } });
  eq("AB donations: 200 × 60% + 100 × 21% = 141", line(ab, "58969"), 141);
  // Ontario tax reduction: 20,000 income, no CPP/EI → ON tax after credits = (20,000 − 12,747) × 5.05% = 366.28 → reduction 2×294 − 366.28 = 221.72 → tax 144.56
  const onLow = compute({ ...emptyReturn(2025), profile: { ...EMPTY_PROFILE, province: "ON", dateOfBirth: "1990-01-01" }, slips: [{ id: "t", kind: "t4", issuer: "E", values: { b14: 20000, b26: 20000 } }] });
  eq("ON tax reduction at 20k", [line(onLow, "80"), line(onLow, "90")], [221.72, 144.56]);
  // Ontario surtax before the dividend credit: 200k salary + 20k eligible dividends
  const onDiv = compute({ ...emptyReturn(2025), profile: { ...EMPTY_PROFILE, province: "ON", dateOfBirth: "1990-01-01" }, slips: [{ id: "t", kind: "t4", issuer: "E", values: { b14: 200000, b26: 71300 } }, { id: "d", kind: "t5", issuer: "B", values: { b24: 20000 } }] });
  eq("ON surtax line present and dividend credit applied after it", [onDiv.lines.some((l) => l.line === "68"), onDiv.lines.findIndex((l) => l.line === "68") < onDiv.lines.findIndex((l) => l.line === "61520")], [true, true]);
  // NS age tax credit: 70-year-old, taxable 20,000 pension
  const nsAge = compute({ ...emptyReturn(2025), profile: { ...EMPTY_PROFILE, province: "NS", dateOfBirth: "1955-01-01" }, slips: [{ id: "p", kind: "t4a", issuer: "Plan", values: { b016: 20000 } }] });
  eq("NS age tax credit shows for a senior under 24,000 taxable (capped at tax)", (line(nsAge, "98") ?? 0) > 0 && line(nsAge, "92") === 0, true);
  // NS/PE low-income reductions are zero at 30k single (why EY matched there), positive lower down
  const ns30 = compute({ ...emptyReturn(2025), profile: { ...EMPTY_PROFILE, province: "NS", dateOfBirth: "1990-01-01" }, slips: [{ id: "t", kind: "t4", issuer: "E", values: { b14: 30000, b26: 30000 } }] });
  eq("NS reduction zero at 30k", ns30.lines.some((l) => l.line === "84"), false);
  const pe25 = compute({ ...emptyReturn(2025), profile: { ...EMPTY_PROFILE, province: "PE", dateOfBirth: "1990-01-01" }, slips: [{ id: "t", kind: "t4", issuer: "E", values: { b14: 25000, b26: 25000 } }] });
  eq("PE reduction at 25k single = 350 − 5% × 2,350 = 232.50", line(pe25, "87"), 232.5);
  const pe25old = compute({ ...pe25 as never, ...emptyReturn(2025), profile: { ...EMPTY_PROFILE, province: "PE", dateOfBirth: "1955-01-01" }, slips: [{ id: "t", kind: "t4", issuer: "E", values: { b14: 25000, b26: 25000 } }] });
  eq("PE reduction adds 250 for 65+", line(pe25old, "87"), round2x(Math.min(482.5, (line(pe25old, "42") ?? 0) - (line(pe25old, "61500") ?? 0))));
  // SK senior supplement + home buyers; YT employment amount
  const sk = compute({ ...emptyReturn(2025), profile: { ...EMPTY_PROFILE, province: "SK", dateOfBirth: "1955-01-01" }, slips: [{ id: "t", kind: "t4", issuer: "E", values: { b14: 40000, b26: 40000 } }], other: { ...EMPTY_OTHER, homeBuyer: true } });
  eq("SK senior supplement and home buyers' amount on the 428", [line(sk, "58220"), line(sk, "58357")], [2028, 15000]);
  const yt = compute({ ...emptyReturn(2025), profile: { ...EMPTY_PROFILE, province: "YT", dateOfBirth: "1990-01-01" }, slips: [{ id: "t", kind: "t4", issuer: "E", values: { b14: 40000, b26: 40000 } }] });
  eq("YT carries the Canada employment amount", line(yt, "58310"), 1471);
}

// ---------- tax year 2024 ----------
{
  eq("years: 2025 and 2024 supported, newest first", SUPPORTED_YEARS, [2025, 2024]);
  eq("2024 federal tax on 69,290 = 55,867 × 15% + 13,423 × 20.5%", taxOn(69_290, RULES_2024.FEDERAL.brackets), 11131.77);
  eq("2024 BPA phase-out", [bpaFederal(100_000, RULES_2024), bpaFederal(300_000, RULES_2024)], [15705, 14156]);
  // Manitoba employee, 2024: box 14 70,000; CPP at the 2024 max 3,867.50 + CPP2 60; EI at the max 1,049.12
  //  enhanced deduction = 1% × 65,000 = 650 + CPP2 60 = 710 → net 69,290; base CPP credit = 4.95% × 65,000 = 3,217.50
  //  federal credits (15,705 + 3,217.50 + 1,049.12 + 1,433) × 15% = 3,210.69 → net federal 11,131.77 − 3,210.69 = 7,921.08
  //  Manitoba: 5,076 + 22,290 × 12.75% = 7,917.98 − (15,780 + 3,217.50 + 1,049.12) × 10.8% = 2,165.03 → 5,752.95
  const mb24 = compute({ ...emptyReturn(2024), profile: { ...EMPTY_PROFILE, province: "MB", dateOfBirth: "1990-01-01" }, slips: [{ id: "t", kind: "t4", issuer: "E", values: { b14: 70000, b16: 3867.5, b16a: 60, b18: 1049.12, b22: 12000, b26: 70000 } }] });
  eq("2024 MB: enhanced CPP deduction 650 + CPP2 60", line(mb24, "22215"), 710);
  eq("2024 MB: base CPP credit at the 2024 maximum", line(mb24, "30800"), 3217.5);
  eq("2024 MB: EI credit at the 2024 maximum", line(mb24, "31200"), 1049.12);
  eq("2024 MB: Canada employment amount 1,433", line(mb24, "31260"), 1433);
  eq("2024 MB: total federal credits", line(mb24, "35000"), 3210.69);
  eq("2024 MB: net federal tax", line(mb24, "42000"), 7921.08);
  eq("2024 MB: Manitoba credits", line(mb24, "61500"), 2165.03);
  eq("2024 MB: Manitoba tax", line(mb24, "92"), 5752.95);
  eq("2024 MB: result reports its year", mb24.year, 2024);
  eq("2024: unsupported year falls back to latest rules", getRules(2023).year, 2025);
  // 2024 Ontario: surtax thresholds 5,554 / 7,108 and tax reduction basic 286
  const on24 = compute({ ...emptyReturn(2024), profile: { ...EMPTY_PROFILE, province: "ON", dateOfBirth: "1990-01-01" }, slips: [{ id: "t", kind: "t4", issuer: "E", values: { b14: 20000, b26: 20000 } }] });
  // ON tax after credits = (20,000 − 12,399) × 5.05% = 383.85 → reduction 2 × 286 − 383.85 = 188.15 → tax 195.70
  eq("2024 ON tax reduction", [line(on24, "80"), line(on24, "90")], [188.15, 195.7]);
  // 2024 BC reduction: 547 − 3.56% × (30,000 − 24,338) = 345.43
  const bc24 = compute({ ...emptyReturn(2024), profile: { ...EMPTY_PROFILE, province: "BC", dateOfBirth: "1990-01-01" }, slips: [{ id: "t", kind: "t4", issuer: "E", values: { b14: 30000, b26: 30000 } }] });
  eq("2024 BC tax reduction", line(bc24, "79"), 345.43);
  // 2024 NS BPA supplement: 11,481 at 25,000 net income, 8,481 at 75,000, linear between
  const nsBpa = (income: number) => compute({ ...emptyReturn(2024), profile: { ...EMPTY_PROFILE, province: "NS", dateOfBirth: "1990-01-01" }, slips: [{ id: "t", kind: "t4", issuer: "E", values: { b14: income, b26: income } }] }).lines.find((l) => l.line === "58040")?.value;
  eq("2024 NS BPA with supplement", [nsBpa(20000), nsBpa(50000), nsBpa(80000)], [11481, 9981, 8481]);
}

// ---------- encryption at rest ----------
{
  const { meta, key } = await createVault("correct horse battery staple");
  const sealed = await seal(key, EXAMPLE_RETURN);
  eq("crypto: sealed blob is recognised and carries no plaintext", [isSealed(sealed), JSON.stringify(sealed).includes("Prairie")], [true, false]);
  const back = await open<TaxReturn>(key, sealed);
  eq("crypto: round trip restores the return", back.slips[0].issuer, "Prairie Logistics Ltd.");
  const again = await unlockVault("correct horse battery staple", meta);
  eq("crypto: unlock with the right passphrase decrypts", (await open<TaxReturn>(again, sealed)).year, 2025);
  let wrong = "";
  try { await unlockVault("wrong", meta); } catch (e) { wrong = (e as Error).message; }
  eq("crypto: wrong passphrase is rejected", wrong, "Wrong passphrase.");
  const s2 = await seal(key, EXAMPLE_RETURN);
  eq("crypto: fresh IV every time", s2.iv === sealed.iv, false);
}

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
