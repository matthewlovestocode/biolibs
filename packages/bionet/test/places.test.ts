/**
 * Where things are, as signed changes.
 *
 * Places are a tree, an item is put in a place and perhaps at a position, and all of it merges like
 * the rest of a lab. What is checked hardest is what two people apart can do to each other: move
 * two places into one another, or each stand a tube in the same position. Neither is refused, since
 * neither person did anything wrong; both are shown as needing somebody to look.
 */
import { generateSigningKey, type SigningKey } from "@biolibs/opencloning";
import { addItem, addPart, addPlace, addToRoster, adjustItem, annotatePart, foundLab, mergeLog, movePlace, newItemId, newPlaceId, newRunId, nextEntry,
         offerPart, putItem, recordRun, recountItem, removeFromRoster, retireItem, retirePlace, setField, setRole, standPlace, strayField,
         type LabState, type Operation, type PartFeature, type SignedEntry } from "@biolibs/bionet";
import { beforeAll, describe, expect, it } from "vitest";

const F1 = "GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGA";

let ada: SigningKey;
let bob: SigningKey;
beforeAll(async () => { [ada, bob] = await Promise.all([generateSigningKey(), generateSigningKey()]); });

class Device {
  held: SignedEntry[];
  constructor(readonly key: SigningKey, from: readonly SignedEntry[] = []) { this.held = [...from]; }
  async write(op: Operation): Promise<SignedEntry> {
    const entry = await nextEntry(await mergeLog(this.held), this.key, op);
    this.held.push(entry);
    return entry;
  }
  hear(other: Device): void { for (const entry of other.held) if (!this.held.includes(entry)) this.held.push(entry); }
  lab(): Promise<LabState> { return mergeLog(this.held); }
}

const last = async (device: Device): Promise<{ status: string; reason: string | null }> => {
  const lab = await device.lab();
  const entry = lab.entries.find((one) => one.signed === device.held.at(-1))!;
  return { status: entry.status, reason: entry.reason };
};

/** A lab with a freezer, a box of 9 × 9 in it, and two tubes of one part. */
async function wren(): Promise<{ a: Device; b: Device; freezer: string; box: string; tubes: [string, string] }> {
  const a = new Device(ada, [await foundLab(ada, { name: "The Wren Lab", person: "Ada" })]);
  await a.write(addToRoster(bob.publicKey, "Bob"));
  await a.write(addPart({ sequence: F1, name: "f1" }));
  const part = (await a.lab()).parts[0]!.checksum;
  const tubes: [string, string] = [newItemId(), newItemId()];
  for (const item of tubes) await a.write(addItem({ item, part, amount: 10, unit: "µL" }));
  const freezer = newPlaceId();
  const box = newPlaceId();
  await a.write(addPlace({ place: freezer, kind: "freezer", name: "−80" }));
  await a.write(addPlace({ place: box, kind: "box", name: "Box 1", parent: freezer, grid: { rows: 9, columns: 9 } }));
  return { a, b: new Device(bob, a.held), freezer, box, tubes };
}

