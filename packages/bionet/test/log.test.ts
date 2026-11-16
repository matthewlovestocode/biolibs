/**
 * A lab worked out from its members' signed logs.
 *
 * The easy half is that changes add up. What is checked hardest is the half the design exists for:
 * two people working offline and then meeting, a count that disagrees with the adjustments, two
 * changes that overlap, an entry somebody else signed into your log, and a member who was removed
 * and keeps writing. Every one of those has to come out the same on every machine, whatever order
 * the entries arrive in, so most tests here also merge a shuffled copy and compare.
 */
import { generateSigningKey, signUnder, verifyUnder, type SigningKey } from "@biolibs/opencloning";
import { INVENTORY_DOMAIN, LOG_DOMAIN, addItem, addPart, addToRoster, adjustItem, entryId, foundLab,
         mergeLog, newItemId, nextEntry, offerPart, publicInventory, readEntry, recountItem,
         removeFromRoster, retireItem, setField, setRole, signInventory, verifyEntry, verifyInventory,
         writeEntry, type LabState, type Operation, type SignedEntry } from "@biolibs/bionet";
import { beforeAll, describe, expect, it } from "vitest";

const F1 = "GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGA";
const F2 = "CAACCCCGGCCCCTGAGTCCGAGGAGAGGGTGCTTCAGAGTATGTATACC";

let ada: SigningKey;
let bob: SigningKey;
let cyd: SigningKey;
beforeAll(async () => {
  [ada, bob, cyd] = await Promise.all([generateSigningKey(), generateSigningKey(), generateSigningKey()]);
});

/** What one device holds. Writing merges what it holds, appends, and keeps the new entry. */
class Device {
  held: SignedEntry[] = [];
  constructor(readonly key: SigningKey, from: readonly SignedEntry[] = []) { this.held = [...from]; }
  async write(op: Operation): Promise<SignedEntry> {
    const entry = await nextEntry(await mergeLog(this.held), this.key, op);
    this.held.push(entry);
    return entry;
  }
  /** Take everything another device holds, as a sync would. */
  hear(other: Device): void {
    for (const entry of other.held) if (!this.held.includes(entry)) this.held.push(entry);
  }
  lab(): Promise<LabState> { return mergeLog(this.held); }
}

/** Two devices that exchange everything. */
const sync = (a: Device, b: Device): void => { a.hear(b); b.hear(a); };

/** The parts of a lab that every machine must agree on. */
const settled = (lab: LabState): unknown => ({
  lab: lab.lab, roster: lab.roster, parts: lab.parts, items: lab.items,
  entries: lab.entries.map((one) => [one.id, one.status]), overlaps: lab.overlaps,
});

/** @returns The same entries in another order. */
const shuffled = <T>(list: readonly T[]): T[] => [...list].reverse().sort(() => Math.random() - 0.5);

/** A lab with Ada as founder, Bob added as a member, one part and one tube of ten. */
async function wren(bobRole: "member" | "keeper" = "member"): Promise<{ a: Device; b: Device; part: string; tube: string }> {
  const a = new Device(ada, [await foundLab(ada, { name: "The Wren Lab", person: "Ada" })]);
  await a.write(addToRoster(bob.publicKey, "Bob", bobRole));
  await a.write(addPart({ sequence: F1, name: "f1" }));
  const part = (await a.lab()).parts[0]!.checksum;
  const tube = newItemId();
  await a.write(addItem({ item: tube, part, amount: 10, unit: "µL" }));
  const b = new Device(bob, a.held);
  return { a, b, part, tube };
}

const amount = async (device: Device, item: string): Promise<number | undefined> =>
  (await device.lab()).items.find((one) => one.item === item)?.amount;

