/**
 * pydna's own `SeqRecord`: a sequence with a name, features and annotations, and the handful of things
 * pydna wants to do to one.
 *
 * Biopython's record already holds the sequence, the identifiers, the features and the annotations. What
 * pydna adds is the working vocabulary of a molecular biologist with a construct in front of them: GenBank's
 * three fields under the names that appear in a GenBank file (`locus`, `accession`, `definition`), a way to
 * mark a region as a feature by position or by the sequence it contains, a table of what is annotated,
 * mapping a sequencing read onto the record, and a checksum stamped into the comment so that two files can
 * be told apart.
 *
 * Several defaults differ from Biopython's, and the difference is deliberate: a pydna record is `"id"`,
 * `"name"` and `"description"` rather than `"<unknown id>"` and friends, and its `molecule_type` is always
 * `"DNA"`, because a record here is a piece of DNA somebody is about to cut or join rather than something
 * just read out of a file.
 */

import { commonSubStrings } from "@biolibs/assembly";
import { CodonTable } from "@biolibs/seq";
import { CompoundLocation, SeqFeature, SimpleLocation, type Strand } from "@biolibs/seqfeature";
import { SeqRecord as BioSeqRecord } from "@biolibs/seqrecord";
import { type ExpressionTable, ProteinSeq, PydnaSeq } from "@biolibs/dseq";
import { AttributeError, IndexError, NotImplementedError, pyRepr, warn } from "@biolibs/core";
import { identifierFromString } from "./identifier.js";

/** The colours ApE paints features with, in the order pydna assigns them. */
const APE_COLOURS = [
  "#66ffa3", "#84ff66", "#e0ff66", "#ffc166", "#ff6666", "#ff99d6", "#ea99ff", "#ad99ff", "#99c1ff",
  "#99ffff", "#99ffc1", "#adff99", "#eaff99", "#ffd699", "#ff9999", "#ffccea", "#f4ccff", "#d6ccff",
  "#cce0ff", "#ccffff", "#ccffe0", "#d6ffcc", "#f4ffcc", "#ffeacc", "#ffcccc", "#ff66c1", "#e066ff",
  "#8466ff", "#66a3ff", "#66ffff",
] as const;

/** How long a GenBank locus name may be before pydna truncates it and complains. */
const LOCUS_LIMIT = 16;

/** The arrow `listFeatures` draws for each strand. */
const ARROWS: Record<string, string> = { "1": "-->", "-1": "<--", "0": "---", null: "---" };

/** One row of {@link SeqRecord.listFeatures}, which upstream is a `prettytable` row. */
export type FeatureRow = Array<string | number>;

/**
 * The feature table `listFeatures` builds: the column names, and one row per feature.
 *
 * Upstream this is a `prettytable.PrettyTable`, with the column alignments set on it; the *rendering* is
 * that library's and is not ported, so what comes back here is the cells, as pydna's own `lol()` gives
 * them.
 */
export interface FeatureTable {
  /** The eight column names. */
  fieldNames: readonly string[];
  /** One row per feature, lined up with {@link FeatureTable.fieldNames}. */
  rows: FeatureRow[];
}

/** @param table - A feature table. @returns Its names and rows, as pydna's `PrettyTable.lol()` does. */
export const featureLol = (table: FeatureTable): Array<readonly unknown[]> =>
  [table.fieldNames, ...table.rows];

/**
 * pydna's `SeqRecord`.
 *
 * @example
 * ```ts
 * const a = new SeqRecord("atgtaa");
 * a.id;                    // "id" — not Biopython's "<unknown id>"
 * a.isorf();               // true
 * a.addFeature(2, 4);
 * a.seguid();              // "lsseguid=4c-FaL3dvt8QXjvUyYHrJdVFNcY"
 * ```
 */
class SeqRecord extends BioSeqRecord {
  /** What a read mapped by {@link SeqRecord.lcs} was mapped against, which starts out unset. */
  mapTarget: SeqRecord | null = null;

