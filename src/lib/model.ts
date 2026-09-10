// The return as the user enters it, plus the slip-box field guide the UI renders from.
// Money is a plain number of dollars (cents allowed). Empty inputs are 0.

import type { ProvinceCode } from "./rules.ts";
export type Province = ProvinceCode;
export type MaritalStatus = "single" | "married" | "common-law" | "separated" | "divorced" | "widowed";

export type Profile = {
  firstName: string;
  lastName: string;
  sin: string; // optional; masked in the UI; user opts in to storing it
  dateOfBirth: string; // YYYY-MM-DD
  street: string;
  city: string;
  province: Province;
  postalCode: string;
  maritalStatus: MaritalStatus;
  spouseFirstName: string;
  spouseSin: string;
  spouseNetIncome: number; // their line 23600 — needed for the spouse amount
  disabilityCertified: boolean; // T2201 approved by the CRA
};

/** Definition of one box on a slip: what it is, where it goes, why it matters. */
export type BoxDef = {
  key: string;
  box: string; // as printed on the slip
  label: string;
  help: string; // one or two sentences: what the number is and which line it feeds
  kind?: "money" | "text" | "months";
};

export type SlipKind = "t4" | "t4a" | "t4e" | "t5" | "t3" | "t5008" | "t2202" | "rrsp" | "fhsa";

export type Slip = {
  id: string;
  kind: SlipKind;
  issuer: string; // employer / payer / institution — the recurring part
  values: Record<string, number | string>;
};

