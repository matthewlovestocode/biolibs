/**
 * `Dseqrecord`: a double-stranded molecule with a name, features and annotations.
 *
 * This is where pydna's two halves meet. `Dseq` knows what is opposite every base — the sticky ends, the
 * nicks, whether the molecule is a closed circle — and `SeqRecord` knows what the molecule is called and
 * what is annotated on it. Put together, they are a plasmid or a fragment as somebody actually works with
 * one, and the methods below are the operations that follow: close it into a circle, move its origin, cut a
 * piece out, join two together, read off where the genes are.
 *
 * What makes it more than the sum of the two is that **every operation has to carry the features with it**.
 * Closing a molecule shortens it by its overhangs; moving the origin renumbers everything; cutting leaves
 * each fragment with the annotations that fall inside it, and a feature straddling the cut has to be
 * dropped or duplicated. That bookkeeping is in `locations.ts`, and it is the part most easily got wrong
 * without anything raising.
 *
 * This slice is the molecule layer. Cutting with restriction enzymes, `synced`, and the output formats come
 * next; the provenance members need pydna's OpenCloning models and are a port of their own (see
 * `docs/dseqrecord.md`).
 */

import { pyClassRepr, pyRepr, ValueError, warn, ZeroDivisionError } from "@biolibs/core";
import { applyCut, cuttersBy, type CutSite, Dseq, type Enzymes, enzymeList, getCutParameters,
  getCutsitePairs, getCutsites, seguidOf, terminalTransferase } from "@biolibs/dseq";
import { CommOnly, type RestrictionBatch } from "@biolibs/restriction";
import { commonSubStrings } from "@biolibs/assembly";
import { Seq as BioSeq } from "@biolibs/seq";
import { CompoundLocation, SeqFeature, SimpleLocation, type Strand } from "@biolibs/seqfeature";
import type { SeqRecord as BioSeqRecord } from "@biolibs/seqrecord";
import { locationBoundaries, shiftFeature, shiftLocation } from "./locations.js";
import { PydnaSeqRecord } from "./seqrecord.js";

/** The default amount of substance a record carries, in moles: 0.05 pmol, as pydna picks. */
const DEFAULT_N = 5e-14;

/** What `Dseqrecord` can be built from. */
export type RecordLike = string | Dseq | { seq?: unknown; features?: unknown } | { toString(): string };


/** Watson-to-crick for the figure's lower strand, which is printed in place rather than reversed. */
const COMPLEMENT: Readonly<Record<string, string>> = {
  A: "T", C: "G", G: "C", T: "A", a: "t", c: "g", g: "c", t: "a", N: "N", n: "n",
};

/**
 * Python's `str.strip(" -")`: spaces and hyphens off both ends.
 *
 * @param s - The format name. @returns It trimmed.
 */
function stripSpacesAndHyphens(s: string): string {
  return s.replace(/^[ -]+/, "").replace(/[ -]+$/, "");
}

/**
 * A double-stranded record.
 *
 * @example
 * ```ts
 * const a = new Dseqrecord("atgtaa");
 * a.repr();              // "Dseqrecord(-6)"  — linear, six bases
 * a.looped().repr();     // "Dseqrecord(o6)"  — closed into a circle
 * a.circular;            // false; the copy above is true
 * ```
 */
export class Dseqrecord extends PydnaSeqRecord {
  /** How much of the molecule there is, in moles. Only {@link Dseqrecord.m} reads it. */
  n: number;

  /**
   * Where this molecule came from, in pydna's OpenCloning provenance model.
   *
   * Always null here: the models are a port of their own, and `__eq__` deliberately leaves this field out
   * of the comparison, so carrying it unset changes nothing a caller can observe through equality.
   */
  source: unknown = null;

  /**
   * @param record - A dscode string, a {@link Dseq}, a plain sequence, or another record to copy.
   * @param circular - Close it into a circle (true), open it (false), or leave it as it is (null, the
   *   default). A string is closed when this is truthy, since a bare string has no circularity of its own.
   * @param n - How much of it there is, in moles.
   * @param id - The accession. @param name - The locus. @param description - The definition.
   * @throws ValueError naming the argument when it is none of the shapes above.
   */
  constructor(record: RecordLike, circular: boolean | null = null, n = DEFAULT_N, id: string | null = "id",
              name = "name", description = "description") {
    const seq = Dseqrecord.seqFrom(record, circular);
    const holder = record as { id?: string | null; name?: string; description?: string;
      features?: SeqFeature[]; annotations?: Map<string, unknown>; dbxrefs?: string[] };
    // A record hands over its own identifiers and annotations; anything else takes the defaults.
    const fromRecord = holder?.features !== undefined;
    // An empty sequence stands in for the molecule while the base constructor runs, and the molecule is
    // put in place straight after. pydna needs no such step because its `Dseq` *is* a Biopython `Seq`, so
    // the record's type check passes; this port's `Dseq` is a class of its own, and the right place to
    // give way is here rather than in a check that is itself measured against Biopython.
    super(new BioSeq("") as never,
          fromRecord ? (holder.id ?? null) : id,
          fromRecord ? (holder.name ?? "name") : name,
          fromRecord ? (holder.description ?? "description") : description,
          fromRecord ? [...(holder.dbxrefs ?? [])] : null,
          fromRecord ? [...(holder.features ?? [])] : null,
          fromRecord && holder.annotations !== undefined ? new Map(holder.annotations) : null);
    this.setSeq(seq);
    this.n = n;
    this.annotations.set("molecule_type", "DNA");
    if (!this.annotations.has("source")) this.annotations.set("source", "");
    if (!this.annotations.has("organism")) this.annotations.set("organism", ".");
  }

