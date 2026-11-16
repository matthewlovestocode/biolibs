/**
 * A device's key kept somewhere else, and a lab that knows where things are.
 *
 * The backup is checked for what it is for: a new device standing in for a lost one picks up the
 * same key's log where it stopped. The places are checked through to a layout, since being drawn is
 * what they are for.
 */
import { exportSigningKey, generateSigningKey } from "@biolibs/opencloning";
import { Lab, memoryKeys, memoryStore, openKey, perform, readBackup, sealKey, type KeyKeeper } from "@biolibs/bionet-client";
import { createPeer, loopback, memoryPeerStore } from "@biolibs/bionet-peer";
import { arrange, layoutFrom, UNNAMED_ROOM } from "@biolibs/bionet-space";
import { describe, expect, it } from "vitest";

const F1 = "GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGA";
const PEER = "wss://lab-wren.onrender.com/sync";
const PASSPHRASE = "four unrelated words here";
const nothingPublished = (async () => new Response("", { status: 404 })) as typeof fetch;

const until = async (test: () => boolean, ms = 4_000): Promise<boolean> => {
  for (const started = Date.now(); Date.now() - started < ms;) {
    if (test()) return true;
    await new Promise((done) => setTimeout(done, 5));
  }
  return false;
};

describe("a sealed key", () => {
  it("opens with its passphrase and with nothing else", async () => {
    const exported = await exportSigningKey(await generateSigningKey());
    const backup = await sealKey(exported, PASSPHRASE, { iterations: 1_000 });
    expect(JSON.stringify(backup)).not.toContain(exported.slice(0, 40));
    expect(await openKey(backup, PASSPHRASE)).toBe(exported);
    expect(await openKey(JSON.stringify(backup), PASSPHRASE)).toBe(exported);
    await expect(openKey(backup, "four unrelated words her")).rejects.toThrow(/does not open/);
    await expect(openKey({ ...backup, sealed: backup.sealed.replace(/^./, (first) => (first === "A" ? "B" : "A")) }, PASSPHRASE)).rejects.toThrow(/does not open/);
  });

  it("refuses a passphrase too short to be worth it, and a document that is not a backup", async () => {
    const exported = await exportSigningKey(await generateSigningKey());
    await expect(sealKey(exported, "short")).rejects.toThrow(/at least 12/);
    for (const not of ["not json", "{}", null, 3, { bionet_key_backup: 2 }]) expect(() => readBackup(not)).toThrow(/not a key backup/);
    const backup = await sealKey(exported, PASSPHRASE, { iterations: 1_000 });
    expect(() => readBackup({ ...backup, kdf: { ...backup.kdf, iterations: 1e9 } })).toThrow(/not a key backup/);
  });

  it("says which key it holds, and is not believed about that", async () => {
    const [one, other] = await Promise.all([generateSigningKey(), generateSigningKey()].map(async (key) => exportSigningKey(await key)));
    const backup = await sealKey(one!, PASSPHRASE, { iterations: 1_000 });
    const lying = { ...backup, fingerprint: (await sealKey(other!, PASSPHRASE, { iterations: 1_000 })).fingerprint };
    await expect(openKey(lying, PASSPHRASE)).rejects.toThrow(/does not hold the key/);
  });
});

describe("a new device standing in for a lost one", () => {
  it("takes up the key from a backup, joins, and carries on the same log", async () => {
    const hold: { WebSocket?: typeof WebSocket } = {};
    const device = (keys: KeyKeeper = memoryKeys()): Promise<Lab> =>
      new Lab({ store: memoryStore(), keys, fetch: nothingPublished,
                WebSocket: function (url: string) { return new hold.WebSocket!(url); } as unknown as typeof WebSocket }).open();

    const ada = await device();
    await ada.setPerson("Ada");
    await ada.found({ name: "The Wren Lab" });
    await ada.addPart({ name: "f1", sequence: F1 });
    const peer = createPeer({ lab: ada.labId!, origin: "https://lab-wren.onrender.com", store: memoryPeerStore() });
    hold.WebSocket = loopback(peer).WebSocket as unknown as typeof WebSocket;
    await ada.setPeer(PEER);
    expect(await until(() => ada.snapshot().peer.status === "synced")).toBe(true);
    const invite = ada.invite!;
    const backup = await ada.backUp(PASSPHRASE);
    const before = ada.snapshot();
    ada.close();                                              // the laptop is gone

    const fresh = await device();
    expect(fresh.snapshot().device.key).not.toBe(before.device.key);
    await fresh.setPerson("Ada");
    await expect(fresh.restore({ backup, passphrase: "the wrong words entirely" })).rejects.toThrow(/does not open/);
    await fresh.restore({ backup, passphrase: PASSPHRASE });
    expect(fresh.snapshot().device).toMatchObject({ key: before.device.key, fingerprint: before.device.fingerprint });

    await fresh.join(invite);
    expect(await until(() => fresh.snapshot().lab?.keeper === true)).toBe(true);
    expect(fresh.snapshot().lab!.parts.map((part) => part.name)).toEqual(["f1"]);
    await fresh.addPart({ name: "f2", sequence: F1.slice(5) });
    const entries = fresh.snapshot().lab!.entries;
    expect(entries.map((one) => one.seq)).toEqual([0, 1, 2]);   // one log, carried on
    expect(entries.every((one) => one.status === "applied")).toBe(true);

    await expect(fresh.restore({ backup, passphrase: PASSPHRASE })).rejects.toThrow(/already in a lab/);
    fresh.close();
  }, 20_000);

  it("is reached through the door a window uses, and hands the window only the sealed key", async () => {
    const keys = memoryKeys();
    const lab = await new Lab({ store: memoryStore(), keys }).open();
    const answer = await perform(lab, "backUp", PASSPHRASE);
    expect(answer.ok).toBe(true);
    const text = (answer as { result: string }).result;
    expect(text).not.toContain((await keys.load())!.slice(0, 40));
    expect(readBackup(text).fingerprint).toBe(lab.snapshot().device.fingerprint);
    expect(await perform(lab, "backUp", "short")).toMatchObject({ ok: false, error: expect.stringMatching(/at least 12/) });
  });
});

