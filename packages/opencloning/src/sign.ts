/**
 * Signing any document at all, and checking a signature on one.
 *
 * Nothing in this file is pydna's. `signature.ts` uses it to sign cloning plans; other packages sign
 * other things with it, and each says under which **domain** it is signing. The domain is prefixed to
 * the bytes before they are signed, so a signature made over one kind of document can never be lifted
 * onto another kind that happens to serialise the same way. Two protocols that forget to do this can
 * be made to sign each other's messages.
 *
 * What is signed is never the serialisation that happens to be at hand but the canonical form from
 * `canonical.ts`, so that two programs holding the same document sign the same bytes.
 */
import { canonicalJson, fromBase64Url, toBase64Url } from "./canonical.js";
import { SIGNING_ALGORITHM, type SigningKey, importPublicKey, keyFingerprint } from "./keys.js";

/** One key's signature over one document. */
export interface DocumentSignature {
  /** Always `"Ed25519"`. */
  algorithm: string;
  /** The signing key's public half, 32 bytes in base64url. */
  public_key: string;
  /** The signature itself, 64 bytes in base64url. */
  signature: string;
  /** What the signer chose to call themselves. Covered by the signature, but still only a claim. */
  signer: string | null;
  /** When they say they signed, as an ISO 8601 instant. Covered by the signature, but still a claim. */
  signed_at: string;
}

/** What came of checking one signature. */
export interface SignatureCheck {
  /** Whether the signature is good: these bytes, this key. */
  ok: boolean;
  /** The key that signed, in base64url. */
  public_key: string;
  /** That key's fingerprint, for a person to compare. Empty if the key could not be read. */
  fingerprint: string;
  /** What the signer called themselves. A claim, and no more. */
  signer: string | null;
  /** When they say they signed. A claim, and no more. */
  signed_at: string;
  /** Why it failed, if it did. */
  problem: string | null;
}

/** How a signature is asked for. */
export interface SignOptions {
  /** A name to sign under. It is covered by the signature, but nothing verifies that it is yours. */
  signer?: string | null;
  /** When to say it was signed. Defaults to now. */
  signedAt?: string;
}

/** What one key signs: the document, and that key's own note about signing it, under a domain. */
const statement = (domain: string, value: unknown, signer: string | null, signedAt: string): Uint8Array =>
  new TextEncoder().encode(`${domain}\n${canonicalJson({ value, signer, signed_at: signedAt })}`);

/**
 * Sign a document under a domain.
 *
 * @param domain - What these bytes are for, like `biolibs/opencloning signed plan v1`.
 * @param value - The document.
 * @param key - The key to sign with.
 * @param options - A name to sign under, and when.
 * @returns The signature, to be carried beside the document rather than inside it.
 */
export async function signUnder(
  domain: string,
  value: unknown,
  key: SigningKey,
  options: SignOptions = {},
): Promise<DocumentSignature> {
  const signer = options.signer ?? null;
  const signedAt = options.signedAt ?? new Date().toISOString();
  const bytes = statement(domain, value, signer, signedAt);
  const signature = await (globalThis.crypto as Crypto).subtle.sign(
    SIGNING_ALGORITHM, key.privateKey, bytes as unknown as ArrayBuffer);
  return {
    algorithm: SIGNING_ALGORITHM,
    public_key: key.publicKey,
    signature: toBase64Url(new Uint8Array(signature)),
    signer,
    signed_at: signedAt,
  };
}

/**
 * Check every signature over a document.
 *
 * This never throws over a bad signature: a signature that fails, a key that cannot be read and an
 * algorithm this does not know all come back as a check that is not `ok`, with the reason beside it.
 * No signatures gives no checks, which is to say nothing has been claimed.
 *
 * @param domain - The domain the signatures should have been made under.
 * @param value - The document, exactly as it arrived.
 * @param signatures - The signatures.
 * @returns One check per signature, in the same order.
 */
export async function verifyUnder(
  domain: string,
  value: unknown,
  signatures: readonly DocumentSignature[],
): Promise<SignatureCheck[]> {
  const checks: SignatureCheck[] = [];
  for (const one of signatures) {
    const check: SignatureCheck = {
      ok: false, public_key: one.public_key, fingerprint: "",
      signer: one.signer ?? null, signed_at: one.signed_at, problem: null,
    };
    if (one.algorithm !== SIGNING_ALGORITHM) {
      check.problem = `This signature is ${one.algorithm}, which is not checked here.`;
      checks.push(check);
      continue;
    }
    try {
      check.fingerprint = await keyFingerprint(one.public_key);
      const key = await importPublicKey(one.public_key);
      const bytes = statement(domain, value, one.signer ?? null, one.signed_at);
      check.ok = await (globalThis.crypto as Crypto).subtle.verify(
        SIGNING_ALGORITHM, key, fromBase64Url(one.signature) as unknown as ArrayBuffer, bytes as unknown as ArrayBuffer);
      if (!check.ok) check.problem = "This document is not what that key signed.";
    } catch (cause) {
      check.problem = String(cause instanceof Error ? cause.message : cause);
    }
    checks.push(check);
  }
  return checks;
}
