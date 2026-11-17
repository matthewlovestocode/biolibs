/**
 * The work as a sheet somebody can carry to a bench.
 *
 * What is checked hardest is the thing that would be most tempting to get wrong: that no number on
 * the page was invented. A protocol wants a polymerase, a buffer and a final volume, and a plan
 * records none of those; writing in plausible ones would put made-up figures on a page somebody
 * carries to a bench and trusts. So every step says what it does not say, and these tests assert
 * that the gaps are named and that nothing fills them.
 */
import { protocolText, protocolsFor } from "@biolibs/bionet-tools";
import type { ItemState, PlanState } from "@biolibs/bionet";
import { describe, expect, it } from "vitest";

const plan = (over: Partial<PlanState> & Pick<PlanState, "plan">): PlanState => ({
  kind: "pcr", instrument: null, inputs: [], expects: [], settings: {}, note: null,
  by: "k1", settled: null, wanting: [], fields: {}, added: "e1", ...over,
});
const makes = (checksum: string, name: string, length = 780): PlanState["expects"][number] =>
  ({ checksum, name, sequence: "ACGT", circular: false, ends: { left: 0, right: 0 }, length });
const tube = (over: Partial<ItemState> & Pick<ItemState, "item">): ItemState => ({
  part: null, strain: null, amount: 30, unit: "µL", retired: false, needsRecount: false, where: null, from: null, fields: {}, added: "e2", ...over,
});

/** A lab with a PCR proposed off a tube it holds, and the programme the operator set. */
const amplifying = () => ({
  places: [{ place: "box", name: "Box 1" }],
  parts: [{ checksum: "c-gene", name: "pGene", length: 1712, circular: true },
          { checksum: "c-ins", name: "the insert", length: 780, circular: false }],
  items: [tube({ item: "t-gene", part: "c-gene", where: { place: "box", slot: null } })],
  plans: [plan({ plan: "p1", kind: "pcr", inputs: [{ item: "t-gene", amount: 1, role: "template" }],
                 expects: [makes("c-ins", "the insert")], note: "Amplify the casein insert.",
                 settings: { anneal_at_least: 18, denature_c: 98, anneal_c: 55, anneal_s: 30, extend_c: 72, extend_s: 45, cycles: 30 } })],
});

describe("a sheet to carry to a bench", () => {
  it("says what to fetch, with how much and where it is", () => {
    const [sheet] = protocolsFor(amplifying());
    expect(sheet!.haveReady).toEqual(["1 µL of pGene — in Box 1 (the tube holds 30 µL)"]);
    expect(sheet!.steps[0]!.takeOut).toEqual(["1 µL of pGene — in Box 1 (the tube holds 30 µL)"]);
    // The instruction itself is short: it is read while doing it, not while standing at a freezer.
    expect(sheet!.steps[0]!.doThis[0]).toBe("Set up the reaction with 1 µL of pGene as the template.");
  });

  it("sets the machine to what the operator actually set, and nothing else", () => {
    const [sheet] = protocolsFor(amplifying());
    expect(sheet!.steps[0]!.set).toEqual([
      { what: "Denature", to: "98 °C" },
      { what: "Anneal", to: "55 °C for 30 s" },
      { what: "Extend", to: "72 °C for 45 s" },
      { what: "Cycles", to: "30" },
    ]);
  });

  it("names what the plan does not say, rather than filling it in", () => {
    const [sheet] = protocolsFor(amplifying());
    expect(sheet!.steps[0]!.notSaid).toContain("which polymerase and which buffer");
    expect(sheet!.steps[0]!.notSaid).toContain("the final volume of the reaction, and how much water");
    // And none of those made-up numbers is anywhere on the page.
    const page = protocolText(sheet!);
    for (const invented of ["master mix", "50 µL", "Taq", "Q5", "25 µL", "nuclease-free"]) {
      expect(page).not.toContain(invented);
    }
  });

  it("says a programme the plan does not record is the lab's to set", () => {
    const bare = amplifying();
    const sheet = protocolsFor({ ...bare, plans: [{ ...bare.plans[0]!, settings: {} }] })[0]!;
    expect(sheet.steps[0]!.set).toEqual([]);
    expect(sheet.steps[0]!.doThis.join(" ")).toMatch(/does not record the programme, so set it as the lab usually does/);
  });

  it("carries the note of whoever proposed it", () => {
    expect(protocolsFor(amplifying())[0]!.steps[0]!.note).toBe("Amplify the casein insert.");
  });

  it("points at the step that makes something, rather than sending somebody shopping for it", () => {
    const lab = amplifying();
    const chained = protocolsFor({ ...lab, plans: [...lab.plans, plan({ plan: "p2", kind: "assembly",
      inputs: [{ part: "c-ins", amount: 1, role: "piece" }], expects: [makes("c-ring", "a ring", 900)] })] })[0]!;
    expect(chained.steps).toHaveLength(2);
    expect(chained.steps[1]!.takeOut).toEqual(["the insert — what step 1 makes"]);
    // And an instruction names it rather than giving an amount with no unit to go with it.
    expect(chained.steps[1]!.doThis[0]).toBe("Put the insert together.");
  });

  it("says what has to be got first, for a step that names a part with no tube", () => {
    const lab = amplifying();
    const sheet = protocolsFor({ ...lab, plans: [plan({ plan: "p9", kind: "assembly",
      inputs: [{ part: "c-nothing", amount: 1, role: "piece" }], expects: [makes("c-ring", "a ring")] })] })[0]!;
    expect(sheet.haveReady.join(" ")).toMatch(/order or make it first/);
    expect(sheet.steps[0]!.takeOut.join(" ")).toMatch(/nothing here makes it: order or make it first/);
  });
});

