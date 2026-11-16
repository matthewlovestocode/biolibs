/**
 * Two machines exchanging a lab's entries, and a peer deciding who may read them.
 *
 * The exchange itself is small. What is checked hardest is what the peer will not do: hand the lab's
 * private log to a key that is not on the roster, keep entries from a stranger, or publish an
 * inventory that no member signed or that names somebody else's address.
 */
import { generateSigningKey, type SigningKey } from "@biolibs/opencloning";
import { addItem, addPart, addToRoster, adjustItem, entriesBeyond, entryId, foundLab, haveOf, inventoryProblem,
         isMember, mergeLog, newItemId, nextEntry, publicInventory, readMessage, removeFromRoster, signHello,
         signInventory, takeEntries, verifyHello, writeEntry, type Operation, type SignedEntry } from "@biolibs/bionet";
import { beforeAll, describe, expect, it } from "vitest";

const F1 = "GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGA";
const WREN = { name: "The Wren Lab", origin: "https://lab-wren.onrender.com", contact: null, note: null };

let ada: SigningKey;
let bob: SigningKey;
let eve: SigningKey;
beforeAll(async () => {
  [ada, bob, eve] = await Promise.all([generateSigningKey(), generateSigningKey(), generateSigningKey()]);
});

const write = async (held: SignedEntry[], key: SigningKey, op: Operation): Promise<SignedEntry> => {
  const entry = await nextEntry(await mergeLog(held), key, op);
  held.push(entry);
  return entry;
};

/** Ada's lab with Bob in it and one tube of ten. */
async function wren(): Promise<{ lab: string; held: SignedEntry[]; tube: string }> {
  const held = [await foundLab(ada, { name: "The Wren Lab", person: "Ada" })];
  await write(held, ada, addToRoster(bob.publicKey, "Bob"));
  await write(held, ada, addPart({ sequence: F1, name: "f1" }));
  const tube = newItemId();
  await write(held, ada, addItem({ item: tube, part: (await mergeLog(held)).parts[0]!.checksum, amount: 10 }));
  return { lab: (await mergeLog(held)).lab!, held, tube };
}

describe("saying what is held, and sending what is lacked", () => {
  it("counts each log up to its first gap", async () => {
    const { held } = await wren();
    expect(haveOf(held)).toEqual({ [ada.publicKey]: 3 });
    expect(haveOf(held.filter((one) => one.entry.seq !== 2))).toEqual({ [ada.publicKey]: 1 });
    expect(haveOf(held.slice(1))).toEqual({});
    expect(haveOf([])).toEqual({});
  });

  it("sends exactly what the other side lacks, each log in order", async () => {
    const { held, tube } = await wren();
    const bobs = [...held];
    await write(bobs, bob, adjustItem(tube, -1));
    await write(bobs, bob, adjustItem(tube, -1));
    const everything = [...bobs].reverse();
    expect(entriesBeyond(everything, {})).toHaveLength(6);
    expect(entriesBeyond(everything, haveOf(held)).map((one) => [one.entry.author, one.entry.seq]))
      .toEqual([[bob.publicKey, 0], [bob.publicKey, 1]]);
    expect(entriesBeyond(everything, haveOf(bobs))).toEqual([]);
    const sorted = entriesBeyond(everything, {});
    for (const author of [ada.publicKey, bob.publicKey]) {
      const seqs = sorted.filter((one) => one.entry.author === author).map((one) => one.entry.seq);
      expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    }
  });

  it("brings two machines that worked apart to the same lab", async () => {
    const { lab, held, tube } = await wren();
    const hers = [...held];
    const his = [...held];
    await write(hers, ada, adjustItem(tube, -1));
    await write(his, bob, adjustItem(tube, -2));
    hers.push(...(await takeEntries(lab, hers, entriesBeyond(his, haveOf(hers)))).kept);
    his.push(...(await takeEntries(lab, his, entriesBeyond(hers, haveOf(his)))).kept);
    expect((await mergeLog(hers)).items[0]!.amount).toBe(7);
    expect((await mergeLog(his)).items[0]!.amount).toBe(7);
    expect(haveOf(hers)).toEqual(haveOf(his));
  });
});

describe("who may read", () => {
  it("accepts a hello signed for this lab and this number, and nothing else", async () => {
    const { lab } = await wren();
    const answer = await signHello(bob, lab, "nonce-1");
    expect(await verifyHello(lab, "nonce-1", answer)).toBe(bob.publicKey);
    expect(await verifyHello(lab, "nonce-2", answer)).toBeNull();          // replayed against a new number
    expect(await verifyHello("f".repeat(64), "nonce-1", answer)).toBeNull(); // replayed against another lab
  });

  it("counts a key as a member only while it is on the roster", async () => {
    const { held } = await wren();
    const before = await mergeLog(held);
    expect([ada, bob, eve].map((key) => isMember(before, key.publicKey))).toEqual([true, true, false]);
    await write(held, ada, removeFromRoster(bob.publicKey, -1));
    expect(isMember(await mergeLog(held), bob.publicKey)).toBe(false);
  });
});

