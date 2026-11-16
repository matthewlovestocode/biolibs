/**
 * A digest and its gel, worked out from sequences.
 *
 * Checked on molecules small enough to count by hand: where an enzyme cuts, that a circle cut once
 * is one piece and a line cut once is two, and that the pieces always add up to the whole.
 */
import { COMMON_ENZYMES, cutsOf, cutters, enzymeNamed, planDigest } from "@biolibs/bionet-tools";
import { describe, expect, it } from "vitest";

const A = "A".repeat(10);
// 10 A, EcoRI, 20 A, BamHI, 10 A: 52 bases, EcoRI cutting after base 11 and BamHI after base 37.
const MOLECULE = `${A}GAATTC${A}${A}GGATCC${A}`;

describe("where enzymes cut", () => {
  it("finds an enzyme by its name in any case, and no enzyme by a name that is not one", () => {
    expect(enzymeNamed("ecori")).toBe("EcoRI");
    expect(enzymeNamed(" EcoRI ")).toBe("EcoRI");
    expect(enzymeNamed("NotAnEnzyme")).toBeNull();
    expect(enzymeNamed("")).toBeNull();
    expect(enzymeNamed("constructor")).toBeNull();
    for (const name of COMMON_ENZYMES) expect(enzymeNamed(name)).toBe(name);
  });

  it("says where one cuts, and which of the usual ones cut at all", () => {
    expect(cutsOf({ sequence: MOLECULE, circular: false }, "EcoRI")).toEqual({ name: "EcoRI", site: "GAATTC", positions: [11] });
    expect(cutsOf({ sequence: MOLECULE, circular: false }, "NotI")).toMatchObject({ positions: [] });
    expect(cutsOf({ sequence: MOLECULE, circular: false }, "NotAnEnzyme")).toBeNull();
    // DpnI's site, GATC, is inside BamHI's, so it cuts wherever BamHI does.
    expect(cutters({ sequence: MOLECULE, circular: false }).map((one) => one.name)).toEqual(["BamHI", "DpnI", "EcoRI"]);
    // The ones that cut least come first.
    expect(cutters({ sequence: `${MOLECULE}${MOLECULE.slice(0, 20)}`, circular: false }).map((one) => [one.name, one.positions.length]))
      .toEqual([["BamHI", 1], ["DpnI", 1], ["EcoRI", 2]]);
    expect(cutters({ sequence: MOLECULE, circular: false }, ["EcoRI", "NotI", "NotAnEnzyme"]).map((one) => one.name)).toEqual(["EcoRI"]);
    expect(cutters({ sequence: A, circular: false })).toEqual([]);
  });
});

describe("planning a digest", () => {
  it("cuts a line into one more piece than it has cuts, and a circle into as many", () => {
    const line = planDigest({ sequence: MOLECULE, circular: false }, ["EcoRI", "BamHI"]);
    expect(line.fragments).toEqual([26, 15, 11]);
    expect(line.problem).toBeNull();
    const circle = planDigest({ sequence: MOLECULE, circular: true }, ["EcoRI", "BamHI"]);
    expect(circle.fragments).toEqual([26, 26]);
    expect(planDigest({ sequence: MOLECULE, circular: true }, ["EcoRI"]).fragments).toEqual([52]);
    for (const plan of [line, circle]) expect(plan.fragments.reduce((sum, one) => sum + one, 0)).toBe(52);
  });

  it("gives bands for the pieces and for the ladder beside them", () => {
    const plan = planDigest({ sequence: `${"ACGT".repeat(300)}GAATTC${"ACGT".repeat(700)}`, circular: false }, ["EcoRI"], { gel: "1.5", ladder: "100bp" });
    expect(plan.fragments).toEqual([2805, 1201]);
    expect(plan.bands.map((band) => band.size)).toEqual([2805, 1201]);
    expect(plan.bands[0]!.position).toBeLessThan(plan.bands[1]!.position);     // the larger piece runs less far
    expect([plan.gel, plan.ladderName]).toEqual(["1.5", "100 bp ladder"]);
    expect(plan.ladder.length).toBeGreaterThan(5);
    // A gel or ladder nobody has heard of is run as the usual one.
    expect(planDigest({ sequence: MOLECULE, circular: false }, ["EcoRI"], { gel: "9.9", ladder: "none" })).toMatchObject({ gel: "1.0", ladderName: "1 kb ladder" });
  });

  it("says in words when there is nothing to look at", () => {
    const part = { sequence: MOLECULE, circular: false };
    expect(planDigest(part, []).problem).toBe("Choose at least one enzyme.");
    expect(planDigest(part, ["NotAnEnzyme"]).problem).toBe("None of those is an enzyme this knows.");
    expect(planDigest(part, ["NotI"]).problem).toBe("NotI does not cut this.");
    expect(planDigest(part, ["NotI", "XhoI"]).problem).toBe("NotI and XhoI do not cut this.");
    expect(planDigest(part, ["NotI", "EcoRI", "EcoRI"])).toMatchObject({ problem: null, fragments: [41, 11] });
    expect(planDigest(part, ["NotI"]).ladder.length).toBeGreaterThan(0);
  });
});
