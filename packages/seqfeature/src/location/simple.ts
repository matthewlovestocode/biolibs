/** `SimpleLocation`: a single continuous range. */

import { ValueError } from "@biolibs/core";
import { ExactPosition, IntPosition, Position } from "../position/index.js";
import { pyClassRepr, pyRepr, pyTypeName } from "../py/repr.js";
import { Location, type ParentSequence, type References, type Strand } from "./base.js";
import { CompoundLocation } from "./compound.js";
import { lookupReference, reverseComplementOf, sliceParent } from "./extract-util.js";


/** Whether `x` is a Python `int` (an integer, or one of the int-valued positions). */
function isInteger(x: unknown): x is number {
  return (typeof x === "number" && Number.isInteger(x)) || x instanceof IntPosition;
}

/** Convert a constructor argument to a {@link Position}. */
function asPosition(value: unknown, name: string): Position {
  if (value instanceof Position) return value;
  if (typeof value === "number" && Number.isInteger(value)) return new ExactPosition(value);
  throw new TypeError(`${name}=${pyRepr(value)} ${pyClassRepr(value)}`);
}

/**
 * A single continuous region, zero-based and end-exclusive like a JavaScript
 * slice (Biopython's `SimpleLocation`, formerly `FeatureLocation`).
 *
 * @example
 * ```ts
 * const loc = new SimpleLocation(5, 10, 1);
 * loc.length;                  // 5
 * loc.toString();              // "[5:10](+)"
 * loc.extract("ACGTACGTACGT");  // "CGTAC"
 * ```
 */
export class SimpleLocation extends Location {
  /**
   * Parse a single GenBank range such as `"5..10"`, `"<5..>10"` or `"complement(5..10)"`.
   * Assigned in `location/index.ts` (parsing needs `CompoundLocation`).
   */
  static fromstring: (text: string, length?: number | null, circular?: boolean) => SimpleLocation | CompoundLocation;

  private startPos: Position;
  private endPos: Position;
  private strandValue: Strand = null;
  /** Accession of another sequence this location refers to, or null. */
  ref: string | null;
  /** Database name for `ref`, or null. */
  refDb: string | null;

  /**
   * @param start - Zero-based start (a number or a {@link Position}).
   * @param end - Zero-based, exclusive end.
   * @param strand - +1, -1, 0 or null.
   * @param ref - Accession of another sequence, if the feature lives there.
   * @param refDb - Database for `ref`.
   * @throws TypeError if `start`/`end` are not integers or positions.
   * @throws {@link ValueError} if the end precedes the start, or the strand is invalid.
   */
  constructor(start: number | Position, end: number | Position, strand: Strand | undefined = null, ref: string | null = null, refDb: string | null = null) {
    super();
    this.startPos = asPosition(start, "start");
    this.endPos = asPosition(end, "end");
    if (this.startPos instanceof IntPosition && this.endPos instanceof IntPosition && this.startPos.valueOf() > this.endPos.valueOf()) {
      throw new ValueError(`End location (${this.endPos}) must be greater than or equal to start location (${this.startPos})`);
    }
    this.strand = strand ?? null;
    this.ref = ref;
    this.refDb = refDb;
  }

  get strand(): Strand {
    return this.strandValue;
  }

  set strand(value: Strand) {
    if (value !== 1 && value !== -1 && value !== 0 && value !== null) {
      throw new ValueError(`Strand should be +1, -1, 0 or None, not ${pyRepr(value)}`);
    }
    this.strandValue = value;
  }

  get start(): Position { return this.startPos; }
  get end(): Position { return this.endPos; }
  get parts(): SimpleLocation[] { return [this]; }

  /** Text like `[5:10](+)`; prefixed by the reference when present. */
  toString(): string {
    let answer = `[${this.startPos}:${this.endPos}]`;
    if (this.ref && this.refDb) answer = `${this.refDb}:${this.ref}${answer}`;
    else if (this.ref) answer = this.ref + answer;
    if (this.strand === null) return answer;
    if (this.strand === 1) return answer + "(+)";
    if (this.strand === -1) return answer + "(-)";
    return answer + "(?)";
  }

