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
import { Seq as BioSeq } from "@biolibs/seq";
import { circularSlice, pythonSlice } from "./circular.js";
import { threeFrameOrfs } from "./orfs.js";
import { cleandoc, type EndType, endOf, LENGTH_LIMIT_FOR_REPR, longestCommonSubstring, strip } from "./dseq-util.js";


/** A double-stranded sequence: pydna's `Dseq`. */
export class Dseq {
  /** The molecule as one dscode letter per position. */
  private data: string;

  /** The molecule's dscode string, which is what pydna keeps in `_data`. */
  get code(): string { return this.data; }
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

  /**
   * The molecule's own storage: pydna's dscode, one letter per base *pair*.
   *
   * pydna reads this as `seq._data` from outside the class, and `Dseqrecord.format("… dscode")` is why —
   * it writes the encoding itself into a file rather than the watson strand.
   *
   * @returns The dscode string.
   */
  get dscode(): string { return this.data; }

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

  /**
   * Translate the molecule's code into protein.
   *
   * Read over the dscode string itself, as pydna does: a molecule whose positions are all double-stranded
   * has a code that is its own sequence, but one with single-stranded stretches carries letters that are
   * not bases, and they are translated as what they are rather than as the base underneath.
   *
   * @param table - Which genetic code. @param stopSymbol - What marks a stop.
   * @param toStop - Stop at the first in-frame stop codon. @param cds - Check it is a coding sequence.
   * @param gap - What counts as a gap.
   * @returns The protein.
   * @throws What the ported `Bio.Seq.translate` throws, including the `TranslationError` that `isorf`
   *   relies on to answer false.
   */
  translate(table: string | number = "Standard", stopSymbol = "*", toStop = false, cds = false,
            gap: string | null = "-"): BioSeq {
    return new BioSeq(this.data).translate(table, stopSymbol, toStop, cds, gap);
  }

  /**
   * @returns The same text as {@link Dseq.figure}, which is what pydna's `repr` of a molecule gives: the
   *   header and the two strands, not a one-line constructor call. A record printing itself ends with
   *   this, so it is the name the printing machinery looks for.
   */
  repr(): string { return this.figure(); }

  /**
   * @returns The dscode as bytes. pydna's `Dseq` is a Biopython sequence and so has this; the port's is a
   *   class of its own, and record printing asks for it before deciding what to show.
   */
  toBytes(): Uint8Array {
    const out = new Uint8Array(this.data.length);
    for (let i = 0; i < this.data.length; i++) out[i] = this.data.charCodeAt(i);
    return out;
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
   * @param start - Where to start. @param end - Where to stop, exclusive. @param step - How far to move
   *   each time, which may be negative.
   * @returns That stretch of the molecule, always as a linear one — a slice of a circle comes out open,
   *   as pydna's does — wrapping round the origin as far as it needs to when this molecule is circular.
   */
  slice(start?: number | null, end?: number | null, step?: number | null): Dseq {
    const data = this.circular
      ? circularSlice(this.data, start, end, step)
      : pythonSlice(this.data, start, end, step);
    return Dseq.quick(data, false, this.pos);
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

  /**
   * The same molecule with its code in upper case.
   *
   * **This loses circularity.** pydna inherits `upper` from Biopython, which builds a fresh sequence from
   * the upper-cased data and knows nothing about pydna's `circular` flag, so a closed circle comes back
   * linear. Reproduced rather than corrected: a caller who upper-cases a plasmid gets a linear molecule
   * from pydna too, and the port must not quietly disagree about what they are holding.
   *
   * @returns The upper-cased molecule, linear whatever this one was.
   */
  upper(): Dseq {
    return Dseq.quick(this.data.toUpperCase(), false, this.pos);
  }

  /**
   * The same molecule with its code in lower case, which loses circularity for the same reason as
   * {@link Dseq.upper}.
   *
   * @returns The lower-cased molecule, linear whatever this one was.
   */
  lower(): Dseq {
    return Dseq.quick(this.data.toLowerCase(), false, this.pos);
  }

  /**
   * Every open reading frame in the three forward frames of the code.
   *
   * Read over the dscode string itself, so a position that is single-stranded or a mismatch carries a
   * letter that is not a base and simply never matches a codon. The search does not wrap, even on a
   * circle, because it is the same frame-by-frame scan pydna uses for a plain sequence.
   *
   * @param minsize - The shortest reading to report, in bases; pydna's own default of 100 applies here.
   * @returns One `[start, stop]` per reading, with the frame dropped.
   */
  orfs(minsize = 100): Array<readonly [number, number]> {
    return threeFrameOrfs(this.data, minsize).map(([, x, y]) => [x, y] as const);
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