describe("places", () => {
  it("are a tree, with a box's positions fixed when it is added", async () => {
    const { a, freezer, box } = await wren();
    const lab = await a.lab();
    expect(lab.places.map((one) => [one.name, one.kind, one.parent, one.grid])).toEqual([
      ["−80", "freezer", null, null], ["Box 1", "box", freezer, { rows: 9, columns: 9 }],
    ]);
    expect(lab.places.find((one) => one.place === box)).toMatchObject({ standing: null, retired: false, adrift: false });
  });

  it("can be renamed, moved, stood somewhere and retired", async () => {
    const { a, freezer, box } = await wren();
    const room = newPlaceId();
    await a.write(addPlace({ place: room, kind: "room", name: "Main lab" }));
    await a.write(movePlace(freezer, room));
    await a.write(setField("place", freezer, "name", "−80 by the door"));
    await a.write(setField("place", freezer, "serviced", "2026-11-01"));
    await a.write(standPlace(freezer, { at: [1200, 0, 400], size: [800, 2000, 800], turn: 90 }));
    await a.write(retirePlace(box));
    const lab = await a.lab();
    expect(lab.places.find((one) => one.place === freezer)).toMatchObject({
      name: "−80 by the door", parent: room, fields: { serviced: "2026-11-01" },
      standing: { at: [1200, 0, 400], size: [800, 2000, 800], turn: 90 },
    });
    expect(lab.places.find((one) => one.place === box)!.retired).toBe(true);
    await a.write(standPlace(freezer, null));
    expect((await a.lab()).places.find((one) => one.place === freezer)!.standing).toBeNull();
  });

  it("refuses what could never be a place", async () => {
    const { a, freezer, box } = await wren();
    const refused = async (op: Operation): Promise<string | null> => {
      await a.write(op);
      const { status, reason } = await last(a);
      expect(status).toBe("refused");
      a.held.pop();
      return reason;
    };
    expect(await refused(addPlace({ place: freezer, kind: "freezer", name: "again" }))).toMatch(/already exists/);
    expect(await refused(addPlace({ place: newPlaceId(), kind: "shelf", name: "Shelf", parent: "nowhere" }))).toMatch(/not one the lab has/);
    expect(await refused(addPlace({ place: newPlaceId(), kind: "box", name: "Box", grid: { rows: 0, columns: 9 } }))).toMatch(/whole numbers/);
    expect(await refused(addPlace({ place: newPlaceId(), kind: "box", name: "Box", grid: { rows: 9, columns: 1000 } }))).toMatch(/whole numbers/);
    expect(await refused(addPlace({ place: "not an id!", kind: "box", name: "Box" }))).toMatch(/place ID/);
    expect(await refused(movePlace(freezer, freezer))).toMatch(/inside itself/);
    expect(await refused(movePlace(freezer, "nowhere"))).toMatch(/not one the lab has/);
    expect(await refused(movePlace("nowhere", null))).toMatch(/not one the lab has/);
    // A fraction of a millimetre cannot even be signed.
    await expect(a.write(standPlace(box, { at: [0.5, 0, 0], size: [130, 50, 130], turn: 0 }))).rejects.toThrow(/whole numbers/);
    expect(await refused(standPlace(box, { at: [0, 0, 0], size: [130, 50, 2_000_000], turn: 0 }))).toMatch(/whole millimetres/);
    expect(await refused(standPlace(box, { at: [0, 0, 0], size: [0, 50, 130], turn: 0 }))).toMatch(/whole millimetres/);
    expect(await refused(standPlace(box, { at: [0, 0, 0], size: [130, 50, 130], turn: 45 as 90 }))).toMatch(/whole millimetres/);
    expect(await refused(setField("place", box, "grid", 3))).toMatch(/field that can be set/);
    expect(await refused(setField("place", box, "name", 3))).toMatch(/name has to be some text/);
    expect(await refused(setField("place", "nowhere", "note", "x"))).toMatch(/part, an item or a place/);
  });

  it("show a loop made by two people apart as places in nothing, and fix it with one move", async () => {
    const { a, b, freezer } = await wren();
    const fridge = newPlaceId();
    await a.write(addPlace({ place: fridge, kind: "fridge", name: "4 °C" }));
    b.hear(a);
    await a.write(movePlace(freezer, fridge));
    await b.write(movePlace(fridge, freezer));
    a.hear(b); b.hear(a);
    const lab = await a.lab();
    const [one, other] = [lab.places.find((each) => each.place === freezer)!, lab.places.find((each) => each.place === fridge)!];
    expect([one.adrift, one.parent, other.adrift, other.parent]).toEqual([true, null, true, null]);
    // The box in the freezer was never part of the loop, and still knows where it is.
    expect(lab.places.find((each) => each.kind === "box")).toMatchObject({ adrift: false, parent: freezer });
    expect(await b.lab()).toMatchObject({ places: lab.places });
    expect((await mergeLog([...a.held].reverse())).places).toEqual(lab.places);

    await a.write(movePlace(fridge, null));
    expect((await a.lab()).places.filter((each) => each.adrift)).toEqual([]);
    expect((await a.lab()).places.find((each) => each.place === freezer)!.parent).toBe(fridge);
  });
});

