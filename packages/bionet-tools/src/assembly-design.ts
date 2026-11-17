/**
 * Designing an assembly over a lab's own parts: which pieces, in which order, and the primers that
 * make them fit.
 *
 * A ligation joins pieces that have already been cut and whose ends happen to match. This is the
 * other way round: you say what you want the ring to be made of, in order, and the primers are
 * designed to give each piece the overlap it needs. That is what a construct is built by — a
 * promoter, a signal, a gene and a terminator in a vector — and it is the step between having a
 * sequence and having something that can be put into a cell.
 *
 * The designing itself is `designGibson` in `@biolibs/cloning`. What is here is everything that
 * makes it the lab's: the parts it holds, what it would call the product, and the working behind
 * every figure, so that nothing has to be taken on trust.
 */
import { designGibson, type DesignedJunction, type DesignedPrimer, type GibsonDesign } from "@biolibs/cloning";
import type { PartFeature, PartState } from "@biolibs/bionet";
import { carryFeatures } from "./sequence-file.js";
import type { ToolLab } from "./run.js";
import type { Working } from "./pcr-working.js";

/** The longest a designed ring may be, in bases. Past this it is not something to design in a window. */
export const LONGEST_RING = 200_000;

/** One piece of a planned assembly, as the lab holds it. */
export interface AssemblyPiece {
  /** The part, by checksum. */
  part: string;
  /**
   * Whether it is to be amplified by PCR, and so can be given primer tails. A piece used as it is —
   * a vector opened with an enzyme — cannot be, so its neighbours carry the whole overlap.
   */
  amplify: boolean;
}

/** What is being designed. */
export interface AssemblyChoice {
  /** The pieces, in the order they go round the ring. At least two. */
  pieces: readonly AssemblyPiece[];
  /** The overlap to design at each junction, in bases. 25 unless said. */
  overlap?: number;
  /** The melting temperature each primer's binding part aims at, in °C. 60 unless said. */
  targetTm?: number;
  /** What to call the product. */
  name?: string;
}

/** A piece of an assembly, placed on the ring. */
export interface AssemblyPlaced {
  /** The part it is. */
  part: PartState;
  /** Whether it is amplified. */
  amplify: boolean;
  /** How many bases come before it on the ring. */
  start: number;
  /** One past its last base. */
  end: number;
}

/** A designed assembly over a lab's parts. */
export interface AssemblyDesign {
  /** The pieces, in order, each placed on the ring. */
  pieces: AssemblyPlaced[];
  /** The primers to order. */
  primers: DesignedPrimer[];
  /** The junctions, in the order they go round. */
  junctions: DesignedJunction[];
  /** The ring's bases. */
  sequence: string;
  /** How long it is. */
  length: number;
  /** What is marked on it: what each piece carried, moved to where that piece now is. */
  features: PartFeature[];
  /** What it would be called. */
  name: string;
  /** Anything a careful person would look at, worst first. */
  warnings: string[];
  /** Why it cannot be designed, or `null`. */
  problem: string | null;
}

const count = (value: number): string => value.toLocaleString("en-US");

/** Parts worth offering as a piece: anything long enough to carry an overlap and a primer. */
export function assemblyParts(lab: Pick<ToolLab, "parts">, overlap = 25, shortest = 18): PartState[] {
  return lab.parts.filter((one) => one.length >= overlap + shortest);
}

/**
 * Design an assembly of a lab's parts.
 *
 * @param lab - The lab.
 * @param choice - The pieces in order, and how to design them.
 * @returns The design, with what it would make and what to watch for. `problem` says why if it
 *   could not be designed.
 *
 * @example
 * ```ts
 * import { designAssembly } from "@biolibs/bionet-tools";
 *
 * const design = designAssembly(lab, { pieces: [{ part: backbone, amplify: false }, { part: gene, amplify: true }] });
 * design.length;        // the ring, every piece end to end
 * design.primers;       // what to order
 * ```
 */
export function designAssembly(lab: Pick<ToolLab, "parts">, choice: AssemblyChoice): AssemblyDesign {
  const nothing = (problem: string): AssemblyDesign =>
    ({ pieces: [], primers: [], junctions: [], sequence: "", length: 0, features: [], name: "", warnings: [], problem });
  const held = choice.pieces.map((one) => ({ piece: one, part: lab.parts.find((each) => each.checksum === one.part) }));
  const missing = held.find((one) => one.part === undefined);
  if (missing !== undefined) return nothing("One of the pieces is not a part the lab has.");
  if (held.length < 2) return nothing("An assembly is of at least two pieces, in the order they go round the ring.");
  const circles = held.filter((one) => one.part!.circular && !one.piece.amplify);
  if (circles.length > 0) {
    return nothing(`${circles.map((one) => one.part!.name).join(" and ")} ${circles.length === 1 ? "is a circle" : "are circles"}, which has no ends to join. Cut it first, or amplify it.`);
  }
  const whole = held.reduce((sum, one) => sum + one.part!.length, 0);
  if (whole > LONGEST_RING) return nothing(`That would be ${count(whole)} bases, which is more than this designs in one go.`);

  const designed = designGibson(held.map((one) => ({ name: one.part!.name, residues: one.part!.sequence, amplify: one.piece.amplify })),
                                { ...(choice.overlap === undefined ? {} : { overlap: choice.overlap }), ...(choice.targetTm === undefined ? {} : { targetTm: choice.targetTm }) });
  if (!designed.ok) return nothing(designed.error);
  const design: GibsonDesign = designed.design;

  // Each piece goes on the ring where the pieces before it end, and takes what was marked on it there.
  const pieces: AssemblyPlaced[] = [];
  const features: PartFeature[] = [];
  let sequence = "";
  for (const { piece, part } of held) {
    const start = sequence.length;
    pieces.push({ part: part!, amplify: piece.amplify, start, end: start + part!.length });
    for (const feature of carryFeatures(part!.features, 0, part!.length, start)) features.push(feature);
    sequence += part!.sequence;
  }
  const name = choice.name?.trim() !== undefined && choice.name.trim() !== "" ? choice.name.trim()
    : held.map((one) => one.part!.name).join(" + ");
  return {
    pieces, primers: design.primers, junctions: design.junctions, sequence, length: sequence.length,
    features, name, warnings: [...design.warnings], problem: null,
  };
}

