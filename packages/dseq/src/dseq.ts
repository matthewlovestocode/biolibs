/**
 * `pydna.dseq.Dseq`: a double-stranded DNA or RNA molecule whose ends are part of the object.
 *
 * Where Biopython's `Seq` is one strand of letters, a `Dseq` knows what is opposite every base, so a
 * restriction fragment's sticky ends, a blunt end and a nicked or single-stranded stretch are all states
 * the molecule itself carries rather than something a caller has to track alongside it. The whole thing
 * is held as one dscode string — see `alphabet.ts` — which makes most of the methods below a translation
 * or a slice of that string.
 */

import { KeyError, ValueError } from "@biolibs/core";
import { IUPACData } from "@biolibs/seq";
import { getParts, type DseqParts, dsBreaks, pairToCode, representationTuple, reverseComplementCode, toCrick,
  toFull, toWatson } from "./alphabet.js";

/** What kind of end a molecule has: a 5' or 3' overhang, a blunt end, or one strand only. */
export type EndType = "blunt" | "5'" | "3'" | "single";

/** How long a molecule may be before `toString()` shortens its runs. */
const LENGTH_LIMIT_FOR_REPR = 30;

/** @param text - Any string. @returns It without leading or trailing spaces, as Python's `strip` leaves it. */
const strip = (text: string): string => text.replace(/^ +| +$/g, "");

/**
 * All maximal common substrings of two strings that are at least `limit` long.
 *
 * pydna gets these from a suffix array in `pydivsufsort` and then sorts them by length, longest first,
 * ties by position. Only the longest matters to the one caller here — the constructor, which anneals two
 * strands — so this returns the longest match and how many there are of that length, which is what
 * decides between an answer and pydna's "more than one way of annealing" refusal.
 *
 * @param x - One string. @param y - The other. @param limit - The shortest match worth reporting.
 * @returns The first match in pydna's ordering and how many share its length, or null for no match.
 */
function longestCommonSubstring(x: string, y: string, limit: number):
{ posX: number; posY: number; length: number; ties: number } | null {
  let best: { posX: number; posY: number; length: number } | null = null;
  let ties = 0;
  for (let i = 0; i < x.length; i++) {
    for (let j = 0; j < y.length; j++) {
      // Only the start of a maximal match is considered, so each match is found once.
      if (x[i] !== y[j] || (i > 0 && j > 0 && x[i - 1] === y[j - 1])) continue;
      let length = 0;
      while (i + length < x.length && j + length < y.length && x[i + length] === y[j + length]) length += 1;
      if (length < limit) continue;
      if (best === null || length > best.length) { best = { posX: i, posY: j, length }; ties = 1; }
      // pydna's sort breaks a tie on position, so the first one in index order wins.
      else if (length === best.length) ties += 1;
    }
  }
  return best === null ? null : { ...best, ties };
}

/** A double-stranded sequence: pydna's `Dseq`. */
export class Dseq {
  /** The molecule as one dscode letter per position. */
  private data: string;
  /** Whether the molecule is a closed circle. */
  circular: boolean;
  /** Where this molecule came from in a larger one, which pydna carries along unchanged. */
  pos: number;

