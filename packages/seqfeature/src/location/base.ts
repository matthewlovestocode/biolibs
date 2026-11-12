/** The abstract `Location` class shared by simple and compound locations. */

import type { MutableSeq, Seq } from "@biolibs/seq";
import type { Position } from "../position/index.js";

/** A parent sequence a location can be extracted from: a `Seq`, `MutableSeq` or plain string. */
export type ParentSequence = Seq | MutableSeq | string;

/** Other sequences a location may refer to (`ref`), keyed by accession. */
export type References = Map<string, ParentSequence> | Record<string, ParentSequence>;

/** Strand of a location: +1 forward, -1 reverse, 0 unknown/both, or null for not stranded. */
export type Strand = 1 | -1 | 0 | null;

/**
 * A location in a sequence (Biopython's `Location`): either a
 * {@link SimpleLocation} or a {@link CompoundLocation}.
 */
export abstract class Location {
  /**
   * Parse a GenBank/EMBL location string such as `"complement(join(1..10,20..30))"`.
   * Assigned in `location/index.ts` (parsing needs the concrete classes).
   *
   * @param text - The location text (one-based, inclusive).
   * @param length - Sequence length, needed to repair features that wrap the origin.
   * @param circular - Whether the sequence is circular (allows origin-spanning repair).
   * @param stranded - If false, plain locations get strand `null` instead of +1.
   * @throws {@link LocationParserError} if the text cannot be parsed.
   */
  static fromstring: (text: string, length?: number | null, circular?: boolean, stranded?: boolean) => Location;

  /** Python-style representation, e.g. `SimpleLocation(ExactPosition(0), ExactPosition(5), strand=1)`. */
  abstract repr(): string;
  /** Short text form, e.g. `[0:5](+)`. */
  abstract toString(): string;

  /** The strand (see {@link Strand}); assigning to a compound location sets every part. */
  abstract strand: Strand;
  /** First position (lowest start). */
  abstract get start(): Position;
  /** Last position (highest end), exclusive. */
  abstract get end(): Position;
  /** The simple locations making up this location (`[this]` for a simple one). */
  abstract get parts(): Location[];
  /** Accession of another sequence this refers to, or null. */
  abstract get ref(): string | null;
  /** Database of `ref`, or null. */
  abstract get refDb(): string | null;
  /** Number of positions covered (Python `len(location)`). */
  abstract get length(): number;
  /** Whether the zero-based integer position lies inside a part (Python `value in location`). */
  abstract contains(value: number | Position): boolean;
  /** The covered positions in order of traversal (reversed for the minus strand). */
  abstract [Symbol.iterator](): Iterator<number>;
  /** Structural equality (positions compare as integers). */
  abstract equals(other: unknown): boolean;
  /** Add an offset to a location, or concatenate locations (Python `+`). */
  abstract add(other: Location | number): Location;
  /** The location moved by `offset`. @internal */
  abstract shift(offset: number): Location;
  /** The location as seen on the reverse complement of a sequence of `length`. @internal */
  abstract flip(length: number): Location;
  /** The sub-sequence this location describes, reverse-complemented for the minus strand. */
  abstract extract(parentSequence: ParentSequence, references?: References | null): ParentSequence;
}
