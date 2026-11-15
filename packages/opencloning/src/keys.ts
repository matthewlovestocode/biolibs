/**
 * Signing keys: making one, keeping one, and naming one so a person can recognise it.
 *
 * Nothing in this file is pydna's. It uses Web Crypto's Ed25519, which is present in Node 20 and in
 * current browsers, so the same key works in a script and in a page. A key is a pair: the private half
 * never leaves the machine that made it, and the public half is 32 bytes, short enough to travel in a
 * link beside the plan it signs.
 *
 * A key is not a lab. Anyone can make one. What a key gives you is continuity — the claim that this
 * plan and that plan came from the same holder — and that only becomes an identity once a lab publishes
 * its public key somewhere you already trust it to speak from.
 */
import { fromBase64Url, toBase64Url } from "./canonical.js";

/** The algorithm, named the one way Web Crypto names it. */
export const SIGNING_ALGORITHM = "Ed25519";

/** A key pair: the private half to sign with, the public half to hand out. */
export interface SigningKey {
  /** The half that signs. Not serialisable except through `exportSigningKey`. */
  privateKey: CryptoKey;
  /** The half that verifies, as 32 bytes in base64url. This is what travels. */
  publicKey: string;
}

const subtle = (): SubtleCrypto => {
  const web = globalThis.crypto as Crypto | undefined;
  if (web?.subtle === undefined) {
    throw new Error("Signing needs Web Crypto, which is not available here.");
  }
  return web.subtle;
};

const unsupported = (cause: unknown): Error =>
  new Error(`This runtime's Web Crypto does not do ${SIGNING_ALGORITHM}: ${String(cause)}`);

/**
 * Make a new key pair.
 *
 * @returns The pair, with the public half already encoded.
 * @throws If this runtime's Web Crypto has no Ed25519.
 *
 * @example
 * ```ts
 * import { generateSigningKey, keyFingerprint } from "@biolibs/opencloning";
 *
 * const key = await generateSigningKey();
 * await keyFingerprint(key.publicKey);   // "a1b2-c3d4-e5f6-7a8b", say
 * ```
 */
export async function generateSigningKey(): Promise<SigningKey> {
  let pair: CryptoKeyPair;
  try {
    pair = (await subtle().generateKey({ name: SIGNING_ALGORITHM }, true, ["sign", "verify"])) as CryptoKeyPair;
  } catch (cause) {
    throw unsupported(cause);
  }
  return { privateKey: pair.privateKey, publicKey: await exportPublicKey(pair.publicKey) };
}

/** @param key - A public key. @returns Its 32 bytes in base64url. */
async function exportPublicKey(key: CryptoKey): Promise<string> {
  return toBase64Url(new Uint8Array(await subtle().exportKey("raw", key)));
}

/**
 * Write a key pair down, to keep it between sessions.
 *
 * Whatever this returns is the key itself, not a hint of it: hold it the way you would hold a password.
 *
 * @param key - The pair.
 * @returns The private half in base64url, which `importSigningKey` reads back.
 */
export async function exportSigningKey(key: SigningKey): Promise<string> {
  return toBase64Url(new Uint8Array(await subtle().exportKey("pkcs8", key.privateKey)));
}

/**
 * Read a key pair back from what `exportSigningKey` wrote.
 *
 * @param text - The stored private half.
 * @returns The pair, with the public half derived from it again.
 * @throws If the text is not a key of this kind.
 */
export async function importSigningKey(text: string): Promise<SigningKey> {
  const bytes = fromBase64Url(text);
  let privateKey: CryptoKey;
  try {
    privateKey = await subtle().importKey("pkcs8", bytes as unknown as ArrayBuffer, { name: SIGNING_ALGORITHM }, true, ["sign"]);
  } catch (cause) {
    throw new Error(`This is not a stored ${SIGNING_ALGORITHM} key: ${String(cause)}`);
  }
  return { privateKey, publicKey: await publicKeyOf(bytes) };
}

/**
 * Recover the public half from the private half.
 *
 * Ed25519's public key is a function of the private one, but Web Crypto will not simply hand it over,
 * so the key goes out as JWK — where the public half sits beside the private one — and comes back in.
 *
 * @param pkcs8 - The private half.
 * @returns The public half in base64url.
 */
async function publicKeyOf(pkcs8: Uint8Array): Promise<string> {
  const held = await subtle().importKey("pkcs8", pkcs8 as unknown as ArrayBuffer, { name: SIGNING_ALGORITHM }, true, ["sign"]);
  const jwk = await subtle().exportKey("jwk", held);
  if (typeof jwk.x !== "string") throw new Error("This key does not carry its public half.");
  return jwk.x.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Read a public key for verifying.
 *
 * @param publicKey - Its 32 bytes in base64url.
 * @returns The key.
 * @throws If those bytes are not a public key of this kind.
 */
export async function importPublicKey(publicKey: string): Promise<CryptoKey> {
  const bytes = fromBase64Url(publicKey);
  try {
    return await subtle().importKey("raw", bytes as unknown as ArrayBuffer, { name: SIGNING_ALGORITHM }, true, ["verify"]);
  } catch (cause) {
    throw new Error(`This is not an ${SIGNING_ALGORITHM} public key: ${String(cause)}`);
  }
}

/**
 * Name a key in a form a person can compare out loud.
 *
 * Two keys are the same key only if their fingerprints match, and a fingerprint is short enough to read
 * off a slide or a lab page. It is the first eight bytes of the key's SHA-256, in four groups.
 *
 * @param publicKey - The public half in base64url.
 * @returns The fingerprint, like `a1b2-c3d4-e5f6-7a8b`.
 */
export async function keyFingerprint(publicKey: string): Promise<string> {
  const bytes = fromBase64Url(publicKey);
  const digest = new Uint8Array(await subtle().digest("SHA-256", bytes as unknown as ArrayBuffer));
  const hex = [...digest.subarray(0, 8)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return (hex.match(/.{4}/g) ?? []).join("-");
}

/**
 * Say whether this runtime can sign at all, without throwing.
 *
 * @returns Whether Ed25519 is available here.
 */
export async function signingAvailable(): Promise<boolean> {
  try {
    await generateSigningKey();
    return true;
  } catch {
    return false;
  }
}
