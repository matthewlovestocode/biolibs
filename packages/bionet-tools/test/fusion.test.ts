/**
 * Putting a construct together, and catching what fails silently.
 *
 * The tests that matter are the ones for mistakes that produce a construct which builds perfectly,
 * sequences exactly as designed, and gives the wrong protein: a piece that is not a whole number of
 * codons, and a tag put in front of a signal peptide. Neither shows up anywhere else in these
 * tools, and neither announces itself at the bench.
 */
import { designFusion, fusionWorking } from "@biolibs/bionet-tools";
import type { PartState } from "@biolibs/bionet";
import { translate } from "@biolibs/seq";
import { describe, expect, it } from "vitest";

const part = (name: string, sequence: string): PartState => ({
  checksum: `c-${name}`, kind: "dna", sequence, circular: false, length: sequence.length, name,
  offered: false, features: [], ends: { left: 0, right: 0 }, fields: {}, added: "e1",
});

/** A signal peptide: 13 codons beginning with methionine. */
const SIGNAL = "ATGAAAGTTTTAATTTTAGCTTGTTTAGTTGCTTTAGCT";
/** The mature protein: 13 codons, no stop. */
const MATURE = "AGAGAATTAGAAGAATTAAATGTTCCAGGTAAAGTTTTA";
/** Six histidines, in frame. */
const HIS6 = "CACCACCACCACCACCAC";
const STOP = "TAA";
const PROMOTER = "TTGACAGCTAGCTTGACAGCTAGCTTGACAGC";
const TERMINATOR = "GGGGCCCCGGGGCCCCGGGGCCCC";

const lab = {
  parts: [part("pAOX1", PROMOTER), part("alpha signal", SIGNAL), part("casein", MATURE + STOP),
          part("His6", HIS6), part("AOX1 terminator", TERMINATOR), part("casein, short", MATURE.slice(0, -1) + STOP)],
};

describe("putting a construct together", () => {
  it("joins the pieces, marks each where it ended up, and reads the whole thing as one", () => {
    const made = designFusion(lab, { pieces: [
      { part: "c-pAOX1", as: "promoter" }, { part: "c-alpha signal", as: "signal" },
      { part: "c-casein", as: "coding" }, { part: "c-AOX1 terminator", as: "terminator" },
    ], name: "pWren-CSN2" });
    expect(made.problem).toBeNull();
    expect(made.name).toBe("pWren-CSN2");
    expect(made.sequence).toBe(PROMOTER + SIGNAL + MATURE + STOP + TERMINATOR);
    // The translated stretch is only what is translated: not the promoter, not the terminator.
    expect(made.coding).toEqual({ from: PROMOTER.length + 1, to: PROMOTER.length + SIGNAL.length + MATURE.length + STOP.length });
    expect(made.protein).toBe(String(translate(SIGNAL + MATURE)));
    expect(made.features.map((one) => [one.type, one.label])).toEqual([
      ["promoter", "pAOX1"], ["sig_peptide", "alpha signal"], ["CDS", "casein"], ["terminator", "AOX1 terminator"],
    ]);
  });

  it("says what is left once the signal peptide is cut off, which is what a lab collects", () => {
    const made = designFusion(lab, { pieces: [{ part: "c-alpha signal", as: "signal" }, { part: "c-casein", as: "coding" }] });
    expect(made.mature).toBe(String(translate(MATURE)));
    expect(made.mature!.length).toBe(made.protein.length - SIGNAL.length / 3);
  });

  it("holds the frame through every junction, and says so", () => {
    const made = designFusion(lab, { pieces: [
      { part: "c-alpha signal", as: "signal" }, { part: "c-His6", as: "tag" }, { part: "c-casein", as: "coding" },
    ] });
    expect(made.junctions.map((one) => [one.after, one.before, one.inFrame]))
      .toEqual([["alpha signal", "His6", true], ["His6", "casein", true]]);
    expect(made.junctions[0]!.says).toMatch(/ends on a whole codon/);
    expect(made.checks.filter((one) => one.weight === "stop")).toEqual([]);
  });
});