  /**
   * @param watson - The upper strand, or a whole dscode string when `crick` is left out.
   * @param crick - The lower strand, read 5' to 3', which is annealed against `watson`.
   * @param ovhg - How far the lower strand starts to the left of the upper one; inferred when omitted.
   * @param circular - Whether the molecule is a closed circle. @param pos - Carried along unchanged.
   * @throws ValueError for an overhang without a lower strand, strands that cannot be annealed or can be
   *   annealed in more than one way, a base pair that cannot exist, or a molecule split in two.
   */
  constructor(watson: string, crick: string | null = null, ovhg: number | null = null, circular = false,
    pos = 0) {
    let data: string;
    if (crick === null) {
      if (ovhg !== null) throw new ValueError("ovhg (overhang) defined without a crick strand.");
      data = watson;
    } else {
      if (ovhg === null) {
        // `math.log` of an *int* leaves the value out of its complaint, where a float's is included.
        if (watson.length === 0) throw new ValueError("expected a positive input");
        const limit = Math.trunc(Math.log(watson.length) / Math.log(4));
        // pydna looks for the overlap with a suffix array in a C extension, which fails on an empty
        // string before it can report that the strands do not anneal.
        if (crick.length === 0) {
          throw new ValueError("zero-size array to reduction operation maximum which has no identity");
        }
        // pydna's `rc` is the dscode complement table plus a reversal, which over plain bases is the
        // ordinary reverse complement.
        const reversed = reverseComplementCode(crick);
        const match = longestCommonSubstring(watson.toLowerCase(), reversed.toLowerCase(), limit);
        if (match === null) {
          throw new ValueError("Could not anneal the two strands."
            + ` looked for annealing with at least ${limit} basepairs`
            + " Please provide and overhang value (ovhg parameter)");
        }
        if (match.ties > 1) {
          throw new ValueError("More than one way of annealing the strands. Please provide ovhg value");
        }
        ovhg = match.posY - match.posX;
      }
      // Both strands are padded so that paired bases line up, and then read off a column at a time.
      const sense = " ".repeat(Math.max(ovhg, 0)) + watson;
      const antisense = " ".repeat(Math.max(-ovhg, 0)) + [...crick].reverse().join("");
      const width = Math.max(sense.length, antisense.length);
      let encoded = "";
      for (let i = 0; i < width; i++) encoded += pairToCode(sense[i] ?? " ", antisense[i] ?? " ");
      data = strip(encoded);
    }
    this.data = data;
    this.circular = circular;
    this.pos = pos;
    const breaks = dsBreaks(circular ? data + data.slice(0, 1) : data);
    if (breaks.length > 0) {
      throw new ValueError(`Molecule is internally split in ${breaks.length} location(s):\n\n${breaks.join("")}`.trimEnd());
    }
  }

  /**
   * Build a molecule from a dscode string that is already known to be sound, without any checking.
   *
   * @param data - The dscode string. @param circular - Whether it is a closed circle.
   * @param pos - Carried along unchanged.
   * @returns The molecule.
   */
  static quick(data: string, circular = false, pos = 0): Dseq {
    const out: Dseq = Object.create(Dseq.prototype);
    out.data = data;
    out.circular = circular;
    out.pos = pos;
    return out;
  }

  /**
   * Build a molecule from a full sequence and how far each end is single stranded.
   *
   * @param fullSequence - Both strands' bases, as the blunt molecule would read.
   * @param crickOvhg - The left end's overhang. @param watsonOvhg - The right end's.
   * @returns The molecule.
   */
  static fromFullSequenceAndOverhangs(fullSequence: string, crickOvhg: number, watsonOvhg: number): Dseq {
    const reverse = new Dseq(fullSequence).reverseComplement().toString();
    let watson = fullSequence, crick = reverse;
    if (crickOvhg < 0) crick = crick.slice(0, crickOvhg);
    else if (crickOvhg > 0) watson = watson.slice(crickOvhg);
    if (watsonOvhg < 0) watson = watson.slice(0, watsonOvhg);
    else if (watsonOvhg > 0) crick = crick.slice(watsonOvhg);
    return new Dseq(watson, crick, crickOvhg);
  }

  /**
   * Build a molecule from two lines of text, the upper strand over the lower one.
   *
   * @param text - The two lines, indented as they would be drawn; a `Dseq(...)` header line is ignored.
   * @returns The molecule.
   */
  static fromRepresentation(text: string): Dseq {
    const lines = cleandoc(`\n${text}`).split("\n")
      .filter((line) => line.trim() !== "" && !line.trim().startsWith("Dseq("));
    const [watson, crick] = [lines[0] ?? "", lines[1] ?? ""];
    const ovhgW = watson.length - watson.replace(/^\s+/, "").length;
    const ovhgC = -(crick.length - crick.replace(/^\s+/, "").length);
    return new Dseq(watson.trim(), [...crick.trim()].reverse().join(""), ovhgW || ovhgC);
  }

