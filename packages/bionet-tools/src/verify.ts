/**
 * Checking that what came back is what was designed.
 *
 * Everything else in this package proposes. This is the one that confirms: a sequencing read
 * against the construct it was supposed to be, difference by difference, with what each difference
 * does to the protein. It is the check that stands between a plasmid map and a plasmid.
 *
 * Three things it does that a plain alignment does not.
 *
 * - **It tries both strands.** A read comes off whichever end the primer sat at, and a read that is
 *   simply the other way round is not a construct that is wrong.
 * - **It says where on the design**, not where in the alignment, so a difference can be looked up on
 *   the map and found.
 * - **It says what the difference costs.** A changed base that leaves the amino acid alone is a
 *   nuisance; one that makes a stop codon is a dead construct; one base missing is a frameshift and
 *   everything after it is wrong. Those are not the same finding and are not reported as if they were.
 *
 * One thing it cannot do, and does not pretend to: a base gained or lost inside a run of the same
 * base has no single place it could have happened, since deleting any of them gives the same read.
 * The earliest is reported. What was gained or lost, and what it costs, are right either way; only
 * the position inside the run is a choice the alignment made.
 */
import { PairwiseAligner } from "@biolibs/align";
import type { PartFeature } from "@biolibs/bionet";
import { translate } from "@biolibs/seq";
import { CODON } from "./codons.js";
import type { Working } from "./pcr-working.js";

/** What kind of difference it is. */
export type DifferenceKind = "substitution" | "insertion" | "deletion";

/** What a difference does to a protein. */
export type ProteinEffect =
  /** The amino acid is unchanged. */
  | { kind: "silent"; codon: number; aminoAcid: string }
  /** One amino acid becomes another. */
  | { kind: "missense"; codon: number; from: string; to: string }
  /** It makes a stop codon, so everything after it is lost. */
  | { kind: "nonsense"; codon: number; from: string }
  /** Bases are gained or lost in a multiple of three: amino acids come or go, the rest reads on. */
  | { kind: "in frame"; codon: number; by: number }
  /** Bases are gained or lost out of step, so everything after is read wrong. */
  | { kind: "frameshift"; codon: number; by: number }
  /** It falls in a coding sequence this does not work out, such as one in several pieces. */
  | { kind: "not worked out"; codon: number; why: string };

/** One place the read differs from the design. */
export interface Difference {
  /** Where on the design, counting from 1. For an insertion, the base it comes after. */
  at: number;
  kind: DifferenceKind;
  /** What the design has there. Empty for an insertion. */
  was: string;
  /** What the read has there. Empty for a deletion. */
  now: string;
  /** What is marked on the design at that place. */
  inside: { label: string; type: string }[];
  /** What it does to the protein, for a difference in a coding sequence. */
  protein: ProteinEffect | null;
}

/** What came of checking a read against a design. */
export interface Verification {
  /** Whether the read had to be turned round to line up, which is not a fault. */
  reversed: boolean;
  /** The stretch of the design the read covers, counting from 1, or `null` if it lines up nowhere. */
  covers: { from: number; to: number; bases: number } | null;
  /** How much of the design that stretch is, from 0 to 1. */
  covered: number;
  /** How much of the covered stretch matches, from 0 to 1. */
  identity: number;
  /** Every place they differ, in order along the design. */
  differences: Difference[];
  /** Whether the read is the design over everything it covers. */
  matches: boolean;
  /** Whether anything found would change a protein. */
  changesProtein: boolean;
  /** Anything a careful person would look at. */
  warnings: string[];
  /** Why it could not be checked, or `null`. */
  problem: string | null;
}

const clean = (bases: string): string => bases.replace(/\s+/g, "").toUpperCase();
const PAIR: Readonly<Record<string, string>> = { A: "T", T: "A", G: "C", C: "G", N: "N" };
const flip = (bases: string): string => [...bases].reverse().map((one) => PAIR[one] ?? "N").join("");