  /**
   * The molecule a constructor argument describes.
   *
   * pydna tells the four shapes apart by what they have rather than by what they are — a `watson` means a
   * `Dseq`, a `transcribe` means a plain sequence, a `features` means a record — and that duck-typing is
   * reproduced, because it is what decides which argument is accepted.
   *
   * @param record - The argument. @param circular - What to do about circularity.
   * @returns The molecule.
   * @throws ValueError for an argument of no recognised shape.
   */
  private static seqFrom(record: RecordLike, circular: boolean | null): Dseq {
    if (typeof record === "string") return Dseq.quick(record, Boolean(circular));
    const holder = record as { watson?: unknown; transcribe?: unknown; features?: unknown; seq?: unknown };
    if (holder?.watson !== undefined) {
      const d = record as Dseq;
      if (circular === false) return d.slice();
      if (circular === true) return d.looped();
      return d;
    }
    if (typeof holder?.transcribe === "function") {
      return new Dseq(String(record), null, null, Boolean(circular));
    }
    if (holder?.features !== undefined) {
      const inner = holder.seq as { watson?: unknown } | null | undefined;
      if (inner?.watson !== undefined) {
        const d = inner as unknown as Dseq;
        if (circular === false) return d.slice();
        if (circular === true) return d.looped();
        return Dseq.quick(d.code, d.circular, 0);
      }
      return new Dseq(String(holder.seq ?? ""), null, null, Boolean(circular));
    }
    throw new ValueError(`don't know what to do with ${pyRepr(record)}`);
  }

  /**
   * Build a record from a dscode string without going through the constructor's checks.
   *
   * @param record - The dscode. @param circular - Whether it is a closed circle.
   * @param n - How much of it there is.
   * @returns The record, with pydna's default identifiers and no annotations but `molecule_type`.
   */
  static fromString(record = "", circular = false, n = DEFAULT_N): Dseqrecord {
    const out = new Dseqrecord(Dseq.quick(record, circular), null, n);
    // `from_string` skips __init__, so it does not get the source and organism annotations.
    out.annotations = new Map<string, unknown>([["molecule_type", "DNA"]]);
    return out;
  }

  /**
   * Build a record from a Biopython or pydna one, taking its circularity from the `topology` annotation.
   *
   * @param record - The record to adopt.
   * @param circular - Override the topology; null reads `annotations["topology"] === "circular"`.
   * @param n - How much of it there is.
   * @returns The double-stranded record.
   */
  static fromSeqRecord(record: BioSeqRecord, circular: boolean | null = null, n = DEFAULT_N): Dseqrecord {
    const loop = circular === null ? record.annotations.get("topology") === "circular" : circular;
    const out = new Dseqrecord(Dseq.quick(record.seq?.toString() ?? "", loop), null, n);
    out.id = record.id;
    out.name = record.name;
    out.description = record.description;
    out.dbxrefs = [...record.dbxrefs];
    out.features = [...record.features];
    // molecule_type first, then whatever the record said, which may overwrite it.
    out.annotations = new Map<string, unknown>([["molecule_type", "DNA"], ...record.annotations]);
    return out;
  }

  /** @returns Whether the molecule is a closed circle. Not settable; use {@link Dseqrecord.looped}. */
  get circular(): boolean { return (this.seq as unknown as Dseq).circular; }

  /** @returns The mass in grams: the molecular weight times how much of it there is. */
  m(): number { return (this.seq as unknown as Dseq).mw() * this.n; }

  /**
   * Format the molecule, through a writer from `@biolibs/seqio` or one of pydna's own.
   *
   * pydna overrides this to do four things its parent does not, and all four are visible in the output:
   *
   * - **`"dscode"` anywhere in the format name** writes the raw dscode string — one letter per base
   *   *pair* — instead of the watson strand, and the word is then taken out of the format name. So
   *   `format("fasta-2line dscode")` on `Dseqrecord("PEXIGATCQFZJ")` writes those twelve letters, while
   *   `format("fasta-2line")` writes the `GATCGATCGATC` they stand for.
   * - **The format name is stripped** of spaces and hyphens at either end, so `" gb "` works.
   * - **`topology` is set** on a *deep* copy of the annotations -- `copy()` shares that map, and pydna
   *   uses `copy.deepcopy` here for exactly this reason -- `circular` for a circular molecule written as
   *   GenBank, and `linear` for everything else — including a circular molecule written as FASTA, which
   *   has nowhere to say so.
   * - **The result is trimmed.** Biopython's writers end with a newline and pydna takes it off.
   *
   * It works on a copy, so none of that reaches the record you called it on.
   *
   * @param format - A format name, optionally carrying `dscode`.
   * @returns The formatted text, with no trailing newline.
   * @throws {@link KeyError} for a format with no writer registered — importing `@biolibs/seqio`
   *   registers them.
   */
  override format(format = "gb"): string {
    const record = this.copy();
    let name = format;
    // pydna's `Dseq` subclasses Biopython's `Seq`, so its writers can take the molecule as it is. This
    // one does not, so the copy is handed a plain `Seq` of whatever the molecule prints as -- which is
    // what `str(record.seq)` gives the writer there.
    const d = this.seq as unknown as Dseq;
    let letters = d.toString();
    if (name.includes("dscode")) {
      name = name.replace("dscode", "");
      letters = d.dscode;
    }
    // The substitute carries `circular`, because pydna's copy keeps a `Dseq` -- which has it -- and
    // `PydnaSeqRecord.format`'s `"pydnafasta"` branch asks the *sequence* whether the molecule is closed.
    const substitute = Object.assign(new BioSeq(letters), { circular: d.circular });
    (record as unknown as { setSeqUnchecked(v: unknown): void }).setSeqUnchecked(substitute);
    // `copy()` shares the annotations map -- as pydna's does -- but `format` uses a *deep* copy there,
    // so setting `topology` below must not reach the record this was called on.
    record.annotations = new Map(this.annotations);
    name = stripSpacesAndHyphens(name);
    const topology = (name === "genbank" || name === "gb") && this.circular ? "circular" : "linear";
    record.annotations.set("topology", topology);
    // Called on the copy, as pydna calls `SeqRecord.format(record, format)` rather than `record.format`.
    return (super.format.call(record as never, name) as string).trim();
  }