  /** The upper strand, 5' to 3'. */
  get watson(): string { return strip(toWatson(this.data)); }

  /** The lower strand, 5' to 3'. */
  get crick(): string { return [...strip(toCrick(this.data))].reverse().join(""); }

  /** How many base pairs long the molecule is. */
  get length(): number { return this.data.length; }

  /** The pieces the molecule splits into: its overhangs and its double-stranded middle. */
  getParts(): DseqParts { return getParts(this.data); }

  /** How far the lower strand starts to the left of the upper one, or null for a single strand. */
  get leftOvhg(): number | null {
    const parts = this.getParts();
    if (parts.singleWatson || parts.singleCrick) return null;
    return -parts.stickyLeft5.length || parts.stickyLeft3.length;
  }

  /** The same as {@link Dseq.leftOvhg}, under pydna's other name for it. */
  get ovhg(): number | null { return this.leftOvhg; }

  /** How far the upper strand ends to the left of the lower one, or null for a single strand. */
  get rightOvhg(): number | null {
    const parts = this.getParts();
    if (parts.singleWatson || parts.singleCrick) return null;
    return -parts.stickyRight5.length || parts.stickyRight3.length;
  }

  /** The same as {@link Dseq.rightOvhg}, under pydna's other name for it. */
  get watsonOvhg(): number | null { return this.rightOvhg; }

  /** @returns The blunt, fully double-stranded reading of the molecule, which is what `str()` gives. */
  toString(): string { return toFull(this.data); }

  /** @returns The same as {@link Dseq.toString}, under pydna's other name for it. */
  toBluntString(): string { return this.toString(); }

  /** @returns The molecule drawn as pydna draws it: a header line, then the two strands. */
  figure(): string {
    const header = `Dseq(${this.circular ? "o" : "-"}${this.length})`;
    let [watson, crick] = representationTuple(this.data, LENGTH_LIMIT_FOR_REPR);
    watson = watson || "|".repeat(crick.length);
    crick = crick || "|".repeat(watson.length);
    return `${header}\n${watson}\n${crick}`;
  }

  /** @returns What kind of end the left side is, and the overhang's bases in lower case. */
  fivePrimeEnd(): [EndType, string] {
    const parts = this.getParts();
    const sticky5 = toWatson(parts.stickyLeft5);
    const sticky3 = [...toCrick(parts.stickyLeft3)].reverse().join("");
    return endOf(parts, sticky5, sticky3);
  }

  /** @returns What kind of end the right side is, and the overhang's bases in lower case. */
  threePrimeEnd(): [EndType, string] {
    const parts = this.getParts();
    const sticky5 = [...toCrick(parts.stickyRight5)].reverse().join("");
    const sticky3 = toWatson(parts.stickyRight3);
    return endOf(parts, sticky5, sticky3);
  }

  /** @returns Whether both ends are blunt and the molecule is not circular. */
  isblunt(): boolean {
    const parts = this.getParts();
    return !(parts.stickyRight5 || parts.stickyRight3 || parts.stickyLeft3 || parts.stickyLeft5 || this.circular);
  }

  /** @returns The molecule with the left end filled in to double stranded. */
  castToDsLeft(): Dseq {
    const p = this.getParts();
    return new Dseq(toFull(p.stickyLeft5 || p.stickyLeft3) + p.middle + (p.stickyRight5 || p.stickyRight3));
  }

  /** @returns The molecule with the right end filled in to double stranded. */
  castToDsRight(): Dseq {
    const p = this.getParts();
    return new Dseq((p.stickyLeft5 || p.stickyLeft3) + p.middle + toFull(p.stickyRight5 || p.stickyRight3));
  }

