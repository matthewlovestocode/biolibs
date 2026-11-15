/**
 * Inventories: writing one, signing one, reading a stranger's, and asking who has what.
 *
 * There is no upstream library to replay here, so what is checked is the behaviour the package claims:
 * that a part is matched by checksum and not by name, that a signature over an inventory cannot be
 * mistaken for a signature over a plan, that a document is handed back exactly as it arrived so that
 * what was verified is what gets used, and that fetching reports the three separate things it settles
 * rather than one flattened verdict.
 */
import { Dseqrecord } from "@biolibs/dseqrecord";
import { gibsonAssembly } from "@biolibs/assembly2";
import { CloningStrategy, generateSigningKey, keyFingerprint, signUnder, verifyUnder } from "@biolibs/opencloning";
import { INVENTORY_DOMAIN, INVENTORY_PATH, fetchInventory, heldButNotOffered, inventoryFrom, inventoryUrl,
         isSignedInventory, labMemory, labOrigin, originMatches, partsNeeded, readInventory, recognise,
         remember, settled, signInventory, signingKeys, unsourced, verifyInventory, whoHas,
         type FetchedInventory, type LabModel, type SignedInventory } from "@biolibs/bionet";
import { beforeAll, describe, expect, it } from "vitest";

const F1 = "GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGA";
const F2 = "CAACCCCGGCCCCTGAGTCCGAGGAGAGGGTGCTTCAGAGTATGTATACC";
const F3 = "GAGGGTGCTTCAGAGTATGTATACCGGATCACAGTCTACACTGCTCACTC";

const ENDY: LabModel = { name: "Endy lab", origin: "https://endylab.example", contact: null, note: null };

/** @returns The three fragments a plan starts from. */
const fragments = (): Dseqrecord[] => [
  new Dseqrecord(F1, false, undefined, "1", "f1"),
  new Dseqrecord(F2, false, undefined, "2", "f2"),
  new Dseqrecord(F3, false, undefined, "3", "f3"),
];

/** @returns A plan that assembles those three into a circle. */
function plan(): CloningStrategy {
  const [plasmid] = gibsonAssembly(fragments(), 25, true);
  plasmid!.id = "100";
  return CloningStrategy.fromRecords([plasmid!], { description: "a 75 bp circle" });
}

/** @param signed - An inventory. @param origin - Where to pretend it was served from. @returns A fetch that serves it. */
const serving = (signed: SignedInventory, status = 200): typeof globalThis.fetch =>
  (async (url: string) => ({
    ok: status === 200,
    status,
    text: async () => JSON.stringify(signed),
    url,
  })) as unknown as typeof globalThis.fetch;

describe("an inventory", () => {
  it("names parts by checksum, not by what the lab calls them", () => {
    const parts = fragments();
    const inventory = inventoryFrom(parts, ENDY, { publishedAt: "2026-01-01T00:00:00.000Z" });
    expect(inventory.parts.map((part) => part.checksum)).toEqual(parts.map((part) => part.seguid()));
    expect(inventory.parts.map((part) => part.name)).toEqual(["f1", "f2", "f3"]);
    expect(inventory.parts.every((part) => part.available)).toBe(true);
    expect(inventory.published_at).toBe("2026-01-01T00:00:00.000Z");
  });

  it("matches the same molecule written the other way round", () => {
    const forwards = inventoryFrom([fragments()[0]!], ENDY);
    const backwards = inventoryFrom([fragments()[0]!.reverseComplement()], ENDY);
    expect(backwards.parts[0]!.checksum).toBe(forwards.parts[0]!.checksum);
  });

  it("can hold a part without offering it", () => {
    const inventory = inventoryFrom(fragments(), ENDY, { available: false, notes: { f1: "nearly out" } });
    expect(inventory.parts[0]!.available).toBe(false);
    expect(inventory.parts[0]!.note).toBe("nearly out");
    expect(inventory.parts[1]!.note).toBeNull();
  });
});

