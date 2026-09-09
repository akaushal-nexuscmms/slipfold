// Persistence: one row per tax year in IndexedDB (Dexie), plus a tiny settings row.
// Everything stays on the device. Export/import moves a JSON file the user controls.
import Dexie, { type EntityTable } from "dexie";
import { EMPTY_CARRY, EMPTY_OTHER, EMPTY_PROFILE, emptyReturn, newId, type Slip, type TaxReturn } from "./model.ts";
import { compute } from "./engine.ts";

type ReturnRow = { year: number; data: TaxReturn; updated: string };
type SettingRow = { key: string; value: string };

class Db extends Dexie {
  returns!: EntityTable<ReturnRow, "year">;
  settings!: EntityTable<SettingRow, "key">;
  constructor() {
    super("t1-fieldguide");
    this.version(1).stores({ returns: "year", settings: "key" });
  }
}

export const db = new Db();

export async function loadReturn(year: number): Promise<TaxReturn | null> {
  const row = await db.returns.get(year);
  if (!row) return null;
  // tolerate rows saved by an older build: fill any field added since
  return { ...emptyReturn(year), ...row.data, profile: { ...EMPTY_PROFILE, ...row.data.profile }, other: { ...EMPTY_OTHER, ...row.data.other }, carry: { ...EMPTY_CARRY, ...row.data.carry } };
}

export async function saveReturn(r: TaxReturn): Promise<void> {
  await db.returns.put({ year: r.year, data: r, updated: new Date().toISOString() });
}

export async function listYears(): Promise<number[]> {
  const rows = await db.returns.toArray();
  return rows.map((r) => r.year).sort((a, b) => b - a);
}

export async function deleteYear(year: number): Promise<void> {
  await db.returns.delete(year);
}

/**
 * The "save recurring fields" feature: start next year's return from this one.
 * Keeps the profile and every slip's issuer (with amounts cleared), and carries
 * forward the balances the engine computed — unused RRSP contributions, tuition,
 * capital losses, FHSA room. The user fills in the new amounts.
 */
export function rollForward(from: TaxReturn): TaxReturn {
  const res = compute(from);
  const find = (line: string) => res.lines.find((l) => l.form === "Next year" && l.line === line)?.value ?? 0;
  const slips: Slip[] = from.slips
    .filter((s) => s.kind !== "t5008") // sales never recur
    .map((s) => ({
      id: newId(),
      kind: s.kind,
      issuer: s.issuer,
      values: Object.fromEntries(Object.entries(s.values).filter(([, v]) => typeof v === "string")), // keep text (e.g. security names), clear money
    }));
  return {
    year: from.year + 1,
    profile: { ...from.profile },
    slips,
    other: { ...EMPTY_OTHER, homeBuyer: false, rrspDeductToClaim: null, unionDuesNotOnT4: from.other.unionDuesNotOnT4, digitalNews: from.other.digitalNews },
    carry: {
      rrspDeductionLimit: 0, // comes from the new Notice of Assessment
      unusedRrspContributions: find("RRSP"),
      fhsaRoom: find("FHSA") + (from.carry.fhsaRoom || from.slips.some((s) => s.kind === "fhsa") ? 8000 : 0),
      tuitionFederal: find("Tuition (fed)"),
      tuitionProvincial: find("Tuition (prov)"),
      netCapitalLosses: find("Losses"),
    },
  };
}

export function exportJson(returns: TaxReturn[]): string {
  return JSON.stringify({ app: "t1-fieldguide", version: 1, exported: new Date().toISOString(), returns }, null, 2);
}

export function parseImport(text: string): TaxReturn[] {
  const j = JSON.parse(text);
  if (!j || j.app !== "t1-fieldguide" || !Array.isArray(j.returns)) throw new Error("Not a T1 Field Guide export file.");
  return j.returns as TaxReturn[];
}
