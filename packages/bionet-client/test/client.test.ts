/**
 * Two devices and a web peer, behaving as a lab.
 *
 * Nothing here touches a network. The peer is the real one from `@biolibs/bionet-peer`, reached
 * through its in-process loopback, so the whole exchange is exercised: a device signing the peer's
 * challenge, entries going both ways, a network that goes away and comes back.
 *
 * What is checked hardest is what the design exists for — that a device goes on working with no peer
 * and converges when it has one, that a change the lab would refuse is never written, and that
 * somebody removed stops being sent the lab.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeFromRoster, verifyInventory } from "@biolibs/bionet";
import { Lab, memoryKeys, memoryStore, originOf, readInvite, type KeyKeeper, type LabStore } from "@biolibs/bionet-client";
import { sqliteStore } from "@biolibs/bionet-client/sqlite";
import { createPeer, loopback, memoryPeerStore, type Loopback, type PeerStore } from "@biolibs/bionet-peer";
import { describe, expect, it } from "vitest";

const F1 = "GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGA";
const ORIGIN = "https://lab-wren.onrender.com";
const PEER = "wss://lab-wren.onrender.com/sync";
const nothingPublished = (async () => new Response("", { status: 404 })) as typeof fetch;

const until = async (test: () => boolean, ms = 4_000): Promise<boolean> => {
  for (const started = Date.now(); Date.now() - started < ms;) {
    if (test()) return true;
    await new Promise((done) => setTimeout(done, 5));
  }
  return false;
};

/** A lab Ada has founded offline, and the peer that will serve it. */
async function setUp(): Promise<{ ada: Lab; network: Loopback; peerStore: PeerStore; device: (store?: LabStore, keys?: KeyKeeper) => Promise<Lab> }> {
  const hold: { network?: Loopback } = {};
  const device = (store: LabStore = memoryStore(), keys: KeyKeeper = memoryKeys()): Promise<Lab> =>
    new Lab({ store, keys, fetch: nothingPublished,
              // The network does not exist until the lab has an ID to make a peer for.
              WebSocket: function (url: string) { return new hold.network!.WebSocket(url); } as unknown as typeof WebSocket }).open();
  const ada = await device();
  await ada.setPerson("Ada");
  await ada.found({ name: "The Wren Lab" });
  const peerStore = memoryPeerStore();
  hold.network = loopback(createPeer({ lab: ada.labId, origin: ORIGIN, store: peerStore }));
  return { ada, network: hold.network, peerStore, device };
}

const amount = (lab: Lab, item: string): number | undefined => lab.snapshot().lab?.items.find((one) => one.item === item)?.amount;
const status = (lab: Lab): string => lab.snapshot().peer.status;

