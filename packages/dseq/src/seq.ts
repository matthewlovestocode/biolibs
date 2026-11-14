/**
 * pydna's own `Seq`: a Biopython sequence that also knows how well it would be expressed.
 *
 * This is the class `Dseqrecord` and everything above it is built on, and what it adds to Biopython's `Seq`
 * is a set of questions a molecular biologist asks of a coding sequence — its GC content, where its rare
 * codons are, how strong its start and stop codons are, which open reading frames it contains, and its
 * checksum. The sequence behaviour itself is inherited unchanged and is measured under `docs/parity/`.
 *
 * Two of its methods are pydna's rather than Biopython's in a way worth noticing. `reverseComplement` goes
 * through pydna's dscode table instead of Biopython's, so it complements a mixed DNA/RNA sequence rather
 * than refusing it — `U` complements to `O`, not to `A`. And `seguid` is the SEGUID v2 of the upper-cased
 * sequence over the extended DNA alphabet plus `A`–`U`, so a DNA and an RNA reading of the same molecule
 * get the same identifier.
 */

import { lsseguid } from "@biolibs/seguid";
import { Seq as BioSeq, type TableArg } from "@biolibs/seq";
import { gcFraction, ProteinAnalysis, seq3 } from "@biolibs/seqtools";
import { KeyError, NotImplementedError } from "@biolibs/core";
import { reverseComplementCode } from "./alphabet.js";
import { N_END, RARE_CODONS, START_CODONS, STOP_CODONS } from "./data/codon.js";
import { type Orf, threeFrameOrfs } from "./orfs.js";

/** The organism whose codon tables are read when none is named. */
const DEFAULT_ORGANISM = "sce";

/**
 * A stretch of a sequence, as Python's `slice` with a step of 1.
 *
 * `rarecodons` returns these, and upstream they are real `slice` objects, so the step is carried even though
 * it is always 1.
 */
export interface SeqSlice {
  /** Where the stretch starts. */
  start: number;
  /** Where it ends. */
  stop: number;
  /** Always 1; pydna builds the slice with it set explicitly. */
  step: number;
}

/**
 * Look one organism's table up, raising as Python's dict subscript does for an organism it has never heard of.
 *
 * @param table - A per-organism table. @param organism - Which organism.
 * @returns That organism's entry.
 * @throws KeyError naming the organism, as indexing a dict with a missing key does.
 */
function forOrganism<T>(table: ReadonlyMap<string, T>, organism: string): T {
  const found = table.get(organism);
  if (found === undefined) throw new KeyError(organism);
  return found;
}

/**
 * pydna's `Seq`.
 *
 * @example
 * ```ts
 * const s = new PydnaSeq("ATGGCCTTTAAATTTGGGTGCTGA");
 * s.gc();            // 0.417
 * s.startcodon();    // 1.0
 * s.orfs(1);         // [[0, 24]]
 * s.seguid();        // "lsseguid=KHB8bb5NZYekmpEs-1GI0bktMYc"
 * ```
 */
export class PydnaSeq extends BioSeq {
  /**
   * Translate into protein, which comes back as a {@link ProteinSeq} rather than a plain sequence.
   *
   * pydna does not pass the table through, so the standard one is always used however this is called; that
   * is reproduced rather than tidied up, since a caller who asks for another table and silently gets the
   * standard one should get the same wrong answer here.
   *
   * @param _table - Accepted and ignored, as upstream ignores it.
   * @param stopSymbol - What marks a stop; `"*"` by default.
   * @param toStop - Stop at the first in-frame stop codon rather than translating through it.
   * @param cds - Check that the sequence is a complete coding sequence.
   * @param gap - What counts as a gap character.
   * @returns The protein.
   */
  override translate(_table?: TableArg, stopSymbol = "*", toStop = false, cds = false,
                     gap: string | null = "-"): never {
    const p = new BioSeq(this.toString()).translate(undefined, stopSymbol, toStop, cds, gap);
    // `never` because the base class promises `this`, and pydna deliberately returns another class here.
    return new ProteinSeq(p.toString()) as never;
  }

  /**
   * Transcribe DNA into RNA.
   *
   * @param _inplace - Accepted and ignored: pydna always builds a new sequence.
   * @returns The RNA.
   */
  override transcribe(_inplace = false): this {
    return new PydnaSeq(new BioSeq(this.toString()).transcribe().toString()) as this;
  }

  /**
   * The fraction of the sequence that is G or C, to three decimal places.
   *
   * @returns That fraction, which is 0 for an empty sequence.
   */
  gc(): number {
    return Math.round(gcFraction(this.toString().toUpperCase()) * 1000) / 1000;
  }