describe("signing an inventory", () => {
  let key: Awaited<ReturnType<typeof generateSigningKey>>;
  let other: Awaited<ReturnType<typeof generateSigningKey>>;

  beforeAll(async () => {
    key = await generateSigningKey();
    other = await generateSigningKey();
  });

  it("verifies what it signed", async () => {
    const signed = await signInventory(inventoryFrom(fragments(), ENDY), key, { signer: "Endy lab" });
    const [check] = await verifyInventory(signed);
    expect(check!.ok).toBe(true);
    expect(check!.signer).toBe("Endy lab");
    expect(check!.fingerprint).toBe(await keyFingerprint(key.publicKey));
    expect(isSignedInventory(signed)).toBe(true);
  });

  it("refuses an inventory a part was added to afterwards", async () => {
    const signed = await signInventory(inventoryFrom(fragments(), ENDY), key);
    const parts = [...signed.inventory.parts, { ...signed.inventory.parts[0]!, id: "4", name: "f4" }];
    const [check] = await verifyInventory({ ...signed, inventory: { ...signed.inventory, parts } });
    expect(check!.ok).toBe(false);
    expect(check!.problem).toMatch(/not what that key signed/);
  });

  it("refuses an inventory whose address was changed afterwards", async () => {
    const signed = await signInventory(inventoryFrom(fragments(), ENDY), key);
    const lab = { ...signed.inventory.lab, origin: "https://somewhere.else.example" };
    expect((await verifyInventory({ ...signed, inventory: { ...signed.inventory, lab } }))[0]!.ok).toBe(false);
  });

  it("does not mistake a signature over something else for one over an inventory", async () => {
    const inventory = inventoryFrom(fragments(), ENDY);
    const elsewhere = await signUnder("biolibs/opencloning signed plan v2", inventory, key, {});
    const [check] = await verifyInventory({ inventory, signatures: [elsewhere] });
    expect(check!.ok).toBe(false);
    // It fails because the bytes differ, not because the key or the signature could not be read.
    expect(check!.problem).toBe("This document is not what that key signed.");
    expect(check!.fingerprint).toBe(await keyFingerprint(key.publicKey));
    expect((await verifyUnder(INVENTORY_DOMAIN, inventory, [elsewhere]))[0]!.ok).toBe(false);
    expect((await verifyUnder("biolibs/opencloning signed plan v2", inventory, [elsewhere]))[0]!.ok,
           "the same signature is good under its own domain").toBe(true);
  });

  it("lets another lab countersign", async () => {
    const once = await signInventory(inventoryFrom(fragments(), ENDY), key, { signer: "Endy lab" });
    const twice = await signInventory(once, other, { signer: "a lab that has seen them" });
    expect((await verifyInventory(twice)).map((check) => check.ok)).toEqual([true, true]);
  });

  it("hands back what arrived, so what was checked is what gets used", async () => {
    const signed = await signInventory(inventoryFrom(fragments(), ENDY), key);
    const travelled = JSON.parse(JSON.stringify(signed)) as unknown;
    const read = readInventory(travelled);
    expect(read).toBe(travelled);
    expect((await verifyInventory(read))[0]!.ok).toBe(true);
  });

  it("refuses what is not an inventory", () => {
    expect(() => readInventory({ hello: true })).toThrow(/not a signed inventory/);
    expect(() => readInventory({ inventory: {}, signatures: [] })).toThrow(/which lab published it/);
    expect(() => readInventory({ inventory: { lab: ENDY }, signatures: [] })).toThrow(/no list of parts/);
    expect(() => readInventory({ inventory: { lab: ENDY, parts: [{ checksum: "x" }] }, signatures: [] }))
      .toThrow(/not a part/);
    expect(() => readInventory({ inventory: { lab: { ...ENDY, note: "x".repeat(3_000) }, parts: [] }, signatures: [] }))
      .toThrow(/more about the lab/);
  });
});