  /**
   * The molecule as pydna draws it: the length and topology, then both strands with one feature
   * highlighted.
   *
   * The drawing is of the *molecule*, so the overhangs are padded with spaces and the lower strand is
   * the crick strand reversed — not the complement in place, which only looks the same when the ends are
   * blunt. A feature on the minus strand is highlighted on the lower line, and the two lines swap, so
   * the highlighted strand is always the one printed first.
   *
   * Each **part** of the feature's location is highlighted separately, which is what a feature spanning
   * the origin of a circle needs: `join{[5:6], [0:1]}` marks both ends rather than the whole molecule.
   *
   * @param feature - Which feature to highlight, by index; a negative index counts from the end, as
   *   Python's list subscript does. Default 0.
   * @param highlight - What to put before each part. Default is the ANSI code for a yellow background.
   * @param plain - What to put after it. Default is the ANSI reset.
   * @param figType - Accepted where pydna accepts it, and unused there as here.
   * @returns The figure. A record with **no** features still gets the highlight pair, emptily, at the
   *   very start — pydna stands an empty location in for the missing feature, and that is reproduced.
   * @throws TypeError for a molecule whose dscode holds loops or mismatches, so that it has no single
   *   overhang: pydna's arithmetic on `None` raises before it draws anything.
   */
  figure(feature = 0, highlight = "\u001b[48;5;11m", plain = "\u001b[0m",
         figType: string | null = null): string {
    void figType;
    const d = this.seq as unknown as Dseq;
    const feat = this.features[feature < 0 ? this.features.length + feature : feature];
    const parts: Array<[number, number]> = feat === undefined
      ? [[0, 0]]
      : feat.location!.parts
        .map((pt) => [Number(pt.start), Number(pt.end)] as [number, number])
        .sort((a, b) => a[0] - b[0]);
    const strand = feat === undefined ? 1 : feat.location!.strand;
    // A molecule whose dscode holds loops or mismatches has no single overhang to name, and pydna's
    // arithmetic on `None` raises before it draws anything. Reproduced, message and all.
    if (d.ovhg === null) throw new TypeError("unsupported operand type(s) for +: 'NoneType' and 'int'");
    const ovhg = d.ovhg;
    // How far the watson strand runs past the crick one at the right-hand end.
    const rightOvhg = ovhg + d.watson.length - d.crick.length;
    const pad = (n: number): string => " ".repeat(Math.max(0, n));
    const upper = pad(ovhg) + d.watson + pad(-rightOvhg);
    const lower = pad(-ovhg) + [...d.crick].reverse().join("") + pad(rightOvhg);
    const [marked, other] = strand === -1 ? [lower, upper] : [upper, lower];
    // The highlighted slices, then the plain stretches between them, interleaved.
    const highlighted = parts.map(([a, b]) => `${highlight}${marked.slice(a, b)}${plain}`).concat("");
    const between = [marked.slice(0, parts[0]![0])];
    for (let i = 0; i + 1 < parts.length; i++) between.push(marked.slice(parts[i]![1], parts[i + 1]![0]));
    between.push(marked.slice(parts[parts.length - 1]![1], this.length));
    const line = between.map((text, i) => text + (highlighted[i] ?? "")).join("");
    const topology = d.circular ? "o" : "-";
    const head = `${this.constructor.name}(${topology}${this.length})`;
    return strand === -1 ? `${head}\n${other}\n${line}` : `${head}\n${line}\n${other}`;
  }


  /** @returns The molecule, as a {@link Dseq} rather than the base class's sequence type. */
  get dseq(): Dseq { return this.seq as unknown as Dseq; }

  /**
   * The same molecule closed into a circle, with every feature renumbered to suit.
   *
   * Closing shortens the molecule by its overhangs, because the ends pair with each other instead of
   * hanging loose. So the features move: one that is now longer than the whole circle is dropped — it
   * spanned both overhangs and has nowhere to go — and the rest are rewritten against the new length.
   *
   * @returns The circular record.
   * @throws The TypeError `Dseq.looped` raises when the ends do not pair.
   */
  looped(): Dseqrecord {
    const out = this.copyRecord();
    out.setSeq(this.dseq.looped());
    const oldLength = this.length;
    const newLength = out.length;
    if (oldLength !== newLength) {
      const kept: SeqFeature[] = [];
      for (const f of out.features) {
        if (f.location!.length > newLength) continue;
        kept.push(new SeqFeature(shiftLocation(f.location!, 0, newLength) as SimpleLocation,
                                 f.type, f.id, new Map(f.qualifiers)));
      }
      out.features = kept;
    }
    return out;
  }

  /**
   * A linear, blunt copy of a circular molecule.
   *
   * @returns The copy.
   * @deprecated pydna deprecated this in favour of slicing — `record.slice()` — and warns when it is
   *   called. The warning is reproduced, as is the oddity that the method does not actually open the
   *   molecule: upstream the line that would is commented out, so what comes back is still circular.
   */
  tolinear(): Dseqrecord {
    warnDeprecated();
    const out = this.copyRecord();
    // The line that would linearise the molecule is commented out upstream, so this copies and no more.
    return out;
  }

