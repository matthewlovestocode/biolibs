/**
 * A ligation's working: what each join is made of, where the product's length comes from, how much
 * of each piece to put in, and what a careful person would ask before setting one up.
 *
 * Which ends fit is exact, and shown down to the bases. How much of each piece to use is arithmetic
 * on a convention. Whether it will work at all is neither: it is what the checks are for.
 */
import type { LigationPiece, LigationPlan, LigationProduct, PieceEndBases } from "./ligate.js";
import { endBases, endsFit } from "./ligate.js";
import type { Working } from "./pcr-working.js";

const count = (value: number): string => value.toLocaleString("en-US");
const PAIR: Readonly<Record<string, string>> = { A: "T", T: "A", G: "C", C: "G", N: "N" };

/** Two ends written one over the other, to show that they pair. */
export interface JoinOverhangs {
  /** The piece on the left of the join, and the one on the right. */
  from: string;
  to: string;
  /** The overhang on the left-hand piece, 5′ to 3′ on the strand that carries it. */
  left: string;
  /** The right-hand piece's, written under it so each base sits beneath the one it pairs with. */
  right: string;
  /** Whether it is a 5′ overhang, a 3′ one, or two blunt ends. */
  kind: "5′" | "3′" | "blunt";
}

/**
 * One join, said as steps that can be checked against the bases.
 *
 * @param from - The piece on the left of the join, and which of its ends this is.
 * @param to - The piece on the right, and which of its ends.
 * @returns The working, with the two overhangs written one over the other.
 */
export function joinWorking(from: { name: string; end: PieceEndBases }, to: { name: string; end: PieceEndBases }): Working & { bases: JoinOverhangs } {
  const fit = endsFit(from.end, to.end);
  const under = [...from.end.bases].map((base) => PAIR[base] ?? "N").join("");
  const bases: JoinOverhangs = { from: from.name, to: to.name, left: from.end.bases, right: [...to.end.bases].reverse().join(""), kind: fit?.kind ?? from.end.kind };
  if (fit === null) {
    return {
      of: `${from.name} to ${to.name}`, comes: "they do not fit", kind: "exact", bases,
      steps: [
        `${from.name}'s end is ${from.end.kind === "blunt" ? "blunt" : `a ${from.end.kind} overhang, ${from.end.bases}`}.`,
        `${to.name}'s is ${to.end.kind === "blunt" ? "blunt" : `a ${to.end.kind} overhang, ${to.end.bases}`}.`,
        from.end.kind !== to.end.kind ? "A sticky end and a blunt one have nothing to pair, so ligase cannot join them."
          : from.end.bases.length !== to.end.bases.length ? `One overhang is ${from.end.bases.length} bases and the other ${to.end.bases.length}. They have to be the same length.`
          : `${from.end.bases} would have to meet ${under} to pair, and it meets ${[...to.end.bases].reverse().join("")}.`,
      ],
    };
  }
  if (fit.kind === "blunt") {
    return {
      of: `${from.name} to ${to.name}`, comes: "a blunt join", kind: "exact", bases,
      steps: ["Both ends are blunt: every base is already paired with one opposite.",
              "Ligase seals the backbone without anything having to find anything, so these two ends join, and so would any other two blunt ends in the tube."],
    };
  }
  return {
    of: `${from.name} to ${to.name}`, comes: `${fit.bases.length} bases, ${fit.bases}`, kind: "exact", bases,
    steps: [
      `${from.name} ends in a ${fit.kind} overhang of ${fit.bases.length} unpaired bases, ${fit.bases}.`,
      `${to.name} begins with ${[...to.end.bases].reverse().join("")} read the other way, which is ${under}: each base is the partner of the one above it.`,
      "So the two ends hold together while ligase seals the backbone on each strand.",
    ],
  };
}

/**
 * Where a product's length comes from: the pieces, less the overhangs they share.
 *
 * @param product - The product.
 * @param pieces - The pieces that went in, for their full lengths.
 * @returns The working.
 */
export function ligationLengthWorking(product: LigationProduct, pieces: readonly LigationPiece[]): Working {
  const lengthOf = (id: string): number => pieces.find((piece) => piece.id === id)?.sequence.replace(/\s+/g, "").length ?? 0;
  const total = product.pieces.reduce((sum, piece) => sum + lengthOf(piece.id), 0);
  const shared = product.joins.reduce((sum, join) => sum + join.bases.length, 0);
  return {
    of: "the product's length", comes: `${count(product.length)} bp`, kind: "exact",
    steps: [
      `The pieces are ${product.pieces.map((piece) => `${piece.name} ${count(lengthOf(piece.id))}`).join(", ")}: ${count(total)} bases in all.`,
      shared === 0 ? "They are joined blunt, so nothing is shared between them."
        : `Each join's overhang belongs to both pieces at once, so it is counted once: ${product.joins.map((join) => String(join.bases.length)).join(" + ")} = ${shared}.`,
      `${count(total)} − ${count(shared)} = ${count(product.length)}${product.circular ? ", closed into a circle." : "."}`,
    ],
  };
}

