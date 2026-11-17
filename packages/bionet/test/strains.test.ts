/**
 * A living thing the lab keeps, and the cultures of it.
 *
 * A part is known by its sequence, so two labs that made the same molecule agree without ever
 * having spoken. A strain is deliberately not like that: it is known by an ID and says what it came
 * from, because two labs that put the same plasmid into the same published host have two strains,
 * which may behave differently and did not come from each other. What is checked here is that the
 * difference holds — that a strain is a thing in its own right, that a culture of one counts and
 * moves like any other lot, and that a transformation is an ordinary run that happens to make no
 * molecule, so a device that has never heard of strains still reads the run and the amounts it used.
 */
import { generateSigningKey, type SigningKey } from "@biolibs/opencloning";
import { addItem, addPart, addPlace, addStrain, addToRoster, adjustItem, foundLab, mergeLog, newItemId, newPlaceId, newRunId, newStrainId, nextEntry,
         putItem, recordRun, retireItem, setField, type LabState, type Operation, type SignedEntry, type StrainRecord } from "@biolibs/bionet";
import { beforeAll, describe, expect, it } from "vitest";

const PLASMID = "GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGAGAGGGTGCTTCAGAGTATGTATACC";
const OTHER = "AATTCGGGGTTTTGGGGCCCCAAAAGGATCCAGTCTACACTGCTCACTCC";

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

const lastOf = async (device: Device): Promise<{ status: string; reason: string | null }> => {
  const lab = await device.lab();
  const entry = lab.entries.find((one) => one.signed === device.held.at(-1))!;
  return { status: entry.status, reason: entry.reason };
};

/** A lab with a construct in a tube, a plain host strain, and a freezer to put things in. */
async function wren(): Promise<{ a: Device; b: Device; tube: string; construct: string; host: string; box: string; strain: (more?: Partial<StrainRecord>) => StrainRecord }> {
  const a = new Device(ada, [await foundLab(ada, { name: "The Wren Lab", person: "Ada" })]);
  await a.write(addToRoster(bob.publicKey, "Bob"));
  await a.write(addPart({ sequence: PLASMID, name: "pWren1" }));
  const construct = (await a.lab()).parts[0]!.checksum;
  const tube = newItemId();
  await a.write(addItem({ item: tube, part: construct, amount: 20, unit: "µL" }));
  const box = newPlaceId();
  await a.write(addPlace({ place: box, kind: "box", name: "Box 1", grid: { rows: 9, columns: 9 } }));
  const host = newStrainId();
  await a.write(addStrain({ strain: host, name: "W303", host: "Saccharomyces cerevisiae W303", carries: [], parent: null, from: null }));
  const strain = (more: Partial<StrainRecord> = {}): StrainRecord =>
    ({ strain: newStrainId(), name: "W303 pWren1-1", host: "Saccharomyces cerevisiae W303", carries: [construct], parent: host, from: null, ...more });
  return { a, b: new Device(bob, a.held), tube, construct, host, box, strain };
}

