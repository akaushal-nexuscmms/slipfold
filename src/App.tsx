import { useEffect, useMemo, useRef, useState } from "react";
import { compute, rental, type Line, type Result, type Section } from "./lib/engine";
import { EXAMPLE_RETURN, RENTAL_EXPENSES, SLIP_DEFS, emptyReturn, newRental, newSlip, num, type MaritalStatus, type RentalProperty, type Slip, type SlipKind, type TaxReturn } from "./lib/model";
import { LATEST_YEAR, SUPPORTED_YEARS, getRules, isSupportedYear, type ProvinceCode } from "./lib/rules";
import { deleteYear, exportJson, getVaultMeta, isEncryptedBackup, listYears, loadReturn, parseImport, removePassphrase, rollForward, saveReturn, setPassphrase, unlock } from "./lib/store";
import { forgetKey, recallKey, rememberKey, type VaultMeta } from "./lib/crypto";
import { Caption, Card, CopyButton, Field, MoneyInput, Notice, btnGhost, btnIcon, btnPrimary, inputCls, money } from "./ui";

type Tab = "profile" | "slips" | "rental" | "other" | "carry" | "return" | "next" | "backup";
const TABS: { id: Tab; label: string }[] = [
  { id: "profile", label: "1 · You" },
  { id: "slips", label: "2 · Slips" },
  { id: "rental", label: "3 · Rental (T776)" },
  { id: "other", label: "4 · Other amounts" },
  { id: "carry", label: "5 · From last year" },
  { id: "return", label: "6 · Your return, line by line" },
  { id: "next", label: "7 · Next year" },
  { id: "backup", label: "Backup" },
];

const SECTIONS: { id: Section; title: string; blurb: string }[] = [
  { id: "income", title: "Step 2 — Total income", blurb: "Lines 10100 to 15000. Enter each amount exactly as shown; the 'from' list tells you which slip boxes were added." },
  { id: "deductions", title: "Step 3 — Net income", blurb: "Deductions come off before tax is calculated. Line 23600 drives benefits and several credits." },
  { id: "taxable", title: "Step 4 — Taxable income", blurb: "Usually the same as net income unless you have losses from other years." },
  { id: "fedCredits", title: "Step 5, Part A — Federal non-refundable credits", blurb: "Dollar amounts first (lines 30000–33500), then multiplied by the lowest federal rate." },
  { id: "fedTax", title: "Step 5, Part B — Federal tax", blurb: "Tax on taxable income, minus credits." },
  { id: "provincial", title: "Step 6 — Provincial or territorial tax (form 428)", blurb: "The same structure as the federal part, with your province's amounts and rates." },
  { id: "refund", title: "Step 7 — Refund or balance owing", blurb: "What you already paid versus what you owe." },
];