  /**
   * Where this sequence's rare codons are.
   *
   * Codons are read from the start in frame 0, and a trailing one or two bases are ignored.
   *
   * @param organism - Whose table of rare codons to use; `"sce"` by default, and `"eco"` is the other.
   * @returns One stretch per rare codon, in order.
   * @throws KeyError for an organism with no table.
   */
  rarecodons(organism = DEFAULT_ORGANISM): SeqSlice[] {
    const rare = forOrganism(RARE_CODONS, organism);
    const s = this.toString().toUpperCase();
    const slices: SeqSlice[] = [];
    for (let i = 0; i < Math.floor(this.length / 3); i++) {
      const [x, y] = [i * 3, i * 3 + 3];
      if (rare.includes(s.slice(x, y))) slices.push({ start: x, stop: y, step: 1 });
    }
    return slices;
  }

  /**
   * How strong this sequence's first codon is as a start.
   *
   * @param organism - Whose table to use; `"sce"` by default.
   * @returns The strength, or null when the first three bases are not a start codon that table lists. Note
   *   that `"eco"`'s table does not list `ATG`, so an ordinary gene gives null for it.
   * @throws KeyError for an organism with no table.
   */
  startcodon(organism = DEFAULT_ORGANISM): number | null {
    return forOrganism(START_CODONS, organism).get(this.toString().toUpperCase().slice(0, 3)) ?? null;
  }

  /**
   * How strong this sequence's last codon is as a stop.
   *
   * @param organism - Whose table to use; `"sce"` by default.
   * @returns The strength, or null when the last three bases are not a stop codon that table lists.
   * @throws KeyError for an organism with no table.
   */
  stopcodon(organism = DEFAULT_ORGANISM): number | null {
    return forOrganism(STOP_CODONS, organism).get(this.toString().toUpperCase().slice(-3)) ?? null;
  }

  /**
   * How long the protein would last, by the N-end rule.
   *
   * The rule reads the residue *after* the start codon, so this translates bases 3 to 6 and looks the
   * three-letter name of what comes out up.
   *
   * @param organism - Whose table to use; `"sce"` by default.
   * @returns A half-life as pydna words it, such as `">30 h"`, or null when there is no second residue.
   * @throws KeyError for an organism with no table.
   */
  nEnd(organism = DEFAULT_ORGANISM): string | null {
    // The table is looked up first because pydna writes `_n_end[organism].get(...)`, and Python evaluates
    // the subscript before the argument: an unknown organism raises before the translation can warn.
    const table = forOrganism(N_END, organism);
    // Through the base class on purpose: `translate` here promises a ProteinSeq, and what is wanted is the
    // plain three-letter name of the residue after the start codon.
    return table.get(seq3(new BioSeq(this.toString().slice(3, 6)).translate().toString())) ?? null;
  }

  /**
   * Every open reading frame, as a pair of positions.
   *
   * @param minsize - The shortest reading to report, in bases; 100 by default. See
   *   {@link threeFrameOrfs} for how pydna turns that into a codon count.
   * @returns One `[start, stop]` per reading, with the frame dropped.
   */
  orfs(minsize = 100): Array<readonly [number, number]> {
    return threeFrameOrfs(this.toString(), minsize).map(([, x, y]: Orf) => [x, y] as const);
  }

  /**
   * Every open reading frame, as the sequence of each, longest first.
   *
   * This is a different search from {@link orfs}: it is a regular expression over frame 0 only, run again
   * from one character past each match, so it finds overlapping readings in that frame and none in the
   * other two.
   *
   * @param minsize - The fewest codons between start and stop; 30 by default.
   * @returns The readings, longest first, each cut from this sequence and so keeping its case.
   */
  orfs2(minsize = 30): PydnaSeq[] {
    const orf = new RegExp(`ATG(?:...){${minsize},}?(?:TAG|TAA|TGA)`, "i");
    const s = this.toString();
    const found: Array<[number, number]> = [];
    let start = 0;
    for (;;) {
      // Searching from `start` rather than with a global regexp, because pydna advances by one character
      // after each hit so that overlapping readings are all found.
      const match = orf.exec(s.slice(start));
      if (match === null) break;
      const at = start + match.index;
      found.push([at, at + match[0].length]);
      start = at + 1;
    }
    const pieces = found.map(([x, y]) => new PydnaSeq(s.slice(x, y)));
    // Longest first. Python's sort is stable, so readings of one length keep the order they were found in.
    return pieces.sort((a, b) => b.length - a.length);
  }