describe("each kind of step", () => {
  const sheetFor = (one: PlanState, more: Partial<ReturnType<typeof amplifying>> = {}) => {
    const lab = amplifying();
    return protocolsFor({ ...lab, ...more, plans: [one] })[0]!;
  };

  it("cuts and runs a gel, with the bands to expect", () => {
    const sheet = sheetFor(plan({ plan: "p2", kind: "digest", inputs: [{ item: "t-gene", amount: 1, role: "cut" }],
      settings: { enzymes: "EcoRI+BamHI", expected: "926,786", gel: "1.0", volts: 100, minutes: 45 } }));
    expect(sheet.steps[0]!.title).toBe("Cut it, and run a gel");
    expect(sheet.steps[0]!.doThis[0]).toBe("Cut 1 µL of pGene with EcoRI and BamHI.");
    expect(sheet.steps[0]!.doThis.at(-1)).toBe("Expect bands at 926 bp, 786 bp.");
    expect(sheet.steps[0]!.set).toEqual([{ what: "Gel", to: "1.0% agarose" }, { what: "Run at", to: "100 V" }, { what: "For", to: "45 min" }]);
  });

  it("grows a culture and says the band to look for", () => {
    const sheet = sheetFor(
      plan({ plan: "p3", kind: "induction", inputs: [{ item: "t-cul", amount: 1, role: "culture" }],
             settings: { inducer: "galactose", at: "2%", celsius: 30, rpm: 220, hours: 4, expected_kda: "16.5" } }),
      { strains: [{ strain: "s1", name: "W303 pWren-1", host: "Saccharomyces cerevisiae W303" }],
        items: [tube({ item: "t-cul", strain: "s1", amount: 8, unit: "mL" })] });
    expect(sheet.steps[0]!.doThis[0]).toBe("Grow 1 mL of W303 pWren-1.");
    expect(sheet.steps[0]!.doThis[1]).toBe("Add galactose to 2%.");
    expect(sheet.steps[0]!.set).toEqual([{ what: "Grow at", to: "30 °C" }, { what: "Shaking at", to: "220 rpm" }, { what: "For", to: "4 h" }]);
    expect(sheet.steps[0]!.doThis.at(-1)).toMatch(/band at 16.5 kDa that is in the induced lane and not the other/);
    // A protein gel beside an uninduced lane is the point, and it says so.
    expect(sheet.steps[0]!.doThis.join(" ")).toMatch(/before it was induced/);
  });

  it("puts a construct into a host, and says whose judgement the answer is", () => {
    const sheet = sheetFor(
      plan({ plan: "p4", kind: "transformation",
             inputs: [{ item: "t-gene", amount: 1, role: "construct" }, { item: "t-cul", amount: 1, role: "host" }] }),
      { strains: [{ strain: "s1", name: "W303", host: "Saccharomyces cerevisiae" }],
        items: [tube({ item: "t-gene", part: "c-gene" }), tube({ item: "t-cul", strain: "s1", amount: 50, unit: "mL" })] });
    expect(sheet.steps[0]!.doThis[0]).toBe("Put 1 µL of pGene into 1 mL of W303.");
    expect(sheet.steps[0]!.doThis.join(" ")).toMatch(/only you can say/);
    // It is not run at a machine, so it is not recorded at one.
    expect(sheet.steps[0]!.thenRecord).toMatch(/on the Strains page/);
    expect(sheet.steps[0]!.notSaid).toContain("what to select on");
  });

  it("says something about a kind it has never heard of, rather than nothing", () => {
    const sheet = sheetFor(plan({ plan: "p5", kind: "electroporation", inputs: [{ item: "t-gene", amount: 2, role: "DNA" }] }));
    expect(sheet.steps[0]!.title).toBe("Carry out the electroporation");
    expect(sheet.steps[0]!.doThis[0]).toBe("Carry out the electroporation with 2 µL of pGene.");
    expect(sheet.steps[0]!.notSaid).toEqual(["what this plan does not record, the lab supplies as usual"]);
  });
});