/** An aligner that finds where a read sits on a design, rather than forcing the two end to end. */
function reader(): PairwiseAligner {
  const aligner = new PairwiseAligner();
  aligner.mode = "local";
  aligner.match = 2;
  aligner.mismatch = -3;
  aligner.openGapScore = -5;
  aligner.extendGapScore = -2;
  return aligner;
}

/** The coding sequences a difference can be read against: one piece, so the frame is plain. */
const codingAt = (features: readonly PartFeature[], at: number): PartFeature[] =>
  features.filter((one) => /^cds$/i.test(one.type) && one.parts.some((piece) => at >= piece.start && at < piece.end));

/**
 * What one changed base does to the protein of a coding sequence.
 *
 * @param design - The design's bases.
 * @param cds - The coding sequence it falls in.
 * @param at - Where the change is, counting from 0.
 * @param now - What the read has there.
 * @returns What it does, said as one of the kinds.
 */
function effectOf(design: string, cds: PartFeature, at: number, now: string): ProteinEffect {
  const piece = cds.parts[0]!;
  if (cds.parts.length > 1) return { kind: "not worked out", codon: 0, why: `${cds.label} is marked in ${cds.parts.length} pieces, so the reading frame across it is not worked out here` };
  const bases = design.slice(piece.start, piece.end);
  const forward = cds.strand !== -1;
  // On the other strand the coding sequence runs the other way, and so do its codons.
  const offset = forward ? at - piece.start : piece.end - 1 - at;
  const coding = forward ? bases : flip(bases);
  const codon = Math.floor(offset / CODON);
  const start = codon * CODON;
  const was = coding.slice(start, start + CODON);
  if (was.length < CODON) return { kind: "not worked out", codon: codon + 1, why: `${cds.label} does not end on a whole codon` };
  const changed = `${was.slice(0, offset - start)}${forward ? now : (PAIR[now] ?? "N")}${was.slice(offset - start + 1)}`;
  const before = String(translate(was));
  const after = String(translate(changed));
  if (before === after) return { kind: "silent", codon: codon + 1, aminoAcid: before };
  if (after === "*") return { kind: "nonsense", codon: codon + 1, from: before };
  return { kind: "missense", codon: codon + 1, from: before, to: after };
}

/**
 * Check a sequencing read against the design it was supposed to be.
 *
 * @param design - The construct as designed: its bases and what is marked on it.
 * @param read - The read, as bases. Either strand.
 * @param options - `least` is how much of the read has to line up for the check to mean anything,
 *   as a fraction, 0.5 unless said.
 * @returns What matched, what did not, and what each difference costs.
 *
 * @example
 * ```ts
 * import { checkRead } from "@biolibs/bionet-tools";
 *
 * const checked = checkRead({ sequence: designed, features }, fromTheFacility);
 * checked.matches;          // whether it is what was designed, over what the read covers
 * checked.differences;      // each one, where on the design, and what it does to the protein
 * ```
 */
