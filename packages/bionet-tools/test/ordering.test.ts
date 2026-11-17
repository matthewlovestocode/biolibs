/**
 * Open proposals read as one piece of work.
 *
 * The thing being checked is that nothing had to be declared. Each plan says what it expects to
 * make and what it needs; where one expects what another needs, the order follows, and these tests
 * build those plans the way the tools build them rather than asserting the order directly.
 */
import { planOfWork, saysWork, type OrderingLab } from "@biolibs/bionet-tools";
import type { ItemState, PlanState } from "@biolibs/bionet";
import { describe, expect, it } from "vitest";

/** A plan, as the lab holds one. */
const plan = (over: Partial<PlanState> & Pick<PlanState, "plan">): PlanState => ({
  kind: "pcr", instrument: null, inputs: [], expects: [], settings: {}, note: null,
  by: "k1", settled: null, wanting: [], fields: {}, added: "e1", ...over,
});
/** What a plan expects to make, which is what another plan can need. */
const makes = (checksum: string, name = checksum): PlanState["expects"][number] =>
  ({ checksum, name, sequence: "ACGT", circular: false, ends: { left: 0, right: 0 }, length: 4 });
const needs = (checksum: string, role = "piece"): PlanState["inputs"][number] => ({ part: checksum, amount: 1, role });
const uses = (item: string, role = "template"): PlanState["inputs"][number] => ({ item, amount: 1, role });
const tube = (over: Partial<ItemState> & Pick<ItemState, "item">): ItemState => ({
  part: null, strain: null, amount: 10, unit: "µL", retired: false, needsRecount: false,
  where: null, from: null, fields: {}, added: "e2", ...over,
});

/** A lab partway through building one construct: amplify two pieces, join them, put them in a host. */
const building = (): OrderingLab => ({
  items: [tube({ item: "t-template", part: "backbone" }), tube({ item: "t-primers", part: "primers" })],
  plans: [
    plan({ plan: "p1", kind: "pcr", inputs: [uses("t-template"), uses("t-primers", "forward primer")], expects: [makes("gene", "the gene")] }),
    plan({ plan: "p2", kind: "pcr", inputs: [uses("t-template"), uses("t-primers", "forward primer")], expects: [makes("vector", "the vector")] }),
    plan({ plan: "p3", kind: "assembly", inputs: [needs("gene"), needs("vector")], expects: [makes("construct", "pWren-CSN2")] }),
    plan({ plan: "p4", kind: "transformation", inputs: [needs("construct", "construct"), uses("t-culture", "host")] }),
  ],
});

describe("the order the proposals go in", () => {
  it("falls out of what each makes and what each needs, with nothing declared", () => {
    const work = planOfWork(building());
    expect(work.order.map((one) => one.plan.plan)).toEqual(["p1", "p2", "p3", "p4"]);
    expect(work.order.map((one) => one.depth)).toEqual([0, 0, 1, 2]);
    // The assembly waits on both PCRs; the transformation waits on the assembly.
    expect(work.order.find((one) => one.plan.plan === "p3")!.after.sort()).toEqual(["p1", "p2"]);
    expect(work.order.find((one) => one.plan.plan === "p4")!.after).toEqual(["p3"]);
    expect(work.tangled).toEqual([]);
  });

  it("says what could be carried out now, and what each other step waits on", () => {
    const work = planOfWork(building());
    // Both PCRs: the lab holds everything they need.
    expect(work.ready.map((one) => one.plan.plan)).toEqual(["p1", "p2"]);
    expect(work.held.map((one) => [one.plan.plan, one.held!.why]))
      .toEqual([["p3", "a step before it"], ["p4", "a step before it"]]);
  });

  it("lets a step go as soon as the lab really holds what it needs, however it was proposed", () => {
    // A plan names a part rather than a tube when there was no tube when it was proposed. If
    // somebody has since made one, that is a fact about the lab and the step is no longer waiting.
    const lab = building();
    const since: OrderingLab = { ...lab, items: [...lab.items, tube({ item: "t-gene", part: "gene" }), tube({ item: "t-vector", part: "vector" })] };
    const work = planOfWork(since);
    expect(work.order.find((one) => one.plan.plan === "p3")!.after).toEqual([]);
    expect(work.ready.map((one) => one.plan.plan)).toEqual(["p1", "p2", "p3"]);
  });

  it("names what has to be ordered: what nothing makes and no tube holds", () => {
    const lab = building();
    const orphan: OrderingLab = { ...lab, plans: [...lab.plans, plan({ plan: "p5", kind: "pcr", inputs: [needs("synthesised")], expects: [makes("other")] })] };
    const work = planOfWork(orphan);
    expect(work.toGet).toEqual([{ checksum: "synthesised", name: "synthesised", forSteps: ["p5"] }]);
    expect(work.held.find((one) => one.plan.plan === "p5")!.held).toEqual({ why: "something nobody is making", parts: ["synthesised"] });
  });

  it("says when a step counts on a tube that has run short", () => {
    const lab = building();
    const short: OrderingLab = { ...lab, plans: lab.plans.map((one) => (one.plan === "p1" ? { ...one, wanting: ["t-template"] } : one)) };
    const work = planOfWork(short);
    expect(work.ready.map((one) => one.plan.plan)).toEqual(["p2"]);
    expect(work.held.find((one) => one.plan.plan === "p1")!.held).toEqual({ why: "a tube that has run short", tubes: ["t-template"] });
  });

  it("leaves out what has already been carried out or set aside", () => {
    const lab = building();
    const done: OrderingLab = { ...lab, plans: lab.plans.map((one) => (one.plan === "p1" ? { ...one, settled: { run: "r1", by: "k1", entry: "e9" } } : one)) };
    const work = planOfWork(done);
    expect(work.order.map((one) => one.plan.plan)).toEqual(["p2", "p3", "p4"]);
    // And p3 no longer waits on it: it waits only on what is still open.
    expect(work.order.find((one) => one.plan.plan === "p3")!.after).toEqual(["p2"]);
  });

  it("does not fall over if the proposals somehow depend on each other in a circle", () => {
    const circle: OrderingLab = { items: [], plans: [
      plan({ plan: "a", inputs: [needs("y")], expects: [makes("x")] }),
      plan({ plan: "b", inputs: [needs("x")], expects: [makes("y")] }),
    ] };
    const work = planOfWork(circle);
    expect(work.order).toEqual([]);
    expect(work.tangled.sort()).toEqual(["a", "b"]);
    expect(saysWork(work).join(" ")).toMatch(/depend on each other in a circle/);
  });

  it("has nothing to say about a lab that has proposed nothing", () => {
    expect(planOfWork({ plans: [], items: [] })).toMatchObject({ threads: [], order: [], ready: [], held: [], toGet: [], tangled: [] });
    expect(saysWork(planOfWork({ plans: [], items: [] }))).toEqual([]);
  });
});