describe("a strain", () => {
  it("is a thing of its own, known by an ID and not by what it carries", async () => {
    const { a, construct, host, strain } = await wren();
    const one = strain();
    const two = strain({ name: "W303 pWren1-2" });
    await a.write(addStrain(one));
    await a.write(addStrain(two));
    const lab = await a.lab();
    expect(lab.strains).toHaveLength(3);
    // The same plasmid in the same host, twice, is two strains. That is the point of them.
    expect(lab.strains.filter((each) => each.carries[0] === construct).map((each) => each.name)).toEqual(["W303 pWren1-1", "W303 pWren1-2"]);
    expect(lab.strains.find((each) => each.strain === one.strain)).toMatchObject({
      name: "W303 pWren1-1", host: "Saccharomyces cerevisiae W303", carries: [construct], parent: host, from: null,
    });
    // And adding one puts nothing in the freezer, the way adding a part does not.
    expect(lab.items).toHaveLength(1);
  });

  it("may carry nothing, and may say which run made it", async () => {
    const { a, tube, host, strain } = await wren();
    expect((await a.lab()).strains.find((one) => one.strain === host)!.carries).toEqual([]);
    // A transformation is a run that uses things up and makes no molecule.
    const run = newRunId();
    await a.write(recordRun({ run, kind: "transformation", instrument: null, inputs: [{ item: tube, amount: 2, role: "construct" }],
                              outputs: [], settings: { method: "LiAc" }, outcome: "worked", note: "into W303" }));
    const made = strain({ from: run });
    await a.write(addStrain(made));
    const lab = await a.lab();
    expect(lab.strains.find((one) => one.strain === made.strain)!.from).toBe(run);
    expect(lab.items.find((one) => one.item === tube)!.amount).toBe(18);
    expect(lab.runs[0]).toMatchObject({ kind: "transformation", outcome: "worked", outputs: [] });
  });

  it.each([
    ["no ID, name or host", (one: StrainRecord): void => { one.name = ""; }, "It does not carry a strain ID, what to call it and what organism it is."],
    ["a part the lab does not have", (one: StrainRecord): void => { one.carries = ["nosuchpart"]; }, "What it says the strain carries is not a list of parts the lab has."],
    ["a parent the lab does not have", (one: StrainRecord): void => { one.parent = "nosuchstrain"; }, "The strain it says this one came from is not one the lab has."],
    ["a run the lab does not have", (one: StrainRecord): void => { one.from = "nosuchrun"; }, "The run it says made this strain is not one the lab has."],
  ])("is refused for %s", async (_what, spoil, reason) => {
    const { a, strain } = await wren();
    const one = strain();
    spoil(one);
    await a.write(addStrain(one));
    expect(await lastOf(a)).toEqual({ status: "refused", reason });
    expect((await a.lab()).strains).toHaveLength(1);
  });

  it("is refused if its ID is already a strain's", async () => {
    const { a, strain } = await wren();
    const one = strain();
    await a.write(addStrain(one));
    await a.write(addStrain({ ...one, name: "again" }));
    expect(await lastOf(a)).toEqual({ status: "refused", reason: "A strain with that ID already exists." });
    expect((await a.lab()).strains.find((each) => each.strain === one.strain)!.name).toBe("W303 pWren1-1");
  });

  it("can be renamed and have notes set on it, and cannot have what it is changed", async () => {
    const { a, strain } = await wren();
    const one = strain();
    await a.write(addStrain(one));
    await a.write(setField("strain", one.strain, "name", "W303 pWren1 (clone 1)"));
    await a.write(setField("strain", one.strain, "note", "grows slowly on glucose"));
    expect((await a.lab()).strains.find((each) => each.strain === one.strain)).toMatchObject({
      name: "W303 pWren1 (clone 1)", fields: { note: "grows slowly on glucose" } });
    for (const field of ["host", "carries", "parent", "from", "strain"]) {
      await a.write(setField("strain", one.strain, field, "something else"));
      expect((await lastOf(a)).reason, field).toBe("It does not name a field that can be set.");
    }
    expect((await a.lab()).strains.find((each) => each.strain === one.strain)!.host).toBe("Saccharomyces cerevisiae W303");
  });
});

