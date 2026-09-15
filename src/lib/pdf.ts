// Fills the CRA's own fillable forms with the computed return: the T1, the provincial 428 and
// one T776 per rental property, then flattens and merges them behind a filing checklist page.
//
// The bundled forms under public/forms/<year>/ are the CRA's fillable PDFs with the XFA layer
// stripped (scripts/clean-forms.py) so pdf-lib can fill the AcroForm fields. Field names are
// matched by suffix, which is stable across years and provinces (e.g. "Line_10100_Amount[0]").
//
// Two layers: `fieldValues()` is pure and testable in Node; `buildReturnPdf()` needs the PDFs.

import { PDFCheckBox, PDFDocument, PDFDropdown, PDFName, PDFRadioGroup, PDFTextField, StandardFonts, rgb, type PDFForm } from "pdf-lib";
import type { Result } from "./engine.ts";
import { rental } from "./engine.ts";
import { RENTAL_EXPENSES, num, type FormEntries, type TaxReturn } from "./model.ts";
import { MB428_FIELDS, T1_FIELDS, T776_FIELDS, fieldsForYear, pdfSuffix, type FormFieldDef } from "./formFields.ts";
import { getRules } from "./rules.ts";

export type FormValues = Record<string, string>; // field-name suffix → text
export type FillPlan = {
  t1: FormValues;
  t1Checks: string[]; // checkbox suffixes to tick
  p428: FormValues | null; // null for Quebec
  p428File: string | null;
  t776: FormValues[]; // one per property
  attach: string[]; // schedules and slips the filer must add by hand
  notes: string[];
};

const money = (n: number) => (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
const nz = (n: number | undefined) => (n && Math.abs(n) >= 0.005 ? money(n) : "");

/**
 * Place the values typed on the Every field page. Radios are passed as "#<option index>",
 * dates as YYYYMMDD, month-day as MMDD; answers become ticks in `checks`.
 */
function applyManual(defs: FormFieldDef[], values: FormEntries, year: number, target: FormValues, checks: string[]) {
  for (const f of fieldsForYear(defs, year)) {
    if (f.auto) continue;
    const v = values[f.key];
    if (v === undefined || v === null || v === "") continue;
    const sfx = pdfSuffix(f, year);
    if (!sfx) continue;
    switch (f.kind) {
      case "money": if (num(v as number)) target[sfx] = money(num(v as number)); break;
      case "count": if (num(v as number)) target[sfx] = String(Math.floor(num(v as number))); break;
      case "percent": if (num(v as number)) target[sfx] = String(num(v as number)); break;
      case "check": if (v === true) checks.push(sfx); break;
      case "yesno": if (v === true) checks.push(sfx); else if (v === false && f.pdfNo) checks.push(f.pdfNo); break;
      case "radio": { const i = f.options?.indexOf(String(v)) ?? -1; if (i >= 0) target[sfx] = `#${i}`; break; }
      case "date": if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) target[sfx] = String(v).replace(/-/g, ""); break;
      case "monthDay": { const m = String(v).match(/^(\d{2})-?(\d{2})$/); if (m) target[sfx] = m[1] + m[2]; break; }
      default: if (String(v).trim()) target[sfx] = String(v).trim();
    }
  }
}

/** "(complete Form T1032)" / "(complete Schedule 5)" in a label → what to attach. */
const attachmentIn = (label: string) => label.match(/complete ((?:Form|Schedule) [A-Z0-9-]+(?:\([A-Z]+\))?)/)?.[1];