  /**
   * The same circle read from a new origin.
   *
   * @param shift - Where the new origin is. A multiple of the length changes nothing.
   * @returns The rotated record, with its features renumbered and sorted by where they now start.
   * @throws TypeError for a linear molecule, which has an origin that cannot move.
   */
  shifted(shift: number): Dseqrecord {
    if (!this.circular) {
      throw new TypeError("Sequence is linear, origin can only be shifted for circular sequences.\n");
    }
    const ln = this.length;
    // A circle of no length: pydna reaches `shift % ln` and Python refuses it.
    if (ln === 0) throw new ZeroDivisionError("division by zero");
    if (shift % ln === 0) return this.copyRecord();
    const by = ((shift % ln) + ln) % ln;
    const newseq = (this.dseq.slice(by).add(this.dseq.slice(0, by)) as Dseq).looped();
    const moved = this.features.map((f) => shiftFeature(f, -by, ln));
    moved.sort((a, b) => Number(a.location!.start) - Number(b.location!.start));
    const out = this.copyRecord();
    out.features = moved;
    out.setSeq(newseq);
    return out;
  }

  /**
   * The reverse complement, named after this one.
   *
   * @returns The complement, with `_rc` appended to the id and the description and to the first thirteen
   *   characters of the name. Its provenance is left unset; see {@link Dseqrecord.source}.
   */
  override reverseComplement(): this {
    const answer = new Dseqrecord(this.dseq.reverseComplement(), null, this.n);
    answer.features = reverseFeatures(this.features, this.length);
    answer.annotations = new Map(this.annotations);
    answer.name = `${this.name.slice(0, 13)}_rc`;
    answer.description = `${this.description}_rc`;
    answer.id = `${this.id}_rc`;
    return answer as unknown as this;
  }

  /** @returns The reverse complement; pydna's shorter name for {@link reverseComplement}. */
  override rc(): this { return this.reverseComplement(); }

  /**
   * @returns An upper-cased copy. **The copy is linear**, even if this molecule is a circle: `Dseq.upper`
   *   builds a fresh sequence that knows nothing of pydna's circularity, and pydna does not put it back.
   */
  override upper(): this {
    const out = this.copyRecord();
    out.setSeq(this.dseq.upper());
    return out as unknown as this;
  }

  /** @returns A lower-cased copy, linear for the same reason as {@link Dseqrecord.upper}. */
  override lower(): this {
    const out = this.copyRecord();
    out.setSeq(this.dseq.lower());
    return out as unknown as this;
  }

  /** @returns The molecule's SEGUID v2 checksum, which identifies the duplex and not just one strand. */
  override seguid(): string { return seguidOf(this.dseq); }

  /** @returns `Dseqrecord(-N)` for a linear molecule and `Dseqrecord(oN)` for a circle. */
  override repr(): string {
    return `${this.constructor.name}(${this.circular ? "o" : "-"}${this.length})`;
  }

  /** @returns The record printed out, with its topology and size above what a plain record would show. */
  override toString(): string {
    return `Dseqrecord\ncircular: ${this.circular ? "True" : "False"}\nsize: ${this.length}\n`
      + super.toString();
  }

  /**
   * Where another molecule sits inside this one.
   *
   * @param other - A record to look for.
   * @returns The position, or -1. On a circle the search wraps: the molecule is doubled up to one base
   *   short of the other's length, so a match across the origin is found.
   */
  find(other: { seq?: unknown; length?: number }): number {
    const o = String(other.seq ?? other).toUpperCase();
    const text = this.dseq.toString().toUpperCase();
    const s = this.circular ? text + text.slice(0, (other.length ?? o.length) - 1) : text;
    return s.indexOf(o);
  }

  /**
   * Whether a sequence or a protein is in this molecule.
   *
   * The letters are looked for first; failing that, the molecule is translated in all three forward frames
   * and the letters are looked for in the protein, so `"RML"` is "in" a molecule that codes for it.
   *
   * @param other - What to look for.
   * @returns Whether it is there.
   */
  contains(other: string): boolean {
    if (this.dseq.toString().toLowerCase().includes(other.toLowerCase())) return true;
    const s = this.dseq.watson.replace(/ /g, "");
    const ln = s.length;
    const spc = ln % 3 ? 3 - (ln % 3) : 0;
    // Padded at the *front* here. `findAminoacids` pads at the back, which is a real difference between
    // the two and not a tidy-up waiting to happen: the frames they read are not the same.
    const padded = "n".repeat(spc) + s + "nnn";
    for (let frame = 0; frame < 3; frame++) {
      const protein = translateCodons(padded.slice(frame, frame + spc + ln));
      if (protein.toLowerCase().includes(other.toLowerCase())) return true;
    }
    return false;
  }

  /**
   * Where a run of amino acids is coded for, as a stretch of this molecule.
   *
   * @param other - The amino acids, in one-letter code.
   * @returns The stretch, as `[start, stop]`, or null when it is not coded for anywhere in the three
   *   forward frames. Any 5' overhang is added to both ends, so the answer indexes the molecule rather
   *   than the watson strand.
   */
  findAminoacids(other: string): [number, number] | null {
    const want = other.toLowerCase();
    const s = this.dseq.watson;
    const ln = s.length;
    const spc = ln % 3 ? 3 - (ln % 3) : 0;
    // Padded at the *back*, unlike `contains`.
    const padded = s + "n".repeat(spc) + "nnn";
    let start: number | null = null;
    let frame = 0;
    for (; frame < 3; frame++) {
      const found = translateCodons(padded.slice(frame, frame + ln + spc)).toLowerCase().indexOf(want);
      if (found !== -1) { start = found; break; }
    }
    // The overhang is read *before* the search is checked, as pydna reads it, so a molecule whose `ovhg`
    // is None raises even when nothing was found: `self.seq.ovhg if self.seq.ovhg > 0 else 0` compares
    // None with a number, which Python refuses.
    const raw = this.dseq.ovhg;
    if (raw === null) {
      throw new TypeError("'>' not supported between instances of 'NoneType' and 'int'");
    }
    const ovhg = raw > 0 ? raw : 0;
    if (start === null) return null;
    return [frame + start * 3 + ovhg, frame + (start + other.length) * 3 + ovhg];
  }

  /** @returns {@link Dseqrecord.findAminoacids}; pydna's shorter name for it. */
  findAa(other: string): [number, number] | null { return this.findAminoacids(other); }

