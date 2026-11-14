/**
 * Runs every code block in this package's README, so the published examples cannot drift.
 *
 * The README is the first thing anyone sees on npm, and an example that no longer works there is worse
 * than no example. Each `it` mirrors one section; the assertions are the outputs the README prints as
 * comments, so changing one without changing the other fails here.
 */
import { Seq } from "@biolibs/seq";
import * as motifs from "@biolibs/motifs";
import type { Motif } from "@biolibs/motifs";
import { describe, expect, it } from "vitest";

/** The seven aligned instances the README builds its motif from. */
const instances = (): Seq[] =>
  ["TACAA", "TACGC", "TACAC", "TACCC", "AACCC", "AATGC", "AATGC"].map((s) => new Seq(s));

/** That motif, fresh — several blocks assign to it. */
const motif = (): Motif => motifs.create(instances());

/** The same motif with the README's pseudocounts and background set. */
function scored(): Motif {
  const m = motif();
  m.pseudocounts = 0.5;
  m.background = 0.4;
  return m;
}

/** @param xs - Scores. @returns Them rounded as the README prints them. */
const r4 = (xs: Iterable<number>): number[] => [...xs].map((x) => Number(x.toFixed(4)));

describe("README: create and Motif", () => {
  it("describes the motif", () => {
    const m = motif();
    expect(m.length).toBe(5);
    expect(m.alphabet).toBe("ACGT");
    expect(String(m.consensus)).toBe("TACGC");
    expect(String(m.degenerateConsensus)).toBe("WACVC");
    expect(String(m.anticonsensus)).toBe("CCATG");
    expect(String(m.reverseComplement().consensus)).toBe("GCGTA");
  });

  it("slices into a motif, and only by a slice", () => {
    expect(String(motif().slice({ start: 1, stop: 4 }).consensus)).toBe("ACG");
    expect(() => motif().slice(1 as never)).toThrowError("motif indices must be slices");
  });
});

describe("README: the counts", () => {
  it("holds a row per letter", () => {
    const m = motif();
    expect([...m.counts.values]).toEqual([
      ["A", [3, 7, 0, 2, 1]], ["C", [0, 0, 5, 2, 6]], ["G", [0, 0, 0, 3, 0]], ["T", [4, 0, 2, 0, 0]]]);
    expect(m.counts.row("A")).toEqual([3, 7, 0, 2, 1]);
    expect(m.counts.get("A", 0)).toBe(3);
    expect(m.counts.length).toBe(5);
    expect(String(m.counts.consensus)).toBe("TACGC");
    expect(m.counts.gcContent).toBe(0.45714285714285713);
  });
});

describe("README: pseudocounts, background and the matrices", () => {
  it("spreads a number over the letters", () => {
    const m = scored();
    expect([...m.pseudocounts]).toEqual([["A", 0.5], ["C", 0.5], ["G", 0.5], ["T", 0.5]]);
    expect([...m.background]).toEqual([["A", 0.3], ["C", 0.2], ["G", 0.2], ["T", 0.3]]);
  });

  it("builds the frequency and log-odds matrices", () => {
    const m = scored();
    expect(m.pwm.row("A")!.map((x) => Number(Number(x).toFixed(4))))
      .toEqual([0.3889, 0.8333, 0.0556, 0.2778, 0.1667]);
    expect(m.pssm.row("A")!.map((x) => Number(Number(x).toFixed(4))))
      .toEqual([0.3744, 1.4739, -2.433, -0.111, -0.848]);
    expect(Number(m.pssm.max.toFixed(4))).toBe(6.6341);
    expect(Number(m.pssm.min.toFixed(4))).toBe(-11.5798);
  });
});

describe("README: scanning a sequence", () => {
  it("scores every window and finds the hits on both strands", () => {
    const m = scored();
    const target = new Seq("TACGCAAATACGC");
    const pssm = m.pssm;

    expect(r4(pssm.calculate(target) as Float32Array))
      .toEqual([6.6341, -3.6957, -3.0436, -7.088, -5.351, -3.8656, 3.4787, -5.8656, 6.6341]);
    expect([...pssm.search(target, 2.0)].map(([at, s]) => [at, Number(s.toFixed(4))]))
      .toEqual([[0, 6.6341], [6, 3.4787], [8, 6.6341]]);
    // A negative position is a hit on the reverse strand, counted from the end.
    expect([...pssm.search(target, 0.0)].map(([at, s]) => [at, Number(s.toFixed(4))]))
      .toEqual([[0, 6.6341], [-10, 1.0048], [6, 3.4787], [8, 6.6341]]);

    expect(Number(pssm.mean(m.background).toFixed(4))).toBe(3.2101);
    expect(Number(pssm.std(m.background).toFixed(4))).toBe(2.6024);
  });

  it("returns a single number for a sequence exactly as long as the motif", () => {
    // Stated in "Things to know": Biopython does this, and it makes `search` raise there.
    const scores = scored().pssm.calculate(new Seq("TACGC"));
    expect(typeof scores).toBe("number");
  });
});

