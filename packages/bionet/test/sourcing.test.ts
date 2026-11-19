/**
 * Turning a published method into a question for other labs.
 *
 * A method already knows what it starts from — it carries those molecules as `needs` — so sourcing
 * one should not mean reconstructing the plan behind it. What is checked hardest here is that
 * nothing disappears on the way: a method's hardest requirement is usually the living thing nobody
 * can send, and a sourcing list that quietly drops it is worse than no list.
 */
import { Dseqrecord } from "@biolibs/dseqrecord";
import { generateSigningKey, type SigningKey } from "@biolibs/opencloning";
import { addItem, addPart, addProspect, addToRoster, cannotTravel, foundLab, heldButNotOffered, inventoryFrom, mergeLog,
         methodNeeds, newItemId, newPlanId, newProspectId, nextEntry, planRun, publicMethod, signInventory,
         signMethod, unsourced, whoHas, type FetchedInventory, type LabState, type Operation,
         type SignedEntry } from "@biolibs/bionet";
import { beforeAll, describe, expect, it } from "vitest";

const BACKBONE = "GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGAGAGGGTGCTTCAGAGTATGTATACC";
const INSERT = "CAACCCCGGCCCCTGAGTCCGAGGAGAGGGTGCTTCAGAGTATGTATACCGGATCACAGTCTACACTGCTCACTC";

let ada: SigningKey;
let bob: SigningKey;
beforeAll(async () => { [ada, bob] = await Promise.all([generateSigningKey(), generateSigningKey()]); });

class Device {
  held: SignedEntry[] = [];
  constructor(readonly key: SigningKey) {}
  async write(op: Operation): Promise<void> {
    this.held.push(await nextEntry(await mergeLog(this.held), this.key, op));
  }
  lab(): Promise<LabState> { return mergeLog(this.held); }
}

/**
 * A lab with a plan that starts from two molecules it was simply given, and a second plan that rests
 * on a strain nobody has made.
 */
async function wren(): Promise<LabState> {
  const a = new Device(ada);
  a.held.push(await foundLab(ada, { name: "The Wren Lab", person: "Ada" }));
  await a.write(addToRoster(bob.publicKey, "Bob"));
  await a.write(addPart({ sequence: BACKBONE, name: "pWren1", circular: true }));
  await a.write(addPart({ sequence: INSERT, name: "an insert" }));
  const parts = (await a.lab()).parts;
  const backbone = parts.find((one) => one.name === "pWren1")!.checksum;
  const insert = parts.find((one) => one.name === "an insert")!.checksum;
  const tube = newItemId();
  await a.write(addItem({ item: tube, part: backbone, amount: 20, unit: "µL" }));

  await a.write(planRun({ plan: newPlanId(), kind: "assembly", instrument: null,
                          inputs: [{ item: tube, amount: 1, role: "backbone" }, { part: insert, amount: 1, role: "insert" }],
                          expects: [{ sequence: BACKBONE + INSERT, circular: true, name: "pWren1-insert" }],
                          settings: {}, note: null }));
  const strain = { prospect: newProspectId(), name: "GS115 pWren1-insert", kind: "strain",
                   madeOf: "GS115, with pWren1-insert in it", note: null };
  await a.write(addProspect(strain));
  await a.write(planRun({ plan: newPlanId(), kind: "induction", instrument: null,
                          inputs: [{ prospect: strain.prospect, amount: 0, role: "culture" }],
                          expects: [], settings: {}, note: null }));
  return a.lab();
}

const published = (state: LabState, sequences = true) =>
  publicMethod(state, { name: "The Wren Lab", origin: "", contact: null, note: null }, { sequences });

