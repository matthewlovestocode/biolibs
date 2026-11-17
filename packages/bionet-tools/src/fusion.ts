/**
 * Putting a promoter, a signal, a gene and a tag together into one coding sequence, and checking
 * that the frame survives it.
 *
 * `assembly-design.ts` is about the *molecules*: which pieces go round a ring and what primers make
 * them fit. This is about the *protein*, and it is a different question with a different way of
 * going wrong. A ring can be built perfectly and give nothing worth having, because what was joined
 * does not read as one chain: a piece whose length is not a whole number of codons shifts
 * everything after it, and the cell reads a different protein with no complaint from anybody. The
 * gel shows a band, the sequencing matches the design, and the design was wrong.
 *
 * That failure is silent, common, and entirely computable, which is the case for doing it here.
 *
 * Three things are checked that nothing else here checks.
 *
 * **The frame at every junction.** Each translated piece is counted, and a junction is in frame
 * only if everything before it comes to a whole number of codons. A piece that is 20 bases long
 * rather than 21 is named, with what it does to everything after it.
 *
 * **A stop where no stop belongs.** The whole thing is translated and read: a stop codon anywhere
 * but the end means the chain finishes early, and that is usually a frame that shifted a piece or
 * two before it.
 *
 * **Where the signal peptide is.** A signal only works at the very beginning of the chain. Putting
 * a tag in front of one is a mistake people make because the tag belongs at the N-terminus and so
 * does the signal, and only one of them can be: the protein is made, and stays inside the cell.
 */
import type { PartFeature, PartState } from "@biolibs/bionet";
import { translate } from "@biolibs/seq";
import { CODON } from "./codons.js";
import type { Working } from "./pcr-working.js";
import type { ToolLab } from "./run.js";

/** What a piece of a fusion is there to do. */
export const ROLES = ["promoter", "signal", "coding", "tag", "linker", "terminator", "other"] as const;

/** One of them. */
export type Role = (typeof ROLES)[number];

/** Which roles are part of the protein, and so have to keep the frame. */
const TRANSLATED = new Set<Role>(["signal", "coding", "tag", "linker"]);

/** One piece to put in, in the order it goes. */
export interface FusionPiece {
  /** The part, by checksum, where it is one the lab holds. */
  part?: string;
  /** Its bases, where they are given outright: a short linker nobody keeps a tube of. */
  sequence?: string;
  /** What to call it. */
  name?: string;
  /** What it is there to do. */
  as: Role;
}

/** One place two pieces meet. */
export interface Junction {
  /** What is before it and what is after. */
  after: string;
  before: string;
  /** Where it falls, counting bases from 1. */
  at: number;
  /** Whether everything translated before it comes to a whole number of codons. */
  inFrame: boolean;
  /** What it does, said for a person. */
  says: string;
}

/** Something a careful person would stop and ask about a fusion before building it. */
export interface FusionCheck {
  /** `stop` if it will not do what is wanted, `look` if it is only worth a second glance. */
  weight: "stop" | "look";
  /** What to say. */
  says: string;
  /** The short reason, to put beside it. */
  because: string;
}

/** A fusion, designed. */
export interface Fusion {
  /** What to call it. */
  name: string;
  /** The whole thing, promoter and terminator included. */
  sequence: string;
  /** What is marked on it: each piece, where it ended up. */
  features: PartFeature[];
  /** Where the translated stretch lies, counting from 1, or `null` if nothing is translated. */
  coding: { from: number; to: number } | null;
  /** What it would be read as, with no stop. */
  protein: string;
  /** What is left once a signal peptide at the start is cut off, which is what a lab collects. */
  mature: string | null;
  /** Every place two pieces meet. */
  junctions: Junction[];
  /** What a careful person would ask, the ones worth stopping for first. */
  checks: FusionCheck[];
  /** Why there is nothing to look at, or `null` if there is. */
  problem: string | null;
}

const clean = (bases: string): string => bases.replace(/\s+/g, "").toUpperCase();

/**
 * Put the pieces together and read what comes out.
 *
 * @param lab - The lab, for the parts it holds.
 * @param choice - The pieces in order, and what to call the result.
 * @returns The fusion, with its junctions and everything worth asking about it.
 *
 * @example
 * ```ts
 * import { designFusion } from "@biolibs/bionet-tools";
 *
 * const made = designFusion(lab, { pieces: [
 *   { part: aox1, as: "promoter" }, { part: alphaFactor, as: "signal" },
 *   { part: casein, as: "coding" }, { sequence: "CACCACCACCACCACCAC", name: "His6", as: "tag" },
 * ] });
 * made.checks.filter((one) => one.weight === "stop");
 * ```
 */