  /**
   * @param seq - The sequence, or the text of one, which is wrapped in a {@link PydnaSeq}.
   * @param id - The accession; `"id"` by default, where Biopython would say `"<unknown id>"`.
   * @param name - The locus; `"name"` by default.
   * @param description - The definition; `"description"` by default.
   * @param dbxrefs - Cross-references. @param features - Features on the sequence.
   * @param annotations - Annotations; `molecule_type` is set to `"DNA"` whatever is passed.
   * @param letterAnnotations - Per-letter annotations.
   */
  constructor(
    seq: PydnaSeq | ProteinSeq | string,
    id: string | null = "id",
    name = "name",
    description = "description",
    dbxrefs: string[] | null = null,
    features: SeqFeature[] | null = null,
    annotations: Map<string, unknown> | Record<string, unknown> | null = null,
    letterAnnotations: Map<string, unknown> | null = null,
  ) {
    super(typeof seq === "string" ? new PydnaSeq(seq) : seq, id, name, description, dbxrefs, features,
          annotations, letterAnnotations as never);
    this.fixAttributes();
  }

  /**
   * Put the record into the shape pydna expects, which is what `_fix_attributes` does.
   *
   * The sequence becomes a pydna one if it is not already, whitespace inside it is removed — a sequence
   * pasted out of a file often arrives wrapped across lines — and `molecule_type` is set to `"DNA"`.
   */
  protected fixAttributes(): void {
    this.annotations.set("molecule_type", "DNA");
    const current = this.seq;
    if (current !== null && !(current instanceof PydnaSeq) && !(current instanceof ProteinSeq)) {
      this.seq = new PydnaSeq(current.toString());
    }
    const text = this.seq?.toString() ?? "";
    if (/\s/.test(text)) {
      const stripped = text.replace(/\s+/g, "");
      this.seq = this.seq instanceof ProteinSeq ? new ProteinSeq(stripped) : new PydnaSeq(stripped);
    }
  }

  /**
   * Adopt a Biopython record as a pydna one, which upstream does by reassigning its `__class__`.
   *
   * JavaScript has no such move, so this copies the fields across into a new record; the effect a caller
   * sees — a pydna record carrying that record's contents, with the attributes fixed up — is the same.
   *
   * @param record - The record to adopt.
   * @returns It, as this class.
   */
  static fromBioSeqRecord<T extends SeqRecord>(this: new (...args: never[]) => T,
                                                    record: BioSeqRecord): T {
    const Cls = this as unknown as new (seq: PydnaSeq | ProteinSeq | string, id: string | null,
                                        name: string, description: string, dbxrefs: string[] | null,
                                        features: SeqFeature[] | null,
                                        annotations: Map<string, unknown> | null) => T;
    const seq = record.seq;
    return new Cls(seq === null ? "" : (seq as PydnaSeq), record.id, record.name, record.description,
                   record.dbxrefs, record.features, record.annotations);
  }

  /**
   * The clock {@link SeqRecord.stamp} reads when it is not given one.
   *
   * @returns The current time to the second, in ISO form, as pydna's own default does. There is nothing
   *   here for a parity case to compare, since the answer is whenever it was called.
   */
  static datefunction(): string {
    return new Date().toISOString().replace(/\.\d+Z$/, "");
  }

  /** @returns The locus, which is another name for the record's `name`, as a GenBank file calls it. */
  get locus(): string { return this.name; }

  /**
   * Set the locus, truncating it to sixteen characters as a GenBank file requires.
   *
   * @param value - The new locus. A longer one is cut down and a warning is emitted, so that a name
   *   silently losing its tail is at least mentioned.
   */
  set locus(value: string) {
    let out = value;
    if (out.length > LOCUS_LIMIT) {
      const short = out.slice(0, LOCUS_LIMIT);
      // pydna's wording, missing space and all: "truncated" and "to 16 chars" are concatenated.
      warn(`locus property ${out} truncatedto 16 chars ${short}`, "_PydnaWarning");
      out = short;
    }
    this.name = out;
  }

  /** @returns The accession, which is another name for the record's `id`. */
  get accession(): string | null { return this.id; }
  /** @param value - The new accession. */
  set accession(value: string | null) { this.id = value; }

  /** @returns The definition, which is another name for the record's `description`. */
  get definition(): string { return this.description; }
  /** @param value - The new definition. */
  set definition(value: string) { this.description = value; }