describe("where an item is", () => {
  it("is a place and, in a box, a position", async () => {
    const { a, freezer, box, tubes } = await wren();
    expect((await a.lab()).items[0]!.where).toBeNull();
    await a.write(putItem(tubes[0], box, { row: 0, column: 3 }));
    await a.write(putItem(tubes[1], freezer));
    const lab = await a.lab();
    expect(lab.items.map((one) => one.where)).toEqual([{ place: box, slot: { row: 0, column: 3 } }, { place: freezer, slot: null }]);
    expect(lab.crowded).toEqual([]);
    await a.write(putItem(tubes[0], null));
    expect((await a.lab()).items[0]!.where).toBeNull();
  });

  it("refuses a place or a position that does not exist", async () => {
    const { a, freezer, box, tubes } = await wren();
    for (const [op, why] of [
      [putItem(tubes[0], "nowhere"), /not one the lab has/],
      [putItem("no-such-item", box), /item it puts somewhere/],
      [putItem(tubes[0], box, { row: 9, column: 0 }), /position/],
      [putItem(tubes[0], box, { row: -1, column: 0 }), /position/],
      [putItem(tubes[0], freezer, { row: 0, column: 0 }), /position/],
      [{ type: "item.put", item: tubes[0], place: null, slot: { row: 0, column: 0 } }, /nowhere/],
    ] as [Operation, RegExp][]) {
      await a.write(op);
      const { status, reason } = await last(a);
      expect([status, reason]).toEqual(["refused", expect.stringMatching(why)]);
      a.held.pop();
    }
  });

  it("flags two tubes stood in one position by people apart, and stops when one is moved", async () => {
    const { a, b, box, tubes } = await wren();
    await a.write(putItem(tubes[0], box, { row: 2, column: 2 }));
    await b.write(putItem(tubes[1], box, { row: 2, column: 2 }));
    a.hear(b); b.hear(a);
    const lab = await a.lab();
    expect(lab.crowded).toEqual([{ place: box, slot: { row: 2, column: 2 }, items: [tubes[0], tubes[1]] }]);
    expect((await b.lab()).crowded).toEqual(lab.crowded);
    await b.write(putItem(tubes[1], box, { row: 2, column: 3 }));
    expect((await b.lab()).crowded).toEqual([]);
  });

  it("keeps one answer when two people apart put the same tube in different places, and says so", async () => {
    const { a, b, freezer, box, tubes } = await wren();
    const first = await a.write(putItem(tubes[0], box, { row: 0, column: 0 }));
    const second = await b.write(putItem(tubes[0], freezer));
    a.hear(b); b.hear(a);
    const lab = await a.lab();
    expect(lab.overlaps).toHaveLength(1);
    expect(lab.overlaps[0]!.what).toMatch(/^where item /);
    const kept = lab.entries.find((one) => one.id === lab.overlaps[0]!.kept)!.signed;
    expect([first, second]).toContain(kept);
    expect(lab.items[0]!.where).toEqual(kept === first ? { place: box, slot: { row: 0, column: 0 } } : { place: freezer, slot: null });
    expect((await b.lab()).items[0]!.where).toEqual(lab.items[0]!.where);
  });
});