describe("the mistakes that fail silently", () => {
  it("catches a piece that is not a whole number of codons, and says what it costs", () => {
    // One base short. The ring builds, the sequencing matches the design, and the protein is wrong.
    const made = designFusion(lab, { pieces: [
      { part: "c-alpha signal", as: "signal" }, { sequence: "CACCACCACCACCACCA", name: "His6, one short", as: "tag" },
      { part: "c-casein", as: "coding" },
    ] });
    const stop = made.checks.find((one) => one.weight === "stop")!;
    expect(stop.says).toMatch(/is 17 bases, which is not a whole number of codons/);
    expect(stop.says).toMatch(/shifts everything after it by 2/);
    expect(stop.because).toBe("17 ÷ 3 leaves 2");
    // And the junction after it reports the frame as broken, with the arithmetic.
    const broken = made.junctions.find((one) => one.before === "casein")!;
    expect(broken.inFrame).toBe(false);
    expect(broken.says).toMatch(/is 2 past a whole codon, so casein and everything after it is read in the wrong frame/);
  });

  it("catches a tag put in front of a signal peptide, which is the classic one", () => {
    const made = designFusion(lab, { pieces: [
      { part: "c-His6", as: "tag" }, { part: "c-alpha signal", as: "signal" }, { part: "c-casein", as: "coding" },
    ] });
    const stop = made.checks.find((one) => one.weight === "stop")!;
    expect(stop.says).toMatch(/only works at the very start of the chain/);
    expect(stop.says).toMatch(/will be made and will stay inside the cell/);
    expect(stop.says).toMatch(/Put the signal first and the tag after it/);
    // And nothing is claimed about a mature chain, because there would not be one.
    expect(made.mature).toBeNull();
  });

  it("catches a stop where no stop belongs, which is usually a frame that shifted", () => {
    const made = designFusion(lab, { pieces: [
      { part: "c-casein", as: "coding" }, { part: "c-His6", as: "tag" },
    ] });
    // casein ends in a stop, so a tag after it is never reached.
    const stop = made.checks.find((one) => one.says.includes("finishes early"))!;
    expect(stop.weight).toBe("stop");
    expect(stop.says).toMatch(/If a piece above is not a whole number of codons, that is usually why/);
  });

  it("catches a promoter or a terminator in the wrong place", () => {
    const after = designFusion(lab, { pieces: [{ part: "c-casein", as: "coding" }, { part: "c-pAOX1", as: "promoter" }] });
    expect(after.checks.some((one) => /A promoter goes before what it drives/.test(one.says))).toBe(true);
    const early = designFusion(lab, { pieces: [{ part: "c-AOX1 terminator", as: "terminator" }, { part: "c-casein", as: "coding" }] });
    expect(early.checks.some((one) => /A terminator goes at the end/.test(one.says))).toBe(true);
  });

  it("notes what is only worth a second glance, apart from what would stop it", () => {
    const made = designFusion(lab, { pieces: [{ part: "c-casein", as: "coding" }] });
    // It does not start with methionine, and that is worth saying without being a refusal.
    expect(made.checks.map((one) => one.weight)).toEqual(["look"]);
    expect(made.checks[0]!.says).toMatch(/does not begin with methionine/);
    // Something that would stop it comes first in the list.
    const both = designFusion(lab, { pieces: [{ sequence: "CACCA", name: "two short", as: "tag" }, { part: "c-casein", as: "coding" }] });
    expect(both.checks[0]!.weight).toBe("stop");
  });

  it("says when there is no stop at the end", () => {
    const made = designFusion(lab, { pieces: [{ part: "c-alpha signal", as: "signal" }, { part: "c-His6", as: "tag" }] });
    expect(made.checks.some((one) => /no stop codon at the end/.test(one.says))).toBe(true);
  });
});

describe("what it refuses to design at all", () => {
  it("will not count a frame through a base it cannot read", () => {
    const made = designFusion(lab, { pieces: [{ sequence: "ATGNNNAAA", name: "uncertain", as: "coding" }] });
    expect(made.problem).toMatch(/a reading frame cannot be counted through an uncertain base/);
  });

  it("will not build out of a protein, or out of a part the lab has not got", () => {
    const protein = { parts: [{ ...part("casein", "MKVLILA"), kind: "protein" as const }] };
    expect(designFusion(protein, { pieces: [{ part: "c-casein", as: "coding" }] }).problem).toMatch(/is a protein/);
    expect(designFusion(lab, { pieces: [{ part: "c-nothing", as: "coding" }] }).problem).toMatch(/a part the lab does not have/);
    expect(designFusion(lab, { pieces: [] }).problem).toMatch(/none were given/);
    expect(designFusion(lab, { pieces: [{ name: "nothing", as: "coding" }] }).problem).toMatch(/has no bases/);
  });

  it("says when nothing in it is translated", () => {
    const made = designFusion(lab, { pieces: [{ part: "c-pAOX1", as: "promoter" }, { part: "c-AOX1 terminator", as: "terminator" }] });
    expect(made.problem).toMatch(/none of these pieces is translated/i);
    // The sequence is still there, since the pieces really do join; there is just no protein.
    expect(made.sequence).toBe(PROMOTER + TERMINATOR);
  });
});

describe("the working", () => {
  it("shows the frame at each junction, with the arithmetic that decides it", () => {
    const made = designFusion(lab, { pieces: [
      { part: "c-alpha signal", as: "signal" }, { part: "c-His6", as: "tag" }, { part: "c-casein", as: "coding" },
    ] });
    const [frame, reads] = fusionWorking(made);
    expect(frame!.comes).toBe("whole the whole way");
    expect(frame!.kind).toBe("exact");
    expect(frame!.steps.join(" ")).toMatch(/which three bases the cell reads together/);
    expect(reads!.comes).toBe(`${made.protein.length} amino acids`);
    expect(reads!.rests).toMatch(/not something a sequence can be asked/);
  });

  it("says the frame is broken when it is", () => {
    const made = designFusion(lab, { pieces: [
      { sequence: "CACCACCACCACCACCA", name: "one short", as: "tag" }, { part: "c-casein", as: "coding" },
    ] });
    expect(fusionWorking(made)[0]!.comes).toBe("broken");
  });

  it("has nothing to show for something it would not design", () => {
    expect(fusionWorking(designFusion(lab, { pieces: [] }))).toEqual([]);
  });
});
