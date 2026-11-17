/**
 * The protein a gene codes for, and what can be said about it.
 *
 * A lab that keeps only DNA stops one step short of what it is for. The point of putting a casein
 * gene into yeast is the casein, and until the protein is a thing the lab holds there is nowhere
 * to record that it came out, how much there is, or where the tube went.
 *
 * None of the numbers here are asserted. The molecular weight, the isoelectric point and the rest
 * come from `ProteinAnalysis` in `@biolibs/seqtools`, which is a port of Biopython's ProtParam and
 * is tested against it. What is here is the translating, the cutting of a signal peptide, and
 * saying where each figure came from.
 */
import type { PartFeature, PartState } from "@biolibs/bionet";
import { translate } from "@biolibs/seq";
import { ProteinAnalysis } from "@biolibs/seqtools";
import { CODON } from "./codons.js";
import type { Working } from "./pcr-working.js";

/** What a gene was translated into. */
export interface Translated {
  /** The amino acids, with no stop. */
  protein: string;
  /** How many amino acids. */
  length: number;
  /** The stretch of the gene it came from, counting from 1, and which strand. */
  from: { start: number; end: number; strand: 1 | -1 };
  /** The signal peptide that was cut off, if one was. */
  signal: { peptide: string; label: string } | null;
  /** Whether the gene ended in a stop codon, which a coding sequence should. */
  stopped: boolean;
  /** Anything a careful person would look at. */
  warnings: string[];
  /** Why it could not be translated, or `null`. */
  problem: string | null;
}

/** What is known about a protein, from its sequence alone. */
export interface ProteinFacts {
  /** How many amino acids. */
  length: number;
  /** In daltons. */
  weight: number;
  /** The pH at which it carries no net charge. */
  isoelectric: number;
  /** How strongly it absorbs at 280 nm, with and without the cystines paired. */
  extinction: { reduced: number; cystines: number };
  /** Above 40 a protein is reckoned unstable in a test tube. */
  instability: number;
  /** How water-fearing it is on average: positive is water-fearing. */
  gravy: number;
  /** What fraction is each of helix, turn and sheet. */
  structure: { helix: number; turn: number; sheet: number };
}

const clean = (bases: string): string => bases.replace(/\s+/g, "").toUpperCase();
const PAIR: Readonly<Record<string, string>> = { A: "T", T: "A", G: "C", C: "G", N: "N" };
const flip = (bases: string): string => [...bases].reverse().map((one) => PAIR[one] ?? "N").join("");

/**
 * Translate a gene, or the coding sequence marked on it, into the protein it makes.
 *
 * @param part - The gene: its bases and what is marked on it.
 * @param options - `cds` names a coding sequence marked on the part to translate, in place of the
 *   whole of it; `cutSignal` cuts off a signal peptide marked inside that stretch, which is what
 *   the mature protein is.
 * @returns The protein, and where it came from.
 *
 * @example
 * ```ts
 * import { translateGene } from "@biolibs/bionet-tools";
 *
 * const made = translateGene(gene, { cds: "casein", cutSignal: true });
 * made.protein;    // the mature protein, with the signal peptide gone
 * ```
 */
export function translateGene(part: Pick<PartState, "sequence" | "features" | "circular">,
                              options: { cds?: string; cutSignal?: boolean } = {}): Translated {
  const nothing = (problem: string): Translated =>
    ({ protein: "", length: 0, from: { start: 1, end: 0, strand: 1 }, signal: null, stopped: false, warnings: [], problem });
  const bases = clean(part.sequence);
  if (!/^[ACGT]+$/.test(bases)) return nothing("A gene to translate is written in A, C, G and T, with no uncertain bases.");

  const named = options.cds === undefined ? undefined
    : part.features.find((one) => one.label === options.cds && /^cds$/i.test(one.type))
      ?? part.features.find((one) => one.label === options.cds);
  if (options.cds !== undefined && named === undefined) return nothing(`Nothing called ${JSON.stringify(options.cds)} is marked on this part.`);
  if (named !== undefined && named.parts.length > 1) return nothing(`${named.label} is marked in ${named.parts.length} pieces, which this does not translate.`);
  const piece = named?.parts[0] ?? { start: 0, end: bases.length };
  const strand: 1 | -1 = named?.strand === -1 ? -1 : 1;
  const stretch = bases.slice(piece.start, piece.end);
  const coding = strand === -1 ? flip(stretch) : stretch;
  if (coding.length < CODON) return nothing("That stretch is shorter than one codon.");

  const warnings: string[] = [];
  if (coding.length % CODON !== 0) warnings.push(`The stretch is ${coding.length} bases, which is not a whole number of codons, so the last ${coding.length % CODON} were left out.`);
  const whole = coding.slice(0, coding.length - (coding.length % CODON));
  const read = String(translate(whole));
  const stopped = read.endsWith("*");
  let protein = stopped ? read.slice(0, -1) : read;
  if (!stopped) warnings.push("The stretch does not end in a stop codon, so it may not be the whole coding sequence.");
  if (!protein.startsWith("M")) warnings.push("It does not begin with methionine, which a coding sequence usually does.");
  const inside = protein.indexOf("*");
  if (inside >= 0) {
    warnings.push(`There is a stop at amino acid ${inside + 1}, before the end, so this reading frame is wrong or the gene is broken.`);
  }

  // The signal peptide is the first stretch of a secreted protein, and is cut off on the way out:
  // what the lab ends up with is what is left, so it is worth being able to ask for that.
  let signal: Translated["signal"] = null;
  if (options.cutSignal === true) {
    const marked = part.features.find((one) => /^sig[_ ]?peptide$/i.test(one.type) && one.parts[0] !== undefined
      && one.parts[0].start >= piece.start && one.parts[0].end <= piece.end);
    if (marked === undefined) warnings.push("No signal peptide is marked on this part, so nothing was cut off.");
    else {
      const first = marked.parts[0]!;
      const from = strand === -1 ? Math.floor((piece.end - first.end) / CODON) : Math.floor((first.start - piece.start) / CODON);
      const many = Math.floor((first.end - first.start) / CODON);
      if (from !== 0) warnings.push(`${marked.label} is marked from amino acid ${from + 1}, not from the start, so it was not cut off.`);
      else {
        signal = { peptide: protein.slice(0, many), label: marked.label };
        protein = protein.slice(many);
      }
    }
  }
  return {
    protein, length: protein.length,
    from: { start: piece.start + 1, end: piece.end, strand },
    signal, stopped, warnings, problem: null,
  };
}

