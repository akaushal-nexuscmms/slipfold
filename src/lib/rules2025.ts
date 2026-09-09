// Tax year 2025 (return filed in 2026). Every figure below was checked on 2026-09-09
// against the source named beside it. Change nothing here without a source.
//
// Sources
//  [F1] TaxTips — Canada 2025 federal rates: https://www.taxtips.ca/taxrates/canada.htm
//  [F2] TaxTips — 2025 non-refundable credit base amounts, all jurisdictions: https://www.taxtips.ca/nrcredits/tax-credits-2025-base.htm
//  [C1] CRA — 2025 CPP maximums: https://www.canada.ca/en/revenue-agency/news/newsroom/tax-tips/tax-tips-2024/canada-revenue-agency-announces-maximum-pensionable-earnings-contributions-2025.html
//  [E1] CRA — EI premium rates and maximums: https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/employment-insurance-ei/ei-premium-rates-maximums.html
//  [P1] TaxTips — provincial/territorial 2025 brackets: https://www.taxtips.ca/taxrates/<ab|bc|sk|mb|on|qc|nb|ns|pe|nl|yt|nt|nu>.htm
//  [D1] TaxTips — eligible DTC rates: https://www.taxtips.ca/dtc/eligible-dividends/eligible-dividend-tax-credit-rates.htm
//  [D2] TaxTips — non-eligible DTC rates: https://www.taxtips.ca/dtc/non-eligible-dividend-tax-credit.htm
//  [O1] Ontario surtax thresholds and health premium: CRA T4032-ON and EY Ontario 2025 tables (https://www.ey.com/content/dam/ey-unified-site/ey-com/en-ca/services/tax/tax-calculators/2025/ey-tax-rates-ontario-2025-06-01-v1.pdf)
//  [L1] Advisor.ca — essential tax numbers 2025 (RRSP/TFSA/FHSA, medical threshold): https://www.advisor.ca/tax/tax-news/essential-tax-numbers-updated-for-2025/

export const TAX_YEAR = 2025;

export type Bracket = { upTo: number; rate: number }; // upTo = Infinity for the top bracket

export const FEDERAL = {
  // [F1] Bill C-4 cut the lowest rate from 15% to 14% effective 2025-07-01; the CRA applies a
  // blended 14.5% for the whole 2025 tax year. The statutory fourth-bracket rate is 29% —
  // TaxTips shows 29.31% because it folds in the BPA phase-out, which we model explicitly.
  brackets: [
    { upTo: 57_375, rate: 0.145 },
    { upTo: 114_750, rate: 0.205 },
    { upTo: 177_882, rate: 0.26 },
    { upTo: 253_414, rate: 0.29 },
    { upTo: Infinity, rate: 0.33 },
  ] as Bracket[],
  creditRate: 0.145, // [F1][F2] non-refundable credits use the lowest rate: 14.5% for 2025
  bpa: { max: 16_129, min: 14_538, phaseStart: 177_882, phaseEnd: 253_414 }, // [F1][F2]; min = 2024's 14,156 indexed 2.7%
  spouseAmount: 16_129, // [F2] same as BPA, reduced dollar-for-dollar by the spouse's net income
  age: { amount: 9_028, threshold: 45_522, reductionRate: 0.15 }, // [F2]
  pensionIncomeAmount: 2_000, // [F2]
  disabilityAmount: 10_138, // [F2]
  canadaEmploymentAmount: 1_471, // [F2]
  medicalThreshold: 2_834, // [F2][L1] lesser of this and 3% of net income
  medicalRate: 0.03,
  homeBuyersAmount: 10_000, // line 31270 — unchanged since 2022
  digitalNewsMax: 500, // line 31350
  donations: { firstTier: 200, firstRate: 0.145, secondRate: 0.29, incomeLimitShare: 0.75 }, // first $200 at the credit rate, remainder at 29% (33% slice for top-bracket income not modelled)
  dividend: {
    // [D1][D2] gross-up and federal dividend tax credit as a share of the *taxable* (grossed-up) amount
    eligible: { grossUp: 0.38, credit: 0.150198 },
    nonEligible: { grossUp: 0.15, credit: 0.090301 },
  },
  capitalGainsInclusion: 0.5, // the proposed 2/3 rate was cancelled in March 2025
  rrspLimit: 32_490, // [L1] 2025 maximum new room (18% of 2024 earned income, capped)
  rrspRate: 0.18,
  fhsaAnnual: 8_000, // [L1]
  fhsaLifetime: 40_000, // [L1]
  tfsaAnnual: 7_000, // [L1] informational only — not on the return
  quebecAbatement: 0.165, // [P1] refundable Quebec abatement, line 44000
};