/** Every value we can place, keyed by field-name suffix. Pure. */
export function fieldValues(ret: TaxReturn, res: Result): FillPlan {
  const p = ret.profile;
  const year = ret.year;
  const rules = getRules(year);
  const F: FormEntries = ret.form ?? {};
  const fv = (k: string) => num(F[k] as number);
  const line = (n: string, form?: string) => res.lines.find((l) => l.line === n && (form ? l.form === form : l.form !== "428" && l.form !== "Next year"))?.value;
  const tl = (n: string) => line(n) ?? 0;
  const sum = (...ns: string[]) => ns.reduce((s, n) => s + tl(n), 0);
  const provName = (code: string) => rules.PROVINCE_LIST.find((x) => x.code === code)?.name ?? code;
  const attach: string[] = [];
  const notes: string[] = [];

  // ---------- T1 ----------
  const t1: FormValues = {};
  const t1Checks: string[] = [];
  t1["ID_FirstNameInitial[0]"] = p.firstName.trim();
  t1["ID_LastName[0]"] = p.lastName.trim();
  t1["ID_MailingAddress[0]"] = p.street.trim();
  t1["ID_City[0]"] = p.city.trim();
  t1["PostalCode[0]"] = p.postalCode.replace(/\s+/g, "").toUpperCase();
  t1["Identification[0].Prov_DropDown[0]"] = p.province; // mailing address province
  t1["Prov_DropDown-Residence[0]"] = `${p.province}|${provName(p.province)}`; // province of residence on December 31 (the dropdown lists full names)
  // the SIN field is named differently on the 2024 form
  const sinField = year <= 2024 ? "Identification[0].SIN_Comb_BordersAll[0].SIN_Comb[0]" : "Identification[0].NumericField_Comb9_CaptionTop[0].NumericField_Comb9_CaptionTop_Field[0]";
  const spouseSinField = year <= 2024 ? "Info_Spouse_CLP[0].SIN_Comb_BordersAll[0].SIN_Comb[0]" : "Info_Spouse_CLP[0].NumericField_Comb9_CaptionTop[0].NumericField_Comb9_CaptionTop_Field[0]";
  if (p.sin.replace(/\D/g, "").length === 9) t1[sinField] = p.sin.replace(/\D/g, "");
  else notes.push("SIN left blank on the T1 — write it in by hand (it is not stored unless you type it in the app).");
  if (/^\d{4}-\d{2}-\d{2}$/.test(p.dateOfBirth)) t1["DateBirth_Comb[0]"] = p.dateOfBirth.replace(/-/g, "");
  if (p.maritalStatus === "married" || p.maritalStatus === "common-law") {
    t1["Spouse_First_Name[0]"] = p.spouseFirstName.trim();
    t1["Info_Spouse_CLP[0].Line23600[0].Amount[0]"] = money(p.spouseNetIncome);
    if (p.spouseSin.replace(/\D/g, "").length === 9) t1[spouseSinField] = p.spouseSin.replace(/\D/g, "");
  }
  // Marital status boxes on the T1, in printed order: 1 Married, 2 Living common-law, 3 Widowed, 4 Divorced, 5 Separated, 6 Single
  const maritalIndex: Record<string, number> = { married: 0, "common-law": 1, widowed: 2, divorced: 3, separated: 4, single: 5 };
  t1Checks.push(`MaritalStatus[${maritalIndex[p.maritalStatus] ?? 5}]`);

  // every five-digit line the engine produced on the T1 (a few lines have irregular field names — the catalogue knows them)
  const customPdf = new Map(T1_FIELDS.filter((f) => f.line && f.pdf && f.pdf !== `Line_${f.line}_Amount[0]`).map((f) => [f.line!, f]));
  for (const l of res.lines) {
    if (l.form !== "T1" || !/^\d{5}$/.test(l.line)) continue;
    if (l.value === 0 && !l.always) continue;
    const def = customPdf.get(l.line);
    t1[def ? pdfSuffix(def, year)! : `Line_${l.line}_Amount[0]`] = money(l.value);
  }
  // everything typed on the Every field page: memo lines, answers, dates, identification extras
  applyManual(T1_FIELDS, F, year, t1, t1Checks);
  // medical: the form wants the raw expenses on 33099 and works the threshold on lines 108–112
  if (line("33099") !== undefined) {
    const raw = num(ret.other.medicalExpenses);
    const threshold = Math.min(rules.FEDERAL.medicalThreshold, res.summary.netIncome * rules.FEDERAL.medicalRate);
    const after = Math.max(0, raw - threshold);
    t1["Line_33099_Amount[0]"] = money(raw);
    t1["Line114[0].Amount1[0]"] = money(res.summary.netIncome);
    t1["Line114[0].Amount2[0]"] = money(res.summary.netIncome * rules.FEDERAL.medicalRate);
    t1["Line115[0].Amount[0]"] = money(threshold);
    t1["Line116[0].Amount[0]"] = money(after);
    t1["Line_33200_Amount[0]"] = money(after + fv("33199"));
  } else if (fv("33199")) t1["Line_33200_Amount[0]"] = money(fv("33199"));
  // running totals and page-top carry-overs the form prints between the coded lines
  const S = res.summary;
  const selfEmpNet = sum("13500", "13700", "13900", "14100", "14300");
  const line21 = S.totalIncome - selfEmpNet - tl("14700");
  t1["Line23[0].Amount[0]"] = money(line21);
  if (selfEmpNet) { t1["Line29[0].Amount1[0]"] = money(selfEmpNet); t1["Line29[0].Amount2[0]"] = money(selfEmpNet); }
  t1["Line30[0].Amount[0]"] = money(line21 + selfEmpNet);
  t1["Line36[0].Amount[0]"] = money(S.totalIncome);
  t1["Line23400[0].Line19Amount[0]"] = money(S.totalIncome - tl("23300"));
  t1["Line59[0].Amount[0]"] = money(S.netIncome);
  const l84 = sum("30000", "30100", "30300", "30400", "30425", "30450", "30500");
  t1["Line89[0].Amount[0]"] = money(l84);
  t1["Line90[0].Amount[0]"] = money(l84);
  const l96 = sum("30800", "31000", "31200", "31217", "31220", "31240", "31260", "31270", "31285", "31300", "31350");
  t1["Line102[0].Amount1[0]"] = money(l96); t1["Line102[0].Amount2[0]"] = money(l96);
  const l98 = l84 + l96 + tl("31400");
  t1["Line104[0].Amount[0]"] = money(l98);
  const l101 = l98 + tl("31600") + tl("31800");
  t1["Line107[0].Amount[0]"] = money(l101);
  t1["Line112[0].Amount[0]"] = money(l101 + sum("31900", "32300", "32400", "32600"));
  t1[year <= 2024 ? "Line120[0].Percent[0]" : "Line120[0].Rate[0]"] = `${(rules.FEDERAL.creditRate * 100).toFixed(1).replace(/\.0$/, "")}%`;
  t1["Line124[0].Amount[0]"] = money(tl("40400") - tl("40424"));
  t1["Line127[0].Amount[0]"] = money(tl("35000"));
  const l125 = sum("35000", "40425", "40427");
  t1["Line130[0].Amount1[0]"] = money(l125); t1["Line130[0].Amount2[0]"] = money(l125);
  const l128 = tl("42900") + fv("surtaxOutsideCanada");
  t1["Line133[0].Amount[0]"] = money(l128);
  const l130 = l128 - tl("40500");
  t1["Line135[0].Amount[0]"] = money(l130);
  t1["Line137[0].Amount[0]"] = money(l130 + fv("itcRecapture"));
  const l41600 = sum("41000", "41200", "41400");
  if (l41600) { t1["Line_41600_Amount[0]"] = money(l41600); t1["Line_41700_Amount[0]"] = money(Math.max(0, tl("40600") - l41600)); }
  t1["Line148[0].Amount[0]"] = money(tl("42000"));
  t1["Line154[0].Amount[0]"] = money(tl("43500"));
  t1["Line172[0].Amount[0]"] = money(tl("43500") - tl("48200"));
  const l25700 = sum("24400", "24900", "24901", "25000", "25100", "25200", "25300", "25395", "25400", "25500", "25600") - tl("25999");
  if (l25700) t1["Line_25700_Amount[0]"] = money(l25700);
  // what the typed lines commit the filer to
  const typedMoney = fieldsForYear(T1_FIELDS, year).filter((f) => !f.auto && f.kind === "money" && f.role !== "memo" && fv(f.key));
  if (typedMoney.length) notes.push(`Typed by you on the Every field page, not checked by the app: ${typedMoney.map((f) => `line ${f.line ?? f.key} ${money(fv(f.key))}`).join("; ")}.`);
  for (const f of typedMoney) { const a = attachmentIn(f.label); if (a) attach.push(`${a} for line ${f.line ?? f.key}.`); }
  // Part A — federal tax on taxable income, the applicable bracket column (fields keep their legacy numbering 36–42)
  const ti = res.summary.taxableIncome;
  const brackets = rules.FEDERAL.brackets;
  let col = brackets.findIndex((b) => ti <= b.upTo) + 1;
  if (col === 0) col = brackets.length;
  const lower = col > 1 ? brackets[col - 2].upTo : 0;
  const baseTax = col > 1 ? brackets.slice(0, col - 1).reduce((s, b, i) => s + (b.upTo - (i ? brackets[i - 1].upTo : 0)) * b.rate, 0) : 0;
  t1[`Line36Amount${col}[0]`] = money(ti);
  t1[`Line38Amount${col}[0]`] = money(ti - lower);
  t1[`Line40Amount${col}[0]`] = money((ti - lower) * brackets[col - 1].rate);
  t1[`Line42Amount${col}[0]`] = money(baseTax + (ti - lower) * brackets[col - 1].rate);

  // ---------- provincial 428 ----------
  let p428: FormValues | null = null;
  let p428File: string | null = null;
  if (p.province !== "QC") {
    p428File = `${p.province.toLowerCase()}428.pdf`;
    p428 = {};
    const prov = rules.PROVINCES[p.province];
    const L = (n: string) => res.lines.find((l) => l.form === "428" && l.line === n)?.value;
    // Part A: taxable income and the applicable column
    p428["Line1[0].Amount[0]"] = money(ti);
    const pb = prov.brackets;
    let pc = pb.findIndex((b) => ti <= b.upTo) + 1;
    if (pc === 0) pc = pb.length;
    const plower = pc > 1 ? pb[pc - 2].upTo : 0;
    const pbase = pc > 1 ? pb.slice(0, pc - 1).reduce((s, b, i) => s + (b.upTo - (i ? pb[i - 1].upTo : 0)) * b.rate, 0) : 0;
    const colName = (row: number) => `Column${pc}[0].Line${row}[0].Amount[0]`;
    p428[colName(2)] = money(ti);
    p428[colName(4)] = money(ti - plower);
    p428[colName(6)] = money((ti - plower) * pb[pc - 1].rate);
    p428[colName(8)] = money(pbase + (ti - plower) * pb[pc - 1].rate);
    if (p.province === "MB") {
      // MB428 (2024 and 2025 share this layout) — line numbers from the form itself
      const put = (row: string, v: number | undefined) => { if (v !== undefined) p428![row] = money(v); };
      put("Line9[0].Amount[0]", L("58040"));
      put("Line10[0].Amount[0]", L("58080"));
      if (L("58120") !== undefined) { put("Line11[0].Amount[0]", prov.spouse.base); put("Line12[0].Amount[0]", p.spouseNetIncome); put("line13[0].Amount1[0]", L("58120")); put("line13[0].Amount2[0]", L("58120")); }
      const LS = (...ns: string[]) => ns.reduce((s, n) => s + (L(n) ?? 0), 0);
      applyManual(MB428_FIELDS, F, year, p428, []);
      if (p428["Line16[0].Amount1[0]"]) p428["Line16[0].Amount2[0]"] = p428["Line16[0].Amount1[0]"];
      put("Line22[0].Amount[0]", L("58305"));
      const sum18 = LS("58040", "58080", "58120", "58160", "58200");
      put("Line18[0].Amount[0]", sum18);
      put("Line19[0].Amount[0]", L("58240"));
      put("Line21[0].Amount[0]", L("58300"));
      const sum28 = LS("58240", "58300", "58305", "58315", "58316", "58325", "58326", "58330");
      put("Line28[0].Amount1[0]", sum28); put("Line28[0].Amount2[0]", sum28);
      put("Line29[0].Amount[0]", sum18 + sum28);
      put("Line30[0].Amount[0]", sum18 + sum28);
      put("Line31[0].Amount[0]", L("58360"));
      const l33 = sum18 + sum28 + LS("58360", "58400");
      put("Line33[0].Amount[0]", l33);
      put("Line34[0].Amount[0]", L("58440"));
      const l36 = l33 + LS("58440", "58480");
      put("Line36[0].Amount[0]", l36);
      put("Line37[0].Amount[0]", L("58520"));
      put("Line38[0].Amount[0]", L("58560"));
      const l42 = l36 + LS("58520", "58560", "58600", "58640", "61470");
      put("Line42[0].Amount[0]", l42);
      if (L("58689") !== undefined) {
        put("MedicalExpenses[0].Line43[0].Amount[0]", ret.other.medicalExpenses);
        put("MedicalExpenses[0].Line44[0].Amount[0]", res.summary.netIncome);
        put("MedicalExpenses[0].Line46[0].Amount[0]", res.summary.netIncome * 0.03);
        put("MedicalExpenses[0].Line47[0].Amount[0]", Math.min(prov.medicalThreshold, res.summary.netIncome * 0.03));
        put("MedicalExpenses[0].Line48[0].Amount[0]", L("58689"));
        put("Line50[0].Amount1[0]", LS("58689", "58729")); put("Line50[0].Amount2[0]", LS("58689", "58729"));
      } else if (L("58729")) { put("Line50[0].Amount1[0]", L("58729")); put("Line50[0].Amount2[0]", L("58729")); }
      put("Line51[0].Amount[0]", L("58800"));
      put("Line53[0].Amount[0]", L("58840"));
      if (L("58969") !== undefined) {
        const donations = Math.min(ret.other.donations + (res.lines.find((l) => l.line === "34900")?.from.length ? 0 : 0), 1e12);
        const first = Math.min(donations, prov.donations.firstTier);
        put("Line54[0].Amount1[0]", first); put("Line54[0].Amount2[0]", first * prov.donations.firstRate);
        put("Line55[0].Amount1[0]", Math.max(0, donations - first)); put("Line55[0].Amount2[0]", Math.max(0, donations - first) * prov.donations.secondRate);
        put("Line56[0].Amount1[0]", L("58969")); put("Line56[0].Amount2[0]", L("58969"));
      }
      put("Line57[0].Amount[0]", L("61500"));
      // Part C, in the form's order: tax on income, TOSI, credits, dividend credit, minimum-tax carryover, additions, then each credit line
      put("PartC[0].Line58[0].Amount[0]", L("8"));
      const l60 = LS("8", "61510");
      put("PartC[0].Line60[0].Amount[0]", l60);
      put("PartC[0].Line61[0].Amount[0]", L("61500"));
      put("PartC[0].Line62[0].Amount[0]", L("61520"));
      if (L("61540")) { put("PartC[0].Line63[0].Amount1[0]", (L("61540") ?? 0) * 2); put("PartC[0].Line63[0].Amount2[0]", L("61540")); }
      const l64 = LS("61500", "61520", "61540");
      put("PartC[0].Line64[0].Amount1[0]", l64); put("PartC[0].Line64[0].Amount2[0]", l64);
      const l65 = Math.max(0, l60 - l64);
      put("PartC[0].Line65[0].Amount[0]", l65);
      const l67 = l65 + (L("66") ?? 0);
      put("PartC[0].Line67[0].Amount[0]", l67);
      const step = (from: number, creditLine: string, row: string) => { const to = Math.max(0, from - (L(creditLine) ?? 0)); put(row, to); return to; };
      const l70 = step(l67, "69", "PartC[0].Line70[0].Amount[0]");
      const l72 = step(l70, "60800", "PartC[0].Line72[0].Amount[0]");
      put("PartC[0].Line74[0].Amount[0]", l72);
      const l76 = step(l72, "60830", "PartC[0].Line76[0].Amount[0]");
      const l78 = step(l76, "60850", "PartC[0].Line78[0].Amount[0]");
      step(l78, "60860", "PartC[0].Line80[0].Amount[0]");
      put("PartC[0].Line82[0].Amount[0]", L("82"));
    } else {
      // Other provinces: five-digit-coded fields are matched by suffix where the form uses them; the
      // rest of the 428 arithmetic is left for the filer. Tracked as a gap on the project page.
      for (const l of res.lines) if (l.form === "428" && /^\d{5}$/.test(l.line)) p428[`Line_${l.line}_Amount[0]`] = money(l.value);
      notes.push(`${prov.name}'s 428 is filled where its fields carry line codes; check the running totals on the form by hand — full line-by-line filling exists for Manitoba so far.`);
    }
  } else {
    notes.push("Quebec: the app fills the federal T1 only. File the TP-1 with Revenu Québec separately.");
  }

  // ---------- T776, one per property ----------
  const t776: FormValues[] = (ret.rentals ?? []).map((r) => {
    const t = rental(r);
    const v: FormValues = {};
    v["P1_Frm_Ln1_Grp1_inpt[0]"] = `${p.firstName} ${p.lastName}`.trim();
    if (p.sin.replace(/\D/g, "").length === 9) v["P1_Frm_Ln1_Grp2_inpt[0]"] = p.sin.replace(/\D/g, "");
    v["P1_Frm_Ln2_inpt1[0]"] = p.street.trim();
    v["P1_Frm_Ln2_inpt2[0]"] = p.city.trim();
    v["P1_Frm_Ln2_Grp1_inpt[0]"] = p.province;
    v["P1_Frm_Ln2_Grp2_input[0]"] = p.postalCode.replace(/\s+/g, "").toUpperCase();
    v["P1_Frm_Ln3_Grp2_inpt1[0]"] = `${ret.year}0101`;
    v["P1_Frm_Ln3_Grp1_grp1_inpt[0]"] = String(ret.year);
    v["P1_Frm_Ln3_Grp1_grp2_inpt[0]"] = "1231";
    if (r.ownershipShare !== 100) v["P1_Frm_Ln4_Grp1_inpt[0]"] = String(r.ownershipShare); // "your percentage of the partnership" (Grp2 is the industry code, pre-filled 531111 by the form)
    const rowCell = (n: number) => (year <= 2024 ? `P3_Frm_LnGrp1_inpt${n}[0]` : `P3_Frm_Row1_Cell${n}[0]`); // the property row is named differently on the 2024 T776
    v[rowCell(1)] = r.address.trim();
    v[rowCell(2)] = "1";
    v[rowCell(4)] = money(r.grossRents);
    v["P3_Frm_Ln8141_inpt[0]"] = money(r.grossRents);
    v["P3_Frm_Ln8230_inpt[0]"] = nz(r.otherIncome);
    v["P3_Frm_Ln8299_inpt[0]"] = money(t.gross);
    const personal = Math.max(0, Math.min(1, r.personalUsePct / 100));
    for (const e of RENTAL_EXPENSES) {
      const amt = r.expenses[e.key] ?? 0;
      if (!amt) continue;
      v[`P4_Frm_Ln${e.box}_inpt1[0]`] = money(amt);
      if (personal) v[`P4_Frm_Ln${e.box}_inpt2[0]`] = money(amt * personal);
    }
    v["P4_Frm_LnA_inpt[0]"] = money(t.expensesTotal);
    v["P4_Frm_Ln9949_inpt[0]"] = nz(t.expensesTotal * personal);
    v["P4_Frm_Ln1_inpt[0]"] = money(t.expensesDeductible);
    v["P4_Frm_Ln9369_inpt[0]"] = money(t.netBeforeCca);
    v["P4_Frm_Ln2_inpt[0]"] = money(t.netBeforeCcaShare);
    v["P4_Frm_Ln3_inpt[0]"] = money(t.netBeforeCcaShare);
    v["P4_Frm_Ln4_inpt[0]"] = money(t.netBeforeCcaShare);
    v["P4_Frm_Ln5_inpt[0]"] = money(t.netBeforeCcaShare);
    v["P4_Frm_Ln9936_inpt[0]"] = nz(t.cca);
    v["P4_Frm_Ln6_inpt[0]"] = money(t.net);
    v["P4_Frm_Ln9946_inpt[0]"] = money(t.net);
    // identification, partnership and co-owner fields typed for this property
    applyManual(T776_FIELDS, r.form ?? {}, year, v, []);
    if (v["Frm_Ln8140_inpt[0]"]) v[rowCell(3)] = v["Frm_Ln8140_inpt[0]"];
    return v;
  });

  // ---------- what to attach ----------
  attach.push("Every information slip: T4, T4A, T4E, T5, T3, T5008, T2202, RRSP and FHSA receipts.");
  if (res.lines.some((l) => l.form === "S7")) attach.push("Schedule 7 (RRSP and FHSA) — the app's Schedule 7 figures are on the line-by-line page.");
  if (res.lines.some((l) => l.line === "30800" || l.line === "22215")) attach.push("Schedule 8 (CPP contributions) — figures on the line-by-line page.");
  if (res.lines.some((l) => l.form === "S3")) attach.push("Schedule 3 (capital gains) — figures on the line-by-line page.");
  if (res.lines.some((l) => l.line === "32300" && l.value > 0)) attach.push("Schedule 11 (tuition) and the T2202.");
  if (res.lines.some((l) => l.line === "34900")) attach.push("Schedule 9 (donations) and the receipts.");
  if (res.lines.some((l) => l.line === "33099")) attach.push("Medical receipts.");
  if (ret.rentals?.length) attach.push(`Form T776 for each property (${ret.rentals.length} included in this PDF).`);
  attach.push("Sign and date page 8 of the T1 and add your telephone number.");
  return { t1, t1Checks, p428, p428File, t776, attach, notes };
}

