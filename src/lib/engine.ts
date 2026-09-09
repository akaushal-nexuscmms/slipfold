// Computes every line of the 2025 T1 (federal) and the provincial/territorial 428 form
// from the slips and facts the user entered, and explains each one. Pure: no UI, no storage.

import { CPP, EI, FEDERAL, PROVINCES, TAX_YEAR, marginalRate, round2, taxOn, type ProvinceRules } from "./rules2025.ts";
import { num, type Slip, type TaxReturn } from "./model.ts";

export type Section = "income" | "deductions" | "taxable" | "fedCredits" | "fedTax" | "provincial" | "refund" | "carry";

export type Line = {
  /** The number printed on the form, or a form-local code for schedule lines. */
  line: string;
  form: "T1" | "S3" | "S7" | "S8" | "S11" | "S15" | "428" | "479" | "Next year";
  label: string;
  value: number;
  section: Section;
  /** What the value is and why it is what it is — written for the person typing it in. */
  explain: string;
  /** Which entered figures produced it, e.g. "T4 Prairie Logistics box 14: $60,000.00". */
  from: string[];
  /** Show even when zero. Most lines hide when they are zero to keep the list short. */
  always?: boolean;
  /** Something the app could not compute and the user must decide or verify. */
  note?: string;
};

export type Summary = {
  totalIncome: number;
  netIncome: number;
  taxableIncome: number;
  federalTax: number;
  provincialTax: number;
  totalPayable: number;
  totalCredits: number;
  balance: number; // negative = refund
  marginalRate: number;
  averageRate: number;
};

export type Result = {
  year: number;
  province: string;
  lines: Line[];
  summary: Summary;
  warnings: string[];
};