describe("founding a lab", () => {
  it("names the lab by its founding entry and makes the founder its first keeper", async () => {
    const founding = await foundLab(ada, { name: "The Wren Lab", person: "Ada" });
    const lab = await mergeLog([founding]);
    expect(lab.lab).toBe(await entryId(founding.entry));
    expect(lab.name).toBe("The Wren Lab");
    expect(lab.roster).toEqual([{ key: ada.publicKey, person: "Ada", role: "keeper", founder: true,
                                  added: lab.lab, removed: null }]);
  });

  it("will not guess between two labs, and builds the one it is told to", async () => {
    const one = await foundLab(ada, { name: "One", person: "Ada" });
    const two = await foundLab(bob, { name: "Two", person: "Bob" });
    await expect(mergeLog([one, two])).rejects.toThrow(/more than one lab/);
    const lab = await mergeLog([one, two], { lab: await entryId(two.entry) });
    expect(lab.name).toBe("Two");
    expect(lab.discarded.map((entry) => entry.reason)).toEqual(["It was written for another lab."]);
  });

  it("holds everything as waiting until the founding entry arrives", async () => {
    const { a } = await wren();
    const lab = await mergeLog(a.held.slice(1), { lab: (await a.lab()).lab! });
    expect(lab.roster).toEqual([]);
    expect(lab.waiting).toHaveLength(a.held.length - 1);
  });
});

describe("changes add up", () => {
  it("tracks a part, an item of it, and what was used", async () => {
    const { a, part, tube } = await wren();
    await a.write(adjustItem(tube, -1));
    await a.write(adjustItem(tube, -2));
    await expect(a.write(adjustItem(tube, -2.5))).rejects.toThrow(/only whole numbers/);
    const lab = await a.lab();
    expect(lab.parts).toMatchObject([{ checksum: part, name: "f1", length: 50, circular: false, offered: false }]);
    expect(lab.items).toMatchObject([{ item: tube, part, unit: "µL", amount: 7, retired: false, needsRecount: false }]);
    expect(lab.entries.every((one) => one.status === "applied")).toBe(true);
  });

  it("comes out the same whatever order the entries arrive in, and however many times", async () => {
    const { a, b, tube } = await wren();
    await a.write(adjustItem(tube, -1));
    await b.write(adjustItem(tube, -2));
    await b.write(addPart({ sequence: F2, name: "f2" }));
    sync(a, b);
    await a.write(recountItem(tube, 6));
    const straight = settled(await a.lab());
    for (let round = 0; round < 5; round++) {
      expect(settled(await mergeLog(shuffled([...a.held, ...a.held])))).toEqual(straight);
    }
  });
});

describe("working offline and then meeting", () => {
  it("counts what each person used while apart", async () => {
    const { a, b, tube } = await wren();
    await a.write(adjustItem(tube, -1));          // neither has heard from the other
    await b.write(adjustItem(tube, -2));
    expect(await amount(a, tube)).toBe(9);
    expect(await amount(b, tube)).toBe(8);
    sync(a, b);
    expect(await amount(a, tube)).toBe(7);
    expect(settled(await a.lab())).toEqual(settled(await b.lab()));
  });

  it("lets a recount replace only the adjustments its author had seen", async () => {
    const { a, b, tube } = await wren();
    await b.write(adjustItem(tube, -1));
    sync(a, b);
    await b.write(adjustItem(tube, -2));          // Bob, offline again
    await a.write(recountItem(tube, 5));          // Ada counts five, knowing of the first use only
    sync(a, b);
    expect(await amount(a, tube)).toBe(3);        // five, less the use Ada had not seen
  });

  it("flags an item the log has lost track of instead of hiding it", async () => {
    const { a, b, tube } = await wren();
    await a.write(adjustItem(tube, -7));
    await b.write(adjustItem(tube, -6));
    sync(a, b);
    expect((await a.lab()).items[0]).toMatchObject({ amount: -3, needsRecount: true });
    await a.write(recountItem(tube, 0));
    expect((await a.lab()).items[0]).toMatchObject({ amount: 0, needsRecount: false });
  });

  it("keeps one of two overlapping counts, the same one everywhere, and says so", async () => {
    const { a, b, tube } = await wren();
    const hers = await a.write(recountItem(tube, 4));
    const his = await b.write(recountItem(tube, 6));
    sync(a, b);
    const lab = await a.lab();
    const [herId, hisId] = [await entryId(hers.entry), await entryId(his.entry)];
    const kept = herId < hisId ? herId : hisId;
    expect(lab.items[0]).toMatchObject({ amount: kept === herId ? 4 : 6, needsRecount: true });
    expect(lab.overlaps).toEqual([{ what: `the count of item ${tube}`, kept, dropped: kept === herId ? hisId : herId }]);
    expect(settled(await b.lab())).toEqual(settled(lab));

    await b.write(recountItem(tube, 5));          // somebody who has seen both counts again
    expect((await b.lab()).items[0]).toMatchObject({ amount: 5, needsRecount: false });
  });

  it("makes one part of the same molecule added twice", async () => {
    const { a, b } = await wren();
    await a.write(addPart({ sequence: F2, name: "f2" }));
    await b.write(addPart({ sequence: F2, name: "fragment two" }));
    sync(a, b);
    expect((await a.lab()).parts.filter((part) => part.sequence === F2)).toHaveLength(1);
  });
});