export const CPP = {
  // [C1]
  ympe: 71_300,
  yampe: 81_200,
  basicExemption: 3_500,
  rate: 0.0595, // employee base + first additional (4.95% + 1%)
  baseRate: 0.0495, // credit portion (line 30800 / 31000)
  enhancedRate: 0.01, // deduction portion (line 22215)
  maxContribution: 4_034.1,
  cpp2Rate: 0.04,
  cpp2Max: 396,
  selfEmployedRate: 0.119, // both halves of base + enhanced
  selfEmployedCpp2Rate: 0.08,
};

export const EI = {
  // [E1] outside Quebec
  rate: 0.0164,
  maxInsurable: 65_700,
  maxPremium: 1_077.48,
};

export type ProvinceCode = "AB" | "BC" | "MB" | "NB" | "NL" | "NS" | "NT" | "NU" | "ON" | "PE" | "QC" | "SK" | "YT";

export type ProvinceRules = {
  code: ProvinceCode;
  name: string;
  form: string; // e.g. "MB428"
  finalLine: string; // line on the 428 that carries to T1 line 42800
  lines: { tax: string };
  brackets: Bracket[];
  creditRate: number;
  bpa: { max: number; min?: number; phaseStart?: number; phaseEnd?: number };
  spouseAmount: number;
  age: { amount: number; threshold: number; reductionRate: number };
  pensionIncomeAmount: number;
  disabilityAmount: number;
  medicalThreshold: number;
  medicalRate: number;
  donations: { firstTier: number; firstRate: number; secondRate: number };
  dividend: { eligible: number; nonEligible: number }; // share of taxable amount
  surtax?: [{ over: number; rate: number }, { over: number; rate: number }];
  healthPremium?: (taxableIncome: number) => number;
  /** Province-specific reductions or credits the app does not compute; shown as a warning. */
  notModelled?: string;
};

const std = (o: Omit<ProvinceRules, "lines" | "finalLine" | "medicalRate"> & { finalLine?: string }): ProvinceRules => ({
  medicalRate: 0.03,
  lines: { tax: "42" },
  finalLine: o.finalLine ?? "92",
  ...o,
});

// Ontario health premium schedule [O1] — unchanged since 2004.
function ontarioHealthPremium(ti: number): number {
  if (ti <= 20_000) return 0;
  if (ti <= 36_000) return round2(Math.min(300, (ti - 20_000) * 0.06));
  if (ti <= 48_000) return round2(Math.min(450, 300 + (ti - 36_000) * 0.06));
  if (ti <= 72_000) return round2(Math.min(600, 450 + (ti - 48_000) * 0.25));
  if (ti <= 200_000) return round2(Math.min(750, 600 + (ti - 72_000) * 0.25));
  return round2(Math.min(900, 750 + (ti - 200_000) * 0.25));
}

