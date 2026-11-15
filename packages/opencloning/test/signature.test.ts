/**
 * Signing a plan and checking the signature.
 *
 * None of this is pydna's, so there is no golden file to replay: what is checked here is that a
 * signature does what a signature is supposed to do. A good one verifies. One over a plan that has
 * since been altered — by a base, by a claim about which step made what — does not. Nor does one
 * checked against a different key. Reordering the document's keys changes nothing, because the bytes
 * being signed are canonical. And the plan inside a signed plan is still exactly the document the
 * OpenCloning data model defines, which is the condition on all of this being worth doing.
 */
import { readFileSync } from "node:fs";
import { CloningStrategy, type CloningStrategyDocument, canonicalJson, exportSigningKey, fromBase64Url,
         generateSigningKey, importSigningKey, isSignedPlan, keyFingerprint, planOf, signPlan,
         verifyPlan } from "@biolibs/opencloning";
import { beforeAll, describe, expect, it } from "vitest";

const golden = JSON.parse(readFileSync(new URL("./golden/opencloning.json", import.meta.url), "utf8")) as {
  official: { name: string; document: CloningStrategyDocument }[];
};
const plans = golden.official;

/** Rewrite every object with its keys in the opposite order, which JSON readers must not care about. */
const shuffled = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(shuffled);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).reverse()) out[key] = shuffled((value as Record<string, unknown>)[key]);
    return out;
  }
  return value;
};

describe("canonical bytes", () => {
  it("sorts keys and keeps array order", () => {
    expect(canonicalJson({ b: 1, a: [3, 1, 2], "": null })).toBe('{"":null,"a":[3,1,2],"b":1}');
  });

  it("writes the same string however the keys came in", () => {
    for (const one of plans) {
      expect(canonicalJson(shuffled(one.document))).toBe(canonicalJson(one.document));
    }
  });

  it("refuses a number with no agreed spelling", () => {
    expect(() => canonicalJson({ at: 1.5 })).toThrow(/whole numbers/);
    expect(() => canonicalJson({ at: Number.NaN })).toThrow(/whole numbers/);
  });

  it("leaves out what JSON would leave out", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(canonicalJson([undefined])).toBe("[null]");
  });
});