describe("what is marked on a part", () => {
  const gene: PartFeature = { type: "CDS", label: "lacZ", strand: 1, parts: [{ start: 4, end: 40 }] };
  const split: PartFeature = { type: "misc_feature", label: "across the origin", strand: -1, parts: [{ start: 44, end: 50 }, { start: 0, end: 6 }] };

  it("is kept with the part, and replaced whole when it is said again", async () => {
    const { a } = await wren();
    const part = (await a.lab()).parts[0]!;
    expect(part.features).toEqual([]);
    await a.write(annotatePart(part.checksum, [gene, split]));
    expect((await a.lab()).parts[0]!.features).toEqual([gene, split]);
    await a.write(annotatePart(part.checksum, [gene]));
    expect((await a.lab()).parts[0]!.features).toEqual([gene]);
    await a.write(annotatePart(part.checksum, []));
    expect((await a.lab()).parts[0]!.features).toEqual([]);
  });

  it("is refused if it is not features, or lies outside the part", async () => {
    const { a } = await wren();
    const part = (await a.lab()).parts[0]!.checksum;       // 50 bases
    const refused: [unknown, RegExp][] = [
      [[{ ...gene, parts: [{ start: 4, end: 51 }] }], /lie within the part/],
      [[{ ...gene, parts: [{ start: 10, end: 10 }] }], /lie within the part/],
      [[{ ...gene, parts: [] }], /lie within the part/],
      [[{ ...gene, strand: 2 }], /lie within the part/],
      [[{ ...gene, label: "" }], /lie within the part/],
      ["not a list", /lie within the part/],
    ];
    for (const [features, why] of refused) {
      await a.write({ type: "part.annotate", part, features } as Operation);
      const { status, reason } = await last(a);
      expect([features, status, reason]).toEqual([features, "refused", expect.stringMatching(why)]);
      a.held.pop();
    }
    await a.write(annotatePart("no-such-part", [gene]));
    expect(await last(a)).toMatchObject({ status: "refused", reason: expect.stringMatching(/part the lab has/) });
    a.held.pop();
    await a.write(setField("part", part, "features", "sneaked in"));
    expect((await last(a)).status).toBe("refused");
  });

  it("keeps one answer when two people apart mark the same part, and says so", async () => {
    const { a, b } = await wren();
    const part = (await a.lab()).parts[0]!.checksum;
    await a.write(annotatePart(part, [gene]));
    await b.write(annotatePart(part, [split]));
    a.hear(b); b.hear(a);
    const lab = await a.lab();
    expect(lab.overlaps.some((one) => one.what.startsWith("what is marked on"))).toBe(true);
    expect(lab.parts[0]!.features).toEqual((await b.lab()).parts[0]!.features);
    expect(lab.parts[0]!.features).toHaveLength(1);
  });
});

