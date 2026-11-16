/**
 * The working behind what the primer design tool says: each figure, with the steps that give it.
 *
 * A design is a handful of numbers — a melting temperature, a GC content, a length, a count of bases
 * that pair — and a choice made on them. All of it is worked out in the window from the lab's own
 * sequence, so all of it can be followed. The melting temperature here is the careful one, from
 * nearest-neighbour thermodynamics, and its working is the real sum: every neighbouring pair of
 * bases with what the table gives for it, the ends, the salt, and the one formula they go into.
 *
 * The sums are done again here, apart from the engine that chose the primers, and a working is only
 * given if it reaches the engine's figure. A step that did not would be worse than no step.
 */
import { DEFAULT_CONDITIONS, PRIMER_LIMITS, primerTm as engineTm, type PrimerLimits } from "@biolibs/pcr";
import { MeltingTempData } from "@biolibs/seqtools";
import type { Working } from "./pcr-working.js";
import { primerTm as wallaceTm } from "./pcr.js";
import { pairedStrands, type DesignedPrimer, type PairedStrands, type PrimerDesign, type ScoredCandidate } from "./primer-design.js";

const count = (value: number): string => value.toLocaleString("en-US");
const upper = (bases: string): string => bases.replace(/\s+/g, "").toUpperCase();
const PAIR: Readonly<Record<string, string>> = { A: "T", T: "A", G: "C", C: "G" };
/** A number with its sign written as a true minus, as arithmetic is written. */
const signed = (value: number, places: number): string => `${value < 0 ? "−" : ""}${Math.abs(value).toFixed(places)}`;

/** The gas constant the nearest-neighbour formula uses, in cal/(mol·K). */
export const GAS_CONSTANT = 1.987;

/** One kind of neighbouring pair in a primer, and what the table gives for it. */
export interface NeighbourTerm {
  /** The two bases, read 5′ to 3′, and the two they face. `GA/CT` is GA over CT. */
  pair: string;
  /** How many times it occurs in the primer. */
  times: number;
  /** For one of them: the heat given off on pairing, in kcal/mol, and the order lost, in cal/(mol·K). */
  dH: number;
  dS: number;
}

/** Every term of a nearest-neighbour melting temperature. */
export interface TmTerms {
  /** Each kind of neighbouring pair, in the order first met. */
  pairs: NeighbourTerm[];
  /** How many of the primer's two end bases are A or T, and how many G or C, with what each adds. */
  ends: { at: number; gc: number; dH: number; dS: number };
  /** What the salt adds to the order lost: 0.368 × (bases − 1) × ln[Na⁺]. */
  salt: number;
  /** The sodium, in mol/L, and the primer, in mol/L, that the sum is for. */
  sodium: number;
  primer: number;
  /** The sums: heat in kcal/mol, and order in cal/(mol·K) with the salt included. */
  dH: number;
  dS: number;
  /** R × ln of the strand concentration: the last term under the line. */
  strands: number;
  /** What it comes to, in °C. */
  tm: number;
}

/**
 * A primer's melting temperature by nearest-neighbour thermodynamics, with every term kept.
 *
 * This is SantaLucia's 1998 table with his salt correction, which is what `@biolibs/pcr` uses
 * through Biopython's `Tm_NN`. It is summed again here so that the terms can be shown.
 *
 * @param sequence - The primer, 5′ to 3′: A, C, G and T only.
 * @param conditions - Sodium in mM and primer in nM. 50 and 250 unless said.
 * @returns The terms and the temperature, or `null` if that is not a sequence the table covers.
 */
export function nearestNeighbourTm(sequence: string, conditions: { sodium?: number; primer?: number } = {}): TmTerms | null {
  const bases = upper(sequence);
  if (bases.length < 2 || !/^[ACGT]+$/.test(bases)) return null;
  const table = MeltingTempData.dnaNn3;
  const sodium = (conditions.sodium ?? DEFAULT_CONDITIONS.sodium) / 1000;
  // Both strands are taken to be the primer's concentration, as the engine does: c − c/2.
  const nanomolar = conditions.primer ?? DEFAULT_CONDITIONS.primer;
  const primer = (nanomolar - nanomolar / 2) * 1e-9;
  const pairs: NeighbourTerm[] = [];
  for (let at = 0; at < bases.length - 1; at++) {
    const two = bases.slice(at, at + 2);
    const pair = `${two}/${PAIR[two[0]!]}${PAIR[two[1]!]}`;
    // The table lists each pair once; the same pair read from the other strand is written backwards.
    const listed = table[pair] !== undefined ? pair : [...pair].reverse().join("");
    const found = table[listed];
    if (found === undefined) return null;
    const had = pairs.find((one) => one.pair === listed);
    if (had === undefined) pairs.push({ pair: listed, times: 1, dH: found[0], dS: found[1] }); else had.times++;
  }
  const endBases = bases[0]! + bases.at(-1)!;
  const at = [...endBases].filter((base) => base === "A" || base === "T").length;
  const gc = 2 - at;
  const [endAT, endGC] = [table["init_A/T"]!, table["init_G/C"]!];
  const ends = { at, gc, dH: at * endAT[0] + gc * endGC[0], dS: at * endAT[1] + gc * endGC[1] };
  const salt = 0.368 * (bases.length - 1) * Math.log(sodium);
  const dH = pairs.reduce((sum, one) => sum + one.times * one.dH, 0) + ends.dH;
  const dS = pairs.reduce((sum, one) => sum + one.times * one.dS, 0) + ends.dS + salt;
  const strands = GAS_CONSTANT * Math.log(primer);
  return { pairs, ends, salt, sodium, primer, dH, dS, strands, tm: (1000 * dH) / (dS + strands) - 273.15 };
}

