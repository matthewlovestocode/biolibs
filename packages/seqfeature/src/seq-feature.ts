/** `SeqFeature`: an annotated region of a sequence. */

import { MutableSeq, Seq } from "@biolibs/seq";
import type { ParentSequence, References } from "./location/index.js";
import { CompoundLocation, SimpleLocation } from "./location/index.js";
import type { Position } from "./position/index.js";
import { ValueError, pyEquals, pyInt, pyRepr, pyStr, pyClassName } from "@biolibs/core";

/** Qualifiers of a feature: key to value, usually a list of strings (as in GenBank). */
export type Qualifiers = Map<string, unknown>;

/** Qualifier input: a `Map`, a plain object, or an iterable of pairs. */
export type QualifiersInput = Map<string, unknown> | Record<string, unknown> | Iterable<[string, unknown]>;

/**
 * A region of a sequence with a type (`"gene"`, `"CDS"`, ...), an id and
 * qualifiers (Biopython's `SeqFeature`).
 *
 * @example
 * ```ts
 * const f = new SeqFeature(new SimpleLocation(0, 9, 1), "CDS", undefined, { gene: ["demo"] });
 * const parent = new Seq("ATGAAATAGCCC");
 * f.extract(parent).toString();   // "ATGAAATAG"
 * f.translate(parent).toString(); // "MK"  (translate needs a Seq; a plain string raises TypeError, as in Biopython)
 * ```
 */
export class SeqFeature {
  /** What Python calls this class, which a minifier cannot rewrite. */
  static readonly typeName = "SeqFeature";

  /** Where the feature is; may be null when unknown. */
  location: SimpleLocation | CompoundLocation | null;
  /** Feature type, e.g. `"CDS"`. */
  type: string;
  /** Identifier; `"<unknown id>"` when unset. */
  id: string;
  /** Annotations such as `gene`, `product`, `codon_start`, `transl_table`. */
  qualifiers: Qualifiers;

  /**
   * @param location - A `SimpleLocation`, `CompoundLocation` or null.
   * @param type - Feature type. Default `""`.
   * @param id - Identifier. Default `"<unknown id>"`.
   * @param qualifiers - Initial qualifiers (copied).
   * @param subFeatures - Removed in Biopython; passing anything raises.
   * @throws TypeError for a wrong `location` type or any `subFeatures`.
   */
  constructor(location: SimpleLocation | CompoundLocation | null = null, type = "", id = "<unknown id>", qualifiers: QualifiersInput | null = null, subFeatures: unknown = null) {
    if (location !== null && !(location instanceof SimpleLocation) && !(location instanceof CompoundLocation)) {
      throw new TypeError("SimpleLocation, CompoundLocation (or None) required for the location");
    }
    this.location = location;
    this.type = type;
    this.id = id;
    this.qualifiers = new Map();
    if (qualifiers !== null) {
      const entries = qualifiers instanceof Map ? [...qualifiers] : Symbol.iterator in qualifiers ? [...(qualifiers as Iterable<[string, unknown]>)] : Object.entries(qualifiers);
      for (const [k, v] of entries) this.qualifiers.set(k, v);
    }
    if (subFeatures !== null && subFeatures !== undefined) throw new TypeError("Rather than sub_features, use a CompoundLocation");
  }

  /** Whether `other` is a feature with the same id, type, location and qualifiers. */
  equals(other: unknown): boolean {
    return (
      other instanceof SeqFeature &&
      this.id === other.id &&
      this.type === other.type &&
      (this.location === null ? other.location === null : this.location.equals(other.location)) &&
      pyEquals(this.qualifiers, other.qualifiers)
    );
  }

  /** Short representation: `SeqFeature(SimpleLocation(...), type='CDS', id='x', qualifiers=...)`. */
  repr(): string {
    let answer = `${pyClassName(this)}(${pyRepr(this.location)}`;
    if (this.type) answer += `, type=${pyRepr(this.type)}`;
    if (this.id && this.id !== "<unknown id>") answer += `, id=${pyRepr(this.id)}`;
    if (this.qualifiers.size) answer += ", qualifiers=...";
    return answer + ")";
  }

