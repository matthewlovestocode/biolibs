/**
 * `Primer`: a short piece of DNA that starts a PCR, and knows which part of itself binds.
 *
 * A primer often carries a tail that does not match the template — a restriction site, or a stretch of
 * homology for the assembly that comes after. The **footprint** is the part at the 3' end that does
 * bind; the **tail** is the rest. The engine keeps them apart because only the footprint has to be
 * found on the template.
 */

import { PydnaSeq, type ProteinSeq } from "@biolibs/dseq";
import { PydnaSeqRecord } from "@biolibs/dseqrecord";
import type { SeqFeature } from "@biolibs/seqfeature";

/** What a primer can be built from: text, a sequence, or another record. */
export type PrimerLike = string | PydnaSeq | ProteinSeq | PydnaSeqRecord | { seq?: unknown; features?: unknown };

/** How a primer is set up beyond the record itself. */
export interface PrimerOptions {
  /** The product this primer makes, when it came from a design. */
  amplicon?: unknown;
  /** Where it binds on the template, when that is known. */
  position?: number | null;
  /** How many bases at the 3' end bind. Zero, or left out, means the whole primer. */
  footprint?: number;
}

/**
 * Mirrors `pydna.primer.Primer`.
 *
 * @example
 * ```ts
 * const primer = new Primer("ggatccACGTACGTACGT", { footprint: 12 });
 * primer.footprint;   // "ACGTACGTACGT"
 * primer.tail;        // "ggatcc"
 * ```
 */
export class Primer extends PydnaSeqRecord {
  /** The product this primer makes, when it came from a design. */
  amplicon: unknown = null;
  /** Where it binds on the template, when that is known. */
  position: number | null = null;
  /** How many bases at the 3' end bind. pydna keeps this as `_fp`. */
  fp = 0;

  /**
   * @param record - The primer: text, a sequence, or a record to take the sequence and labels from.
   * @param options - Its amplicon, position and footprint.
   */
  constructor(record: PrimerLike, options?: PrimerOptions);
  /**
   * The same positional shape as the record classes, so that the machinery which rebuilds a record —
   * reverse complementing, slicing — can rebuild a primer too.
   *
   * @param record - The primer. @param id - The identifier. @param name - The name.
   * @param description - The description. @param dbxrefs - Cross-references. @param features - Features.
   * @param annotations - Annotations. @param options - Its amplicon, position and footprint.
   */
  constructor(record: PrimerLike, id: string | null, name?: string, description?: string,
              dbxrefs?: string[] | null, features?: SeqFeature[] | null,
              annotations?: Map<string, unknown> | null, options?: PrimerOptions);
  constructor(record: PrimerLike, idOrOptions: string | null | PrimerOptions = "id", name = "name",
              description = "description", dbxrefs: string[] | null = null, features: SeqFeature[] | null = null,
              annotations: Map<string, unknown> | null = null, trailing: PrimerOptions = {}) {
    const asOptions = typeof idOrOptions === "object" && idOrOptions !== null;
    // The record classes rebuild a record by calling the constructor positionally, with one argument
    // more than this takes, so whatever lands in the last place may be no options at all.
    const options = (asOptions ? (idOrOptions as PrimerOptions) : trailing) as PrimerOptions | null;
    const holder = record as { seq?: unknown; features?: unknown; id?: string | null; name?: string; description?: string };
    const fromRecord = holder?.features !== undefined;
    const text = fromRecord ? String(holder.seq ?? "") : String(record);
    super(new PydnaSeq(text),
          fromRecord ? (holder.id ?? null) : (asOptions ? "id" : (idOrOptions as string | null)),
          fromRecord ? (holder.name ?? "name") : name,
          fromRecord ? (holder.description ?? "description") : description,
          dbxrefs, fromRecord ? [...((holder.features ?? []) as SeqFeature[])] : features, annotations);
    this.amplicon = options?.amplicon ?? null;
    this.position = options?.position ?? null;
    // pydna's `footprint or len(record)`: no footprint, or one of zero, means the whole primer binds.
    const footprint = options?.footprint;
    this.fp = footprint !== undefined && footprint !== 0 ? footprint : text.length;
  }

  /** The primer's bases. */
  get text(): string {
    return this.seq?.toString() ?? "";
  }

  /** The part at the 3' end that binds the template. */
  get footprint(): string {
    // Python clamps a start that reaches back past the beginning; JavaScript would count from the end.
    return this.fp ? this.text.slice(Math.max(0, this.text.length - this.fp)) : "";
  }

  /** The part at the 5' end that does not. */
  get tail(): string {
    return this.fp ? this.text.slice(0, Math.max(0, this.text.length - this.fp)) : "";
  }

  /** @returns pydna's one-line description: the identifier, the length and the sequence, 5' to 3'. */
  override repr(): string {
    const text = this.text;
    const shortened = `${text.slice(0, 15)}..${text.slice(Math.max(0, text.length - 3))}`;
    const shown = shortened.length < text.length ? shortened : text;
    return `${this.id ?? ""} ${this.length}-mer:5'-${shown}-3'`;
  }

  /**
   * Part of the primer, with the footprint cut back by however much of it the slice leaves out.
   *
   * @param start - Where to start. @param stop - Where to stop. @param step - The step.
   * @returns The piece.
   */
  override slice(start?: number | null, stop?: number | null, step?: number | null): Primer {
    const piece = super.slice(start, stop, step);
    const out = new Primer(piece as unknown as PrimerLike, { position: this.position, footprint: this.fp });
    const from = normalise(start ?? null, this.length, 0);
    const footprintFrom = Math.max(0, this.length - (this.fp || 0));
    out.fp = this.fp - (from - footprintFrom > 0 ? Math.abs(from - footprintFrom) : 0);
    return out;
  }

  /**
   * The primer with something joined on its 5' end, which is how a tail is added.
   *
   * @param other - What to put in front.
   * @returns The longer primer, binding over the same footprint.
   */
  override radd(other: Parameters<PydnaSeqRecord["radd"]>[0]): this {
    const joined = super.radd(other);
    const out = new Primer(joined as unknown as PrimerLike, { position: this.position, footprint: this.fp });
    return out as unknown as this;
  }

  /**
   * The primer read the other way round. Nothing is known about where that binds, so the whole of it is
   * taken to be footprint, as pydna takes it.
   *
   * @param args - What the record classes take: which labels to carry over.
   * @returns The reverse complement.
   */
  override reverseComplement(...args: Parameters<PydnaSeqRecord["reverseComplement"]>): this {
    const answer = super.reverseComplement(...args) as unknown as Primer;
    answer.amplicon = null;
    answer.position = null;
    answer.fp = this.length;
    return answer as unknown as this;
  }
}

/**
 * Python's reading of one end of a slice.
 *
 * @param value - What was asked for, or null for the default.
 * @param length - The length being sliced.
 * @param fallback - What null means.
 * @returns The position, counted from the start and kept inside the sequence.
 */
function normalise(value: number | null, length: number, fallback: number): number {
  if (value === null) return fallback;
  const at = value < 0 ? length + value : value;
  return Math.max(0, Math.min(length, at));
}