describe("a device on its own", () => {
  it("makes a key, asks for a name, and founds a lab with no peer anywhere", async () => {
    const lab = await new Lab({ store: memoryStore(), keys: memoryKeys() }).open();
    expect(lab.snapshot()).toMatchObject({ device: { person: null }, lab: null, peer: { status: "offline", url: null } });
    await expect(lab.found({ name: "Too soon" })).rejects.toThrow("Say who you are first.");
    await expect(lab.setPerson("  ")).rejects.toThrow(/A name/);
    await lab.setPerson("Ada");
    await expect(lab.found({ name: " " })).rejects.toThrow("A lab needs a name.");
    await lab.found({ name: "The Wren Lab" });
    expect(lab.snapshot().lab).toMatchObject({ name: "The Wren Lab", member: true, keeper: true, arrived: true });
    await expect(lab.found({ name: "Another" })).rejects.toThrow("already in a lab");
    expect(lab.snapshot().device.fingerprint).toMatch(/^[0-9a-f]{4}(-[0-9a-f]{4}){3}$/);
  });

  it("does everything a freezer needs, with nothing to sync to", async () => {
    const { ada } = await setUp();
    await ada.addPart({ name: "f1", sequence: `${F1.slice(0, 25)}\n ${F1.slice(25)}` });
    const part = ada.snapshot().lab!.parts[0]!.checksum;
    const tube = await ada.addItem({ part, amount: 10, unit: "µL" });
    await ada.adjust({ item: tube, by: -3 });
    await ada.recount({ item: tube, amount: 6 });
    await ada.offer({ part, available: true });
    await ada.setField({ on: "item", id: tube, field: "shelf", value: "top" });
    expect(ada.snapshot().lab).toMatchObject({
      parts: [{ name: "f1", length: 50, offered: true }], items: [{ amount: 6, unit: "µL", fields: { shelf: "top" } }] });
    await ada.retire({ item: tube });
    expect(ada.snapshot().lab!.items[0]!.retired).toBe(true);
    expect(ada.snapshot().lab!.entries.map((one) => one.signer)).toEqual(Array(8).fill("Ada"));
  });

  it("never writes a change the lab would refuse, and says why", async () => {
    const { ada } = await setUp();
    const before = ada.snapshot().lab!.entries.length;
    await expect(ada.addPart({ name: "nonsense", sequence: "not dna" })).rejects.toThrow(/letters for bases/);
    await expect(ada.adjust({ item: "no-such-tube", by: -1 })).rejects.toThrow("The item it changes is not one the lab has.");
    await expect(ada.addItem({ part: "ldseguid=nope", amount: 1 })).rejects.toThrow(/not one the lab has/);
    await ada.addPart({ name: "f1", sequence: F1 });
    const tube = await ada.addItem({ part: ada.snapshot().lab!.parts[0]!.checksum, amount: 1 });
    await expect(ada.adjust({ item: tube, by: 0.5 })).rejects.toThrow(/whole numbers/);
    expect(ada.snapshot().lab!.entries).toHaveLength(before + 2);
  });

  it("hands back the same snapshot until something changes, and tells whoever is listening", async () => {
    const { ada } = await setUp();
    let told = 0;
    const stop = ada.subscribe(() => { told++; });
    const first = ada.snapshot();
    expect(ada.snapshot()).toBe(first);
    await ada.addPart({ name: "f1", sequence: F1 });
    expect(told).toBeGreaterThan(0);
    expect(ada.snapshot()).not.toBe(first);
    stop();
    const heard = told;
    await ada.setPerson("Ada L.");
    expect(told).toBe(heard);
  });
});