/**
 * How much of each piece to put in the tube.
 *
 * @param vector - The piece being cloned into, by name and length.
 * @param insert - The piece going in.
 * @param options - `ratio` is how many times more insert than vector, by molecule, and `ng` how
 *   much of the vector is used.
 * @returns The working.
 *
 * @example
 * ```ts
 * import { ratioWorking } from "@biolibs/bionet-tools";
 *
 * ratioWorking({ name: "vector", length: 3000 }, { name: "insert", length: 600 }).comes;   // "30 ng of insert"
 * ```
 */
export function ratioWorking(vector: { name: string; length: number }, insert: { name: string; length: number },
                             options: { ratio?: number; ng?: number } = {}): Working {
  const ratio = options.ratio === undefined || options.ratio <= 0 ? 3 : options.ratio;
  const ng = options.ng === undefined || options.ng <= 0 ? 50 : options.ng;
  const wanted = ng * (insert.length / vector.length) * ratio;
  const round = (value: number): string => String(Math.round(value * 100) / 100);
  return {
    of: `how much ${insert.name} to put in`, comes: `${round(wanted)} ng of insert`, kind: "estimate",
    steps: [
      `A molecule of ${insert.name} is ${count(insert.length)} bases and one of ${vector.name} is ${count(vector.length)}, so the same weight holds ${round(vector.length / insert.length)} times as many molecules of the insert.`,
      `For ${ratio} molecules of insert to each of vector: ${ng} ng × ${count(insert.length)} ÷ ${count(vector.length)} × ${ratio} = ${round(wanted)} ng.`,
    ],
    rests: "Three insert molecules to one of vector is the usual starting point, and the weight is worked out from length because a longer molecule weighs more. It assumes both preparations are what they say they are and that nothing has degraded, so it is where to start rather than a measurement.",
  };
}

/** Something a careful person would ask before setting a ligation up. */
export interface LigationCheck {
  /** `stop` if what is hoped for is unlikely as set up, `look` if it is only worth a second glance. */
  weight: "stop" | "look";
  /** What to ask, said for a person. */
  says: string;
  /** What raised it, so it can be checked. */
  because: string;
}

/**
 * What a careful person would ask of a ligation.
 *
 * These are the ways a ligation gives something other than what was wanted: a vector that closes on
 * itself, an insert that can go in either way round, pieces that can join each other instead, a
 * blunt join that will mostly not happen, and a PCR product whose ends ligase cannot seal.
 *
 * @param pieces - The pieces in the tube.
 * @param plan - What they would make.
 * @param options - `fromPcr` names pieces that came out of a PCR, which have no phosphate at their 5′ ends.
 * @returns The checks that apply, the ones most likely to matter first.
 */
export function ligationChecks(pieces: readonly LigationPiece[], plan: LigationPlan,
                               options: { fromPcr?: readonly string[] } = {}): LigationCheck[] {
  const checks: LigationCheck[] = [];
  const wanted = plan.products.filter((product) => product.circular);
  for (const piece of pieces) {
    const ends = endBases(piece);
    const fit = endsFit(ends.right, ends.left);
    if (fit !== null && pieces.length > 1) {
      checks.push({ weight: "stop", says: `${piece.name}'s two ends fit each other, so it can close on itself and give a colony with nothing in it. Cut with two different enzymes, or take the phosphate off its ends so only the insert can seal them.`,
                    because: fit.kind === "blunt" ? "both ends blunt" : `${ends.right.bases} meets ${ends.left.bases}` });
    }
  }
  // The same pieces in the same order, differing only in which way round one went, is the thing a
  // bench cannot tell apart without cutting the result.
  const byShape = new Map<string, LigationProduct[]>();
  for (const product of wanted) {
    const shape = [...product.pieces].map((piece) => piece.id).sort().join("+");
    byShape.set(shape, [...(byShape.get(shape) ?? []), product]);
  }
  for (const [, together] of byShape) {
    if (together.length < 2) continue;
    const turned = together.flatMap((product) => product.pieces.filter((piece) => piece.flipped).map((piece) => piece.name));
    checks.push({ weight: "look", says: `These pieces make ${together.length} products that hold the same things${turned.length === 0 ? "" : `, with ${[...new Set(turned)].join(" and ")} the other way round`}. Both will be in the tube, and a check digest is what tells one from the other.`,
                  because: `${together.length} circles of ${together[0]!.pieces.length} pieces` });
  }
  if (wanted.some((product) => product.joins.some((join) => join.kind === "blunt"))) {
    checks.push({ weight: "look", says: "A blunt join has nothing holding the two ends together while ligase works, so it happens far less often than a sticky one. Allow more ligase, more DNA and longer, and expect fewer colonies.", because: "a blunt join" });
  }
  const pcr = (options.fromPcr ?? []).filter((id) => pieces.some((piece) => piece.id === id));
  if (pcr.length > 0) {
    const named = pcr.map((id) => pieces.find((piece) => piece.id === id)!.name);
    checks.push({ weight: "stop", says: `${named.join(" and ")} came out of a PCR, and a PCR product has no phosphate at its 5′ ends. Ligase seals a backbone by joining a phosphate to a hydroxyl, so there is nothing for it to join until the ends are phosphorylated.`,
                  because: "made by pcr" });
  }
  if (wanted.length === 0 && plan.products.length > 0) {
    checks.push({ weight: "stop", says: "Nothing here closes into a circle. The pieces join end to end and stop, which is not something that can be grown.", because: "no circular product" });
  }
  return checks.sort((a, b) => Number(b.weight === "stop") - Number(a.weight === "stop"));
}