  /**
   * @param minsize - The shortest reading to report, in bases.
   * @returns Every open reading frame, each as a record cut from this one.
   */
  orfs(minsize = 300): Dseqrecord[] {
    return this.dseq.orfs(minsize).map(([x, y]) => new Dseqrecord(this.slice(x, y)));
  }

  /**
   * Every open reading frame on both strands, as features that can be drawn on the molecule.
   *
   * @param minsize - The shortest reading to report, in bases.
   * @returns One `CDS` feature per reading, carrying its length in bases and residues, the checksums of
   *   the stretch and of the protein, and the translation itself.
   */
  orfsToFeatures(minsize = 300): SeqFeature[] {
    const features: SeqFeature[] = [];
    for (const [strand, s] of [[1, this.dseq], [-1, this.dseq.reverseComplement()]] as Array<[Strand, Dseq]>) {
      for (const [x, y] of s.orfs(minsize)) {
        const orf = new Dseqrecord(this.slice(x, y));
        const protein = orf.translate();
        features.push(new SeqFeature(
          new SimpleLocation(x, y, strand), "CDS", "<unknown id>",
          new Map<string, unknown>([
            ["note", `${y - x}bp ${Math.floor((y - x) / 3)}aa`],
            ["checksum", [`${orf.seguid()} (DNA)`, `${protein.seguid()} (protein)`]],
            ["codon_start", 1],
            ["transl_table", 11],
            ["translation", protein.seq?.toString() ?? ""],
          ]),
        ));
      }
    }
    return features;
  }

  /**
   * The same molecule with untemplated bases added to both 3' ends, as terminal transferase leaves it.
   *
   * @param nucleotides - What to add; `"a"` by default.
   * @returns The tailed record, with every feature shifted along by as much as was added to the front.
   */
  terminalTransferase(nucleotides = "a"): Dseqrecord {
    const out = this.copyRecord();
    out.setSeq(terminalTransferase(this.dseq, nucleotides));
    out.features = this.features.map((f) => new SeqFeature(
      f.location!.shift(nucleotides.length) as SimpleLocation, f.type, f.id, new Map(f.qualifiers)));
    return out;
  }

  /**
   * Mark a region, which on a circle may run backwards and wrap around the origin.
   *
   * @param x - Where it starts. @param y - Where it ends. @param seq - A sequence to locate instead.
   * @param type - The feature's type. @param strand - Which strand.
   * @param qualifiers - Extra qualifiers.
   */
  override addFeature(x: number | null = null, y: number | null = null, seq: unknown = null,
                      type = "misc", strand: Strand = 1,
                      qualifiers: Record<string, unknown> = {}): void {
    // The wrapping branch needs both positions to be *truthy*, so a feature starting at zero never takes
    // it however circular the molecule is; that is pydna's own condition, zero-as-false included.
    if (!(x && y && this.circular && x > y)) {
      super.addFeature(x, y, seq, type, strand, qualifiers);
      return;
    }
    const q = new Map<string, unknown>(Object.entries(qualifiers));
    const location = new CompoundLocation([new SimpleLocation(x, this.length, strand),
                                           new SimpleLocation(0, y, strand)]);
    const sf = new SeqFeature(location, type, "<unknown id>", q);
    // Upstream fills the label in *after* building the feature, on the dictionary the feature now holds,
    // and asks `isorf` before the label is there. Both are reproduced: the order is observable.
    if (!q.has("label")) q.set("label", [`ft${location.length}`]);
    const piece = sf.extract(this as never) as unknown as Dseqrecord;
    if (piece.isorf()) q.set("label", [`orf${location.length}`]);
    this.features.push(sf);
  }

  /**
   * Join this molecule to another, end to end.
   *
   * The other molecule's features move along by where it now starts — which is *not* simply this
   * molecule's length, because joining two sticky ends overlaps them, so the result is shorter than the
   * sum and the offset is negative. The amount of substance is the smaller of the two, since a mixture
   * cannot have more of the product than of its scarcer part.
   *
   * @param other - A record, a molecule or a string.
   * @returns The joined record.
   * @throws What `Dseq.add` throws when the two ends do not pair.
   */
  override add(other: unknown): this {
    const holder = other as { seq?: { watson?: unknown }; features?: SeqFeature[]; n?: number };
    const isRecord = holder?.seq !== undefined && (holder.seq as { watson?: unknown }).watson !== undefined;
    let shiftedFeatures: SeqFeature[] = [];
    let newseq: Dseq;
    if (isRecord) {
      const them = other as Dseqrecord;
      newseq = this.dseq.add(them.dseq) as Dseq;
      // Biopython's join has already moved the right-hand features along by this molecule's length;
      // pydna's offset is the correction on top of that, which is negative when the two ends overlap
      // because the joined molecule is shorter than the sum of its parts.
      const offset = newseq.length - (this.length + them.length);
      shiftedFeatures = them.features.map((f) => new SeqFeature(
        f.location!.shift(this.length + offset) as SimpleLocation, f.type, f.id,
        new Map(f.qualifiers)));
    } else {
      // Adding text to an empty molecule gives the text straight back, and pydna then tries to put a
      // plain string where a sequence belongs, which its own setter refuses.
      const joined = this.dseq.add(String(other));
      if (typeof joined === "string") throw new TypeError("seq must be a Seq or MutableSeq object");
      newseq = joined;
    }
    // Biopython keeps an identifier only where both records agree on it, and leaves a placeholder
    // otherwise; pydna fills its own defaults in for those. Adding plain text changes nothing.
    const them = other as { id?: string | null; name?: string; description?: string };
    const agreed = <T>(mine: T, theirs: T, fallback: T): T => (!isRecord || mine === theirs ? mine : fallback);
    const answer = this.derive(newseq, agreed(this.id, them?.id ?? null, "id"),
                               agreed(this.name, them?.name ?? "", "name"),
                               agreed(this.description, them?.description ?? "", "description"),
                               [...this.dbxrefs], [...this.features, ...shiftedFeatures], new Map(this.annotations));
    // pydna fills in its own defaults where Biopython's join leaves a placeholder.
    if (answer.name === "<unknown name>") answer.name = "name";
    if (answer.id === "<unknown id>") answer.id = "id";
    if (answer.description === "<unknown description>") answer.description = "description";
    answer.n = Math.min(this.n, holder?.n ?? this.n);
    return answer as unknown as this;
  }

