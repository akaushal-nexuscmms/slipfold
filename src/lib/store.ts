// Persistence: one row per tax year in IndexedDB (Dexie), optionally sealed with a passphrase.
// Everything stays on the device. Export/import moves a JSON file the user controls — sealed
// with the same passphrase when one is set.
import Dexie, { type EntityTable } from "dexie";
import { EMPTY_CARRY, EMPTY_OTHER, EMPTY_PROFILE, emptyReturn, newId, type Slip, type TaxReturn } from "./model.ts";
import { compute, rental } from "./engine.ts";
import { createVault, deriveKey, isSealed, open, seal, unlockVault, type Sealed, type VaultMeta } from "./crypto.ts";

type ReturnRow = { year: number; data: TaxReturn | Sealed; updated: string };
type SettingRow = { key: string; value: string };

class Db extends Dexie {
  returns!: EntityTable<ReturnRow, "year">;
  settings!: EntityTable<SettingRow, "key">;
  constructor() {
    super("slipfold");
    this.version(1).stores({ returns: "year", settings: "key" });
  }
}

export const db = new Db();
export type Key = CryptoKey | null;

const normalise = (year: number, d: TaxReturn): TaxReturn => ({ ...emptyReturn(year), ...d, profile: { ...EMPTY_PROFILE, ...d.profile }, rentals: d.rentals ?? [], other: { ...EMPTY_OTHER, ...d.other }, carry: { ...EMPTY_CARRY, ...d.carry } });

async function readRow(row: ReturnRow, key: Key): Promise<TaxReturn> {
  if (isSealed(row.data)) {
    if (!key) throw new Error("locked");
    return normalise(row.year, await open<TaxReturn>(key, row.data));
  }
  return normalise(row.year, row.data);
}

// ---------- vault (passphrase) ----------

export async function getVaultMeta(): Promise<VaultMeta | null> {
  const row = await db.settings.get("vault");
  return row ? (JSON.parse(row.value) as VaultMeta) : null;
}

export async function unlock(passphrase: string): Promise<CryptoKey> {
  const meta = await getVaultMeta();
  if (!meta) throw new Error("No passphrase is set.");
  return unlockVault(passphrase, meta);
}

/** Set (or change) the passphrase: every stored return is re-sealed with the new key. */
export async function setPassphrase(passphrase: string, currentKey: Key): Promise<CryptoKey> {
  const { meta, key } = await createVault(passphrase);
  const rows = await db.returns.toArray();
  const plain = await Promise.all(rows.map((r) => readRow(r, currentKey)));
  await db.transaction("rw", db.returns, db.settings, async () => {
    for (let i = 0; i < rows.length; i++) await db.returns.put({ year: rows[i].year, data: await seal(key, plain[i]), updated: rows[i].updated });
    await db.settings.put({ key: "vault", value: JSON.stringify(meta) });
  });
  return key;
}

/** Remove the passphrase: every return is stored in the clear again. */
export async function removePassphrase(key: CryptoKey): Promise<void> {
  const rows = await db.returns.toArray();
  const plain = await Promise.all(rows.map((r) => readRow(r, key)));
  await db.transaction("rw", db.returns, db.settings, async () => {
    for (let i = 0; i < rows.length; i++) await db.returns.put({ year: rows[i].year, data: plain[i], updated: rows[i].updated });
    await db.settings.delete("vault");
  });
}

// ---------- returns ----------

export async function loadReturn(year: number, key: Key): Promise<TaxReturn | null> {
  const row = await db.returns.get(year);
  return row ? readRow(row, key) : null;
}

export async function saveReturn(r: TaxReturn, key: Key): Promise<void> {
  const data = key ? await seal(key, r) : r;
  await db.returns.put({ year: r.year, data, updated: new Date().toISOString() });
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
    rentals: (from.rentals ?? []).map((r) => ({ ...r, id: newId(), grossRents: 0, otherIncome: 0, expenses: {}, additions: 0, ccaClaim: null, ucc: rental(r).closingUcc })),
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

// ---------- backup files ----------

type ExportFile =
  | { app: "slipfold" | "t1-fieldguide"; version: 1; exported: string; returns: TaxReturn[] }
  | { app: "slipfold" | "t1-fieldguide"; version: 2; exported: string; encrypted: true; salt: string; iterations: number; payload: Sealed };

/** Plain JSON when there is no passphrase; sealed with the vault's key (and its salt, so import can derive it) when there is. */
export async function exportJson(returns: TaxReturn[], key: Key, meta: VaultMeta | null): Promise<string> {
  if (key && meta) {
    const payload = await seal(key, returns);
    const file: ExportFile = { app: "slipfold", version: 2, exported: new Date().toISOString(), encrypted: true, salt: meta.salt, iterations: meta.iterations, payload };
    return JSON.stringify(file, null, 2);
  }
  const file: ExportFile = { app: "slipfold", version: 1, exported: new Date().toISOString(), returns };
  return JSON.stringify(file, null, 2);
}

export function isEncryptedBackup(text: string): boolean {
  try {
    const j = JSON.parse(text) as Partial<ExportFile>;
    return (j.app === "slipfold" || j.app === "t1-fieldguide") && (j as { encrypted?: boolean }).encrypted === true;
  } catch {
    return false;
  }
}

export async function parseImport(text: string, passphrase?: string): Promise<TaxReturn[]> {
  const j = JSON.parse(text) as ExportFile;
  if (!j || (j.app !== "slipfold" && j.app !== "t1-fieldguide")) throw new Error("Not a Slipfold backup file."); // older backups carry the working name
  if ("encrypted" in j && j.encrypted) {
    if (!passphrase) throw new Error("This backup is encrypted — enter the passphrase it was exported with.");
    const key = await deriveKey(passphrase, Uint8Array.from(atob(j.salt), (c) => c.charCodeAt(0)), j.iterations);
    try {
      return (await open<TaxReturn[]>(key, j.payload)).map((r) => normalise(r.year, r));
    } catch {
      throw new Error("Wrong passphrase for this backup.");
    }
  }
  const plain = j as Extract<ExportFile, { version: 1 }>;
  if (!Array.isArray(plain.returns)) throw new Error("Not a Slipfold backup file.");
  return plain.returns.map((r) => normalise(r.year, r));
}