export function designFusion(lab: Pick<ToolLab, "parts">, choice: { pieces: readonly FusionPiece[]; name?: string }): Fusion {
  const nothing = (problem: string): Fusion =>
    ({ name: choice.name?.trim() || "a fusion", sequence: "", features: [], coding: null, protein: "", mature: null, junctions: [], checks: [], problem });
  if (choice.pieces.length === 0) return nothing("A fusion is made of pieces, and none were given.");

  /** Each piece with its bases, whatever it was named by. */
  const pieces: { name: string; bases: string; as: Role }[] = [];
  for (const piece of choice.pieces) {
    const held: PartState | undefined = piece.part === undefined ? undefined : lab.parts.find((one) => one.checksum === piece.part);
    if (piece.part !== undefined && held === undefined) return nothing("A piece names a part the lab does not have.");
    if (held !== undefined && held.kind === "protein") return nothing(`${held.name} is a protein. A fusion is built out of DNA.`);
    const bases = clean(piece.sequence ?? held?.sequence ?? "");
    if (bases === "") return nothing("A piece has no bases: give a part the lab holds, or write the sequence out.");
    if (!/^[ACGT]+$/.test(bases)) return nothing(`${piece.name ?? held?.name ?? "A piece"} is written in letters that are not A, C, G and T, and a reading frame cannot be counted through an uncertain base.`);
    pieces.push({ name: piece.name?.trim() || held?.name || `a ${piece.as}`, bases, as: piece.as });
  }

  const sequence = pieces.map((one) => one.bases).join("");
  // Where each piece ended up, which is what gets marked on the part.
  const features: PartFeature[] = [];
  const junctions: Junction[] = [];
  const checks: FusionCheck[] = [];
  let at = 0;
  let translatedSoFar = 0;
  let codingFrom: number | null = null;
  let codingTo = 0;
  for (const [index, piece] of pieces.entries()) {
    features.push({ type: piece.as === "coding" ? "CDS" : piece.as === "signal" ? "sig_peptide" : piece.as,
                    label: piece.name, strand: 1, parts: [{ start: at, end: at + piece.bases.length }] });
    if (TRANSLATED.has(piece.as)) {
      if (codingFrom === null) codingFrom = at + 1;
      codingTo = at + piece.bases.length;
      // A junction is in frame only if everything translated before it is a whole number of codons.
      if (index > 0 && TRANSLATED.has(pieces[index - 1]!.as)) {
        const inFrame = translatedSoFar % CODON === 0;
        junctions.push({
          after: pieces[index - 1]!.name, before: piece.name, at: at + 1, inFrame,
          says: inFrame
            ? `${pieces[index - 1]!.name} ends on a whole codon, so ${piece.name} is read in frame.`
            : `${translatedSoFar} bases come before this, which is ${translatedSoFar % CODON} past a whole codon, so ${piece.name} and everything after it is read in the wrong frame.`,
        });
      }
      if (piece.bases.length % CODON !== 0) {
        checks.push({
          weight: "stop",
          says: `${piece.name} is ${piece.bases.length} bases, which is not a whole number of codons. It shifts everything after it by ${piece.bases.length % CODON}, and the cell reads a different protein without complaining. Add or drop ${CODON - (piece.bases.length % CODON)} or ${piece.bases.length % CODON} bases.`,
          because: `${piece.bases.length} ÷ 3 leaves ${piece.bases.length % CODON}`,
        });
      }
      translatedSoFar += piece.bases.length;
    }
    at += piece.bases.length;
  }

  // Where things are in the order matters for two of the roles, and the mistakes are classic ones.
  const translatedPieces = pieces.filter((one) => TRANSLATED.has(one.as));
  const signalAt = translatedPieces.findIndex((one) => one.as === "signal");
  if (signalAt > 0) {
    const before = translatedPieces.slice(0, signalAt).map((one) => one.name).join(" and ");
    checks.push({
      weight: "stop",
      says: `${translatedPieces[signalAt]!.name} is a signal peptide, and one only works at the very start of the chain. ${before} comes before it, so nothing will recognise it: the protein will be made and will stay inside the cell. Put the signal first and the tag after it.`,
      because: `${before} is before the signal`,
    });
  }
  const promoterAt = pieces.findIndex((one) => one.as === "promoter");
  if (promoterAt > 0 && pieces.slice(0, promoterAt).some((one) => TRANSLATED.has(one.as))) {
    checks.push({ weight: "stop", says: `${pieces[promoterAt]!.name} is a promoter and comes after something that is translated. A promoter goes before what it drives.`, because: "promoter after the coding" });
  }
  const terminatorAt = pieces.findIndex((one) => one.as === "terminator");
  if (terminatorAt >= 0 && pieces.slice(terminatorAt + 1).some((one) => TRANSLATED.has(one.as))) {
    checks.push({ weight: "stop", says: `${pieces[terminatorAt]!.name} is a terminator and comes before something that is translated. A terminator goes at the end.`, because: "terminator before the coding" });
  }
  if (translatedPieces.length === 0) {
    return { ...nothing("None of these pieces is translated, so there is no protein to read."), sequence, features, name: choice.name?.trim() || "a fusion" };
  }

  // Read it. The whole translated stretch is read as one, which is the point: a frame that shifted
  // shows up here as a stop in the middle, not as a complaint from any one piece.
  const stretch = sequence.slice((codingFrom ?? 1) - 1, codingTo);
  const whole = stretch.slice(0, stretch.length - (stretch.length % CODON));
  const read = String(translate(whole));
  const stopped = read.endsWith("*");
  const protein = stopped ? read.slice(0, -1) : read;
  const inside = protein.indexOf("*");
  if (inside >= 0) {
    checks.push({
      weight: "stop",
      says: `There is a stop at amino acid ${inside + 1} of ${protein.length}, before the end, so the chain finishes early. If a piece above is not a whole number of codons, that is usually why.`,
      because: `stop at ${inside + 1}`,
    });
  }
  if (!protein.startsWith("M")) {
    checks.push({ weight: "look", says: "The translated stretch does not begin with methionine, which a coding sequence usually does. Check that the first translated piece really starts where the protein does.", because: `begins ${protein.slice(0, 1)}` });
  }
  if (!stopped) {
    checks.push({ weight: "look", says: "There is no stop codon at the end of the translated stretch. Without one the cell reads on into whatever follows.", because: "no stop at the end" });
  }
  if (stretch.length % CODON !== 0) {
    checks.push({ weight: "stop", says: `The translated stretch is ${stretch.length} bases, which is not a whole number of codons, so the last ${stretch.length % CODON} are read as part of nothing.`, because: `${stretch.length} ÷ 3 leaves ${stretch.length % CODON}` });
  }

  // What is collected, for a protein that is let out: the chain with its signal peptide gone.
  const signal = pieces.find((one) => one.as === "signal");
  const mature = signal === undefined || signalAt !== 0 ? null : protein.slice(Math.floor(signal.bases.length / CODON));

  return {
    name: choice.name?.trim() || `${pieces.map((one) => one.name).join(" + ")}`.slice(0, 200),
    sequence, features,
    coding: codingFrom === null ? null : { from: codingFrom, to: codingTo },
    protein, mature, junctions,
    checks: checks.sort((a, b) => Number(b.weight === "stop") - Number(a.weight === "stop")),
    problem: null,
  };
}