/**
 * What can be said about a protein from its sequence.
 *
 * @param protein - The amino acids.
 * @returns The figures, or `null` if that is not a protein of standard amino acids.
 *
 * @example
 * ```ts
 * import { proteinFacts } from "@biolibs/bionet-tools";
 *
 * proteinFacts("MKVLILACLVALALAR")?.isoelectric;    // the pH it carries no net charge at
 * ```
 */
export function proteinFacts(protein: string): ProteinFacts | null {
  const amino = clean(protein);
  if (!/^[ACDEFGHIKLMNPQRSTVWY]+$/.test(amino)) return null;
  try {
    const analysis = new ProteinAnalysis(amino);
    const [reduced, cystines] = analysis.molarExtinctionCoefficient();
    const [helix, turn, sheet] = analysis.secondaryStructureFraction();
    return {
      length: amino.length,
      weight: analysis.molecularWeight(),
      isoelectric: analysis.isoelectricPoint(),
      extinction: { reduced, cystines },
      instability: analysis.instabilityIndex(),
      gravy: analysis.gravy(),
      structure: { helix, turn, sheet },
    };
  } catch {
    return null;
  }
}

/**
 * The working behind a translation: what was read, and where each figure came from.
 *
 * @param made - What the gene was translated into.
 * @param facts - What is known about the protein, if it could be worked out.
 * @returns One working for the translation and one for the figures.
 */
export function proteinWorking(made: Translated, facts: ProteinFacts | null): Working[] {
  if (made.problem !== null) return [];
  const count = (value: number): string => value.toLocaleString("en-US");
  const out: Working[] = [{
    of: "the protein",
    comes: `${count(made.length)} amino acids`,
    kind: "exact",
    steps: [
      `read from bases ${count(made.from.start)}–${count(made.from.end)}${made.from.strand === -1 ? ", on the bottom strand" : ""}`,
      `${count(made.from.end - made.from.start + 1)} bases is ${count(Math.floor((made.from.end - made.from.start + 1) / CODON))} codons`,
      made.stopped ? "the last codon is a stop, which is not an amino acid" : "there is no stop codon at the end",
      ...(made.signal === null ? [] : [`${made.signal.label}, the first ${made.signal.peptide.length} amino acids, was cut off: it is gone from what the cell lets out`]),
      `it begins ${made.protein.slice(0, 24)}${made.protein.length > 24 ? "…" : ""}`,
    ],
  }];
  if (facts !== null) {
    out.push({
      of: "what is known of it",
      comes: `${count(Math.round(facts.weight))} Da, carrying no net charge at pH ${facts.isoelectric.toFixed(2)}`,
      kind: "estimate",
      steps: [
        `the weight is the amino acids added up, less a water for each bond: ${count(Math.round(facts.weight))} Da`,
        `the isoelectric point is where its charges cancel: pH ${facts.isoelectric.toFixed(2)}`,
        `it absorbs at 280 nm with ${count(facts.extinction.reduced)} M⁻¹cm⁻¹, which is how a concentration is read off`,
        `the instability index is ${facts.instability.toFixed(1)}; over 40 is reckoned unstable in a tube`,
        `${Math.round(facts.structure.helix * 100)}% helix, ${Math.round(facts.structure.turn * 100)}% turn, ${Math.round(facts.structure.sheet * 100)}% sheet`,
      ],
      rests: "These come from scales measured on other proteins and applied to this sequence. They are what the sequence suggests, not what anybody has measured of this protein.",
    });
  }
  return out;
}
