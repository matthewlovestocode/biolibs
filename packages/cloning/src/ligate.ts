/**
 * Ligation: joining pieces whose ends pair, and the circles a vector and an insert can make.
 *
 * Joining two pieces gives the left piece's top strand followed by the right piece's, because each piece's top
 * strand already stops at or starts from its cut (see `pieces.ts`). The features of both come with them, the right
 * piece's shifted along by the left piece's length.
 *
 * A circle needs both junctions to pair: the insert's left end with the vector's right end, and the insert's right
 * end with the vector's left end. The insert is tried as written and turned over, since a fragment in a tube has no
 * preferred orientation.
 */

import { ValueError } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqFeature } from "@biolibs/seqfeature";
import { SeqRecord } from "@biolibs/seqrecord";
import { residuesOf, shiftLocation } from "@biolibs/seqedit";
import type { AnyLocation } from "@biolibs/seqedit";
import { lookupEnzymes } from "./cuts.js";
import { type End, compatible, describeEnd } from "./ends.js";
import { type Piece, describePiece, flipPiece, piecesOf } from "./pieces.js";

/** Most products reported for one call. */
export const MAX_PRODUCTS = 50;

/** Which way round an insert went in. */
export type Orientation = "as written" | "turned over";

/** One circle a ligation can make. */
export interface CloneProduct {
  /** The circle as a record, with the features of both pieces. Its `topology` annotation is `"circular"`. */
  record: SeqRecord;
  /** Length in base pairs. */
  length: number;
  /** The vector fragment used. */
  vector: Piece;
  /** The insert fragment used, as it went in — already turned over if `orientation` says so. */
  insert: Piece;
  /** Which way round the insert went. */
  orientation: Orientation;
  /** A sentence describing the product, suitable for a list. */
  description: string;
}

/** What came of a cloning simulation. */
export type CloneResult =
  | { ok: true; products: CloneProduct[] }
  | { ok: false; error: string };

/**
 * Join two pieces into one, left to right.
 *
 * @param left - The piece on the left.
 * @param right - The piece on the right.
 * @param id - The id for the joined record. Defaults to the two ids joined by a hyphen.
 * @returns The joined piece, whose left end is the left piece's and whose right end is the right piece's.
 * @throws {@link ValueError} if the two ends do not pair.
 * @example
 * ```ts
 * const joined = joinPieces(vectorPiece, insertPiece);
 * joined.length; // the two lengths added
 * ```
 */
export function joinPieces(left: Piece, right: Piece, id?: string): Piece {
  if (!compatible(left.right, right.left)) {
    throw new ValueError(`a ${describeEnd(left.right)} end does not pair with a ${describeEnd(right.left)} end`);
  }
  const residues = left.residues + right.residues;
  const features: SeqFeature[] = [
    ...left.record.features.map(cloneFeature),
    ...right.record.features.map((feature) => cloneFeature(feature, left.residues.length)),
  ];
  const record = new SeqRecord(
    new Seq(residues),
    id ?? `${left.record.id ?? "left"}-${right.record.id ?? "right"}`,
    left.record.name, left.record.description, [],
    features,
    new Map<string, unknown>([["molecule_type", left.record.annotations.get("molecule_type") ?? "DNA"], ["topology", "linear"]]),
  );
  return {
    record, residues, left: left.left, right: right.right,
    start: 0, length: residues.length, wraps: false,
  };
}

/** A copy of a feature, optionally moved along. */
function cloneFeature(feature: SeqFeature, offset = 0): SeqFeature {
  const location = feature.location === null || offset === 0
    ? feature.location
    : shiftLocation(feature.location as AnyLocation, offset);
  return new SeqFeature(location, feature.type, feature.id, new Map(feature.qualifiers));
}

/**
 * Close a linear piece into a circle, if its two ends pair with each other.
 *
 * @param piece - The piece to close.
 * @param id - The id for the circle. Defaults to the piece's own id.
 * @returns The circular record, with `topology` set to `"circular"`.
 * @throws {@link ValueError} if the two ends do not pair.
 */
export function closeCircle(piece: Piece, id?: string): SeqRecord {
  if (!compatible(piece.right, piece.left)) {
    throw new ValueError(`a ${describeEnd(piece.right)} end does not pair with a ${describeEnd(piece.left)} end, so the fragment cannot close`);
  }
  const record = new SeqRecord(
    new Seq(piece.residues), id ?? piece.record.id, piece.record.name, piece.record.description, [],
    piece.record.features.map((feature) => cloneFeature(feature)),
    new Map<string, unknown>([["molecule_type", piece.record.annotations.get("molecule_type") ?? "DNA"], ["topology", "circular"]]),
  );
  return record;
}

/**
 * Whether a piece's two ends pair, so it could close into a circle on its own.
 *
 * @param piece - The piece.
 * @returns Whether it can self-close.
 */
export const canSelfClose = (piece: Piece): boolean => compatible(piece.right, piece.left);