/**
 * The working behind a designed assembly: where every figure comes from.
 *
 * @param design - The design.
 * @returns One working for the ring's length, one for each junction, and one for each primer.
 */
export function assemblyWorking(design: AssemblyDesign): Working[] {
  if (design.problem !== null) return [];
  const out: Working[] = [{
    of: "the ring",
    comes: `${count(design.length)} bases`,
    kind: "exact",
    steps: [
      ...design.pieces.map((one) => `${one.part.name}: ${count(one.part.length)} bases, at ${count(one.start + 1)}–${count(one.end)}`),
      `every piece end to end: ${design.pieces.map((one) => count(one.part.length)).join(" + ")} = ${count(design.length)}`,
      "an overlap takes nothing away: it is the bases either side of a junction, which the primers' tails copy so the two products share them, and joining them puts each back once",
    ],
  }];
  for (const junction of design.junctions) {
    out.push({
      of: `the join between ${junction.from} and ${junction.to}`,
      comes: `${junction.length} bases, melting near ${Math.round(junction.tm)} °C`,
      kind: "estimate",
      steps: [
        // A primer's tail reaches across the junction, so what each carries is its neighbour's
        // bases: the forward primer of the second piece is what carries the end of the first.
        `${junction.carried.toForward} bases from the end of ${junction.from}${junction.carried.toForward === 0 ? ", which contributes none here" : `, carried on ${junction.to}'s forward primer as a tail`}`,
        `${junction.carried.fromReverse} bases from the start of ${junction.to}${junction.carried.fromReverse === 0 ? ", which contributes none here" : `, carried on ${junction.from}'s reverse primer as a tail`}`,
        `the overlap the two products share: ${junction.overlap}`,
        "its melting temperature: 2 °C for each A or T and 4 °C for each G or C, the rough figure written on a tube",
      ],
      rests: "The melting temperature is the Wallace rule, which is a guide and not a measurement.",
    });
  }
  for (const primer of design.primers) {
    out.push({
      of: primer.name,
      comes: `${primer.sequence.length} bases: a ${primer.tail.length}-base tail and a ${primer.binding.length}-base binding part`,
      kind: "exact",
      steps: [
        `the tail: ${primer.tail === "" ? "none, since this end needs no overlap carried" : primer.tail}`,
        `the part that binds: ${primer.binding}`,
        `the annealing temperature comes from that part alone, which melts near ${Math.round(primer.binding_report.tm)} °C`,
        `what is ordered: ${primer.sequence}`,
      ],
    });
  }
  return out;
}

/**
 * A designed assembly, as a run the lab would record.
 *
 * It is one run: the pieces go in, the ring comes out. The primers are not inputs, because they are
 * used in the PCRs that make the pieces, which are runs of their own.
 *
 * @param design - The design.
 * @param choice - The tubes of each piece, how much of each, and where it was done.
 * @returns What to hand to the lab's `recordRun`, or `null` if there is nothing to record.
 */
export function assemblyRun(design: AssemblyDesign, choice: {
  tubes: Readonly<Record<string, string>>; used?: Readonly<Record<string, number>>; instrument?: string | null; amount?: number; unit?: string | null; note?: string | null;
}): Record<string, unknown> | null {
  if (design.problem !== null) return null;
  const inputs = design.pieces.flatMap((one) => {
    const tube = choice.tubes[one.part.checksum];
    return tube === undefined ? [] : [{ item: tube, amount: Math.max(0, Math.round(choice.used?.[tube] ?? 1)), role: "piece" }];
  });
  if (inputs.length !== design.pieces.length) return null;
  return {
    kind: "assembly", instrument: choice.instrument ?? null, inputs,
    outputs: [{ sequence: design.sequence, circular: true, name: design.name, amount: Math.max(0, Math.round(choice.amount ?? 20)), unit: choice.unit ?? "µL", features: design.features }],
    settings: { pieces: design.pieces.length, joins: design.junctions.length, overlap: design.junctions[0]?.length ?? 0 },
    outcome: "worked", note: choice.note ?? null,
  };
}
