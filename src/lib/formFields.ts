// Every fillable field on the CRA forms the app prints, so the user can fill any of them —
// not only the ones the engine derives. Labels and help are taken from the forms' own wording
// (T1 5000-R E (25) and 5015-R E (24); MB428 5007-C; T776).
//
// Each entry says whether the app computes it (`auto`, with the page that feeds it) or the user
// may type it, what kind of input it is, and — for money — which total it joins (`role`). The
// engine reads the typed amounts through these roles so the totals on the return stay consistent.

export type FieldKind = "money" | "text" | "check" | "yesno" | "radio" | "date" | "monthDay" | "count" | "select" | "percent";

export type Role =
  | "info" // identification, answers, dates — no arithmetic
  | "memo" // printed on the form but part of no total (gross figures, "included in" lines)
  | "income" // Step 2, added to total income
  | "incomeReduce" // Step 2, subtracted from total income (2024 line 12701)
  | "selfEmployment" // Step 2, net self-employment income (CPP on it is computed)
  | "otherPayment" // Step 2 lines 14400–14600: added to total income, deducted again on line 25000
  | "deduction" // Step 3, deducted from total income
  | "taxableDeduction" // Step 4, deducted from net income
  | "taxableAdd" // Step 4, added back (2024 line 25999)
  | "creditAmount" // Step 5 Part B lines 30000–33200: a dollar amount, worth the lowest rate
  | "credit" // Step 5 Part B: a credit already at its rate (top-up credit)
  | "fedTaxAdd" // Part C: added to federal tax
  | "fedTaxCredit" // Part C: subtracted from federal tax, never below zero
  | "payableAdd" // Step 6: added to total payable
  | "refundable" // Step 6: added to total credits
  | "provCreditAmount" // 428 Part B: a dollar amount at the province's lowest rate
  | "provTaxAdd" // 428 Part C: added to provincial tax before credits
  | "provTaxAddAfter" // 428 Part C: added after non-refundable credits
  | "provTaxCredit"; // 428 Part C: subtracted from provincial tax, floor zero

export type FormFieldDef = {
  key: string; // stable key in TaxReturn.form
  form: "T1" | "MB428" | "T776";
  page: number;
  group: string;
  line?: string; // five-digit code printed on the form
  label: string;
  help: string;
  kind: FieldKind;
  role: Role;
  pdf?: string; // field-name suffix; for yesno, the "Yes" box
  pdfNo?: string; // yesno: the "No" box
  pdf2024?: string; // suffix on the 2024 form when it differs
  auto?: string; // the app fills this from another page; the user does not type it here
  years?: number[]; // only on these years' forms
  options?: string[]; // select / radio
  recurring?: boolean; // carried into next year's return by "Start next year"
};

const PROV = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"];

// ---------- T1 ----------
type T1Args = Omit<FormFieldDef, "form" | "key"> & { key?: string };
const t1 = (a: T1Args): FormFieldDef => ({ form: "T1", key: a.key ?? (a.line ? a.line : ""), ...a });
const amount = (line: string, page: number, group: string, role: Role, label: string, help: string, extra: Partial<FormFieldDef> = {}): FormFieldDef =>
  t1({ line, page, group, role, label, help, kind: "money", pdf: `Line_${line}_Amount[0]`, ...extra });

const G1 = "Step 1 — Identification";
const G1b = "Step 1 — Residence and spouse";
const G2 = "Step 1 (continued) — Elections Canada, Indian Act, foreign property";
const G3 = "Step 2 — Total income";
const G4 = "Step 3 — Net income";
const G5 = "Step 4 — Taxable income";
const G5b = "Step 5 Part B — Federal non-refundable tax credits";
const G7 = "Step 5 Part C — Net federal tax";
const G8 = "Step 6 — Refund or balance owing";
const G8b = "Certification and tax professional";