  /** @returns The molecule with both ends filled in to double stranded. */
  castToDs(): Dseq { return this.castToDsLeft().castToDsRight(); }

  /** @returns The reverse complement, which keeps the molecule's topology. */
  reverseComplement(): Dseq { return Dseq.quick(reverseComplementCode(this.data), this.circular); }

  /** @returns The same as {@link Dseq.reverseComplement}, under pydna's short name for it. */
  rc(): Dseq { return this.reverseComplement(); }

  /**
   * @param start - Where to start. @param end - Where to stop, exclusive.
   * @returns That stretch of the molecule, as a linear one.
   * @throws TypeError for a circular molecule, whose wrapping slices are not ported yet.
   */
  slice(start?: number, end?: number): Dseq {
    if (this.circular) throw new TypeError("slicing a circular Dseq is not ported yet");
    return Dseq.quick(this.data.slice(start, end), false, this.pos);
  }

  /**
   * @param other - Another molecule.
   * @returns Whether both strands and the left overhang match, ignoring case, with the same topology.
   */
  equals(other: unknown): boolean {
    if (!(other instanceof Dseq)) return false;
    return other.watson.toLowerCase() === this.watson.toLowerCase()
      && other.crick.toLowerCase() === this.crick.toLowerCase()
      && other.ovhg === this.ovhg && this.circular === other.circular;
  }

  /**
   * Ligate another molecule onto the right end of this one.
   *
   * @param other - The molecule to add, or a string, which is taken as a blunt double-stranded one.
   * @returns The ligated molecule — or, when this molecule is empty, whatever was handed in, which is a
   *   string when a string was given: pydna returns a copy of `other` without looking at it.
   * @throws TypeError when either molecule is circular or the ends do not pair.
   */
  add(other: Dseq | string): Dseq | string {
    if (this.circular) throw new TypeError("circular DNA cannot be ligated!");
    if (other instanceof Dseq && other.circular) throw new TypeError("circular DNA cannot be ligated!");
    // An empty `other` leaves this molecule alone, and an empty molecule gives `other` straight back.
    if (other === "" || (other instanceof Dseq && other.length === 0)) {
      return Dseq.quick(this.data, this.circular, this.pos);
    }
    if (this.length === 0) {
      return typeof other === "string" ? other : Dseq.quick(other.data, other.circular, other.pos);
    }
    const otherDseq = typeof other === "string" ? new Dseq(other) : other;
    const [selfType, selfTail] = this.threePrimeEnd();
    const [otherType, otherTail] = otherDseq.fivePrimeEnd();
    const err = new TypeError("sticky ends not compatible!");
    if (selfType !== otherType && selfType !== "single" && otherType !== "single") throw err;
    if (selfTail.length !== otherTail.length) throw err;
    const tail = [...otherTail].reverse().join("");
    for (let i = 0; i < selfTail.length; i++) {
      // Every pair the two tails would form has to be one the alphabet knows.
      try { pairToCode(selfTail[i]!, tail[i]!); } catch { throw err; }
    }
    return new Dseq(this.watson + otherDseq.watson, otherDseq.crick + this.crick, this.ovhg);
  }

  /**
   * @param times - How many copies to join end to end.
   * @returns Them ligated into one molecule, or an empty molecule for `times` of zero or less.
   * @throws ValueError for a fraction, and TypeError when the ends do not pair.
   */
  multiply(times: number): Dseq {
    if (!Number.isInteger(times)) throw new ValueError("TypeError: can't multiply sequence by non-int");
    if (times <= 0) return new Dseq("");
    let out: Dseq = this;
    for (let i = 1; i < times; i++) out = out.add(this) as Dseq;
    return out;
  }

