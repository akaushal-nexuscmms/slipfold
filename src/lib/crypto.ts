// Encryption at rest for the returns stored in the browser. WebCrypto only.
// Passphrase → PBKDF2-SHA256 (310k iterations) → AES-256-GCM. A lost passphrase means lost data;
// there is no server and no recovery, and the UI says so.

const enc = new TextEncoder();
const dec = new TextDecoder();
export const KDF_ITERATIONS = 310_000;

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export type Sealed = { enc: true; iv: string; data: string };
export type VaultMeta = { salt: string; check: Sealed; iterations: number };

export function randomBytes(n: number): Uint8Array {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}

export async function deriveKey(passphrase: string, salt: Uint8Array, iterations = KDF_ITERATIONS): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(passphrase.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function seal(key: CryptoKey, value: unknown): Promise<Sealed> {
  const iv = randomBytes(12);
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, enc.encode(JSON.stringify(value)));
  return { enc: true, iv: b64(iv), data: b64(data) };
}

export async function open<T = unknown>(key: CryptoKey, sealed: Sealed): Promise<T> {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(sealed.iv) as BufferSource }, key, unb64(sealed.data) as BufferSource);
  return JSON.parse(dec.decode(plain)) as T;
}

export const isSealed = (v: unknown): v is Sealed => !!v && typeof v === "object" && (v as Sealed).enc === true && typeof (v as Sealed).data === "string";

/** Create vault metadata for a new passphrase: a fresh salt and a sealed check value. */
export async function createVault(passphrase: string): Promise<{ meta: VaultMeta; key: CryptoKey }> {
  const salt = randomBytes(16);
  const key = await deriveKey(passphrase, salt);
  return { meta: { salt: b64(salt), check: await seal(key, "t1-fieldguide"), iterations: KDF_ITERATIONS }, key };
}

/** Derive the key for an existing vault and prove the passphrase is right. Throws on a wrong passphrase. */
export async function unlockVault(passphrase: string, meta: VaultMeta): Promise<CryptoKey> {
  const key = await deriveKey(passphrase, unb64(meta.salt), meta.iterations ?? KDF_ITERATIONS);
  try {
    const v = await open<string>(key, meta.check);
    if (v !== "t1-fieldguide") throw new Error();
  } catch {
    throw new Error("Wrong passphrase.");
  }
  return key;
}

// Keep the unlocked key for the life of the tab so a reload does not re-prompt. sessionStorage is
// cleared when the tab closes; it never touches disk the way localStorage does.
const SESSION_KEY = "t1-fieldguide.session-key";

export async function rememberKey(key: CryptoKey): Promise<void> {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(await crypto.subtle.exportKey("jwk", key)));
  } catch {
    /* storage blocked */
  }
}

export async function recallKey(): Promise<CryptoKey | null> {
  try {
    const jwk = sessionStorage.getItem(SESSION_KEY);
    if (!jwk) return null;
    return await crypto.subtle.importKey("jwk", JSON.parse(jwk), { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  } catch {
    return null;
  }
}

export function forgetKey(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