  /**
   * Rebuild a record of this class, which is the single seam the base class uses when it slices, joins or
   * transforms one.
   *
   * It has to be overridden because a `Dseqrecord`'s constructor takes a molecule and its circularity
   * where the base's takes a sequence and identifiers. pydna needs no equivalent: Python forwards the
   * identifiers through `*args` while `circular` and `n` are keyword-only, so the base can call the
   * subclass without knowing about them.
   *
   * @param seq - The new sequence, already a {@link Dseq} wherever the base sliced this record's own.
   * @param id - The accession. @param name - The locus. @param description - The definition.
   * @param dbxrefs - Cross-references. @param features - Features. @param annotations - Annotations.
   * @param letterAnnotations - Per-letter annotations.
   * @returns The rebuilt record.
   */
  override derive(seq: unknown, id?: string | null, name?: string, description?: string,
                  dbxrefs?: string[] | null, features?: SeqFeature[] | null,
                  annotations?: Map<string, unknown> | null,
                  letterAnnotations?: Map<string, unknown> | null): Dseqrecord {
    const molecule = seq instanceof Dseq ? seq : Dseq.quick(String(seq ?? ""), false);
    const out = new Dseqrecord(molecule, null, this.n,
                               id === undefined ? this.id : id,
                               name === undefined ? this.name : name,
                               description === undefined ? this.description : description);
    out.dbxrefs = dbxrefs === undefined || dbxrefs === null ? [] : [...dbxrefs];
    out.features = features === undefined || features === null ? [] : [...features];
    if (annotations !== undefined && annotations !== null) {
      out.annotations = new Map(annotations);
      out.annotations.set("molecule_type", "DNA");
      if (!out.annotations.has("source")) out.annotations.set("source", "");
      if (!out.annotations.has("organism")) out.annotations.set("organism", ".");
    }
    if (letterAnnotations !== undefined && letterAnnotations !== null) {
      out.letterAnnotations = letterAnnotations as never;
    }
    return out;
  }

  /**
   * The molecule repeated end to end.
   *
   * @param times - How many copies. Zero or fewer gives an empty record, as Python's `*` does for a
   *   sequence; one gives a copy.
   * @returns The repeated record.
   * @throws TypeError for a circular molecule, which has no ends to join, and for a non-integer count,
   *   with pydna's own doubled-up wording.
   */
  multiply(times: number): Dseqrecord {
    if (!Number.isInteger(times)) {
      throw new TypeError(
        `TypeError: can't multiply Dseqrecord by non-int of type ${pyClassRepr(times)}`);
    }
    if (this.circular) throw new TypeError("TypeError: can't multiply circular Dseqrecord.");
    if (times <= 0) return new Dseqrecord("");
    let out = this.copyRecord();
    for (let i = 1; i < times; i++) out = out.add(this) as unknown as Dseqrecord;
    return out;
  }

  /**
   * Join records with this molecule between them, as `str.join` joins strings.
   *
   * @param fragments - What to join. An empty list gives an empty record, again as `str.join` does.
   * @returns The joined record.
   */
  joinRecords(fragments: Iterable<Dseqrecord>): Dseqrecord {
    const it = [...fragments];
    const first = it[0];
    if (first === undefined) return new Dseqrecord("");
    let result = first;
    for (const x of it.slice(1)) {
      result = (result.add(this) as unknown as Dseqrecord).add(x) as unknown as Dseqrecord;
    }
    return result;
  }

  /**
   * Digest the molecule with one or more restriction enzymes.
   *
   * @param enzymes - One enzyme, a batch, or any mixture of those.
   * @returns One record per fragment, in the order they lie along the molecule, each carrying the
   *   features that fall inside it. An enzyme that does not cut gives nothing back.
   */
  cut(...enzymes: Enzymes[]): Dseqrecord[] {
    const cutsites = getCutsites(this.dseq, ...enzymes);
    return getCutsitePairs(this.dseq, cutsites).map(([left, right]) => this.applyCut(left, right));
  }

  /**
   * Open a circular molecule at the one place an enzyme cuts it.
   *
   * @param enzymes - The enzymes to try.
   * @returns The opened molecule, named after this one with `_lin` appended.
   * @throws TypeError for a linear molecule, for enzymes that do not cut, and for enzymes that cut more
   *   than once — the point of the method is that there is exactly one answer.
   */
  linearize(...enzymes: Enzymes[]): Dseqrecord {
    if (!this.circular) throw new TypeError("Can only linearize circular molecules!");
    const fragments = this.cut(...enzymes);
    if (fragments.length > 1) throw new TypeError("More than one fragment is formed!");
    if (fragments.length === 0) throw new TypeError("The enzyme(s) do not cut!");
    const answer = fragments[0]!;
    answer.id = `${this.name}_lin`;
    answer.name = answer.id.slice(0, 16);
    return answer;
  }

  /**
   * How many times a set of enzymes cuts.
   *
   * Counted by searching for each enzyme's site, so this counts *sites* rather than fragments: it does
   * not care whether a site falls somewhere the molecule can actually be broken. Repeats are not dropped
   * either — pydna flattens the arguments without de-duplicating them here, where finding the cut sites
   * does de-duplicate, so naming one enzyme twice counts its sites twice.
   *
   * @param enzymes - The enzymes to count.
   * @returns The total number of sites.
   */
  numberOfCuts(...enzymes: Enzymes[]): number {
    let total = 0;
    for (const enzyme of enzymeList(enzymes, false)) {
      total += enzyme.search(new BioSeq(this.dseq.toString())).length;
    }
    return total;
  }

