/** `SeqRecord`: a sequence together with its identifiers, annotations and features. */

import { KeyError, ValueError, pyRepr, pyStr } from "@biolibs/core";
import { MutableSeq, Seq, SEQ_RECORD_BRAND, UndefinedSequenceError, type PySlice } from "@biolibs/seq";
import { NotImplementedError, type SeqFeature } from "@biolibs/seqfeature";
import { addRecordToRight, addToRecord, type Addable } from "./concatenate.js";
import { letterLength } from "./letter-values.js";
import { RestrictedDict, type LetterValue } from "./restricted-dict.js";
import { sliceRecord } from "./slicing.js";
import {
  reverseComplementRecord,
  translateRecord,
  type ReverseComplementOptions,
  type TranslateRecordOptions,
} from "./transform.js";
import { isDict, toMap, type AnnotationsInput, type LetterAnnotationsInput } from "./types.js";

const NO_COMPARISON = "SeqRecord comparison is deliberately not implemented. Explicitly compare the attributes of interest.";

/** Writes a record in some file format; registered by `@biolibs/seqio` for {@link SeqRecord.format}. */
export type RecordWriter = (record: SeqRecord) => string;

/**
 * A sequence with metadata (Biopython's `SeqRecord`): `id`, `name`,
 * `description`, database cross-references, free-form `annotations`,
 * per-residue `letterAnnotations` (such as quality scores) and `features`.
 *
 * Slicing a record slices the sequence, the per-letter annotations and the
 * features that fit inside. Records are deliberately not comparable; compare
 * the attributes you care about.
 *
 * @example
 * ```ts
 * const rec = new SeqRecord(new Seq("ACGTACGT"), "id1", "name1", "a record");
 * rec.length;                            // 8
 * rec.slice(2, 6).seq!.toString();       // "GTAC"
 * rec.reverseComplement().seq!.toString(); // "ACGTACGT"
 * ```
 */
export class SeqRecord {
  /** Marks records so `Bio.Seq` functions such as `join` recognise them without importing this package. */
  readonly [SEQ_RECORD_BRAND] = true;

  /**
   * Writers by format name, used by {@link SeqRecord.format}. `@biolibs/seqio` registers `fasta`, `genbank`, ... here.
   */
  static writers = new Map<string, RecordWriter>();

  private seqValue: Seq | MutableSeq | null;
  /** Primary identifier (accession), or null. */
  id: string | null;
  /** Short name (for example a GenBank locus name). */
  name: string;
  /** Human-readable description. */
  description: string;
  /** Database cross-references such as `"GeneID:1234"`. */
  dbxrefs: string[];
  /** Free-form annotations (for example `molecule_type`, `organism`, `topology`). */
  annotations: Map<string, unknown>;
  /** Features located on the sequence. */
  features: SeqFeature[];
  /** @internal The per-letter dictionary, or null until first used. */
  _perLetterAnnotations: RestrictedDict | null = null;

  /**
   * @param seq - The sequence, or null for a record without one.
   * @param id - Identifier (string or null). Default `"<unknown id>"`.
   * @param name - Short name. Default `"<unknown name>"`.
   * @param description - Description. Default `"<unknown description>"`.
   * @param dbxrefs - Cross-references (an array of strings).
   * @param features - Features (an array).
   * @param annotations - Annotations (a `Map` or plain object); a `Map` is used as given, not copied.
   * @param letterAnnotations - Per-residue annotations; each value must be as long as `seq`.
   * @throws TypeError for arguments of the wrong type.
   * @throws {@link ValueError} if a per-letter annotation has the wrong length.
   */
  constructor(
    seq: Seq | MutableSeq | null,
    id: string | null = "<unknown id>",
    name = "<unknown name>",
    description = "<unknown description>",
    dbxrefs: string[] | null = null,
    features: SeqFeature[] | null = null,
    annotations: AnnotationsInput | null = null,
    letterAnnotations: LetterAnnotationsInput | null = null,
  ) {
    if (seq !== null && !(seq instanceof Seq) && !(seq instanceof MutableSeq)) throw new TypeError("seq argument should be a Seq or MutableSeq object");
    if (id !== null && typeof id !== "string") throw new TypeError("id argument should be a string");
    if (typeof name !== "string") throw new TypeError("name argument should be a string");
    if (typeof description !== "string") throw new TypeError("description argument should be a string");
    this.seqValue = seq;
    this.id = id;
    this.name = name;
    this.description = description;
    if (dbxrefs === null) dbxrefs = [];
    else if (!Array.isArray(dbxrefs)) throw new TypeError("dbxrefs argument should be a list (of strings)");
    this.dbxrefs = dbxrefs;
    if (annotations === null) this.annotations = new Map();
    else if (!isDict(annotations)) throw new TypeError("annotations argument must be a dict or None");
    else this.annotations = toMap(annotations);
    if (letterAnnotations !== null) this.letterAnnotations = letterAnnotations;
    if (features === null) features = [];
    else if (!Array.isArray(features)) throw new TypeError("features argument should be a list (of SeqFeature objects)");
    this.features = features;
  }

