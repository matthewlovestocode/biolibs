/**
 * A run proposed from a tool, and the run that carries it out.
 *
 * The link between the two is decided from what is set up and not from what was pressed, so what
 * is checked is that a run claims a plan exactly when it is that plan: the same kind, the same
 * tubes, and the same enzymes where the plan names any.
 */
import { planCarried, toPlan, withPlan, type Plan } from "@biolibs/bionet-tools";
import { describe, expect, it } from "vitest";

const run = (more: Record<string, unknown> = {}): Record<string, unknown> => ({
  kind: "pcr", instrument: "cycler", outcome: "worked", note: null, settings: { anneal_at_least: 18 },
  inputs: [{ item: "t", amount: 1, role: "template" }, { item: "f", amount: 2, role: "forward primer" }, { item: "r", amount: 2, role: "reverse primer" }],
  outputs: [{ item: "made", sequence: "ACGTACGT", name: "amplicon", amount: 50, unit: "µL", features: [{ type: "CDS" }] }], ...more,
});

const plan = (more: Partial<Plan> = {}): Plan => ({
  plan: "p1", kind: "pcr", instrument: "cycler", settings: {}, note: null, by: "key", settled: null, wanting: [], added: "entry", expects: [],
  inputs: [{ item: "r", amount: 2, role: "reverse primer" }, { item: "t", amount: 1, role: "template" }, { item: "f", amount: 2, role: "forward primer" }], ...more,
});

describe("a run turned into a proposal", () => {
  it("keeps the tubes and settings, and expects what would have come out", () => {
    const proposed = toPlan(run(), "  to check the insert  ");
    expect(proposed).toEqual({
      kind: "pcr", instrument: "cycler", settings: { anneal_at_least: 18 }, note: "to check the insert",
      inputs: run()["inputs"], expects: [{ sequence: "ACGTACGT", name: "amplicon" }],
    });
    // Nothing that says something happened or exists comes with it.
    expect(JSON.stringify(proposed)).not.toMatch(/outcome|outputs|"made"|amount":50|features/);
  });

  it("carries a circle and sticky ends across, and falls back to the run's own note", () => {
    const proposed = toPlan(run({ note: "from the bench", outputs: [{ sequence: "ACGT", name: "ring", circular: true }, { sequence: "ACGTAC", name: "piece", ends: { left: 4, right: -2 } }] }));
    expect(proposed["expects"]).toEqual([{ sequence: "ACGT", name: "ring", circular: true }, { sequence: "ACGTAC", name: "piece", ends: { left: 4, right: -2 } }]);
    expect(proposed["note"]).toBe("from the bench");
    expect(toPlan(run())["note"]).toBeNull();
  });
});

describe("the plan a run carries out", () => {
  it("is the open one of the same kind that names exactly the same tubes, in any order", () => {
    const lab = { plans: [plan({ plan: "other", kind: "digest" }), plan()] };
    expect(planCarried(lab, run())?.plan).toBe("p1");
    expect(withPlan(lab, run())["plan"]).toBe("p1");
  });

  it.each([
    ["one tube is different", plan({ inputs: [{ item: "t", amount: 1, role: "template" }, { item: "f", amount: 2, role: "forward primer" }, { item: "x", amount: 2, role: "reverse primer" }] })],
    ["the plan names a tube more", plan({ inputs: [...plan().inputs, { item: "extra", amount: 1, role: "additive" }] })],
    ["the plan counts on a part there is no tube of", plan({ inputs: [{ item: "t", amount: 1, role: "template" }, { item: "f", amount: 2, role: "forward primer" }, { part: "checksum", amount: 2, role: "reverse primer" }] })],
    ["the plan is settled", plan({ settled: { run: null, by: "key", entry: "e" } })],
    ["the plan is of another kind", plan({ kind: "ligation" })],
  ])("is none when %s", (_what, one) => {
    expect(planCarried({ plans: [one] }, run())).toBeUndefined();
    expect(withPlan({ plans: [one] }, run())).not.toHaveProperty("plan");
  });

  it("goes by the enzymes too, where the plan names them", () => {
    const digest = (enzymes: string): Record<string, unknown> => ({ kind: "digest", inputs: [{ item: "t", amount: 1, role: "cut" }], settings: { enzymes }, outputs: [] });
    const lab = { plans: [plan({ kind: "digest", inputs: [{ item: "t", amount: 1, role: "cut" }], settings: { enzymes: "EcoRI+BamHI" } })] };
    expect(planCarried(lab, digest("EcoRI+BamHI"))?.plan).toBe("p1");
    expect(planCarried(lab, digest("EcoRI"))).toBeUndefined();
  });

  it("is none with nothing set up, or no lab", () => {
    expect(planCarried({ plans: [plan()] }, null)).toBeUndefined();
    expect(withPlan(null, run())).toEqual(run());
  });
});