describe("signing a plan", () => {
  let key: Awaited<ReturnType<typeof generateSigningKey>>;
  let other: Awaited<ReturnType<typeof generateSigningKey>>;

  beforeAll(async () => {
    key = await generateSigningKey();
    other = await generateSigningKey();
  });

  it("makes keys of the size Ed25519 has", async () => {
    expect(fromBase64Url(key.publicKey).length).toBe(32);
    expect(key.publicKey).not.toBe(other.publicKey);
    expect(await keyFingerprint(key.publicKey)).toMatch(/^[0-9a-f]{4}(-[0-9a-f]{4}){3}$/);
  });

  it("verifies what it signed", async () => {
    for (const one of plans) {
      const signed = await signPlan(one.document, key, { signer: "Bench 4" });
      const checks = await verifyPlan(signed);
      expect(checks.length).toBe(1);
      expect(checks[0]!.ok, one.name).toBe(true);
      expect(checks[0]!.problem).toBeNull();
      expect(checks[0]!.signer).toBe("Bench 4");
      expect(checks[0]!.fingerprint).toBe(await keyFingerprint(key.publicKey));
      expect(fromBase64Url(signed.signatures[0]!.signature).length).toBe(64);
    }
  });

  it("leaves the plan exactly as the data model has it", async () => {
    const [one] = plans;
    const signed = await signPlan(one!.document, key);
    expect(JSON.stringify(signed.plan)).toBe(JSON.stringify(one!.document));
    expect(() => { CloningStrategy.fromDocument(signed.plan).validate(); }).not.toThrow();
    expect(isSignedPlan(signed)).toBe(true);
    expect(isSignedPlan(one!.document)).toBe(false);
    expect(planOf(signed)).toBe(signed.plan);
    expect(planOf(one!.document)).toBe(one!.document);
  });

  it("does not care how the document's keys are ordered", async () => {
    const [one] = plans;
    const signed = await signPlan(one!.document, key);
    const moved = { ...signed, plan: shuffled(one!.document) as CloningStrategyDocument };
    expect((await verifyPlan(moved))[0]!.ok).toBe(true);
  });

  it("refuses a plan that was altered after signing", async () => {
    for (const one of plans) {
      const signed = await signPlan(one.document, key);
      const sequences = signed.plan.sequences.map((sequence, at) => (at === 0
        ? { ...sequence, file_content: sequence.file_content.replace(/a/, "t") }
        : sequence));
      const tampered = { ...signed, plan: { ...signed.plan, sequences } };
      expect(JSON.stringify(tampered.plan), one.name).not.toBe(JSON.stringify(signed.plan));
      const [check] = await verifyPlan(tampered);
      expect(check!.ok, one.name).toBe(false);
      expect(check!.problem).toMatch(/not what that key signed/);
    }
  });

  it("refuses a plan whose claimed steps were altered after signing", async () => {
    const [one] = plans;
    const signed = await signPlan(one!.document, key);
    const sources = signed.plan.sources.map((source) => ({ ...source, input: [...source.input].reverse() }));
    expect((await verifyPlan({ ...signed, plan: { ...signed.plan, sources } }))[0]!.ok).toBe(false);
  });

  it("refuses a signature checked against another key", async () => {
    const [one] = plans;
    const signed = await signPlan(one!.document, key);
    const swapped = { ...signed, signatures: [{ ...signed.signatures[0]!, public_key: other.publicKey }] };
    expect((await verifyPlan(swapped))[0]!.ok).toBe(false);
  });

  it("refuses a signer or a time changed after signing", async () => {
    const [one] = plans;
    const signed = await signPlan(one!.document, key, { signer: "Bench 4" });
    for (const moved of [{ signer: "Bench 5" }, { signed_at: "2001-01-01T00:00:00.000Z" }]) {
      const changed = { ...signed, signatures: [{ ...signed.signatures[0]!, ...moved }] };
      expect((await verifyPlan(changed))[0]!.ok).toBe(false);
    }
  });

  it("says what went wrong rather than throwing", async () => {
    const [one] = plans;
    const signed = await signPlan(one!.document, key);
    const nonsense = { ...signed, signatures: [{ ...signed.signatures[0]!, public_key: "!!!!" }] };
    const [check] = await verifyPlan(nonsense);
    expect(check!.ok).toBe(false);
    expect(check!.problem).not.toBeNull();
    expect(check!.fingerprint).toBe("");

    const elsewhere = { ...signed, signatures: [{ ...signed.signatures[0]!, algorithm: "RSA-PSS" }] };
    expect((await verifyPlan(elsewhere))[0]!.problem).toMatch(/not checked here/);
  });

  it("claims nothing when nothing was signed", async () => {
    const [one] = plans;
    expect(await verifyPlan({ signed_plan_version: 1, plan: one!.document, signatures: [] })).toEqual([]);
  });

  it("lets a second key countersign the same plan", async () => {
    const [one] = plans;
    const once = await signPlan(one!.document, key, { signer: "Bench 4" });
    const twice = await signPlan(once, other, { signer: "the lab down the hall" });
    expect(twice.signatures.length).toBe(2);
    const checks = await verifyPlan(twice);
    expect(checks.map((check) => check.ok)).toEqual([true, true]);
    expect(checks.map((check) => check.signer)).toEqual(["Bench 4", "the lab down the hall"]);
    expect(JSON.stringify(twice.plan)).toBe(JSON.stringify(one!.document));
  });

  it("keeps a key between sessions", async () => {
    const stored = await exportSigningKey(key);
    const read = await importSigningKey(stored);
    expect(read.publicKey).toBe(key.publicKey);
    const [one] = plans;
    const signed = await signPlan(one!.document, read, { signer: "Bench 4" });
    expect((await verifyPlan(signed))[0]!.ok).toBe(true);
    expect((await verifyPlan(signed))[0]!.fingerprint).toBe(await keyFingerprint(key.publicKey));
  });

  it("refuses something that is not a stored key", async () => {
    await expect(importSigningKey("bm90IGEga2V5")).rejects.toThrow(/not a stored/);
  });
});