export const T1_FIELDS: FormFieldDef[] = [
  // ----- page 1: identification -----
  t1({ key: "firstName", page: 1, group: G1, label: "First name", help: "From the You page.", kind: "text", role: "info", pdf: "ID_FirstNameInitial[0]", auto: "You" }),
  t1({ key: "lastName", page: 1, group: G1, label: "Last name", help: "From the You page.", kind: "text", role: "info", pdf: "ID_LastName[0]", auto: "You" }),
  t1({ key: "street", page: 1, group: G1, label: "Mailing address (apartment – number, street)", help: "From the You page.", kind: "text", role: "info", pdf: "ID_MailingAddress[0]", auto: "You" }),
  t1({ key: "poBox", page: 1, group: G1, label: "PO Box", help: "Only if your mail goes to a post office box.", kind: "text", role: "info", pdf: "ID_POBox[0]", recurring: true }),
  t1({ key: "ruralRoute", page: 1, group: G1, label: "RR (rural route)", help: "Only for a rural route address.", kind: "text", role: "info", pdf: "ID_RuralRoute[0]", recurring: true }),
  t1({ key: "city", page: 1, group: G1, label: "City", help: "From the You page.", kind: "text", role: "info", pdf: "ID_City[0]", auto: "You" }),
  t1({ key: "provMailing", page: 1, group: G1, label: "Prov./Terr. (mailing address)", help: "From the You page.", kind: "select", role: "info", pdf: "Identification[0].Prov_DropDown[0]", auto: "You" }),
  t1({ key: "postalCode", page: 1, group: G1, label: "Postal code", help: "From the You page.", kind: "text", role: "info", pdf: "PostalCode[0]", auto: "You" }),
  t1({ key: "email", page: 1, group: G1, label: "Email address", help: "Form: by providing your email address, you will stop receiving paper mail from the CRA and will instead receive an email notification when mail is available in My Account. Leave it blank to keep paper mail.", kind: "text", role: "info", pdf: "EmailAddress[0]", recurring: true }),
  t1({ key: "sin", page: 1, group: G1, label: "Social insurance number (SIN), TTN or ITN", help: "From the You page — printed only if you typed it there.", kind: "text", role: "info", auto: "You" }),
  t1({ key: "dateOfBirth", page: 1, group: G1, label: "Date of birth", help: "From the You page.", kind: "date", role: "info", pdf: "DateBirth_Comb[0]", auto: "You" }),
  t1({ key: "dateOfDeath", page: 1, group: G1, label: "Date of death (deceased person's return only)", help: "Form: if this return is for a deceased person, enter their information on this page and the date of death. Leave blank otherwise.", kind: "date", role: "info", pdf: "DateDeath_Comb[0]" }),
  t1({ key: "maritalStatus", page: 1, group: G1, label: "Marital status on December 31", help: "From the You page.", kind: "select", role: "info", auto: "You" }),
  t1({ key: "maritalChange", page: 1, group: G1, label: "Date your marital status changed (month day)", help: "Form: if your marital status changed in the year, enter the date of change. Month and day only.", kind: "monthDay", role: "info", pdf: "Identification[0].DateMMDD_Comb_BordersAll_Std[0].DateMMDD_Comb[0]", years: [2025] }), // the 2024 form has no such box
  t1({ key: "language", page: 1, group: G1, label: "Your language of correspondence", help: "English or Français — which language the CRA writes to you in.", kind: "radio", role: "info", pdf: "RadioButtonlanguaget[0]", options: ["English", "Français"], recurring: true }),
  // ----- page 1: residence -----
  t1({ key: "provResidence", page: 1, group: G1b, label: "Province or territory of residence on December 31", help: "From the You page. It decides which 428 form applies.", kind: "select", role: "info", pdf: "Prov_DropDown-Residence[0]", auto: "You" }),
  t1({ key: "provCurrent", page: 1, group: G1b, label: "Current province or territory of residence, if different from your mailing address", help: "Form: your current province or territory of residence if it is different than your mailing address above. Most people leave it blank.", kind: "select", role: "info", pdf: "Residence_Info[0].Prov_DropDown[0]", options: PROV, recurring: true }),
  t1({ key: "provBusiness", page: 1, group: G1b, label: "Province or territory where your business had a permanent establishment", help: "Form: provinces or territories where your businesses had permanent establishments if you were self-employed in the year.", kind: "select", role: "info", pdf: "Prov_DropDown-Business[0]", options: PROV, recurring: true }),
  t1({ key: "dateEntry", page: 1, group: G1b, label: "Date you became a resident of Canada (month day)", help: "Form: if you became a resident of Canada in the year for income tax purposes, enter your date of entry. Newcomers only.", kind: "monthDay", role: "info", pdf: "Date_Entry[0].DateMMDD_Comb_BordersAll_Std[0].DateMMDD_Comb[0]" }),
  t1({ key: "dateDeparture", page: 1, group: G1b, label: "Date you ceased to be a resident of Canada (month day)", help: "Form: if you ceased to be a resident of Canada in the year for income tax purposes, enter your date of departure. Emigrants only.", kind: "monthDay", role: "info", pdf: "Date_Departure[0].DateMMDD_Comb_BordersAll_Std[0].DateMMDD_Comb[0]" }),
  t1({ key: "spouseFirstName", page: 1, group: G1b, label: "Spouse's or common-law partner's first name", help: "From the You page.", kind: "text", role: "info", pdf: "Spouse_First_Name[0]", auto: "You" }),
  t1({ key: "spouseSin", page: 1, group: G1b, label: "Their SIN, TTN or ITN", help: "From the You page.", kind: "text", role: "info", auto: "You" }),
  t1({ key: "spouseSelfEmployed", page: 1, group: G1b, label: "Tick if your spouse or partner was self-employed in the year", help: "Form: tick this box if they were self-employed in the year.", kind: "check", role: "info", pdf: "Self-employment[0].Checkbox[0]" }),
  t1({ key: "spouseNetIncome", page: 1, group: G1b, label: "Their net income from line 23600 of their return", help: "From the You page. Needed to claim the spouse amount and several other credits.", kind: "money", role: "info", pdf: "Info_Spouse_CLP[0].Line23600[0].Amount[0]", auto: "You" }),
  t1({ key: "spouseUccb", page: 1, group: G1b, label: "Amount of UCCB from line 11700 of their return", help: "Universal child care benefit reported on your partner's return. Only for returns still carrying UCCB amounts.", kind: "money", role: "info", pdf: "Info_Spouse_CLP[0].Line11700[0].Amount[0]" }),
  t1({ key: "spouseUccbRepayment", page: 1, group: G1b, label: "Amount of UCCB repayment from line 21300 of their return", help: "Universal child care benefit your partner repaid, from their line 21300.", kind: "money", role: "info", pdf: "Info_Spouse_CLP[0].Line21300[0].Amount[0]" }),
  // ----- page 2 -----
  t1({ key: "citizen", page: 2, group: G2, label: "A) Do you have Canadian citizenship?", help: "Elections Canada question A. If yes, answer question B; if no, skip it.", kind: "yesno", role: "info", pdf: "LineA[0].Option1[0].A_CheckBox[0]", pdfNo: "LineA[0].Option2[0].A_CheckBox[0]", recurring: true }),
  t1({ key: "electionsAuthorize", page: 2, group: G2, label: "B) Authorize the CRA to give your name, address, date of birth and citizenship to Elections Canada?", help: "Form: to update the National Register of Electors (or the Register of Future Electors if you are 14 to 17). Your authorization is valid until you file your next tax return. Citizens only.", kind: "yesno", role: "info", pdf: "LineB[0].Option1[0].B_Authorize_CheckBox[0]", pdfNo: "LineB[0].Option2[0].B_Authorize_CheckBox[0]", recurring: true }),
  t1({ key: "indianActExempt", page: 2, group: G2, label: "Tick if you have income that is exempt under the Indian Act", help: "Form: if you tick the box, complete Form T90 so the CRA can calculate your Canada workers benefit and your family's provincial or territorial benefits.", kind: "check", role: "info", pdf: "Tax_exempt[0].Exempt[0].Spouse_SelfEmployed[0]", recurring: true }),
  t1({ key: "carbonRebateRural", page: 2, group: G2, label: "Canada Carbon Rebate rural supplement — tick if you live outside a census metropolitan area", help: "2024 form: tick if you reside outside a CMA in Alberta, Saskatchewan, Manitoba, Nova Scotia or New Brunswick (or in a rural area or small population centre of one) and expect to still on April 1, 2025. Married or common-law: both partners tick it on their own returns.", kind: "check", role: "info", pdf: "CAI[0].AB_CAI[0].Tick_box[0]", years: [2024] }),
  t1({ key: "foreignProperty", line: "26600", page: 2, group: G2, label: "Did you own or hold specified foreign property with a total cost of more than CAN$100,000 at any time in the year?", help: "Form: if yes, complete Form T1135, Foreign Income Verification Statement. There are substantial penalties for not filing it by the due date. Foreign stocks in a non-registered brokerage account count; RRSP/TFSA holdings do not.", kind: "yesno", role: "info", pdf: "Line26600[0].Option1[0].ForeignProperty_CheckBox[0]", pdfNo: "Line26600[0].Option2[0].ForeignProperty_CheckBox[0]", recurring: true }),

  // ----- page 3: total income -----
  amount("10100", 3, G3, "income", "Employment income (box 14 of all T4 slips)", "Computed from your T4 slips.", { auto: "Slips" }),
  amount("10105", 3, G3, "memo", "Tax-exempt income for emergency services volunteers", "The exempt part of an emergency services volunteer's honorarium, as shown on your T4. Printed for information; not added to income."),
  amount("10120", 3, G3, "memo", "Commissions included on line 10100 (box 42 of all T4 slips)", "Already inside box 14; this just shows how much of it was commission."),
  amount("10130", 3, G3, "memo", "Wage-loss replacement contributions", "Premiums you paid into a wage-loss plan, shown for information."),
  amount("10400", 3, G3, "income", "Other employment income", "Entered on the Other amounts page.", { auto: "Other amounts" }),
  amount("11300", 3, G3, "income", "Old age security (OAS) pension (box 18 of the T4A(OAS) slip)", "Your OAS for the year. It is taxable. If net income before adjustments is over the OAS threshold, part is clawed back through line 23500."),
  amount("11400", 3, G3, "income", "CPP or QPP benefits (box 20 of the T4A(P) slip)", "Retirement, disability, survivor and children's benefits from the T4A(P)."),
  amount("11410", 3, G3, "memo", "Disability benefits included on line 11400 (box 16 of the T4A(P) slip)", "The disability part of your CPP; already inside line 11400."),
  amount("11500", 3, G3, "income", "Other pensions and superannuation", "Computed from T4A box 016 on the Slips page.", { auto: "Slips" }),
  amount("11600", 3, G3, "income", "Elected split-pension amount (complete Form T1032)", "Pension income your spouse or partner is transferring to you on a joint T1032 election. They deduct the same amount on their line 21000."),
  amount("11700", 3, G3, "income", "Universal child care benefit (UCCB) (see the RC62 slip)", "Rare on current returns — the UCCB ended in 2016; only lump-sum arrears still arrive."),
  amount("11701", 3, G3, "memo", "UCCB amount designated to a dependant", "Single parents may report the UCCB in a dependant's income instead; this shows the amount moved."),
  amount("11900", 3, G3, "income", "Employment insurance (EI) and other benefits (box 14 of the T4E slip)", "Computed from your T4E on the Slips page.", { auto: "Slips" }),
  amount("11905", 3, G3, "memo", "EI maternity and parental benefits, and PPIP benefits", "The part of line 11900 that was maternity or parental. Shown for information; it keeps those benefits out of the EI clawback."),
  amount("12000", 3, G3, "income", "Taxable amount of dividends (eligible and other than eligible)", "Computed from T5/T3 slips.", { auto: "Slips" }),
  amount("12010", 3, G3, "memo", "Taxable amount of dividends other than eligible", "Computed from T5/T3 slips.", { auto: "Slips" }),
  amount("12100", 3, G3, "income", "Interest and other investment income", "Computed from T5/T3 slips and the Other amounts page.", { auto: "Slips" }),
  amount("12200", 3, G3, "income", "Net partnership income (limited or non-active partners only)", "Your share of a partnership's net income from the T5013, when you are a limited or non-active partner. Active partners report on the self-employment lines instead."),
  amount("12500", 3, G3, "income", "Registered disability savings plan (RDSP) income (box 131 of the T4A slip)", "Taxable RDSP payments received in the year."),
  amount("12599", 3, G3, "memo", "Rental income — gross", "Computed from the Rental page.", { auto: "Rental" }),
  amount("12600", 3, G3, "income", "Rental income — net (complete Form T776)", "Computed from the Rental page.", { auto: "Rental" }),
  amount("12700", 3, G3, "income", "Taxable capital gains (complete Schedule 3)", "Computed from T5008, T3 and T5 slips.", { auto: "Slips" }),
  amount("12701", 3, G3, "incomeReduce", "Capital gains reduction (complete Schedule 3)", "2024 only: the Schedule 3 reduction that is subtracted from line 12700 (line 14 minus line 15 of the 2024 form).", { years: [2024] }),
  amount("12799", 3, G3, "memo", "Support payments received — total", "Everything you received under the agreement, including child support (which is not taxable)."),
  amount("12800", 3, G3, "income", "Support payments received — taxable amount", "Only spousal support under a written agreement or court order is taxable; child support is not. Enter the taxable part."),
  amount("12900", 3, G3, "income", "Registered retirement savings plan (RRSP) income (from all T4RSP slips)", "Withdrawals from an RRSP, from your T4RSP slips. Home Buyers' Plan and Lifelong Learning Plan withdrawals are not income — they go on Schedule 7."),
  amount("12905", 3, G3, "income", "Taxable first home savings account (FHSA) income (see the T4FHSA slip)", "A taxable FHSA withdrawal that was not for a qualifying home purchase, as shown on the T4FHSA."),
  amount("12906", 3, G3, "income", "Taxable FHSA income – other (see the T4FHSA slip)", "Other taxable FHSA amounts shown on the T4FHSA."),
  amount("13000", 3, G3, "income", "Other income", "Computed from T4A boxes 018/028 and the Other amounts page.", { auto: "Other amounts" }),
  t1({ key: "13000specify", page: 3, group: G3, label: "Other income — specify", help: "The form asks what the line 13000 amount is (for example 'retiring allowance', 'death benefit', 'CERB repayment').", kind: "text", role: "info", pdf: "Line_13000_Specify[0]" }),
  amount("13010", 3, G3, "income", "Taxable scholarships, fellowships, bursaries and artists' project grants", "Computed from T4A box 105 and your T2202.", { auto: "Slips" }),
  amount("13499", 3, G3, "memo", "Business income — gross", "From your T2125, line 8299. Printed beside the net figure."),
  amount("13500", 3, G3, "selfEmployment", "Business income — net", "Entered on the Other amounts page.", { auto: "Other amounts" }),
  amount("13699", 3, G3, "memo", "Professional income — gross", "From your T2125 for a profession (doctor, lawyer, accountant, consultant)."),
  amount("13700", 3, G3, "selfEmployment", "Professional income — net", "Net professional income from your T2125. CPP on it is computed with your other self-employment income."),
  amount("13899", 3, G3, "memo", "Commission income — gross", "From your T2125 for self-employed commission sales."),
  amount("13900", 3, G3, "selfEmployment", "Commission income — net", "Net self-employed commission income from your T2125. CPP on it is computed."),
  amount("14099", 3, G3, "memo", "Farming income — gross", "From your T2042 (or AgriStability/AgriInvest forms)."),
  amount("14100", 3, G3, "selfEmployment", "Farming income — net", "Net farming income from your T2042. CPP on it is computed."),
  amount("14299", 3, G3, "memo", "Fishing income — gross", "From your T2121."),
  amount("14300", 3, G3, "selfEmployment", "Fishing income — net", "Net fishing income from your T2121. CPP on it is computed."),
  amount("14400", 3, G3, "otherPayment", "Workers' compensation benefits (box 10 of the T5007 slip)", "Added to total income, then deducted again on line 25000 — it counts for benefits but is not taxed."),
  amount("14500", 3, G3, "otherPayment", "Social assistance payments", "T5007 box 11. Same treatment: in total and net income, out of taxable income (line 25000)."),
  amount("14600", 3, G3, "otherPayment", "Net federal supplements paid (box 21 of the T4A(OAS) slip)", "Guaranteed Income Supplement and allowances. In net income, out of taxable income via line 25000."),
  amount("14700", 3, G3, "memo", "Add lines 14400 to 14600", "Computed: the total of workers' compensation, social assistance and net federal supplements. Deducted on line 25000.", { auto: "computed" }),
  amount("15000", 3, G3, "memo", "Total income", "Computed.", { auto: "computed" }),

  // ----- page 4: net income -----
  amount("20600", 4, G4, "memo", "Pension adjustment (box 52 of all T4 slips and box 034 of all T4A slips)", "Computed from T4 box 52. Not a deduction; the CRA uses it to reduce next year's RRSP room.", { auto: "Slips" }),
  amount("20700", 4, G4, "deduction", "Registered pension plan (RPP) deduction", "Computed from T4 box 20.", { auto: "Slips" }),
  amount("20800", 4, G4, "deduction", "RRSP deduction (complete Schedule 7)", "Computed from your RRSP receipts and deduction limit.", { auto: "Slips" }),
  amount("20805", 4, G4, "deduction", "FHSA deduction (complete Schedule 15)", "Computed from your T4FHSA and participation room.", { auto: "Slips" }),
  amount("20810", 4, G4, "memo", "Pooled registered pension plan (PRPP) employer contributions", "From your PRPP contribution receipts. Information only — it reduces RRSP room, not income."),
  amount("21000", 4, G4, "deduction", "Deduction for elected split-pension amount (complete Form T1032)", "The pension income you are transferring to your spouse or partner on a joint T1032 election. They report it on their line 11600."),
  amount("21200", 4, G4, "deduction", "Annual union, professional or like dues", "Computed from T4 box 44 and the Other amounts page.", { auto: "Other amounts" }),
  amount("21300", 4, G4, "deduction", "Universal child care benefit (UCCB) repayment (box 12 of all RC62 slips)", "UCCB you had to pay back in the year."),
  amount("21400", 4, G4, "deduction", "Child care expenses (complete Form T778)", "Daycare, nannies, camps and boarding school so you could work or study. Form T778 applies the per-child and earned-income limits, and usually the lower-income spouse claims it. Enter the T778 result."),
  amount("21500", 4, G4, "deduction", "Disability supports deduction (complete Form T929)", "Attendant care and devices that let you work or study, with an approved T2201 or a medical certificate. Enter the T929 result."),
  amount("21699", 4, G4, "memo", "Business investment loss — gross", "The loss on shares or debt of a small business corporation, before the allowable percentage.", { pdf2024: "Line_21699_Amount[0]" }),
  amount("21700", 4, G4, "deduction", "Business investment loss — allowable deduction", "Half of the gross business investment loss (Guide T4037), deductible against any income unlike a normal capital loss.", { pdf: "Line45[0].Line_21900_Amount[0]", pdf2024: "Line21700[0].Line_21900_Amount[0]" }),
  amount("21900", 4, G4, "deduction", "Moving expenses (complete Form T1-M)", "For a move closer to a new job, business or full-time school that meets the distance test on Form T1-M, and only up to the income earned at the new location. Enter the T1-M result.", { pdf: "Line21900[0].Line_21900_Amount[0]" }),
  amount("21999", 4, G4, "memo", "Support payments made — total", "Everything you paid under the agreement, including child support."),
  amount("22000", 4, G4, "deduction", "Support payments made — allowable deduction", "Spousal support paid under a written agreement or court order. Child support is not deductible."),
  amount("22100", 4, G4, "deduction", "Carrying charges, interest expenses and other expenses", "Entered on the Other amounts page.", { auto: "Other amounts" }),
  amount("22200", 4, G4, "deduction", "Deduction for CPP or QPP contributions on self-employment income and other earnings", "Computed on Schedule 8 from your self-employment income.", { auto: "computed" }),
  amount("22215", 4, G4, "deduction", "Deduction for CPP or QPP enhanced contributions on employment income", "Computed on Schedule 8 from T4 boxes 16 and 16A.", { auto: "computed" }),
  amount("22400", 4, G4, "deduction", "Exploration and development expenses (complete Form T1229)", "Canadian exploration and development expenses from flow-through shares (T101/T5013), per Form T1229."),
  amount("22900", 4, G4, "deduction", "Other employment expenses (see Guide T4044)", "Entered on the Other amounts page.", { auto: "Other amounts" }),
  amount("23100", 4, G4, "deduction", "Clergy residence deduction (complete Form T1223)", "For members of the clergy or a religious order with a signed T1223 from the employer."),
  amount("23200", 4, G4, "deduction", "Other deductions", "Computed from T4E box 30 and the Other amounts page.", { auto: "Other amounts" }),
  t1({ key: "23200specify", page: 4, group: G4, label: "Other deductions — specify", help: "What the line 23200 amount is (for example 'EI benefit repayment', 'legal fees to collect salary').", kind: "text", role: "info", pdf: "Line_23200_Specify[0]" }),
  amount("23300", 4, G4, "memo", "Total deductions (add lines 20700 to 23200)", "Computed.", { auto: "computed" }),
  amount("23400", 4, G4, "memo", "Net income before adjustments", "Computed: total income minus total deductions.", { auto: "computed" }),
  amount("23500", 4, G4, "deduction", "Social benefits repayment", "Form: complete the chart for line 23500 (Federal Worksheet) if you had EI benefits and line 23400 is over the EI threshold, or OAS/net federal supplements and line 23400 is over the OAS threshold (2025: $82,125 EI, $93,454 OAS). Enter the worksheet result; the same amount is added to your total payable on line 42200 automatically."),
  amount("23600", 4, G4, "memo", "Net income", "Computed.", { auto: "computed" }),

  // ----- page 5: taxable income -----
  amount("24400", 5, G5, "taxableDeduction", "Canadian Armed Forces personnel and police deduction (box 43 of all T4 slips)", "Income earned on a designated international mission; box 43 of the T4."),
  amount("24900", 5, G5, "taxableDeduction", "Security options deductions (boxes 39, 41, 91 and 92 of all T4 slips or see Form T1212)", "Half of a stock-option benefit that qualifies, from the T4 boxes named on the form."),
  amount("24901", 5, G5, "taxableDeduction", "Additional security options deduction (use Federal Worksheet)", "2024 only.", { years: [2024], pdf: "Line24901[0].Line_Amount[0]" }),
  amount("25000", 5, G5, "memo", "Other payments deduction (amount from line 14700)", "Computed: equals line 14700 when you have no line 14600; the form otherwise sends you to the Federal Worksheet.", { auto: "computed" }),
  amount("25100", 5, G5, "taxableDeduction", "Limited partnership losses of other years", "Losses from a limited partnership carried forward from earlier years; only against income from the same partnership."),
  amount("25200", 5, G5, "taxableDeduction", "Non-capital losses of other years", "Business or employment losses carried forward from earlier years, as shown on your Notice of Assessment. Can be applied against any income."),
  amount("25300", 5, G5, "taxableDeduction", "Net capital losses of other years", "Computed from the From last year page when you have taxable capital gains.", { auto: "From last year" }),
  amount("25395", 5, G5, "taxableDeduction", "Capital gains deduction for qualifying business transfers or qualifying cooperative conversions (complete Form T2048)", "New in 2025; from Form T2048.", { years: [2025], pdf: "Line25395[0].Line_Amount[0]" }),
  amount("25400", 5, G5, "taxableDeduction", "Capital gains deduction (complete Form T657)", "The lifetime capital gains exemption on qualified small business shares or farm/fishing property. Enter the T657 result."),
  amount("25500", 5, G5, "taxableDeduction", "Northern residents deductions (complete Form T2222)", "Residency and travel deductions for living in a prescribed northern or intermediate zone for at least six consecutive months. Enter the T2222 result."),
  amount("25600", 5, G5, "taxableDeduction", "Additional deductions", "Rare: tax-exempt income under a treaty, vow-of-perpetual-poverty, certain foreign pension parts. Specify what it is."),
  t1({ key: "25600specify", page: 5, group: G5, label: "Additional deductions — specify", help: "What the line 25600 amount is.", kind: "text", role: "info", pdf: "Line_25600_Specify[0]" }),
  amount("25999", 5, G5, "taxableAdd", "Capital gains reduction add-back (complete Schedule 3)", "2024 only: adds back the line 12701 reduction when computing taxable income.", { years: [2024], pdf: "Line25999[0].Line_Amount[0]" }),
  amount("25700", 5, G5, "memo", "Add lines 24400 to 25600", "Computed.", { auto: "computed" }),
  amount("26000", 5, G5, "memo", "Taxable income", "Computed.", { auto: "computed" }),

  // ----- page 5–6: non-refundable credits -----
  amount("30000", 5, G5b, "creditAmount", "Basic personal amount", "Computed from net income.", { auto: "computed" }),
  amount("30100", 5, G5b, "creditAmount", "Age amount (65 or older)", "Computed from your date of birth and net income.", { auto: "computed" }),
  amount("30300", 5, G5b, "creditAmount", "Spouse or common-law partner amount (complete Schedule 5)", "Computed from your marital status and your partner's net income on the You page.", { auto: "You" }),
  amount("30400", 5, G5b, "creditAmount", "Amount for an eligible dependant (complete Schedule 5)", "For a single parent (or someone with no spouse) supporting a child, parent or grandparent who lived with you: the basic personal amount minus the dependant's net income, per Schedule 5. Cannot be claimed together with the spouse amount."),
  amount("30425", 5, G5b, "creditAmount", "Canada caregiver amount for spouse or common-law partner, or eligible dependant age 18 or older (complete Schedule 5)", "For an infirm spouse or eligible dependant, reduced by their net income, per Schedule 5."),
  amount("30450", 5, G5b, "creditAmount", "Canada caregiver amount for other infirm dependants age 18 or older (complete Schedule 5)", "For an infirm parent, grandparent, sibling, aunt, uncle, niece or nephew who depended on you. Per Schedule 5."),
  t1({ line: "30499", key: "30499", page: 5, group: G5b, label: "Number of infirm children under 18 you are claiming the Canada caregiver amount for", help: "Each child needs a signed statement from a medical practitioner (or an approved T2201). The amount per child is printed on the form; the app multiplies it for line 30500.", kind: "count", role: "info", pdf: "Line30499[0].Numeric_NoDecimal_BordersAll[0]" }),
  amount("30500", 5, G5b, "creditAmount", "Canada caregiver amount for infirm children under 18 years of age", "Computed: line 30499 × the amount per child printed on the form ($2,687 for 2025, $2,616 for 2024).", { auto: "computed" }),
  amount("30800", 6, G5b, "creditAmount", "Base CPP or QPP contributions through employment income", "Computed on Schedule 8.", { auto: "computed" }),
  amount("31000", 6, G5b, "creditAmount", "Base CPP or QPP contributions on self-employment income and other earnings", "Computed on Schedule 8.", { auto: "computed" }),
  amount("31200", 6, G5b, "creditAmount", "Employment insurance premiums through employment (boxes 18 and 55 of all T4 slips)", "Computed from your T4 slips.", { auto: "Slips" }),
  amount("31217", 6, G5b, "creditAmount", "Employment insurance premiums on self-employment and other eligible earnings (complete Schedule 13)", "Only if you opted into EI special benefits as a self-employed person. Enter the Schedule 13 premium; the same figure is payable on line 42120 — enter it there too."),
  amount("31220", 6, G5b, "creditAmount", "Volunteer firefighters' amount (VFA)", "The flat amount for eligible volunteer firefighter service (the hours test is in the guide). Cannot be combined with the exemption on line 10105 for the same service."),
  amount("31240", 6, G5b, "creditAmount", "Search and rescue volunteers' amount (SRVA)", "The flat amount for eligible search-and-rescue volunteering. Not with the VFA for the same hours."),
  amount("31260", 6, G5b, "creditAmount", "Canada employment amount", "Computed from employment income.", { auto: "computed" }),
  amount("31270", 6, G5b, "creditAmount", "Home buyers' amount", "Ticked on the Other amounts page.", { auto: "Other amounts" }),
  amount("31285", 6, G5b, "creditAmount", "Home accessibility expenses (use Federal Worksheet)", "Up to $20,000 of renovations that make a home safer or more accessible for someone 65 or older or eligible for the disability amount. Enter the eligible expenses."),
  amount("31300", 6, G5b, "creditAmount", "Adoption expenses", "Eligible expenses for adopting a child under 18, up to the annual maximum per child, claimed in the year the adoption is finalized."),
  amount("31350", 6, G5b, "creditAmount", "Digital news subscription expenses", "Entered on the Other amounts page. (2024 is the last year of this credit.)", { auto: "Other amounts", years: [2024] }),
  amount("31400", 6, G5b, "creditAmount", "Pension income amount", "Computed from T4A box 016 and your age.", { auto: "computed" }),
  amount("31600", 6, G5b, "creditAmount", "Disability amount for self", "Ticked on the You page (T2201 approved).", { auto: "You" }),
  amount("31800", 6, G5b, "creditAmount", "Disability amount transferred from a dependant (use Federal Worksheet)", "The unused part of a dependant's disability amount (they must have an approved T2201). Federal Worksheet result."),
  amount("31900", 6, G5b, "creditAmount", "Interest paid on your student loans", "Entered on the Other amounts page.", { auto: "Other amounts" }),
  amount("32300", 6, G5b, "creditAmount", "Your federal tuition amount (complete Schedule 11)", "Computed from your T2202 and carried-forward tuition.", { auto: "Slips" }),
  amount("32400", 6, G5b, "creditAmount", "Tuition amount transferred from a child or grandchild", "The part of a student's unused current-year tuition that they designate to you on their T2202/Schedule 11."),
  amount("32600", 6, G5b, "creditAmount", "Amounts transferred from your spouse or common-law partner (complete Schedule 2)", "Their unused age, pension, disability and tuition amounts, per Schedule 2."),
  amount("33099", 6, G5b, "creditAmount", "Medical expenses for self, spouse or common-law partner and dependent children under 18", "Entered on the Other amounts page; the threshold is applied automatically.", { auto: "Other amounts" }),
  amount("33199", 6, G5b, "creditAmount", "Allowable amount of medical expenses for other dependants (use Federal Worksheet)", "Medical expenses you paid for other dependants (adult children, parents), each reduced by their own 3%/maximum threshold on the Federal Worksheet. Enter the worksheet result."),
  amount("33200", 6, G5b, "memo", "Line 33099 (after threshold) plus line 33199", "Computed.", { auto: "computed" }),
  amount("33500", 6, G5b, "memo", "Total of credit amounts", "Computed.", { auto: "computed" }),
  amount("33800", 6, G5b, "memo", "Line 33500 multiplied by the federal credit rate", "Computed.", { auto: "computed" }),
  amount("34900", 6, G5b, "credit", "Donations and gifts (complete Schedule 9)", "Computed from your receipts and T4 box 46.", { auto: "Other amounts" }),
  amount("34990", 6, G5b, "credit", "Top-up tax credit (use Federal Worksheet)", "2025 only: for people whose credits would have been worth more at 15% than at the blended 14.5% rate (mainly large donation or tuition claims). Enter the Federal Worksheet result.", { years: [2025] }),
  amount("35000", 6, G5b, "memo", "Total federal non-refundable tax credits", "Computed.", { auto: "computed" }),

  // ----- page 7: net federal tax -----
  amount("40424", 7, G7, "fedTaxAdd", "Federal tax on split income (TOSI) (complete Form T1206)", "Tax at the top rate on split income (dividends from a family business paid to a relative who was not active in it). From Form T1206."),
  amount("40400", 7, G7, "memo", "Federal tax on taxable income plus TOSI", "Computed.", { auto: "computed" }),
  amount("40425", 7, G7, "fedTaxCredit", "Federal dividend tax credit", "Computed from your dividends.", { auto: "Slips" }),
  amount("40427", 7, G7, "fedTaxCredit", "Minimum tax carryover (complete Form T691)", "Alternative minimum tax you paid in one of the last seven years, recoverable this year per Form T691."),
  amount("42900", 7, G7, "memo", "Basic federal tax", "Computed.", { auto: "computed" }),
  t1({ key: "surtaxOutsideCanada", page: 7, group: G7, label: "Federal surtax on income earned outside Canada (complete Form T2203)", help: "Only for income earned outside any province. From Form T2203.", kind: "money", role: "fedTaxAdd", pdf: "Line132[0].Amount[0]" }),
  amount("40500", 7, G7, "fedTaxCredit", "Federal foreign tax credit (complete Form T2209)", "Foreign tax you paid on foreign income, up to the Canadian tax on that income. From Form T2209 (US dividend withholding is the common case)."),
  t1({ key: "itcRecapture", page: 7, group: G7, label: "Recapture of investment tax credit (complete Form T2038(IND))", help: "If you disposed of property you had claimed an investment tax credit on. From Form T2038(IND).", kind: "money", role: "fedTaxAdd", pdf: "Line136[0].Amount[0]" }),
  t1({ key: "loggingCredit", page: 7, group: G7, label: "Federal logging tax credit", help: "For logging tax paid to a province on logging income.", kind: "money", role: "fedTaxCredit", pdf: "Line138[0].Amount[0]" }),
  amount("40600", 7, G7, "memo", "Federal tax", "Computed.", { auto: "computed" }),
  amount("40900", 7, G7, "memo", "Total federal political contributions (attach receipts)", "What you gave to a registered federal party or candidate. The credit itself goes on line 41000."),
  amount("41000", 7, G7, "fedTaxCredit", "Federal political contribution tax credit (use Federal Worksheet)", "Federal Worksheet result (the form caps it at $650)."),
  amount("41200", 7, G7, "fedTaxCredit", "Investment tax credit (complete Form T2038(IND))", "Credits on qualified property, apprenticeship job creation or SR&ED, per Form T2038(IND)."),
  amount("41300", 7, G7, "memo", "Net cost of shares of a provincially registered labour-sponsored fund", "The cost of the shares; the allowable credit goes on line 41400."),
  amount("41400", 7, G7, "fedTaxCredit", "Labour-sponsored funds tax credit — allowable credit", "The allowable credit on the net cost of shares of a provincially registered labour-sponsored venture capital corporation."),
  amount("41600", 7, G7, "memo", "Add lines 41000 to 41400", "Computed.", { auto: "computed" }),
  amount("41700", 7, G7, "memo", "Line 40600 minus line 41600", "Computed.", { auto: "computed" }),
  amount("41500", 7, G7, "payableAdd", "Advanced Canada workers benefit (ACWB) (complete Schedule 6)", "Advance CWB payments you received during the year (RC210 slip). They are added back here because the full benefit is claimed on line 45300."),
  amount("41800", 7, G7, "payableAdd", "Special taxes", "Rare: tax on RESP accumulated income payments, excess EPSP amounts, or RRSP/RRIF over-contribution taxes flagged by a T3/T4A."),
  amount("42000", 7, G7, "memo", "Net federal tax", "Computed.", { auto: "computed" }),
  amount("42100", 7, G7, "payableAdd", "CPP contributions payable on self-employment income and other earnings", "Computed on Schedule 8.", { auto: "computed" }),
  amount("42120", 7, G7, "payableAdd", "Employment insurance premiums payable on self-employment and other eligible earnings (complete Schedule 13)", "Only if you opted into EI as a self-employed person; the Schedule 13 premium (same figure as line 31217)."),
  amount("42200", 7, G7, "payableAdd", "Social benefits repayment (amount from line 23500)", "Computed: equals line 23500.", { auto: "computed" }),
  amount("42800", 7, G7, "payableAdd", "Provincial or territorial tax (Form 428)", "Computed on your province's 428.", { auto: "computed" }),
  amount("43500", 7, G7, "memo", "Total payable", "Computed.", { auto: "computed" }),

  // ----- page 8: refund or balance owing -----
  amount("43700", 8, G8, "refundable", "Total income tax deducted (amounts from all Canadian slips)", "Computed from your slips.", { auto: "Slips" }),
  amount("44000", 8, G8, "refundable", "Refundable Quebec abatement", "Computed for Quebec residents.", { auto: "computed" }),
  amount("44800", 8, G8, "refundable", "CPP or QPP overpayment", "Computed from your T4 slips.", { auto: "computed" }),
  amount("45000", 8, G8, "refundable", "Employment insurance (EI) overpayment", "Computed from your T4 slips.", { auto: "computed" }),
  amount("45200", 8, G8, "refundable", "Refundable medical expense supplement (use Federal Worksheet)", "For working people with low income and medical expenses. Federal Worksheet result."),
  amount("45300", 8, G8, "refundable", "Canada workers benefit (CWB) (complete Schedule 6)", "A refundable credit for low-income workers, per Schedule 6. If you received advance payments, they are on line 41500."),
  amount("45350", 8, G8, "refundable", "Canada training credit (CTC) (complete Schedule 11)", "Half of eligible tuition, up to your Canada training credit limit from your Notice of Assessment. Per Schedule 11.", { pdf: "Line45350[0].Line_45300_Amount[0]" }),
  amount("45355", 8, G8, "refundable", "Multigenerational home renovation tax credit (MHRTC) (complete Schedule 12)", "For creating a secondary unit for a senior or an adult eligible for the disability amount. Per Schedule 12.", { pdf: "Line45355[0].Line_45300_Amount[0]" }),
  amount("45400", 8, G8, "refundable", "Refund of investment tax credit (complete Form T2038(IND))", "The refundable part of your investment tax credit, per Form T2038(IND)."),
  amount("45600", 8, G8, "refundable", "Part XII.2 tax credit (box 38 of all T3 slips and box 209 of all T5013 slips)", "Tax a trust already paid on your behalf, shown on the T3/T5013."),
  amount("45700", 8, G8, "refundable", "Employee and partner GST/HST rebate (complete Form GST370)", "GST/HST included in employment expenses you deducted on line 22900 (Form GST370)."),
  amount("46800", 8, G8, "memo", "Eligible educator school supply expenses (maximum $1,000)", "Teachers and early childhood educators: what you spent on supplies for the classroom, up to $1,000. The credit is 25% of it, computed on line 46900."),
  amount("46900", 8, G8, "refundable", "Eligible educator school supply tax credit", "Computed: 25% of line 46800.", { auto: "computed" }),
  amount("47555", 8, G8, "refundable", "Canadian journalism labour tax credit (box 236 of all T5013 slips)", "From a T5013 of a qualifying journalism organization."),
  amount("47556", 8, G8, "refundable", "Return of fuel charge proceeds to farmers tax credit (complete Form T2043)", "Farmers in backstop provinces: a share of eligible farming expenses, per Form T2043."),
  amount("47600", 8, G8, "refundable", "Tax paid by instalments", "Entered on the Other amounts page.", { auto: "Other amounts" }),
  amount("47900", 8, G8, "refundable", "Provincial or territorial credits (complete Form 479, if it applies)", "Refundable provincial credits from Form 479 (Manitoba: MB479 — the education property tax credit, renters tax credit, personal tax credit). The app does not compute the 479; enter its result."),
  amount("48200", 8, G8, "memo", "Total credits", "Computed.", { auto: "computed" }),
  amount("48400", 8, G8, "memo", "Refund", "Computed.", { auto: "computed" }),
  amount("48500", 8, G8, "memo", "Balance owing", "Computed.", { auto: "computed" }),
  t1({ key: "phone", page: 8, group: G8b, label: "Telephone number", help: "Beside your signature on page 8.", kind: "text", role: "info", pdf: "Certification[0].Telephone[0]", recurring: true }),
  t1({ key: "signDate", page: 8, group: G8b, label: "Date signed", help: "Fill this in when you sign, or type the date you will sign.", kind: "date", role: "info", pdf: "Certification[0].Date[0]" }),
  t1({ key: "feeCharged", line: "49000", page: 8, group: G8b, label: "If a tax professional completed this return: was a fee charged?", help: "Leave blank if you prepared the return yourself.", kind: "yesno", role: "info", pdf: "Line49000_CheckBox_EN[0]", pdfNo: "Line49000_CheckBox_EN[1]" }),
  t1({ key: "efileNumber", line: "48900", page: 8, group: G8b, label: "EFILE number (if applicable)", help: "The tax professional's EFILE number.", kind: "text", role: "info", pdf: "Line48900[0].EFile[0]" }),
  t1({ key: "preparerName", page: 8, group: G8b, label: "Name of tax professional", help: "Only if someone prepared the return for you.", kind: "text", role: "info", pdf: "Efile[0].NameOfPreparer[0]" }),
  t1({ key: "preparerPhone", page: 8, group: G8b, label: "Tax professional's telephone number", help: "Only if someone prepared the return for you.", kind: "text", role: "info", pdf: "Efile[0].TelephoneOfPreparer[0]" }),
];

