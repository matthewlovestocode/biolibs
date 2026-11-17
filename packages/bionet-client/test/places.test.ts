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

describe("a lab that records what was done", () => {
  it("takes what a run used, keeps the tube it made, and says where the tube came from", async () => {
    const lab = await new Lab({ store: memoryStore(), keys: memoryKeys() }).open();
    await lab.setPerson("Ada");
    await lab.found({ name: "The Wren Lab" });
    await lab.addPart({ name: "template", sequence: F1 });
    const template = await lab.addItem({ part: lab.snapshot().lab!.parts[0]!.checksum, amount: 20, unit: "µL" });
    const cycler = await lab.addPlace({ kind: "instrument", name: "Thermocycler", model: "thermocycler" });

    const done = await lab.recordRun({
      kind: "pcr", instrument: cycler, inputs: [{ item: template, amount: 1, role: "template" }],
      outputs: [{ sequence: ` ${F1.slice(0, 40)} `, name: " amplicon ", amount: 50, unit: "µL" }], settings: { anneal_at_least: 18 }, note: "  ",
    });
    const seen = lab.snapshot().lab!;
    expect(seen.items.find((one) => one.item === template)!.amount).toBe(19);
    expect(seen.items.find((one) => one.item === done.items[0])).toMatchObject({ amount: 50, from: done.run });
    expect(seen.parts.map((part) => part.name)).toEqual(["template", "amplicon"]);
    expect(seen.runs).toMatchObject([{ run: done.run, kind: "pcr", instrument: cycler, outcome: "worked", note: null }]);

    const failed = await lab.recordRun({ kind: "pcr", inputs: [{ item: template, amount: 1, role: "template" }], note: "no band" });
    expect(failed.items).toEqual([]);
    expect(lab.snapshot().lab!.runs[1]).toMatchObject({ outcome: "failed", instrument: null, note: "no band" });
    expect(lab.snapshot().lab!.items.find((one) => one.item === template)!.amount).toBe(18);

    await expect(lab.recordRun({ kind: "pcr", inputs: [{ item: "no-such-item", amount: 1, role: "template" }] })).rejects.toThrow(/not an item the lab has/);

    // A piece cut out of something keeps the ends the enzymes left, and what was marked on it.
    const cut = await lab.recordRun({
      kind: "digest", inputs: [{ item: template, amount: 1, role: "cut" }],
      outputs: [{ sequence: F1.slice(0, 30), name: "piece", amount: 20, unit: "µL", ends: { left: 4, right: -2 },
                  features: [{ type: "CDS", label: "gene", strand: 1, parts: [{ start: 5, end: 20 }] }] }],
    });
    const piece = lab.snapshot().lab!.parts.find((part) => part.name === "piece")!;
    expect(piece).toMatchObject({ ends: { left: 4, right: -2 }, features: [{ label: "gene" }] });
    expect(lab.snapshot().lab!.items.find((one) => one.item === cut.items[0])!.part).toBe(piece.checksum);
    await lab.addPart({ name: "sticky", sequence: F1.slice(0, 30), ends: { left: 2, right: 0 }, features: [{ type: "misc_feature", label: "mark", strand: 0, parts: [{ start: 0, end: 4 }] }] });
    expect(lab.snapshot().lab!.parts.find((part) => part.name === "sticky")).toMatchObject({ ends: { left: 2, right: 0 }, features: [{ label: "mark" }] });
    expect(await perform(lab, "recordRun", { kind: "pcr", inputs: [] })).toMatchObject({ ok: true });
  });
});