/**
 * Simulate restriction cloning: cut a vector and an insert, and list the circles they can be ligated into.
 *
 * @param vector - The vector, which must be circular so that cutting it gives a single opened backbone.
 * @param insert - The record the insert is cut out of.
 * @param vectorEnzymeNames - Enzymes to cut the vector with.
 * @param insertEnzymeNames - Enzymes to cut the insert with. Defaults to the vector's.
 * @returns The products, largest vector fragment first, or the reason there are none.
 * @example
 * ```ts
 * const result = cloneProducts(pUC19, myGene, ["EcoRI", "BamHI"]);
 * if (result.ok) for (const p of result.products) console.log(p.description);
 * ```
 */
export function cloneProducts(
  vector: SeqRecord,
  insert: SeqRecord,
  vectorEnzymeNames: readonly string[],
  insertEnzymeNames: readonly string[] = vectorEnzymeNames,
): CloneResult {
  const vectorLookup = lookupEnzymes(vectorEnzymeNames);
  const insertLookup = lookupEnzymes(insertEnzymeNames);
  const unknown = [...new Set([...vectorLookup.unknown, ...insertLookup.unknown])];
  if (unknown.length > 0) return { ok: false, error: `these are not known enzymes: ${unknown.join(", ")}` };
  if (vectorLookup.enzymes.length === 0) return { ok: false, error: "no enzymes were given to cut the vector with" };
  if (insertLookup.enzymes.length === 0) return { ok: false, error: "no enzymes were given to cut the insert with" };
  if (vector.annotations.get("topology") !== "circular") return { ok: false, error: "the vector must be circular" };

  let vectorPieces: Piece[];
  let insertPieces: Piece[];
  try {
    vectorPieces = piecesOf(vector, vectorLookup.enzymes);
    insertPieces = piecesOf(insert, insertLookup.enzymes);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  if (vectorPieces.length === 0) {
    return { ok: false, error: `${vectorEnzymeNames.join(" and ")} do not cut the vector` };
  }
  // A piece with a natural end came from the uncut end of a line and cannot be ligated in a planned way, so only
  // fragments with two enzyme-made ends are offered as inserts.
  const usableInserts = insertPieces.filter((piece) => piece.left.enzyme !== null && piece.right.enzyme !== null);
  if (usableInserts.length === 0) {
    return {
      ok: false,
      error: insertPieces.length <= 1
        ? `${insertEnzymeNames.join(" and ")} do not cut the insert, so nothing can be freed from it`
        : "the insert is cut, but no fragment has an enzyme-made end at both sides",
    };
  }

  const products: CloneProduct[] = [];
  for (const vectorPiece of vectorPieces) {
    for (const insertPiece of usableInserts) {
      for (const orientation of ["as written", "turned over"] as const) {
        const oriented = orientation === "as written" ? insertPiece : flipPiece(insertPiece);
        // Both junctions must pair: vector to insert, and insert back to vector.
        if (!compatible(vectorPiece.right, oriented.left)) continue;
        if (!compatible(oriented.right, vectorPiece.left)) continue;
        const joined = joinPieces(vectorPiece, oriented);
        const id = `${vector.id ?? "vector"}-${insert.id ?? "insert"}`;
        const record = closeCircle(joined, id);
        products.push({
          record, length: joined.length, vector: vectorPiece, insert: oriented, orientation,
          description: `${joined.length} bp: vector ${describePiece(vectorPiece)} + ${insert.id ?? "insert"} ${describePiece(oriented)}, ${orientation}`,
        });
      }
    }
  }

  if (products.length === 0) {
    return { ok: false, error: "no circle can be made: the ends of the vector and the insert do not pair" };
  }
  // Largest vector fragment first, which is the construct a cloner is almost always after.
  products.sort((a, b) => b.vector.length - a.vector.length || a.length - b.length || a.orientation.localeCompare(b.orientation));
  return { ok: true, products: products.slice(0, MAX_PRODUCTS) };
}

/**
 * Re-ligate every piece of a digest back together in the order they came, closing the circle.
 *
 * Useful as a check: cutting a plasmid and re-ligating its pieces should give the plasmid back.
 *
 * @param pieces - The pieces, in order, as {@link piecesOf} gives them.
 * @param id - The id for the result.
 * @returns The circular record.
 * @throws {@link ValueError} for no pieces, or if any junction does not pair.
 */
export function religate(pieces: readonly Piece[], id?: string): SeqRecord {
  if (pieces.length === 0) throw new ValueError("there are no pieces to ligate");
  let joined = pieces[0]!;
  for (let i = 1; i < pieces.length; i++) joined = joinPieces(joined, pieces[i]!, id);
  const circle = closeCircle(joined, id);
  if (residuesOf(circle).length !== pieces.reduce((n, p) => n + p.length, 0)) {
    throw new ValueError("the re-ligated circle is not the length of its pieces");
  }
  return circle;
}