// ---------- MB428 (the one 428 the app fills line by line) ----------
const mb = (key: string, line: string, page: number, role: Role, label: string, help: string, pdf: string, extra: Partial<FormFieldDef> = {}): FormFieldDef =>
  ({ form: "MB428", key: `mb.${key}`, line, page, group: page === 3 ? "MB428 Part C — Manitoba tax" : "MB428 Part B — Manitoba non-refundable tax credits", label, help, kind: "money", role, pdf, ...extra });

export const MB428_FIELDS: FormFieldDef[] = [
  mb("58160", "58160", 1, "provCreditAmount", "Amount for an eligible dependant (line 16: base amount minus the dependant's net income)", "The Manitoba counterpart of federal line 30400. The form's base amount minus your eligible dependant's net income from line 23600 of their return; not below zero.", "Line16[0].Amount1[0]"),
  mb("58200", "58200", 1, "provCreditAmount", "Amount for infirm dependants age 18 or older (use Worksheet MB428)", "Manitoba's caregiver-type amount for an infirm adult dependant. Worksheet MB428 result.", "Line17[0].Amount[0]"),
  mb("58305", "58305", 1, "provCreditAmount", "EI premiums on self-employment and other eligible earnings (amount from line 31217 of your return)", "Same figure as federal line 31217 — filled automatically when you type line 31217.", "Line22[0].Amount[0]", { auto: "computed" }),
  mb("58315", "58315", 1, "provCreditAmount", "Volunteer firefighters' amount", "Manitoba's own VFA, claimed alongside the federal one if you qualify.", "Line23[0].Amount[0]"),
  mb("58316", "58316", 1, "provCreditAmount", "Search and rescue volunteers' amount", "Manitoba's own SRVA.", "Line24[0].Amount[0]"),
  mb("58325", "58325", 1, "provCreditAmount", "Fitness amount", "Manitoba's fitness amount — eligible fees per child, as the MB428 guide describes.", "Line25[0].Amount[0]"),
  mb("58326", "58326", 1, "provCreditAmount", "Children's arts amount", "Manitoba's children's arts amount — eligible fees per child.", "Line26[0].Amount[0]"),
  mb("58330", "58330", 1, "provCreditAmount", "Adoption expenses", "Manitoba's adoption expenses amount, usually the same eligible expenses as federal line 31300 up to Manitoba's maximum.", "Line27[0].Amount[0]"),
  mb("58400", "58400", 2, "provCreditAmount", "Caregiver amount (use Worksheet MB428)", "Manitoba's caregiver amount for a dependant relative who lived with you. Worksheet MB428 result.", "Line32[0].Amount[0]"),
  mb("58480", "58480", 2, "provCreditAmount", "Disability amount transferred from a dependant (use Worksheet MB428)", "The unused part of a dependant's Manitoba disability amount.", "Line35[0].Amount[0]"),
  mb("58600", "58600", 2, "provCreditAmount", "Tuition and education amounts transferred from a child or grandchild", "The Manitoba amount a student designated to you on Schedule MB(S11).", "Line39[0].Amount[0]"),
  mb("58640", "58640", 2, "provCreditAmount", "Amounts transferred from your spouse or common-law partner (attach Schedule MB(S2))", "Their unused Manitoba age, pension, disability and tuition amounts, per Schedule MB(S2).", "Line40[0].Amount[0]"),
  mb("61470", "61470", 2, "provCreditAmount", "Family tax benefit (attach Schedule MB428–A)", "Manitoba's family tax benefit, from Schedule MB428–A. Enter the schedule's result.", "Line41[0].Amount[0]"),
  mb("58729", "58729", 2, "provCreditAmount", "Allowable amount of medical expenses for other dependants", "The Manitoba counterpart of federal line 33199.", "Line49[0].Amount[0]"),
  mb("61510", "61510", 3, "provTaxAdd", "Manitoba tax on split income (complete Form T1206)", "From Form T1206, added to Manitoba tax before credits.", "Line59[0].Amount[0]"),
  mb("minTaxAdd", "66", 3, "provTaxAddAfter", "Manitoba additional tax for minimum tax purposes (Form T691: line 1 minus line 2 of Part 7, × 50%)", "Only if you are subject to alternative minimum tax. Enter the result after the 50%.", "Line66[0].Amount2[0]"),
  mb("61794", "61794", 3, "memo", "Manitoba political contributions made in the year", "What you gave to a registered Manitoba party or candidate. The credit goes on the next line.", "Line68[0].Amount[0]"),
  mb("politicalCredit", "69", 3, "provTaxCredit", "Manitoba political contribution tax credit (use Worksheet MB428) (maximum $1,000)", "Worksheet MB428 result (the form caps it at $1,000).", "Line69[0].Amount[0]"),
  mb("60800", "60800", 3, "provTaxCredit", "Labour-sponsored funds tax credit (from Slip T2C (MAN.))", "The credit shown on your T2C (MAN.) slip.", "Line71[0].Amount[0]"),
  mb("60830", "60830", 3, "provTaxCredit", "Community enterprise development tax credit (complete Form T1256)", "Per Form T1256.", "Line75[0].Amount[0]"),
  mb("60850", "60850", 3, "provTaxCredit", "Small business venture capital tax credit (maximum $120,000)", "From your Manitoba tax credit slip.", "Line77[0].Amount[0]"),
  mb("60860", "60860", 3, "provTaxCredit", "Employee share purchase tax credit (complete Form T1256-2)", "Per Form T1256-2.", "Line79[0].Amount[0]"),
  mb("60920", "60920", 3, "provTaxCredit", "Mineral exploration tax credit (complete Form T1241)", "Per Form T1241.", "Line81[0].Amount[0]"),
];