  /**
   * This sequence's SEGUID v2 checksum, which identifies it wherever it turns up.
   *
   * @returns The checksum, in the URL-safe `lsseguid=` form.
   * @throws AssertionError for an empty sequence, which has no checksum.
   */
  seguid(): string {
    return lsseguid(this.toString().toUpperCase(), "{DNA-extended},AU") as string;
  }

  /**
   * The reverse complement, through pydna's own table rather than Biopython's.
   *
   * That table is the dscode one, which is why a mixed DNA/RNA sequence is complemented rather than
   * refused, and why `U` comes back as `O`.
   *
   * @returns The reverse complement, of this same class.
   */
  override reverseComplement(): this {
    return new (this.constructor as new (data: string) => this)(reverseComplementCode(this.toString()));
  }

  /** @returns The reverse complement; pydna's shorter name for {@link reverseComplement}. */
  rc(): this {
    return this.reverseComplement();
  }

  /**
   * Keep this class through a slice, an upper-casing or anything else that derives a new sequence, which is
   * what Biopython's own `__getitem__` does by building `self.__class__`.
   *
   * @param data - The derived sequence's content. @returns It, as a `PydnaSeq`.
   */
  protected override make(data: ConstructorParameters<typeof BioSeq>[0]): this {
    return new PydnaSeq(data) as this;
  }
}

/**
 * A protein, which refuses the questions that only make sense for nucleotides.
 *
 * Everything that would read the sequence as DNA or RNA — translating it again, complementing it,
 * transcribing it — raises rather than returning something meaningless. What it adds instead are the three
 * measurements `Bio.SeqUtils.ProtParam` provides.
 */
export class ProteinSeq extends BioSeq {
  /** The message every nucleotide-only method raises with. */
  static readonly NOT_PROTEIN = "Not defined for protein.";

  /** @throws NotImplementedError — translating a protein means nothing. */
  override translate(): never { throw new NotImplementedError(ProteinSeq.NOT_PROTEIN); }
  /** @throws NotImplementedError — a protein has no complement. */
  override complement(): never { throw new NotImplementedError(ProteinSeq.NOT_PROTEIN); }
  /** @throws NotImplementedError — a protein has no RNA complement. */
  override complementRna(): never { throw new NotImplementedError(ProteinSeq.NOT_PROTEIN); }
  /** @throws NotImplementedError — a protein has no reverse complement. */
  override reverseComplement(): never { throw new NotImplementedError(ProteinSeq.NOT_PROTEIN); }
  /** @throws NotImplementedError — a protein has no reverse RNA complement. */
  override reverseComplementRna(): never { throw new NotImplementedError(ProteinSeq.NOT_PROTEIN); }
  /** @throws NotImplementedError — a protein cannot be transcribed. */
  override transcribe(): never { throw new NotImplementedError(ProteinSeq.NOT_PROTEIN); }
  /** @throws NotImplementedError — a protein cannot be back-transcribed. */
  override backTranscribe(): never { throw new NotImplementedError(ProteinSeq.NOT_PROTEIN); }
  /** @throws NotImplementedError — upstream this is the very same function as `reverseComplement`. */
  rc(): never { throw new NotImplementedError(ProteinSeq.NOT_PROTEIN); }

  /**
   * @returns This protein's SEGUID v2 checksum, over the extended protein alphabet.
   * @throws AssertionError for an empty sequence.
   */
  seguid(): string {
    return lsseguid(this.toString().toUpperCase(), "{protein-extended}") as string;
  }

  /** @returns A `ProteinAnalysis` over this sequence, which the three measurements below read. */
  analysis(): ProteinAnalysis {
    return new ProteinAnalysis(this.toString());
  }

  /** @returns The molecular weight. */
  molecularWeight(): number { return this.analysis().molecularWeight(); }

  /**
   * @returns The isoelectric point.
   * @throws IndexError for an empty sequence, which has no terminal residues to charge.
   */
  pI(): number { return this.analysis().isoelectricPoint(); }

  /** @returns The instability index, over 40 meaning the protein is likely to be short-lived. */
  instabilityIndex(): number { return this.analysis().instabilityIndex(); }

  /**
   * Keep this class through a slice, which `ProteinSeq.__getitem__` does explicitly upstream so that a
   * piece of a protein is still refused the nucleotide questions.
   *
   * @param data - The derived sequence's content. @returns It, as a `ProteinSeq`.
   */
  protected override make(data: ConstructorParameters<typeof BioSeq>[0]): this {
    return new ProteinSeq(data) as this;
  }
}