/**
 * The working behind a fusion: where the frame stands at each junction, and what was read.
 *
 * @param made - What `designFusion` gave.
 * @returns The workings. Empty if there was nothing to design.
 */
export function fusionWorking(made: Fusion): Working[] {
  if (made.problem !== null) return [];
  const count = (value: number): string => value.toLocaleString("en-US");
  const out: Working[] = [{
    of: "the frame, through every junction",
    comes: made.junctions.every((one) => one.inFrame) ? "whole the whole way" : "broken",
    kind: "exact",
    steps: [
      "A junction is in frame when everything translated before it comes to a whole number of codons, because that is what decides which three bases the cell reads together.",
      ...made.junctions.map((one) => `${one.after} → ${one.before}, at base ${count(one.at)}: ${one.says}`),
      ...(made.junctions.length === 0 ? ["There is only one translated piece, so there is no junction inside the protein."] : []),
    ],
  }];
  if (made.coding !== null) {
    out.push({
      of: "what it reads as",
      comes: `${count(made.protein.length)} amino acids`,
      kind: "exact",
      steps: [
        `The translated stretch is bases ${count(made.coding.from)}–${count(made.coding.to)}, which is ${count(made.coding.to - made.coding.from + 1)} bases.`,
        `${count(made.coding.to - made.coding.from + 1)} ÷ 3 is ${count(Math.floor((made.coding.to - made.coding.from + 1) / CODON))} codons.`,
        `It begins ${made.protein.slice(0, 24)}${made.protein.length > 24 ? "…" : ""}`,
        ...(made.mature === null ? [] : [`With the signal peptide cut off, what is let out is ${count(made.mature.length)} amino acids, beginning ${made.mature.slice(0, 18)}…`]),
      ],
      rests: "This is what the sequence says the cell would read. Whether the protein folds, is let out, or is any use is not something a sequence can be asked.",
    });
  }
  return out;
}