describe("where a lab lives", () => {
  it("takes an address however it was typed", () => {
    for (const written of ["endylab.example", "https://endylab.example", "https://endylab.example/parts?a=1"]) {
      expect(labOrigin(written)).toBe("https://endylab.example");
    }
    expect(inventoryUrl("endylab.example")).toBe(`https://endylab.example${INVENTORY_PATH}`);
  });

  it("will not take an address whose connection proves nothing", () => {
    expect(() => labOrigin("http://endylab.example")).toThrow(/must be https/);
    expect(() => labOrigin("")).toThrow(/not an address/);
    expect(() => labOrigin("not a url at all")).toThrow(/not an address/);
  });

  it("lets a machine talk to itself", () => {
    expect(labOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    expect(labOrigin("http://127.0.0.1:8080")).toBe("http://127.0.0.1:8080");
  });

  it("compares addresses, not the text they were written as", () => {
    expect(originMatches("https://endylab.example/", "endylab.example")).toBe(true);
    expect(originMatches("https://endylab.example", "https://endylab.example:8443")).toBe(false);
    expect(originMatches("nonsense", "endylab.example")).toBe(false);
  });
});

describe("fetching one", () => {
  let key: Awaited<ReturnType<typeof generateSigningKey>>;
  let signed: SignedInventory;

  beforeAll(async () => {
    key = await generateSigningKey();
    signed = await signInventory(inventoryFrom(fragments(), ENDY), key, { signer: "Endy lab" });
  });

  it("checks the signatures and the address separately", async () => {
    const found = await fetchInventory("endylab.example", { fetch: serving(signed) });
    expect(found.origin).toBe("https://endylab.example");
    expect(found.checks[0]!.ok).toBe(true);
    expect(found.fromItsOwnAddress).toBe(true);
    expect(settled(found)).toBe(true);
    expect(signingKeys(found)).toEqual([await keyFingerprint(key.publicKey)]);
  });

  it("refuses an inventory served from somewhere it does not claim", async () => {
    const found = await fetchInventory("elsewhere.example", { fetch: serving(signed) });
    expect(found.checks[0]!.ok, "the signature itself is still good").toBe(true);
    expect(found.fromItsOwnAddress).toBe(false);
    expect(settled(found)).toBe(false);
  });

  it("counts an unsigned inventory as nothing claimed", async () => {
    const bare = { inventory: signed.inventory, signatures: [] };
    const found = await fetchInventory("endylab.example", { fetch: serving(bare) });
    expect(found.checks).toEqual([]);
    expect(found.fromItsOwnAddress).toBe(true);
    expect(settled(found)).toBe(false);
  });

  it("says plainly when there is nothing there", async () => {
    await expect(fetchInventory("endylab.example", { fetch: serving(signed, 404) }))
      .rejects.toThrow(/no inventory to read \(404\)/);
    const notJson = (async () => ({ ok: true, status: 200, text: async () => "<html>" })) as unknown as typeof fetch;
    await expect(fetchInventory("endylab.example", { fetch: notJson })).rejects.toThrow(/is not JSON/);
  });
});

describe("remembering a lab", () => {
  it("notices a key changing, and nothing else", () => {
    const memory = labMemory();
    expect(remember(memory, "https://endylab.example", ["aaaa-bbbb"]).how).toBe("new");
    expect(remember(memory, "https://endylab.example", ["aaaa-bbbb"]).how).toBe("known");

    const changed = remember(memory, "https://endylab.example", ["cccc-dddd"]);
    expect(changed.how).toBe("changed");
    expect(changed.before).toEqual(["aaaa-bbbb"]);
    expect(changed.now).toEqual(["cccc-dddd"]);
    expect(recognise(memory, "https://endylab.example", ["cccc-dddd"]).how,
           "the change is written down, not argued with").toBe("known");
  });

  it("does not care what order the keys came in", () => {
    const memory = labMemory();
    remember(memory, "https://endylab.example", ["bbbb", "aaaa"]);
    expect(recognise(memory, "https://endylab.example", ["aaaa", "bbbb"]).how).toBe("known");
  });

  it("writes nothing down for a lab that signed nothing", () => {
    const memory = labMemory();
    expect(remember(memory, "https://endylab.example", []).how).toBe("new");
    expect(memory.get("https://endylab.example")).toBeNull();
  });
});

describe("what a plan needs", () => {
  it("is the molecules no step in it makes", () => {
    const needed = partsNeeded(plan().document);
    expect(needed.map((part) => part.name).sort()).toEqual(["f1", "f2", "f3"]);
    expect(needed.map((part) => part.checksum)).toEqual(fragments().map((part) => part.seguid()));
    expect(needed.every((part) => part.length === 50 && !part.circular)).toBe(true);
  });

  it("finds who has them, by checksum", async () => {
    const key = await generateSigningKey();
    const held = [fragments()[0]!, fragments()[1]!];
    const signed = await signInventory(inventoryFrom(held, ENDY), key);
    const found = await fetchInventory("endylab.example", { fetch: serving(signed) });

    const sourcing = whoHas(partsNeeded(plan().document), [found]);
    expect(sourcing.map((one) => one.holders.length)).toEqual([1, 1, 0]);
    expect(sourcing[0]!.holders[0]!.lab).toBe("Endy lab");
    expect(sourcing[0]!.holders[0]!.origin).toBe("https://endylab.example");
    expect(unsourced(sourcing).map((part) => part.name)).toEqual(["f3"]);
  });

  it("matches a part the holding lab calls something else entirely", async () => {
    const key = await generateSigningKey();
    const theirs = fragments()[2]!;
    theirs.name = "pEndy-402";
    const signed = await signInventory(inventoryFrom([theirs], ENDY), key);
    const found = await fetchInventory("endylab.example", { fetch: serving(signed) });

    const sourcing = whoHas(partsNeeded(plan().document), [found]);
    const forF3 = sourcing.find((one) => one.needed.name === "f3")!;
    expect(forF3.holders[0]!.part.name).toBe("pEndy-402");
  });

  it("separates what nobody has from what nobody will send", async () => {
    const key = await generateSigningKey();
    const signed = await signInventory(inventoryFrom(fragments(), ENDY, { available: false }), key);
    const found = await fetchInventory("endylab.example", { fetch: serving(signed) });

    const sourcing = whoHas(partsNeeded(plan().document), [found]);
    expect(unsourced(sourcing)).toEqual([]);
    expect(heldButNotOffered(sourcing).map((part) => part.name)).toEqual(["f1", "f2", "f3"]);
  });

  it("asks nobody when there is nobody to ask", () => {
    const sourcing = whoHas(partsNeeded(plan().document), [] as FetchedInventory[]);
    expect(unsourced(sourcing).length).toBe(3);
  });
});