  /**
   * @param batch - Which enzymes to consider; the commercially available ones by default, as pydna picks.
   * @returns Those of them that do not cut this molecule at all.
   */
  noCutters(batch: RestrictionBatch | null = null): RestrictionBatch {
    return cuttersBy(this.dseq, batch ?? CommOnly, 0);
  }

  /** @param batch - Which enzymes to consider. @returns Those that cut exactly once. */
  uniqueCutters(batch: RestrictionBatch | null = null): RestrictionBatch {
    return cuttersBy(this.dseq, batch ?? CommOnly, 1);
  }

  /** @param batch - Which enzymes to consider. @returns Those that cut exactly once; pydna's other name. */
  onceCutters(batch: RestrictionBatch | null = null): RestrictionBatch {
    return cuttersBy(this.dseq, batch ?? CommOnly, 1);
  }

  /** @param batch - Which enzymes to consider. @returns Those that cut exactly twice. */
  twiceCutters(batch: RestrictionBatch | null = null): RestrictionBatch {
    return cuttersBy(this.dseq, batch ?? CommOnly, 2);
  }

  /**
   * @param n - How many times. @param batch - Which enzymes to consider.
   * @returns Those that cut exactly `n` times.
   */
  nCutters(n = 3, batch: RestrictionBatch | null = null): RestrictionBatch {
    return cuttersBy(this.dseq, batch ?? CommOnly, n);
  }

  /** @param batch - Which enzymes to consider. @returns Those that cut at least once. */
  cutters(batch: RestrictionBatch | null = null): RestrictionBatch {
    return cuttersBy(this.dseq, batch ?? CommOnly, null);
  }

  /**
   * The same circle rotated so that it lines up with another sequence.
   *
   * Cloning a plasmid leaves the product starting wherever the assembly happened to begin, which makes
   * two versions of the same construct look different. This rotates one to match the other: the molecule
   * is doubled, the longest stretch it shares with the reference *starting at the reference's own
   * beginning* is found, and the origin is moved there. The reverse complement is searched too, and wins
   * if it matches better, in which case the answer is complemented as well as rotated.
   *
   * @param ref - What to line up with: a string, a sequence or a record.
   * @param limit - The shortest shared stretch worth using.
   * @returns The rotated molecule.
   * @throws TypeError for a linear molecule, and for a reference with nothing in common with this one.
   */
  synced(ref: unknown, limit = 25): Dseqrecord {
    if (!this.circular) throw new TypeError("Only circular DNA can be synced!");
    const s = this.dseq.watson.toLowerCase();
    const sRc = this.dseq.crick.toLowerCase();
    const holder = ref as { seq?: { watson?: unknown } };
    let r: string;
    if (holder?.seq !== undefined) {
      const inner = holder.seq;
      r = String(inner?.watson !== undefined ? inner.watson : inner).toLowerCase();
    } else {
      r = String(ref).toLowerCase();
    }
    // pydna caps the limit at something the molecule can actually hold a whole number of times, plus one.
    const lim = Math.min(limit, limit * Math.floor(s.length / limit) + 1);
    // Only the matches that begin at the reference's own start count, which is what makes this a
    // "where does the reference begin in me" search rather than a general overlap.
    const c = commonSubStrings(s + s, r, lim).filter(([, y]) => y === 0).map(([x, , n]) => [x, n]);
    const d = commonSubStrings(sRc + sRc, r, lim).filter(([, y]) => y === 0).map(([x, , n]) => [x, n]);
    if (c.length === 0 && d.length === 0) throw new TypeError("There is no overlap between sequences!");
    const [start, length] = c[0] ?? [0, 0];
    const [startRc, lengthRc] = d[0] ?? [0, 0];
    let newseq: Dseqrecord = this.copyRecord();
    let at = start!;
    if (lengthRc! > length!) {
      at = startRc!;
      newseq = newseq.rc();
    }
    return at === 0 ? newseq : newseq.shifted(at);
  }

  /**
   * Cut a piece out of the molecule, carrying whatever is annotated there.
   *
   * On a linear molecule, or where the piece runs forwards, this is the ordinary thing. On a circle where
   * the end is *before* the start, the piece runs through the origin: the molecule is rotated to begin at
   * the cut and the features are taken from there, keeping only those that now fit inside the piece and
   * do not themselves wrap. A circular slice whose start and end are the same asks for the whole circle
   * opened at that point, which is a cut rather than a slice, so it goes through
   * {@link Dseqrecord.applyCut}.
   *
   * Unlike a plain record's slice, the piece keeps this record's id and name: pydna's `Dseqrecord` does
   * not name a piece after what is annotated in it.
   *
   * @param start - Where to cut from. @param stop - Where to cut to. @param step - The step.
   * @returns The piece.
   */
  override slice(start?: number | null, stop?: number | null, step?: number | null): Dseqrecord {
    const answer = this.copyRecord();
    answer.setSeq(this.dseq.slice(start, stop, step));
    const slStart = start || 0;
    const slStop = stop || this.length;
    if (!this.circular || slStart < slStop) {
      // A circular slice ending at zero means the end of the molecule, not the start of it.
      const end = this.circular && stop === 0 ? this.length : stop;
      answer.features = (super.slice(start, end, step) as PydnaSeqRecord).features;
    } else if (slStart > slStop) {
      const rotated = this.shifted(slStart).features;
      answer.features = rotated.filter((f) => {
        const [begin, finish] = locationBoundaries(f.location!);
        // Only the features that fit inside the piece, and that do not themselves span the origin --
        // which is what `begin < finish` tests, since a wrapping location reports them the other way up.
        return finish <= answer.length && begin < finish;
      });
    } else {
      // start === stop on a circle: open the whole circle at that point.
      const cut: CutSite = { watson: slStart, ovhg: 0, enzyme: null };
      return this.applyCut(cut, cut);
    }
    return answer;
  }

