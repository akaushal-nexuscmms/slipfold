import { useEffect, useMemo, useRef, useState } from "react";
import { compute, type Line, type Section } from "./lib/engine";
import { EXAMPLE_RETURN, SLIP_DEFS, emptyReturn, newSlip, num, type MaritalStatus, type Slip, type SlipKind, type TaxReturn } from "./lib/model";
import { PROVINCES, PROVINCE_LIST, TAX_YEAR, type ProvinceCode } from "./lib/rules2025";
import { deleteYear, exportJson, listYears, loadReturn, parseImport, rollForward, saveReturn } from "./lib/store";
import { Caption, Card, CopyButton, Field, MoneyInput, Notice, btnGhost, btnIcon, btnPrimary, inputCls, money } from "./ui";

type Tab = "profile" | "slips" | "other" | "carry" | "return" | "next" | "backup";
const TABS: { id: Tab; label: string }[] = [
  { id: "profile", label: "1 · You" },
  { id: "slips", label: "2 · Slips" },
  { id: "other", label: "3 · Other amounts" },
  { id: "carry", label: "4 · From last year" },
  { id: "return", label: "5 · Your return, line by line" },
  { id: "next", label: "6 · Next year" },
  { id: "backup", label: "Backup" },
];

const SECTIONS: { id: Section; title: string; blurb: string }[] = [
  { id: "income", title: "Step 2 — Total income", blurb: "Lines 10100 to 15000. Enter each amount exactly as shown; the 'from' list tells you which slip boxes were added." },
  { id: "deductions", title: "Step 3 — Net income", blurb: "Deductions come off before tax is calculated. Line 23600 drives benefits and several credits." },
  { id: "taxable", title: "Step 4 — Taxable income", blurb: "Usually the same as net income unless you have losses from other years." },
  { id: "fedCredits", title: "Step 5, Part A — Federal non-refundable credits", blurb: "Dollar amounts first (lines 30000–33500), then multiplied by 14.5%." },
  { id: "fedTax", title: "Step 5, Part B — Federal tax", blurb: "Tax on taxable income, minus credits." },
  { id: "provincial", title: "Step 6 — Provincial or territorial tax (form 428)", blurb: "The same structure as the federal part, with your province's amounts and rates." },
  { id: "refund", title: "Step 7 — Refund or balance owing", blurb: "What you already paid versus what you owe." },
];