/** A melting temperature's working, with its terms for a table. */
export interface TmWorking extends Working {
  terms: TmTerms;
}

/**
 * A primer's melting temperature, with the sum behind it.
 *
 * @param name - What the primer is called.
 * @param sequence - Its bases.
 * @returns The working, or `null` if the sum done here does not reach the engine's figure.
 *
 * @example
 * ```ts
 * import { primerTmWorking } from "@biolibs/bionet-tools";
 *
 * primerTmWorking("fwd", "GGATCACAGTCTACACTGCT")?.comes;    // "55.6 °C"
 * ```
 */
export function primerTmWorking(name: string, sequence: string): TmWorking | null {
  const bases = upper(sequence);
  const terms = nearestNeighbourTm(bases);
  if (terms === null) return null;
  let engine: number;
  try { engine = engineTm(bases); } catch { return null; }
  if (Math.abs(engine - terms.tm) > 0.005) return null;
  const pairsH = terms.pairs.reduce((sum, one) => sum + one.times * one.dH, 0);
  const pairsS = terms.pairs.reduce((sum, one) => sum + one.times * one.dS, 0);
  const wallace = wallaceTm(bases);
  const endWords = [terms.ends.at > 0 ? `${terms.ends.at} A or T` : "", terms.ends.gc > 0 ? `${terms.ends.gc} G or C` : ""].filter(Boolean).join(" and ");
  return {
    of: `${name}'s melting temperature`, comes: `${terms.tm.toFixed(1)} °C`, kind: "estimate", terms,
    steps: [
      `Its ${count(bases.length)} bases make ${count(bases.length - 1)} neighbouring pairs. Each kind gives off a known heat on pairing (ΔH) and loses a known amount of order (ΔS). Added up, as in the table below: ΔH = ${signed(pairsH, 1)} kcal/mol and ΔS = ${signed(pairsS, 1)} cal/(mol·K).`,
      `Its two end bases are ${endWords}, which add ${signed(terms.ends.dH, 1)} and ${signed(terms.ends.dS, 1)}: ΔH = ${signed(terms.dH, 1)}, ΔS = ${signed(pairsS + terms.ends.dS, 1)}.`,
      `Salt steadies the pairing. With ${terms.sodium * 1000} mM sodium, 0.368 × ${bases.length - 1} × ln(${terms.sodium}) = ${signed(terms.salt, 2)} is added to ΔS, making ${signed(terms.dS, 2)}.`,
      `Half the primer is paired at the melting temperature. With ${(terms.primer * 1e9).toFixed(0)} nM of strands free to pair, ${GAS_CONSTANT} × ln(${(terms.primer * 1e9).toFixed(0)} × 10⁻⁹) = ${signed(terms.strands, 2)}.`,
      `1,000 × ${signed(terms.dH, 1)} ÷ (${signed(terms.dS, 2)} + ${signed(terms.strands, 2)}) − 273.15 = ${terms.tm.toFixed(1)} °C.`,
    ],
    rests: "Nearest-neighbour thermodynamics, with SantaLucia's 1998 table and salt correction, at 50 mM sodium and 250 nM primer. It is the careful estimate, good to a degree or two; magnesium and the polymerase's own buffer move it."
      + (wallace === null ? "" : ` The quick rule the PCR tool writes beside a tube, 2 °C for each A or T and 4 °C for each G or C, gives ${Math.round(wallace)} °C for this primer. The two are different rules and are not expected to agree.`),
  };
}

/**
 * A primer's GC content, as the count over the length.
 *
 * @param name - What the primer is called.
 * @param sequence - Its bases.
 * @returns The working.
 */
