/**
 * What counts as a primer, and the two things every report needs: its melting temperature and its GC content.
 *
 * A primer is unambiguous DNA — A, C, G and T only. Ambiguity codes and gaps are rejected rather than guessed at,
 * because a primer with an N in it has no single melting temperature and no single binding site.
 *
 * The melting temperature comes from `@biolibs/seqtools`, which is Biopython's `MeltingTemp` ported in full, so
 * this package carries no thermodynamic tables of its own and any method or salt correction Biopython offers can be
 * passed straight through.
 */

import { ValueError } from "@biolibs/core";
import { tmNN } from "@biolibs/seqtools";

/** Unambiguous DNA, the only thing accepted as a primer. */
const BASES = /^[ACGT]+$/;

/** Shortest primer that has a meaningful melting temperature and a specific binding site. */
export const MIN_PRIMER_LENGTH = 8;

/** Longest primer accepted, generous enough for an assembly primer carrying a long tail. */
export const MAX_PRIMER_LENGTH = 200;

/**
 * Tidy up a typed or pasted primer: upper case, U read as T, and spaces, line breaks and numbers dropped.
 *
 * Numbers and whitespace are dropped because sequences are so often pasted with position numbers and line breaks
 * from a GenBank file or a web page. Anything else is left alone, so {@link isPrimer} can report it.
 *
 * @param text - The text as typed.
 * @returns The cleaned sequence.
 * @example
 * ```ts
 * cleanPrimer("  1 gtaaa acgac ggccagt  "); // "GTAAAACGACGGCCAGT"
 * ```
 */
export const cleanPrimer = (text: string): string => text.toUpperCase().replace(/U/g, "T").replace(/[\s\d]/g, "");

/**
 * Whether a string is usable as a primer: unambiguous DNA of a sensible length.
 *
 * @param sequence - A cleaned sequence, as {@link cleanPrimer} gives it.
 * @returns `true` when it is A, C, G and T only and between {@link MIN_PRIMER_LENGTH} and
 *   {@link MAX_PRIMER_LENGTH} bases long.
 */
export const isPrimer = (sequence: string): boolean =>
  BASES.test(sequence) && sequence.length >= MIN_PRIMER_LENGTH && sequence.length <= MAX_PRIMER_LENGTH;

/**
 * Check a primer and say why it is unusable, for an error message.
 *
 * @param sequence - A cleaned sequence.
 * @returns `null` when the primer is fine, otherwise the reason in a sentence.
 * @example
 * ```ts
 * primerProblem("ACGTN");  // "a primer may only contain A, C, G and T; found N"
 * primerProblem("ACGT");   // "a primer must be at least 8 bases long, and this one is 4"
 * ```
 */
export function primerProblem(sequence: string): string | null {
  if (sequence === "") return "a primer may not be empty";
  const bad = [...new Set([...sequence].filter((ch) => !"ACGT".includes(ch)))];
  if (bad.length > 0) return `a primer may only contain A, C, G and T; found ${bad.join(", ")}`;
  if (sequence.length < MIN_PRIMER_LENGTH) return `a primer must be at least ${MIN_PRIMER_LENGTH} bases long, and this one is ${sequence.length}`;
  if (sequence.length > MAX_PRIMER_LENGTH) return `a primer must be at most ${MAX_PRIMER_LENGTH} bases long, and this one is ${sequence.length}`;
  return null;
}

/**
 * Throw unless a sequence is a usable primer, with {@link primerProblem}'s reason in the message.
 *
 * @param sequence - A cleaned sequence.
 * @param label - What to call it in the message, e.g. `"forward primer"`.
 * @throws {@link ValueError} if the primer is not usable.
 */
export function requirePrimer(sequence: string, label = "primer"): void {
  const problem = primerProblem(sequence);
  if (problem) throw new ValueError(`${label}: ${problem}`);
}

/** The reaction conditions a melting temperature depends on. */
export interface Conditions {
  /** Monovalent sodium in mM. Defaults to 50, the usual PCR buffer. */
  sodium?: number;
  /** Potassium in mM. Defaults to 0. */
  potassium?: number;
  /** Tris buffer in mM. Defaults to 0. */
  tris?: number;
  /** Magnesium in mM. Defaults to 0; a typical PCR runs at 1.5 to 2. */
  magnesium?: number;
  /** Total dNTPs in mM. Defaults to 0. */
  dntps?: number;
  /** Primer concentration in nM. Defaults to 250. */
  primer?: number;
  /** Salt correction method, as Biopython's `MeltingTemp` numbers them (0 to 7). Defaults to 5 (Owczarzy 2004). */
  saltCorrection?: number;
}

/** The conditions used when none are given: 50 mM sodium, 250 nM primer, Owczarzy 2004 salt correction. */
export const DEFAULT_CONDITIONS: Required<Conditions> = {
  sodium: 50, potassium: 0, tris: 0, magnesium: 0, dntps: 0, primer: 250, saltCorrection: 5,
};

/**
 * The melting temperature of a primer against its exact complement, by nearest-neighbour thermodynamics.
 *
 * This is a thin wrapper over `tmNN` from `@biolibs/seqtools` (SantaLucia 1998 by default, with the salt correction
 * named in `conditions`), spelled in the terms a PCR caller thinks in.
 *
 * @param primer - A cleaned primer sequence.
 * @param conditions - Reaction conditions; see {@link DEFAULT_CONDITIONS}.
 * @returns The melting temperature in °C.
 * @throws {@link ValueError} if the primer is not usable.
 * @example
 * ```ts
 * primerTm("GTAAAACGACGGCCAGT").toFixed(1); // "52.8"
 * ```
 */
export function primerTm(primer: string, conditions: Conditions = {}): number {
  requirePrimer(primer);
  const c = { ...DEFAULT_CONDITIONS, ...conditions };
  // tmNN takes both strand concentrations; for a primer in vast excess over its template the primer sets the pace.
  return tmNN(
    primer, true, true, null, 0, null, null, null, null,
    c.primer, c.primer, false, c.sodium, c.potassium, c.tris, c.magnesium, c.dntps, c.saltCorrection,
  );
}

/**
 * The fraction of a primer that is G or C.
 *
 * @param primer - A cleaned primer sequence.
 * @returns A value from 0 to 1. An empty sequence gives 0.
 */
export function gcFractionOf(primer: string): number {
  if (primer.length === 0) return 0;
  let gc = 0;
  for (const ch of primer) if (ch === "G" || ch === "C") gc++;
  return gc / primer.length;
}

/**
 * The reverse complement of unambiguous DNA.
 *
 * @param dna - Upper-case A, C, G, T. Any other character is left in place, reversed but not complemented, which
 *   keeps the length right for callers that have already validated their input.
 * @returns The reverse complement.
 */
export function reverseComplement(dna: string): string {
  const complement: Record<string, string> = { A: "T", T: "A", G: "C", C: "G" };
  let result = "";
  for (let i = dna.length - 1; i >= 0; i--) result += complement[dna[i]!] ?? dna[i]!;
  return result;
}
