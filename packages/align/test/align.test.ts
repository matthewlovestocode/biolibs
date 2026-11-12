import { describe, expect, it } from "vitest";
import { editDistance, globalAlign, identity, localAlign } from "@biolibs/align";

describe("align", () => {
  it("global alignment of identical strings", () => {
    const r = globalAlign("ACGT", "ACGT");
    expect(r).toMatchObject({ score: 4, a: "ACGT", b: "ACGT" });
    expect(identity(r)).toBe(1);
  });
  it("global alignment introduces a gap", () => {
    const r = globalAlign("ACGT", "AGT", { gap: -1 });
    expect(r.a.replace(/-/g, "")).toBe("ACGT");
    expect(r.b.replace(/-/g, "")).toBe("AGT");
    expect(r.score).toBe(2);
  });
  it("local alignment finds the shared core", () => {
    const r = localAlign("TTTACGTAAA", "GGGACGTCCC");
    expect(r.a).toBe("ACGT");
    expect(r.score).toBe(4);
    expect(r.aRange).toEqual([3, 7]);
  });
  it("edit distance", () => expect(editDistance("kitten", "sitting")).toBe(3));
});