// ---------- T776 identification and co-owners (per property) ----------
const tp = (key: string, label: string, help: string, kind: FieldKind, pdf: string, extra: Partial<FormFieldDef> = {}): FormFieldDef =>
  ({ form: "T776", key, page: 1, group: "T776 Part 1 and 2 — identification, partnership, co-owners", label, help, kind, role: "info", pdf, recurring: true, ...extra });

export const T776_FIELDS: FormFieldDef[] = [
  tp("finalYear", "Was this the final year of your rental operation?", "Yes if you sold or stopped renting the property in the year.", "radio", "P1_Frm_Ln3_Grp2_op[0]", { recurring: false, options: ["Yes", "No"] }),
  tp("industryCode", "Industry code", "The form itself pre-fills 531111; Guide T4036 lists the codes if yours differs. Leave blank to keep the form's value.", "text", "P1_Frm_Ln4_Grp2_inpt[0]"),
  tp("taxShelter", "Tax shelter identification number (8 characters)", "Only if the rental is a registered tax shelter.", "text", "P1_Frm_Ln4_Grp3_inpt[0]"),
  tp("partnershipBn", "Partnership business number", "Only if you hold the property through a partnership with a business number.", "text", "P1_Frm_Ln4_Grp4_inpt[0]"),
  tp("preparerName", "Name of the person or firm preparing this form", "Leave blank if you prepared it yourself.", "text", "P1_Frm_Ln5_Grp1_inpt[0]"),
  tp("preparerBn", "Preparer's business number / account number", "", "text", "P1_Frm_Ln_Grp2_grp_inpt[0]"),
  tp("preparerAddress", "Preparer's address", "", "text", "P1_Frm_Ln6_Grp1_inpt[0]"),
  tp("preparerCity", "Preparer's city", "", "text", "P1_Frm_Ln6_Grp2_inpt[0]"),
  tp("preparerProv", "Preparer's province or territory (two letters)", "", "text", "P1_Frm_Ln6_Grp3_grp1_inpt[0]"),
  tp("preparerPostal", "Preparer's postal code", "", "text", "P1_Frm_Ln6_Grp3_grp2_inpt[0]"),
  tp("units", "Number of units", "How many rental units the property has (a basement suite is 1).", "count", "P3_Frm_Row1_Cell2[0]", { pdf2024: "P3_Frm_LnGrp1_inpt2[0]" }),
  tp("shortTermRents", "Gross rents for short-term rentals (line 8140)", "The part of your gross rents from short-term rentals (under 90 days). Also printed in the property row.", "money", "Frm_Ln8140_inpt[0]", { recurring: false }),
  ...[1, 2, 3].flatMap((n) => [
    tp(`coowner${n}Name`, `Co-owner or partner ${n} — name and address`, "Part 2: each other co-owner or partner of the property.", "text", `P2_Frm_LnGrp${n}_inpt1[0]`),
    tp(`coowner${n}Share`, `Co-owner or partner ${n} — share of net income (loss) $`, "Their dollar share of the property's net income or loss for the year.", "money", `P2_Frm_LnGrp${n}_inpt2[0]`, { recurring: false }),
    tp(`coowner${n}Pct`, `Co-owner or partner ${n} — percentage of ownership`, "Their ownership percentage. Yours is on the Rental page.", "percent", `P2_Frm_LnGrp${n}_inpt3[0]`),
  ]),
];

export const ALL_FIELDS = [...T1_FIELDS, ...MB428_FIELDS, ...T776_FIELDS];

export const fieldsForYear = (fields: FormFieldDef[], year: number) => fields.filter((f) => !f.years || f.years.includes(year));
export const isManual = (f: FormFieldDef) => !f.auto;
export const pdfSuffix = (f: FormFieldDef, year: number) => (year <= 2024 && f.pdf2024 ? f.pdf2024 : f.pdf);

/** The keys "Start next year" carries forward (answers and identification, never amounts). */
export const recurringKeys = (fields: FormFieldDef[]) => fields.filter((f) => f.recurring && f.kind !== "money").map((f) => f.key);
