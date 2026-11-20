/**
 * A conditional crossing from one lab to another.
 *
 * Everything else about a method has been tested on the document. This tests the trip: one lab
 * publishes, a lab holding nothing takes it, and what the first lab meant has to survive — the
 * looking-for, which step answers which reading, and which way round.
 */
import { generateSigningKey } from "@biolibs/opencloning";
import { Lab, memoryKeys, memoryStore } from "@biolibs/bionet-client";
import { beforeAll, describe, expect, it } from "vitest";

const BACKBONE = "GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGAGAGGGTGCTTCAGAGTATGTATACC";

let keys: Awaited<ReturnType<typeof generateSigningKey>>;
beforeAll(async () => { keys = await generateSigningKey(); });

const fresh = async (name: string): Promise<Lab> => {
  const lab = await new Lab({ store: memoryStore(), keys: memoryKeys() }).open();
  await lab.setPerson(name);
  return lab;
};

describe("a conditional sent to another lab", () => {
  it("arrives as the same contingency, pointing at the same reading", async () => {
    const wren = await fresh("Ada");
    await wren.found({ name: "The Wren Lab", furnish: false });
    await wren.addPart({ name: "pWren1", sequence: BACKBONE });
    const part = wren.snapshot().lab!.parts[0]!.checksum;
    const tube = await wren.addItem({ part, amount: 20, unit: "µL" });

    const { plan: growing } = await wren.planRun({
      kind: "induction", inputs: [{ item: tube, amount: 1, role: "culture" }], note: "Grow it and look.",
    });
    const reading = await wren.expect({
      plan: growing, kind: "protein gel", numbers: [24_320, 15_800],
      says: "Intact at 24,320 Da. A smaller pair is the cell having cut it.",
    });
    const { plan: answer } = await wren.planRun({
      kind: "transformation", inputs: [{ part, amount: 1, role: "plasmid" }],
      note: "Into a host with the protease taken out.",
    });
    await wren.leadsTo({ expect: reading, met: false, plan: answer, why: "the answer to a cut protein" });
    // And a reading taken here, which must not cross.
    await wren.meet({ expect: reading, met: true, saw: [24_320], note: "one band, ours was fine" });

    const published = await wren.publishMethod();

    const finch = await fresh("Bob");
    await finch.found({ name: "The Finch Lab", furnish: false });
    const taken = await finch.takeMethod({ method: published });
    expect(taken.missing).toHaveLength(0);
    expect(taken.proposed).toHaveLength(2);

    const theirs = finch.snapshot().lab!;
    // The looking-for crossed.
    expect(theirs.expectations).toHaveLength(1);
    expect(theirs.expectations[0]!.says).toContain("Intact at 24,320 Da");
    expect(theirs.expectations[0]!.numbers).toEqual([24_320, 15_800]);
    // The having-looked did not. Their gel is theirs to run.
    expect(theirs.expectations[0]!.met).toBeNull();
    expect(JSON.stringify(theirs)).not.toContain("ours was fine");
    // Nor did the IDs: every one of these is the Finch Lab's own.
    expect(theirs.expectations[0]!.expect).not.toBe(reading);
    expect(theirs.plans.map((one) => one.plan)).not.toContain(answer);

    // And the contingency is a contingency here too, pointing at their copy of the reading.
    const contingent = theirs.plans.find((one) => one.follows != null)!;
    expect(contingent.kind).toBe("transformation");
    expect(contingent.follows).toMatchObject({ expect: theirs.expectations[0]!.expect, met: false, standing: "waiting" });
    expect(contingent.follows!.why).toBe("the answer to a cut protein");

    // It answers their own reading, not the Wren Lab's: when they look and see it cut, it is live.
    await finch.meet({ expect: theirs.expectations[0]!.expect, met: false, saw: [15_800] });
    expect(finch.snapshot().lab!.plans.find((one) => one.follows != null)!.follows!.standing).toBe("live");
    // While at the Wren Lab, whose gel was clean, the same contingency is moot.
    expect(wren.snapshot().lab!.plans.find((one) => one.follows != null)!.follows!.standing).toBe("moot");

    wren.close();
    finch.close();
  });
});