  /**
   * @param table - Which genetic code; 1 by default.
   * @returns Whether the sequence is a complete open reading frame read 5' to 3' — which is to say
   *   whether Biopython will translate it as a coding sequence without complaining.
   */
  isorf(table: string | number = 1): boolean {
    try {
      this.seq?.translate(table, "*", false, true);
      return true;
    } catch (e) {
      if (e instanceof CodonTable.TranslationError) return false;
      throw e;
    }
  }

  /** @returns The protein this record codes for, as a {@link ProteinSeqRecord}. */
  override translate(): ProteinSeqRecord {
    const p = super.translate();
    return new ProteinSeqRecord(new ProteinSeq(p.seq?.toString() ?? ""));
  }

  /** @returns The reverse complement, as this same class. */
  override reverseComplement(...args: Parameters<BioSeqRecord["reverseComplement"]>): this {
    const answer = super.reverseComplement(...args);
    return (this.constructor as typeof SeqRecord).fromBioSeqRecord(answer) as this;
  }

  /** @returns The reverse complement; pydna's shorter name for {@link reverseComplement}. */
  rc(...args: Parameters<BioSeqRecord["reverseComplement"]>): this {
    return this.reverseComplement(...args);
  }

  /**
   * Paint every feature a colour the ApE sequence editor understands.
   *
   * The forward colours run through the palette in order and the reverse colours run through it backwards,
   * so that a feature and its complement are told apart at a glance.
   */
  addColorsToFeaturesForApe(): void {
    this.features.forEach((f, i) => {
      f.qualifiers.set("ApEinfo_fwdcolor", [APE_COLOURS[i % APE_COLOURS.length]!]);
      f.qualifiers.set("ApEinfo_revcolor", [[...APE_COLOURS].reverse()[i % APE_COLOURS.length]!]);
    });
  }

  /**
   * Mark a region of the record as a feature.
   *
   * Give it positions, or give it a `seq` and it will find where that sits — searched in lower case, so the
   * case of either does not matter. The label is filled in for you: `ftN` for a region of N bases, or
   * `orfN` when the region reads as a complete open reading frame on either strand.
   *
   * @param x - Where the feature starts; the beginning of the record when omitted.
   * @param y - Where it ends; the end of the record when omitted.
   * @param seq - A sequence to locate instead of giving positions.
   * @param type - The feature's type; `"misc"` by default.
   * @param strand - Which strand; the forward one by default.
   * @param qualifiers - Extra qualifiers, which upstream are passed as keyword arguments.
   * @throws TypeError naming the sequence when `seq` is not in the record.
   * @throws The `ValueError` a backwards location raises. pydna catches that one and makes a location that
   *   wraps instead — but only after asking whether the record is circular, and a plain record has no such
   *   property, so what actually comes out is an `AttributeError` about the missing attribute. That is
   *   reproduced: a record that can be circular is `Dseqrecord`, and this is not it.
   */
  addFeature(x: number | null = null, y: number | null = null, seq: unknown = null, type = "misc",
             strand: Strand = 1, qualifiers: Record<string, unknown> = {}): void {
    const q = new Map<string, unknown>(Object.entries(qualifiers));
    let start = x;
    let stop = y;
    if (seq !== null && seq !== undefined && seq !== "" && seq !== false) {
      const text = seqTextOf(seq).toLowerCase();
      start = (this.seq?.toString() ?? "").toLowerCase().indexOf(text);
      if (start === -1) throw new TypeError(`Could not find ${text}`);
      stop = start + text.length;
    } else {
      start = start || 0;
      stop = stop || this.length;
    }
    if (!q.has("label")) {
      q.set("label", [`ft${stop - start}`]);
      const piece = this.slice(start, stop) as SeqRecord;
      if (piece.isorf() || piece.reverseComplement().isorf()) q.set("label", [`orf${stop - start}`]);
    }
    let location: SimpleLocation | CompoundLocation;
    try {
      location = new SimpleLocation(start, stop, strand);
    } catch (e) {
      // pydna asks `self.circular` here, which only `Dseqrecord` has; on a plain record the question
      // itself is the error, and it replaces the ValueError that got us here.
      const circular = (this as unknown as { circular?: boolean }).circular;
      if (circular === undefined) {
        throw new AttributeError(`'${this.constructor.name}' object has no attribute 'circular'`);
      }
      if (!circular) throw e;
      location = new CompoundLocation([new SimpleLocation(start, this.length, strand),
                                       new SimpleLocation(0, stop, strand)]);
    }
    this.features.push(new SeqFeature(location, type, "<unknown id>", q));
  }

