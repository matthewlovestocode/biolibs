/**
 * Runs every code block in this package's README, so the published examples cannot drift.
 *
 * Each `it` mirrors one section; the assertions are the outputs the README prints as comments. The
 * fetching example is given a stub to fetch with, since a test must not reach the network — what it
 * serves is a real signed inventory, so everything checked about it is checked for real.
 */
import { Dseqrecord } from "@biolibs/dseqrecord";
import { gibsonAssembly } from "@biolibs/assembly2";
import { CloningStrategy, generateSigningKey, keyFingerprint } from "@biolibs/opencloning";
import { addItem, addPart, addPlace, addToRoster, adjustItem, annotatePart, discover, entryId, fetchInventory, foundLab,
         introducedDifferently, inventoryFrom, labMemory, mergeLog, newItemId, newPlaceId, newRunId, nextEntry, partsNeeded,
         peer, publicInventory, putItem, recordRun, remember, settled, settledLabs, signInventory, verifyInventory,
         type Operation, type SignedEntry,
         signingKeys, unsourced, whoHas, type SignedInventory } from "@biolibs/bionet";
import { describe, expect, it } from "vitest";

const F1 = "GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGA";
const F2 = "CAACCCCGGCCCCTGAGTCCGAGGAGAGGGTGCTTCAGAGTATGTATACC";
const F3 = "GAGGGTGCTTCAGAGTATGTATACCGGATCACAGTCTACACTGCTCACTC";

const parts = (): Dseqrecord[] => [
  new Dseqrecord(F1, false, undefined, "1", "f1"),
  new Dseqrecord(F2, false, undefined, "2", "f2"),
  new Dseqrecord(F3, false, undefined, "3", "f3"),
];

/** @param labs - What each address serves. @returns Something to fetch with. */
const serving = (labs: Record<string, SignedInventory>): typeof globalThis.fetch =>
  (async (url: string) => {
    const signed = labs[new URL(url).origin];
    return signed === undefined
      ? { ok: false, status: 404, text: async () => "" }
      : { ok: true, status: 200, text: async () => JSON.stringify(signed) };
  }) as unknown as typeof globalThis.fetch;

/** @param signed - One lab's inventory. @returns A fetch serving it at the address it claims. */
const servingOne = (signed: SignedInventory): typeof globalThis.fetch =>
  serving({ [signed.inventory.lab.origin]: signed });

describe("README: publishing what a lab holds", () => {
  it("lists each part by name and by checksum", async () => {
    const key = await generateSigningKey();
    const [f1, f2, f3] = parts();
    const inventory = inventoryFrom([f1!, f2!, f3!], {
      name: "Wren lab", origin: "https://wrenlab.example", contact: null, note: null,
    });
    expect(inventory.parts[0]!.name).toBe("f1");
    expect(inventory.parts[0]!.checksum).toMatch(/^ldseguid=/);

    const published = await signInventory(inventory, key, { signer: "Wren lab" });
    expect(published.signatures.length).toBe(1);
  });
});

describe("README: reading somebody else's", () => {
  it("checks the signature and the address, and names the key", async () => {
    const key = await generateSigningKey();
    const [f1, f2] = parts();
    const published = await signInventory(inventoryFrom([f1!, f2!], {
      name: "Wren lab", origin: "https://wrenlab.example", contact: null, note: null,
    }), key, { signer: "Wren lab" });

    const found = await fetchInventory("wrenlab.example", { fetch: servingOne(published) });
    expect(found.checks[0]!.ok).toBe(true);
    expect(found.fromItsOwnAddress).toBe(true);
    expect(settled(found)).toBe(true);
    expect(signingKeys(found)).toEqual([await keyFingerprint(key.publicKey)]);
  });
});

describe("README: noticing when a key changes", () => {
  it("goes new, then known, then changed", async () => {
    const key = await generateSigningKey();
    const published = await signInventory(inventoryFrom(parts(), {
      name: "Wren lab", origin: "https://wrenlab.example", contact: null, note: null,
    }), key);
    const found = await fetchInventory("wrenlab.example", { fetch: servingOne(published) });

    const memory = labMemory();
    expect(remember(memory, found.origin, signingKeys(found)).how).toBe("new");
    expect(remember(memory, found.origin, signingKeys(found)).how).toBe("known");
    expect(remember(memory, found.origin, ["9999-aaaa-bbbb-cccc"]).how).toBe("changed");
  });
});