export const SLIP_DEFS: Record<SlipKind, { name: string; long: string; issuerLabel: string; boxes: BoxDef[]; recurring: string }> = {
  t4: {
    name: "T4",
    long: "Statement of Remuneration Paid — one per employer",
    issuerLabel: "Employer (box 'Employer's name')",
    recurring: "Employer name recurs every year; the amounts change.",
    boxes: [
      { key: "b14", box: "14", label: "Employment income", help: "Your gross pay before deductions. Feeds line 10100. If you had several employers, the return needs the sum of every box 14." },
      { key: "b16", box: "16", label: "Employee's CPP contributions", help: "Base + first additional CPP you paid. The base part (4.95/5.95 of it) is a credit on line 30800; the enhanced part (1/5.95) is a deduction on line 22215. Anything above the annual maximum comes back on line 44800." },
      { key: "b16a", box: "16A", label: "Employee's second CPP contributions (CPP2)", help: "The 4% you paid on earnings between $71,300 and $81,200. Fully deductible on line 22215; excess over $396 is refunded on line 44800." },
      { key: "b18", box: "18", label: "Employee's EI premiums", help: "Credit on line 31200, capped at $1,077.48 across all employers; overpayment refunds on line 45000." },
      { key: "b20", box: "20", label: "RPP contributions", help: "Registered pension plan contributions through payroll. Deduction on line 20700." },
      { key: "b22", box: "22", label: "Income tax deducted", help: "Tax already withheld. Goes to line 43700 and is subtracted from what you owe." },
      { key: "b24", box: "24", label: "EI insurable earnings", help: "Used to check EI premiums. If blank on the slip, the CRA treats it as box 14 (up to $65,700)." },
      { key: "b26", box: "26", label: "CPP pensionable earnings", help: "Used to split box 16 into its base and enhanced parts. If blank, treated as box 14 (up to $71,300)." },
      { key: "b44", box: "44", label: "Union dues", help: "Deduction on line 21200. Add any dues you paid directly that are not on a T4." },
      { key: "b46", box: "46", label: "Charitable donations", help: "Payroll donations. Add to your receipts for line 34900." },
      { key: "b52", box: "52", label: "Pension adjustment", help: "Does not affect this year's tax; the CRA uses it to reduce next year's RRSP room. Keep it for the Next Year page." },
    ],
  },
  t4a: {
    name: "T4A",
    long: "Statement of Pension, Retirement, Annuity, and Other Income",
    issuerLabel: "Payer",
    recurring: "Pension payers and scholarship sources usually recur.",
    boxes: [
      { key: "b016", box: "016", label: "Pension or superannuation", help: "Line 11500. If you are 65 or over it also qualifies for the $2,000 pension income amount on line 31400." },
      { key: "b018", box: "018", label: "Lump-sum payments", help: "Line 13000, other income." },
      { key: "b020", box: "020", label: "Self-employed commissions", help: "Business income — belongs on a T2125 and line 13900. This app reports it under self-employment; you fill the T2125." },
      { key: "b022", box: "022", label: "Income tax deducted", help: "Line 43700." },
      { key: "b028", box: "028", label: "Other income", help: "Line 13000." },
      { key: "b105", box: "105", label: "Scholarships, bursaries, fellowships", help: "Line 13010. Fully exempt if you were a full-time student (T2202 with full-time months); otherwise the first $500 is exempt." },
    ],
  },
  t4e: {
    name: "T4E",
    long: "Statement of Employment Insurance and Other Benefits",
    issuerLabel: "Issuer (Service Canada)",
    recurring: "Only recurs if you claimed EI again.",
    boxes: [
      { key: "b14", box: "14", label: "Total benefits paid", help: "Line 11900. Taxable income even though it was a benefit." },
      { key: "b22", box: "22", label: "Income tax deducted", help: "Line 43700." },
      { key: "b30", box: "30", label: "Total repayment", help: "Amount you repaid in the year — deduction on line 23200. Usually 0." },
    ],
  },
  t5: {
    name: "T5",
    long: "Statement of Investment Income — bank interest and Canadian dividends",
    issuerLabel: "Payer (bank, broker, company)",
    recurring: "Banks and brokers recur; amounts change.",
    boxes: [
      { key: "b24", box: "24", label: "Actual eligible dividends", help: "What you actually received. The app grosses it up by 38% for line 12000 and computes the dividend tax credit — you do not enter the grossed-up figure yourself if your software asks for box 24." },
      { key: "b25", box: "25", label: "Taxable eligible dividends", help: "Box 24 × 1.38, as printed. Line 12000. If box 25 is blank the app computes it from box 24." },
      { key: "b10", box: "10", label: "Actual non-eligible dividends", help: "Grossed up by 15% for line 12010." },
      { key: "b11", box: "11", label: "Taxable non-eligible dividends", help: "Box 10 × 1.15, as printed. Line 12010 (included in line 12000)." },
      { key: "b13", box: "13", label: "Interest from Canadian sources", help: "Line 12100." },
      { key: "b18", box: "18", label: "Capital gains dividends", help: "Treated as a capital gain: 50% is taxable on line 12700 via Schedule 3." },
    ],
  },
  t3: {
    name: "T3",
    long: "Statement of Trust Income — mutual funds and ETFs held outside registered accounts",
    issuerLabel: "Trust / fund issuer",
    recurring: "Fund companies recur; amounts change.",
    boxes: [
      { key: "b21", box: "21", label: "Capital gains", help: "50% taxable on line 12700 via Schedule 3." },
      { key: "b26", box: "26", label: "Other income", help: "Line 12100 (reported as interest/other investment income)." },
      { key: "b49", box: "49", label: "Actual eligible dividends", help: "Grossed up 38% for line 12000; dividend tax credit computed." },
      { key: "b50", box: "50", label: "Taxable eligible dividends", help: "Box 49 × 1.38 as printed. Computed from box 49 if blank." },
      { key: "b23", box: "23", label: "Actual non-eligible dividends", help: "Grossed up 15% for line 12010." },
      { key: "b32", box: "32", label: "Taxable non-eligible dividends", help: "Box 23 × 1.15 as printed." },
    ],
  },
  t5008: {
    name: "T5008",
    long: "Statement of Securities Transactions — one line per sale",
    issuerLabel: "Broker",
    recurring: "Broker recurs; every sale is new.",
    boxes: [
      { key: "security", box: "17", label: "Security", help: "What you sold. Description only.", kind: "text" },
      { key: "b21", box: "21", label: "Proceeds of disposition", help: "What you sold it for, before commissions." },
      { key: "b20", box: "20", label: "Cost or book value (ACB)", help: "Your adjusted cost base. Brokers often leave this blank or wrong — check your own records. Wrong ACB is the most common capital-gains error." },
      { key: "outlays", box: "—", label: "Outlays and expenses", help: "Commissions and fees on the sale. Reduces the gain." },
    ],
  },
  t2202: {
    name: "T2202",
    long: "Tuition and Enrolment Certificate",
    issuerLabel: "Institution",
    recurring: "Institution recurs while you study.",
    boxes: [
      { key: "b23", box: "23", label: "Eligible tuition fees", help: "Line 32300 via Schedule 11 (federal) and line 58560 (Manitoba). Only the amount needed to zero your tax is used; the rest carries forward — the app computes both." },
      { key: "b24", box: "24", label: "Part-time months", help: "Used for the scholarship exemption test.", kind: "months" },
      { key: "b25", box: "25", label: "Full-time months", help: "Any full-time month makes scholarships (T4A box 105) fully exempt.", kind: "months" },
    ],
  },
  rrsp: {
    name: "RRSP receipt",
    long: "Contribution receipts — one per issuer; both the March–December and first-60-days receipts",
    issuerLabel: "Issuer (bank, broker, group plan)",
    recurring: "Issuer recurs; contributions change.",
    boxes: [
      { key: "remainder", box: "Mar–Dec", label: "Contributions March 1 – December 31, 2025", help: "Schedule 7 line 24500 (part). Deducted on line 20800 up to your deduction limit." },
      { key: "first60", box: "Jan–Mar", label: "Contributions January 1 – March 3, 2026 (first 60 days)", help: "Must be reported on the 2025 return even if you deduct them next year. Schedule 7 line 24500 (part)." },
    ],
  },
  fhsa: {
    name: "T4FHSA",
    long: "First Home Savings Account Statement",
    issuerLabel: "Issuer",
    recurring: "Issuer recurs while the account is open.",
    boxes: [
      { key: "b18", box: "18", label: "FHSA contributions", help: "Schedule 15; deduction on line 20805 up to your participation room ($8,000 a year plus up to $8,000 carried forward)." },
    ],
  },
};