  /**
   * What is annotated on this record, one row per feature.
   *
   * The columns are the feature's number, its label or note, which strand it is on, where it starts and
   * ends, how long it is, its type, and whether it reads as an open reading frame on either strand. A
   * label is shown as `L:...` and a note as `N:...`, so the two are told apart; a feature with neither is
   * `nd`. Labels are cut to sixteen characters.
   *
   * @returns The cells. Upstream they come back inside a `prettytable` table, whose layout is that
   *   library's rather than pydna's and is not ported; {@link featureLol} hands them over the way pydna's
   *   own `lol()` does.
   */
  listFeatures(): FeatureTable {
    const rows: FeatureRow[] = this.features.map((sf, i) => {
      const label = sf.qualifiers.get("label");
      const note = sf.qualifiers.get("note");
      let text: string;
      if (label !== undefined) text = `L:${joinQualifier(label).trim()}`;
      else if (note !== undefined) text = `N:${joinQualifier(note).trim()}`;
      else text = "nd";
      const piece = this.extractFeature(i);
      return [
        i,
        text.slice(0, 16),
        ARROWS[String(sf.location?.strand ?? null)] ?? "---",
        Number(sf.location?.start ?? 0),
        Number(sf.location?.end ?? 0),
        sf.length,
        sf.type,
        piece.isorf() || piece.reverseComplement().isorf() ? "yes" : "no",
      ];
    });
    return {
      fieldNames: ["Ft#", "Label or Note", "Dir", "Sta", "End", "Len", "type", "orf?"],
      rows,
    };
  }

  /**
   * @param n - Which feature.
   * @returns Just that feature's stretch of the record, as a record of its own.
   * @throws IndexError for a feature that is not there, since pydna indexes the list directly.
   */
  extractFeature(n: number): SeqRecord {
    const sf = this.features.at(n);
    if (sf === undefined) throw new IndexError("list index out of range");
    return sf.extract(this as never) as unknown as SeqRecord;
  }

  /** @returns The features in the order they appear along the sequence, rather than the order added. */
  sortedFeatures(): SeqFeature[] {
    return [...this.features].sort((a, b) => Number(a.location?.start ?? 0) - Number(b.location?.start ?? 0));
  }

  /** @returns The sequence's SEGUID v2 checksum. @throws AssertionError for an empty sequence. */
  seguid(): string {
    return (this.seq as PydnaSeq).seguid();
  }

  /**
   * Read or add to the record's comment, which is what a GenBank file shows under COMMENT.
   *
   * @param newcomment - Text to add on a line of its own; omit it to read what is there.
   * @returns The comment after any addition.
   */
  comment(newcomment = ""): string {
    let result = (this.annotations.get("comment") as string | undefined) ?? "";
    if (newcomment) {
      this.annotations.set("comment", `${result}\n${newcomment}`.trim());
      result = this.annotations.get("comment") as string;
    }
    return result;
  }

  /**
   * Write the sequence's checksum into the comment, so that a file carries proof of what is in it.
   *
   * Stamping a record whose comment already holds the same checksum changes nothing. Stamping one that
   * holds a *different* checksum warns, because that means the sequence has been edited since it was
   * stamped and the file no longer says what it is.
   *
   * @param now - What to record as the time; a function, so a caller can fix it. Defaults to the current
   *   time to the second, in ISO form, as pydna's own default does.
   * @param tool - What to credit with the stamp. @param _separator - Accepted and unused, as upstream's is.
   * @param comment - Extra text for the stamp line.
   * @returns The checksum.
   */
  stamp(now: () => string = SeqRecord.datefunction, tool = "pydna",
        _separator = " ", comment = ""): string {
    const chksum = this.seguid();
    const oldcomment = (this.annotations.get("comment") as string | undefined) ?? "";
    const oldstamp = oldcomment.match(/..seguid=\S{27}/g);
    if (oldstamp !== null && oldstamp[0] === chksum) return oldstamp[0];
    if (oldstamp !== null) {
      warn(`Stamp change.\nNew: ${chksum}\nOld: ${oldstamp[0]}`, "_PydnaWarning");
    }
    this.annotations.set("comment", `${oldcomment}\n${tool} ${chksum} ${now()} ${comment}`.trim());
    return chksum;
  }