describe("the sheet as text", () => {
  it("is markdown, with every part of a step under its own heading", () => {
    const page = protocolText(protocolsFor(amplifying())[0]!);
    expect(page.startsWith("# the insert")).toBe(true);
    for (const heading of ["## Have ready", "## 1. Copy it by PCR", "**Take out**", "**Set**", "**Do**", "**Then**", "**This plan does not say**"]) {
      expect(page).toContain(heading);
    }
    expect(page).toContain("1. Set up the reaction with 1 µL of pGene as the template.");
    expect(page).toMatch(/Nothing here was filled in to make the page look finished/);
  });

  it("names a piece of work that makes nothing by what it is done to", () => {
    const lab = amplifying();
    const sheet = protocolsFor({ ...lab, plans: [plan({ plan: "p2", kind: "digest", inputs: [{ item: "t-gene", amount: 1, role: "cut" }],
      settings: { enzymes: "EcoRI", gel: "1.0" } })] })[0]!;
    expect(sheet.title).toBe("Cut it, and run a gel: pGene");
    expect(sheet.atTheEnd).toEqual([]);
  });

  it("gives one sheet for each piece of work, and none for a lab with none", () => {
    const lab = amplifying();
    const two = protocolsFor({ ...lab, plans: [...lab.plans,
      plan({ plan: "pX", kind: "digest", inputs: [{ item: "t-gene", amount: 1, role: "cut" }], settings: { enzymes: "EcoRI" } })] });
    expect(two).toHaveLength(2);
    expect(protocolsFor({ ...lab, plans: [] })).toEqual([]);
  });

  it("gives only one project's work when asked for one", () => {
    const lab = amplifying();
    const filed = { ...lab, plans: [
      { ...lab.plans[0]!, fields: { project: "Real Vegan Cheese" } },
      plan({ plan: "pX", kind: "digest", inputs: [{ item: "t-gene", amount: 1, role: "cut" }], settings: { enzymes: "EcoRI" }, fields: { project: "Bioprinting" } }),
    ] };
    expect(protocolsFor(filed, { project: "Real Vegan Cheese" })).toHaveLength(1);
    expect(protocolsFor(filed, { project: "Real Vegan Cheese" })[0]!.title).toBe("the insert");
    expect(protocolsFor(filed, { project: "Nothing" })).toEqual([]);
  });
});