/** Things that are not on a slip: entered once, mostly recurring or from last year's Notice of Assessment. */
export type Other = {
  otherEmploymentIncome: number; // line 10400 — tips, casual
  otherInterest: number; // line 12100 — interest without a T5 (under $50 the bank sends none)
  selfEmploymentNet: number; // line 13500/13900 — net from your own T2125
  otherIncome: number; // line 13000
  unionDuesNotOnT4: number; // line 21200 add-on
  carryingCharges: number; // line 22100 — investment counsel fees, interest on money borrowed to invest
  employmentExpenses: number; // line 22900 — needs a signed T2200 and a T777
  otherDeductions: number; // line 23200
  medicalExpenses: number; // line 33099 — eligible expenses for any 12-month period ending in the year
  donations: number; // line 34900 — receipts, not including T4 box 46 (added automatically)
  studentLoanInterest: number; // line 31900
  digitalNews: number; // line 31350
  homeBuyer: boolean; // line 31270 — first home bought in 2025
  instalmentsPaid: number; // line 47600
  rrspDeductToClaim: number | null; // null = deduct the maximum available
};

/** Values that come from last year's Notice of Assessment or last year's return. Recurring by nature. */
export type Carryforwards = {
  rrspDeductionLimit: number; // NOA: "RRSP deduction limit for 2025"
  unusedRrspContributions: number; // NOA: contributions made but not yet deducted
  fhsaRoom: number; // FHSA participation room for 2025
  tuitionFederal: number; // unused federal tuition amounts (NOA)
  tuitionProvincial: number; // unused Manitoba tuition amounts
  netCapitalLosses: number; // net capital losses of other years, at 50% inclusion (NOA)
};

/** One rental property — form T776. Recurring: address, share, personal-use split, UCC. */
export type RentalProperty = {
  id: string;
  address: string;
  ownershipShare: number; // your percentage, 100 if sole owner
  personalUsePct: number; // % of the property you use yourself (renting a basement suite: the rest of the house)
  grossRents: number; // line 8141
  otherIncome: number; // line 8230 — laundry, parking, storage
  expenses: Record<string, number>; // keyed by RENTAL_EXPENSES key
  ucc: number; // undepreciated capital cost of the building(s), start of year (Class 1)
  additions: number; // capital additions this year (building cost, not land; renovations that are capital)
  ccaClaim: number | null; // null = claim the maximum allowed
};