describe("fields", () => {
  it("lets the later change win when its author had seen the earlier one", async () => {
    const { a, b, part } = await wren();
    await a.write(setField("part", part, "name", "fragment one"));
    sync(a, b);
    await b.write(setField("part", part, "name", "F1"));
    sync(a, b);
    const lab = await a.lab();
    expect(lab.parts[0]!.name).toBe("F1");
    expect(lab.overlaps).toEqual([]);
  });

  it("picks the lower entry ID when two edits overlap, and reports the other", async () => {
    const { a, b, tube } = await wren();
    const hers = await a.write(setField("item", tube, "shelf", "top"));
    const his = await b.write(setField("item", tube, "shelf", "door"));
    sync(a, b);
    const [herId, hisId] = [await entryId(hers.entry), await entryId(his.entry)];
    const lab = await a.lab();
    expect(lab.items[0]!.fields).toEqual({ shelf: herId < hisId ? "top" : "door" });
    expect(lab.overlaps).toEqual([{ what: `shelf of item ${tube.slice(0, 12)}`,
                                    kept: herId < hisId ? herId : hisId, dropped: herId < hisId ? hisId : herId }]);
  });

  it("refuses a field that is really something else, and a value that is not a value", async () => {
    const { a, tube } = await wren();
    await a.write(setField("item", tube, "amount", 99));
    await a.write(setField("item", tube, "Not A Field", "x"));
    await a.write({ type: "field.set", on: "item", id: tube, field: "note", value: { nested: true } });
    const lab = await a.lab();
    expect(lab.items[0]).toMatchObject({ amount: 10, fields: {} });
    expect(lab.entries.slice(-3).map((one) => one.status)).toEqual(["refused", "refused", "refused"]);
  });
});

