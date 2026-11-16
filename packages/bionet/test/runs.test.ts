/**
 * Something done at the bench, recorded.
 *
 * A run is one entry that does three things at once: takes what was used from each tube that went
 * in, adds each tube that came out, and keeps the run so a tube can say where it came from. What is
 * checked hardest is that it does all three or none, and that two people using the same tube at
 * once still add up.
 */
import { generateSigningKey, type SigningKey } from "@biolibs/opencloning";
import { addItem, addPart, addPlace, addToRoster, adjustItem, foundLab, mergeLog, newItemId, newPlaceId, newRunId, nextEntry,
         recordRun, type LabState, type Operation, type RunRecord, type SignedEntry } from "@biolibs/bionet";
import { beforeAll, describe, expect, it } from "vitest";

const TEMPLATE = "GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGAGAGGGTGCTTCAGAGTATGTATACC";
const FORWARD = "GGATCACAGTCTACACTG";
const REVERSE = "GGTATACATACTCTGAAG";
const PRODUCT = TEMPLATE;

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

/** A lab with a template and two primers in tubes, and a thermocycler. */
async function wren(): Promise<{ a: Device; b: Device; tubes: [string, string, string]; cycler: string; run: (more?: Partial<RunRecord>) => RunRecord }> {
  const a = new Device(ada, [await foundLab(ada, { name: "The Wren Lab", person: "Ada" })]);
  await a.write(addToRoster(bob.publicKey, "Bob"));
  const tubes: [string, string, string] = [newItemId(), newItemId(), newItemId()];
  for (const [at, [name, sequence]] of [["template", TEMPLATE], ["fwd", FORWARD], ["rev", REVERSE]].entries()) {
    await a.write(addPart({ sequence: sequence!, name: name! }));
    const part = (await a.lab()).parts[at]!.checksum;
    await a.write(addItem({ item: tubes[at]!, part, amount: 20, unit: "µL" }));
  }
  const cycler = newPlaceId();
  await a.write(addPlace({ place: cycler, kind: "instrument", name: "Thermocycler" }));
  const run = (more: Partial<RunRecord> = {}): RunRecord => ({
    run: newRunId(), kind: "pcr", instrument: cycler,
    inputs: [{ item: tubes[0], amount: 1, role: "template" }, { item: tubes[1], amount: 2, role: "forward primer" }, { item: tubes[2], amount: 2, role: "reverse primer" }],
    outputs: [{ item: newItemId(), sequence: PRODUCT, circular: false, name: "amplicon", amount: 50, unit: "µL" }],
    settings: { anneal_at_least: 18 }, outcome: "worked", note: null, ...more,
  });
  return { a, b: new Device(bob, a.held), tubes, cycler, run };
}

const lastOf = async (device: Device): Promise<{ status: string; reason: string | null }> => {
  const lab = await device.lab();
  const entry = lab.entries.find((one) => one.signed === device.held.at(-1))!;
  return { status: entry.status, reason: entry.reason };
};