describe("a part with sticky ends", () => {
  const BASES = "AATTCGGGGTTTTGGGGCCCCAAAAGGATC";
  const FLIPPED = "GATCCTTTTGGGGCCCCAAAACCCCGAATT";

  it("is a different part from the same bases with blunt ends, and keeps its ends", async () => {
    const { a } = await wren();
    await a.write(addPart({ sequence: BASES, name: "blunt" }));
    await a.write(addPart({ sequence: BASES, name: "cut", ends: { left: 4, right: 4 } }));
    const [blunt, cut] = (await a.lab()).parts.slice(-2);
    expect(blunt!.ends).toEqual({ left: 0, right: 0 });
    expect(cut!.ends).toEqual({ left: 4, right: 4 });
    expect(cut!.checksum).not.toBe(blunt!.checksum);
    expect(cut!.length).toBe(BASES.length);
  });

  it("is the same part whichever strand it was written from", async () => {
    const { a } = await wren();
    await a.write(addPart({ sequence: BASES, name: "one way", ends: { left: 4, right: -2 } }));
    const before = (await a.lab()).parts.length;
    // Turned over, the left end is the right end, and a 5′ overhang is still a 5′ overhang.
    await a.write(addPart({ sequence: FLIPPED, name: "the other way", ends: { left: -2, right: 4 } }));
    expect((await a.lab()).parts.length).toBe(before);
  });

  it("says nothing of ends that are blunt, so the entry and the checksum are what they always were", async () => {
    const { a } = await wren();
    expect(addPart({ sequence: BASES, name: "p", ends: { left: 0, right: 0 } })).toEqual(addPart({ sequence: BASES, name: "p" }));
    await a.write(addPart({ sequence: BASES, name: "p" }));
    const plain = (await a.lab()).parts.at(-1)!.checksum;
    await a.write({ type: "part.add", sequence: BASES, circular: false, name: "again", ends: { left: 0, right: 0 } } as Operation);
    expect((await a.lab()).parts.at(-1)!.checksum).toBe(plain);
  });

  it("is refused on a circle, when the ends are longer than the molecule, or when they are not numbers", async () => {
    const { a } = await wren();
    for (const op of [
      { type: "part.add", sequence: BASES, circular: true, name: "p", ends: { left: 4, right: 4 } },
      { type: "part.add", sequence: BASES, circular: false, name: "p", ends: { left: 20, right: 10 } },
      { type: "part.add", sequence: BASES, circular: false, name: "p", ends: { left: "4", right: 0 } },
      { type: "part.add", sequence: BASES, circular: false, name: "p", ends: "sticky" },
    ]) {
      await a.write(op as Operation);
      expect(await last(a)).toMatchObject({ status: "refused", reason: expect.stringMatching(/ends a molecule of that length can have/) });
      a.held.pop();
    }
  });

  it("comes out of a run with its ends, and a run whose ends make no sense is refused whole", async () => {
    const { a } = await wren();
    const lab = await a.lab();
    const tube = newItemId();
    await a.write(addItem({ item: tube, part: lab.parts[0]!.checksum, amount: 10, unit: "µL" }));
    const out = { item: newItemId(), sequence: BASES, circular: false, name: "piece", amount: 20, unit: "µL" };
    await a.write(recordRun({ run: newRunId(), kind: "digest", instrument: null, inputs: [{ item: tube, amount: 1, role: "cut" }],
                              outputs: [{ ...out, ends: { left: 4, right: 4 } }], settings: {}, outcome: "worked", note: null }));
    const after = await a.lab();
    expect(after.parts.at(-1)).toMatchObject({ name: "piece", ends: { left: 4, right: 4 } });
    expect(after.items.find((one) => one.item === tube)!.amount).toBe(9);

    await a.write(recordRun({ run: newRunId(), kind: "digest", instrument: null, inputs: [{ item: tube, amount: 1, role: "cut" }],
                              outputs: [{ ...out, item: newItemId(), ends: { left: 40, right: 4 } }], settings: {}, outcome: "worked", note: null }));
    expect(await last(a)).toMatchObject({ status: "refused", reason: expect.stringMatching(/ends a molecule of that length can have/) });
    a.held.pop();
    expect((await a.lab()).items.find((one) => one.item === tube)!.amount).toBe(9);
  });
});