describe("a lab that knows where things are", () => {
  it("adds places, puts a tube in a box, and can be drawn", async () => {
    const lab = await new Lab({ store: memoryStore(), keys: memoryKeys() }).open();
    await lab.setPerson("Ada");
    await lab.found({ name: "The Wren Lab" });
    await lab.addPart({ name: "f1", sequence: F1 });
    const part = lab.snapshot().lab!.parts[0]!.checksum;
    const tube = await lab.addItem({ part, amount: 10, unit: "µL" });
    const loose = await lab.addItem({ part, amount: 5, unit: "µL" });

    const freezer = await lab.addPlace({ kind: "Freezer", name: " −80 " });
    const box = await lab.addPlace({ kind: "box", name: "Box 1", parent: freezer, grid: { rows: 9, columns: 9 } });
    await lab.putItem({ item: tube, place: box, slot: { row: 1, column: 2 } });
    await lab.standPlace({ place: freezer, standing: { position: [1.2345, 0, 0.4], size: [0.8, 2, 0.8], turn: 90 } });

    const seen = lab.snapshot().lab!;
    expect(seen.places.map((one) => [one.kind, one.name])).toEqual([["freezer", "−80"], ["box", "Box 1"]]);
    expect(seen.places[0]!.standing).toEqual({ at: [1235, 0, 400], size: [800, 2000, 800], turn: 90 });
    expect(seen.items.find((one) => one.item === tube)!.where).toEqual({ place: box, slot: { row: 1, column: 2 } });
    expect(seen.crowded).toEqual([]);
    await expect(lab.putItem({ item: tube, place: box, slot: { row: 9, column: 0 } })).rejects.toThrow(/position/);

    const layout = layoutFrom(seen, { room: "The Wren Lab" });
    expect(layout.places.map((one) => [one.id, one.parent])).toEqual([[UNNAMED_ROOM, null], [freezer, UNNAMED_ROOM], [box, freezer]]);
    expect(layout.places[1]!.standing).toEqual({ position: [1.235, 0, 0.4], size: [0.8, 2, 0.8], turn: 90 });
    expect(layout.stored).toEqual([{ item: tube, place: box, slot: { row: 1, column: 2 }, part, name: "f1", amount: 10, unit: "µL", needsRecount: false }]);
    expect(layout.stored.some((one) => one.item === loose)).toBe(false);
    expect(arrange(layout).map((one) => one.place.id)).toEqual([UNNAMED_ROOM, freezer, box]);

    const bench = await lab.addPlace({ kind: "bench", name: "Bench" });
    const pcr = await lab.addPlace({ kind: "instrument", name: "Thermocycler", parent: bench, model: "thermocycler" });
    expect(lab.snapshot().lab!.places.find((one) => one.place === pcr)!.fields).toEqual({ model: "thermocycler" });
    expect(layoutFrom(lab.snapshot().lab!).places.find((one) => one.id === pcr)!.model).toBe("thermocycler");
    await lab.retirePlace({ place: bench });

    await lab.movePlace({ place: box, parent: null });
    await lab.retirePlace({ place: freezer });
    await lab.setField({ on: "place", id: box, field: "name", value: "Box A" });
    const after = layoutFrom(lab.snapshot().lab!);
    expect(after.places.map((one) => one.name)).toEqual(["Lab", "Box A"]);
    expect(after.stored).toHaveLength(1);
    await lab.retirePlace({ place: box });
    expect(layoutFrom(lab.snapshot().lab!)).toEqual({ places: [], stored: [] });
  });
});
