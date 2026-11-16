/**
 * Where things are, as signed changes.
 *
 * Places are a tree, an item is put in a place and perhaps at a position, and all of it merges like
 * the rest of a lab. What is checked hardest is what two people apart can do to each other: move
 * two places into one another, or each stand a tube in the same position. Neither is refused, since
 * neither person did anything wrong; both are shown as needing somebody to look.
 */
import { generateSigningKey, type SigningKey } from "@biolibs/opencloning";
import { addItem, addPart, addPlace, addToRoster, foundLab, mergeLog, movePlace, newItemId, newPlaceId, nextEntry,
         putItem, retirePlace, setField, standPlace, type LabState, type Operation, type SignedEntry } from "@biolibs/bionet";
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