export const RENTAL_EXPENSES: BoxDef[] = [
  { key: "advertising", box: "8521", label: "Advertising", help: "Listing fees, signs, online ads to find tenants." },
  { key: "insurance", box: "8690", label: "Insurance", help: "Premiums for the rental property for the year. Prepaid premiums for later years go in those years." },
  { key: "interest", box: "8710", label: "Interest and bank charges", help: "Mortgage interest only — never the principal. Also fees to arrange the mortgage and bank charges on the rental account." },
  { key: "office", box: "8810", label: "Office expenses", help: "Stationery, postage, small items. Not furniture or computers (those are capital)." },
  { key: "professional", box: "8860", label: "Professional fees", help: "Accounting for the rental, legal fees for leases or collecting rent. Not legal fees to buy the property (capital)." },
  { key: "management", box: "8871", label: "Management and administration", help: "Property manager, condo fees you pay as owner, tenant screening." },
  { key: "repairs", box: "8960", label: "Repairs and maintenance", help: "Fixing things to their original state: paint, a broken appliance repair, plumbing. A new roof, a new kitchen or an addition is capital — put it in additions." },
  { key: "salaries", box: "9060", label: "Salaries, wages and benefits", help: "Paid to a caretaker or superintendent, including CPP/EI you paid as employer." },
  { key: "propertyTax", box: "9180", label: "Property taxes", help: "Municipal and school taxes on the rental property for the year." },
  { key: "travel", box: "9200", label: "Travel", help: "To collect rent or supervise repairs, only if the property is out of your area and you have receipts. Not for a property in your own city." },
  { key: "utilities", box: "9220", label: "Utilities", help: "Heat, electricity, water, internet you pay for the tenant." },
  { key: "vehicle", box: "9281", label: "Motor vehicle expenses", help: "Only for driving to the property for repairs or supervision when you own one property in your area and do the work yourself; keep a log." },
  { key: "other", box: "9270", label: "Other expenses", help: "Lease cancellation, landscaping, snow removal, anything deductible with no line of its own." },
];

export const CCA_CLASS1_RATE = 0.04; // T4036: Class 1 buildings, declining balance

export type TaxReturn = {
  year: number;
  profile: Profile;
  slips: Slip[];
  rentals: RentalProperty[];
  other: Other;
  carry: Carryforwards;
};

export const EMPTY_PROFILE: Profile = {
  firstName: "",
  lastName: "",
  sin: "",
  dateOfBirth: "",
  street: "",
  city: "",
  province: "MB",
  postalCode: "",
  maritalStatus: "single",
  spouseFirstName: "",
  spouseSin: "",
  spouseNetIncome: 0,
  disabilityCertified: false,
};

export const EMPTY_OTHER: Other = {
  otherEmploymentIncome: 0,
  otherInterest: 0,
  selfEmploymentNet: 0,
  otherIncome: 0,
  unionDuesNotOnT4: 0,
  carryingCharges: 0,
  employmentExpenses: 0,
  otherDeductions: 0,
  medicalExpenses: 0,
  donations: 0,
  studentLoanInterest: 0,
  digitalNews: 0,
  homeBuyer: false,
  instalmentsPaid: 0,
  rrspDeductToClaim: null,
};

export const EMPTY_CARRY: Carryforwards = {
  rrspDeductionLimit: 0,
  unusedRrspContributions: 0,
  fhsaRoom: 0,
  tuitionFederal: 0,
  tuitionProvincial: 0,
  netCapitalLosses: 0,
};

export function emptyReturn(year: number): TaxReturn {
  return { year, profile: { ...EMPTY_PROFILE }, slips: [], rentals: [], other: { ...EMPTY_OTHER }, carry: { ...EMPTY_CARRY } };
}

export function newRental(): RentalProperty {
  return { id: newId(), address: "", ownershipShare: 100, personalUsePct: 0, grossRents: 0, otherIncome: 0, expenses: {}, ucc: 0, additions: 0, ccaClaim: null };
}

let seq = 0;
export const newId = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

export function newSlip(kind: SlipKind, issuer = ""): Slip {
  return { id: newId(), kind, issuer, values: {} };
}

export const num = (v: number | string | undefined | null): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[,$\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** A worked example: single, Winnipeg, one employer, some savings. Used by tests and the demo. */
export const EXAMPLE_RETURN: TaxReturn = {
  year: 2025,
  profile: {
    ...EMPTY_PROFILE,
    firstName: "Sam",
    lastName: "Example",
    dateOfBirth: "1994-05-12",
    street: "123 Portage Ave",
    city: "Winnipeg",
    postalCode: "R3B 2A7",
  },
  slips: [
    { id: "s1", kind: "t4", issuer: "Prairie Logistics Ltd.", values: { b14: 60000, b16: 3361.75, b18: 984, b22: 9000, b26: 60000, b24: 60000 } },
    { id: "s2", kind: "rrsp", issuer: "Assiniboine Credit Union", values: { remainder: 5000 } },
  ],
  rentals: [],
  other: { ...EMPTY_OTHER, donations: 300 },
  carry: { ...EMPTY_CARRY, rrspDeductionLimit: 12000 },
};