export function gcWorking(name: string, sequence: string): Working {
  const bases = upper(sequence);
  const g = [...bases].filter((base) => base === "G").length;
  const c = [...bases].filter((base) => base === "C").length;
  const fraction = bases.length === 0 ? 0 : (g + c) / bases.length;
  return {
    of: `${name}'s GC content`, comes: `${(fraction * 100).toFixed(0)}%`, kind: "exact",
    steps: [
      `Of its ${count(bases.length)} bases, ${g} are G and ${c} are C: ${g} + ${c} = ${g + c}.`,
      `${g + c} ÷ ${bases.length} = ${fraction.toFixed(3)}, which is ${(fraction * 100).toFixed(0)}%.`,
    ],
  };
}

/**
 * How long the product is, as the subtraction of its two ends.
 *
 * @param design - The design.
 * @param template - How long the template is.
 * @param made - How long the PCR engine's product is from these primers, to compare with.
 * @returns The working.
 */
export function productWorking(design: PrimerDesign, template: { length: number }, made?: number): Working {
  const { start, end } = design.stretch;
  const steps = [
    design.wraps
      ? `The template is a circle and the stretch runs through its origin: from base ${count(start + 1)} to the end is ${count(template.length)} − ${count(start)} = ${count(template.length - start)}, and from the start to base ${count(end)} is ${count(end)}, so ${count(template.length - start)} + ${count(end)} = ${count(design.length)}.`
      : `The forward primer's first base is base ${count(start + 1)} and the reverse primer's first base pairs with base ${count(end)}: ${count(end)} − ${count(start + 1)} + 1 = ${count(design.length)}.`,
    "Both primers lie inside the stretch and neither carries a tail, so nothing is added at either end.",
    ...(made === undefined ? [] : [made === design.length ? `The PCR engine, given this template and these two primers and working it out its own way, also makes ${count(made)} bp.` : `The PCR engine, given this template and these two primers, makes ${count(made)} bp, which does not agree. Trust neither until that is understood.`]),
  ];
  return { of: "the product's length", comes: `${count(design.length)} bp`, kind: "exact", steps };
}

/** Bases that pair with each other, with the two strands laid out so that it can be drawn. */
export interface PairedWorking extends Working {
  /** The strands as they pair. */
  paired: PairedStrands;
  /** How many pair in the longest run, and in the longest run that reaches a 3′ end. */
  longest: number;
  atEnd: number;
}

/** The bases of a run on each strand, as written: the upper 5′ to 3′ and the lower 3′ to 5′. */
function runBases(paired: PairedStrands, shift: number, from: number, length: number): [string, string] {
  return [paired.upper.slice(from, from + length), paired.lower.slice(from - shift, from - shift + length)];
}

/**
 * How much of a primer pairs with itself, with the bases written out.
 *
 * @param name - What the primer is called.
 * @param sequence - Its bases.
 * @param limits - How many in a row draw a warning.
 * @returns The working, and the two copies laid out as they pair.
 */
export function selfWorking(name: string, sequence: string, limits: PrimerLimits = PRIMER_LIMITS): PairedWorking {
  const paired = pairedStrands(sequence, sequence);
  const [over, under] = runBases(paired, paired.shift, paired.from, paired.length);
  const [endOver, endUnder] = runBases(paired, paired.endShift, paired.endFrom, paired.endLength);
  return {
    of: `how much of ${name} pairs with itself`, comes: `${paired.length} in a row, ${paired.endLength} at its 3′ end`, kind: "exact", paired,
    longest: paired.length, atEnd: paired.endLength,
    steps: [
      "Write the primer 5′ to 3′, and under it a second copy running the other way. Slide one along the other, and at each place count the bases that pair in a row: A with T, G with C.",
      paired.length === 0 ? "Nowhere do any pair." : `The longest run is ${paired.length}: ${over} over ${under}. ${paired.length > limits.maxSelfComplement ? `More than ${limits.maxSelfComplement} is enough to hold two copies together, or to fold one back on itself.` : `Up to ${limits.maxSelfComplement} is not held to matter.`}`,
      paired.endLength === 0 ? "No run takes in the 3′ end." : `The longest run that takes in the 3′ end is ${paired.endLength}: ${endOver} over ${endUnder}. ${paired.endLength > limits.maxEndSelfComplement ? `More than ${limits.maxEndSelfComplement} there gives the polymerase a paired end to extend, which uses the primer up.` : `Up to ${limits.maxEndSelfComplement} there is not held to matter.`}`,
    ],
    rests: "This counts bases that could pair. It is not a folding energy, so it says a hairpin or a dimer is possible, not that it will form.",
  };
}

/**
 * How much of the two primers pair with each other, with the bases written out.
 *
 * @param design - The design.
 * @param names - What the two primers are called.
 * @param limits - How many in a row draw a warning.
 * @returns The working, and the two primers laid out as they pair.
 */