describe("the roster", () => {
  it("refuses a key nobody added", async () => {
    const { a, tube } = await wren();
    const lab = await a.lab();
    const stranger = await writeEntry(cyd, { lab: lab.lab!, prev: null, seen: { [ada.publicKey]: lab.heads[ada.publicKey]!.id } },
                                      adjustItem(tube, -10));
    const after = await mergeLog([...a.held, stranger]);
    expect(after.items[0]!.amount).toBe(10);
    expect(after.entries.at(-1)).toMatchObject({ status: "refused", reason: "Its key is not on the lab's roster." });
  });

  it("refuses what a key wrote before it had seen itself added", async () => {
    const { a, tube } = await wren();
    const lab = await a.lab();
    const early = await writeEntry(cyd, { lab: lab.lab!, prev: null }, adjustItem(tube, -10));
    await a.write(addToRoster(cyd.publicKey, "Cyd"));
    const after = await mergeLog([...a.held, early]);
    expect(after.items[0]!.amount).toBe(10);
    // Which refusal it gets depends on where its ID places it relative to the entry that added the key.
    const early2 = after.entries.find((one) => one.signed === early)!;
    expect(early2.status).toBe("refused");
    expect(early2.reason).toMatch(/not on the lab's roster|before its key had seen itself added/);
  });

  it("lets a member change the inventory and not the roster", async () => {
    const { a, b, tube } = await wren();
    await b.write(adjustItem(tube, -1));
    await b.write(addToRoster(cyd.publicKey, "Cyd"));
    sync(a, b);
    const lab = await a.lab();
    expect(lab.items[0]!.amount).toBe(9);
    expect(lab.roster.map((one) => one.person)).toEqual(["Ada", "Bob"]);
    expect(lab.entries.at(-1)).toMatchObject({ status: "refused", reason: "Only a keeper may change the roster." });
  });

  it("lets a keeper make another, who can then add people", async () => {
    const { a, b } = await wren();
    await a.write(setRole(bob.publicKey, "keeper"));
    sync(a, b);
    await b.write(addToRoster(cyd.publicKey, "Cyd"));
    expect((await b.lab()).roster.map((one) => [one.person, one.role])).toEqual([["Ada", "keeper"], ["Bob", "keeper"], ["Cyd", "member"]]);
  });

  it("refuses roster changes that do not say enough, or say it twice", async () => {
    const { a } = await wren();
    await a.write({ type: "roster.add", key: "not a key", person: "Cyd", role: "member" });
    await a.write(addToRoster(bob.publicKey, "Bob again"));
    await a.write(removeFromRoster(cyd.publicKey, 0));
    await a.write({ type: "roster.remove", key: bob.publicKey, cutoff: "everything" });
    await a.write({ type: "roster.role", key: bob.publicKey, role: "owner" });
    await a.write({ type: "roster.rename", key: bob.publicKey, person: "Robert" });
    const lab = await a.lab();
    expect(lab.entries.slice(-6).map((one) => one.status)).toEqual(
      ["refused", "refused", "refused", "refused", "refused", "not understood"]);
    expect(lab.roster.map((one) => [one.person, one.role, one.removed])).toEqual([["Ada", "keeper", null], ["Bob", "member", null]]);
  });

  it("will not leave a lab without a keeper", async () => {
    const { a } = await wren();
    await a.write(setRole(ada.publicKey, "member"));
    await a.write(removeFromRoster(ada.publicKey, 99));
    const lab = await a.lab();
    expect(lab.roster[0]).toMatchObject({ role: "keeper", removed: null });
    expect(lab.entries.at(-2)?.reason).toBe("A lab cannot be left without a keeper.");
  });
});

describe("removing somebody", () => {
  it("keeps their log up to the cutoff and sets the rest aside, whenever it arrives", async () => {
    const { a, b, tube } = await wren();
    await b.write(adjustItem(tube, -1));                       // Bob's seq 0
    sync(a, b);
    await b.write(adjustItem(tube, -2));                       // seq 1, which Ada never sees in time
    await a.write(removeFromRoster(bob.publicKey, 0));         // Ada accepts Bob's log up to 0
    await b.write(adjustItem(tube, -3));                       // seq 2, still offline
    sync(a, b);
    await b.write(adjustItem(tube, -4));                       // seq 3, after Bob has heard
    sync(a, b);

    const lab = await a.lab();
    expect(lab.items[0]!.amount).toBe(9);
    expect(lab.roster[1]).toMatchObject({ person: "Bob", removed: { cutoff: 0 } });
    const his = lab.entries.filter((one) => one.signed.entry.author === bob.publicKey);
    expect(his.map((one) => one.status)).toEqual(["applied", "set aside", "set aside", "set aside"]);
    expect(settled(await mergeLog(shuffled(a.held)))).toEqual(settled(lab));
  });

  it("lets a remaining member re-apply what was set aside, under their own name", async () => {
    const { a, b, tube } = await wren();
    await b.write(adjustItem(tube, -2));
    await a.write(removeFromRoster(bob.publicKey, -1));
    sync(a, b);
    expect(await amount(a, tube)).toBe(10);
    const aside = (await a.lab()).entries.find((one) => one.status === "set aside")!;
    await a.write(aside.signed.entry.op);
    expect(await amount(a, tube)).toBe(8);
  });

  it("refuses a cutoff past what the remover had seen", async () => {
    const { a, b, tube } = await wren();
    await b.write(adjustItem(tube, -1));
    await a.write(removeFromRoster(bob.publicKey, 0));         // Ada has not seen Bob's seq 0
    sync(a, b);
    const lab = await a.lab();
    expect(lab.roster[1]!.removed).toBeNull();
    expect(lab.entries.find((one) => one.signed.entry.op.type === "roster.remove")?.reason)
      .toBe("Its cutoff is past what its author had seen of that key's log.");
  });

  it("hears the longer-standing keeper first when two remove each other", async () => {
    for (let round = 0; round < 4; round++) {                  // the entry IDs differ each time
      const { a, b } = await wren("keeper");
      await a.write(removeFromRoster(bob.publicKey, -1));
      await b.write(removeFromRoster(ada.publicKey, 3));
      sync(a, b);
      const lab = await a.lab();
      expect(lab.roster.map((one) => [one.person, one.removed === null])).toEqual([["Ada", true], ["Bob", false]]);
      expect(lab.entries.find((one) => one.signed.entry.author === bob.publicKey)?.status).toBe("set aside");
      expect(settled(await b.lab())).toEqual(settled(lab));
    }
  });

  it("takes the earlier cutoff when two keepers remove the same key", async () => {
    const { a, b, tube } = await wren("keeper");
    const c = new Device(cyd);
    await a.write(addToRoster(cyd.publicKey, "Cyd"));
    sync(a, b); c.hear(a);
    await c.write(adjustItem(tube, -1));
    await c.write(adjustItem(tube, -1));
    a.hear(c);
    b.held.push(c.held.at(-2)!);                               // Bob has only Cyd's first entry
    await a.write(removeFromRoster(cyd.publicKey, 1));
    await b.write(removeFromRoster(cyd.publicKey, 0));
    sync(a, b);
    const lab = await a.lab();
    expect(lab.roster[2]!.removed?.cutoff).toBe(0);
    expect(lab.items[0]!.amount).toBe(9);
  });
});

describe("entries that are not what they claim", () => {
  it("throws out an entry signed into somebody else's log", async () => {
    const { a, tube } = await wren();
    const lab = await a.lab();
    const real = await nextEntry(lab, ada, adjustItem(tube, -1));
    const forged = await writeEntry(bob, { lab: lab.lab!, prev: null }, adjustItem(tube, -9));
    forged.entry.author = ada.publicKey;
    expect((await verifyEntry(forged)).ok).toBe(false);

    const moved: SignedEntry = { entry: real.entry, signature: (await nextEntry(lab, bob, adjustItem(tube, -1))).signature };
    expect((await verifyEntry(moved)).ok).toBe(false);

    const after = await mergeLog([...a.held, forged, moved]);
    expect(after.items[0]!.amount).toBe(10);
    expect(after.discarded).toHaveLength(2);
  });

  it("throws out an entry a key signed, correctly, into a log that is not its own", async () => {
    const { a, tube } = await wren();
    const real = await nextEntry(await a.lab(), ada, adjustItem(tube, -9));
    // Bob's signature over an entry that says it is in Ada's log. The signature is good; the claim is not.
    const lifted: SignedEntry = { entry: real.entry, signature: await signUnder(LOG_DOMAIN, real.entry, bob) };
    expect(await verifyEntry(lifted)).toMatchObject({
      ok: false, problem: "This entry was signed by a key other than the one whose log it is in." });
    expect((await mergeLog([...a.held, lifted])).items[0]!.amount).toBe(10);
  });

  it("throws out what is not an entry at all, and says why", async () => {
    const { a } = await wren();
    const lab = await mergeLog([...a.held, "nonsense", { entry: { bionet_log_version: 2 }, signature: {} }]);
    expect(lab.discarded.map((one) => one.reason)).toEqual([
      "This is not a signed log entry.", "This entry is in a format this does not read (version 2)."]);
    expect(lab.entries).toHaveLength(a.held.length);
  });

  it("throws out an entry changed after it was signed", async () => {
    const { a, tube } = await wren();
    const used = await a.write(adjustItem(tube, -1));
    const changed: SignedEntry = { entry: { ...used.entry, op: adjustItem(tube, -9) }, signature: used.signature };
    const after = await mergeLog([...a.held.slice(0, -1), changed]);
    expect(after.items[0]!.amount).toBe(10);
    expect(after.discarded[0]!.reason).toBe("This document is not what that key signed.");
  });

  it("signs under a domain of its own, so an entry cannot pass for an inventory", async () => {
    const { a } = await wren();
    const one = a.held.at(-1)!;
    expect((await verifyUnder(LOG_DOMAIN, one.entry, [one.signature]))[0]!.ok).toBe(true);
    expect((await verifyUnder(INVENTORY_DOMAIN, one.entry, [one.signature]))[0]!.ok).toBe(false);
  });

  it("keeps the first of two entries a key wrote at the same place, and only one", async () => {
    const { a, tube } = await wren();
    const lab = await a.lab();
    const one = await nextEntry(lab, ada, adjustItem(tube, -1));
    const other = await nextEntry(lab, ada, adjustItem(tube, -5));
    const after = await mergeLog(shuffled([...a.held, one, other]));
    const kept = (await entryId(one.entry)) < (await entryId(other.entry)) ? -1 : -5;
    expect(after.items[0]!.amount).toBe(10 + kept);
    expect(after.discarded.map((entry) => entry.reason)).toEqual(["It is a second entry at the same place in its key's log."]);
  });

  it("waits for a missing entry instead of skipping it", async () => {
    const { a, tube } = await wren();
    const first = await a.write(adjustItem(tube, -1));
    await a.write(adjustItem(tube, -1));
    const without = a.held.filter((entry) => entry !== first);
    const gapped = await mergeLog(without);
    expect(gapped.items[0]!.amount).toBe(10);
    expect(gapped.waiting.map((entry) => entry.reason)).toEqual(["An earlier entry in the same log has not arrived."]);
    expect((await mergeLog([...without, first])).items[0]!.amount).toBe(8);
  });

  it("waits on an entry that had seen something not yet here", async () => {
    const { a, b, tube } = await wren();
    const hers = await a.write(adjustItem(tube, -1));
    sync(a, b);
    const his = await b.write(adjustItem(tube, -1));           // had seen hers
    const lab = await mergeLog([...a.held.filter((entry) => entry !== hers), his]);
    expect(lab.waiting.some((entry) => entry.signed === his)).toBe(true);
  });

  it("reads only what is shaped like an entry", () => {
    expect(() => readEntry(null)).toThrow("This is not a signed log entry.");
    expect(() => readEntry({ entry: {}, signature: {} })).toThrow(/format this does not read/);
    const base = { bionet_log_version: 1, lab: "0".repeat(64), author: "A".repeat(43), seq: 1, prev: "0".repeat(64),
                   seen: {}, op: { type: "item.adjust" } };
    const signature = { algorithm: "Ed25519", public_key: "x", signature: "y", signer: null, signed_at: "now" };
    expect(readEntry({ entry: base, signature })).toBeTruthy();
    expect(() => readEntry({ entry: { ...base, seq: -1 }, signature })).toThrow(/where in the log/);
    expect(() => readEntry({ entry: { ...base, seq: 0 }, signature })).toThrow(/first entry/);
    expect(() => readEntry({ entry: { ...base, lab: null }, signature })).toThrow(/founding entry/);
    expect(() => readEntry({ entry: { ...base, seen: { nobody: "x" } }, signature })).toThrow(/what it had seen/);
    expect(() => readEntry({ entry: { ...base, op: [] }, signature })).toThrow(/carries no change/);
    expect(() => readEntry({ entry: base, signature: { ...signature, signed_at: 5 } })).toThrow(/signature is not/);
    expect(() => readEntry({ entry: { ...base, prev: "not an id" }, signature })).toThrow(/pointer to the one before/);
    expect(() => readEntry({ entry: { ...base, lab: "wren" }, signature })).toThrow(/which lab it is for/);
    expect(() => readEntry({ entry: { ...base, author: "ada" }, signature })).toThrow(/whose log it is in/);
    expect(() => readEntry({ entry: { ...base, op: { type: "roster.found" } }, signature })).toThrow(/existing lab/);
    expect(() => readEntry({ entry: { ...base, seen: [] }, signature })).toThrow(/what it had seen/);
    expect(() => readEntry({ entry: { ...base, op: { type: "part.add", sequence: "A".repeat(700_000) } }, signature }))
      .toThrow(/longer than will be read/);
    const crowd = Object.fromEntries(Array.from({ length: 1_001 }, (_, at) => [`${String(at).padStart(4, "0")}${"B".repeat(39)}`, "0".repeat(64)]));
    expect(() => readEntry({ entry: { ...base, seen: crowd }, signature })).toThrow(/at most 1000 other logs/);
  });

  it("will not write after an entry from another log or another lab", async () => {
    const { a } = await wren();
    const lab = (await a.lab()).lab!;
    await expect(writeEntry(bob, { lab, prev: a.held.at(-1)! }, adjustItem("x", 1))).rejects.toThrow(/another key's log/);
    await expect(writeEntry(ada, { lab: "f".repeat(64), prev: a.held.at(-1)! }, adjustItem("x", 1))).rejects.toThrow(/another lab/);
    await expect(nextEntry(await mergeLog([]), ada, adjustItem("x", 1))).rejects.toThrow(/no lab here/);
  });
});

describe("staying readable by older and newer apps", () => {
  it("keeps a change it does not understand in the chain, and applies what follows", async () => {
    const { a, tube } = await wren();
    await a.write({ type: "item.move", item: tube, to: "freezer 2" });
    await a.write(adjustItem(tube, -1));
    const lab = await a.lab();
    expect(lab.entries.at(-2)).toMatchObject({ status: "not understood" });
    expect(lab.items[0]!.amount).toBe(9);
  });

  it("refuses changes that do not make sense and carries on", async () => {
    const { a, part, tube } = await wren();
    await a.write(addPart({ sequence: "", name: "nothing" }));
    await a.write(addPart({ sequence: "not a sequence!", name: "nonsense" }));
    await a.write(addItem({ item: "has spaces in it", part, amount: 1 }));
    await a.write(addItem({ item: tube, part, amount: 1 }));
    await a.write(addItem({ item: newItemId(), part: "ldseguid=nope", amount: 1 }));
    await a.write(adjustItem("no-such-item", -1));
    await a.write(adjustItem(tube, 0));
    await a.write(recountItem(tube, -4));
    await a.write(offerPart("ldseguid=nope", true));
    const lab = await a.lab();
    expect(lab.entries.slice(-9).map((one) => one.status)).toEqual(Array(9).fill("refused"));
    expect(lab.parts).toHaveLength(1);
    expect(lab.items).toHaveLength(1);
    expect(lab.items[0]!.amount).toBe(10);
  });
});

describe("writing the next entry", () => {
  it("names only the logs that have moved on since this key last wrote", async () => {
    const { a, b, tube } = await wren();
    const first = await b.write(adjustItem(tube, -1));
    expect(Object.keys(first.entry.seen)).toEqual([ada.publicKey]);     // Bob's first: all he has is Ada's
    const second = await b.write(adjustItem(tube, -1));
    expect(second.entry.seen).toEqual({});                             // nothing new from Ada
    expect(second.entry).toMatchObject({ seq: 1, prev: await entryId(first.entry) });
    await a.write(adjustItem(tube, -1));
    sync(a, b);
    const third = await b.write(adjustItem(tube, -1));
    expect(third.entry.seen).toEqual({ [ada.publicKey]: (await a.lab()).heads[ada.publicKey]!.id });
  });
});

describe("what the world is shown", () => {
  it("lists parts in stock, offers only what a member offered, and carries no private detail", async () => {
    const { a, part, tube } = await wren();
    await a.write(addPart({ sequence: F2, name: "f2" }));                 // a part with no item
    await a.write(setField("part", part, "note", "Ada's good prep"));
    await a.write(setField("part", part, "public_note", "ask for the glycerol stock"));
    const where = { name: "The Wren Lab", origin: "https://lab-wren.onrender.com", contact: null, note: null };

    const before = publicInventory(await a.lab(), where, { publishedAt: "2026-11-15T00:00:00.000Z" });
    expect(before.parts).toEqual([{ id: "1", name: "f1", checksum: part, length: 50, circular: false,
                                    available: false, note: "ask for the glycerol stock" }]);
    expect(JSON.stringify(before)).not.toMatch(/Ada|µL|good prep/);

    await a.write(offerPart(part, true));
    const offered = publicInventory(await a.lab(), where);
    expect(offered.parts[0]!.available).toBe(true);

    const signed = await signInventory(offered, ada, { signer: "Ada" });
    expect((await verifyInventory(signed)).every((check) => check.ok)).toBe(true);

    await a.write(retireItem(tube));
    expect(publicInventory(await a.lab(), where).parts).toEqual([]);
  });

  it("stops listing a part when the last of it is used", async () => {
    const { a, tube } = await wren();
    const where = { name: "The Wren Lab", origin: "https://lab-wren.onrender.com", contact: null, note: null };
    await a.write(adjustItem(tube, -10));
    expect(publicInventory(await a.lab(), where).parts).toEqual([]);
  });
});