  /**
   * Build a record without validating the arguments (Biopython's `_from_validated`); used internally when the inputs are known to be right.
   * Subclasses go through their normal constructor.
   * @internal
   */
  static fromValidated(
    seq: Seq | MutableSeq | null,
    id: string | null = "<unknown id>",
    name = "<unknown name>",
    description = "<unknown description>",
    dbxrefs: string[] | null = null,
    features: SeqFeature[] | null = null,
    annotations: Map<string, unknown> | null = null,
    letterAnnotations: Map<string, LetterValue> | null = null,
  ): SeqRecord {
    if (this !== SeqRecord) return new this(seq, id, name, description, dbxrefs, features, annotations, letterAnnotations);
    const inst = new SeqRecord(null);
    inst.seqValue = seq;
    inst.id = id;
    inst.name = name;
    inst.description = description;
    inst.dbxrefs = dbxrefs ?? [];
    inst.features = features ?? [];
    inst.annotations = annotations ?? new Map();
    inst._perLetterAnnotations = null;
    if (letterAnnotations !== null) {
      inst._perLetterAnnotations = new RestrictedDict(seq === null ? 0 : seq.length);
      for (const [k, v] of letterAnnotations) inst._perLetterAnnotations.setUnchecked(k, v);
    }
    return inst;
  }

  /** A new record of the same class from validated parts. @internal */
  derive(
    seq: Seq | MutableSeq | null,
    id?: string | null,
    name?: string,
    description?: string,
    dbxrefs?: string[] | null,
    features?: SeqFeature[] | null,
    annotations?: Map<string, unknown> | null,
    letterAnnotations?: Map<string, LetterValue> | null,
  ): SeqRecord {
    return (this.constructor as typeof SeqRecord).fromValidated(seq, id, name, description, dbxrefs ?? null, features ?? null, annotations ?? null, letterAnnotations ?? null);
  }

  /** The per-letter dictionary if it has been created, else null. @internal */
  get perLetterAnnotations(): RestrictedDict | null {
    return this._perLetterAnnotations;
  }

  /**
   * Per-residue annotations such as quality scores: a map whose values must be as long as the sequence.
   * Reading creates the (empty) dictionary on first use. Assigning replaces its contents.
   *
   * @throws TypeError if assigned something that is not a dictionary.
   * @throws {@link ValueError} if an assigned value has the wrong length.
   */
  get letterAnnotations(): RestrictedDict {
    if (this._perLetterAnnotations === null) this._perLetterAnnotations = new RestrictedDict(this.seqValue === null ? 0 : this.seqValue.length);
    return this._perLetterAnnotations;
  }

  set letterAnnotations(value: LetterAnnotationsInput) {
    if (!isDict(value)) throw new TypeError("The per-letter-annotations should be a (restricted) dictionary.");
    const entries = value instanceof Map ? [...value] : Object.entries(value);
    const length = this.seqValue === null ? 0 : this.seqValue.length;
    if (entries.some(([, v]) => letterLength(v) !== length)) {
      const bad = entries.filter(([, v]) => letterLength(v) !== length).map(([k, v]) => `${k}=${pyStr(v)}`).join(",");
      throw new ValueError(`The per-letter-annotations have the same length as the sequence, but found: \n ${bad}`);
    }
    if (this._perLetterAnnotations === null) this._perLetterAnnotations = new RestrictedDict(length);
    else this._perLetterAnnotations.clear();
    for (const [k, v] of entries) this._perLetterAnnotations.setUnchecked(k, v);
  }

  /**
   * The sequence (or null). Assigning a new sequence of a different length requires the per-letter annotations to be empty.
   *
   * @throws TypeError if assigned something other than a `Seq`, `MutableSeq` or null.
   * @throws {@link ValueError} if per-letter annotations exist and the new length differs.
   */
  get seq(): Seq | MutableSeq | null {
    return this.seqValue;
  }

  set seq(value: Seq | MutableSeq | null) {
    if (value !== null && !(value instanceof Seq) && !(value instanceof MutableSeq)) throw new TypeError("seq must be a Seq or MutableSeq object");
    if (this._perLetterAnnotations !== null && this._perLetterAnnotations.size > 0) {
      if (value === null) throw new TypeError("object of type 'NoneType' has no len()");
      if (this.length !== value.length) throw new ValueError("You must empty the letter annotations first!");
      this.seqValue = value;
    } else {
      this.seqValue = value;
      this._perLetterAnnotations = new RestrictedDict(value === null ? 0 : value.length);
    }
  }