const money = (n: number) => `$${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (r: number) => `${(r * 100).toFixed(r * 100 % 1 ? 2 : 0)}%`;

function ageAtYearEnd(dob: string, year: number): number | null {
  const d = new Date(dob);
  if (!dob || Number.isNaN(d.getTime())) return null;
  const end = new Date(year, 11, 31);
  let age = end.getFullYear() - d.getFullYear();
  if (end < new Date(end.getFullYear(), d.getMonth(), d.getDate())) age--;
  return age;
}

/** Sum a box across slips of one kind, listing where each part came from. */
function sumBox(slips: Slip[], kind: Slip["kind"], key: string, boxLabel: string) {
  const parts: string[] = [];
  let total = 0;
  for (const s of slips.filter((x) => x.kind === kind)) {
    const v = num(s.values[key]);
    if (v) {
      total += v;
      parts.push(`${kind.toUpperCase()} ${s.issuer || "(no issuer)"} box ${boxLabel}: ${money(v)}`);
    }
  }
  return { total: round2(total), parts };
}

export function compute(ret: TaxReturn): Result {
  const { profile: p, slips, other: o, carry } = ret;
  const prov = PROVINCES[p.province] ?? PROVINCES.MB;
  const L: Line[] = [];
  const warnings: string[] = [];
  const push = (l: Omit<Line, "from"> & { from?: string[] }) => L.push({ from: [], ...l });
  const age = ageAtYearEnd(p.dateOfBirth, ret.year);
  const hasSpouse = p.maritalStatus === "married" || p.maritalStatus === "common-law";
  const quebec = p.province === "QC";

  // ---------------- Step 2: total income ----------------
  const t4_14 = sumBox(slips, "t4", "b14", "14");
  const employment = round2(t4_14.total);
  push({ line: "10100", form: "T1", label: "Employment income", value: employment, section: "income", always: true, from: t4_14.parts, explain: "The sum of box 14 on every T4. Enter the total, not each slip — your software or the paper form has one line for all employers." });

  if (o.otherEmploymentIncome) push({ line: "10400", form: "T1", label: "Other employment income", value: round2(o.otherEmploymentIncome), section: "income", from: [`Entered: ${money(o.otherEmploymentIncome)}`], explain: "Tips, casual earnings and other employment income that never appeared on a T4. Still counts toward the Canada employment amount." });

  const t4a_016 = sumBox(slips, "t4a", "b016", "016");
  if (t4a_016.total) push({ line: "11500", form: "T1", label: "Other pensions and superannuation", value: t4a_016.total, section: "income", from: t4a_016.parts, explain: "T4A box 016. Pension income; if you are 65 or over it also earns the pension income amount on line 31400." });

  const t4e_14 = sumBox(slips, "t4e", "b14", "14");
  if (t4e_14.total) push({ line: "11900", form: "T1", label: "Employment insurance benefits", value: t4e_14.total, section: "income", from: t4e_14.parts, explain: "T4E box 14. EI is taxable; the tax withheld on it (box 22) is counted on line 43700." });

  // dividends: use printed taxable boxes when present, otherwise gross up the actual amounts
  const eligActual = sumBox(slips, "t5", "b24", "24").total + sumBox(slips, "t3", "b49", "49").total;
  const eligTaxPrinted = sumBox(slips, "t5", "b25", "25").total + sumBox(slips, "t3", "b50", "50").total;
  const eligTaxable = round2(eligTaxPrinted || eligActual * (1 + FEDERAL.dividend.eligible.grossUp));
  const nonActual = sumBox(slips, "t5", "b10", "10").total + sumBox(slips, "t3", "b23", "23").total;
  const nonTaxPrinted = sumBox(slips, "t5", "b11", "11").total + sumBox(slips, "t3", "b32", "32").total;
  const nonTaxable = round2(nonTaxPrinted || nonActual * (1 + FEDERAL.dividend.nonEligible.grossUp));
  const dividends = round2(eligTaxable + nonTaxable);
  if (dividends) {
    push({ line: "12000", form: "T1", label: "Taxable amount of dividends (eligible and other)", value: dividends, section: "income", from: [`Eligible taxable ${money(eligTaxable)} (actual ${money(eligActual)} × 1.38)`, `Non-eligible taxable ${money(nonTaxable)} (actual ${money(nonActual)} × 1.15)`], explain: "Dividends are grossed up (38% eligible, 15% other) so the return taxes the pre-corporate-tax amount, then a dividend tax credit on line 40425 gives most of it back. Enter the grossed-up total here; the credit is computed below." });
    if (nonTaxable) push({ line: "12010", form: "T1", label: "Taxable amount of dividends other than eligible", value: nonTaxable, section: "income", from: [`Actual ${money(nonActual)} × 1.15`], explain: "The non-eligible portion of line 12000, shown separately because it gets a smaller credit." });
  }

  const interest = round2(sumBox(slips, "t5", "b13", "13").total + sumBox(slips, "t3", "b26", "26").total + num(o.otherInterest));
  if (interest) push({ line: "12100", form: "T1", label: "Interest and other investment income", value: interest, section: "income", from: [...sumBox(slips, "t5", "b13", "13").parts, ...sumBox(slips, "t3", "b26", "26").parts, ...(o.otherInterest ? [`Interest with no slip: ${money(o.otherInterest)}`] : [])], explain: "T5 box 13, T3 box 26, and any interest under $50 the bank never issued a slip for — it is still taxable." });

  // capital gains — Schedule 3
  let gains = 0;
  const gainParts: string[] = [];
  for (const s of slips.filter((x) => x.kind === "t5008")) {
    const g = round2(num(s.values.b21) - num(s.values.b20) - num(s.values.outlays));
    gains += g;
    gainParts.push(`T5008 ${s.issuer} ${s.values.security ?? ""}: ${money(num(s.values.b21))} − ACB ${money(num(s.values.b20))} − outlays ${money(num(s.values.outlays))} = ${money(g)}`);
  }
  const t3_21 = sumBox(slips, "t3", "b21", "21");
  const t5_18 = sumBox(slips, "t5", "b18", "18");
  gains = round2(gains + t3_21.total + t5_18.total);
  const taxableGains = gains > 0 ? round2(gains * FEDERAL.capitalGainsInclusion) : 0;
  if (gains !== 0) push({ line: "19900", form: "S3", label: "Total capital gains (or losses) — Schedule 3", value: gains, section: "income", from: [...gainParts, ...t3_21.parts, ...t5_18.parts], explain: "Proceeds minus adjusted cost base minus selling costs, per sale, plus capital gains distributed by funds. A net loss is not deducted from other income; it becomes a net capital loss you carry forward (see Next year)." });
  if (gains > 0) push({ line: "12700", form: "T1", label: "Taxable capital gains", value: taxableGains, section: "income", from: [`${money(gains)} × 50%`], explain: "Half of the net gain (the 50% inclusion rate; the proposed two-thirds rate was cancelled in 2025). Absent when the year is a net loss — the loss carries forward instead." });

  const t4a_other = round2(sumBox(slips, "t4a", "b018", "018").total + sumBox(slips, "t4a", "b028", "028").total + num(o.otherIncome));
  if (t4a_other) push({ line: "13000", form: "T1", label: "Other income", value: t4a_other, section: "income", from: [...sumBox(slips, "t4a", "b018", "018").parts, ...sumBox(slips, "t4a", "b028", "028").parts, ...(o.otherIncome ? [`Entered: ${money(o.otherIncome)}`] : [])], explain: "T4A boxes 018 and 028 plus anything else taxable with no line of its own." });

  const scholarships = sumBox(slips, "t4a", "b105", "105");
  const fullTimeMonths = slips.filter((s) => s.kind === "t2202").reduce((a, s) => a + num(s.values.b25), 0);
  const taxableScholar = scholarships.total ? (fullTimeMonths > 0 ? 0 : Math.max(0, round2(scholarships.total - 500))) : 0;
  if (scholarships.total) push({ line: "13010", form: "T1", label: "Taxable scholarships, bursaries and fellowships", value: taxableScholar, section: "income", from: [...scholarships.parts, fullTimeMonths > 0 ? `Full-time months on T2202: ${fullTimeMonths} → fully exempt` : "No full-time months → first $500 exempt"], explain: "Scholarships are fully exempt when you were a full-time student in the year; otherwise the first $500 is exempt." });

  const selfEmp = round2(num(o.selfEmploymentNet) + sumBox(slips, "t4a", "b020", "020").total);
  if (selfEmp) push({ line: "13500", form: "T1", label: "Net self-employment income (business, professional, commission)", value: selfEmp, section: "income", from: [`Net from your T2125: ${money(o.selfEmploymentNet)}`, ...sumBox(slips, "t4a", "b020", "020").parts], explain: "The net figure from your own T2125 (this app does not prepare the T2125 itself). Enter it on the line matching the kind of business — 13500 business, 13700 professional, 13900 commission.", note: "You must complete a T2125 for the gross and expense detail." });

  const totalIncome = round2(employment + num(o.otherEmploymentIncome) + t4a_016.total + t4e_14.total + dividends + interest + taxableGains + t4a_other + taxableScholar + selfEmp);
  push({ line: "15000", form: "T1", label: "Total income", value: totalIncome, section: "income", always: true, explain: "Every income line added up." });

  // ---------------- Step 3: net income ----------------
  const rpp = sumBox(slips, "t4", "b20", "20");
  if (rpp.total) push({ line: "20700", form: "T1", label: "Registered pension plan (RPP) deduction", value: rpp.total, section: "deductions", from: rpp.parts, explain: "T4 box 20. Payroll pension contributions come straight off income." });

  // RRSP — Schedule 7
  const rrspRemainder = sumBox(slips, "rrsp", "remainder", "Mar–Dec");
  const rrspFirst60 = sumBox(slips, "rrsp", "first60", "Jan–Mar");
  const rrspContrib = round2(rrspRemainder.total + rrspFirst60.total);
  const rrspAvailable = round2(rrspContrib + num(carry.unusedRrspContributions));
  const rrspMax = Math.max(0, Math.min(rrspAvailable, num(carry.rrspDeductionLimit)));
  const rrspDeduct = o.rrspDeductToClaim === null ? rrspMax : Math.max(0, Math.min(num(o.rrspDeductToClaim), rrspMax));
  if (rrspAvailable || carry.rrspDeductionLimit) {
    push({ line: "24500", form: "S7", label: "RRSP contributions made in the year (Schedule 7)", value: rrspContrib, section: "deductions", from: [...rrspRemainder.parts, ...rrspFirst60.parts, ...(carry.unusedRrspContributions ? [`Unused contributions from earlier years: ${money(carry.unusedRrspContributions)}`] : [])], explain: "Every receipt: March–December plus the first 60 days of the next year. All of it must be reported this year even if you deduct some later." });
    if (rrspContrib > num(carry.rrspDeductionLimit) + 2000 && carry.rrspDeductionLimit) warnings.push(`RRSP contributions (${money(rrspAvailable)}) exceed your deduction limit (${money(carry.rrspDeductionLimit)}) by more than the $2,000 cushion — over-contributions attract a 1% per month penalty (T1-OVP).`);
    push({ line: "20800", form: "T1", label: "RRSP deduction", value: rrspDeduct, section: "deductions", always: true, from: [`Available ${money(rrspAvailable)}`, `Deduction limit ${money(carry.rrspDeductionLimit)}`, o.rrspDeductToClaim === null ? "Claiming the maximum" : `You chose ${money(o.rrspDeductToClaim)}`], explain: "The smaller of what you contributed (plus unused earlier contributions) and your deduction limit from last year's Notice of Assessment. You may deduct less and carry the rest forward — worth doing if your income will be higher next year.", note: !carry.rrspDeductionLimit && rrspContrib ? "Enter your RRSP deduction limit from your 2024 Notice of Assessment on the Carry-forwards page; without it the deduction is 0." : undefined });
  }

  // FHSA — Schedule 15
  const fhsa = sumBox(slips, "fhsa", "b18", "18");
  const fhsaDeduct = Math.min(fhsa.total, num(carry.fhsaRoom));
  if (fhsa.total) push({ line: "20805", form: "T1", label: "FHSA deduction", value: round2(fhsaDeduct), section: "deductions", from: [...fhsa.parts, `Participation room ${money(carry.fhsaRoom)}`], explain: "T4FHSA box 18, up to your participation room ($8,000 a year plus up to $8,000 carried forward). Schedule 15.", note: !carry.fhsaRoom ? "Enter your FHSA participation room on the Carry-forwards page." : undefined });

  const dues = round2(sumBox(slips, "t4", "b44", "44").total + num(o.unionDuesNotOnT4));
  if (dues) push({ line: "21200", form: "T1", label: "Annual union, professional or like dues", value: dues, section: "deductions", from: [...sumBox(slips, "t4", "b44", "44").parts, ...(o.unionDuesNotOnT4 ? [`Paid directly: ${money(o.unionDuesNotOnT4)}`] : [])], explain: "T4 box 44 plus dues you paid yourself (professional licence fees count)." });
  if (o.carryingCharges) push({ line: "22100", form: "T1", label: "Carrying charges and interest expenses", value: round2(o.carryingCharges), section: "deductions", from: [`Entered: ${money(o.carryingCharges)}`], explain: "Investment counsel fees and interest on money borrowed to earn investment income. Not brokerage commissions, not RRSP fees." });

  // CPP — Schedule 8. Employment: split box 16 into base (credit) and enhanced (deduction).
  const cppPaid = sumBox(slips, "t4", "b16", "16");
  const cpp2Paid = sumBox(slips, "t4", "b16a", "16A");
  let pensionable = 0;
  for (const s of slips.filter((x) => x.kind === "t4")) pensionable += Math.min(num(s.values.b26) || num(s.values.b14), CPP.ympe);
  pensionable = Math.min(pensionable, CPP.ympe);
  // Schedule 8 Part 3: the split is computed on pensionable earnings — base 4.95%, enhanced 1% —
  // and only falls back to a proportional split of what was actually paid when the slips show less.
  const cppEarnings = Math.max(0, pensionable - CPP.basicExemption);
  const requiredBase = round2(cppEarnings * CPP.baseRate);
  const requiredEnhanced = round2(cppEarnings * CPP.enhancedRate);
  const paidEnough = cppPaid.total >= requiredBase + requiredEnhanced - 0.01;
  const cppBase = paidEnough ? requiredBase : round2(cppPaid.total * (CPP.baseRate / CPP.rate));
  const cppEnhanced = paidEnough ? requiredEnhanced : round2(cppPaid.total - cppBase);
  const cpp2Allowed = Math.min(cpp2Paid.total, CPP.cpp2Max);
  const cppOver = round2(Math.max(0, cppPaid.total - CPP.maxContribution) + Math.max(0, cpp2Paid.total - CPP.cpp2Max));

  // self-employment CPP
  let seSubject = 0;
  let seCpp = 0;
  let seCpp2 = 0;
  if (selfEmp > 0 && !quebec) {
    const room = Math.max(0, CPP.ympe - pensionable);
    const exemptionLeft = Math.max(0, CPP.basicExemption - pensionable);
    seSubject = Math.max(0, Math.min(selfEmp, room) - exemptionLeft);
    seCpp = round2(seSubject * CPP.selfEmployedRate);
    const band = Math.max(0, Math.min(selfEmp + pensionable, CPP.yampe) - Math.max(pensionable, CPP.ympe));
    seCpp2 = round2(band * CPP.selfEmployedCpp2Rate);
  }
  const seBaseHalf = round2(seSubject * CPP.baseRate);
  const seEnhanced = round2(seSubject * CPP.enhancedRate * 2);
  if (seCpp) push({ line: "22200", form: "T1", label: "Deduction for CPP contributions on self-employment income", value: seBaseHalf, section: "deductions", from: [`Self-employment subject to CPP: ${money(seSubject)} × 4.95%`], explain: "The employer half of the base CPP you owe on business income. The employee half is a credit on line 31000; both halves are paid through line 42100." });
  const enhancedDeduction = round2(cppEnhanced + cpp2Allowed + seEnhanced + seCpp2);
  if (enhancedDeduction) push({ line: "22215", form: "T1", label: "Deduction for CPP enhanced contributions", value: enhancedDeduction, section: "deductions", from: [`Enhanced share of T4 box 16 (1/5.95): ${money(cppEnhanced)}`, ...(cpp2Allowed ? [`CPP2 (box 16A): ${money(cpp2Allowed)}`] : []), ...(seEnhanced ? [`Enhanced CPP on self-employment: ${money(seEnhanced)}`] : []), ...(seCpp2 ? [`CPP2 on self-employment: ${money(seCpp2)}`] : [])], explain: "Since 2019 part of CPP is 'enhanced' and deducted from income instead of credited. Your slip does not split it — Schedule 8 does: 1/5.95 of box 16, plus all of box 16A." });

  if (o.employmentExpenses) push({ line: "22900", form: "T1", label: "Other employment expenses", value: round2(o.employmentExpenses), section: "deductions", from: [`Entered: ${money(o.employmentExpenses)}`], explain: "From a T777, only with a signed T2200 from your employer. Home-office and vehicle costs live here.", note: "Keep the T2200; the CRA asks for it." });
  const t4eRepay = sumBox(slips, "t4e", "b30", "30");
  const otherDed = round2(num(o.otherDeductions) + t4eRepay.total);
  if (otherDed) push({ line: "23200", form: "T1", label: "Other deductions", value: otherDed, section: "deductions", from: [...t4eRepay.parts, ...(o.otherDeductions ? [`Entered: ${money(o.otherDeductions)}`] : [])], explain: "EI repayments (T4E box 30) and other deductions with no line of their own." });

  const totalDeductions = round2(rpp.total + rrspDeduct + fhsaDeduct + dues + num(o.carryingCharges) + seBaseHalf + enhancedDeduction + num(o.employmentExpenses) + otherDed);
  push({ line: "23300", form: "T1", label: "Total deductions", value: totalDeductions, section: "deductions", always: true, explain: "Lines 20700 to 23200 added up." });
  const netIncome = round2(Math.max(0, totalIncome - totalDeductions));
  push({ line: "23600", form: "T1", label: "Net income", value: netIncome, section: "deductions", always: true, explain: "Total income minus deductions. This number sets benefits (GST/HST credit, CCB), the medical threshold, the age amount, and the spouse amount — it matters more than taxable income for most people." });

  // ---------------- Step 4: taxable income ----------------
  const lossApplied = taxableGains > 0 ? Math.min(taxableGains, num(carry.netCapitalLosses)) : 0;
  if (lossApplied) push({ line: "25300", form: "T1", label: "Net capital losses of other years", value: round2(lossApplied), section: "taxable", from: [`Losses carried forward ${money(carry.netCapitalLosses)}`, `Taxable gains this year ${money(taxableGains)}`], explain: "Old capital losses can only offset capital gains, never salary. Applied up to this year's taxable gains; the rest keeps carrying forward." });
  const taxableIncome = round2(Math.max(0, netIncome - lossApplied));
  push({ line: "26000", form: "T1", label: "Taxable income", value: taxableIncome, section: "taxable", always: true, explain: "What the tax brackets are applied to." });

  // ---------------- Step 5: federal non-refundable credits ----------------
  const fedBpa = bpaFederal(netIncome);
  push({ line: "30000", form: "T1", label: "Basic personal amount", value: fedBpa, section: "fedCredits", always: true, from: [`Net income ${money(netIncome)}`], explain: netIncome <= FEDERAL.bpa.phaseStart ? `Everyone gets ${money(FEDERAL.bpa.max)} of income tax-free at the federal level.` : `Reduced from ${money(FEDERAL.bpa.max)} because net income is above ${money(FEDERAL.bpa.phaseStart)}; it bottoms out at ${money(FEDERAL.bpa.min)} at ${money(FEDERAL.bpa.phaseEnd)}.` });

  const fedAge = age !== null && age >= 65 ? round2(Math.max(0, FEDERAL.age.amount - FEDERAL.age.reductionRate * Math.max(0, netIncome - FEDERAL.age.threshold))) : 0;
  if (fedAge) push({ line: "30100", form: "T1", label: "Age amount", value: fedAge, section: "fedCredits", from: [`Age at Dec 31: ${age}`, `Net income ${money(netIncome)}`], explain: `${money(FEDERAL.age.amount)} for anyone 65 or older, reduced by 15% of net income above ${money(FEDERAL.age.threshold)}.` });

  const fedSpouse = hasSpouse ? round2(Math.max(0, fedBpa - num(p.spouseNetIncome))) : 0;
  if (hasSpouse) push({ line: "30300", form: "T1", label: "Spouse or common-law partner amount", value: fedSpouse, section: "fedCredits", always: true, from: [`Your BPA ${money(fedBpa)} − spouse's net income ${money(p.spouseNetIncome)}`], explain: "Your basic personal amount minus your partner's net income (their line 23600). Zero once they earn more than the BPA. Only one of you can claim it.", note: !p.spouseNetIncome ? "Enter your spouse's net income on the Profile page — if it is genuinely 0 this is right." : undefined });

  if (cppBase) push({ line: "30800", form: "T1", label: "Base CPP contributions through employment", value: cppBase, section: "fedCredits", from: [...cppPaid.parts, `Base share = box 16 × 4.95/5.95`], explain: "The base part of your CPP (Schedule 8). The enhanced part was deducted on line 22215 instead." });
  if (seBaseHalf) push({ line: "31000", form: "T1", label: "Base CPP contributions on self-employment income", value: seBaseHalf, section: "fedCredits", from: [`${money(seSubject)} × 4.95%`], explain: "Employee half of the base CPP on business income (the other half was deducted on line 22200)." });
  if (cppOver) warnings.push(`CPP overpayment of ${money(cppOver)} — you paid more than the annual maximum across employers. It is refunded on line 44800.`);

  const eiPaid = sumBox(slips, "t4", "b18", "18");
  const eiAllowed = Math.min(eiPaid.total, EI.maxPremium);
  const eiOver = round2(Math.max(0, eiPaid.total - EI.maxPremium));
  if (eiAllowed) push({ line: "31200", form: "T1", label: "Employment insurance premiums through employment", value: round2(eiAllowed), section: "fedCredits", from: [...eiPaid.parts, `Maximum ${money(EI.maxPremium)}`], explain: "T4 box 18, capped at the annual maximum. Anything above it is refunded on line 45000." });

  const cea = Math.min(FEDERAL.canadaEmploymentAmount, round2(employment + num(o.otherEmploymentIncome)));
  if (cea) push({ line: "31260", form: "T1", label: "Canada employment amount", value: cea, section: "fedCredits", from: [`Lesser of ${money(FEDERAL.canadaEmploymentAmount)} and employment income ${money(employment + num(o.otherEmploymentIncome))}`], explain: "A flat credit for anyone with employment income — it covers work expenses without receipts." });
  if (o.homeBuyer) push({ line: "31270", form: "T1", label: "Home buyers' amount", value: FEDERAL.homeBuyersAmount, section: "fedCredits", from: ["You bought a first home in 2025"], explain: "$10,000 for a first home (or the first in the last four years). Can be split with a spouse." });
  const digital = Math.min(FEDERAL.digitalNewsMax, num(o.digitalNews));
  if (digital) push({ line: "31350", form: "T1", label: "Digital news subscription expenses", value: round2(digital), section: "fedCredits", from: [`Entered ${money(o.digitalNews)}, max ${money(FEDERAL.digitalNewsMax)}`], explain: "Qualifying Canadian digital news subscriptions, up to $500." });
  const pensionAmt = age !== null && age >= 65 ? Math.min(FEDERAL.pensionIncomeAmount, t4a_016.total) : 0;
  if (pensionAmt) push({ line: "31400", form: "T1", label: "Pension income amount", value: round2(pensionAmt), section: "fedCredits", from: [`Pension income ${money(t4a_016.total)}`], explain: "Up to $2,000 of eligible pension income. Under 65 only certain annuities qualify — not modelled here." });
  if (p.disabilityCertified) push({ line: "31600", form: "T1", label: "Disability amount (self)", value: FEDERAL.disabilityAmount, section: "fedCredits", from: ["T2201 approved"], explain: "Only with a T2201 the CRA has approved." });
  if (o.studentLoanInterest) push({ line: "31900", form: "T1", label: "Interest paid on your student loans", value: round2(o.studentLoanInterest), section: "fedCredits", from: [`Entered ${money(o.studentLoanInterest)}`], explain: "Government student loan interest only (not a bank line of credit). Unused amounts carry forward five years." });

  // Tuition — Schedule 11: use only what is needed to zero federal tax, carry the rest
  const tuitionThisYear = sumBox(slips, "t2202", "b23", "23");
  const tuitionAvailFed = round2(tuitionThisYear.total + num(carry.tuitionFederal));
  const creditsBeforeTuition = fedBpa + fedAge + fedSpouse + cppBase + seBaseHalf + eiAllowed + cea + (o.homeBuyer ? FEDERAL.homeBuyersAmount : 0) + digital + pensionAmt + (p.disabilityCertified ? FEDERAL.disabilityAmount : 0) + num(o.studentLoanInterest);
  const fedTaxGross = taxOn(taxableIncome, FEDERAL.brackets);
  const tuitionNeededFed = Math.max(0, round2(fedTaxGross / FEDERAL.creditRate - creditsBeforeTuition));
  const tuitionUsedFed = round2(Math.min(tuitionAvailFed, tuitionNeededFed));
  const tuitionCarryFed = round2(tuitionAvailFed - tuitionUsedFed);
  if (tuitionAvailFed) push({ line: "32300", form: "T1", label: "Tuition, education and textbook amounts (Schedule 11)", value: tuitionUsedFed, section: "fedCredits", always: true, from: [...tuitionThisYear.parts, ...(carry.tuitionFederal ? [`Carried forward from earlier years: ${money(carry.tuitionFederal)}`] : []), `Needed to reduce federal tax to zero: ${money(tuitionNeededFed)}`], explain: "Schedule 11 forces you to use tuition before other credits would otherwise leave tax owing, but only as much as needed to reach zero federal tax. The unused balance carries forward automatically — see Next year." });

  const medThreshold = Math.min(FEDERAL.medicalThreshold, round2(netIncome * FEDERAL.medicalRate));
  const medical = round2(Math.max(0, num(o.medicalExpenses) - medThreshold));
  if (o.medicalExpenses) push({ line: "33099", form: "T1", label: "Medical expenses (after threshold)", value: medical, section: "fedCredits", from: [`Expenses ${money(o.medicalExpenses)} − threshold ${money(medThreshold)} (lesser of ${money(FEDERAL.medicalThreshold)} and 3% of net income)`], explain: "Only the part above the threshold counts. Use any 12-month period ending in 2025, and claim on the lower-income spouse if you have one — the threshold is smaller." });

  const totalCreditBase = round2(creditsBeforeTuition + tuitionUsedFed + medical);
  push({ line: "33500", form: "T1", label: "Total of credit amounts", value: totalCreditBase, section: "fedCredits", always: true, explain: "Lines 30000 to 33200 added up — the dollar amounts, before the rate is applied." });
  const creditsAtRate = round2(totalCreditBase * FEDERAL.creditRate);
  push({ line: "33800", form: "T1", label: `Line 33500 × ${pct(FEDERAL.creditRate)}`, value: creditsAtRate, section: "fedCredits", always: true, explain: "Credits are worth the lowest bracket rate — 14.5% for 2025 because the rate was cut mid-year." });

  const donationsTotal = round2(num(o.donations) + sumBox(slips, "t4", "b46", "46").total);
  const donationsClaim = Math.min(donationsTotal, round2(netIncome * FEDERAL.donations.incomeLimitShare));
  const donationCredit = donationsClaim ? round2(Math.min(donationsClaim, FEDERAL.donations.firstTier) * FEDERAL.donations.firstRate + Math.max(0, donationsClaim - FEDERAL.donations.firstTier) * FEDERAL.donations.secondRate) : 0;
  if (donationsTotal) push({ line: "34900", form: "T1", label: "Donations and gifts (credit)", value: donationCredit, section: "fedCredits", from: [`Receipts ${money(o.donations)}`, ...sumBox(slips, "t4", "b46", "46").parts, `First $200 × 14.5% + remainder × 29%`], explain: "This line is the credit itself, not the donation. Two-tier: 14.5% on the first $200, 29% above it. Combining spouses' receipts on one return, or saving small receipts up to five years, gets more into the 29% tier." });
  const fedNonRefundable = round2(creditsAtRate + donationCredit);
  push({ line: "35000", form: "T1", label: "Total federal non-refundable tax credits", value: fedNonRefundable, section: "fedCredits", always: true, explain: "Line 33800 plus the donation credit." });

  // ---------------- Part B: federal tax ----------------
  push({ line: "40400", form: "T1", label: "Federal tax on taxable income", value: fedTaxGross, section: "fedTax", always: true, from: FEDERAL.brackets.map((b, i) => { const lo = i ? FEDERAL.brackets[i - 1].upTo : 0; const slice = Math.max(0, Math.min(taxableIncome, b.upTo) - lo); return slice ? `${money(slice)} × ${pct(b.rate)} = ${money(round2(slice * b.rate))}` : ""; }).filter(Boolean), explain: "Bracket by bracket. Only the income inside each bracket is taxed at that bracket's rate." });
  const afterCredits = round2(Math.max(0, fedTaxGross - fedNonRefundable));
  push({ line: "40600", form: "T1", label: "Federal tax after non-refundable credits", value: afterCredits, section: "fedTax", always: true, explain: "Cannot go below zero — non-refundable credits never produce a refund on their own." });
  const dtc = round2(eligTaxable * FEDERAL.dividend.eligible.credit + nonTaxable * FEDERAL.dividend.nonEligible.credit);
  const dtcUsed = Math.min(dtc, afterCredits);
  if (dtc) push({ line: "40425", form: "T1", label: "Federal dividend tax credit", value: round2(dtcUsed), section: "fedTax", from: [`Eligible ${money(eligTaxable)} × 15.0198%`, `Non-eligible ${money(nonTaxable)} × 9.0301%`], explain: "Gives back the corporate tax already paid on dividends. Non-refundable, so it stops at zero tax." });
  const basicFederal = round2(Math.max(0, afterCredits - dtcUsed));
  const abatement = quebec ? round2(basicFederal * FEDERAL.quebecAbatement) : 0;
  if (quebec) push({ line: "44000", form: "T1", label: "Refundable Quebec abatement", value: abatement, section: "refund", from: [`Basic federal tax ${money(basicFederal)} × 16.5%`], explain: "Quebec residents get 16.5% of basic federal tax back because Quebec runs its own programs. It appears with the refundable credits." });
  const netFederal = basicFederal;
  push({ line: "42000", form: "T1", label: "Net federal tax", value: netFederal, section: "fedTax", always: true, explain: "Federal tax after every credit. (Minimum tax and foreign tax credits are not modelled.)" });
  if (seCpp) push({ line: "42100", form: "T1", label: "CPP contributions payable on self-employment income", value: round2(seCpp + seCpp2), section: "fedTax", from: [`Base+enhanced ${money(seCpp)}`, ...(seCpp2 ? [`CPP2 ${money(seCpp2)}`] : [])], explain: "Both halves of CPP on business income are paid with your return rather than through payroll." });

  // ---------------- Provincial 428 ----------------
  const provTax = quebec ? { tax: 0, refundable: 0, tuitionCarry: round2(tuitionThisYear.total + num(carry.tuitionProvincial)), warnings: [] as string[] } : computeProvince(prov, { taxableIncome, netIncome, age, hasSpouse, spouseNet: num(p.spouseNetIncome), cea, homeBuyer: o.homeBuyer, cppBase: round2(cppBase + seBaseHalf), ei: round2(eiAllowed), pension: t4a_016.total, disability: p.disabilityCertified, studentLoan: num(o.studentLoanInterest), tuitionNew: tuitionThisYear.total, tuitionCarry: num(carry.tuitionProvincial), medicalExpenses: num(o.medicalExpenses), donations: donationsClaim, eligTaxable, nonTaxable }, L);
  if (quebec) push({ line: "42800", form: "T1", label: "Provincial tax", value: 0, section: "provincial", always: true, explain: "Quebec residents file a separate provincial return (TP-1) with Revenu Québec; nothing goes on line 42800. This app computes the federal side only for Quebec.", note: "File the TP-1 with Revenu Québec." });
  else push({ line: "42800", form: "T1", label: `${prov.name} tax (from form ${prov.form})`, value: provTax.tax, section: "provincial", always: true, explain: `Carried from line ${prov.finalLine} of the ${prov.form}.` });

  const totalPayable = round2(netFederal + seCpp + seCpp2 + provTax.tax);
  push({ line: "43500", form: "T1", label: "Total payable", value: totalPayable, section: "refund", always: true, explain: "Federal tax + CPP on self-employment + provincial tax." });

  // ---------------- refund / balance ----------------
  const withheld = round2(sumBox(slips, "t4", "b22", "22").total + sumBox(slips, "t4a", "b022", "022").total + sumBox(slips, "t4e", "b22", "22").total);
  push({ line: "43700", form: "T1", label: "Total income tax deducted", value: withheld, section: "refund", always: true, from: [...sumBox(slips, "t4", "b22", "22").parts, ...sumBox(slips, "t4a", "b022", "022").parts, ...sumBox(slips, "t4e", "b22", "22").parts], explain: "Every 'income tax deducted' box, added up. This is what you already paid." });
  if (cppOver) push({ line: "44800", form: "T1", label: "CPP overpayment", value: cppOver, section: "refund", from: cppPaid.parts, explain: "Contributions above the annual maximum, refunded." });
  if (eiOver) push({ line: "45000", form: "T1", label: "Employment insurance overpayment", value: eiOver, section: "refund", from: eiPaid.parts, explain: "Premiums above the annual maximum, refunded." });
  if (o.instalmentsPaid) push({ line: "47600", form: "T1", label: "Tax paid by instalments", value: round2(o.instalmentsPaid), section: "refund", from: [`Entered ${money(o.instalmentsPaid)}`], explain: "Quarterly instalments you paid the CRA during the year." });
  const totalCredits = round2(withheld + cppOver + eiOver + num(o.instalmentsPaid) + abatement + provTax.refundable);
  push({ line: "48200", form: "T1", label: "Total credits", value: totalCredits, section: "refund", always: true, explain: "Tax already paid plus refundable credits." });
  const balance = round2(totalPayable - totalCredits);
  push({ line: balance < 0 ? "48400" : "48500", form: "T1", label: balance < 0 ? "Refund" : "Balance owing", value: Math.abs(balance), section: "refund", always: true, explain: balance < 0 ? "Total credits exceed total payable — the CRA sends the difference." : "Due April 30. Interest starts the next day; if you cannot pay, file anyway to avoid the late-filing penalty." });

  // ---------------- carry-forwards for next year ----------------
  const unusedRrsp = round2(Math.max(0, rrspAvailable - rrspDeduct));
  push({ line: "RRSP", form: "Next year", label: "Unused RRSP contributions to carry forward", value: unusedRrsp, section: "carry", always: true, explain: "Contributions you reported but did not deduct. Enter this as 'unused contributions' next year; your new deduction limit will be on the 2025 Notice of Assessment." });
  push({ line: "RRSP room", form: "Next year", label: "Estimated new RRSP room earned for 2026", value: round2(Math.min(FEDERAL.rrspLimit, (employment + num(o.otherEmploymentIncome) + Math.max(0, selfEmp)) * FEDERAL.rrspRate) - sumBox(slips, "t4", "b52", "52").total), section: "carry", always: true, from: [`18% of earned income, capped at ${money(FEDERAL.rrspLimit)}`, `minus pension adjustment (T4 box 52) ${money(sumBox(slips, "t4", "b52", "52").total)}`], explain: "An estimate only — the Notice of Assessment is the authority. Added to whatever unused room the NOA shows." });
  push({ line: "Tuition (fed)", form: "Next year", label: "Unused federal tuition to carry forward", value: tuitionCarryFed, section: "carry", always: tuitionAvailFed > 0, explain: "Enter next year as 'unused federal tuition amounts'. Schedule 11 tracks it; the NOA confirms it." });
  push({ line: "Tuition (prov)", form: "Next year", label: `Unused ${prov.name} tuition to carry forward`, value: provTax.tuitionCarry, section: "carry", always: tuitionAvailFed > 0, explain: "Provincial tuition carries separately from federal." });
  const lossesLeft = round2(Math.max(0, num(carry.netCapitalLosses) - lossApplied) + (gains < 0 ? -gains * FEDERAL.capitalGainsInclusion : 0));
  push({ line: "Losses", form: "Next year", label: "Net capital losses to carry forward", value: lossesLeft, section: "carry", always: lossesLeft > 0, explain: "Old losses not used this year plus half of any net loss this year. Never expires." });
  push({ line: "FHSA", form: "Next year", label: "FHSA participation room carried (max $8,000)", value: round2(Math.min(FEDERAL.fhsaAnnual, Math.max(0, num(carry.fhsaRoom) - fhsa.total))), section: "carry", always: carry.fhsaRoom > 0, explain: "Unused FHSA room carries forward, capped at one year's worth." });

  if (quebec) warnings.push("Quebec: this app computes the federal T1 only. QPP/QPIP instead of CPP/EI and the TP-1 provincial return are not modelled.");
  warnings.push(...provTax.warnings);

  const combinedMarginal = marginalRate(taxableIncome, FEDERAL.brackets) + (quebec ? 0 : marginalRate(taxableIncome, prov.brackets));
  return {
    year: TAX_YEAR,
    province: p.province,
    lines: L,
    summary: {
      totalIncome,
      netIncome,
      taxableIncome,
      federalTax: netFederal,
      provincialTax: provTax.tax,
      totalPayable,
      totalCredits,
      balance,
      marginalRate: combinedMarginal,
      averageRate: totalIncome ? round2((totalPayable / totalIncome) * 10000) / 10000 : 0,
    },
    warnings,
  };
}

