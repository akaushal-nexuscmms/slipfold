// Tax year 2024 (return filed in 2025). Every figure checked on 2026-09-09 against the source
// named beside it. Provincial figures come from the CRA's own 2024 428 forms, read page by page.
//
// Sources
//  [F24] TaxTips 2024 non-refundable credit base amounts, all jurisdictions: https://www.taxtips.ca/nrcredits/tax-credits-2024-base.htm
//  [B24] 2024 federal brackets and BPA phase-out — Advisor.ca essentials 2024 (https://www.advisor.ca/tax/tax-news/essential-tax-numbers-updated-for-2024/) and CRA line 30000 page
//  [C24] CRA 2024 CPP: YMPE 68,500, YAMPE 73,200, max 3,867.50, CPP2 max 188 (https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html)
//  [E24] EI 2024: 1.66%, MIE 63,200, max 1,049.12 (CRA EI premium rates and maximums page)
//  [D24] TaxTips non-eligible DTC table, 2024 column (NS 2.99% in 2024): https://www.taxtips.ca/dtc/non-eligible-dividend-tax-credit.htm; eligible rates unchanged 2022–26
//  [R24] The 2024 428 forms: https://www.canada.ca/content/dam/cra-arc/formspubs/pbg/<5006 ON|5010 BC|5009 AB|5008 SK|5007 MB|5004 NB|5001 NL|5003 NS|5002 PE|5011 YT|5012 NT|5014 NU>-c/<code>-c-24e.pdf
//  [Q24] Quebec 2024 brackets/BPA (informational only; federal side is computed): Richter 2024 Quebec tax rate publication

import { ontarioHealthPremium, std, type Bracket, type ProvinceCode, type ProvinceRules, type YearRules } from "./rules2025.ts";

const FEDERAL: YearRules["FEDERAL"] = {
  brackets: [
    { upTo: 55_867, rate: 0.15 },
    { upTo: 111_733, rate: 0.205 },
    { upTo: 173_205, rate: 0.26 },
    { upTo: 246_752, rate: 0.29 },
    { upTo: Infinity, rate: 0.33 },
  ] as Bracket[], // [B24]
  creditRate: 0.15, // [F24]
  bpa: { max: 15_705, min: 14_156, phaseStart: 173_205, phaseEnd: 246_752 }, // [B24]
  spouseAmount: 15_705, // [F24]
  age: { amount: 8_790, threshold: 44_325, reductionRate: 0.15 }, // [F24]
  pensionIncomeAmount: 2_000, // [F24]
  disabilityAmount: 9_872, // [F24]
  canadaEmploymentAmount: 1_433, // [F24]
  medicalThreshold: 2_759, // [F24]
  medicalRate: 0.03,
  homeBuyersAmount: 10_000,
  digitalNewsMax: 500,
  donations: { firstTier: 200, firstRate: 0.15, secondRate: 0.29, incomeLimitShare: 0.75 },
  dividend: {
    eligible: { grossUp: 0.38, credit: 0.150198 }, // [D24]
    nonEligible: { grossUp: 0.15, credit: 0.090301 }, // [D24]
  },
  capitalGainsInclusion: 0.5, // the two-thirds rate proposed for gains after 2024-06-25 was cancelled (2025-03); 50% applies to the whole year
  rrspLimit: 31_560, // [B24]
  rrspRate: 0.18,
  fhsaAnnual: 8_000,
  fhsaLifetime: 40_000,
  tfsaAnnual: 7_000,
  quebecAbatement: 0.165,
};

const CPP: YearRules["CPP"] = {
  ympe: 68_500, // [C24]
  yampe: 73_200,
  basicExemption: 3_500,
  rate: 0.0595,
  baseRate: 0.0495,
  enhancedRate: 0.01,
  maxContribution: 3_867.5,
  cpp2Rate: 0.04,
  cpp2Max: 188,
  selfEmployedRate: 0.119,
  selfEmployedCpp2Rate: 0.08,
};

const EI: YearRules["EI"] = {
  rate: 0.0166, // [E24]
  maxInsurable: 63_200,
  maxPremium: 1_049.12,
};

