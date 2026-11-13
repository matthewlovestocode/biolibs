/**
 * Cutting a record into pieces, each carrying its own sequence, features and two ends.
 *
 * A piece's top strand runs from one cut to the next. Seen from the top strand, a piece that begins at a cut has its
 * top strand starting just after that cut, and one that ends at a cut has its top strand ending at it, whatever the
 * overhangs are — so the top strand of a ligation is simply the left piece's top strand followed by the right
 * piece's. That is why a piece is stored as the top strand between two cuts, with the ends recorded separately.
 *
 * A linear sequence with `n` cuts gives `n + 1` pieces, the outer two keeping the ends the line already had. A
 * circular sequence with `n` cuts gives `n` pieces, one of which spans the origin; an uncut circle gives none,
 * since nothing has been cut.
 */

import { ValueError } from "@biolibs/core";
import type { SeqRecord } from "@biolibs/seqrecord";
import { extractRegion, residuesOf } from "@biolibs/seqedit";
import type { RestrictionType } from "@biolibs/restriction";
import { type Cut, type Topology, cutsIn } from "./cuts.js";
import { type End, NATURAL_END, endAt, flipEnd } from "./ends.js";

/** One fragment of a cut record. */
export interface Piece {
  /** The fragment as its own linear record, with the features that fall in it. */
  record: SeqRecord;
  /** The fragment's top strand, 5' to 3'. */
  residues: string;
  /** The end on the left, as the fragment is written. */
  left: End;
  /** The end on the right. */
  right: End;
  /** Where the fragment started in the record it was cut from, 0-based. */
  start: number;
  /** Length in base pairs of the double-stranded part plus any overhangs, i.e. the length of `residues`. */
  length: number;
  /** True when the fragment spans the origin of a circular record. */
  wraps: boolean;
}

/**
 * Cut a record into pieces.
 *
 * @param record - The record to cut. It is not changed.
 * @param enzymes - The enzymes to cut with.
 * @returns The pieces, in the order they occur along the record. An uncut linear record gives one piece with its
 *   natural ends; an uncut circular record gives none.
 * @throws {@link ValueError} for an enzyme whose cut is not known.
 * @example
 * ```ts
 * const { enzymes } = lookupEnzymes(["EcoRI", "BamHI"]);
 * const cut = piecesOf(plasmid, enzymes);
 * cut.map((p) => p.length);
 * ```
 */
export function piecesOf(record: SeqRecord, enzymes: readonly RestrictionType[]): Piece[] {
  const residues = residuesOf(record);
  const topology: Topology = record.annotations.get("topology") === "circular" ? "circular" : "linear";
  const cuts = cutsIn(residues, topology, enzymes);

  if (cuts.length === 0) {
    if (topology === "circular") return [];
    return [{
      record: extractRegion(record, 0, residues.length, { id: record.id ?? undefined }),
      residues, left: NATURAL_END, right: NATURAL_END, start: 0, length: residues.length, wraps: false,
    }];
  }

  const pieces: Piece[] = [];
  const addPiece = (from: Cut | null, to: Cut | null, end: number): void => {
    const start = from ? from.topCut : 0;
    const stop = to ? (to.topCut > start ? to.topCut : to.topCut + residues.length) : end;
    if (stop <= start) return;
    const text = stop > residues.length
      ? residues.slice(start) + residues.slice(0, stop - residues.length)
      : residues.slice(start, stop);
    pieces.push({
      record: extractRegion(record, start, stop, { id: `${record.id ?? "fragment"}:${start}-${stop}` }),
      residues: text,
      // A piece's left end is made by the cut it starts at, and its right end by the cut it stops at.
      left: from ? endAt(from.topCut, from.bottomCut, residues, from.enzyme) : NATURAL_END,
      right: to ? endAt(to.topCut, to.bottomCut, residues, to.enzyme) : NATURAL_END,
      start, length: text.length,
      wraps: stop > residues.length,
    });
  };

  if (topology === "linear") {
    addPiece(null, cuts[0]!, residues.length);
    for (let i = 0; i < cuts.length - 1; i++) addPiece(cuts[i]!, cuts[i + 1]!, residues.length);
    addPiece(cuts[cuts.length - 1]!, null, residues.length);
  } else {
    // Every piece of a circle runs from one cut to the next, the last wrapping through the origin.
    for (let i = 0; i < cuts.length; i++) addPiece(cuts[i]!, cuts[(i + 1) % cuts.length]!, residues.length);
  }
  return pieces;
}

/**
 * The same piece turned over: its sequence reverse-complemented, its features flipped, and its ends exchanged.
 *
 * @param piece - The piece.
 * @returns The flipped piece. `start` and `wraps` describe where it came from and are carried over unchanged.
 * @example
 * ```ts
 * const flipped = flipPiece(piece);
 * flipped.left.overhang; // the reverse complement of piece.right.overhang
 * ```
 */
export function flipPiece(piece: Piece): Piece {
  // Keeping the metadata means the flipped piece still says which record it came from.
  const record = piece.record.reverseComplement({
    features: true, letterAnnotations: true, id: true, name: true, description: true, dbxrefs: true, annotations: true,
  });
  return {
    record,
    residues: residuesOf(record),
    left: flipEnd(piece.right),
    right: flipEnd(piece.left),
    start: piece.start,
    length: piece.length,
    wraps: piece.wraps,
  };
}

/**
 * A short description of a piece, for a message.
 *
 * @param piece - The piece.
 * @returns For example `"806 bp (BamHI to EcoRI)"`.
 */
export const describePiece = (piece: Piece): string => {
  const name = (end: End): string => end.enzyme ?? "blunt end";
  return `${piece.length} bp (${name(piece.left)} to ${name(piece.right)})`;
};