describe("a published method's needs", () => {
  it("come back in the shape whoHas takes, by checksum", async () => {
    const method = published(await wren());
    const needed = methodNeeds(method);
    expect(needed.length).toBeGreaterThan(0);
    for (const one of needed) {
      expect(one.checksum).toMatch(/seguid=/);
      expect(one.id).toBeGreaterThan(0);
      expect(typeof one.name).toBe("string");
    }
    // The molecules the method itself makes are not needs, so they are not here.
    expect(needed.map((one) => one.name)).not.toContain("pWren1-insert");
  });

  it("keeps whether a molecule is a ring, because a ring and a line are two molecules", async () => {
    const needed = methodNeeds(published(await wren()));
    const backbone = needed.find((one) => one.name === "pWren1")!;
    const insert = needed.find((one) => one.name === "an insert")!;
    expect(backbone.circular).toBe(true);
    expect(insert.circular).toBe(false);
    expect(backbone.checksum).toMatch(/^cdseguid=/);
    expect(insert.checksum).toMatch(/^ldseguid=/);
  });

  it("gives a length where the method wrote the sequence out, and none where it did not", async () => {
    const state = await wren();
    const withSequences = methodNeeds(published(state, true));
    expect(withSequences.every((one) => one.length === BACKBONE.length || one.length === INSERT.length)).toBe(true);
    // A lab may publish checksums without sequences. Those molecules can still be asked after, and
    // nothing then says how long they are, so the length is absent rather than a made-up zero.
    const without = methodNeeds(published(state, false));
    expect(without.length).toBe(withSequences.length);
    for (const one of without) {
      expect(one.checksum).toMatch(/seguid=/);
      expect("length" in one).toBe(false);
    }
  });

  it("leaves out what is alive, and cannotTravel gives it back", async () => {
    const method = published(await wren());
    // The method names a strain nobody made. It has no checksum, so it cannot be asked after, and
    // it must not vanish either.
    expect(method.needs.some((one) => one.part === null)).toBe(true);
    expect(methodNeeds(method).some((one) => one.checksum === null as unknown as string)).toBe(false);
    expect(methodNeeds(method).length).toBe(method.needs.length - 1);

    const alive = cannotTravel(method);
    expect(alive).toHaveLength(1);
    expect(alive[0]!.name).toContain("had not made");
    expect(alive[0]!.role).toBe("culture");
    // The lab's own name for it does not travel, so it cannot be here either.
    expect(JSON.stringify(alive)).not.toContain("GS115 pWren1-insert");
  });

  it("works on a method still carrying its signatures", async () => {
    const method = published(await wren());
    const signed = await signMethod(method, ada, { signer: "Ada" });
    expect(methodNeeds(signed)).toEqual(methodNeeds(method));
    expect(cannotTravel(signed)).toEqual(cannotTravel(method));
  });
});

describe("asking the network with a method", () => {
  it("finds the lab that has one of the molecules and not the other", async () => {
    const state = await wren();
    const method = published(state);
    // A second lab that happens to hold the backbone and lists it under its own name.
    const held = new Dseqrecord(BACKBONE, { circular: true });
    held.name = "they call it something else";
    const inventory = await signInventory(
      inventoryFrom([held], { name: "The Finch Lab", origin: "https://finch.example", contact: null, note: null }),
      bob, { signer: "Bob" });
    const found: FetchedInventory = { origin: "https://finch.example", signed: inventory, text: JSON.stringify(inventory) };

    const sourcing = whoHas(methodNeeds(method), [found]);
    const backbone = sourcing.find((one) => one.needed.name === "pWren1")!;
    const insert = sourcing.find((one) => one.needed.name === "an insert")!;
    // Matched on the checksum, although the two labs call it different things.
    expect(backbone.holders).toHaveLength(1);
    expect(backbone.holders[0]!.lab).toBe("The Finch Lab");
    expect(backbone.holders[0]!.part.name).toBe("they call it something else");
    expect(insert.holders).toHaveLength(0);
    expect(unsourced(sourcing).map((one) => one.name)).toEqual(["an insert"]);
    expect(heldButNotOffered(sourcing)).toEqual([]);
  });

  it("says nobody has anything when nobody is asked", async () => {
    const sourcing = whoHas(methodNeeds(published(await wren())), []);
    expect(sourcing.length).toBeGreaterThan(0);
    expect(unsourced(sourcing)).toHaveLength(sourcing.length);
  });
});
