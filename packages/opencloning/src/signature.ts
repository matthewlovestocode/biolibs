/**
 * Signing a plan, and checking a signature on one.
 *
 * Nothing in this file is pydna's, and nothing in it is the OpenCloning data model's either. The data
 * model forbids fields it does not define, so a signature cannot be tucked inside a plan: instead the
 * plan is wrapped. A signed plan is `{ plan, signatures }`, where `plan` is byte-for-byte the document
 * the official library accepts, and the signatures sit outside it. Unwrap it and you have an ordinary
 * OpenCloning document again, which is the point — signing must not cost interoperability.
 *
 * What a signature means, exactly: whoever holds this key put their name to **this** plan. Change one
 * base of one molecule, or one claim about which step made what, and the signature fails. That is all
 * it means. It does not say the key belongs to a lab, that the lab did the work, or that the plan is a
 * good idea. `validate()` in `strategy.ts` answers a different question — whether the molecules really
 * follow from the parts — and the two checks are worth running together: a signature with no replay is
 * an accountable claim that might be wrong, and a replay with no signature is a sound plan from nobody.
 *
 * Several keys can sign the same plan, each one signing the plan and its own note, so one lab's plan can
 * be countersigned by another that has run it.
 */
import type { CloningStrategyDocument } from "./model.js";
import { canonicalJson, fromBase64Url, toBase64Url } from "./canonical.js";
import { SIGNING_ALGORITHM, type SigningKey, importPublicKey, keyFingerprint } from "./keys.js";

/**
 * What the bytes being signed are for.
 *
 * It is prefixed to every signature so that a signature over a cloning plan can never be replayed as a
 * signature over something else that happened to serialise the same way.
 */
export const SIGNING_DOMAIN = "biolibs/opencloning signed plan v1";

/** One key's signature over a plan. */
export interface PlanSignature {
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

/** A plan with signatures beside it. Take `.plan` and you have an ordinary OpenCloning document. */
export interface SignedPlan {
  /** Always `1`. */
  signed_plan_version: number;
  /** The plan, exactly as the data model defines it. */
  plan: CloningStrategyDocument;
  /** The signatures, in the order they were added. */
  signatures: PlanSignature[];
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

/** What one key signs: the plan, and that key's own note about signing it. */
const statement = (plan: CloningStrategyDocument, signer: string | null, signedAt: string): Uint8Array =>
  new TextEncoder().encode(`${SIGNING_DOMAIN}\n${canonicalJson({ plan, signer, signed_at: signedAt })}`);

/** How a signature is asked for. */
export interface SignOptions {
  /** A name to sign under. It is covered by the signature, but nothing verifies that it is yours. */
  signer?: string | null;
  /** When to say it was signed. Defaults to now. */
  signedAt?: string;
}

/**
 * Sign a plan.
 *
 * Hand it a plan and it returns that plan wrapped with one signature. Hand it an already signed plan and
 * it returns the same plan with one more signature added, so a second lab can countersign.
 *
 * @param plan - The plan, signed or not.
 * @param key - The key to sign with.
 * @param options - A name to sign under, and when.
 * @returns The signed plan.
 *
 * @example
 * ```ts
 * import { CloningStrategy, generateSigningKey, signPlan, verifyPlan } from "@biolibs/opencloning";
 *
 * const key = await generateSigningKey();
 * const signed = await signPlan(CloningStrategy.fromRecords([plasmid]).document, key, { signer: "Bench 4" });
 *
 * const [check] = await verifyPlan(signed);
 * check?.ok;                                      // true
 * CloningStrategy.fromDocument(signed.plan).validate();   // and the steps really make it
 * ```
 */
export async function signPlan(
  plan: CloningStrategyDocument | SignedPlan,
  key: SigningKey,
  options: SignOptions = {},
): Promise<SignedPlan> {
  const held = isSignedPlan(plan) ? plan.plan : plan;
  const already = isSignedPlan(plan) ? plan.signatures : [];
  const signer = options.signer ?? null;
  const signedAt = options.signedAt ?? new Date().toISOString();
  const bytes = statement(held, signer, signedAt);
  const signature = new Uint8Array(
    await (globalThis.crypto as Crypto).subtle.sign(SIGNING_ALGORITHM, key.privateKey, bytes as unknown as ArrayBuffer),
  );
  return {
    signed_plan_version: 1,
    plan: held,
    signatures: [
      ...already,
      {
        algorithm: SIGNING_ALGORITHM,
        public_key: key.publicKey,
        signature: toBase64Url(signature),
        signer,
        signed_at: signedAt,
      },
    ],
  };
}

/**
 * Check every signature on a plan.
 *
 * This never throws over a bad signature: a signature that fails, a key that cannot be read and an
 * algorithm this does not know all come back as a check that is not `ok`, with the reason beside it. An
 * empty list of signatures gives an empty list of checks, which is to say nothing has been claimed.
 *
 * @param signed - The signed plan.
 * @returns One check per signature, in the same order.
 */
export async function verifyPlan(signed: SignedPlan): Promise<SignatureCheck[]> {
  const checks: SignatureCheck[] = [];
  for (const one of signed.signatures) {
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
      const bytes = statement(signed.plan, one.signer ?? null, one.signed_at);
      check.ok = await (globalThis.crypto as Crypto).subtle.verify(
        SIGNING_ALGORITHM, key, fromBase64Url(one.signature) as unknown as ArrayBuffer, bytes as unknown as ArrayBuffer,
      );
      if (!check.ok) check.problem = "This plan is not what that key signed.";
    } catch (cause) {
      check.problem = String(cause instanceof Error ? cause.message : cause);
    }
    checks.push(check);
  }
  return checks;
}

/**
 * Say whether a value is a signed plan rather than a bare document.
 *
 * @param value - Anything.
 * @returns Whether it is a signed plan.
 */
export function isSignedPlan(value: unknown): value is SignedPlan {
  const held = value as Partial<SignedPlan> | null;
  return held !== null && typeof held === "object"
    && Array.isArray(held.signatures) && typeof held.plan === "object" && held.plan !== null;
}

/**
 * Take the plan out, whether or not it arrived signed.
 *
 * @param value - A plan or a signed plan.
 * @returns The plan.
 */
export function planOf(value: CloningStrategyDocument | SignedPlan): CloningStrategyDocument {
  return isSignedPlan(value) ? value.plan : value;
}