  repr(): string {
    let optional = "";
    if (this.strand !== null) optional += `, strand=${pyRepr(this.strand)}`;
    if (this.ref !== null) optional += `, ref=${pyRepr(this.ref)}`;
    if (this.refDb !== null) optional += `, ref_db=${pyRepr(this.refDb)}`;
    return `${this.constructor.name}(${this.startPos.repr()}, ${this.endPos.repr()}${optional})`;
  }

  /**
   * `loc + other`: join with another simple location (giving a `CompoundLocation`) or shift by an integer.
   * @throws TypeError for other operand types.
   */
  add(other: Location | number): Location {
    if (other instanceof SimpleLocation) return new CompoundLocation([this, other]);
    if (other instanceof CompoundLocation) return other.radd(this); // Python falls back to the right operand's __radd__
    if (isInteger(other)) return this.shift(Number(other));
    throw new TypeError(`unsupported operand type(s) for +: 'SimpleLocation' and '${pyTypeName(other)}'`);
  }

  /** `other + loc` for an integer offset or another location. @throws TypeError otherwise. */
  radd(other: Location | number): Location {
    if (other instanceof Location) return other.add(this);
    if (isInteger(other)) return this.shift(Number(other));
    if (typeof other === "string") throw new TypeError('can only concatenate str (not "SimpleLocation") to str'); // str's own wording
    throw new TypeError(`unsupported operand type(s) for +: '${pyTypeName(other)}' and 'SimpleLocation'`);
  }

  /** `loc - offset`: shift towards the start. @throws TypeError for non-integers. */
  sub(other: number): SimpleLocation {
    if (isInteger(other)) return this.shift(-Number(other));
    throw new TypeError(`unsupported operand type(s) for -: 'SimpleLocation' and '${pyTypeName(other)}'`);
  }

  get length(): number {
    return this.endPos.valueOf() - this.startPos.valueOf();
  }

  contains(value: number | Position): boolean {
    const v: unknown = value instanceof IntPosition ? value.valueOf() : value;
    if (typeof v !== "number" || !Number.isInteger(v)) {
      throw new ValueError("Currently we only support checking for integer positions being within a SimpleLocation.");
    }
    return !(v < this.startPos.valueOf() || v >= this.endPos.valueOf());
  }

  *[Symbol.iterator](): Iterator<number> {
    const s = this.startPos.valueOf();
    const e = this.endPos.valueOf();
    if (this.strand === -1) for (let i = e - 1; i > s - 1; i--) yield i;
    else for (let i = s; i < e; i++) yield i;
  }

  equals(other: unknown): boolean {
    if (!(other instanceof SimpleLocation)) return false;
    return this.startPos.equals(other.start) && this.endPos.equals(other.end) && this.strand === other.strand && this.ref === other.ref && this.refDb === other.refDb;
  }

  /** The location moved by `offset`; locations on other sequences are returned unchanged. @internal */
  shift(offset: number): SimpleLocation {
    if (this.ref || this.refDb) return this;
    return new SimpleLocation(this.startPos.add(offset), this.endPos.add(offset), this.strand);
  }

  /** The location on the reverse complement of a sequence of `length`; strand is inverted. @internal */
  flip(length: number): SimpleLocation {
    if (this.ref || this.refDb) return this;
    const flipStrand: Strand = this.strand === 1 ? -1 : this.strand === -1 ? 1 : this.strand;
    return new SimpleLocation(this.endPos.flip(length), this.startPos.flip(length), flipStrand);
  }

  extract(parentSequence: ParentSequence, references?: References | null): ParentSequence {
    if (this.ref || this.refDb) parentSequence = lookupReference(this.ref, references);
    let part = sliceParent(parentSequence, this.startPos.valueOf(), this.endPos.valueOf());
    if (this.strand === -1) part = reverseComplementOf(part);
    return part;
  }
}

/** Former name of {@link SimpleLocation}, kept for compatibility with older Biopython code. */
export const FeatureLocation = SimpleLocation;
