/** `CompoundLocation`: several ranges joined together (exons, for example). */

import { NotImplementedError, ValueError } from "@biolibs/core";
import { IntPosition, type Position } from "../position/index.js";
import { pyClassRepr, pyRepr } from "@biolibs/core";
import { Location, type ParentSequence, type References, type Strand } from "./base.js";
import { concatParts } from "./extract-util.js";
import { SimpleLocation } from "./simple.js";

/**
 * Two or more {@link SimpleLocation}s treated as one feature, combined with a
 * GenBank operator (`join`, `order` or `bond`).
 *
 * @example
 * ```ts
 * const exons = new SimpleLocation(0, 3, 1).add(new SimpleLocation(10, 15, 1));
 * exons.toString();   // "join{[0:3](+), [10:15](+)}"
 * exons.length;       // 8
 * ```
 */
export class CompoundLocation extends Location {
  /** The GenBank operator combining the parts. */
  operator: string;
  /** The parts, in the order they are read. */
  parts: SimpleLocation[];

  /**
   * @param parts - At least two simple locations.
   * @param operator - `"join"` (default), `"order"` or `"bond"`.
   * @throws {@link ValueError} if a part is not a `SimpleLocation` or fewer than two parts are given.
   */
  constructor(parts: Iterable<SimpleLocation>, operator = "join") {
    super();
    this.operator = operator;
    const list = [...parts];
    this.parts = list;
    for (const loc of this.parts) {
      if (!(loc instanceof SimpleLocation)) {
        throw new ValueError(`CompoundLocation should be given a list of SimpleLocation objects, not ${pyClassRepr(loc)}`);
      }
    }
    if (list.length < 2) throw new ValueError(`CompoundLocation should have at least 2 parts, not ${pyRepr(list)}`);
  }

  toString(): string {
    return `${this.operator}{${this.parts.map((p) => p.toString()).join(", ")}}`;
  }

  repr(): string {
    return `${this.constructor.name}(${pyRepr(this.parts)}, ${pyRepr(this.operator)})`;
  }

  /** The common strand of all parts, or null if they differ. Assigning sets every part. */
  get strand(): Strand {
    const first = this.parts[0]!.strand;
    return this.parts.every((p) => p.strand === first) ? first : null;
  }

  set strand(value: Strand) {
    for (const loc of this.parts) loc.strand = value;
  }

  /** Concatenate another simple/compound location (same operator) or shift by an integer. @throws {@link NotImplementedError} otherwise. */
  add(other: Location | number): Location {
    if (other instanceof SimpleLocation) return new CompoundLocation([...this.parts, other], this.operator);
    if (other instanceof CompoundLocation) {
      if (this.operator !== other.operator) throw new ValueError(`Mixed operators ${this.operator} and ${other.operator}`);
      return new CompoundLocation([...this.parts, ...other.parts], this.operator);
    }
    if ((typeof other === "number" && Number.isInteger(other)) || other instanceof IntPosition) return this.shift(Number(other));
    throw new NotImplementedError();
  }

  /** `other + this` for a simple location, another compound location, or an integer. @throws {@link NotImplementedError} otherwise. */
  radd(other: Location | number): Location {
    if (other instanceof SimpleLocation) return new CompoundLocation([other, ...this.parts], this.operator);
    if (other instanceof CompoundLocation) return other.add(this);
    if (typeof other === "number" && Number.isInteger(other)) return this.shift(other);
    throw new NotImplementedError();
  }

  contains(value: number | Position): boolean {
    return this.parts.some((loc) => loc.contains(value));
  }

  get length(): number {
    return this.parts.reduce((total, loc) => total + loc.length, 0);
  }

  *[Symbol.iterator](): Iterator<number> {
    for (const loc of this.parts) yield* loc;
  }

  equals(other: unknown): boolean {
    if (!(other instanceof CompoundLocation)) return false;
    if (this.parts.length !== other.parts.length || this.operator !== other.operator) return false;
    return this.parts.every((p, i) => p.equals(other.parts[i]));
  }

  /** @internal */
  shift(offset: number): CompoundLocation {
    return new CompoundLocation(this.parts.map((loc) => loc.shift(offset)), this.operator);
  }

  /** Flipping unstranded parts also reverses their order. @internal */
  flip(length: number): CompoundLocation {
    if (this.parts.every((loc) => loc.strand === null)) {
      return new CompoundLocation([...this.parts].reverse().map((loc) => loc.flip(length)), this.operator);
    }
    return new CompoundLocation(this.parts.map((loc) => loc.flip(length)), this.operator);
  }

  /** The lowest start among the parts. */
  get start(): Position {
    return this.parts.map((p) => p.start).reduce((a, b) => (b.valueOf() < a.valueOf() ? b : a));
  }

  /** The highest end among the parts. */
  get end(): Position {
    return this.parts.map((p) => p.end).reduce((a, b) => (b.valueOf() > a.valueOf() ? b : a));
  }

  /** Always null: a compound location has no single reference. */
  get ref(): null { return null; }

  /** Always null. */
  get refDb(): null { return null; }

  extract(parentSequence: ParentSequence, references?: References | null): ParentSequence {
    return this.parts.map((loc) => loc.extract(parentSequence, references)).reduce(concatParts);
  }
}