export function checkRead(design: { sequence: string; features?: readonly PartFeature[] }, read: string,
                          options: { least?: number } = {}): Verification {
  const nothing = (problem: string): Verification =>
    ({ reversed: false, covers: null, covered: 0, identity: 0, differences: [], matches: false, changesProtein: false, warnings: [], problem });
  const bases = clean(design.sequence);
  const given = clean(read);
  if (bases.length === 0) return nothing("There is nothing to check against.");
  if (given.length === 0) return nothing("There is no read to check.");
  if (!/^[ACGTN]+$/.test(bases)) return nothing("The design has bases that are not A, C, G, T or N.");
  if (!/^[ACGTN]+$/.test(given)) return nothing("The read has bases that are not A, C, G, T or N. A base call that could not be made is N.");

  const aligner = reader();
  // A read comes off whichever end its primer sat at, so both ways round are tried and the better kept.
  const turned = flip(given);
  const forward = aligner.score(bases, given);
  const backward = aligner.score(bases, turned);
  const reversed = backward > forward;
  const query = reversed ? turned : given;
  const [best] = aligner.align(bases, query);
  if (best === undefined) return nothing("The read does not line up against the design at all.");
  const [onDesign, onRead] = best.indices as unknown as [number[], number[]];

  const warnings: string[] = [];
  const differences: Difference[] = [];
  const features = design.features ?? [];
  /** Gather a run of gaps into one difference rather than reporting each base of it. */
  let run: { kind: DifferenceKind; at: number; was: string; now: string } | null = null;
  const settle = (): void => {
    if (run === null) return;
    const at = run.at;
    const inside = features.filter((one) => one.parts.some((piece) => at - 1 >= piece.start && at - 1 < piece.end)).map((one) => ({ label: one.label, type: one.type }));
    const cds = codingAt(features, at - 1)[0];
    const by = run.kind === "insertion" ? run.now.length : -run.was.length;
    const protein: ProteinEffect | null = cds === undefined ? null
      : cds.parts.length > 1 ? { kind: "not worked out", codon: 0, why: `${cds.label} is marked in ${cds.parts.length} pieces, so the reading frame across it is not worked out here` }
      : { kind: Math.abs(by) % CODON === 0 ? "in frame" : "frameshift", codon: Math.floor((at - 1 - cds.parts[0]!.start) / CODON) + 1, by };
    differences.push({ at, kind: run.kind, was: run.was, now: run.now, inside, protein });
    run = null;
  };

  let matched = 0;
  let from = Number.POSITIVE_INFINITY;
  let to = 0;
  for (let column = 0; column < onDesign.length; column++) {
    const d = onDesign[column]!;
    const q = onRead[column]!;
    if (d >= 0) { from = Math.min(from, d + 1); to = Math.max(to, d + 1); }
    if (d >= 0 && q >= 0) {
      settle();
      if (bases[d] === query[q]) { matched += 1; continue; }
      const at = d + 1;
      const inside = features.filter((one) => one.parts.some((piece) => d >= piece.start && d < piece.end)).map((one) => ({ label: one.label, type: one.type }));
      const cds = codingAt(features, d)[0];
      differences.push({ at, kind: "substitution", was: bases[d]!, now: query[q]!, inside, protein: cds === undefined ? null : effectOf(bases, cds, d, query[q]!) });
      continue;
    }
    // A gap on one side or the other: bases the read is missing, or bases it has over.
    const kind: DifferenceKind = d < 0 ? "insertion" : "deletion";
    const at = d < 0 ? Math.max(1, to) : d + 1;
    if (run === null || run.kind !== kind) { settle(); run = { kind, at, was: "", now: "" }; }
    if (d < 0) run.now += query[q]!;
    else run.was += bases[d]!;
  }
  settle();

  const covers = to === 0 ? null : { from, to, bases: to - from + 1 };
  const span = covers === null ? 0 : covers.bases;
  const identity = span === 0 ? 0 : matched / span;
  const least = options.least ?? 0.5;
  if (given.length > 0 && span / given.length < least) {
    warnings.push(`Only ${Math.round((span / given.length) * 100)}% of the read lines up against the design, so this says little. It may be a read of something else.`);
  }
  if (given.includes("N")) warnings.push(`The read has ${[...given].filter((one) => one === "N").length} bases that could not be called, which are not counted as differences.`);
  if (covers !== null && covers.bases < bases.length) {
    warnings.push(`The read covers ${covers.from}–${covers.to} of ${bases.length} bases. The rest of the design is unchecked.`);
  }
  return {
    reversed, covers, covered: covers === null ? 0 : covers.bases / bases.length, identity,
    differences, matches: differences.length === 0 && covers !== null,
    changesProtein: differences.some((one) => one.protein !== null && one.protein.kind !== "silent"),
    warnings, problem: null,
  };
}