export const PROVINCES: Record<ProvinceCode, ProvinceRules> = {
  AB: std({
    code: "AB", name: "Alberta", form: "AB428",
    brackets: [{ upTo: 60_000, rate: 0.08 }, { upTo: 151_234, rate: 0.10 }, { upTo: 181_481, rate: 0.12 }, { upTo: 241_974, rate: 0.13 }, { upTo: 362_961, rate: 0.14 }, { upTo: Infinity, rate: 0.15 }], // [P1]
    creditRate: 0.08, bpa: { max: 22_323 }, spouseAmount: 22_323, age: { amount: 6_221, threshold: 46_308, reductionRate: 0.15 }, pensionIncomeAmount: 1_719, disabilityAmount: 17_219, medicalThreshold: 2_884, // [F2]
    donations: { firstTier: 200, firstRate: 0.08, secondRate: 0.21 }, dividend: { eligible: 0.0812, nonEligible: 0.0218 }, // [D1][D2]
  }),
  BC: std({
    code: "BC", name: "British Columbia", form: "BC428",
    brackets: [{ upTo: 49_279, rate: 0.0506 }, { upTo: 98_560, rate: 0.077 }, { upTo: 113_158, rate: 0.105 }, { upTo: 137_407, rate: 0.1229 }, { upTo: 186_306, rate: 0.147 }, { upTo: 259_829, rate: 0.168 }, { upTo: Infinity, rate: 0.205 }], // [P1]
    creditRate: 0.0506, bpa: { max: 12_932 }, spouseAmount: 11_073, age: { amount: 5_799, threshold: 43_169, reductionRate: 0.15 }, pensionIncomeAmount: 1_000, disabilityAmount: 9_699, medicalThreshold: 2_689, // [F2]
    donations: { firstTier: 200, firstRate: 0.0506, secondRate: 0.168 }, dividend: { eligible: 0.12, nonEligible: 0.0196 }, // [D1][D2]
    notModelled: "the BC tax reduction credit for low incomes (BC428 line 78).",
  }),
  MB: std({
    code: "MB", name: "Manitoba", form: "MB428",
    brackets: [{ upTo: 47_000, rate: 0.108 }, { upTo: 100_000, rate: 0.1275 }, { upTo: Infinity, rate: 0.174 }], // [P1] frozen at 2024 levels
    creditRate: 0.108, bpa: { max: 15_780, min: 0, phaseStart: 200_000, phaseEnd: 400_000 }, spouseAmount: 9_134, age: { amount: 3_728, threshold: 27_749, reductionRate: 0.15 }, pensionIncomeAmount: 1_000, disabilityAmount: 6_180, medicalThreshold: 1_728, // [F2][P1]
    donations: { firstTier: 200, firstRate: 0.108, secondRate: 0.174 }, dividend: { eligible: 0.08, nonEligible: 0.007835 }, // [D1][D2]
    notModelled: "MB479 credits (personal tax credit, renters tax credit, education property tax credit) — claim them on the MB479 yourself.",
  }),
  NB: std({
    code: "NB", name: "New Brunswick", form: "NB428",
    brackets: [{ upTo: 51_306, rate: 0.094 }, { upTo: 102_614, rate: 0.14 }, { upTo: 190_060, rate: 0.16 }, { upTo: Infinity, rate: 0.195 }], // [P1]
    creditRate: 0.094, bpa: { max: 13_396 }, spouseAmount: 10_499, age: { amount: 6_037, threshold: 44_945, reductionRate: 0.15 }, pensionIncomeAmount: 1_000, disabilityAmount: 10_010, medicalThreshold: 2_798, // [F2]
    donations: { firstTier: 200, firstRate: 0.094, secondRate: 0.175 }, dividend: { eligible: 0.14, nonEligible: 0.0275 }, // [D1][D2]
    notModelled: "the NB low-income tax reduction.",
  }),
  NL: std({
    code: "NL", name: "Newfoundland and Labrador", form: "NL428",
    brackets: [{ upTo: 44_192, rate: 0.087 }, { upTo: 88_382, rate: 0.145 }, { upTo: 157_792, rate: 0.158 }, { upTo: 220_910, rate: 0.178 }, { upTo: 282_214, rate: 0.198 }, { upTo: 564_429, rate: 0.208 }, { upTo: 1_128_858, rate: 0.213 }, { upTo: Infinity, rate: 0.218 }], // [P1]
    creditRate: 0.087, bpa: { max: 11_067 }, spouseAmount: 9_043, age: { amount: 7_064, threshold: 38_712, reductionRate: 0.15 }, pensionIncomeAmount: 1_000, disabilityAmount: 7_467, medicalThreshold: 2_410, // [F2]
    donations: { firstTier: 200, firstRate: 0.087, secondRate: 0.183 }, dividend: { eligible: 0.063, nonEligible: 0.032 }, // [D1][D2]
    notModelled: "the NL low-income tax reduction.",
  }),
  NS: std({
    code: "NS", name: "Nova Scotia", form: "NS428",
    brackets: [{ upTo: 30_507, rate: 0.0879 }, { upTo: 61_015, rate: 0.1495 }, { upTo: 95_883, rate: 0.1667 }, { upTo: 154_650, rate: 0.175 }, { upTo: Infinity, rate: 0.21 }], // [P1] indexed from 2025
    creditRate: 0.0879, bpa: { max: 11_744 }, spouseAmount: 11_744, age: { amount: 5_734, threshold: 30_828, reductionRate: 0.15 }, pensionIncomeAmount: 1_173, disabilityAmount: 7_341, medicalThreshold: 1_637, // [F2]
    donations: { firstTier: 200, firstRate: 0.0879, secondRate: 0.21 }, dividend: { eligible: 0.0885, nonEligible: 0.015 }, // [D1][D2]
    notModelled: "the NS low-income tax reduction and the age/BPA supplements for low incomes.",
  }),
  NT: std({
    code: "NT", name: "Northwest Territories", form: "NT428",
    brackets: [{ upTo: 51_964, rate: 0.059 }, { upTo: 103_930, rate: 0.086 }, { upTo: 168_967, rate: 0.122 }, { upTo: Infinity, rate: 0.1405 }], // [P1]
    creditRate: 0.059, bpa: { max: 17_842 }, spouseAmount: 17_842, age: { amount: 8_727, threshold: 45_522, reductionRate: 0.15 }, pensionIncomeAmount: 1_000, disabilityAmount: 14_469, medicalThreshold: 2_834, // [F2]
    donations: { firstTier: 200, firstRate: 0.059, secondRate: 0.1405 }, dividend: { eligible: 0.115, nonEligible: 0.06 }, // [D1][D2]
  }),
  NU: std({
    code: "NU", name: "Nunavut", form: "NU428",
    brackets: [{ upTo: 54_707, rate: 0.04 }, { upTo: 109_413, rate: 0.07 }, { upTo: 177_881, rate: 0.09 }, { upTo: Infinity, rate: 0.115 }], // [P1]
    creditRate: 0.04, bpa: { max: 19_274 }, spouseAmount: 19_274, age: { amount: 12_303, threshold: 45_522, reductionRate: 0.15 }, pensionIncomeAmount: 2_000, disabilityAmount: 16_405, medicalThreshold: 2_834, // [F2]
    donations: { firstTier: 200, firstRate: 0.04, secondRate: 0.115 }, dividend: { eligible: 0.0551, nonEligible: 0.0261 }, // [D1][D2]
  }),
  ON: std({
    code: "ON", name: "Ontario", form: "ON428", finalLine: "90",
    brackets: [{ upTo: 52_886, rate: 0.0505 }, { upTo: 105_775, rate: 0.0915 }, { upTo: 150_000, rate: 0.1116 }, { upTo: 220_000, rate: 0.1216 }, { upTo: Infinity, rate: 0.1316 }], // [P1]
    creditRate: 0.0505, bpa: { max: 12_747 }, spouseAmount: 10_823, age: { amount: 6_223, threshold: 46_330, reductionRate: 0.15 }, pensionIncomeAmount: 1_762, disabilityAmount: 10_298, medicalThreshold: 2_885, // [F2]
    donations: { firstTier: 200, firstRate: 0.0505, secondRate: 0.1116 }, dividend: { eligible: 0.10, nonEligible: 0.029863 }, // [D1][D2]
    surtax: [{ over: 5_710, rate: 0.2 }, { over: 7_307, rate: 0.36 }], // [O1]
    healthPremium: ontarioHealthPremium, // [O1]
    notModelled: "the Ontario tax reduction (ON428 line 71–75) for low incomes.",
  }),
  PE: std({
    code: "PE", name: "Prince Edward Island", form: "PE428",
    brackets: [{ upTo: 33_328, rate: 0.095 }, { upTo: 64_656, rate: 0.1347 }, { upTo: 105_000, rate: 0.166 }, { upTo: 140_000, rate: 0.1762 }, { upTo: Infinity, rate: 0.19 }], // [P1]
    creditRate: 0.095, bpa: { max: 14_650 }, spouseAmount: 12_443, age: { amount: 6_510, threshold: 36_600, reductionRate: 0.15 }, pensionIncomeAmount: 1_000, disabilityAmount: 6_890, medicalThreshold: 1_678, // [F2]
    donations: { firstTier: 200, firstRate: 0.095, secondRate: 0.167 }, dividend: { eligible: 0.105, nonEligible: 0.013 }, // [D1][D2]
    notModelled: "the PEI low-income tax reduction.",
  }),
  QC: std({
    // Federal side only. Quebec residents file the TP-1 with Revenu Québec; the 428 is not used.
    code: "QC", name: "Quebec", form: "TP-1 (Revenu Québec)",
    brackets: [{ upTo: 53_255, rate: 0.14 }, { upTo: 106_495, rate: 0.19 }, { upTo: 129_590, rate: 0.24 }, { upTo: Infinity, rate: 0.2575 }], // [P1] informational, used for the marginal-rate display only
    creditRate: 0.14, bpa: { max: 18_571 }, spouseAmount: 18_571, age: { amount: 0, threshold: 0, reductionRate: 0 }, pensionIncomeAmount: 0, disabilityAmount: 0, medicalThreshold: 0,
    donations: { firstTier: 200, firstRate: 0.2, secondRate: 0.24 }, dividend: { eligible: 0.117, nonEligible: 0.0342 }, // [D1][D2]
    notModelled: "the entire Quebec provincial return (TP-1), QPP and QPIP. Federal T1 only.",
  }),
  SK: std({
    code: "SK", name: "Saskatchewan", form: "SK428",
    brackets: [{ upTo: 53_463, rate: 0.105 }, { upTo: 152_750, rate: 0.125 }, { upTo: Infinity, rate: 0.145 }], // [P1]
    creditRate: 0.105, bpa: { max: 19_491 }, spouseAmount: 19_491, age: { amount: 5_785, threshold: 43_065, reductionRate: 0.15 }, pensionIncomeAmount: 1_000, disabilityAmount: 13_986, medicalThreshold: 2_681, // [F2]
    donations: { firstTier: 200, firstRate: 0.105, secondRate: 0.145 }, dividend: { eligible: 0.11, nonEligible: 0.02519 }, // [D1][D2]
    notModelled: "the SK low-income tax credit (paid with the GST credit, not on the return).",
  }),
  YT: std({
    code: "YT", name: "Yukon", form: "YT428",
    // [P1] Yukon's fourth bracket is 12.8% statutory; TaxTips' 12.93% folds in the BPA phase-out, modelled explicitly.
    brackets: [{ upTo: 57_375, rate: 0.064 }, { upTo: 114_750, rate: 0.09 }, { upTo: 177_882, rate: 0.109 }, { upTo: 500_000, rate: 0.128 }, { upTo: Infinity, rate: 0.15 }],
    creditRate: 0.064, bpa: { max: 16_129, min: 14_538, phaseStart: 177_882, phaseEnd: 253_414 }, spouseAmount: 16_129, age: { amount: 9_028, threshold: 45_522, reductionRate: 0.15 }, pensionIncomeAmount: 2_000, disabilityAmount: 10_138, medicalThreshold: 2_834, // [F2] mirrors federal
    donations: { firstTier: 200, firstRate: 0.064, secondRate: 0.128 }, dividend: { eligible: 0.1202, nonEligible: 0.0067 }, // [D1][D2]
  }),
};

export const PROVINCE_LIST: { code: ProvinceCode; name: string }[] = (Object.values(PROVINCES) as ProvinceRules[]).map((p) => ({ code: p.code, name: p.name })).sort((a, b) => a.name.localeCompare(b.name));

/** Progressive tax on `income` over `brackets`. Returns cents-exact number. */
export function taxOn(income: number, brackets: Bracket[]): number {
  let tax = 0;
  let lower = 0;
  for (const b of brackets) {
    if (income <= lower) break;
    const slice = Math.min(income, b.upTo) - lower;
    tax += slice * b.rate;
    lower = b.upTo;
  }
  return round2(tax);
}

export function marginalRate(income: number, brackets: Bracket[]): number {
  for (const b of brackets) if (income <= b.upTo) return b.rate;
  return brackets[brackets.length - 1].rate;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