describe("a device and the lab's peer", () => {
  it("sends a peer that holds nothing the whole lab, then is let in", async () => {
    const { ada, peerStore } = await setUp();
    await ada.addPart({ name: "f1", sequence: F1 });
    await ada.setPeer(PEER);
    expect(await until(() => status(ada) === "synced")).toBe(true);
    expect(peerStore.held).toHaveLength(2);
    expect(ada.snapshot().peer).toMatchObject({ pending: 0, origin: ORIGIN, invite: `${PEER}#${ada.labId}`, problem: null });
    expect(ada.snapshot().peer.lastSynced).not.toBeNull();
  });

  it("keeps somebody waiting until a keeper adds them, then fills their device", async () => {
    const { ada, device } = await setUp();
    await ada.setPeer(PEER);
    const bob = await device();
    await bob.setPerson("Bob");
    await bob.join(ada.invite!);
    expect(await until(() => status(bob) === "waiting")).toBe(true);
    expect(bob.snapshot().lab).toMatchObject({ arrived: false, member: false });
    await expect(bob.addPart({ name: "f1", sequence: F1 })).rejects.toThrow(/not on the lab's roster/);

    await ada.addMember({ key: bob.snapshot().device.key, person: "Bob" });
    expect(await until(() => bob.snapshot().lab?.member === true, 8_000)).toBe(true);
    expect(bob.snapshot().lab!.roster.map((one) => [one.person, one.you])).toEqual([["Ada", false], ["Bob", true]]);
    await expect(bob.addMember({ key: ada.snapshot().device.key, person: "Imposter" })).rejects.toThrow("Only a keeper may change the roster.");
    ada.close(); bob.close();
  }, 15_000);

  it("carries a change to a member who is connected, and converges two who worked apart", async () => {
    const { ada, device, network } = await setUp();
    await ada.setPeer(PEER);
    const bob = await device();
    await bob.setPerson("Bob");
    await ada.addMember({ key: bob.snapshot().device.key, person: "Bob" });
    await until(() => status(ada) === "synced");
    await bob.join(ada.invite!);
    await until(() => bob.snapshot().lab?.member === true);

    await ada.addPart({ name: "f1", sequence: F1 });
    const tube = await ada.addItem({ part: ada.snapshot().lab!.parts[0]!.checksum, amount: 10 });
    expect(await until(() => amount(bob, tube) === 10)).toBe(true);        // live, without Bob asking

    network.down();
    await until(() => status(ada) === "offline" && status(bob) === "offline");
    await ada.adjust({ item: tube, by: -1 });
    await bob.adjust({ item: tube, by: -2 });
    expect([amount(ada, tube), amount(bob, tube)]).toEqual([9, 8]);        // each took its own change
    expect([ada.snapshot().peer.pending, bob.snapshot().peer.pending]).toEqual([1, 1]);

    network.up();
    expect(await until(() => amount(ada, tube) === 7 && amount(bob, tube) === 7, 8_000)).toBe(true);
    expect(await until(() => status(ada) === "synced" && status(bob) === "synced" && ada.snapshot().peer.pending === 0)).toBe(true);
    ada.close(); bob.close();
  }, 20_000);

  it("stops sending the lab to somebody who has been removed", async () => {
    const { ada, device } = await setUp();
    await ada.setPeer(PEER);
    const bob = await device();
    await bob.setPerson("Bob");
    await ada.addMember({ key: bob.snapshot().device.key, person: "Bob" });
    await bob.join(ada.invite!);
    await until(() => status(bob) === "synced");

    await ada.write(removeFromRoster(bob.snapshot().device.key, -1));
    expect(await until(() => status(bob) === "waiting")).toBe(true);
    expect(bob.snapshot().peer.problem).toBe("This key has been removed from the lab's roster.");
    const had = bob.snapshot().lab!.entries.length;
    await ada.addPart({ name: "f1", sequence: F1 });
    await until(() => status(ada) === "synced");
    await new Promise((done) => setTimeout(done, 50));
    expect(bob.snapshot().lab!.parts).toEqual([]);
    expect(bob.snapshot().lab!.entries.length).toBe(had);
    ada.close(); bob.close();
  }, 15_000);

  it("publishes what the lab shows the world, signed by the device that asked", async () => {
    const { ada, peerStore } = await setUp();
    expect(await ada.publish()).toMatchObject({ ok: false, reason: "The lab has no peer to publish through." });
    await ada.addPart({ name: "f1", sequence: F1 });
    const part = ada.snapshot().lab!.parts[0]!.checksum;
    await ada.addItem({ part, amount: 10, unit: "µL" });
    await ada.offer({ part, available: true });
    await ada.setPeer(PEER);
    await until(() => status(ada) === "synced");

    expect(await ada.publish()).toEqual({ ok: true, reason: null, parts: 1 });
    const served = peerStore.inventory()!;
    expect((await verifyInventory(served)).every((check) => check.ok)).toBe(true);
    expect(served.signatures[0]!.public_key).toBe(ada.snapshot().device.key);
    expect(served.inventory).toMatchObject({ lab: { name: "The Wren Lab", origin: ORIGIN }, parts: [{ name: "f1", available: true }] });
    expect(JSON.stringify(served.inventory)).not.toMatch(/µL|"amount"/);
    expect(ada.snapshot().published).toBe(served.inventory.published_at);

    await ada.setOrigin("https://somewhere-else.example");
    expect(await ada.publish()).toMatchObject({ ok: false, reason: "That inventory names a different address from this one." });
    ada.close();
  });

  it("works with a peer set to nothing, and refuses an address that is not a socket's", async () => {
    const { ada } = await setUp();
    await expect(ada.setPeer("https://lab-wren.onrender.com")).rejects.toThrow("A peer's address starts with wss://.");
    await ada.setPeer(PEER);
    await until(() => status(ada) === "synced");
    await ada.setPeer("");
    expect(ada.snapshot().peer).toMatchObject({ url: null, status: "offline", invite: null });
  });
});

describe("invitations and addresses", () => {
  it("reads an invitation and refuses what is not one", () => {
    const lab = "a".repeat(64);
    expect(readInvite(` ${PEER}#${lab} `)).toEqual({ peer: PEER, lab });
    expect(() => readInvite("come and join")).toThrow(/not an invitation/);
    expect(() => readInvite(`${PEER}#short`)).toThrow(/not an invitation/);
    expect(() => readInvite(`https://lab.example/sync#${lab}`)).toThrow("An invitation's address starts with wss://.");
  });

  it("works out where a peer publishes from", () => {
    expect(originOf(PEER)).toBe(ORIGIN);
    expect(originOf("ws://127.0.0.1:4010/sync")).toBe("http://127.0.0.1:4010");
  });
});

describe("keeping it on disk", () => {
  it("brings everything back from a SQLite file after the app is closed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bionet-client-"));
    const keys = memoryKeys();
    const first = await new Lab({ store: sqliteStore(dir), keys }).open();
    await first.setPerson("Ada");
    await first.found({ name: "The Wren Lab" });
    await first.addPart({ name: "f1", sequence: F1 });
    const tube = await first.addItem({ part: first.snapshot().lab!.parts[0]!.checksum, amount: 4, unit: "tubes" });
    const key = first.snapshot().device.key;
    first.close();

    const again = await new Lab({ store: sqliteStore(dir), keys }).open();
    expect(again.snapshot()).toMatchObject({ device: { key, person: "Ada" }, lab: { name: "The Wren Lab", keeper: true } });
    expect(amount(again, tube)).toBe(4);
    await again.adjust({ item: tube, by: -1 });
    expect(amount(again, tube)).toBe(3);
    again.close();
  });

  it("keeps settings and forgets them, and ignores an entry it already has", () => {
    const store = sqliteStore(mkdtempSync(join(tmpdir(), "bionet-client-")));
    expect(store.setting("peer")).toBeNull();
    store.set("peer", "wss://a"); store.set("peer", "wss://b");
    expect(store.setting("peer")).toBe("wss://b");
    store.set("peer", null);
    expect(store.setting("peer")).toBeNull();
    const signed = { entry: { author: "a", seq: 0 }, signature: {} } as never;
    store.add([{ id: "one", signed }, { id: "one", signed }]);
    expect(store.entries()).toHaveLength(1);
    store.close();

    const memory = memoryStore();
    memory.add([{ id: "one", signed }, { id: "one", signed }]);
    memory.set("x", "1"); memory.set("x", null);
    expect([memory.entries().length, memory.setting("x")]).toEqual([1, null]);
  });
});

describe("the way a window reaches a lab", () => {
  it("does only what is on the list, and answers a refusal instead of throwing", async () => {
    const { ACTIONS, perform, sourceOf } = await import("@biolibs/bionet-client");
    const { ada } = await setUp();
    const source = sourceOf(ada);
    expect(source.snapshot()).toBe(ada.snapshot());
    expect(await source.act("addPart", { name: "f1", sequence: F1 })).toEqual({ ok: true, result: undefined });
    expect(await source.act("addPart", { name: "bad", sequence: "not dna" })).toMatchObject({ ok: false, error: expect.stringMatching(/letters for bases/) });
    for (const sneaky of ["close", "write", "take", "constructor", "store", "nonsense"]) {
      expect(await perform(ada, sneaky, {})).toEqual({ ok: false, error: "That is not something this app does." });
    }
    expect(ACTIONS).toContain("publish");
    let told = 0;
    const stop = source.subscribe(() => { told++; });
    await source.act("setPerson", "Ada L.");
    stop();
    expect(told).toBe(1);
    expect(ada.snapshot().device.person).toBe("Ada L.");
  });
});
