/**
 * A ligation: pieces that have already been cut, joined where their ends fit.
 *
 * This is the step after a digest. Each piece carries a few unpaired bases at each end, and ligase
 * joins two ends only where those bases pair. Which pieces can go together, in what order and which
 * way round, follows from the ends alone — so it is worked out here, from sequences, knowing nothing
 * of the lab.
 *
 * The joining itself is `@biolibs/assembly2`'s. What this adds is what a bench needs to read: where
 * each piece sits in the product, which way round it went, what each join is made of, and what the
 * product carries from the pieces that made it.
 */
import type { PartFeature } from "@biolibs/bionet";
import { ligationAssembly } from "@biolibs/assembly2";
import { Dseq } from "@biolibs/dseq";
import { Dseqrecord } from "@biolibs/dseqrecord";

/** What one end of a piece is like. */
export interface PieceEndBases {
  /** `5′` or `3′` for an overhang, `blunt` for an end with no unpaired bases. */
  kind: "5′" | "3′" | "blunt";
  /** The unpaired bases, as the strand carrying them reads 5′ to 3′. Empty for a blunt end. */
  bases: string;
}

/** A piece going into a ligation: a part the lab holds, as this needs it. */
export interface LigationPiece {
  /** What tells it apart from the others here, such as an item's ID. */
  id: string;
  /** What it is called. */
  name: string;
  /** Every base either strand has, read along the top strand. */
  sequence: string;
  /** How many bases at each end are on one strand only: positive for a 5′ overhang, negative for a 3′ one. */
  ends: { left: number; right: number };
  /** What is marked on it. */
  features?: readonly PartFeature[];
}

/** Where one piece sits in a product. */
export interface PlacedPiece {
  /** Which piece. */
  id: string;
  name: string;
  /** Whether it went in the other way round. */
  flipped: boolean;
  /** Where its first base is in the product. */
  at: number;
  /** How many of the product's bases are its own, not shared with the piece before it. */
  length: number;
}

/** One join in a product: two ends that fitted. */
export interface LigationJoin {
  /** The piece whose right-hand end this is, and the piece whose left-hand end it is. */
  from: string;
  to: string;
  /** What kind of ends they were. */
  kind: "5′" | "3′" | "blunt";
  /** The bases the two ends shared. Empty for a blunt join. */
  bases: string;
  /** Where the join falls in the product: the number of bases before it. */
  at: number;
}

/** One thing a ligation would make. */
export interface LigationProduct {
  /** Its bases. */
  sequence: string;
  /** Whether it is a circle. */
  circular: boolean;
  /** How long it is. */
  length: number;
  /** The pieces, in the order they go round or along it. */
  pieces: PlacedPiece[];
  /** The joins, in the same order. A circle has one for each piece; a line has one fewer. */
  joins: LigationJoin[];
  /** What is marked on it: each piece's features, moved to where that piece now is. */
  features: PartFeature[];
}

/** What a ligation would make. */
export interface LigationPlan {
  /** What it would make, the circles first and the shortest first within that. */
  products: LigationProduct[];
  /** Why there is nothing to look at, said for a person, or `null` if there is something. */
  problem: string | null;
}

const clean = (bases: string): string => bases.replace(/\s+/g, "").toUpperCase();
const PAIR: Readonly<Record<string, string>> = { A: "T", T: "A", G: "C", C: "G", N: "N" };
const flipBases = (bases: string): string => [...bases].reverse().map((base) => PAIR[base] ?? "N").join("");

/**
 * A piece as a molecule with its ends.
 *
 * @param piece - The piece.
 * @returns The molecule, with the unpaired bases at each end left unpaired.
 * @throws If that is not a sequence, or the ends are longer than the piece.
 */
export function pieceRecord(piece: LigationPiece): Dseqrecord {
  const bases = clean(piece.sequence);
  const { left, right } = piece.ends;
  if (Math.abs(left) + Math.abs(right) >= bases.length) throw new Error("The ends are longer than the piece.");
  return new Dseqrecord(Dseq.fromFullSequenceAndOverhangs(bases, -left, -right), false, undefined, piece.id, piece.name);
}

/**
 * What a piece's two ends are made of.
 *
 * The number on a part says how many bases at that end are on one strand only. Which strand carries
 * them is what makes it a 5′ or a 3′ overhang: at the left-hand end a 5′ overhang is on the top
 * strand, and at the right-hand end it is on the bottom one.
 *
 * @param piece - The piece.
 * @returns Its left and right ends, each with the unpaired bases as the strand carrying them reads them.
 *
 * @example
 * ```ts
 * import { endBases } from "@biolibs/bionet-tools";
 *
 * endBases({ id: "1", name: "insert", sequence: "AATTCGGGGGGGGGGGATC", ends: { left: 4, right: 4 } });
 * // { left: { kind: "5′", bases: "AATT" }, right: { kind: "5′", bases: "GATC" } }
 * ```
 */
export function endBases(piece: LigationPiece): { left: PieceEndBases; right: PieceEndBases } {
  const bases = clean(piece.sequence);
  const { left, right } = piece.ends;
  const blunt: PieceEndBases = { kind: "blunt", bases: "" };
  return {
    // A 5′ overhang on the left is the top strand's own first bases; a 3′ one is the bottom strand's,
    // which read 5′ to 3′ the other way.
    left: left === 0 ? blunt : left > 0 ? { kind: "5′", bases: bases.slice(0, left) } : { kind: "3′", bases: flipBases(bases.slice(0, -left)) },
    // At the right-hand end it is the other way about: a 5′ overhang is the bottom strand's, read back.
    right: right === 0 ? blunt : right > 0 ? { kind: "5′", bases: flipBases(bases.slice(-right)) } : { kind: "3′", bases: bases.slice(right) },
  };
}