describe("README: ScoreDistribution and thresholds", () => {
  it("gives the three thresholds", () => {
    const m = scored();
    const dist = new motifs.ScoreDistribution(1000, m.pssm, m.background);
    expect(Number(dist.thresholdFpr(0.001).toFixed(4))).toBe(6.2698);
    expect(Number(dist.thresholdPatser().toFixed(4))).toBe(0.4729);
    expect(Number(dist.thresholdBalanced(1000).toFixed(4))).toBe(6.2698);
  });
});

describe("README: reading", () => {
  const JASPAR = ">MA0001.1 AGL3\nA [ 0 3 79 40 66 48 65 11 65 0 ]\n"
    + "C [94 75  4  3  1  2  5  2  3  3 ]\nG [ 1  0  3  4  1  0  5  3 28 88 ]\n"
    + "T [ 2 19 11 50 29 47 22 81  1  6 ]\n";

  it("parses JASPAR and refuses an unknown format", () => {
    const [m] = motifs.parse(JASPAR, "jaspar");
    expect(m!.length).toBe(10);
    expect(String(m!.consensus)).toBe("CCATAAATAG");
    expect(String(m!.degenerateConsensus)).toBe("CCAWAWATAG");
    expect(() => motifs.parse(JASPAR, "nope")).toThrowError("Unknown format nope");
  });
});

describe("README: the format records", () => {
  /** A two-motif MEME minimal file, as MEME writes them. */
  const MINIMAL = `MEME version 4

ALPHABET= ACGT

strands: + -

Background letter frequencies
A 0.25 C 0.25 G 0.25 T 0.25

MOTIF TTGA0 MEME-1

letter-probability matrix: alength= 4 w= 3 nsites= 28 E= 3.4e+002
0.270568 0.251912 0.256087 0.221433
0.416866 0.125853 0.012659 0.444623
0.179095 0.417269 0.219918 0.183718

MOTIF GCTA1 MEME-2

letter-probability matrix: alength= 4 w= 3 nsites= 2 E= 1.2e+001
0.100400 0.070259 0.511930 0.317411
0.200000 0.300000 0.400000 0.100000
0.250000 0.250000 0.250000 0.250000
`;

  it("carries the run's own fields, and indexes by name", () => {
    const record = motifs.minimal.read(MINIMAL);
    expect(record.length).toBe(2);
    expect(record.version).toBe("4");
    expect(record.alphabet).toBe("ACGT");
    expect([...record].map((m) => m.name)).toEqual(["TTGA0", "GCTA1"]);
    expect([...record.background]).toEqual([["A", 0.25], ["C", 0.25], ["G", 0.25], ["T", 0.25]]);
    expect(record[0]!.numOccurrences).toBe(28);
    expect(record[0]!.evalue).toBe(340);
    expect(String(record[0]!.degenerateConsensus)).toBe("NWN");
    expect(record.byName("GCTA1")!.evalue).toBe(12);
  });
});

describe("README: writing", () => {
  it("writes jaspar and transfac", () => {
    const m = scored();
    expect(motifs.write([m], "jaspar").split("\n")).toEqual([
      ">None ",
      "A [  3.00   7.00   0.00   2.00   1.00]",
      "C [  0.00   0.00   5.00   2.00   6.00]",
      "G [  0.00   0.00   0.00   3.00   0.00]",
      "T [  4.00   0.00   2.00   0.00   0.00]",
      "",
    ]);
    expect(motifs.write([m], "transfac").split("\n").slice(0, 3)).toEqual([
      "P0      A      C      G      T",
      "01      3      0      0      4      W",
      "02      7      0      0      0      A",
    ]);
    expect(() => motifs.write([m], "nope")).toThrowError("Unknown format type nope");
  });

  it("writes pfm as the four count rows alone", () => {
    expect(motifs.write([scored()], "pfm").split("\n")[0]).toBe("  3.00   7.00   0.00   2.00   1.00");
  });
});

describe("README: things to know", () => {
  it("compares matrices by their rows, and refuses to order them", () => {
    const m = scored();
    // A weight matrix stores tuples where counts store lists, and in Python those are never equal.
    expect(m.pwm.equals(m.counts)).toBe(false);
    expect(() => m.counts.lt(m.pwm)).toThrowError(TypeError);
  });
});