  /**
   * @returns The molecule closed into a circle.
   * @throws TypeError when the two ends are not compatible.
   */
  looped(): Dseq {
    if (this.circular) return Dseq.quick(this.data, true, this.pos);
    const [type5, sticky5] = this.fivePrimeEnd();
    const [type3, sticky3] = this.threePrimeEnd();
    const err = new TypeError("DNA cannot be circularized.\n5' and 3' sticky ends not compatible!");
    if (type5 !== type3) throw err;
    // Only an incompatible-ends TypeError becomes this refusal; anything else the ligation raises -- a
    // single-stranded molecule's annealing, for one -- comes straight out, as it does in pydna.
    try { this.add(this); } catch (e) { if (e instanceof TypeError) throw err; throw e; }
    void sticky5;
    const out = this.castToDsLeft().slice(0, this.length - sticky3.length);
    out.circular = true;
    return out;
  }

  /**
   * @param shift - How far to rotate the origin.
   * @returns The same circle read from a different starting point.
   * @throws TypeError for a molecule that is not circular.
   */
  shifted(shift: number): Dseq {
    if (!this.circular) throw new TypeError("DNA is not circular.");
    const by = ((shift % this.length) + this.length) % this.length;
    if (by === 0) return Dseq.quick(this.data, true, this.pos);
    return Dseq.quick(this.data.slice(by) + this.data.slice(0, by), true, this.pos);
  }

  /** @returns The molecular weight in g/mol, with a 5'-phosphate on each strand as a digest leaves it. */
  mw(): number {
    const h2o = IUPACData.atomWeights["H"]! * 2 + IUPACData.atomWeights["O"]!;
    const weights: Record<string, number> = { ...IUPACData.unambiguousRnaWeights, ...IUPACData.unambiguousDnaWeights, " ": 0 };
    const strandWeight = (strand: string): number => {
      let total = 0;
      for (const base of strand.toUpperCase()) {
        // There is no weight for an ambiguity code, a loop or a mismatch, so the lookup fails as
        // Python's dict does.
        const weight = weights[base];
        if (weight === undefined) throw new KeyError(base);
        total += weight - h2o;
      }
      // Every run of spaces inside a strand is a gap, where the chain is not joined.
      total += h2o * (strand.match(/ +/g) ?? []).length;
      return total;
    };
    let watson = strandWeight(this.watson), crick = strandWeight(this.crick);
    if (watson && !this.circular) watson += h2o;
    if (crick && !this.circular) crick += h2o;
    return watson + crick;
  }
}

/**
 * Which end a molecule has, from its overhangs.
 *
 * @param parts - The molecule's pieces. @param sticky5 - The 5' overhang's bases.
 * @param sticky3 - The 3' overhang's bases.
 * @returns The kind of end and its bases in lower case, in pydna's own order of preference.
 */
function endOf(parts: DseqParts, sticky5: string, sticky3: string): [EndType, string] {
  const singleWatson = toWatson(parts.singleWatson);
  const singleCrick = [...toCrick(parts.singleCrick)].reverse().join("");
  if (singleWatson) return ["single", singleWatson.toLowerCase()];
  if (singleCrick) return ["single", singleCrick.toLowerCase()];
  if (sticky5 === "" && sticky3 === "") return ["blunt", ""];
  if (sticky5) return ["5'", sticky5.toLowerCase()];
  return ["3'", sticky3.toLowerCase()];
}

/**
 * Python's `inspect.cleandoc`: drop the first line's indentation, then the common indentation of the rest.
 *
 * @param text - The text. @returns It cleaned up as Python would leave it.
 */
function cleandoc(text: string): string {
  const lines = text.split("\n");
  let margin = Infinity;
  for (const line of lines.slice(1)) {
    const stripped = line.replace(/^ +/, "");
    if (stripped !== "") margin = Math.min(margin, line.length - stripped.length);
  }
  const out = [lines[0]!.replace(/^ +/, ""), ...lines.slice(1).map((l) => (Number.isFinite(margin) ? l.slice(margin) : l))];
  while (out.length > 0 && out[out.length - 1]!.trim() === "") out.pop();
  while (out.length > 0 && out[0]!.trim() === "") out.shift();
  return out.join("\n");
}