/**
 * Whether one piece's right-hand end joins another's left-hand end.
 *
 * Ligase joins two ends when the unpaired bases of one pair with those of the other, which means
 * the same kind of overhang, the same length, and bases that are each other's partners. Two blunt
 * ends join with nothing in common, which is why a blunt ligation needs no matching at all and is
 * the harder one to get.
 *
 * @param from - The end on the left of the join.
 * @param to - The end on the right of it.
 * @returns What the two share, or `null` if they do not fit.
 */
export function endsFit(from: PieceEndBases, to: PieceEndBases): { kind: "5′" | "3′" | "blunt"; bases: string } | null {
  if (from.kind === "blunt" && to.kind === "blunt") return { kind: "blunt", bases: "" };
  if (from.kind === "blunt" || to.kind === "blunt" || from.kind !== to.kind) return null;
  // Both overhangs are written 5′ to 3′ on their own strand, so they fit when one is the other's partner.
  return from.bases.length === to.bases.length && flipBases(from.bases) === to.bases ? { kind: from.kind, bases: from.bases } : null;
}

/** A feature turned round, for a piece that went in the other way. */
const flipFeature = (feature: PartFeature, length: number): PartFeature => ({
  ...feature, strand: (feature.strand === 0 ? 0 : -feature.strand) as -1 | 0 | 1,
  parts: feature.parts.map((piece) => ({ start: length - piece.end, end: length - piece.start })).reverse(),
});

/**
 * Work out what a ligation would make.
 *
 * @param pieces - The pieces in the tube.
 * @param options - `blunt` allows two blunt ends to be joined; `linear` keeps the products that did
 *   not close into a circle, which are the background a bench usually ignores.
 * @returns What it would make, and what is wrong if it would make nothing.
 *
 * @example
 * ```ts
 * import { planLigation } from "@biolibs/bionet-tools";
 *
 * const plan = planLigation([vector, insert]);
 * plan.products[0].circular;             // true
 * plan.products[0].pieces.length;        // 2
 * plan.products[0].joins[0].bases;       // "GATC"
 * ```
 */
export function planLigation(pieces: readonly LigationPiece[], options: { blunt?: boolean; linear?: boolean } = {}): LigationPlan {
  const empty = { products: [] };
  if (pieces.length === 0) return { ...empty, problem: "Choose the pieces to join." };
  let records: Dseqrecord[];
  try {
    records = pieces.map((piece) => pieceRecord(piece));
  } catch {
    return { ...empty, problem: "One of those is not a piece with ends a molecule of that length could have." };
  }
  let made: Dseqrecord[] = [];
  try {
    made = ligationAssembly(records, options.blunt === true, false, options.linear !== true);
  } catch {
    return { ...empty, problem: "Those pieces could not be joined." };
  }
  const byId = new Map(pieces.map((piece) => [piece.id, piece]));
  const products = made.flatMap((product): LigationProduct[] => {
    const input = (product.source as { input?: { sequence?: { id?: string | null }; reverseComplemented?: boolean }[] } | undefined)?.input ?? [];
    const order = input.map((one) => ({ piece: byId.get(String(one.sequence?.id ?? "")), flipped: one.reverseComplemented === true }));
    if (order.some((one) => one.piece === undefined)) return [];
    const sequence = String(product.seq).toUpperCase();
    const length = product.length;
    // Each piece keeps all of its bases except the ones it shares with the piece before it, which
    // belong to the join. Walking that gives where each piece sits and where each join falls.
    const joined: LigationJoin[] = [];
    const placed: PlacedPiece[] = [];
    // Each piece keeps all of its bases except the ones it shares with the piece before it, which
    // belong to the join. So a piece's own bases start where the piece before it ended, and the
    // piece itself starts the length of the shared overhang earlier.
    let ends = 0;
    for (const [index, { piece, flipped }] of order.entries()) {
      const bases = clean(piece!.sequence);
      const here = flipped ? { left: endBases(piece!).right, right: endBases(piece!).left } : endBases(piece!);
      const before = order[(index - 1 + order.length) % order.length]!;
      const beforeEnds = endBases(before.piece!);
      const out = before.flipped ? beforeEnds.left : beforeEnds.right;
      const fit = index === 0 && !product.circular ? null : endsFit(out, here.left);
      const shared = index === 0 ? 0 : fit?.bases.length ?? 0;
      const at = (((ends - shared) % length) + length) % length;
      placed.push({ id: piece!.id, name: piece!.name, flipped, at, length: bases.length - shared });
      if (fit !== null) joined.push({ from: before.piece!.id, to: piece!.id, kind: fit.kind, bases: fit.bases, at });
      ends += bases.length - shared;
    }
    const features = order.flatMap(({ piece, flipped }, index) => {
      const bases = clean(piece!.sequence);
      const start = placed[index]!.at;
      return (piece!.features ?? []).map((feature) => (flipped ? flipFeature(feature, bases.length) : feature))
        .map((feature): PartFeature => ({
          ...feature,
          parts: feature.parts.map((part) => ({ start: (start + part.start) % length, end: ((start + part.end - 1) % length) + 1 })),
        }))
        .filter((feature) => feature.parts.every((part) => part.end > part.start && part.end <= length));
    });
    return [{ sequence, circular: product.circular, length, pieces: placed, joins: joined, features }];
  });
  products.sort((a, b) => Number(b.circular) - Number(a.circular) || a.length - b.length || a.sequence.localeCompare(b.sequence));
  if (products.length === 0) {
    return { ...empty, problem: pieces.length === 1 ? `${pieces[0]!.name}'s two ends do not fit each other, so it cannot close on itself.`
      : "No two of those ends fit each other, so nothing would be joined." };
  }
  return { products, problem: null };
}