describe("a change carrying something this version does not know", () => {
  // Every change the package itself writes. If a field is added to one of these and not to the
  // table the merge knows, this fails — which is the point: every reader has to be taught the field
  // before any writer may use it.
  const everything: Operation[] = [
    { type: "roster.found", name: "The Wren Lab", person: "Ada" },
    addToRoster("a".repeat(43), "Bob"),
    addToRoster("a".repeat(43), "Bob", "keeper"),
    removeFromRoster("a".repeat(43), 3),
    setRole("a".repeat(43), "keeper"),
    addPart({ sequence: F1, name: "f1" }),
    addPart({ sequence: F1, name: "f1", circular: true }),
    addPart({ sequence: "AATTCGGGGTTTTGGGGCCCCAAAAGGATC", name: "piece", ends: { left: 4, right: 4 } }),
    annotatePart("p", [{ type: "CDS", label: "g", strand: 1, parts: [{ start: 0, end: 9 }] }]),
    offerPart("p", true),
    addItem({ item: newItemId(), part: "p", amount: 10, unit: "µL" }),
    adjustItem("i", -2),
    recountItem("i", 7),
    retireItem("i"),
    putItem("i", "b", { row: 1, column: 2 }),
    putItem("i", "b", null),
    addPlace({ place: newPlaceId(), kind: "box", name: "Box 1" }),
    addPlace({ place: newPlaceId(), kind: "box", name: "Box 1", parent: "f", grid: { rows: 9, columns: 9 } }),
    movePlace("p", null),
    standPlace("p", { at: [0, 0, 0], size: [1, 1, 1], turn: 90 }),
    standPlace("p", null),
    retirePlace("p"),
    recordRun({ run: newRunId(), kind: "pcr", instrument: null, inputs: [{ item: "i", amount: 1, role: "template" }],
                outputs: [{ item: newItemId(), sequence: F1, circular: false, name: "n", amount: 50, unit: "µL" }],
                settings: { anneal_at_least: 18, note_to_self: "hot" }, outcome: "worked", note: null }),
    recordRun({ run: newRunId(), kind: "digest", instrument: null, inputs: [],
                outputs: [{ item: newItemId(), sequence: F1, circular: false, ends: { left: 4, right: -2 }, name: "n", amount: 1, unit: null }],
                settings: {}, outcome: "worked", note: "x" }),
    setField("part", "p", "note", "anything"),
  ];

  it("knows every field of every change this package writes", () => {
    for (const op of everything) expect([op.type, strayField(op)]).toEqual([op.type, null]);
    expect(everything.length).toBeGreaterThan(20);
  });

  it("lets be the fields that are open by design", () => {
    // A run's settings and a field's value are whatever the lab wants to put there.
    expect(strayField(recordRun({ run: "r", kind: "pcr", instrument: null, inputs: [], outputs: [],
                                  settings: { whatever_it_likes: 3 }, outcome: "failed", note: null }))).toBeNull();
    expect(strayField(setField("item", "i", "whatever_it_likes", "so"))).toBeNull();
  });

  it("says a field it does not know, wherever it sits", () => {
    expect(strayField({ type: "part.add", sequence: F1, circular: false, name: "f1", colour: "red" } as Operation)).toBe("colour");
    expect(strayField({ type: "part.add", sequence: F1, circular: false, name: "f1", ends: { left: 4, right: 0, kind: "5′" } } as Operation)).toBe("ends.kind");
    expect(strayField({ type: "part.annotate", part: "p", features: [{ type: "CDS", label: "g", strand: 1, parts: [{ start: 0, end: 9, why: "x" }] }] } as Operation)).toBe("features[0].parts[0].why");
    expect(strayField({ type: "run.record", run: "r", kind: "pcr", instrument: null, inputs: [], settings: {}, outcome: "worked", note: null,
                        outputs: [{ item: "i", sequence: F1, circular: false, name: "n", amount: 1, unit: null, phosphate: true }] } as Operation)).toBe("outputs[0].phosphate");
    // A kind of change it does not know is a different thing, and is said differently.
    expect(strayField({ type: "future.thing", whatever: 1 } as unknown as Operation)).toBeNull();
  });

  it("sets such a change aside rather than reading it, and the lab carries on", async () => {
    const { a } = await wren();
    const before = await a.lab();
    await a.write({ type: "part.add", sequence: F1, circular: false, name: "from the future", phosphorylated: true } as Operation);
    const said = await last(a);
    expect(said.status).toBe("not understood");
    expect(said.reason).toMatch(/"phosphorylated", which this version does not know/);
    const after = await a.lab();
    // Nothing of it was read: no part, and everything else the lab had is untouched.
    expect(after.parts.map((one) => one.name)).toEqual(before.parts.map((one) => one.name));
    expect(after.lab).toBe(before.lab);
    a.held.pop();
    // And an ordinary change written afterwards still applies.
    await a.write(addPart({ sequence: F1.slice(0, 30), name: "an ordinary one" }));
    expect((await a.lab()).parts.map((one) => one.name)).toContain("an ordinary one");
  });

  it("is why a part's ends could not simply be added", async () => {
    // The whole reason for the rule: a reader that did not know `ends` worked the checksum out from
    // the bases alone, so two machines read one entry differently. Now it would not read it at all.
    const { a } = await wren();
    await a.write(addPart({ sequence: "AATTCGGGGTTTTGGGGCCCCAAAAGGATC", name: "piece", ends: { left: 4, right: 4 } }));
    expect((await last(a)).status).toBe("applied");
    const sticky = (await a.lab()).parts.at(-1)!;
    expect(sticky.ends).toEqual({ left: 4, right: 4 });
    await a.write({ type: "part.add", sequence: "AATTCGGGGTTTTGGGGCCCCAAAAGGATC", circular: false, name: "piece", ends: { left: 4, right: 4 }, nicked: true } as Operation);
    expect((await last(a)).status).toBe("not understood");
    a.held.pop();
  });
});