describe("the pieces of work a lab has on", () => {
  it("is one chain when the steps lead to one thing", () => {
    const work = planOfWork(building());
    expect(work.threads).toHaveLength(1);
    expect(work.threads[0]!.steps.map((one) => one.plan.plan)).toEqual(["p1", "p2", "p3", "p4"]);
    // What it ends with is what it makes that nothing in it then uses.
    expect(work.threads[0]!.ends).toEqual([{ checksum: "construct", name: "pWren-CSN2" }]);
    expect(work.threads[0]!.name).toBe("pWren-CSN2");
    expect(work.threads[0]!.clear).toBe(true);
  });

  it("is four chains when a lab is building four proteins, however they were proposed", () => {
    // Which is the shape of the thing: four caseins, each its own construct, interleaved.
    const four: OrderingLab = { items: [], plans: ["CSN1S1", "CSN2", "CSN1S2", "CSN3"].flatMap((gene) => [
      plan({ plan: `${gene}-pcr`, kind: "pcr", inputs: [needs(`${gene}-synthetic`)], expects: [makes(`${gene}-piece`)] }),
      plan({ plan: `${gene}-join`, kind: "assembly", inputs: [needs(`${gene}-piece`)], expects: [makes(`${gene}-construct`, `pWren-${gene}`)] }),
    ]) };
    const work = planOfWork(four);
    expect(work.threads).toHaveLength(4);
    expect(work.threads.map((one) => one.name).sort()).toEqual(["pWren-CSN1S1", "pWren-CSN1S2", "pWren-CSN2", "pWren-CSN3"]);
    for (const thread of work.threads) expect(thread.steps).toHaveLength(2);
    // Each needs its gene synthesised before anything can start, and the plan says so once per gene.
    expect(work.toGet).toHaveLength(4);
    expect(work.ready).toEqual([]);
  });

  it("never lets a step wait on one in another piece of work", () => {
    // A chain is every step joined to every other by what they make and need, so a step can only
    // ever wait on one in its own chain. Anything that shows the work relies on this.
    const lab = building();
    const many: OrderingLab = { ...lab, plans: [...lab.plans,
      plan({ plan: "q1", inputs: [], expects: [makes("other")] }),
      plan({ plan: "q2", inputs: [needs("other")], expects: [makes("another")] })] };
    const work = planOfWork(many);
    expect(work.threads.length).toBeGreaterThan(1);
    for (const thread of work.threads) {
      const inside = new Set(thread.steps.map((one) => one.plan.plan));
      for (const step of thread.steps) for (const before of step.after) expect(inside.has(before)).toBe(true);
    }
  });

  it("joins two chains that turn out to share a step", () => {
    const shared: OrderingLab = { items: [], plans: [
      plan({ plan: "common", inputs: [], expects: [makes("backbone")] }),
      plan({ plan: "one", inputs: [needs("backbone")], expects: [makes("first")] }),
      plan({ plan: "two", inputs: [needs("backbone")], expects: [makes("second")] }),
    ] };
    const work = planOfWork(shared);
    expect(work.threads).toHaveLength(1);
    expect(work.threads[0]!.steps).toHaveLength(3);
    expect(work.threads[0]!.ends.map((one) => one.checksum).sort()).toEqual(["first", "second"]);
  });
});

describe("what it says about where things stand", () => {
  it("says the counts, and what is in the way", () => {
    expect(saysWork(planOfWork(building()))).toEqual([
      "4 steps are proposed, in 1 piece of work.",
      "2 steps could be carried out now.",
      "2 steps are waiting on a step before it.",
    ]);
  });

  it("says when nothing can start, and why", () => {
    const stuck: OrderingLab = { items: [], plans: [plan({ plan: "p1", inputs: [needs("nothing-makes-this")], expects: [makes("x")] })] };
    const said = saysWork(planOfWork(stuck));
    expect(said).toContain("Nothing can be carried out yet.");
    expect(said.join(" ")).toMatch(/has to be ordered or made first/);
  });
});