// ---------- filling ----------

function setBySuffix(form: PDFForm, values: FormValues, filled: string[], missing: string[]) {
  const names = form.getFields().map((f) => f.getName());
  for (const [suffix, value] of Object.entries(values)) {
    if (value === "" || value === undefined) continue;
    let name = names.find((n) => n.endsWith(suffix));
    if (!name && /_Amount\[0\]$/.test(suffix)) {
      // some T1 lines print two boxes (a subtotal and the carried amount): Amount1 and Amount2
      const twins = names.filter((n) => n.endsWith(suffix.replace("_Amount[0]", "_Amount1[0]")) || n.endsWith(suffix.replace("_Amount[0]", "_Amount2[0]")));
      if (twins.length) { for (const tn of twins) { try { form.getTextField(tn).setText(value); } catch { /* not a text field */ } } filled.push(suffix); continue; }
    }
    if (!name) { missing.push(suffix); continue; }
    try {
      const f = form.getField(name);
      // instanceof, never constructor.name: the production build minifies class names
      if (f instanceof PDFTextField) { f.setText(value); filled.push(suffix); }
      else if (f instanceof PDFDropdown) {
        const opts = f.getOptions();
        const wanted = value.split("|"); // "MB|Manitoba": the forms' dropdowns list codes on one page and full names on another
        const opt = wanted.map((w) => opts.find((o) => o.toUpperCase() === w.toUpperCase()) ?? opts.find((o) => o.toUpperCase().startsWith(w.toUpperCase()))).find(Boolean);
        if (opt) { f.select(opt); filled.push(suffix); } else missing.push(suffix);
      } else if (f instanceof PDFRadioGroup) {
        const opts = f.getOptions();
        const opt = value.startsWith("#") ? opts[Number(value.slice(1))] : opts.find((o) => o === value);
        if (opt) { f.select(opt); filled.push(suffix); } else missing.push(suffix);
      } else missing.push(suffix);
    } catch { missing.push(suffix); }
  }
}