export function bpaFederal(netIncome: number): number {
  const { max, min, phaseStart, phaseEnd } = FEDERAL.bpa;
  if (netIncome <= phaseStart) return max;
  if (netIncome >= phaseEnd) return min;
  return round2(max - ((netIncome - phaseStart) / (phaseEnd - phaseStart)) * (max - min));
}

type ProvInputs = {
  taxableIncome: number;
  netIncome: number;
  age: number | null;
  hasSpouse: boolean;
  spouseNet: number;
  cea: number;
  homeBuyer: boolean;
  cppBase: number;
  ei: number;
  pension: number;
  disability: boolean;
  studentLoan: number;
  tuitionNew: number;
  tuitionCarry: number;
  medicalExpenses: number;
  donations: number;
  eligTaxable: number;
  nonTaxable: number;
};

function computeProvince(r: ProvinceRules, i: ProvInputs, L: Line[]) {
  const push = (l: Omit<Line, "from" | "form" | "section"> & { from?: string[] }) => L.push({ from: [], form: "428", section: "provincial", ...l });
  const warnings: string[] = [];
  const gross = taxOn(i.taxableIncome, r.brackets);
  push({ line: r.lines.tax, label: `${r.name} tax on taxable income`, value: gross, always: true, from: r.brackets.map((b, k) => { const lo = k ? r.brackets[k - 1].upTo : 0; const slice = Math.max(0, Math.min(i.taxableIncome, b.upTo) - lo); return slice ? `${money(slice)} × ${pct(b.rate)}` : ""; }).filter(Boolean), explain: `${r.name}'s own brackets applied to the same taxable income.` });

  let bpa = r.bpa.max;
  if (r.bpa.phaseStart !== undefined && r.bpa.phaseEnd !== undefined && i.netIncome > r.bpa.phaseStart) {
    const min = r.bpa.min ?? 0;
    bpa = i.netIncome >= r.bpa.phaseEnd ? min : round2(r.bpa.max - ((i.netIncome - r.bpa.phaseStart) / (r.bpa.phaseEnd - r.bpa.phaseStart)) * (r.bpa.max - min));
  }
  push({ line: "58040", label: `${r.name} basic personal amount`, value: bpa, always: true, explain: r.bpa.phaseStart !== undefined ? `${money(r.bpa.max)}, reduced above ${money(r.bpa.phaseStart)} of net income.` : `${money(r.bpa.max)} for everyone.` });
  const ageAmt = i.age !== null && i.age >= 65 ? round2(Math.max(0, r.age.amount - r.age.reductionRate * Math.max(0, i.netIncome - r.age.threshold))) : 0;
  if (ageAmt) push({ line: "58080", label: "Age amount", value: ageAmt, explain: `${money(r.age.amount)} at 65+, reduced by 15% of net income over ${money(r.age.threshold)}.` });
  const spouseCap = r.spouse.max ?? r.spouse.base;
  const spouse = i.hasSpouse ? round2(Math.min(spouseCap, Math.max(0, r.spouse.base - Math.max(r.spouse.floor ?? 0, i.spouseNet)))) : 0;
  if (i.hasSpouse) push({ line: "58120", label: "Spouse or common-law partner amount", value: spouse, always: true, from: [`Base ${money(r.spouse.base)} − partner's net income ${money(i.spouseNet)}${r.spouse.floor ? ` (at least ${money(r.spouse.floor)})` : ""}`, ...(r.spouse.max ? [`Maximum ${money(r.spouse.max)}`] : [])], explain: r.spouse.max ? `${money(r.spouse.base)} minus your partner's net income, but never more than ${money(r.spouse.max)} — the form's base and cap differ.` : `${money(r.spouse.base)} minus your partner's net income.` });
  const seniorSupp = r.seniorSupplement && i.age !== null && i.age >= 65 ? r.seniorSupplement : 0;
  if (seniorSupp) push({ line: "58220", label: `${r.name} senior supplementary amount`, value: seniorSupp, explain: `A flat ${money(r.seniorSupplement!)} for anyone 65 or older.` });
  const provHomeBuyer = r.homeBuyersAmount && i.homeBuyer ? r.homeBuyersAmount : 0;
  if (provHomeBuyer) push({ line: "58357", label: `${r.name} first-time home buyers' amount`, value: provHomeBuyer, explain: `${r.name}'s own home-buyers' credit, on top of the federal one.` });
  const provCea = r.canadaEmploymentAmount ? i.cea : 0;
  if (provCea) push({ line: "58310", label: "Canada employment amount", value: provCea, explain: "Same figure as federal line 31260." });
  if (i.cppBase) push({ line: "58240", label: "Base CPP contributions", value: i.cppBase, explain: "Same figure as the federal lines 30800 + 31000." });
  if (i.ei) push({ line: "58300", label: "EI premiums", value: i.ei, explain: "Same as federal line 31200." });
  const pension = i.age !== null && i.age >= 65 ? Math.min(r.pensionIncomeAmount, i.pension) : 0;
  if (pension) push({ line: "58360", label: "Pension income amount", value: round2(pension), explain: `Up to ${money(r.pensionIncomeAmount)}.` });
  if (i.disability) push({ line: "58440", label: "Disability amount (self)", value: r.disabilityAmount, explain: "With an approved T2201." });
  if (i.studentLoan) push({ line: "58520", label: "Interest paid on student loans", value: round2(i.studentLoan), explain: "Same as federal line 31900." });

  const before = bpa + ageAmt + spouse + seniorSupp + provHomeBuyer + provCea + i.cppBase + i.ei + pension + (i.disability ? r.disabilityAmount : 0) + i.studentLoan;
  const tuitionAvail = round2(i.tuitionNew + i.tuitionCarry);
  const tuitionNeeded = Math.max(0, round2(gross / r.creditRate - before));
  const tuitionUsed = round2(Math.min(tuitionAvail, tuitionNeeded));
  const tuitionCarry = round2(tuitionAvail - tuitionUsed);
  if (tuitionAvail) push({ line: "58560", label: "Tuition and education amounts (provincial Schedule 11)", value: tuitionUsed, always: true, from: [`Available ${money(tuitionAvail)}`, `Needed to zero provincial tax ${money(tuitionNeeded)}`], explain: "Provincial tuition is tracked separately; only what is needed is used, the rest carries forward." });
  const medThreshold = Math.min(r.medicalThreshold, round2(i.netIncome * r.medicalRate));
  const medical = round2(Math.max(0, i.medicalExpenses - medThreshold));
  if (i.medicalExpenses) push({ line: "58689", label: "Medical expenses (after threshold)", value: medical, from: [`Threshold ${money(medThreshold)}`], explain: `Provincial threshold is the lesser of ${money(r.medicalThreshold)} and 3% of net income.` });
  const base = round2(before + tuitionUsed + medical);
  push({ line: "58800", label: "Total credit amounts", value: base, always: true, explain: "Lines 58040 to 58689 added up — the dollar amounts before the province's rate is applied." });
  const atRate = round2(base * r.creditRate);
  push({ line: "58840", label: `Line 58800 × ${pct(r.creditRate)}`, value: atRate, always: true, explain: "Provincial credits are worth the province's lowest rate." });
  const donation = i.donations ? round2(Math.min(i.donations, r.donations.firstTier) * r.donations.firstRate + Math.max(0, i.donations - r.donations.firstTier) * r.donations.secondRate) : 0;
  if (donation) push({ line: "58969", label: "Donations and gifts (credit)", value: donation, explain: `${pct(r.donations.firstRate)} on the first $200, ${pct(r.donations.secondRate)} above.` });
  const nonRef = round2(atRate + donation);
  push({ line: "61500", label: "Total non-refundable credits", value: nonRef, always: true, explain: "Line 58840 plus the donation credit." });
  let tax = round2(Math.max(0, gross - nonRef));
  const dtc = round2(i.eligTaxable * r.dividend.eligible + i.nonTaxable * r.dividend.nonEligible);
  const applyDtc = () => {
    const dtcUsed = Math.min(dtc, tax);
    if (dtc) push({ line: "61520", label: `${r.name} dividend tax credit`, value: dtcUsed, from: [`Eligible ${money(i.eligTaxable)} × ${pct(r.dividend.eligible)}`, `Non-eligible ${money(i.nonTaxable)} × ${pct(r.dividend.nonEligible)}`], explain: "The provincial half of the dividend credit." });
    tax = round2(tax - dtcUsed);
  };
  if (!r.surtaxBeforeDividendCredit) applyDtc();

  // Low-income tax reductions (BC, NB, NL): after credits and the dividend credit, floor 0.
  if (r.lowIncome && tax > 0) {
    const li = r.lowIncome;
    let amount = 0;
    const from: string[] = [];
    let explain = "";
    if (li.kind === "bc") {
      amount = Math.max(0, round2(li.max - li.rate * Math.max(0, i.netIncome - li.threshold)));
      from.push(`${money(li.max)} − ${pct(li.rate)} × (net income ${money(i.netIncome)} − ${money(li.threshold)})`);
      explain = `${r.name}'s tax reduction credit: ${money(li.max)} for net income up to ${money(li.threshold)}, shrinking by ${pct(li.rate)} of income above it. Applied against tax, never refunded.`;
    } else {
      const family = i.hasSpouse;
      const afi = round2(i.netIncome + (family ? i.spouseNet : 0));
      const eligible = family ? (li.eligibleFamily === undefined || afi < li.eligibleFamily) : (li.eligibleSingle === undefined || i.netIncome < li.eligibleSingle);
      if (eligible) {
        const ageExtra = li.ageSelf && i.age !== null && i.age >= 65 ? li.ageSelf : 0;
        const base = Math.min(li.maxTotal, li.basic + ageExtra + (family ? li.spouse : 0));
        const threshold = family ? li.thresholdFamily : li.thresholdSingle;
        amount = Math.max(0, round2(base - li.rate * Math.max(0, afi - threshold)));
        from.push(`Basic ${money(li.basic)}${ageExtra ? ` + age ${money(ageExtra)}` : ""}${family ? ` + spouse ${money(li.spouse)}` : ""} = ${money(base)}`, `− ${pct(li.rate)} × (adjusted family income ${money(afi)} − ${money(threshold)})`);
        explain = family
          ? `${r.name}'s low-income tax reduction for a couple: one of you claims it, using both net incomes. If it exceeds your ${r.name} tax, the unused part can go on your partner's form.`
          : `${r.name}'s low-income tax reduction: ${money(li.basic)}, shrinking by ${pct(li.rate)} of net income above ${money(threshold)}. An eligible dependant would add more — not modelled.`;
      }
    }
    const used = Math.min(amount, tax);
    if (used > 0) push({ line: li.line, label: li.kind === "bc" ? `${r.name} tax reduction` : `${r.name} low-income tax reduction`, value: used, from, explain }); // the BC form calls it "tax reduction"
    tax = round2(tax - used);
  }

  // Ontario: surtax on tax after credits (before the dividend credit), then the dividend credit, then the tax reduction
  if (r.surtax) {
    const s1 = Math.max(0, tax - r.surtax[0].over) * r.surtax[0].rate;
    const s2 = Math.max(0, tax - r.surtax[1].over) * r.surtax[1].rate;
    const surtax = round2(s1 + s2);
    if (surtax) push({ line: "68", label: "Ontario surtax", value: surtax, from: [`20% of tax over ${money(r.surtax[0].over)}`, `36% of tax over ${money(r.surtax[1].over)}`], explain: "A tax on the tax: it kicks in once basic Ontario tax passes the thresholds, which is why Ontario's real top rate is higher than its bracket rate." });
    tax = round2(tax + surtax);
  }
  if (r.surtaxBeforeDividendCredit) applyDtc();
  if (r.taxReduction && tax > 0) {
    const reduction = round2(Math.max(0, 2 * r.taxReduction.basic - tax));
    if (reduction) push({ line: r.taxReduction.line, label: `${r.name} tax reduction`, value: Math.min(reduction, tax), from: [`2 × ${money(r.taxReduction.basic)} − tax ${money(tax)}`], explain: `${r.name}'s tax reduction: twice the basic ${money(r.taxReduction.basic)} minus your tax; it wipes out small tax bills and fades to nothing at ${money(2 * r.taxReduction.basic)}. Dependent children add more — not modelled.` });
    tax = round2(Math.max(0, tax - reduction));
  }
  if (r.ageTaxCredit && i.age !== null && i.age >= 65 && i.taxableIncome < r.ageTaxCredit.taxableBelow && tax > 0) {
    const used = Math.min(r.ageTaxCredit.amount, tax);
    push({ line: r.ageTaxCredit.line, label: `${r.name} age tax credit`, value: used, from: [`Age ${i.age}, taxable income ${money(i.taxableIncome)} < ${money(r.ageTaxCredit.taxableBelow)}`], explain: `${money(r.ageTaxCredit.amount)} off tax for seniors with taxable income under ${money(r.ageTaxCredit.taxableBelow)}.` });
    tax = round2(tax - used);
  }
  if (r.healthPremium) {
    const hp = r.healthPremium(i.taxableIncome);
    if (hp) push({ line: "89", label: "Ontario health premium", value: hp, from: [`Taxable income ${money(i.taxableIncome)}`], explain: "A separate charge on the ON428, from $0 under $20,000 of taxable income to $900 over $200,600." });
    tax = round2(tax + hp);
  }
  if (r.notModelled) warnings.push(`${r.name}: not modelled — ${r.notModelled}`);
  push({ line: r.finalLine, label: `${r.name} tax`, value: tax, always: true, explain: `Goes to line 42800 of the T1.` });
  return { tax, refundable: 0, tuitionCarry, warnings };
}
