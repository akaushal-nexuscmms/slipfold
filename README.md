# Slipfold

Your slips, folded into a return. Every line of your Canadian T1 computed and explained, so you can fill in your return
accurately — in any CRA-certified software or on the paper form. Save the fields that
recur (you, your employers, your carry-forwards) and start next year from this one.

**It does not file.** It gives you the values, tells you which slip box each came from and
why the line is what it is, and hands you the balances to carry forward. You type them in.

**Live:** https://akaushal-nexuscmms.github.io/slipfold/ — installable as a PWA, works offline.

Everything runs on your device. No account, no upload, no server. Returns are stored in
your browser (IndexedDB); export a backup file before switching devices.

## Tax years

**2025 and 2024** are built in, each in its own rules file with a source beside every
figure (`src/lib/rules2025.ts`, `src/lib/rules2024.ts`). Provincial figures for both years
come from the CRA's own 428 forms, read page by page. Start a return for any built-in year
from the header; a year without rules loads with the latest rules and a warning.

Verifying against a real Notice of Assessment is the strongest check there is: enter the
slips from a past year and compare line by line.

## What it covers

- **All ten provinces and three territories.** Federal T1 plus the provincial 428 form for
  every jurisdiction except Quebec, which gets the federal side with the Quebec abatement
  (the TP-1 is Revenu Québec's separate return).
- **Slips:** T4, T4A, T4E, T5, T3, T5008, T2202, RRSP receipts, T4FHSA — each box explained.
- **Income:** employment, other employment, pensions, EI benefits, dividends (grossed up,
  with the credit), interest, capital gains and losses (Schedule 3), other income,
  scholarships (with the full-time exemption), net self-employment (CPP computed on it).
- **Deductions:** RPP, RRSP (Schedule 7, with the limit and carry-forward), FHSA, union and
  professional dues, carrying charges, CPP enhanced contributions (Schedule 8), employment
  expenses, other deductions, net capital losses of other years.
- **Credits:** basic personal amount (with phase-out), age, spouse, CPP base, EI, Canada
  employment, home buyers', digital news, pension income, disability, student loan interest,
  tuition (Schedule 11 — only what is needed, the rest carried), medical (after threshold),
  donations (two-tier). Ontario surtax and health premium.
- **Refund or balance:** tax withheld from every slip, CPP and EI overpayments across
  employers, instalments.
- **Rental income (T776):** one statement per property — gross rents, the thirteen expense
  lines, ownership share, personal-use split, capital cost allowance with the rule that it
  cannot create a loss, UCC carried to next year. A rental loss reduces total income on line 12600.
- **Filled CRA forms:** one click builds a print-ready PDF from the CRA's own fillable forms —
  a filing checklist page, the T1, your province's 428 (fully line-by-line for Manitoba so far,
  coded lines elsewhere) and a T776 per property — flattened and merged. Print, sign, attach
  slips, mail. Nothing is uploaded; the forms are bundled under `public/forms/<year>/`.
- **Next year:** unused RRSP contributions, estimated new RRSP room, federal and provincial
  tuition carry-forwards, net capital losses, FHSA room — and a one-click roll-forward
  that keeps your profile and issuers and clears the amounts.

Not modelled (each is flagged in the app where relevant): the T2125 itself, child care (T778), moving expenses, minimum tax, foreign tax credits, provincial low-income
reductions and MB479-style refundable credits, Quebec's provincial return.

## Every number has a source

Each year's rules file holds every rate, threshold and amount with the page it was checked
against (the CRA 428 forms for every province, CRA payroll and CPP announcements, TaxTips tables).
`scripts/smoke.ts` checks the engine against hand-computed returns — ~150 assertions across
Manitoba, Ontario, BC, Alberta, Saskatchewan and Quebec profiles, multi-employer CPP/EI
overpayments, dividends, capital gains and losses, tuition carry-forward, seniors, and the
roll-forward.

## Run it locally

```bash
npm install
npm run dev            # http://localhost:5173
node scripts/smoke.ts  # engine tests (Node 22.6+)
npm run lint
npm run build          # static PWA in ./dist
```

`scripts/ui-review.py` drives the dev server with Playwright: example return, slips, the
line-by-line view with expansions, province switching, roll-forward, persistence, export,
dark mode and a phone viewport.

## Stack

Vite + React + TypeScript, Tailwind 4, `vite-plugin-pwa` (service worker, manifest,
offline), Dexie for IndexedDB. The tax engine is dependency-free TypeScript.

Deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`, after
lint, the smoke suite and a build.

## Licence

Source-available under the [Elastic License 2.0](LICENSE).

## Disclaimer

This is a calculator and a guide, not tax advice and not a filing service. Check the
result against CRA-certified software or a professional before you file.
