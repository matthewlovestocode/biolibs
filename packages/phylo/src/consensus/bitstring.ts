/** `_BitString`: Biopython's helper for the clades of consensus trees, a string of `0` and `1` with bit operations. */

/** Python's `SyntaxError`, raised by `literal_eval("0b")`. */
class PySyntaxError extends Error { override name = "SyntaxError"; }

/** Binary text with the bit operations Biopython's `_BitString` offers; compare and use `value` as a key. */
export class BitString {
  /** The text. */
  readonly value: string;

  /**
   * @param strdata - Text made only of `0` and `1`.
   * @throws TypeError otherwise.
   */
  constructor(strdata: string) {
    if (!(typeof strdata === "string" && /^[01]*$/.test(strdata))) throw new TypeError("The input should be a binary string composed of '0' and '1'");
    this.value = strdata;
  }

  /** The number of characters. */
  get length(): number { return this.value.length; }

  private op(other: BitString, f: (a: bigint, b: bigint) => bigint): BitString {
    const lit = (s: string): bigint => { if (s === "") throw new PySyntaxError("invalid binary literal (<unknown>, line 1)"); return BigInt("0b" + s); };
    return new BitString(f(lit(this.value), lit(other.value)).toString(2).padStart(this.value.length, "0"));
  }

  /** Bitwise and (`&`). */
  and(other: BitString): BitString { return this.op(other, (a, b) => a & b); }
  /** Bitwise or (`|`). */
  or(other: BitString): BitString { return this.op(other, (a, b) => a | b); }
  /** Bitwise exclusive or (`^`). */
  xor(other: BitString): BitString { return this.op(other, (a, b) => a ^ b); }

  /** Python's `repr`: `_BitString('0110')`. */
  repr(): string { return `_BitString('${this.value}')`; }
  /** The text. */
  toString(): string { return this.value; }

  /** The number of `1`s (Python's `count("1")`). */
  ones(): number { let n = 0; for (const c of this.value) if (c === "1") n++; return n; }

  /** Positions of the `1`s. */
  indexOne(): number[] { return Array.from(this.value, (c, i) => (c === "1" ? i : -1)).filter((i) => i >= 0); }
  /** Positions of the `0`s. */
  indexZero(): number[] { return Array.from(this.value, (c, i) => (c === "0" ? i : -1)).filter((i) => i >= 0); }

  /** Whether this contains the other (the other's `1`s are among this one's). */
  contains(other: BitString): boolean { return this.xor(other).ones() === this.ones() - other.ones(); }
  /** Whether the two have no `1` in common. */
  independent(other: BitString): boolean { return this.xor(other).ones() === this.ones() + other.ones(); }
  /** Whether one contains the other or they are independent. */
  iscompatible(other: BitString): boolean { return this.contains(other) || other.contains(this) || this.independent(other); }

  /** The bit string of a list of booleans. */
  static fromBool(bools: Iterable<boolean>): BitString { return new BitString(Array.from(bools, (b) => (b ? "1" : "0")).join("")); }
}