describe("a culture of one", () => {
  it("counts, moves and retires like any other lot", async () => {
    const { a, box, strain } = await wren();
    const one = strain();
    await a.write(addStrain(one));
    const culture = newItemId();
    await a.write(addItem({ item: culture, strain: one.strain, amount: 5, unit: "mL" }));
    await a.write(adjustItem(culture, -2));
    await a.write(putItem(culture, box, { row: 0, column: 0 }));
    const held = (await a.lab()).items.find((each) => each.item === culture)!;
    expect(held).toMatchObject({ strain: one.strain, part: null, amount: 3, unit: "mL" });
    expect(held.where).toEqual({ place: box, slot: { row: 0, column: 0 } });
    await a.write(retireItem(culture));
    expect((await a.lab()).items.find((each) => each.item === culture)!.retired).toBe(true);
  });

  it("is of a part or of a strain and never both or neither", async () => {
    const { a, construct, strain } = await wren();
    const one = strain();
    await a.write(addStrain(one));
    await a.write({ type: "item.add", item: newItemId(), part: construct, strain: one.strain, amount: 1, unit: null });
    expect(await lastOf(a)).toEqual({ status: "refused", reason: "An item is of a part or a culture of a strain, and not both." });
    await a.write({ type: "item.add", item: newItemId(), amount: 1, unit: null });
    expect(await lastOf(a)).toEqual({ status: "refused", reason: "An item is of a part or a culture of a strain, and not both." });
    await a.write(addItem({ item: newItemId(), strain: "nosuchstrain", amount: 1 }));
    expect(await lastOf(a)).toEqual({ status: "refused", reason: "The strain it is a culture of is not one the lab has." });
    expect((await a.lab()).items).toHaveLength(1);
  });

  it("can be used by a run, like anything else in the freezer", async () => {
    const { a, strain } = await wren();
    const one = strain();
    await a.write(addStrain(one));
    const culture = newItemId();
    await a.write(addItem({ item: culture, strain: one.strain, amount: 50, unit: "mL" }));
    await a.write(recordRun({ run: newRunId(), kind: "induction", instrument: null, inputs: [{ item: culture, amount: 10, role: "culture" }],
                              outputs: [], settings: { hours: 24 }, outcome: "worked", note: null }));
    expect((await a.lab()).items.find((each) => each.item === culture)!.amount).toBe(40);
  });

  it("is the same on two machines that were apart", async () => {
    const { a, b, box, strain } = await wren();
    const one = strain();
    await a.write(addStrain(one));
    const culture = newItemId();
    await a.write(addItem({ item: culture, strain: one.strain, amount: 10, unit: "mL" }));
    b.hear(a);
    await a.write(adjustItem(culture, -3));
    await b.write(adjustItem(culture, -4));
    await b.write(putItem(culture, box, { row: 1, column: 1 }));
    a.hear(b);
    b.hear(a);
    const [atA, atB] = [await a.lab(), await b.lab()];
    expect(atA.items.find((each) => each.item === culture)!.amount).toBe(3);
    expect(atA.items).toEqual(atB.items);
    expect(atA.strains).toEqual(atB.strains);
  });
});

describe("a device that has never heard of strains", () => {
  it("is asked nothing new of the run, which is what lets it still read one", async () => {
    const { a, tube, strain } = await wren();
    const run = newRunId();
    await a.write(recordRun({ run, kind: "transformation", instrument: null, inputs: [{ item: tube, amount: 2, role: "construct" }],
                              outputs: [], settings: {}, outcome: "worked", note: null }));
    await a.write(addStrain(strain({ from: run })));

    // A transformation is an ordinary run that happens to make no molecule. Field for field it is
    // what a run always was, so a version that refuses an entry carrying a field it does not know
    // still applies this one, and still takes what it used. Only the strain is new, and an older
    // reader turns that away whole rather than making half of it.
    const recorded = a.held.find((one) => one.entry.op.type === "run.record")!.entry.op;
    expect(Object.keys(recorded).sort()).toEqual(["inputs", "instrument", "kind", "note", "outcome", "outputs", "run", "settings", "type"]);
    const lab = await a.lab();
    expect(lab.runs.map((one) => one.run)).toEqual([run]);
    expect(lab.items.find((one) => one.item === tube)!.amount).toBe(18);
    // And a culture says it is one by carrying `strain` where a tube carries `part`, so an older
    // reader turns that entry away too instead of reading it as a tube of something.
    const culture = newItemId();
    await a.write(addItem({ item: culture, strain: (await a.lab()).strains[1]!.strain, amount: 5, unit: "mL" }));
    const added = a.held.at(-1)!.entry.op as Record<string, unknown>;
    expect(Object.keys(added).sort()).toEqual(["amount", "item", "strain", "type", "unit"]);
    expect(added["part"]).toBeUndefined();
  });
});
