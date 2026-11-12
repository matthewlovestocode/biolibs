import { describe, expect, it } from "vitest";
import { distance, leaves, parseNewick, toNewick, totalBranchLength } from "@biolibs/phylo";

describe("phylo", () => {
  const nwk = "((A:0.1,B:0.2)AB:0.3,(C:0.4,D:0.5):0.6);";
  it("parses and round-trips", () => {
    const t = parseNewick(nwk);
    expect(leaves(t).map((l) => l.name)).toEqual(["A", "B", "C", "D"]);
    expect(toNewick(t)).toBe(nwk);
  });
  it("computes distances", () => {
    const t = parseNewick(nwk);
    expect(distance(t, "A", "B")).toBeCloseTo(0.3);
    expect(distance(t, "A", "C")).toBeCloseTo(0.1 + 0.3 + 0.6 + 0.4);
    expect(totalBranchLength(t)).toBeCloseTo(2.1);
  });
  it("rejects malformed input", () => expect(() => parseNewick("((A,B);")).toThrow());
});