export default function App() {
  const [ret, setRet] = useState<TaxReturn | null>(null);
  const [years, setYears] = useState<number[]>([]);
  const [tab, setTab] = useState<Tab>("profile");
  const [flash, setFlash] = useState<string | null>(null);
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [vault, setVault] = useState<VaultMeta | null>(null);
  const [locked, setLocked] = useState(false);
  const saveTimer = useRef<number | null>(null);

  // hydrate: if a passphrase is set and this tab has not unlocked, show the lock screen;
  // otherwise load the latest saved year, else a blank 2025 return
  const hydrate = async (k: CryptoKey | null) => {
    try {
      const ys = await listYears();
      setYears(ys);
      const y = ys[0] ?? LATEST_YEAR;
      setRet((await loadReturn(y, k)) ?? emptyReturn(LATEST_YEAR));
    } catch {
      setRet(emptyReturn(LATEST_YEAR));
    }
  };
  useEffect(() => {
    (async () => {
      const meta = await getVaultMeta().catch(() => null);
      setVault(meta);
      if (meta) {
        const k = await recallKey();
        if (!k) {
          setLocked(true);
          return;
        }
        setKey(k);
        await hydrate(k);
      } else await hydrate(null);
    })();
  }, []);

  // persist, debounced
  useEffect(() => {
    if (!ret) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        await saveReturn(ret, key);
        setYears(await listYears());
      } catch {
        /* storage blocked */
      }
    }, 400);
  }, [ret, key]);

  const result = useMemo(() => (ret ? compute(ret) : null), [ret]);
  const say = (m: string) => {
    setFlash(m);
    setTimeout(() => setFlash(null), 2500);
  };

  if (locked)
    return (
      <LockScreen
        onUnlock={async (pass) => {
          const k = await unlock(pass);
          await rememberKey(k);
          setKey(k);
          setLocked(false);
          await hydrate(k);
        }}
      />
    );
  if (!ret || !result) return <div className="p-6 text-sm text-ink-soft">Loading…</div>;

  const patch = (p: Partial<TaxReturn>) => setRet({ ...ret, ...p });
  const switchYear = async (y: number) => {
    const r = await loadReturn(y, key);
    if (r) {
      setRet(r);
      setTab("profile");
    }
  };
  const startYear = async (y: number) => {
    const existing = await loadReturn(y, key);
    const r = existing ?? { ...emptyReturn(y), profile: { ...ret.profile } };
    if (!existing) await saveReturn(r, key);
    setYears(await listYears());
    setRet(r);
    setTab(existing ? "profile" : "slips");
    if (!existing) say(`Blank ${y} return started with your profile copied.`);
  };
  const startNextYear = async () => {
    const next = rollForward(ret);
    await saveReturn(next, key);
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
            <Caption tone="accent">Slipfold · Canada</Caption>
            <h1 className="text-xl font-semibold tracking-tight">Your {ret.year} return, every line computed and explained</h1>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-ink-soft">
              Tax year{" "}
              <select className="rounded-md border border-rule bg-surface px-2 py-1 text-sm" value={ret.year} onChange={(e) => switchYear(Number(e.target.value))}>
                {(years.includes(ret.year) ? years : [ret.year, ...years]).sort((a, b) => b - a).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            {SUPPORTED_YEARS.filter((y) => !years.includes(y) && y !== ret.year).map((y) => (
              <button key={y} className={btnGhost} onClick={() => startYear(y)} title={`Start a ${y} return (rules for ${y} are built in)`}>
                + {y} return
              </button>
            ))}
            <span className="hidden text-xs text-ink-soft sm:inline">{vault ? "Encrypted on this device." : "Saved on this device only."}</span>
            {vault && (
              <button
                className={btnGhost}
                onClick={() => {
                  forgetKey();
                  setKey(null);
                  setRet(null);
                  setLocked(true);
                }}
              >
                Lock
              </button>
            )}
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
        {!isSupportedYear(ret.year) && (
          <Notice tone="warn" title={`Rates for ${ret.year} are not built in yet`} items={[`Every figure is computed with the ${LATEST_YEAR} rules. Use this year to keep your slips and carry-forwards organised; the numbers will be right once the ${ret.year} rules are added. Years built in: ${SUPPORTED_YEARS.join(", ")}.`]} />
        )}

        {tab === "profile" && <ProfileTab ret={ret} patch={patch} />}
        {tab === "slips" && <SlipsTab ret={ret} patch={patch} />}
        {tab === "rental" && <RentalTab ret={ret} patch={patch} />}
        {tab === "other" && <OtherTab ret={ret} patch={patch} />}
        {tab === "carry" && <CarryTab ret={ret} patch={patch} />}
        {tab === "return" && <ReturnTab ret={ret} result={result} lines={result.lines} summary={result.summary} warnings={result.warnings} province={ret.profile.province} year={ret.year} />}
        {tab === "next" && <NextTab lines={result.lines} year={ret.year} onStart={startNextYear} />}
        {tab === "backup" && (
          <BackupTab
            ret={ret}
            years={years}
            vault={vault}
            cryptoKey={key}
            onPassphrase={async (pass) => {
              const k = await setPassphrase(pass, key);
              await rememberKey(k);
              setKey(k);
              setVault(await getVaultMeta());
              say(vault ? "Passphrase changed; every stored year was re-encrypted." : "Passphrase set; every stored year is now encrypted on this device.");
            }}
            onRemovePassphrase={async () => {
              if (!key) return;
              await removePassphrase(key);
              forgetKey();
              setKey(null);
              setVault(null);
              say("Passphrase removed; returns are stored in the clear again.");
            }}
            onLoadExample={() => {
              setRet({ ...EXAMPLE_RETURN });
              say("Example loaded — a single Manitoba employee with an RRSP and a donation.");
            }}
            onImport={async (rs) => {
              for (const r of rs) await saveReturn(r, key);
              setYears(await listYears());
              if (rs[0]) setRet(rs[0]);
              say(`Imported ${rs.length} return${rs.length === 1 ? "" : "s"}.`);
            }}
            onDelete={async (y) => {
              await deleteYear(y);
              const ys = await listYears();
              setYears(ys);
              setRet(ys[0] ? (await loadReturn(ys[0], key))! : emptyReturn(LATEST_YEAR));
              say(`${y} deleted.`);
            }}
          />
        )}
      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto max-w-6xl px-4 py-4 text-xs leading-relaxed text-ink-soft">
          This app prepares values; it does not file. Type them into any CRA-certified software or onto the paper T1, and check the
          result against that software before you send it. Nothing you enter leaves this device. Rules built in: {SUPPORTED_YEARS.join(" and ")}, every figure cited in the source.{" "}
          <a className="underline hover:text-ink" href="https://github.com/akaushal-nexuscmms/slipfold" target="_blank" rel="noreferrer">
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
  const { PROVINCES, PROVINCE_LIST, FEDERAL } = getRules(ret.year);
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
            <span className="block text-xs text-ink-soft">Unlocks line 31600 ({money(FEDERAL.disabilityAmount)} federally, {money(PROVINCES[p.province].disabilityAmount)} provincially). Only if approved — not merely applied for.</span>
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

// ---------------- 3 · Rental (T776) ----------------

function RentalTab({ ret, patch }: { ret: TaxReturn; patch: (p: Partial<TaxReturn>) => void }) {
  const rentals = ret.rentals ?? [];
  const update = (id: string, p: Partial<RentalProperty>) => patch({ rentals: rentals.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  const remove = (id: string) => patch({ rentals: rentals.filter((r) => r.id !== id) });
  return (
    <>
      <Card title="Rental properties — Statement of Real Estate Rentals (T776)" action={<button className={btnPrimary} onClick={() => patch({ rentals: [...rentals, newRental()] })}>+ Add property</button>}>
        <p className="text-sm text-ink-soft">
          One statement per property. The app computes net rental income (or loss) for line 12600, applies your ownership share and any personal-use split, and handles capital cost allowance with the rule that it cannot create a loss. A rental loss reduces your total income — which is why line 15000 can be lower than your T4.
        </p>
      </Card>
      {rentals.length === 0 && <p className="text-sm text-ink-soft">No rental properties. Add one if you rented out a house, condo, room or basement suite.</p>}
      {rentals.map((r) => {
        const t = rental(r);
        return (
          <Card
            key={r.id}
            title={`T776 — ${r.address.trim() || "untitled property"}`}
            action={
              <button className={btnIcon} onClick={() => remove(r.id)} aria-label="Remove property">
                ×
              </button>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Property address" help="Recurs every year; the CRA wants it on the T776." className="sm:col-span-2 lg:col-span-3">
                <input className={inputCls} value={r.address} onChange={(e) => update(r.id, { address: e.target.value })} />
              </Field>
              <Field label="Your ownership share (%)" help="100 if it is yours alone. Co-owners each report their share of the same statement; a spouse who is a co-owner files their own T776 with their share.">
                <input className={`${inputCls} font-mono`} type="number" min={0} max={100} value={r.ownershipShare} onChange={(e) => update(r.id, { ownershipShare: Number(e.target.value) || 0 })} />
              </Field>
              <Field label="Personal-use portion (%)" help="If you rent part of your own home, the share you live in. Expenses are reduced by this share; rents are not. Zero for a property you don't live in.">
                <input className={`${inputCls} font-mono`} type="number" min={0} max={100} value={r.personalUsePct} onChange={(e) => update(r.id, { personalUsePct: Number(e.target.value) || 0 })} />
              </Field>
              <Field label="Gross rents (line 8141)" help="All rent received for the year for the whole property, before any split.">
                <MoneyInput value={r.grossRents} onChange={(n) => update(r.id, { grossRents: n })} />
              </Field>
              <Field label="Other rental income (line 8230)" help="Parking, laundry, storage, anything the tenant pays beyond rent.">
                <MoneyInput value={r.otherIncome} onChange={(n) => update(r.id, { otherIncome: n })} />
              </Field>
            </div>
            <Caption tone="accent">Expenses — current costs of earning the rent (full amounts; the app applies the personal-use share)</Caption>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {RENTAL_EXPENSES.map((e) => (
                <Field key={e.key} label={`Line ${e.box} — ${e.label}`} help={e.help}>
                  <MoneyInput value={num(r.expenses[e.key])} onChange={(n) => update(r.id, { expenses: { ...r.expenses, [e.key]: n } })} />
                </Field>
              ))}
            </div>
            <Caption tone="accent">Capital cost allowance (optional)</Caption>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <Field label="Opening UCC of the building (Class 1)" help="Undepreciated capital cost at the start of the year, from last year's T776. Zero if you have never claimed CCA and made no additions. Land is never included.">
                <MoneyInput value={r.ucc} onChange={(n) => update(r.id, { ucc: n })} />
              </Field>
              <Field label="Capital additions this year" help="Building cost (excluding land) if bought this year, or capital improvements: new roof, kitchen, addition. Only half counts for CCA in the year added.">
                <MoneyInput value={r.additions} onChange={(n) => update(r.id, { additions: n })} />
              </Field>
              <Field label="CCA to claim" help={`Leave blank for the maximum (${money(t.ccaMax)} this year). Enter 0 to skip CCA — common when you plan to sell, because claimed CCA is recaptured as income and can cost you part of the principal residence exemption on a home you partly rent.`}>
                <MoneyInput value={r.ccaClaim ?? 0} onChange={(n) => update(r.id, { ccaClaim: n === 0 ? null : n })} placeholder="maximum" />
              </Field>
            </div>
            <div className="mt-3 grid gap-1 rounded-lg border border-rule bg-surface p-3 font-mono text-xs sm:grid-cols-2">
              <span>Gross income (8299)</span><span className="text-right">{money(t.gross)}</span>
              <span>Deductible expenses</span><span className="text-right">{money(t.expensesDeductible)}</span>
              <span>Net before CCA, your share (9369)</span><span className={`text-right ${t.netBeforeCcaShare < 0 ? "text-danger" : ""}`}>{money(t.netBeforeCcaShare)}</span>
              <span>CCA claimed (9936)</span><span className="text-right">{money(t.cca)}</span>
              <span className="font-semibold">Net rental income (loss) → line 12600</span><span className={`text-right font-semibold ${t.net < 0 ? "text-danger" : ""}`}>{money(t.net)}</span>
              <span>Closing UCC (carries to next year)</span><span className="text-right">{money(t.closingUcc)}</span>
            </div>
          </Card>
        );
      })}
    </>
  );
}

// ---------------- 4 · Other amounts ----------------

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

function ReturnTab({ ret, result, lines, summary, warnings, province, year }: { ret: TaxReturn; result: Result; lines: Line[]; summary: ReturnType<typeof compute>["summary"]; warnings: string[]; province: ProvinceCode; year: number }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfMsg, setPdfMsg] = useState<string | null>(null);
  const downloadPdf = async () => {
    setPdfBusy(true);
    setPdfMsg(null);
    try {
      const { buildReturnPdf } = await import("./lib/pdf");
      const base = import.meta.env.BASE_URL;
      const out = await buildReturnPdf(ret, result, async (file) => {
        const r = await fetch(`${base}forms/${ret.year}/${file}`);
        if (!r.ok) throw new Error(`Could not load ${file} for ${ret.year}`);
        return new Uint8Array(await r.arrayBuffer());
      });
      const blob = new Blob([out.bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${ret.year}-return-${(ret.profile.lastName || "slipfold").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setPdfMsg(`${out.pages} pages, ${out.filled} fields filled. Page 1 is your checklist${out.missing.length ? `; ${out.missing.length} field${out.missing.length === 1 ? "" : "s"} the form did not have were skipped` : ""}.`);
    } catch (e) {
      setPdfMsg(e instanceof Error ? e.message : "Could not build the PDF.");
    } finally {
      setPdfBusy(false);
    }
  };
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
  const prov = getRules(year).PROVINCES[province];
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
        title="CRA forms, filled"
        action={
          <button className={btnPrimary} onClick={downloadPdf} disabled={pdfBusy || !isSupportedYear(year)} title={isSupportedYear(year) ? undefined : `The CRA has not published ${year} forms yet`}>
            {pdfBusy ? "Filling the forms…" : isSupportedYear(year) ? "Download the filled return (PDF)" : `No ${year} forms yet`}
          </button>
        }
      >
        <p className="text-sm text-ink-soft">
          The CRA's own {year} forms — the T1, your {province === "QC" ? "federal return only" : `${province}428`}
          {ret.rentals?.length ? ` and a T776 for each of your ${ret.rentals.length} propert${ret.rentals.length === 1 ? "y" : "ies"}` : ""} — filled with the values above, behind a one-page
          checklist of what to attach and where to sign. Print it, sign page 8 of the T1, attach your slips, and mail it to your tax centre; or use it as the
          reference while you type the same figures into certified software. Built on this device; nothing is uploaded.
        </p>
        {pdfMsg && <p className="mt-2 text-xs text-ink-soft">{pdfMsg}</p>}
      </Card>
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

function BackupTab({
  ret,
  years,
  vault,
  cryptoKey,
  onPassphrase,
  onRemovePassphrase,
  onLoadExample,
  onImport,
  onDelete,
}: {
  ret: TaxReturn;
  years: number[];
  vault: VaultMeta | null;
  cryptoKey: CryptoKey | null;
  onPassphrase: (pass: string) => Promise<void>;
  onRemovePassphrase: () => Promise<void>;
  onLoadExample: () => void;
  onImport: (rs: TaxReturn[]) => void;
  onDelete: (y: number) => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingImport, setPendingImport] = useState<string | null>(null);
  const [importPass, setImportPass] = useState("");
  const exportAll = async () => {
    const all: TaxReturn[] = [];
    for (const y of years) {
      const r = await loadReturn(y, cryptoKey);
      if (r) all.push(r);
    }
    if (!all.length) all.push(ret);
    const blob = new Blob([await exportJson(all, cryptoKey, vault)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `slipfold-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <Card title={vault ? "Passphrase — set" : "Passphrase — not set"}>
        <p className="mb-3 text-sm text-ink-soft">
          {vault
            ? "Every stored year is encrypted with a key derived from your passphrase (PBKDF2, AES-256-GCM). Closing the tab locks it. There is no recovery: a forgotten passphrase means the data is gone, so export a backup you can read."
            : "Without a passphrase your returns sit in the browser's storage in the clear — anyone with this profile on this computer can read them, including a SIN. Set one before you type real numbers."}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={vault ? "New passphrase" : "Passphrase"} help="A sentence you will remember beats eight random characters. Minimum 8.">
            <input className={inputCls} type="password" autoComplete="new-password" value={pass1} onChange={(e) => setPass1(e.target.value)} />
          </Field>
          <Field label="Repeat it">
            <input className={inputCls} type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className={btnPrimary}
            disabled={busy || pass1.length < 8 || pass1 !== pass2}
            onClick={async () => {
              setBusy(true);
              try {
                await onPassphrase(pass1);
                setPass1("");
                setPass2("");
                setErr(null);
              } catch (x) {
                setErr(x instanceof Error ? x.message : "Could not set the passphrase.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Encrypting…" : vault ? "Change passphrase" : "Set passphrase and encrypt"}
          </button>
          {vault && (
            <button className={`${btnGhost} text-danger`} onClick={() => confirm("Store your returns unencrypted again?") && onRemovePassphrase()}>
              Remove passphrase
            </button>
          )}
          {pass1 && pass1 !== pass2 && <span className="self-center text-xs text-warn">The two entries differ.</span>}
        </div>
      </Card>
      <Card title="Backup, restore, example">
      <p className="mb-3 text-sm text-ink-soft">
        Your returns live in this browser's storage and nowhere else. Export a file before clearing the browser or switching devices.{" "}
        {vault ? "With a passphrase set, the file is encrypted with it; you will need the same passphrase to import it." : "Without a passphrase the file is plain text and contains everything you typed, including your SIN if you entered one — keep it somewhere private."}
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
              const text = await f.text();
              e.target.value = "";
              if (isEncryptedBackup(text)) {
                setPendingImport(text);
                setErr(null);
                return;
              }
              try {
                onImport(await parseImport(text));
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
      {pendingImport && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-rule bg-surface p-3">
          <Field label="This backup is encrypted — passphrase it was exported with" className="min-w-64 flex-1">
            <input className={inputCls} type="password" value={importPass} onChange={(e) => setImportPass(e.target.value)} />
          </Field>
          <button
            className={btnPrimary}
            onClick={async () => {
              try {
                onImport(await parseImport(pendingImport, importPass));
                setPendingImport(null);
                setImportPass("");
                setErr(null);
              } catch (x) {
                setErr(x instanceof Error ? x.message : "Could not read that file.");
              }
            }}
          >
            Import
          </button>
          <button className={btnGhost} onClick={() => setPendingImport(null)}>
            Cancel
          </button>
        </div>
      )}
      {err && <p className="mt-2 text-sm text-danger">{err}</p>}
      <p className="mt-3 text-xs text-ink-soft">Years on this device: {years.length ? years.join(", ") : "none saved yet"}.</p>
      </Card>
    </>
  );
}

function LockScreen({ onUnlock }: { onUnlock: (pass: string) => Promise<void> }) {
  const [pass, setPass] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      await onUnlock(pass);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Could not unlock.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-4 text-ink">
      <div className="w-full max-w-sm rounded-xl border border-rule bg-surface-raised p-5 shadow-sm">
        <Caption tone="accent">Slipfold</Caption>
        <h1 className="mt-1 text-lg font-semibold">Unlock your returns</h1>
        <p className="mt-1 text-sm text-ink-soft">They are encrypted on this device with your passphrase. Nothing was sent anywhere.</p>
        <input
          className={`${inputCls} mt-3`}
          type="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Passphrase"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && pass && go()}
        />
        {err && <p className="mt-2 text-sm text-danger">{err}</p>}
        <button className={`${btnPrimary} mt-3 w-full`} disabled={busy || !pass} onClick={go}>
          {busy ? "Unlocking…" : "Unlock"}
        </button>
        <p className="mt-3 text-xs text-ink-soft">Forgot it? There is no reset — the data cannot be recovered without the passphrase. You can clear this site's storage in the browser and start again, or import a backup.</p>
      </div>
    </div>
  );
}
