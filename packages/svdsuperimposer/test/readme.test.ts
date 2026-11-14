/**
 * Runs every code block in this package's README, so the published examples cannot drift.
 *
 * The README is the first thing anyone sees on npm, and an example that no longer works there is worse
 * than no example. Each `it` mirrors one section; the assertions are the outputs the README prints as
 * comments, so changing one without changing the other fails here.
 */
import { SVDSuperimposer, svd3 } from "@biolibs/svdsuperimposer";
import { describe, expect, it } from "vitest";

/** A unit square. */
const reference = (): number[][] => [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]];
/** The same square turned 90° about z and shifted along y. */
const moving = (): number[][] => [[5, 0, 0], [5, 1, 0], [4, 1, 0], [4, 0, 0]];

describe("README: SVDSuperimposer", () => {
  it("recovers the rotation and translation exactly", () => {
    const sup = new SVDSuperimposer();
    sup.set(reference(), moving());
    sup.run();

    const [rot, tran] = sup.getRotran();
    expect(rot.map((row) => Array.from(row))).toEqual([[0, -1, 0], [1, 0, 0], [0, 0, 1]]);
    expect(Array.from(tran)).toEqual([0, 5, 0]);
    expect(sup.getRms()).toBe(0);
    expect(Number(sup.getInitRms().toFixed(6))).toBe(4.123106);
    expect(sup.getTransformed().map((row) => Array.from(row)))
      .toEqual([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]]);
  });
});

describe("README: misuse", () => {
  it("raises Biopython's bare Exception", () => {
    const s = new SVDSuperimposer();
    s.set(reference(), moving());
    expect(() => s.getRms()).toThrowError("Nothing superimposed yet.");
    expect(() => new SVDSuperimposer().run()).toThrowError("No coordinates set.");
    expect(() => new SVDSuperimposer().set(reference(), [[0, 0, 0]]))
      .toThrowError("Coordinate number/dimension mismatch.");
    // The name is Python's, not the class's, since Biopython raises `Exception` itself.
    try { new SVDSuperimposer().run(); } catch (e) { expect((e as Error).name).toBe("Exception"); }
  });

  it("divides by zero on an empty set, in run rather than a getter", () => {
    const e = new SVDSuperimposer();
    e.set([], []);
    expect(() => e.run()).toThrowError("division by zero");
  });
});

describe("README: precision", () => {
  it("follows the array type", () => {
    const f32 = (rows: number[][]): Float32Array[] => rows.map((r) => Float32Array.from(r));
    const single = new SVDSuperimposer();
    single.set(f32(reference()), f32(moving()));
    single.run();
    expect(single.getRotran()[0][0] instanceof Float32Array).toBe(true);
    expect(single.getRms()).toBe(0);
  });
});

describe("README: svd3", () => {
  it("returns the singular values in descending order", () => {
    const [u, s, v] = svd3([[1, 0, 0], [0, 2, 0], [0, 0, 3]]);
    expect(s.map((x) => Number(x.toFixed(6)))).toEqual([3, 2, 1]);
    expect([u.length, v.length]).toEqual([3, 3]);
  });
});