export function crossWorking(design: PrimerDesign, names: { forward: string; reverse: string }, limits: PrimerLimits = PRIMER_LIMITS): PairedWorking {
  const paired = pairedStrands(design.forward.chosen.report.sequence, design.reverse.chosen.report.sequence);
  const [over, under] = runBases(paired, paired.shift, paired.from, paired.length);
  const [endOver, endUnder] = runBases(paired, paired.endShift, paired.endFrom, paired.endLength);
  return {
    of: "how much the two primers pair with each other", comes: `${paired.length} in a row, ${paired.endLength} at a 3′ end`, kind: "exact", paired,
    longest: paired.length, atEnd: paired.endLength,
    steps: [
      `Write ${names.forward} 5′ to 3′ and ${names.reverse} under it running the other way. Slide one along the other, and at each place count the bases that pair in a row.`,
      paired.length === 0 ? "Nowhere do any pair." : `The longest run is ${paired.length}: ${over} over ${under}. ${paired.length > limits.maxSelfComplement ? `More than ${limits.maxSelfComplement} ties some of each primer up.` : `Up to ${limits.maxSelfComplement} is not held to matter.`}`,
      paired.endLength === 0 ? "No run takes in either 3′ end." : `The longest run that takes in a 3′ end is ${paired.endLength}: ${endOver} over ${endUnder}. ${paired.endLength > limits.maxEndSelfComplement ? `More than ${limits.maxEndSelfComplement} there can be extended into a primer dimer.` : `Up to ${limits.maxEndSelfComplement} there is not held to matter.`}`,
    ],
    rests: "This counts bases that could pair. It is not a folding energy, so it says a primer dimer is possible, not that it will form.",
  };
}

/**
 * How far apart the two primers' melting temperatures are.
 *
 * @param design - The design.
 * @param names - What the two primers are called.
 * @returns The working.
 */
export function tmApartWorking(design: PrimerDesign, names: { forward: string; reverse: string }): Working {
  const [f, r] = [design.forward.chosen.report.tm, design.reverse.chosen.report.tm];
  const [high, low] = f >= r ? [f, r] : [r, f];
  return {
    of: "how far apart the two melting temperatures are", comes: `${design.tmApart.toFixed(1)} °C`, kind: "estimate",
    steps: [
      `${names.forward} melts at ${f.toFixed(1)} °C and ${names.reverse} at ${r.toFixed(1)} °C.`,
      `${high.toFixed(1)} − ${low.toFixed(1)} = ${design.tmApart.toFixed(1)} °C.`,
    ],
    rests: "Both primers have to bind at one annealing temperature. Within about 3 °C is comfortable and past 5 °C one of them binds poorly or the other binds where it should not. The figure is the difference of two estimates.",
  };
}

/**
 * The score that ranked one candidate, term by term.
 *
 * @param end - Which primer it is a candidate for.
 * @param candidate - The candidate.
 * @param targetTm - The melting temperature aimed for.
 * @param limits - The band GC content should be in.
 * @returns The working.
 */
export function scoreWorking(end: Pick<DesignedPrimer, "which">, candidate: ScoredCandidate, targetTm: number, limits: PrimerLimits = PRIMER_LIMITS): Working {
  const { report } = candidate;
  const middle = (limits.minGc + limits.maxGc) / 2;
  return {
    of: `the score of the ${end.which} primer at ${report.length} bases`, comes: candidate.score.toFixed(2), kind: "estimate",
    steps: [
      `How far its melting temperature is from the ${targetTm} °C aimed for: |${report.tm.toFixed(2)} − ${targetTm}| = ${candidate.offTarget.toFixed(2)}.`,
      report.gcClamp ? `Its 3′ end is ${report.sequence.at(-1)}, a G or C: nothing added.` : `Its 3′ end is ${report.sequence.at(-1)}, not a G or C: 2 added.`,
      `How far its GC content is from the middle of ${(limits.minGc * 100).toFixed(0)} to ${(limits.maxGc * 100).toFixed(0)}%, doubled: 2 × |${report.gc.toFixed(3)} − ${middle.toFixed(1)}| = ${candidate.gc.toFixed(2)}.`,
      `${candidate.offTarget.toFixed(2)} + ${candidate.clamp} + ${candidate.gc.toFixed(2)} = ${candidate.score.toFixed(2)}. The lowest score is chosen, and of two the same, the shorter.`,
    ],
    rests: "The score is a convention: melting temperature first, since a pair that does not anneal together does not work at all, then the 3′ end, then GC content. Another designer would weigh them differently, which is why every candidate is shown.",
  };
}