describe("what a peer keeps", () => {
  it("keeps a member's entries, once, and drops a stranger's", async () => {
    const { lab, held, tube } = await wren();
    const his = [...held];
    const used = await write(his, bob, adjustItem(tube, -1));
    const stranger = await writeEntry(eve, { lab, prev: null }, adjustItem(tube, -9));

    const first = await takeEntries(lab, held, [used, stranger, "not an entry", ...held]);
    expect(first.kept).toEqual([used]);
    expect(first.state.items[0]!.amount).toBe(9);

    const again = await takeEntries(lab, [...held, used], [used, { ...used }]);
    expect(again.kept).toEqual([]);
    expect(again.state.items[0]!.amount).toBe(9);
  });

  it("drops an entry that is waiting on one that did not come with it", async () => {
    const { lab, held, tube } = await wren();
    const his = [...held];
    await write(his, bob, adjustItem(tube, -1));
    const second = await write(his, bob, adjustItem(tube, -1));
    expect((await takeEntries(lab, held, [second])).kept).toEqual([]);
    expect((await takeEntries(lab, held, his.slice(-2).reverse())).kept).toHaveLength(2);
  });

  it("keeps nothing for a lab it does not serve", async () => {
    const { held } = await wren();
    const other = await foundLab(eve, { name: "Elsewhere", person: "Eve" });
    expect((await takeEntries(await entryId(other.entry), [], held)).kept).toEqual([]);
  });
});

describe("what a peer publishes", () => {
  it("publishes a member's inventory for its own address, and only a newer one", async () => {
    const { held } = await wren();
    const state = await mergeLog(held);
    const first = await signInventory(publicInventory(state, WREN, { publishedAt: "2026-11-15T10:00:00.000Z" }), bob);
    expect(await inventoryProblem(state, first, WREN.origin)).toBeNull();
    expect(await inventoryProblem(state, first, WREN.origin, first)).toMatch(/not newer/);
    const later = await signInventory(publicInventory(state, WREN, { publishedAt: "2026-11-15T11:00:00.000Z" }), ada);
    expect(await inventoryProblem(state, later, WREN.origin, first)).toBeNull();
  });

  it("will not publish what no member signed, or what names another address", async () => {
    const { held } = await wren();
    const state = await mergeLog(held);
    const inventory = publicInventory(state, WREN);
    expect(await inventoryProblem(state, await signInventory(inventory, eve), WREN.origin)).toMatch(/No key on this lab's roster/);
    expect(await inventoryProblem(state, { inventory, signatures: [] }, WREN.origin)).toMatch(/No key on this lab's roster/);
    expect(await inventoryProblem(state, await signInventory(inventory, ada), "https://lab-thistle.onrender.com")).toMatch(/different address/);
    expect(await inventoryProblem(state, "nonsense", WREN.origin)).toBe("That is not a signed inventory.");

    const tampered = await signInventory(inventory, ada);
    tampered.inventory.parts = [];
    expect(await inventoryProblem(state, tampered, WREN.origin)).toMatch(/No key on this lab's roster/);
  });
});

describe("reading a message", () => {
  it("reads each kind, and refuses what is not one", async () => {
    const { lab, held } = await wren();
    const signature = await signHello(bob, lab, "n");
    const good = [
      { type: "challenge", lab, nonce: "n" }, { type: "hello", signature, have: haveOf(held) },
      { type: "welcome", have: {} }, { type: "entries", entries: held }, { type: "kept", count: 2 },
      { type: "inventory", signed: { inventory: {}, signatures: [] } }, { type: "published", published_at: "now" },
      { type: "refused", code: "not-a-member", reason: "no" },
    ];
    for (const message of good) expect(readMessage(JSON.stringify(message))).toEqual(message);

    const bad = [
      "null", "[]", "{}", '{"type":"dance"}', '{"type":"challenge","lab":5,"nonce":"n"}',
      '{"type":"hello","signature":null,"have":{}}', '{"type":"hello","signature":{},"have":{"k":-1}}',
      '{"type":"welcome","have":[]}', '{"type":"entries","entries":[1]}', '{"type":"kept","count":"two"}',
      '{"type":"inventory","signed":null}', '{"type":"published"}', '{"type":"refused","code":"x"}',
    ];
    for (const text of bad) expect(() => readMessage(text)).toThrow(/not a message/);
    expect(() => readMessage("{not json")).toThrow("That message is not JSON.");
    expect(() => readMessage(" ".repeat(8_000_001))).toThrow(/longer than will be read/);
    expect(() => readMessage(JSON.stringify({ type: "entries", entries: Array(2_001).fill(held[0]) }))).toThrow(/not a message/);
  });
});
