/**
 * A tube the lab has not sequenced.
 *
 * A part is known by the checksum of its sequence, so a tube of something nobody has read cannot
 * be a tube of a part — and until now it could not be anything, which left a real freezer with no
 * way into the model at all. A specimen is the answer, and it is deliberately the same answer a
 * culture already gets: something the lab physically has, known by an ID rather than a checksum,
 * that cannot satisfy a plan and cannot travel in a method.
 *
 * What is checked here is that the two halves hold. The tube behaves like any other lot while
 * nobody knows what it is; and once an identification says what it is, the *same tube* reads as a
 * tube of that molecule, keeping where it sits and how much is left, because the tube never
 * changed — only what is known about it did.
 */
import { generateSigningKey, type SigningKey } from "@biolibs/opencloning";
import { addItem, addPart, addPlace, addSpecimen, addToRoster, adjustItem, foundLab, identifySpecimen, mergeLog, newItemId, newPlaceId,
         newPlanId, newSpecimenId, nextEntry, planRun, publicMethod, putItem, setField,
         type LabState, type Operation, type SignedEntry } from "@biolibs/bionet";
import { beforeAll, describe, expect, it } from "vitest";

const SEQUENCE = "GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGAGAGGGTGCTTCAGAGTATGTATACC";

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
/** A lab with one unidentified tube in a box, and 30 of whatever its unit is. */
async function freezer(): Promise<{ device: Device; specimen: string; item: string; place: string }> {
  const device = new Device(ada, [await foundLab(ada, { name: "The Wren Lab", person: "Ada" })]);
  await device.write(addToRoster(bob.publicKey, "Bob"));
  const place = newPlaceId();
  await device.write(addPlace({ place, kind: "box", name: "Box 3", parent: null, grid: null }));
  const specimen = newSpecimenId();
  await device.write(addSpecimen({ specimen, name: "pET from the back of the -80", note: "nobody remembers" }));
  const item = newItemId();
  await device.write(addItem({ item, specimen, amount: 30, unit: "µL" }));
  await device.write(putItem(item, place, null));
  return { device, specimen, item, place };
}

describe("a tube nobody has sequenced", () => {
  it("can be held, put somewhere and counted, like any other lot", async () => {
    const { device, specimen, item, place } = await freezer();
    await device.write(adjustItem(item, -5));
    const lab = await device.lab();
    const held = lab.items.find((one) => one.item === item)!;
    expect(held.specimen).toBe(specimen);
    expect(held.part).toBeNull();
    expect(held.strain).toBeNull();
    expect(held.amount).toBe(25);
    expect(held.where).toEqual({ place, slot: null });
    expect(lab.specimens[0]!.name).toBe("pET from the back of the -80");
    expect(lab.specimens[0]!.note).toBe("nobody remembers");
    expect(lab.specimens[0]!.is).toBeNull();
  });

  it("is of one thing only: a part, a strain or a specimen", async () => {
    const { device, specimen } = await freezer();
    await device.write(addPart({ sequence: SEQUENCE, name: "something" }));
    const checksum = (await device.lab()).parts[0]!.checksum;
    await device.write(addItem({ item: newItemId(), part: checksum, specimen, amount: 1 }));
    expect((await lastOf(device)).reason).toMatch(/only one of those/);
    await device.write(addItem({ item: newItemId(), amount: 1 }));
    expect((await lastOf(device)).reason).toMatch(/only one of those/);
  });

  it("will not be a tube of a specimen the lab has never heard of", async () => {
    const { device } = await freezer();
    await device.write(addItem({ item: newItemId(), specimen: newSpecimenId(), amount: 1 }));
    expect(await lastOf(device)).toEqual({ status: "refused", reason: "The specimen it is a tube of is not one the lab has." });
  });
});