describe("a run that worked", () => {
  it("takes what was used, adds what was made, and remembers itself", async () => {
    const { a, tubes, cycler, run } = await wren();
    const one = run();
    await a.write(recordRun(one));
    const lab = await a.lab();
    expect(lab.items.slice(0, 3).map((item) => item.amount)).toEqual([19, 18, 18]);
    const made = lab.items.find((item) => item.item === one.outputs[0]!.item)!;
    expect(made).toMatchObject({ amount: 50, unit: "µL", from: one.run, where: null, retired: false });
    expect(lab.items.slice(0, 3).every((item) => item.from === null)).toBe(true);
    // The product has the template's sequence here, so it is the same part and no new one is added.
    expect(lab.parts).toHaveLength(3);
    expect(made.part).toBe(lab.parts[0]!.checksum);
    expect(lab.runs).toEqual([{
      run: one.run, kind: "pcr", instrument: cycler, inputs: one.inputs, outputs: [{ item: made.item, part: made.part }],
      settings: { anneal_at_least: 18 }, outcome: "worked", note: null, added: lab.entries.at(-1)!.id,
    }]);
    expect((await mergeLog([...a.held].reverse())).runs).toEqual(lab.runs);
  });

  it("adds a part the lab did not have, under the name the run gave it", async () => {
    const { a, run } = await wren();
    const base = run();
    const one = { ...base, outputs: [{ ...base.outputs[0]!, sequence: TEMPLATE.slice(5, 60), name: "short amplicon" }] };
    await a.write(recordRun(one));
    const lab = await a.lab();
    expect(lab.parts.map((part) => part.name)).toEqual(["template", "fwd", "rev", "short amplicon"]);
    expect(lab.parts[3]).toMatchObject({ length: 55, circular: false, offered: false });
    expect(lab.runs[0]!.outputs[0]!.part).toBe(lab.parts[3]!.checksum);
  });

  it("adds up with somebody else using the same tube at the same time", async () => {
    const { a, b, tubes, run } = await wren();
    await a.write(recordRun(run()));
    await b.write(adjustItem(tubes[0], -3));
    await b.write(recordRun(run()));
    a.hear(b); b.hear(a);
    const lab = await a.lab();
    expect(lab.items[0]!.amount).toBe(20 - 1 - 3 - 1);
    expect(lab.runs).toHaveLength(2);
    expect((await b.lab()).items.map((item) => item.amount)).toEqual(lab.items.map((item) => item.amount));
    // A tube that runs took more from than it held is flagged, like any other.
    for (let at = 0; at < 9; at++) await a.write(recordRun(run({ inputs: [{ item: tubes[1], amount: 2, role: "forward primer" }], outputs: [], outcome: "failed" })));
    expect((await a.lab()).items[1]).toMatchObject({ amount: -2, needsRecount: true });
  });
});

describe("a run that did not work", () => {
  it("still takes what was used, and makes nothing", async () => {
    const { a, run } = await wren();
    await a.write(recordRun(run({ outputs: [], outcome: "failed", note: "no band" })));
    const lab = await a.lab();
    expect(lab.items.map((item) => item.amount)).toEqual([19, 18, 18]);
    expect(lab.runs[0]).toMatchObject({ outcome: "failed", outputs: [], note: "no band" });
  });
});

describe("a run the lab will not record", () => {
  it("is refused whole: nothing is used and nothing is made", async () => {
    const { a, tubes, run } = await wren();
    const good = run();
    const out = good.outputs[0]!;
    const refused: [Partial<RunRecord> | Record<string, unknown>, RegExp][] = [
      [{ run: "not an id!" }, /run ID/],
      [{ kind: "" }, /run ID/],
      [{ instrument: "nowhere" }, /place it was done at/],
      [{ outcome: "maybe" as "worked" }, /whether it worked/],
      [{ note: 3 as unknown as string }, /note/],
      [{ settings: { "Bad Name": 1 } }, /settings/],
      [{ settings: { cycles: 1.5 } as unknown as Record<string, number> }, /./],
      [{ inputs: [{ item: "no-such-item", amount: 1, role: "template" }] }, /not an item the lab has/],
      [{ inputs: [{ item: tubes[0], amount: -1, role: "template" }] }, /whole units/],
      [{ inputs: "everything" as unknown as [] }, /what went in/],
      [{ outputs: [{ ...out, item: tubes[0] }] }, /already exists/],
      [{ outputs: [out, out] }, /already exists/],
      [{ outputs: [{ ...out, sequence: "" }] }, /item ID, a sequence/],
      [{ outputs: [{ ...out, amount: -1 }] }, /item ID, a sequence/],
      [{ outcome: "failed" }, /made nothing/],
    ];
    for (const [change, why] of refused) {
      let wrote = true;
      try { await a.write(recordRun({ ...run(), outputs: [out], ...change } as RunRecord)); } catch { wrote = false; }   // a fraction cannot even be signed
      if (!wrote) continue;
      const { status, reason } = await lastOf(a);
      expect([change, status, reason]).toEqual([change, "refused", expect.stringMatching(why)]);
      a.held.pop();
    }
    const lab = await a.lab();
    expect(lab.items.map((item) => item.amount)).toEqual([20, 20, 20]);
    expect(lab.runs).toEqual([]);

    await a.write(recordRun(good));
    await a.write(recordRun({ ...run(), run: good.run }));
    expect(await lastOf(a)).toMatchObject({ status: "refused", reason: expect.stringMatching(/already exists/) });
  });
});