const PROVINCES: Record<ProvinceCode, ProvinceRules> = {
  AB: std({
    code: "AB", name: "Alberta", form: "AB428",
    brackets: [{ upTo: 148_269, rate: 0.10 }, { upTo: 177_922, rate: 0.12 }, { upTo: 237_230, rate: 0.13 }, { upTo: 355_845, rate: 0.14 }, { upTo: Infinity, rate: 0.15 }], // [R24]
    creditRate: 0.10, bpa: { max: 21_885 }, spouse: { base: 21_885 }, age: { amount: 6_099, threshold: 45_400, reductionRate: 0.15 }, pensionIncomeAmount: 1_685, disabilityAmount: 16_882, medicalThreshold: 2_828, // [R24][F24]
    donations: { firstTier: 200, firstRate: 0.60, secondRate: 0.21 }, dividend: { eligible: 0.0812, nonEligible: 0.0218 }, // [R24][D24]
  }),
  BC: std({
    code: "BC", name: "British Columbia", form: "BC428",
    brackets: [{ upTo: 47_937, rate: 0.0506 }, { upTo: 95_875, rate: 0.077 }, { upTo: 110_076, rate: 0.105 }, { upTo: 133_664, rate: 0.1229 }, { upTo: 181_232, rate: 0.147 }, { upTo: 252_752, rate: 0.168 }, { upTo: Infinity, rate: 0.205 }], // [R24]
    creditRate: 0.0506, bpa: { max: 12_580 }, spouse: { base: 11_850, max: 10_772 }, age: { amount: 5_641, threshold: 41_993, reductionRate: 0.15 }, pensionIncomeAmount: 1_000, disabilityAmount: 9_435, medicalThreshold: 2_616, // [R24][F24]
    donations: { firstTier: 200, firstRate: 0.0506, secondRate: 0.168 }, dividend: { eligible: 0.12, nonEligible: 0.0196 }, // [D24]
    lowIncome: { kind: "bc", line: "79", max: 547, threshold: 24_338, rate: 0.0356 }, // [R24] BC428 lines 73–79; zero at $39,703
  }),
  MB: std({
    code: "MB", name: "Manitoba", form: "MB428",
    brackets: [{ upTo: 47_000, rate: 0.108 }, { upTo: 100_000, rate: 0.1275 }, { upTo: Infinity, rate: 0.174 }], // [R24]
    creditRate: 0.108, bpa: { max: 15_780 }, spouse: { base: 9_134 }, age: { amount: 3_728, threshold: 27_749, reductionRate: 0.15 }, pensionIncomeAmount: 1_000, disabilityAmount: 6_180, medicalThreshold: 1_728, // [R24] no BPA phase-out in 2024 (it starts 2025)
    donations: { firstTier: 200, firstRate: 0.108, secondRate: 0.174 }, dividend: { eligible: 0.08, nonEligible: 0.007835 }, // [D24]
    notModelled: "MB479 credits (personal tax credit, renters tax credit, education property tax credit) and the family tax benefit — claim them yourself.",
  }),
  NB: std({
    code: "NB", name: "New Brunswick", form: "NB428",
    brackets: [{ upTo: 49_958, rate: 0.094 }, { upTo: 99_916, rate: 0.14 }, { upTo: 185_064, rate: 0.16 }, { upTo: Infinity, rate: 0.195 }], // [R24]
    creditRate: 0.094, bpa: { max: 13_044 }, spouse: { base: 11_246, max: 10_223 }, age: { amount: 5_878, threshold: 43_763, reductionRate: 0.15 }, pensionIncomeAmount: 1_000, disabilityAmount: 9_747, medicalThreshold: 2_724, // [R24][F24]
    donations: { firstTier: 200, firstRate: 0.094, secondRate: 0.1795 }, dividend: { eligible: 0.14, nonEligible: 0.0275 }, // [R24][D24]
    lowIncome: { kind: "family", line: "86", basic: 781, spouse: 781, maxTotal: 1_562, thresholdSingle: 21_343, thresholdFamily: 21_343, rate: 0.03, eligibleSingle: 47_376, eligibleFamily: 73_410 }, // [R24] NB428 lines 77–86
  }),
  NL: std({
    code: "NL", name: "Newfoundland and Labrador", form: "NL428",
    brackets: [{ upTo: 43_198, rate: 0.087 }, { upTo: 86_395, rate: 0.145 }, { upTo: 154_244, rate: 0.158 }, { upTo: 215_943, rate: 0.178 }, { upTo: 275_870, rate: 0.198 }, { upTo: 551_739, rate: 0.208 }, { upTo: 1_103_478, rate: 0.213 }, { upTo: Infinity, rate: 0.218 }], // [R24]
    creditRate: 0.087, bpa: { max: 10_818 }, spouse: { base: 9_725, max: 8_840 }, age: { amount: 6_905, threshold: 37_842, reductionRate: 0.15 }, pensionIncomeAmount: 1_000, disabilityAmount: 7_299, medicalThreshold: 2_356, // [R24][F24]
    donations: { firstTier: 200, firstRate: 0.087, secondRate: 0.218 }, dividend: { eligible: 0.063, nonEligible: 0.032 }, // [R24][D24]
    lowIncome: { kind: "family", line: "104", basic: 974, spouse: 544, maxTotal: 1_518, thresholdSingle: 23_390, thresholdFamily: 39_551, rate: 0.16 }, // [R24] NL428 lines 95–104
  }),
  NS: std({
    code: "NS", name: "Nova Scotia", form: "NS428",
    brackets: [{ upTo: 29_590, rate: 0.0879 }, { upTo: 59_180, rate: 0.1495 }, { upTo: 93_000, rate: 0.1667 }, { upTo: 150_000, rate: 0.175 }, { upTo: Infinity, rate: 0.21 }], // [R24]
    // 2024 NS BPA = 8,481 plus a 3,000 supplement for net income up to 25,000, reduced by 6% of income above it (zero at 75,000) — form max 11,481 [R24][F24]
    creditRate: 0.0879, bpa: { max: 11_481, min: 8_481, phaseStart: 25_000, phaseEnd: 75_000 }, spouse: { base: 11_481, max: 11_481 }, age: { amount: 4_141, threshold: 30_828, reductionRate: 0.15 }, pensionIncomeAmount: 1_173, disabilityAmount: 7_341, medicalThreshold: 1_637,
    donations: { firstTier: 200, firstRate: 0.0879, secondRate: 0.21 }, dividend: { eligible: 0.0885, nonEligible: 0.0299 }, // [R24][D24]
    lowIncome: { kind: "family", line: "79", basic: 300, spouse: 300, maxTotal: 600, thresholdSingle: 15_000, thresholdFamily: 15_000, rate: 0.05 }, // [R24] NS428 lines 68–79
    ageTaxCredit: { amount: 1_000, taxableBelow: 24_000, line: "94" }, // [R24] NS428 line 94
    notModelled: "the 2024 NS age-amount supplement and spouse-amount supplement worksheets (the base amounts are used), the amount for young children, and the $165-per-child part of the low-income reduction.",
  }),
  NT: std({
    code: "NT", name: "Northwest Territories", form: "NT428",
    brackets: [{ upTo: 50_597, rate: 0.059 }, { upTo: 101_198, rate: 0.086 }, { upTo: 164_525, rate: 0.122 }, { upTo: Infinity, rate: 0.1405 }], // [R24]
    creditRate: 0.059, bpa: { max: 17_373 }, spouse: { base: 17_373 }, age: { amount: 8_498, threshold: 44_324, reductionRate: 0.15 }, pensionIncomeAmount: 1_000, disabilityAmount: 14_088, medicalThreshold: 2_759, // [R24][F24]
    donations: { firstTier: 200, firstRate: 0.059, secondRate: 0.1405 }, dividend: { eligible: 0.115, nonEligible: 0.06 }, // [R24][D24]
  }),
  NU: std({
    code: "NU", name: "Nunavut", form: "NU428",
    brackets: [{ upTo: 53_268, rate: 0.04 }, { upTo: 106_537, rate: 0.07 }, { upTo: 173_205, rate: 0.09 }, { upTo: Infinity, rate: 0.115 }], // [R24]
    creditRate: 0.04, bpa: { max: 18_767 }, spouse: { base: 18_767 }, age: { amount: 11_980, threshold: 44_325, reductionRate: 0.15 }, pensionIncomeAmount: 2_000, disabilityAmount: 15_973, medicalThreshold: 2_759, // [R24][F24]
    donations: { firstTier: 200, firstRate: 0.04, secondRate: 0.115 }, dividend: { eligible: 0.0551, nonEligible: 0.0261 }, // [R24][D24]
  }),
  ON: std({
    code: "ON", name: "Ontario", form: "ON428", finalLine: "90",
    brackets: [{ upTo: 51_446, rate: 0.0505 }, { upTo: 102_894, rate: 0.0915 }, { upTo: 150_000, rate: 0.1116 }, { upTo: 220_000, rate: 0.1216 }, { upTo: Infinity, rate: 0.1316 }], // [R24]
    creditRate: 0.0505, bpa: { max: 12_399 }, spouse: { base: 11_581, max: 10_528 }, age: { amount: 6_054, threshold: 45_068, reductionRate: 0.15 }, pensionIncomeAmount: 1_714, disabilityAmount: 10_017, medicalThreshold: 2_806, // [R24][F24]
    donations: { firstTier: 200, firstRate: 0.0505, secondRate: 0.1116 }, dividend: { eligible: 0.10, nonEligible: 0.029863 }, // [R24][D24]
    surtax: [{ over: 5_554, rate: 0.2 }, { over: 7_108, rate: 0.36 }], // [R24] ON428 lines 66–67
    surtaxBeforeDividendCredit: true,
    taxReduction: { basic: 286, line: "80" }, // [R24] ON428 line 74
    healthPremium: ontarioHealthPremium, // [R24] same chart as 2025
    notModelled: "the LIFT credit (Schedule ON428-A) and the dependent-children part of the Ontario tax reduction.",
  }),
  PE: std({
    code: "PE", name: "Prince Edward Island", form: "PE428",
    brackets: [{ upTo: 32_656, rate: 0.0965 }, { upTo: 64_313, rate: 0.1363 }, { upTo: 105_000, rate: 0.1665 }, { upTo: 140_000, rate: 0.18 }, { upTo: Infinity, rate: 0.1875 }], // [R24]
    creditRate: 0.0965, bpa: { max: 13_500 }, spouse: { base: 12_613, max: 11_466 }, age: { amount: 5_595, threshold: 33_740, reductionRate: 0.15 }, pensionIncomeAmount: 1_000, disabilityAmount: 6_890, medicalThreshold: 1_678, // [R24][F24]
    donations: { firstTier: 200, firstRate: 0.0965, secondRate: 0.1875 }, dividend: { eligible: 0.105, nonEligible: 0.013 }, // [R24][D24]
    lowIncome: { kind: "family", line: "87", basic: 350, spouse: 350, maxTotal: 1_200, thresholdSingle: 21_500, thresholdFamily: 21_500, rate: 0.05, ageSelf: 250 }, // [R24] PE428 lines 75–87
    notModelled: "the PEI children's wellness credit, the amount for young children, and the spouse-age and per-child parts of the low-income reduction.",
  }),
  QC: std({
    code: "QC", name: "Quebec", form: "TP-1 (Revenu Québec)",
    brackets: [{ upTo: 51_780, rate: 0.14 }, { upTo: 103_545, rate: 0.19 }, { upTo: 126_000, rate: 0.24 }, { upTo: Infinity, rate: 0.2575 }], // [Q24] informational, marginal-rate display only
    creditRate: 0.14, bpa: { max: 18_056 }, spouse: { base: 18_056 }, age: { amount: 0, threshold: 0, reductionRate: 0 }, pensionIncomeAmount: 0, disabilityAmount: 0, medicalThreshold: 0,
    donations: { firstTier: 200, firstRate: 0.2, secondRate: 0.24 }, dividend: { eligible: 0.117, nonEligible: 0.0342 },
    notModelled: "the entire Quebec provincial return (TP-1), QPP and QPIP. Federal T1 only.",
  }),
  SK: std({
    code: "SK", name: "Saskatchewan", form: "SK428",
    brackets: [{ upTo: 52_057, rate: 0.105 }, { upTo: 148_734, rate: 0.125 }, { upTo: Infinity, rate: 0.145 }], // [R24]
    creditRate: 0.105, bpa: { max: 18_491 }, spouse: { base: 20_341, max: 18_491 }, age: { amount: 5_633, threshold: 41_933, reductionRate: 0.15 }, pensionIncomeAmount: 1_000, disabilityAmount: 10_894, medicalThreshold: 2_610, // [R24][F24]
    donations: { firstTier: 200, firstRate: 0.105, secondRate: 0.145 }, dividend: { eligible: 0.11, nonEligible: 0.02519 }, // [R24][D24]
    seniorSupplement: 1_487, // [R24] SK428 line 58220
    homeBuyersAmount: 10_000, // [R24] SK428 line 58357
    notModelled: "the SK amount for dependent children ($7,015 each) and the SK low-income tax credit (paid with the GST credit).",
  }),
  YT: std({
    code: "YT", name: "Yukon", form: "YT428",
    brackets: [{ upTo: 55_867, rate: 0.064 }, { upTo: 111_733, rate: 0.09 }, { upTo: 173_205, rate: 0.109 }, { upTo: 500_000, rate: 0.128 }, { upTo: Infinity, rate: 0.15 }], // [R24]
    creditRate: 0.064, bpa: { max: 15_705, min: 14_156, phaseStart: 173_205, phaseEnd: 246_752 }, spouse: { base: 15_705 }, age: { amount: 8_790, threshold: 44_325, reductionRate: 0.15 }, pensionIncomeAmount: 2_000, disabilityAmount: 9_872, medicalThreshold: 2_759, // [R24] mirrors federal
    donations: { firstTier: 200, firstRate: 0.064, secondRate: 0.128 }, dividend: { eligible: 0.1202, nonEligible: 0.0067 }, // [R24][D24]
    canadaEmploymentAmount: true, // [R24] YT428 line 58310
  }),
};

const PROVINCE_LIST = (Object.values(PROVINCES) as ProvinceRules[]).map((p) => ({ code: p.code, name: p.name })).sort((a, b) => a.name.localeCompare(b.name));

export const RULES_2024: YearRules = { year: 2024, FEDERAL, CPP, EI, PROVINCES, PROVINCE_LIST };