describe("finding out what it is", () => {
  it("makes the same tube read as a tube of that molecule, keeping where it is and how much is left", async () => {
    const { device, specimen, item, place } = await freezer();
    await device.write(adjustItem(item, -5));
    await device.write(addPart({ sequence: SEQUENCE, name: "pET-21a, as read", circular: true }));
    const checksum = (await device.lab()).parts[0]!.checksum;
    await device.write(identifySpecimen(specimen, checksum));

    const lab = await device.lab();
    const held = lab.items.find((one) => one.item === item)!;
    expect(held.part).toBe(checksum);          // it is now a tube of that molecule
    expect(held.specimen).toBe(specimen);      // and still says where it came from
    expect(held.amount).toBe(25);              // the tube did not change
    expect(held.where).toEqual({ place, slot: null });
    expect(lab.specimens[0]!.is).toBe(checksum);
  });

  it("will not take a molecule the lab does not have, or a specimen it does not have", async () => {
    const { device, specimen } = await freezer();
    await device.write(identifySpecimen(specimen, "ldseguid=nothing"));
    expect(await lastOf(device)).toEqual({ status: "refused", reason: "What it says the specimen is is not a part the lab has." });
    await device.write(addPart({ sequence: SEQUENCE, name: "something" }));
    const checksum = (await device.lab()).parts[0]!.checksum;
    await device.write(identifySpecimen(newSpecimenId(), checksum));
    expect(await lastOf(device)).toEqual({ status: "refused", reason: "The specimen it identifies is not one the lab has." });
  });

  it("settles the same way everywhere when two people read the same tube at once", async () => {
    const { device, specimen } = await freezer();
    await device.write(addPart({ sequence: SEQUENCE, name: "one reading" }));
    await device.write(addPart({ sequence: `${SEQUENCE}AAAA`, name: "another reading" }));
    const lab = await device.lab();
    const [first, second] = lab.parts.map((one) => one.checksum) as [string, string];

    // Two devices that have not heard of each other, each identifying the same tube.
    const other = new Device(bob, device.held);
    await device.write(identifySpecimen(specimen, first));
    await other.write(identifySpecimen(specimen, second));
    device.hear(other);
    other.hear(device);
    const mine = (await device.lab()).specimens[0]!.is;
    const theirs = (await other.lab()).specimens[0]!.is;
    expect(mine).toBe(theirs);
    expect([first, second]).toContain(mine);
  });

  it("keeps a note of its own, and refuses to have its identity written as a field", async () => {
    const { device, specimen } = await freezer();
    await device.write(setField("specimen", specimen, "came_from", "a box Ed handed over"));
    expect((await lastOf(device)).status).toBe("applied");
    expect((await device.lab()).specimens[0]!.fields["came_from"]).toBe("a box Ed handed over");
    await device.write(setField("specimen", specimen, "is", "ldseguid=made-up"));
    expect(await lastOf(device)).toEqual({ status: "refused", reason: "It does not name a field that can be set." });
  });
});

describe("what a method says about one", () => {
  const WREN = { name: "The Wren Lab", origin: "", contact: null, note: null };

  /** A step that uses the unidentified tube, so a published method has to say something about it. */
  const planned = async (): Promise<LabState> => {
    const { device, item } = await freezer();
    const plan = newPlanId();
    await device.write(planRun({ plan, kind: "pcr", instrument: null,
                                 inputs: [{ item, amount: 1, role: "template" }],
                                 expects: [{ sequence: SEQUENCE, name: "a copy", circular: false }], settings: {}, note: null }));
    return device.lab();
  };

  it("will not send it, for the same reason it will not send a culture", async () => {
    const method = publicMethod(await planned(), WREN);
    const need = method.needs.find((one) => one.part === null)!;
    expect(need).toBeDefined();
    // No checksum to travel under, and nothing written out in its place.
    expect(need.part).toBeNull();
    expect(need.sequence).toBeUndefined();
  });

  it("does not put the lab's own note on the tube into a published document", async () => {
    const method = publicMethod(await planned(), WREN);
    // What somebody scribbled on a tube is private, and would tell another lab nothing anyway.
    const written = JSON.stringify(method);
    expect(written).not.toContain("pET from the back of the -80");
    expect(written).not.toContain("nobody remembers");
    expect(method.needs.some((one) => one.name === "something the publishing lab had not identified")).toBe(true);
  });
});