  /**
   * Find the longest stretch this record shares with something else, as a feature that can be drawn on it.
   *
   * This is how a sequencing read is placed on a construct: the read and the record are compared in lower
   * case, and the longest agreement becomes a feature of type `"read"`, coloured so that a viewer shows it
   * as one.
   *
   * @param other - A string, sequence or record to compare with.
   * @param limit - The shortest agreement worth reporting; 25 by default, and a falsy limit means 25 too.
   * @param options - `type` and `label` override the feature's own.
   * @returns The feature, or an empty `SeqFeature` with no location when nothing was long enough.
   */
  lcs(other: unknown, limit = 25, options: { type?: string; label?: string } = {}): SeqFeature {
    const r = seqTextOf(other).toLowerCase();
    const olaps = commonSubStrings((this.seq?.toString() ?? "").toLowerCase(), r, limit || 25);
    const first = olaps[0];
    if (first === undefined) return new SeqFeature();
    const [startInSelf, , length] = first;
    const named = other as { name?: string };
    const label = options.label ?? (typeof named?.name === "string" ? named.name : "sequence");
    return new SeqFeature(
      new SimpleLocation(startInSelf, startInSelf + length, 1),
      options.type ?? "read",
      "<unknown id>",
      new Map<string, unknown>([["label", [label]], ["ApEinfo_fwdcolor", ["#DAFFCF"]],
                                ["ApEinfo_revcolor", ["#DFFDFF"]]]),
    );
  }

  /** @returns The sequence's G+C fraction. */
  gc(): number { return (this.seq as PydnaSeq).gc(); }

  /** @param organism - Whose weights to use. @returns The codon adaptation index. */
  cai(organism = "sce"): number { return (this.seq as PydnaSeq).cai(organism); }

  /**
   * Where the rare codons are, as features that can be drawn on the record.
   *
   * @param organism - Whose table of rare codons to use.
   * @returns One feature per rare codon, labelled with the codon itself.
   */
  rarecodons(organism = "sce"): SeqFeature[] {
    const seq = this.seq as PydnaSeq;
    return seq.rarecodons(organism).map((slc) => new SeqFeature(
      new SimpleLocation(slc.start, slc.stop, null),
      `rare_codon_${organism}`,
      "<unknown id>",
      new Map<string, unknown>([["label", [seq.toString().slice(slc.start, slc.stop)]]]),
    ));
  }

  /**
   * @param _organism - Accepted and ignored: pydna asks the sequence without passing it on, so the answer
   *   is always the default organism's.
   * @returns How strong the first codon is as a start.
   */
  startcodon(_organism = "sce"): number | null { return (this.seq as PydnaSeq).startcodon(); }

  /**
   * @param _organism - Accepted and ignored, as in {@link startcodon}.
   * @returns How strong the last codon is as a stop.
   */
  stopcodon(_organism = "sce"): number | null { return (this.seq as PydnaSeq).stopcodon(); }

  /**
   * @param _organism - Accepted and ignored, as in {@link startcodon}.
   * @returns The expression summary's cells, for the default organism.
   */
  express(_organism = "sce"): ExpressionTable { return (this.seq as PydnaSeq).express(); }

  /** @returns A shallow copy of this record, as Python's `copy.copy` makes. */
  copy(): this {
    const out = Object.create(Object.getPrototypeOf(this) as object) as this;
    return Object.assign(out, this);
  }

  /**
   * Whether two records hold the same thing.
   *
   * Biopython refuses to compare records at all, on the grounds that it is never clear which fields were
   * meant; pydna decides it means all of them, and compares the sequences and then every attribute the two
   * instances carry.
   *
   * Upstream the second half is `str(self.__dict__) == str(other.__dict__)` — the printed dictionary, not
   * the dictionary. That is the same test on the same data, since both records were built by the same
   * constructor and so hold the same fields in the same order, so this compares the fields themselves
   * rather than reproducing a printed form of them.
   *
   * @param other - Something to compare with.
   * @returns Whether both the sequence and every field agree. Anything without a sequence is simply not
   *   equal, rather than an error.
   */
  override equals(other: unknown): boolean {
    const them = other as SeqRecord | undefined;
    if (them?.seq === undefined || them.seq === null) return false;
    if ((this.seq?.toString() ?? "") !== them.seq.toString()) return false;
    return pyRepr(this.fieldsForComparison()) === pyRepr(them.fieldsForComparison?.() ?? null);
  }