  /** Multi-line description with qualifiers sorted by key. */
  toString(): string {
    let out = `type: ${this.type}\n`;
    out += `location: ${pyStr(this.location)}\n`;
    if (this.id && this.id !== "<unknown id>") out += `id: ${this.id}\n`;
    out += "qualifiers:\n";
    for (const key of [...this.qualifiers.keys()].sort()) out += `    Key: ${key}, Value: ${pyStr(this.qualifiers.get(key))}\n`;
    return out;
  }

  /** A copy moved by `offset`. @internal */
  shift(offset: number): SeqFeature {
    return new SeqFeature(this.location!.shift(offset) as SimpleLocation | CompoundLocation, this.type, this.id, new Map(this.qualifiers));
  }

  /** A copy as seen on the reverse complement of a sequence of `length`. @internal */
  flip(length: number): SeqFeature {
    return new SeqFeature(this.location!.flip(length) as SimpleLocation | CompoundLocation, this.type, this.id, new Map(this.qualifiers));
  }

  /**
   * The sequence of this feature, taken from the parent (reverse-complemented for the minus strand).
   *
   * @param parentSequence - The sequence the feature lives on.
   * @param references - Other sequences, for locations that point elsewhere.
   * @throws {@link ValueError} if the feature has no location.
   */
  extract(parentSequence: ParentSequence, references: References | null = null): ParentSequence {
    if (this.location === null) throw new ValueError("The feature's .location is None. Check the sequence file for a valid location.");
    return this.location.extract(parentSequence, references);
  }

  /**
   * Translate the feature's sequence, honouring the `codon_start` and `transl_table` qualifiers.
   *
   * @param parentSequence - The sequence the feature lives on.
   * @param table - Translation table when there is no `transl_table` qualifier. Default `"Standard"`.
   * @param startOffset - 0, 1 or 2; defaults to `codon_start - 1` from the qualifiers, else 0.
   * @param stopSymbol - Symbol for stop codons.
   * @param toStop - Stop at the first stop codon.
   * @param cds - Require a complete CDS; defaults to whether the type is `"CDS"`.
   * @param gap - Gap character, or null for none (the default here).
   * @returns The protein as a `Seq`.
   * @throws {@link ValueError} if `startOffset` is not 0, 1 or 2.
   */
  translate(
    parentSequence: ParentSequence,
    table: string | number = "Standard",
    startOffset: number | null = null,
    stopSymbol = "*",
    toStop = false,
    cds: boolean | null = null,
    gap: string | null = null,
  ): Seq {
    if (startOffset === null) {
      const codonStart = this.qualifiers.get("codon_start");
      startOffset = codonStart === undefined ? 0 : pyInt(String((codonStart as unknown[])[0])) - 1;
    }
    if (![0, 1, 2].includes(startOffset)) {
      throw new ValueError(`The start_offset must be 0, 1, or 2. The supplied value is ${startOffset}. Check the value of either the codon_start qualifier or the start_offset argument`);
    }
    const extracted = this.extract(parentSequence);
    // A plain string parent gives a plain string, which Python cannot translate with keyword arguments.
    if (typeof extracted === "string") throw new TypeError("str.translate() takes no keyword arguments");
    const featSeq = (extracted instanceof MutableSeq ? new Seq(extracted) : extracted).slice(startOffset);
    const tableQualifier = this.qualifiers.get("transl_table");
    const codonTable = tableQualifier === undefined ? table : ((tableQualifier as unknown[])[0] as string | number);
    return featSeq.translate(codonTable, stopSymbol, toStop, cds ?? this.type === "CDS", gap) as Seq;
  }

  /** Number of positions the feature covers. @throws TypeError if the feature has no location. */
  get length(): number {
    if (this.location === null) throw new TypeError("object of type 'NoneType' has no len()");
    return this.location.length;
  }

  /** The covered positions (see `Location`'s iterator). */
  [Symbol.iterator](): Iterator<number> {
    if (this.location === null) throw new TypeError("'NoneType' object is not iterable");
    return this.location[Symbol.iterator]();
  }

  /** Whether a zero-based position lies within the feature. */
  contains(value: number | Position): boolean {
    if (this.location === null) throw new TypeError("argument of type 'NoneType' is not a container or iterable");
    return this.location.contains(value);
  }
}

