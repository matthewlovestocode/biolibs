/**
 * A device's key, sealed so that it can be kept somewhere else.
 *
 * A device's key never leaves the device, with one exception: a lab with one member and one device
 * is a lab that ends when the device does. So the key can be written out sealed under a passphrase,
 * as a small document to keep somewhere that is not this machine, and opened again on a new one.
 *
 * What is sealed is useless without the passphrase, and nothing here remembers it. A sealed key
 * whose passphrase is forgotten is a lost key.
 */
import { importSigningKey, keyFingerprint } from "@biolibs/opencloning";

/** The version of the sealed-key document. */
export const BACKUP_VERSION = 1;

/** How many rounds the passphrase is stretched by. */
export const BACKUP_ROUNDS = 600_000;

/** The fewest characters a passphrase may have. */
export const SHORTEST_PASSPHRASE = 12;

/** A device's key, sealed under a passphrase. Every byte string is base64. */
export interface KeyBackup {
  /** Which version of this document it is. */
  bionet_key_backup: number;
  /** The fingerprint of the key inside, so a person can tell which key a file holds without opening it. */
  fingerprint: string;
  /** How the passphrase becomes a key. */
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: number; salt: string };
  /** How the key was sealed. */
  cipher: { name: "AES-GCM"; iv: string };
  /** The sealed key. */
  sealed: string;
}

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(text), (letter) => letter.charCodeAt(0));

async function stretch(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const subtle = globalThis.crypto.subtle;
  const material = await subtle.importKey("raw", new TextEncoder().encode(passphrase.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/**
 * Seal a device's key under a passphrase.
 *
 * @param exported - The key, as `exportSigningKey` wrote it.
 * @param passphrase - What it will take to open it again.
 * @param options - `iterations` is only for tests, which cannot wait for the real number.
 * @returns The sealed key, safe to write to a file.
 * @throws If the passphrase is too short to be worth sealing anything with.
 *
 * @example
 * ```ts
 * import { exportSigningKey, generateSigningKey } from "@biolibs/opencloning";
 * import { openKey, sealKey } from "@biolibs/bionet-client";
 *
 * const exported = await exportSigningKey(await generateSigningKey());
 * const backup = await sealKey(exported, "correct horse battery staple");
 * (await openKey(backup, "correct horse battery staple")) === exported;   // true
 * ```
 */
export async function sealKey(exported: string, passphrase: string, options: { iterations?: number } = {}): Promise<KeyBackup> {
  if (passphrase.length < SHORTEST_PASSPHRASE) {
    throw new Error(`A passphrase of at least ${SHORTEST_PASSPHRASE} characters. Several unrelated words work well.`);
  }
  const iterations = options.iterations ?? BACKUP_ROUNDS;
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const fingerprint = await keyFingerprint((await importSigningKey(exported)).publicKey);
  const sealed = await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv }, await stretch(passphrase, salt, iterations),
                                                        new TextEncoder().encode(exported));
  return {
    bionet_key_backup: BACKUP_VERSION, fingerprint,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations, salt: toBase64(salt) },
    cipher: { name: "AES-GCM", iv: toBase64(iv) },
    sealed: toBase64(new Uint8Array(sealed)),
  };
}

/**
 * Read a sealed key, from the document or its text.
 *
 * @param value - What was in the file.
 * @returns The sealed key.
 * @throws If it is not one.
 */
export function readBackup(value: unknown): KeyBackup {
  let found = value;
  if (typeof found === "string") {
    try { found = JSON.parse(found); } catch { throw new Error("That is not a key backup."); }
  }
  const one = found as Partial<KeyBackup> | null;
  const short = (text: unknown, most: number): text is string => typeof text === "string" && text.length > 0 && text.length <= most;
  if (one === null || typeof one !== "object" || one.bionet_key_backup !== BACKUP_VERSION || !short(one.fingerprint, 100)
      || one.kdf?.name !== "PBKDF2" || one.kdf.hash !== "SHA-256" || !Number.isSafeInteger(one.kdf.iterations)
      || one.kdf.iterations < 1 || one.kdf.iterations > 10_000_000 || !short(one.kdf.salt, 200)
      || one.cipher?.name !== "AES-GCM" || !short(one.cipher.iv, 200) || !short(one.sealed, 20_000)) {
    throw new Error("That is not a key backup.");
  }
  return one as KeyBackup;
}

/**
 * Open a sealed key.
 *
 * @param backup - The sealed key, or the text of the file it was kept in.
 * @param passphrase - What it was sealed under.
 * @returns The key, as `exportSigningKey` wrote it.
 * @throws If the passphrase is wrong, or the document has been changed.
 */
export async function openKey(backup: unknown, passphrase: string): Promise<string> {
  const one = readBackup(backup);
  let exported: string;
  try {
    const opened = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(one.cipher.iv) },
                                                          await stretch(passphrase, fromBase64(one.kdf.salt), one.kdf.iterations), fromBase64(one.sealed));
    exported = new TextDecoder().decode(opened);
  } catch {
    throw new Error("That passphrase does not open this backup.");
  }
  // The fingerprint on the outside is not sealed, so it is checked against what was inside.
  if (await keyFingerprint((await importSigningKey(exported)).publicKey) !== one.fingerprint) {
    throw new Error("This backup does not hold the key it says it does.");
  }
  return exported;
}
