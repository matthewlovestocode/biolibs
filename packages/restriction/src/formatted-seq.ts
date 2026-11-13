/** `FormattedSeq`: a DNA sequence prepared for restriction searches (upper case, 1-based, linear or circular). */

import { Seq, MutableSeq } from "@biolibs/seq";
import { pyClassRepr } from "@biolibs/core";

/** A site found by {@link FormattedSeq.finditer}: where it starts (1-based) and the match. */
export type SiteMatch = [start: number, match: RegExpMatchArray];

/** Python's `TypeError`-valued checks are thrown as the built-in `TypeError`. */
type SeqLike = Seq | MutableSeq;

/**
 * A sequence with the whitespace and digits removed and every letter upper-cased, behind one leading space so
 * that positions count from 1. Slicing gives the original case back and the original sequence class.
 */
export class FormattedSeq {
  /** Whether the original was lower case. */
  lower: boolean;
  /** The sequence, preceded by a space. */
  data: string;
  /** Whether the sequence is linear (false: circular). */
  linear: boolean;
  /** The class slices are made in. */
  klass: typeof Seq | typeof MutableSeq;

  /**
   * @param seq - A `Seq`, `MutableSeq` or another `FormattedSeq` (copied).
   * @param linear - False for a circular sequence.
   * @throws TypeError for anything else, or for characters that are not letters, digits or white space.
   */
  constructor(seq: SeqLike | FormattedSeq, linear = true) {
    if (seq instanceof Seq || seq instanceof MutableSeq) {
      this.lower = seq.islower();
      const text = seq.toString();
      // Whitespace and digits are dropped; every remaining character must be a letter.
      const kept = text.replace(/[ \t\n\r\x0b\x0c0-9]/g, "");
      if (/[^A-Za-z]/.test(kept)) throw new TypeError(`Invalid character found in ${text}`);
      this.data = " " + kept.toUpperCase();
      this.linear = linear;
      this.klass = seq.constructor as typeof Seq | typeof MutableSeq;
    } else if (seq instanceof FormattedSeq) {
      this.lower = seq.lower;
      this.data = seq.data;
      this.linear = seq.linear;
      this.klass = seq.klass;
    } else {
      throw new TypeError(`expected Seq or MutableSeq, got ${pyClassRepr(seq)}`);
    }
  }

  /** @returns The length of the sequence (without the leading space). */
  get length(): number { return this.data.length - 1; }

  /** @returns Python's repr, e.g. `FormattedSeq(Seq('GAATTC'), linear=True)`. */
  repr(): string { return `FormattedSeq(${this.slice(1).repr()}, linear=${this.linear ? "True" : "False"})`; }

  /** @param other - Anything. @returns Whether it is a `FormattedSeq` with the same repr. */
  equals(other: unknown): boolean { return other instanceof FormattedSeq && this.repr() === other.repr(); }

  /** Make the sequence circular, in place. */
  circularise(): void { this.linear = false; }
  /** Make the sequence linear, in place. */
  linearise(): void { this.linear = true; }
  /** @returns A linear copy. */
  toLinear(): FormattedSeq { const n = new FormattedSeq(this); n.linear = true; return n; }
  /** @returns A circular copy. */
  toCircular(): FormattedSeq { const n = new FormattedSeq(this); n.linear = false; return n; }
  /** @returns Whether the sequence is linear. */
  isLinear(): boolean { return this.linear; }

  /**
   * All matches of a pattern. A circular sequence is extended by its first `size - 1` letters so that sites across
   * the origin are found.
   *
   * @param pattern - A global regular expression.
   * @param size - The length of the site.
   * @returns `[start, match]` for each match, `start` counting from 1 (the data has a leading space).
   */
  finditer(pattern: RegExp, size: number): SiteMatch[] {
    const data = this.linear ? this.data : this.data + this.data.slice(1, size);
    return [...data.matchAll(pattern)].map((m) => [m.index!, m]);
  }

  /**
   * One base (Python `fseq[i]`), as a one-letter sequence in the original case and class.
   *
   * @param i - Index into the data (0 is the leading space; negative counts from the end).
   * @throws IndexError (`string index out of range`) beyond the ends.
   */
  at(i: number): Seq | MutableSeq {
    const n = this.data.length;
    if (i >= n || i < -n) throw Object.assign(new Error("string index out of range"), { name: "IndexError" });
    const ch = this.data[i < 0 ? n + i : i]!;
    return new this.klass(this.lower ? ch.toLowerCase() : ch) as Seq | MutableSeq;
  }

  /**
   * A piece of the sequence, in the original case and class. Python slicing rules: negative indexes count from the
   * end, out-of-range ones are clipped, and `data[0]` is the leading space.
   *
   * @param start - Start index into the data (1 is the first base).
   * @param stop - End index (exclusive).
   */
  slice(start?: number, stop?: number): Seq | MutableSeq {
    const piece = this.data.slice(start, stop);
    return new this.klass(this.lower ? piece.toLowerCase() : piece) as Seq | MutableSeq;
  }
}