function checkBySuffix(form: PDFForm, suffixes: string[], filled: string[], missing: string[]) {
  const names = form.getFields().map((f) => f.getName());
  for (const suffix of suffixes) {
    const name = names.find((n) => n.endsWith(suffix));
    if (!name) { missing.push(suffix); continue; }
    const f = form.getField(name);
    if (f instanceof PDFCheckBox) { f.check(); filled.push(suffix); } else missing.push(suffix);
  }
}

async function fillOne(bytes: Uint8Array, values: FormValues, checks: string[] = []) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const form = doc.getForm();
  form.acroForm.dict.delete(PDFName.of("XFA"));
  const filled: string[] = [];
  const missing: string[] = [];
  setBySuffix(form, values, filled, missing);
  checkBySuffix(form, checks, filled, missing);
  form.updateFieldAppearances();
  form.flatten();
  return { doc, filled, missing };
}

export type BuildResult = { bytes: Uint8Array; pages: number; filled: number; missing: string[]; attach: string[]; notes: string[] };

/**
 * Build the print-ready return. `loadForm(file)` returns the bytes of public/forms/<year>/<file>
 * (fetch in the browser, fs in tests).
 */
export async function buildReturnPdf(ret: TaxReturn, res: Result, loadForm: (file: string) => Promise<Uint8Array>): Promise<BuildResult> {
  const plan = fieldValues(ret, res);
  const out = await PDFDocument.create();
  out.setTitle(`${ret.year} income tax return — ${ret.profile.firstName} ${ret.profile.lastName}`.trim());
  out.setProducer("Slipfold");
  let filledCount = 0;
  const missing: string[] = [];

  // checklist page
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const page = out.addPage([612, 792]);
  let y = 740;
  const write = (text: string, size = 11, f = font, color = rgb(0.1, 0.12, 0.14)) => { page.drawText(text, { x: 54, y, size, font: f, color }); y -= size + 6; };
  write(`${ret.year} income tax and benefit return — filing checklist`, 18, bold, rgb(0.12, 0.37, 0.55));
  write(`${ret.profile.firstName} ${ret.profile.lastName} · ${ret.profile.city}, ${ret.profile.province} · prepared with Slipfold`, 10, font, rgb(0.36, 0.39, 0.44));
  y -= 8;
  write("What follows in this PDF", 13, bold);
  write(`1. T1 Income Tax and Benefit Return (${ret.year}), filled.`);
  if (plan.p428File) write(`2. ${ret.profile.province}428 provincial tax form, filled.`);
  plan.t776.forEach((_, i) => write(`${plan.p428File ? 3 + i : 2 + i}. T776 Statement of Real Estate Rentals — ${ret.rentals[i].address || "property " + (i + 1)}.`));
  y -= 8;
  write("Before you mail it", 13, bold);
  for (const a of plan.attach) { for (const chunk of wrap(`• ${a}`, 92)) write(chunk, 10.5); }
  if (plan.notes.length) { y -= 8; write("Notes", 13, bold); for (const n of plan.notes) for (const chunk of wrap(`• ${n}`, 92)) write(chunk, 10.5); }
  y -= 8;
  write("Summary", 13, bold);
  write(`Total income ${fmt(res.summary.totalIncome)} · Net income ${fmt(res.summary.netIncome)} · Taxable income ${fmt(res.summary.taxableIncome)}`, 10.5);
  write(`Federal tax ${fmt(res.summary.federalTax)} · Provincial tax ${fmt(res.summary.provincialTax)} · Total payable ${fmt(res.summary.totalPayable)}`, 10.5);
  write(`${res.summary.balance < 0 ? "Refund" : "Balance owing"} ${fmt(Math.abs(res.summary.balance))}`, 12, bold, res.summary.balance < 0 ? rgb(0.18, 0.48, 0.29) : rgb(0.66, 0.23, 0.17));
  y -= 12;
  for (const chunk of wrap("This package was prepared from the values you entered; it is not tax advice and it has not been filed. Check it against your slips, sign the T1, and mail it to your CRA tax centre, or type the same figures into certified software to file electronically.", 100)) write(chunk, 9, font, rgb(0.36, 0.39, 0.44));

  const append = async (file: string, values: FormValues, checks: string[] = []) => {
    const bytes = await loadForm(file);
    const { doc, filled, missing: m } = await fillOne(bytes, values, checks);
    filledCount += filled.length;
    missing.push(...m.map((s) => `${file}: ${s}`));
    const pages = await out.copyPages(doc, doc.getPageIndices());
    for (const pg of pages) out.addPage(pg);
  };
  await append("t1.pdf", plan.t1, plan.t1Checks);
  if (plan.p428File && plan.p428) await append(plan.p428File, plan.p428);
  for (const v of plan.t776) await append("t776.pdf", v);

  return { bytes: await out.save(), pages: out.getPageCount(), filled: filledCount, missing, attach: plan.attach, notes: plan.notes };
}

const fmt = (n: number) => `$${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function wrap(text: string, width: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > width) { lines.push(cur.trim()); cur = w; } else cur += " " + w;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}