/** A difference, said in a line. */
export function saysDifference(one: Difference): string {
  const where = `at ${one.at.toLocaleString("en-US")}`;
  const what = one.kind === "substitution" ? `${one.was} became ${one.now}`
    : one.kind === "deletion" ? `${one.was.length} ${one.was.length === 1 ? "base" : "bases"} missing (${one.was})`
    : `${one.now.length} ${one.now.length === 1 ? "base" : "bases"} over (${one.now})`;
  const effect = one.protein === null ? ""
    : one.protein.kind === "silent" ? `, which leaves ${one.protein.aminoAcid} at codon ${one.protein.codon} alone`
    : one.protein.kind === "missense" ? `, which makes codon ${one.protein.codon} ${one.protein.from} into ${one.protein.to}`
    : one.protein.kind === "nonsense" ? `, which makes codon ${one.protein.codon} a stop, so everything after it is lost`
    : one.protein.kind === "frameshift" ? `, which shifts the frame from codon ${one.protein.codon} on, so the rest is read wrong`
    : one.protein.kind === "in frame" ? `, which adds or removes whole codons from codon ${one.protein.codon}` : `, ${one.protein.why}`;
  return `${where}: ${what}${effect}`;
}

/**
 * The working behind a check: what was compared, and what was found.
 *
 * @param checked - What came of checking.
 * @param design - How long the design is, for saying how much was covered.
 * @returns One working for the comparison and one for what it costs.
 */
export function verifyWorking(checked: Verification, design: { sequence: string }): Working[] {
  if (checked.problem !== null) return [];
  const count = (value: number): string => value.toLocaleString("en-US");
  const span = checked.covers;
  return [
    {
      of: "the comparison",
      comes: span === null ? "the read lines up nowhere on the design" : `${Math.round(checked.identity * 1000) / 10}% the same over ${count(span.bases)} bases`,
      kind: "exact",
      steps: [
        `the design is ${count(clean(design.sequence).length)} bases`,
        ...(checked.reversed ? ["the read was turned round to line up, which is only which end its primer sat at"] : ["the read lines up as it was given"]),
        ...(span === null ? [] : [`it covers ${count(span.from)}–${count(span.to)}, which is ${Math.round(checked.covered * 100)}% of the design`]),
        `${count(checked.differences.length)} ${checked.differences.length === 1 ? "place differs" : "places differ"}`,
        "what is outside that stretch was not read and is not checked",
      ],
    },
    {
      of: "what it costs",
      comes: checked.matches ? "nothing: it is the design over everything the read covers"
        : checked.changesProtein ? "a protein is changed" : "the differences leave the proteins alone",
      kind: "exact",
      steps: checked.differences.length === 0
        ? ["every base the read covers is the base the design has"]
        : checked.differences.slice(0, 8).map((one) => saysDifference(one)).concat(checked.differences.length > 8 ? [`and ${count(checked.differences.length - 8)} more`] : []),
    },
  ];
}

/**
 * A check as a run the lab would record.
 *
 * It uses up some of the tube that was sent and makes nothing. Whether it worked is whether the
 * read is the design, which is what the check says, so the outcome is not a separate judgement.
 *
 * @param checked - What came of checking.
 * @param choice - The tube that was sequenced, how much went, and what to say about it.
 * @returns What to hand to the lab's `recordRun`, or `null` if there is nothing to record.
 */
export function verifyRun(checked: Verification, choice: { tube: string; used?: number; primer?: string | null; note?: string | null }): Record<string, unknown> | null {
  if (checked.problem !== null || checked.covers === null) return null;
  return {
    kind: "sequencing", instrument: null,
    inputs: [{ item: choice.tube, amount: Math.max(0, Math.round(choice.used ?? 1)), role: "sequenced" }],
    outputs: [],
    settings: {
      covered: `${checked.covers.from}-${checked.covers.to}`,
      identity: Math.round(checked.identity * 1000) / 10,
      differences: checked.differences.length,
      ...(choice.primer === undefined || choice.primer === null || choice.primer.trim() === "" ? {} : { primer: choice.primer.trim() }),
    },
    outcome: checked.matches ? "worked" : "failed",
    note: choice.note ?? (checked.matches ? null : checked.differences.slice(0, 3).map(saysDifference).join("; ")),
  };
}