  /** @returns Every field pydna's `__eq__` compares, in the order the constructors set them. */
  protected fieldsForComparison(): unknown[] {
    return [this.seq?.toString() ?? null, this.id, this.name, this.description, [...this.dbxrefs],
            [...this.annotations.entries()], this.features.map((f) => f.toString()), this.mapTarget];
  }

  /**
   * @param other - Something to compare with. @returns Whether the two are not equal.
   */
  override ne(other: unknown): boolean { return !this.equals(other); }

  /**
   * Compare two records by sequence, as `<` does.
   *
   * @param other - Something with a sequence.
   * @returns Whether this sequence sorts before the other's, or null where Python returns
   *   `NotImplemented` because the other side has no sequence to compare.
   */
  lessThan(other: unknown): boolean | null {
    const text = seqOrNull(other);
    return text === null ? null : (this.seq?.toString() ?? "") < text;
  }

  /**
   * @param other - Something with a sequence.
   * @returns Whether this sequence sorts after the other's, or null as in {@link lessThan}.
   */
  greaterThan(other: unknown): boolean | null {
    const text = seqOrNull(other);
    return text === null ? null : (this.seq?.toString() ?? "") > text;
  }

  /** @returns Whether the record has a sequence at all, which is Python's truth value for one. */
  isTruthy(): boolean { return (this.seq?.toString() ?? "") !== ""; }

  /**
   * Format the record, including pydna's two formats of its own.
   *
   * @param format - A format name. `"primer"` writes a FASTA-like header with the length in mer and the
   *   part of the description that is not already the name.
   * @returns The formatted text.
   * @throws The `AttributeError` that `"pydnafasta"` raises here. It asks the *sequence* whether it is
   *   circular, and only a `Dseq` knows; a record over a plain sequence cannot answer, so the format
   *   fails rather than guessing. Reproduced, since `Dseqrecord` is where that format works.
   */
  override format(format: string): string {
    if (format === "pydnafasta") {
      const circular = (this.seq as unknown as { circular?: boolean }).circular;
      if (circular === undefined) {
        throw new AttributeError(
          `'${this.seq?.constructor.name ?? "NoneType"}' object has no attribute 'circular'`);
      }
      return `>${this.id} ${this.length} bp ${circular ? "circular" : "linear"}\n${this.seq?.toString() ?? ""}\n`;
    }
    if (format === "primer") {
      const tail = this.description.startsWith(this.name)
        ? this.description.slice(this.name.length) : this.description;
      return `>${this.id} ${this.length}-mer${tail.trim()}\n${this.seq?.toString() ?? ""}\n`;
    }
    return super.format(format);
  }

  /**
   * Join two records, filling in pydna's defaults where Biopython would leave a placeholder.
   *
   * @param other - What to add. @returns The joined record, as this class.
   */
  override add(other: Parameters<BioSeqRecord["add"]>[0]): this {
    const answer = super.add(other);
    if (answer.name === "<unknown name>") answer.name = "name";
    if (answer.id === "<unknown id>") answer.id = "id";
    if (answer.description === "<unknown description>") answer.description = "description";
    return (this.constructor as typeof SeqRecord).fromBioSeqRecord(answer) as this;
  }