  /** One residue by index; negative indices count from the end. @throws {@link ValueError} if there is no sequence. */
  at(index: number): string {
    if (this.seqValue === null) throw new ValueError("Seq in SeqRecord is None, it doesn't support indexing");
    return this.seqValue.at(index);
  }

  /**
   * A sub-record with Python slice semantics; see {@link sliceRecord}.
   * @throws {@link ValueError} if there is no sequence.
   */
  slice(start?: number | null, stop?: number | null, step?: number | null): SeqRecord {
    return sliceRecord(this, { start, stop, step });
  }

  /** `at(index)` for a number, `slice(...)` for a slice object; anything else raises `ValueError("Invalid index")`. */
  get(index: number): string;
  get(index: PySlice): SeqRecord;
  get(index: number | PySlice): string | SeqRecord {
    if (typeof index === "number" && Number.isInteger(index)) return this.at(index);
    if (index !== null && typeof index === "object") return this.slice(index.start, index.stop, index.step);
    throw new ValueError("Invalid index");
  }

  /** Iterate over the residues. @throws {@link ValueError} if there is no sequence. */
  [Symbol.iterator](): Iterator<string> {
    if (this.seqValue === null) throw new ValueError("Seq in SeqRecord is None, can't iterate over it");
    return this.seqValue[Symbol.iterator]();
  }

  /** Whether a character or substring occurs in the sequence. @throws {@link ValueError} if there is no sequence. */
  contains(char: string): boolean {
    if (this.seqValue === null) throw new ValueError("Seq in SeqRecord is None, can't convert to bytes");
    return this.seqValue.contains(char);
  }

  /** The sequence as bytes. @throws {@link ValueError} if there is no sequence. */
  toBytes(): Uint8Array {
    if (this.seqValue === null) throw new ValueError("Seq in SeqRecord is None, can't convert to bytes");
    return this.seqValue.toBytes();
  }

  /** A human-readable summary: identifiers, counts, annotations and a short view of the sequence. */
  toString(): string {
    const lines: string[] = [];
    if (this.id) lines.push(`ID: ${this.id}`);
    if (this.name) lines.push(`Name: ${this.name}`);
    if (this.description) lines.push(`Description: ${this.description}`);
    if (this.dbxrefs.length) lines.push("Database cross-references: " + this.dbxrefs.join(", "));
    lines.push(`Number of features: ${this.features.length}`);
    for (const [a, v] of this.annotations) lines.push(`/${a}=${pyStr(v)}`);
    if (this.letterAnnotations.size) lines.push("Per letter annotation for: " + [...this.letterAnnotations.keys()].join(", "));
    if (this.seqValue !== null) {
      try {
        this.seqValue.toBytes();
        lines.push(this.seqValue.repr());
      } catch (e) {
        if (!(e instanceof UndefinedSequenceError)) throw e;
        lines.push(`Undefined sequence of length ${this.seqValue.length}`);
      }
    } else {
      lines.push("Missing Sequence (None)");
    }
    return lines.join("\n");
  }

  /** `SeqRecord(seq=Seq('ACGT'), id='x', name='y', description='z', dbxrefs=[])`. */
  repr(): string {
    return `${this.constructor.name}(seq=${pyRepr(this.seqValue)}, id=${pyRepr(this.id)}, name=${pyRepr(this.name)}, description=${pyRepr(this.description)}, dbxrefs=${pyRepr(this.dbxrefs)})`;
  }

  /**
   * The record in a file format, for example `"fasta"` or `"genbank"`. An empty format gives {@link SeqRecord.toString}.
   * Formats are provided by the writers registered in {@link SeqRecord.writers} (by `@biolibs/seqio`).
   *
   * @throws {@link KeyError} for a format with no registered writer.
   */
  format(format: string): string {
    if (!format) return this.toString();
    const writer = SeqRecord.writers.get(format);
    if (writer === undefined) throw new KeyError(format);
    return writer(this);
  }

  /** Number of residues; 0 if there is no sequence. */
  get length(): number {
    return this.seqValue !== null ? this.seqValue.length : 0;
  }

  /** Records cannot be ordered. @throws {@link NotImplementedError} always. */
  lt(_other: unknown): never { throw new NotImplementedError(NO_COMPARISON); }
  /** Records cannot be ordered. @throws {@link NotImplementedError} always. */
  le(_other: unknown): never { throw new NotImplementedError(NO_COMPARISON); }
  /** Records have no equality; compare attributes instead. @throws {@link NotImplementedError} always. */
  equals(_other: unknown): never { throw new NotImplementedError(NO_COMPARISON); }
  /** Records have no inequality; compare attributes instead. @throws {@link NotImplementedError} always. */
  ne(_other: unknown): never { throw new NotImplementedError(NO_COMPARISON); }
  /** Records cannot be ordered. @throws {@link NotImplementedError} always. */
  gt(_other: unknown): never { throw new NotImplementedError(NO_COMPARISON); }
  /** Records cannot be ordered. @throws {@link NotImplementedError} always. */
  ge(_other: unknown): never { throw new NotImplementedError(NO_COMPARISON); }