describe("a copy of the whole lab", () => {
  it("brings the lab back on a new device with the restored key and no peer at all", async () => {
    const lab = await new Lab({ store: memoryStore(), keys: memoryKeys() }).open();
    await lab.setPerson("Ada");
    await lab.found({ name: "The Wren Lab" });
    await lab.addPart({ name: "f1", sequence: F1 });
    const tube = await lab.addItem({ part: lab.snapshot().lab!.parts[0]!.checksum, amount: 10, unit: "µL" });
    const box = await lab.addPlace({ kind: "box", name: "Box 1", grid: { rows: 9, columns: 9 } });
    await lab.putItem({ item: tube, place: box, slot: { row: 0, column: 0 } });
    const key = await lab.backUp(PASSPHRASE);
    const copy = await lab.exportLab();
    const before = lab.snapshot().lab!;
    expect(JSON.parse(copy)).toMatchObject({ bionet_lab_copy: 1, lab: before.id, name: "The Wren Lab" });
    lab.close();                                             // the laptop is gone, and there never was a peer

    const fresh = await new Lab({ store: memoryStore(), keys: memoryKeys() }).open();
    await fresh.setPerson("Ada");
    await fresh.restore({ backup: key, passphrase: PASSPHRASE });
    expect(await fresh.importLab(copy)).toBe(before.entries.length);
    const after = fresh.snapshot().lab!;
    expect(after).toMatchObject({ id: before.id, name: "The Wren Lab", member: true, keeper: true });
    expect(after.items).toEqual(before.items);
    expect(after.places).toEqual(before.places);
    await fresh.adjust({ item: tube, by: -1 });              // and it carries on the same log
    expect(fresh.snapshot().lab!.entries.map((one) => one.seq)).toEqual([...before.entries.map((one) => one.seq), before.entries.length]);
    expect(await fresh.importLab(copy)).toBe(0);             // bringing the same copy in again adds nothing
    fresh.close();
  }, 20_000);

  it("lets a device without the key read the lab but not change it, and refuses what is not a copy", async () => {
    const lab = await new Lab({ store: memoryStore(), keys: memoryKeys() }).open();
    await expect(lab.exportLab()).rejects.toThrow(/not in a lab/);
    await lab.setPerson("Ada");
    await lab.found({ name: "The Wren Lab" });
    await lab.addPart({ name: "f1", sequence: F1 });
    const copy = await lab.exportLab();

    const stranger = await new Lab({ store: memoryStore(), keys: memoryKeys() }).open();
    await stranger.setPerson("Bob");
    for (const not of ["not json", "{}", JSON.stringify({ bionet_lab_copy: 2, lab: "a".repeat(64), entries: [] }), JSON.stringify({ bionet_lab_copy: 1, lab: "short", entries: [] })]) {
      await expect(stranger.importLab(not)).rejects.toThrow(/not a copy of a lab/);
    }
    // A copy that says it is of a lab its entries do not found is not believed.
    await expect(stranger.importLab(JSON.stringify({ ...JSON.parse(copy), lab: "b".repeat(64) }))).rejects.toThrow(/Nothing in that copy belongs/);
    expect(stranger.snapshot().lab).toBeNull();

    await stranger.importLab(copy);
    expect(stranger.snapshot().lab).toMatchObject({ name: "The Wren Lab", member: false });
    expect(stranger.snapshot().lab!.parts.map((part) => part.name)).toEqual(["f1"]);
    await expect(stranger.addPart({ name: "f2", sequence: F1.slice(4) })).rejects.toThrow(/not on the lab's roster/);

    const other = await new Lab({ store: memoryStore(), keys: memoryKeys() }).open();
    await other.setPerson("Cyd");
    await other.found({ name: "Another lab" });
    await expect(other.importLab(copy)).rejects.toThrow(/different lab/);
    expect((await perform(lab, "exportLab")).ok).toBe(true);
    for (const one of [lab, stranger, other]) one.close();
  });
});

describe("a lab that keeps what was proposed", () => {
  it("keeps a plan without changing what it holds, and settles it as the run that carried it out", async () => {
    const lab = await new Lab({ store: memoryStore(), keys: memoryKeys() }).open();
    await lab.setPerson("Ada");
    await lab.found({ name: "The Wren Lab" });
    await lab.addPart({ name: "template", sequence: F1 });
    const part = lab.snapshot().lab!.parts[0]!.checksum;
    const template = await lab.addItem({ part, amount: 20, unit: "µL" });

    const { plan } = await lab.planRun({ kind: "pcr", inputs: [{ item: template, amount: 1, role: "template" }],
                                         expects: [{ sequence: `${F1.slice(0, 20)}\n${F1.slice(20)}`, name: " copy " }], note: "  to see it is there  " });
    let seen = lab.snapshot().lab!;
    expect(seen.adviser).toBe(false);
    expect(seen.plans).toHaveLength(1);
    expect(seen.plans[0]).toMatchObject({ plan, note: "to see it is there", settled: null, wanting: [] });
    // Tidied on the way in, and known by the same checksum as the part it would be a copy of.
    expect(seen.plans[0]!.expects[0]).toMatchObject({ name: "copy", checksum: part });
    expect(seen.items[0]!.amount).toBe(20);
    expect(seen.runs).toHaveLength(0);

    const done = await lab.recordRun({ kind: "pcr", plan, inputs: [{ item: template, amount: 1, role: "template" }],
                                       outputs: [{ sequence: F1, name: "copy", amount: 50, unit: "µL" }] });
    seen = lab.snapshot().lab!;
    expect(seen.plans[0]!.settled).toMatchObject({ run: done.run });
    expect(seen.items.find((one) => one.item === template)!.amount).toBe(19);
    // The run itself says nothing of the plan: the link is an entry of its own.
    expect(seen.entries.map((one) => one.op.type).slice(-2)).toEqual(["run.record", "plan.settle"]);
    expect(Object.keys(seen.entries.at(-2)!.op)).not.toContain("plan");
  });

  it("sets a plan aside, refuses one the lab could not keep, and takes both through the door a window uses", async () => {
    const lab = await new Lab({ store: memoryStore(), keys: memoryKeys() }).open();
    await lab.setPerson("Ada");
    await lab.found({ name: "The Wren Lab" });
    await lab.addPart({ name: "template", sequence: F1 });
    const part = lab.snapshot().lab!.parts[0]!.checksum;
    await expect(lab.planRun({ kind: "pcr", inputs: [{ item: "no-such-item", amount: 1, role: "template" }] })).rejects.toThrow(/not an item the lab has/);
    const answer = await perform(lab, "planRun", { kind: "pcr", inputs: [{ part, amount: 1, role: "template" }] });
    expect(answer).toMatchObject({ ok: true });
    const plan = lab.snapshot().lab!.plans[0]!.plan;
    expect(await perform(lab, "settlePlan", { plan })).toMatchObject({ ok: true });
    expect(lab.snapshot().lab!.plans[0]!.settled).toMatchObject({ run: null });
    await expect(lab.settlePlan({ plan })).rejects.toThrow(/already settled/);
  });
});

describe("a device that hosts an adviser", () => {
  const hosting = async (): Promise<{ lab: Lab; tube: string; part: string }> => {
    const lab = await new Lab({ store: memoryStore(), keys: memoryKeys(), adviserKeys: memoryKeys() }).open();
    await lab.setPerson("Ada");
    await lab.found({ name: "The Wren Lab" });
    await lab.addPart({ name: "template", sequence: F1 });
    const part = lab.snapshot().lab!.parts[0]!.checksum;
    return { lab, part, tube: await lab.addItem({ part, amount: 20, unit: "µL" }) };
  };

  it("hosts none until asked, then keeps one key for it, which is in no lab until a keeper lets it in", async () => {
    const { lab, tube } = await hosting();
    expect(lab.snapshot().hosting).toBeNull();
    await expect(lab.advise.planRun({ kind: "pcr", inputs: [] })).rejects.toThrow("This device hosts no adviser.");
    const made = await lab.hostAdviser();
    expect(await lab.hostAdviser()).toEqual(made);
    expect(lab.snapshot().hosting).toEqual({ ...made, standing: null });
    expect(made.key).not.toBe(lab.snapshot().device.key);
    await expect(lab.advise.planRun({ kind: "pcr", inputs: [{ item: tube, amount: 1, role: "template" }] })).rejects.toThrow(/A keeper has to let it in first/);
    expect(lab.snapshot().lab!.plans).toHaveLength(0);
  });

  it("writes what the adviser proposes in the adviser's own log, under the adviser's own key", async () => {
    const { lab, tube } = await hosting();
    const { key } = await lab.hostAdviser();
    await lab.addMember({ key, person: "Claude", role: "adviser" });
    expect(lab.snapshot().hosting!.standing).toBe("adviser");

    const { plan } = await lab.advise.planRun({ kind: "pcr", inputs: [{ item: tube, amount: 1, role: "template" }], expects: [{ sequence: F1, name: "copy" }], note: "worth checking" });
    await lab.advise.addPart({ name: "a primer it designed", sequence: F1.slice(0, 20) });
    const seen = lab.snapshot().lab!;
    expect(seen.plans[0]).toMatchObject({ plan, by: key, settled: null });
    expect(seen.parts.map((one) => one.name)).toContain("a primer it designed");
    const theirs = seen.entries.filter((one) => one.author === key);
    expect(theirs.map((one) => [one.seq, one.op.type, one.signer, one.status])).toEqual([[0, "plan.add", "Claude", "applied"], [1, "part.add", "Claude", "applied"]]);
    // The person's own log is untouched by it, and nothing the lab holds moved.
    expect(seen.entries.filter((one) => one.author === lab.snapshot().device.key).every((one) => one.signer === "Ada")).toBe(true);
    expect(seen.items[0]!.amount).toBe(20);

    await lab.advise.settlePlan({ plan });
    expect(lab.snapshot().lab!.plans[0]!.settled).toMatchObject({ run: null, by: key });
  });

  it("cannot be used to do what an adviser may not, by any road", async () => {
    const { lab, tube } = await hosting();
    const { key } = await lab.hostAdviser();
    await lab.addMember({ key, person: "Claude", role: "adviser" });
    // The three things it is given are all there is to reach for.
    expect(Object.keys(lab.advise).sort()).toEqual(["addPart", "planRun", "settlePlan"]);
    // And the lab itself refuses the rest, even signed as the adviser on purpose.
    const { adjustItem } = await import("@biolibs/bionet");
    await expect(lab.write(adjustItem(tube, -5), true)).rejects.toThrow(/an adviser, which may add and describe parts and propose runs, and nothing else/);
    expect(lab.snapshot().lab!.items[0]!.amount).toBe(20);
    // A window cannot ask to sign as the adviser at all: the door takes one thing, and it is not that.
    expect(await perform(lab, "write", {})).toMatchObject({ ok: false });
  });

  it("stops writing with the hosted key if a keeper makes it anything more than an adviser", async () => {
    const { lab, tube } = await hosting();
    const { key } = await lab.hostAdviser();
    await lab.addMember({ key, person: "Claude", role: "member" });
    await expect(lab.advise.planRun({ kind: "pcr", inputs: [{ item: tube, amount: 1, role: "template" }] })).rejects.toThrow(/in the lab as a member, not as an adviser/);
    expect(lab.snapshot().lab!.entries.some((one) => one.author === key)).toBe(false);
  });

  it("cannot host one with nowhere to keep its key", async () => {
    const lab = await new Lab({ store: memoryStore(), keys: memoryKeys() }).open();
    await expect(lab.hostAdviser()).rejects.toThrow("This device has nowhere to keep an adviser's key.");
  });
});