  /**
   * Cut a piece out of the record, naming it after whatever is annotated there.
   *
   * A piece of fewer than two bases is handed back as it is. Anything longer is named after the longest
   * feature it contains — its label, or failing that its note — and failing both after the record itself.
   * Both names are reduced to something that could be a Python name and cut to sixteen characters.
   *
   * @param start - Where to cut from. @param stop - Where to cut to. @param step - The step.
   * @returns The piece.
   */
  override slice(start?: number | null, stop?: number | null, step?: number | null): SeqRecord {
    const answer = super.slice(start, stop, step) as SeqRecord;
    if (answer.length < 2) return answer;
    let identifier = `part_${this.id}`;
    if (answer.features.length > 0) {
      const sf = answer.features.reduce((a, b) => (b.length > a.length ? b : a));
      const label = sf.qualifiers.get("label");
      const note = sf.qualifiers.get("note");
      if (label !== undefined) identifier = joinQualifier(label);
      else if (note !== undefined) identifier = joinQualifier(note);
    }
    answer.id = identifierFromString(identifier).slice(0, 16);
    answer.name = identifierFromString(`part_${this.name}`).slice(0, 16);
    return answer;
  }
}

// pydna's class is called `SeqRecord` and its `repr` prints that name, so the declaration carries it; the
// export is renamed because `@biolibs/seqrecord` already has a `SeqRecord`.
export { SeqRecord as PydnaSeqRecord };

/**
 * A record over a protein, which refuses everything that only makes sense for DNA.
 *
 * `translate` is not among the refusals, because it is inherited from the DNA record and never reaches
 * anything protein-specific; what it does on a protein is Biopython's business.
 */
export class ProteinSeqRecord extends SeqRecord {
  /** The message every DNA-only method raises with. */
  static readonly NOT_PROTEIN = "Not defined for protein.";

  /** @throws NotImplementedError — a protein has no reverse complement. */
  override reverseComplement(): never { throw new NotImplementedError(ProteinSeqRecord.NOT_PROTEIN); }
  /** @throws NotImplementedError — upstream this is the very same function as `reverseComplement`. */
  override rc(): never { throw new NotImplementedError(ProteinSeqRecord.NOT_PROTEIN); }
  /** @throws NotImplementedError — a protein is not a reading frame. */
  override isorf(): never { throw new NotImplementedError(ProteinSeqRecord.NOT_PROTEIN); }
  /** @throws NotImplementedError — a protein has no GC content. */
  override gc(): never { throw new NotImplementedError(ProteinSeqRecord.NOT_PROTEIN); }
  /** @throws NotImplementedError — a protein has no codons to adapt. */
  override cai(): never { throw new NotImplementedError(ProteinSeqRecord.NOT_PROTEIN); }
  /** @throws NotImplementedError — a protein has no codons at all. */
  override rarecodons(): never { throw new NotImplementedError(ProteinSeqRecord.NOT_PROTEIN); }
  /** @throws NotImplementedError — a protein has no start codon. */
  override startcodon(): never { throw new NotImplementedError(ProteinSeqRecord.NOT_PROTEIN); }
  /** @throws NotImplementedError — a protein has no stop codon. */
  override stopcodon(): never { throw new NotImplementedError(ProteinSeqRecord.NOT_PROTEIN); }
  /** @throws NotImplementedError — expression is asked of the gene, not of the protein. */
  override express(): never { throw new NotImplementedError(ProteinSeqRecord.NOT_PROTEIN); }
}

/**
 * The text of whatever was handed in: a string, a sequence, a record, or a double-stranded molecule.
 *
 * A record is unwrapped to its sequence, and a `Dseq` to its upper strand, which is how pydna reads one
 * when it only wants letters.
 *
 * @param value - What to read. @returns Its letters.
 */
function seqTextOf(value: unknown): string {
  const holder = value as { seq?: unknown; watson?: unknown };
  if (holder?.seq !== undefined) {
    const inner = holder.seq as { watson?: unknown };
    if (inner?.watson !== undefined) return String(inner.watson).toLowerCase();
    return String(inner).toLowerCase();
  }
  return String(value).toLowerCase();
}

/**
 * @param other - Anything. @returns Its sequence as text, or null when it has none, which is what makes
 *   Python's comparison return `NotImplemented`.
 */
function seqOrNull(other: unknown): string | null {
  const holder = other as { seq?: unknown };
  return holder?.seq === undefined || holder.seq === null ? null : String(holder.seq);
}

/**
 * @param value - A qualifier, which Biopython keeps as a list of strings but which may be a bare one.
 * @returns Its parts joined with spaces, as pydna joins them.
 */
const joinQualifier = (value: unknown): string =>
  Array.isArray(value) ? value.map(String).join(" ") : String(value);