export default function App() {
  const [ret, setRet] = useState<TaxReturn | null>(null);
  const [years, setYears] = useState<number[]>([]);
  const [tab, setTab] = useState<Tab>("profile");
  const [flash, setFlash] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);

  // hydrate: latest saved year, else a blank 2025 return
  useEffect(() => {
    (async () => {
      try {
        const ys = await listYears();
        setYears(ys);
        const y = ys[0] ?? TAX_YEAR;
        setRet((await loadReturn(y)) ?? emptyReturn(TAX_YEAR));
      } catch {
        setRet(emptyReturn(TAX_YEAR));
      }
    })();
  }, []);

  // persist, debounced
  useEffect(() => {
    if (!ret) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        await saveReturn(ret);
        setYears(await listYears());
      } catch {
        /* storage blocked */
      }
    }, 400);
  }, [ret]);

  const result = useMemo(() => (ret ? compute(ret) : null), [ret]);
  const say = (m: string) => {
    setFlash(m);
    setTimeout(() => setFlash(null), 2500);
  };

  if (!ret || !result) return <div className="p-6 text-sm text-ink-soft">Loading…</div>;

  const patch = (p: Partial<TaxReturn>) => setRet({ ...ret, ...p });
  const switchYear = async (y: number) => {
    const r = await loadReturn(y);
    if (r) {
      setRet(r);
      setTab("profile");
    }
  };
  const startNextYear = async () => {
    const next = rollForward(ret);
    await saveReturn(next);
    setYears(await listYears());
    setRet(next);
    setTab("slips");
    say(`${next.year} started from ${ret.year}: profile, issuers and carry-forwards copied.`);
  };

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-rule bg-surface-raised">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <Caption tone="accent">T1 Field Guide · Canada</Caption>
            <h1 className="text-xl font-semibold tracking-tight">Your {ret.year} return, every line computed and explained</h1>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-ink-soft">
              Tax year{" "}
              <select className="rounded-md border border-rule bg-surface px-2 py-1 text-sm" value={ret.year} onChange={(e) => switchYear(Number(e.target.value))}>
                {(years.includes(ret.year) ? years : [ret.year, ...years]).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <span className="hidden text-xs text-ink-soft sm:inline">Saved on this device only.</span>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${tab === t.id ? "bg-accent text-accent-ink" : "text-ink-soft hover:bg-rule/60"}`}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {flash && <div className="mx-auto max-w-6xl px-4 pt-3 text-sm text-good">{flash}</div>}

      <main className="mx-auto grid max-w-6xl gap-5 px-4 py-5">
        {ret.year !== TAX_YEAR && (
          <Notice tone="warn" title={`Rates for ${ret.year} are not published yet`} items={[`Every figure is computed with the ${TAX_YEAR} rules. Use this year to keep your slips and carry-forwards organised; the numbers will be right once the ${ret.year} rules are added.`]} />
        )}

        {tab === "profile" && <ProfileTab ret={ret} patch={patch} />}
        {tab === "slips" && <SlipsTab ret={ret} patch={patch} />}
        {tab === "other" && <OtherTab ret={ret} patch={patch} />}
        {tab === "carry" && <CarryTab ret={ret} patch={patch} />}
        {tab === "return" && <ReturnTab lines={result.lines} summary={result.summary} warnings={result.warnings} province={ret.profile.province} />}
        {tab === "next" && <NextTab lines={result.lines} year={ret.year} onStart={startNextYear} />}
        {tab === "backup" && (
          <BackupTab
            ret={ret}
            years={years}
            onLoadExample={() => {
              setRet({ ...EXAMPLE_RETURN });
              say("Example loaded — a single Manitoba employee with an RRSP and a donation.");
            }}
            onImport={async (rs) => {
              for (const r of rs) await saveReturn(r);
              setYears(await listYears());
              if (rs[0]) setRet(rs[0]);
              say(`Imported ${rs.length} return${rs.length === 1 ? "" : "s"}.`);
            }}
            onDelete={async (y) => {
              await deleteYear(y);
              const ys = await listYears();
              setYears(ys);
              setRet(ys[0] ? (await loadReturn(ys[0]))! : emptyReturn(TAX_YEAR));
              say(`${y} deleted.`);
            }}
          />
        )}
      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto max-w-6xl px-4 py-4 text-xs leading-relaxed text-ink-soft">
          This app prepares values; it does not file. Type them into any CRA-certified software or onto the paper T1, and check the
          result against that software before you send it. Nothing you enter leaves this device. Rules: {TAX_YEAR} federal and
          provincial figures, cited in the source.{" "}
          <a className="underline hover:text-ink" href="https://github.com/akaushal-nexuscmms/t1-fieldguide" target="_blank" rel="noreferrer">
            Source on GitHub
          </a>
          .
        </div>
      </footer>
    </div>
  );
}

// ---------------- 1 · You ----------------

function ProfileTab({ ret, patch }: { ret: TaxReturn; patch: (p: Partial<TaxReturn>) => void }) {
  const p = ret.profile;
  const set = <K extends keyof TaxReturn["profile"]>(k: K, v: TaxReturn["profile"][K]) => patch({ profile: { ...p, [k]: v } });
  const hasSpouse = p.maritalStatus === "married" || p.maritalStatus === "common-law";
  const [showSin, setShowSin] = useState(false);
  return (
    <Card title="Identification — the part that recurs every year">
      <p className="mb-3 text-sm text-ink-soft">Everything here is copied forward when you start next year's return. Your date of birth and province change what you can claim, so they are worth getting right.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name">
          <input className={inputCls} value={p.firstName} onChange={(e) => set("firstName", e.target.value)} />
        </Field>
        <Field label="Last name">
          <input className={inputCls} value={p.lastName} onChange={(e) => set("lastName", e.target.value)} />
        </Field>
        <Field label="Social insurance number (optional)" help="Stored only on this device, only if you type it. Leave blank if you would rather not — the numbers work without it. Shown masked.">
          <div className="flex gap-2">
            <input className={`${inputCls} font-mono`} type={showSin ? "text" : "password"} inputMode="numeric" value={p.sin} onChange={(e) => set("sin", e.target.value.replace(/[^\d ]/g, ""))} placeholder="123 456 789" autoComplete="off" />
            <button className={btnGhost} onClick={() => setShowSin((s) => !s)} type="button">
              {showSin ? "Hide" : "Show"}
            </button>
          </div>
        </Field>
        <Field label="Date of birth" help="Sets the age amount (65+) and the pension income amount.">
          <input className={inputCls} type="date" value={p.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
        </Field>
        <Field label="Street address" className="sm:col-span-2">
          <input className={inputCls} value={p.street} onChange={(e) => set("street", e.target.value)} />
        </Field>
        <Field label="City">
          <input className={inputCls} value={p.city} onChange={(e) => set("city", e.target.value)} />
        </Field>
        <Field label="Postal code">
          <input className={inputCls} value={p.postalCode} onChange={(e) => set("postalCode", e.target.value.toUpperCase())} />
        </Field>
        <Field label="Province or territory of residence on December 31" help="Decides which 428 form you file and every provincial rate. Quebec residents: this app does the federal T1 only; the TP-1 is filed separately with Revenu Québec.">
          <select className={inputCls} value={p.province} onChange={(e) => set("province", e.target.value as ProvinceCode)}>
            {PROVINCE_LIST.map((x) => (
              <option key={x.code} value={x.code}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Marital status on December 31" help="Married or common-law unlocks the spouse amount, and the CRA needs your partner's net income either way.">
          <select className={inputCls} value={p.maritalStatus} onChange={(e) => set("maritalStatus", e.target.value as MaritalStatus)}>
            {(["single", "married", "common-law", "separated", "divorced", "widowed"] as const).map((m) => (
              <option key={m} value={m}>
                {m[0].toUpperCase() + m.slice(1)}
              </option>
            ))}
          </select>
        </Field>
        {hasSpouse && (
          <>
            <Field label="Spouse or partner's first name">
              <input className={inputCls} value={p.spouseFirstName} onChange={(e) => set("spouseFirstName", e.target.value)} />
            </Field>
            <Field label="Spouse or partner's net income (their line 23600)" help="Needed for the spouse amount on line 30300 and for benefit calculations. Enter 0 only if it really was 0.">
              <MoneyInput value={p.spouseNetIncome} onChange={(n) => set("spouseNetIncome", n)} />
            </Field>
          </>
        )}
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="mt-1" checked={p.disabilityCertified} onChange={(e) => set("disabilityCertified", e.target.checked)} />
          <span>
            The CRA has approved a T2201 disability tax credit certificate for me
            <span className="block text-xs text-ink-soft">Unlocks line 31600 ($10,138 federally, {money(PROVINCES[p.province].disabilityAmount)} provincially). Only if approved — not merely applied for.</span>
          </span>
        </label>
      </div>
    </Card>
  );
}

// ---------------- 2 · Slips ----------------

function SlipsTab({ ret, patch }: { ret: TaxReturn; patch: (p: Partial<TaxReturn>) => void }) {
  const add = (kind: SlipKind) => patch({ slips: [...ret.slips, newSlip(kind)] });
  const update = (id: string, s: Partial<Slip>) => patch({ slips: ret.slips.map((x) => (x.id === id ? { ...x, ...s } : x)) });
  const remove = (id: string) => patch({ slips: ret.slips.filter((x) => x.id !== id) });
  const kinds = Object.keys(SLIP_DEFS) as SlipKind[];
  return (
    <>
      <Card title="Add a slip">
        <p className="mb-3 text-sm text-ink-soft">One card per slip, exactly as issued. Every box explains where its number ends up on the return.</p>
        <div className="flex flex-wrap gap-2">
          {kinds.map((k) => (
            <button key={k} className={btnGhost} onClick={() => add(k)} title={SLIP_DEFS[k].long}>
              + {SLIP_DEFS[k].name}
            </button>
          ))}
        </div>
      </Card>
      {ret.slips.length === 0 && <p className="text-sm text-ink-soft">No slips yet. Most people start with a T4.</p>}
      {ret.slips.map((s) => {
        const def = SLIP_DEFS[s.kind];
        return (
          <Card
            key={s.id}
            title={`${def.name} — ${s.issuer || "untitled"}`}
            action={
              <button className={btnIcon} onClick={() => remove(s.id)} aria-label="Remove slip">
                ×
              </button>
            }
          >
            <p className="mb-3 text-xs text-ink-soft">
              {def.long}. <i>{def.recurring}</i>
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label={def.issuerLabel} className="sm:col-span-2 lg:col-span-3">
                <input className={inputCls} value={s.issuer} onChange={(e) => update(s.id, { issuer: e.target.value })} />
              </Field>
              {def.boxes.map((b) => (
                <Field key={b.key} label={`Box ${b.box} — ${b.label}`} help={b.help}>
                  {b.kind === "text" ? (
                    <input className={inputCls} value={String(s.values[b.key] ?? "")} onChange={(e) => update(s.id, { values: { ...s.values, [b.key]: e.target.value } })} />
                  ) : b.kind === "months" ? (
                    <input className={`${inputCls} font-mono`} type="number" min={0} max={12} value={num(s.values[b.key]) || ""} onChange={(e) => update(s.id, { values: { ...s.values, [b.key]: Number(e.target.value) || 0 } })} />
                  ) : (
                    <MoneyInput value={num(s.values[b.key])} onChange={(n) => update(s.id, { values: { ...s.values, [b.key]: n } })} />
                  )}
                </Field>
              ))}
            </div>
          </Card>
        );
      })}
    </>
  );
}

// ---------------- 3 · Other amounts ----------------

function OtherTab({ ret, patch }: { ret: TaxReturn; patch: (p: Partial<TaxReturn>) => void }) {
  const o = ret.other;
  const set = <K extends keyof TaxReturn["other"]>(k: K, v: TaxReturn["other"][K]) => patch({ other: { ...o, [k]: v } });
  const M = (k: keyof TaxReturn["other"], label: string, help: string) => (
    <Field label={label} help={help}>
      <MoneyInput value={num(o[k] as number)} onChange={(n) => set(k, n as never)} />
    </Field>
  );
  return (
    <>
      <Card title="Income with no slip">
        <div className="grid gap-3 sm:grid-cols-2">
          {M("otherEmploymentIncome", "Other employment income (line 10400)", "Tips, casual pay, anything earned as an employee that never made it onto a T4.")}
          {M("otherInterest", "Interest with no T5 (line 12100)", "Banks skip the slip under $50 — it is still taxable. Add up your statements.")}
          {M("selfEmploymentNet", "Net self-employment income (lines 13500–13900)", "The net figure from your own T2125. This app does not prepare the T2125; it uses the result and computes the CPP you owe on it.")}
          {M("otherIncome", "Other income (line 13000)", "Anything taxable with no line of its own.")}
        </div>
      </Card>
      <Card title="Deductions">
        <div className="grid gap-3 sm:grid-cols-2">
          {M("unionDuesNotOnT4", "Union or professional dues paid directly (line 21200)", "Only the part not already in T4 box 44. Licence fees for a profession count.")}
          {M("carryingCharges", "Carrying charges and interest (line 22100)", "Investment counsel fees; interest on money borrowed to earn investment income. Not RRSP or TFSA fees, not brokerage commissions.")}
          {M("employmentExpenses", "Other employment expenses (line 22900)", "From a T777 with a signed T2200. Home office, vehicle, tools.")}
          {M("otherDeductions", "Other deductions (line 23200)", "Rare. EI repayments are picked up from the T4E automatically.")}
          <Field label="RRSP amount to deduct this year (line 20800)" help="Leave blank to deduct the maximum available. Enter a smaller amount to carry the rest forward — worth it when next year's income will be higher.">
            <MoneyInput value={o.rrspDeductToClaim ?? 0} onChange={(n) => set("rrspDeductToClaim", n === 0 ? null : n)} placeholder="maximum" />
          </Field>
        </div>
      </Card>
      <Card title="Credits">
        <div className="grid gap-3 sm:grid-cols-2">
          {M("medicalExpenses", "Medical expenses (line 33099)", "Total eligible expenses for any 12-month period ending in the tax year — prescriptions, dental, glasses, premiums for private health plans. Only the amount above the threshold counts; the app subtracts it.")}
          {M("donations", "Charitable donations with receipts (line 34900)", "Registered charities only. T4 box 46 is added automatically. Receipts under $200 total get the low rate; consider saving them (up to five years) or pooling with your spouse.")}
          {M("studentLoanInterest", "Student loan interest (line 31900)", "Government student loans only, not a bank line of credit. Unused amounts carry five years.")}
          {M("digitalNews", "Digital news subscriptions (line 31350)", "Qualifying Canadian journalism organisations, up to $500.")}
          {M("instalmentsPaid", "Tax paid by instalments (line 47600)", "Quarterly amounts you sent the CRA during the year.")}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={o.homeBuyer} onChange={(e) => set("homeBuyer", e.target.checked)} />
            <span>
              I bought my first home in {ret.year}
              <span className="block text-xs text-ink-soft">Home buyers' amount, line 31270 — $10,000 (worth $1,450 federally). Can be split with a spouse.</span>
            </span>
          </label>
        </div>
      </Card>
    </>
  );
}

// ---------------- 4 · From last year ----------------

function CarryTab({ ret, patch }: { ret: TaxReturn; patch: (p: Partial<TaxReturn>) => void }) {
  const c = ret.carry;
  const set = (k: keyof TaxReturn["carry"], v: number) => patch({ carry: { ...c, [k]: v } });
  return (
    <Card title="Numbers from your last Notice of Assessment">
      <p className="mb-3 text-sm text-ink-soft">
        These are the values people re-hunt every year. Enter them once; the Next year page computes what carries into {ret.year + 1}. Your NOA is in CRA My Account under “Tax returns”.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`RRSP deduction limit for ${ret.year}`} help="NOA, first page: “RRSP deduction limit for 2025”. The deduction on line 20800 cannot exceed it. Without it the app deducts nothing.">
          <MoneyInput value={c.rrspDeductionLimit} onChange={(n) => set("rrspDeductionLimit", n)} />
        </Field>
        <Field label="Unused RRSP contributions" help="NOA: contributions from earlier years you reported but have not yet deducted. Usually 0.">
          <MoneyInput value={c.unusedRrspContributions} onChange={(n) => set("unusedRrspContributions", n)} />
        </Field>
        <Field label={`FHSA participation room for ${ret.year}`} help="$8,000 for the year you opened the account plus up to $8,000 carried forward. CRA My Account shows it.">
          <MoneyInput value={c.fhsaRoom} onChange={(n) => set("fhsaRoom", n)} />
        </Field>
        <Field label="Unused federal tuition amounts" help="NOA: “unused federal tuition, education and textbook amounts”. Carries until used.">
          <MoneyInput value={c.tuitionFederal} onChange={(n) => set("tuitionFederal", n)} />
        </Field>
        <Field label="Unused provincial tuition amounts" help="Tracked separately from federal; also on the NOA.">
          <MoneyInput value={c.tuitionProvincial} onChange={(n) => set("tuitionProvincial", n)} />
        </Field>
        <Field label="Net capital losses of other years" help="NOA or last year's Schedule 3, at the 50% inclusion rate. Only usable against capital gains.">
          <MoneyInput value={c.netCapitalLosses} onChange={(n) => set("netCapitalLosses", n)} />
        </Field>
      </div>
    </Card>
  );
}

// ---------------- 5 · The return ----------------

function ReturnTab({ lines, summary, warnings, province }: { lines: Line[]; summary: ReturnType<typeof compute>["summary"]; warnings: string[]; province: ProvinceCode }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (k: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const visible = (l: Line) => l.value !== 0 || l.always;
  const asText = lines
    .filter((l) => l.section !== "carry" && visible(l))
    .map((l) => `${l.form === "T1" ? "" : l.form + " "}line ${l.line}\t${l.label}\t${l.value.toFixed(2)}`)
    .join("\n");
  const prov = PROVINCES[province];
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total income (15000)" value={money(summary.totalIncome)} />
        <Stat label="Taxable income (26000)" value={money(summary.taxableIncome)} />
        <Stat label="Total payable (43500)" value={money(summary.totalPayable)} sub={`marginal ${(summary.marginalRate * 100).toFixed(2)}% · average ${(summary.averageRate * 100).toFixed(1)}%`} />
        <Stat label={summary.balance < 0 ? "Refund (48400)" : "Balance owing (48500)"} value={money(Math.abs(summary.balance))} tone={summary.balance < 0 ? "good" : "danger"} />
      </div>
      {warnings.length > 0 && <Notice tone="warn" title="Check these before you file" items={warnings} />}
      <Card
        title="Line by line"
        action={
          <CopyButton text={asText} label="Copy all as text" />
        }
      >
        <p className="mb-3 text-sm text-ink-soft">Type each value onto the matching line. Tap a row to see what it is made of and why. Lines that do not apply to you are left out — every line shown is one you need to fill.</p>
        {SECTIONS.map((sec) => {
          const rows = lines.filter((l) => l.section === sec.id && visible(l));
          if (!rows.length) return null;
          return (
            <div key={sec.id} className="mb-5">
              <Caption tone="accent">{sec.id === "provincial" ? `Step 6 — ${prov.name} tax (form ${prov.form})` : sec.title}</Caption>
              <p className="mb-2 text-xs text-ink-soft">{sec.blurb}</p>
              <div className="overflow-hidden rounded-lg border border-rule">
                {rows.map((l) => {
                  const k = `${l.form}-${l.line}`;
                  const isOpen = open.has(k);
                  return (
                    <div key={k} className="border-b border-rule last:border-b-0">
                      <button className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface" onClick={() => toggle(k)}>
                        <span className="w-20 shrink-0 font-mono text-xs text-ink-soft">
                          {l.form !== "T1" && <span className="block text-[10px]">{l.form}</span>}
                          {l.line}
                        </span>
                        <span className="min-w-0 flex-1 text-sm">
                          {l.label}
                          {l.note && <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-[10.5px] font-medium text-accent">check</span>}
                        </span>
                        <span className="shrink-0 font-mono text-sm tabular-nums">{money(l.value)}</span>
                        <span className="w-4 shrink-0 text-xs text-ink-soft">{isOpen ? "▾" : "▸"}</span>
                      </button>
                      {isOpen && (
                        <div className="border-t border-rule bg-surface px-3 py-3 text-sm">
                          <p>{l.explain}</p>
                          {l.from.length > 0 && (
                            <ul className="mt-2 list-disc pl-5 font-mono text-xs text-ink-soft">
                              {l.from.map((f, i) => (
                                <li key={i}>{f}</li>
                              ))}
                            </ul>
                          )}
                          {l.note && <p className="mt-2 text-xs text-warn">{l.note}</p>}
                          <div className="mt-2">
                            <CopyButton text={l.value.toFixed(2)} label="Copy value" />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </Card>
    </>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "danger" }) {
  return (
    <div className="rounded-xl border border-rule bg-surface-raised p-3">
      <Caption>{label}</Caption>
      <div className={`mt-1 font-mono text-xl font-semibold ${tone === "good" ? "text-good" : tone === "danger" ? "text-danger" : ""}`}>{value}</div>
      {sub && <div className="text-xs text-ink-soft">{sub}</div>}
    </div>
  );
}

// ---------------- 6 · Next year ----------------

function NextTab({ lines, year, onStart }: { lines: Line[]; year: number; onStart: () => void }) {
  const rows = lines.filter((l) => l.section === "carry" && (l.value !== 0 || l.always));
  return (
    <Card title={`What carries into ${year + 1}`} action={<button className={btnPrimary} onClick={onStart}>Start {year + 1} from this return</button>}>
      <p className="mb-3 text-sm text-ink-soft">
        These balances are yours to keep track of; the Notice of Assessment confirms them. Starting next year's return copies your profile, every employer and payer (amounts cleared), and these carry-forwards, so next spring you only type the new numbers.
      </p>
      <div className="overflow-hidden rounded-lg border border-rule">
        {rows.map((l) => (
          <div key={l.line} className="border-b border-rule px-3 py-2 last:border-b-0">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">{l.label}</span>
              <span className="font-mono text-sm tabular-nums">{money(l.value)}</span>
            </div>
            <p className="mt-0.5 text-xs text-ink-soft">{l.explain}</p>
            {l.from.length > 0 && <p className="font-mono text-[11px] text-ink-soft">{l.from.join(" · ")}</p>}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ---------------- Backup ----------------

function BackupTab({ ret, years, onLoadExample, onImport, onDelete }: { ret: TaxReturn; years: number[]; onLoadExample: () => void; onImport: (rs: TaxReturn[]) => void; onDelete: (y: number) => void }) {
  const [err, setErr] = useState<string | null>(null);
  const exportAll = async () => {
    const all: TaxReturn[] = [];
    for (const y of years) {
      const r = await loadReturn(y);
      if (r) all.push(r);
    }
    if (!all.length) all.push(ret);
    const blob = new Blob([exportJson(all)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `t1-fieldguide-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Card title="Backup, restore, example">
      <p className="mb-3 text-sm text-ink-soft">
        Your returns live in this browser's storage and nowhere else. Export a file before clearing the browser or switching devices; the file contains everything you typed, including your SIN if you entered one — keep it somewhere private.
      </p>
      <div className="flex flex-wrap gap-2">
        <button className={btnPrimary} onClick={exportAll}>
          Export all years (.json)
        </button>
        <label className={`${btnGhost} cursor-pointer`}>
          Import a backup
          <input
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                onImport(parseImport(await f.text()));
                setErr(null);
              } catch (x) {
                setErr(x instanceof Error ? x.message : "Could not read that file.");
              }
            }}
          />
        </label>
        <button className={btnGhost} onClick={onLoadExample}>
          Load the example return
        </button>
        <button className={`${btnGhost} text-danger`} onClick={() => confirm(`Delete the ${ret.year} return from this device?`) && onDelete(ret.year)}>
          Delete {ret.year}
        </button>
      </div>
      {err && <p className="mt-2 text-sm text-danger">{err}</p>}
      <p className="mt-3 text-xs text-ink-soft">Years on this device: {years.length ? years.join(", ") : "none saved yet"}.</p>
    </Card>
  );
}