describe("README: how labs find each other", () => {
  it("walks from a lab it was told about to one it was not", async () => {
    const key = await generateSigningKey();
    const lab = { name: "Wren lab", origin: "https://wrenlab.example", contact: null, note: null };
    const other = await signInventory(inventoryFrom([parts()[2]!], {
      ...lab, name: "Other lab", origin: "https://otherlab.example",
    }), key);
    const wren = await signInventory(inventoryFrom([parts()[0]!], lab, {
      peers: [peer("otherlab.example", { name: "Other lab", key: await keyFingerprint(key.publicKey) })],
    }), key);

    const walk = await discover(["wrenlab.example"], {
      maxDepth: 2,
      fetch: serving({ "https://wrenlab.example": wren, "https://otherlab.example": other }),
    });
    expect(walk.reached.map((one) => one.path.join(" → "))).toEqual([
      "https://wrenlab.example",
      "https://wrenlab.example → https://otherlab.example",
    ]);
    expect(walk.reached[1]!.asIntroduced).toBe("agrees");
    expect(introducedDifferently(walk)).toEqual([]);
    expect(settledLabs(walk).length).toBe(2);
  });
});

describe("README: asking who has the parts", () => {
  it("finds two of the three, and says which is missing", async () => {
    const key = await generateSigningKey();
    const [f1, f2, f3] = parts();
    const [plasmid] = gibsonAssembly([f1!, f2!, f3!], 25, true);
    plasmid!.id = "100";
    const plan = CloningStrategy.fromRecords([plasmid!], { description: "a 75 bp circle" });

    const published = await signInventory(inventoryFrom([parts()[0]!, parts()[1]!], {
      name: "Wren lab", origin: "https://wrenlab.example", contact: null, note: null,
    }), key);
    const found = await fetchInventory("wrenlab.example", { fetch: servingOne(published) });

    const needed = partsNeeded(plan.document);
    expect(needed.map((part) => part.name)).toEqual(["f1", "f2", "f3"]);

    const sourcing = whoHas(needed, [found]);
    expect(sourcing[0]!.holders[0]!.lab).toBe("Wren lab");
    expect(unsourced(sourcing).map((part) => part.name)).toEqual(["f3"]);
  });
});