  /** `record + other`; see {@link addToRecord}. */
  add(other: Addable): SeqRecord {
    return addToRecord(this, other);
  }

  /** `other + record` for a sequence or string; see {@link addRecordToRight}. */
  radd(other: Seq | MutableSeq | string): SeqRecord {
    return addRecordToRight(this, other);
  }

  /** Occurrences of `sub` in the sequence. @throws {@link ValueError} if there is no sequence. */
  count(sub: string | Seq | MutableSeq | Uint8Array, start?: number | null, end?: number | null): number {
    if (this.seqValue === null) throw new ValueError("seq is SeqRecord is None, assign it a sequence before applying count");
    return this.seqValue.count(sub, start, end);
  }

  /** A copy with the sequence in upper case; metadata is copied. @throws {@link ValueError} if there is no sequence. */
  upper(): SeqRecord {
    if (this.seqValue === null) throw new ValueError("seq is SeqRecord is None, assign it a sequence before applying upper");
    return this.derive(this.seqValue.upper(), this.id, this.name, this.description, [...this.dbxrefs], [...this.features], new Map(this.annotations), this._perLetterAnnotations === null ? null : this.letterAnnotations.copy());
  }

  /** A copy with the sequence in lower case; metadata is copied. @throws {@link ValueError} if there is no sequence. */
  lower(): SeqRecord {
    if (this.seqValue === null) throw new ValueError("seq is SeqRecord is None, assign it a sequence before applying lower");
    return this.derive(this.seqValue.lower(), this.id, this.name, this.description, [...this.dbxrefs], [...this.features], new Map(this.annotations), this._perLetterAnnotations === null ? null : this.letterAnnotations.copy());
  }

  /** Whether the sequence is upper case. @throws TypeError if there is no sequence. */
  isupper(): boolean {
    return this.seqValue!.isupper();
  }

  /** Whether the sequence is lower case. @throws TypeError if there is no sequence. */
  islower(): boolean {
    return this.seqValue!.islower();
  }

  /**
   * The reverse complement as a new record. Features are flipped to the new coordinates and sorted by start;
   * per-letter annotations are reversed; other metadata is dropped unless requested.
   *
   * Each option is polymorphic as in Biopython: `true` copies the field, a value replaces it. Pass them positionally
   * (`id, name, description, features, annotations, letterAnnotations, dbxrefs`) or as one options object.
   *
   * @throws {@link ValueError} if the record has no sequence or `molecule_type` contains "protein".
   */
  reverseComplement(
    id?: boolean | string | ReverseComplementOptions,
    name?: boolean | string,
    description?: boolean | string,
    features?: boolean | SeqFeature[],
    annotations?: boolean | AnnotationsInput,
    letterAnnotations?: boolean | LetterAnnotationsInput,
    dbxrefs?: boolean | string[],
  ): SeqRecord {
    const o: ReverseComplementOptions = isOptions(id) ? id : { id, name, description, features, annotations, letterAnnotations, dbxrefs };
    return reverseComplementRecord(this, o);
  }

  /**
   * Translate to a protein record whose `molecule_type` annotation is `"protein"`. Metadata is dropped unless requested
   * (see {@link SeqRecord.reverseComplement} for the option conventions). Pass arguments positionally
   * (`table, stopSymbol, toStop, cds, gap, id, name, description, features, annotations, letterAnnotations, dbxrefs`)
   * or as one options object.
   *
   * @throws {@link ValueError} if the record is a protein or has no sequence.
   */
  translate(
    table?: string | number | TranslateRecordOptions,
    stopSymbol?: string,
    toStop?: boolean,
    cds?: boolean,
    gap?: string | null,
    id?: boolean | string,
    name?: boolean | string,
    description?: boolean | string,
    features?: boolean | SeqFeature[],
    annotations?: boolean | AnnotationsInput,
    letterAnnotations?: boolean | LetterAnnotationsInput,
    dbxrefs?: boolean | string[],
  ): SeqRecord {
    const o: TranslateRecordOptions = isOptions(table)
      ? table
      : { table, stopSymbol, toStop, cds, gap, id, name, description, features, annotations, letterAnnotations, dbxrefs };
    return translateRecord(this, o);
  }
}

/** Whether the first argument is an options object rather than a positional value. */
function isOptions<T extends object>(x: unknown): x is T {
  return x !== null && typeof x === "object" && !Array.isArray(x) && !(x instanceof Map);
}