  /**
   * The fragment between two cuts, with the features that belong to it.
   *
   * Where the two cuts are the same the molecule is being opened rather than divided, and the features
   * need the most care: one lying entirely within the overhang has to be carried across to the far end of
   * the opened molecule, because that is where those bases now are, while one that straddles the cut has
   * nowhere to go and is dropped.
   *
   * @param leftCut - The cut at the left end, or null for the molecule's own end.
   * @param rightCut - The cut at the right end, or null.
   * @returns The fragment.
   */
  applyCut(leftCut: CutSite | null, rightCut: CutSite | null): Dseqrecord {
    const dseq = applyCut(this.dseq, leftCut, rightCut);
    let features: SeqFeature[];
    if (sameCut(leftCut, rightCut)) {
      if (leftCut === null) {
        features = this.features.map((f) => new SeqFeature(
          f.location as SimpleLocation, f.type, f.id, new Map(f.qualifiers)));
      } else {
        const [leftWatson, leftCrick, leftOvhg] = getCutParameters(this.dseq, leftCut, true);
        // Rotate to the cut first, so that the features which used to span the origin are written as one
        // stretch and can be reasoned about.
        const initialShift = (leftOvhg ?? 0) < 0 ? leftWatson : leftCrick;
        features = this.shifted(initialShift).features;
        const overhang = Math.abs(leftOvhg ?? 0);
        // The features that end before the cut belong at the far end of the opened molecule, so they are
        // shifted back past the origin and then forward again against the *new* length, which is longer
        // by the overhang.
        const needTransfer = features
          .filter((f) => locationBoundaries(f.location!)[1] <= overhang)
          .map((f) => shiftFeature(f, -overhang, this.length));
        features = [...features, ...needTransfer.map((f) => shiftFeature(f, overhang, dseq.length))];
        features = features.filter((f) => {
          const [begin, finish] = locationBoundaries(f.location!);
          return finish <= dseq.length && begin <= finish;
        });
      }
    } else {
      const [leftWatson, leftCrick, leftOvhg] = getCutParameters(this.dseq, leftCut, true);
      const [rightWatson, rightCrick, rightOvhg] = getCutParameters(this.dseq, rightCut, false);
      const leftEdge = (leftOvhg ?? 0) > 0 ? leftCrick : leftWatson;
      const rightEdge = (rightOvhg ?? 0) > 0 ? rightWatson : rightCrick;
      features = this.slice(leftEdge, rightEdge).features;
    }
    const out = new Dseqrecord(dseq, null, this.n);
    out.features = features;
    return out;
  }

  /** @returns A copy of this record, as `copy.deepcopy` makes: features and annotations copied too. */
  private copyRecord(): Dseqrecord {
    const out = new Dseqrecord(this.dseq, null, this.n);
    out.id = this.id;
    out.name = this.name;
    out.description = this.description;
    out.dbxrefs = [...this.dbxrefs];
    out.annotations = new Map(this.annotations);
    out.features = this.features.map((f) => new SeqFeature(
      f.location as SimpleLocation, f.type, f.id, new Map(f.qualifiers)));
    return out;
  }

  /**
   * @param seq - The molecule to put in place. Through the base class's unchecked setter, because a
   *   `Dseq` is not a Biopython sequence in this port even though it is one in pydna.
   */
  private setSeq(seq: Dseq): void {
    this.setSeqUnchecked(seq);
  }
}

/**
 * Whether two cuts are the same place, which is how `applyCut` tells opening a molecule from dividing it.
 *
 * @param a - One cut. @param b - The other.
 * @returns Whether they describe the same break, nulls included.
 */
const sameCut = (a: CutSite | null, b: CutSite | null): boolean =>
  a === b || (a !== null && b !== null && a.watson === b.watson && a.ovhg === b.ovhg
    && a.enzyme === b.enzyme);

/**
 * The features of a reverse-complemented molecule, each flipped end for end.
 *
 * @param features - The original features. @param length - The molecule's length.
 * @returns The flipped features, in the order they now appear.
 */
function reverseFeatures(features: SeqFeature[], length: number): SeqFeature[] {
  const flipped = features.map((f) => {
    const loc = f.location!;
    // Each *part* is flipped where it stands. Flipping only the outer start and end would collapse a
    // feature that spans the origin -- two parts with the whole molecule between them -- into one
    // stretch covering all of it, and reversing the parts afterwards puts them in the wrong order:
    // flipping a part already moves it to the other side, so the list comes out ordered on its own.
    const parts = loc.parts.map((p) => new SimpleLocation(
      length - Number(p.end), length - Number(p.start),
      p.strand === null ? null : (-p.strand as Strand)));
    const moved = parts.length > 1 ? new CompoundLocation(parts) : parts[0]!;
    return new SeqFeature(moved, f.type, f.id, new Map(f.qualifiers));
  });
  // Biopython sorts the flipped features by where they now start rather than simply reversing them, so a
  // molecule's features come back in the order they appear along the new strand.
  flipped.sort((a, b) => Number(a.location!.start) - Number(b.location!.start));
  return flipped;
}

/** The deprecation pydna emits from `tolinear`. */
function warnDeprecated(): void {
  warn("tolinear method is obsolete; please use obj[:] instead of obj.tolinear().",
       "_PydnaDeprecationWarning");
}

/**
 * @param s - A nucleotide string, whose length is already a multiple of three.
 * @returns Its translation by the standard code, stops written as `*`, through the ported
 *   `Bio.Seq.translate` that pydna itself calls here.
 */
const translateCodons = (s: string): string => new BioSeq(s).translate().toString();