describe("README: inside a lab", () => {
  it("counts what two people used while offline, and shows the world only the part", async () => {
    const adasKey = await generateSigningKey();
    const bobsKey = await generateSigningKey();

    const founding = await foundLab(adasKey, { name: "The Wren Lab", person: "Ada" });
    const ada: SignedEntry[] = [founding];
    const write = async (held: SignedEntry[], key: typeof adasKey, op: Operation) =>
      held.push(await nextEntry(await mergeLog(held), key, op));

    await write(ada, adasKey, addToRoster(bobsKey.publicKey, "Bob"));
    await write(ada, adasKey, addPart({ sequence: F1, name: "f1" }));
    const part = (await mergeLog(ada)).parts[0]!.checksum;
    const tube = newItemId();
    await write(ada, adasKey, addItem({ item: tube, part, amount: 10, unit: "µL" }));

    const bob = [...ada];
    await write(ada, adasKey, adjustItem(tube, -1));
    await write(bob, bobsKey, adjustItem(tube, -2));

    const everything = [...new Set([...ada, ...bob])];
    expect((await mergeLog(everything)).items[0]!.amount).toBe(7);
    expect((await mergeLog(everything.reverse())).items[0]!.amount).toBe(7);

    const lab = await mergeLog(everything);
    expect(lab.lab).toBe(await entryId(founding.entry));
    const inventory = publicInventory(lab, {
      name: "The Wren Lab", origin: "https://lab-wren.onrender.com", contact: null, note: null,
    });
    expect(inventory.parts.map((one) => [one.name, one.available])).toEqual([["f1", false]]);

    const published = await signInventory(inventory, adasKey, { signer: "Ada" });
    expect((await verifyInventory(published)).every((check) => check.ok)).toBe(true);
  });

  it("knows where a tube is", async () => {
    const adasKey = await generateSigningKey();
    const ada: SignedEntry[] = [await foundLab(adasKey, { name: "The Wren Lab", person: "Ada" })];
    const write = async (held: SignedEntry[], key: typeof adasKey, op: Operation) =>
      held.push(await nextEntry(await mergeLog(held), key, op));
    await write(ada, adasKey, addPart({ sequence: F1, name: "f1" }));
    const tube = newItemId();
    await write(ada, adasKey, addItem({ item: tube, part: (await mergeLog(ada)).parts[0]!.checksum, amount: 10, unit: "µL" }));

    const freezer = newPlaceId();
    const box = newPlaceId();
    await write(ada, adasKey, addPlace({ place: freezer, kind: "freezer", name: "−80" }));
    await write(ada, adasKey, addPlace({ place: box, kind: "box", name: "Box 1", parent: freezer, grid: { rows: 9, columns: 9 } }));
    await write(ada, adasKey, putItem(tube, box, { row: 2, column: 3 }));

    const lab = await mergeLog(ada);
    expect(lab.places.map((one) => one.name)).toEqual(["−80", "Box 1"]);
    expect(lab.items[0]!.where).toEqual({ place: box, slot: { row: 2, column: 3 } });
    expect(lab.crowded).toEqual([]);
  });

  it("keeps what is marked on a part", async () => {
    const adasKey = await generateSigningKey();
    const ada: SignedEntry[] = [await foundLab(adasKey, { name: "The Wren Lab", person: "Ada" })];
    const write = async (held: SignedEntry[], key: typeof adasKey, op: Operation) =>
      held.push(await nextEntry(await mergeLog(held), key, op));
    await write(ada, adasKey, addPart({ sequence: F1, name: "f1" }));
    const part = (await mergeLog(ada)).parts[0]!.checksum;

    await write(ada, adasKey, annotatePart(part, [{ type: "CDS", label: "demo", strand: 1, parts: [{ start: 5, end: 35 }] }]));
    expect((await mergeLog(ada)).parts[0]!.features.length).toBe(1);
  });

  it("keeps a part's sticky ends", async () => {
    const adasKey = await generateSigningKey();
    const ada: SignedEntry[] = [await foundLab(adasKey, { name: "The Wren Lab", person: "Ada" })];
    const write = async (held: SignedEntry[], key: typeof adasKey, op: Operation) =>
      held.push(await nextEntry(await mergeLog(held), key, op));

    await write(ada, adasKey, addPart({ sequence: "AATTCGGGGTTTTGGGGCCCCAAAAGGATC", name: "piece", ends: { left: 4, right: 4 } }));
    expect((await mergeLog(ada)).parts.at(-1)!.ends).toEqual({ left: 4, right: 4 });
  });

  it("records what was done at the bench", async () => {
    const adasKey = await generateSigningKey();
    const ada: SignedEntry[] = [await foundLab(adasKey, { name: "The Wren Lab", person: "Ada" })];
    const write = async (held: SignedEntry[], key: typeof adasKey, op: Operation) =>
      held.push(await nextEntry(await mergeLog(held), key, op));
    await write(ada, adasKey, addPart({ sequence: F1, name: "f1" }));
    const tube = newItemId();
    await write(ada, adasKey, addItem({ item: tube, part: (await mergeLog(ada)).parts[0]!.checksum, amount: 10, unit: "µL" }));

    const product = newItemId();
    const run = newRunId();
    await write(ada, adasKey, recordRun({
      run, kind: "pcr", instrument: null,
      inputs: [{ item: tube, amount: 1, role: "template" }],
      outputs: [{ item: product, sequence: F1.slice(0, 40), circular: false, name: "amplicon", amount: 50, unit: "µL" }],
      settings: { anneal_at_least: 18 }, outcome: "worked", note: null,
    }));

    const after = await mergeLog(ada);
    expect(after.items.find((one) => one.item === tube)?.amount).toBe(9);
    expect(after.items.find((one) => one.item === product)?.from).toBe(run);
    expect(after.runs.length).toBe(1);
  });
});
