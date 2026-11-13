/** `RestrictionBatch`: a set of enzymes that can be searched together. */

import { KeyError, ValueError, pyClassRepr } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { FormattedSeq } from "./formatted-seq.js";
import { registry } from "./registry.js";
import { RestrictionType } from "./restriction-type.js";
import { suppliers as suppliersDict } from "./restriction-dictionary.js";

/** Cut positions by enzyme. */
export type Mapping = Map<RestrictionType, number[]>;

/** A set of enzymes. Strings that name an enzyme are accepted wherever an enzyme is. */
export class RestrictionBatch extends Set<RestrictionType> {
  /** Cut positions of the latest search. */
  mapping: Mapping = new Map();
  /** `[sequence text, linear]` of the latest search, so repeating it is free. */
  alreadyMapped: string | null = null;
  /** Codes of the suppliers whose enzymes were added by code. */
  suppliers: string[];
  /** Set (and nothing else) by {@link RestrictionBatch.split} and {@link RestrictionBatch.lambdasplit}. */
  _data?: Map<RestrictionType, boolean>;

  /**
   * @param first - Enzymes or their names.
   * @param suppliers - Supplier codes; all the enzymes of those suppliers are added.
   * @throws ValueError for something that is not an enzyme; KeyError for an unknown supplier code.
   */
  constructor(first: Iterable<RestrictionType | string> = [], suppliers: Iterable<string> = []) {
    super();
    const items: RestrictionType[] = [];
    for (const x of first) items.push(RestrictionBatch.formatOf(x));
    const codes = [...suppliers];
    for (const n of codes) {
      const entry = suppliersDict[n];
      if (entry === undefined) throw new KeyError(n);
      for (const x of entry[1]) items.push(registry.byName.get(x)!);
    }
    for (const e of items) super.add(e);
    this.mapping = new Map([...this].map((x) => [x, null as never]));
    this.suppliers = codes.filter((x) => Object.hasOwn(suppliersDict, x));
  }

  private static formatOf(y: unknown): RestrictionType {
    if (y instanceof RestrictionType) return y;
    const found = registry.byName.get(String(y));
    if (found !== undefined) return found;
    throw new ValueError(`${pyClassRepr(y)} is not a RestrictionType`);
  }

  /** @param y - An enzyme or its name. @returns The enzyme. @throws ValueError for anything else. */
  format(y: unknown): RestrictionType { return RestrictionBatch.formatOf(y); }

  /** @param y - Anything. @returns Whether it is an enzyme or the name of one. */
  isRestriction(y: unknown): boolean { return y instanceof RestrictionType || registry.byName.has(String(y)); }

  /** @returns The enzyme names sorted, joined with `+`; `a+b...y+z` for five or more. */
  toString(): string {
    const e = this.elements();
    return this.size < 5 ? e.join("+") : [e.slice(0, 2).join("+"), e.slice(-2).join("+")].join("...");
  }
  /** @returns Python's repr: `RestrictionBatch(['EcoRI', ...])`. */
  repr(): string { return `RestrictionBatch([${this.elements().map((n) => `'${n}'`).join(", ")}])`; }

  /** @param other - An enzyme or a name. @returns Whether the batch holds it (false for non-enzymes). */
  override has(other: RestrictionType | string): boolean {
    let e: RestrictionType;
    try { e = this.format(other); } catch { return false; }
    return super.has(e);
  }

  /**
   * An enzyme of the batch.
   *
   * @param enzyme - An enzyme or a name.
   * @param add - Add it if the batch does not hold it.
   * @throws ValueError if it is not in the batch (and `add` is false).
   */
  get(enzyme: RestrictionType | string, add = false): RestrictionType {
    const e = this.format(enzyme);
    if (this.has(e)) return e;
    if (add) { this.add(e); return e; }
    throw new ValueError(`enzyme ${e.name} is not in RestrictionBatch`);
  }

  /**
   * Biopython's `lambdasplit`. It builds the filtered list but, as written there, stores it in an attribute and
   * returns an *empty* batch.
   */
  lambdasplit(func: (e: RestrictionType) => boolean): RestrictionBatch {
    const d = [...this].filter(func);
    const out = new RestrictionBatch();
    out._data = new Map(d.map((e) => [e, true]));
    return out;
  }

  /**
   * Biopython's `split`: keep the enzymes built from all the given kinds (a kind mapped to `false` in `flags` must be
   * absent). As in Biopython the result is an empty batch whose `_data` holds the selection.
   *
   * @param classes - Kind names such as `Palindromic` or `Blunt`.
   * @param flags - Optional kind name to required presence.
   */
  split(classes: string[], flags: Record<string, boolean> = {}): RestrictionBatch {
    const test = (e: RestrictionType): boolean => {
      for (const k of classes) {
        const b = Object.hasOwn(flags, k) ? flags[k]! : true;
        // Biopython asks `issubclass(member, kind)`, which refuses a member that is not a class at all — which
        // `addNocheck` allows into the set.
        if (!(e instanceof RestrictionType)) throw new TypeError("issubclass() arg 1 must be a class");
        if (e.isA(k)) { if (b) continue; return false; }
        if (b) return false;
      }
      return true;
    };
    const out = new RestrictionBatch();
    out._data = new Map([...this].filter(test).map((e) => [e, true]));
    return out;
  }

  /** Add all the enzymes of a supplier. @param letter - The supplier code. @throws KeyError for an unknown code. */
  addSupplier(letter: string): void {
    const supplier = suppliersDict[letter];
    if (supplier === undefined) throw new KeyError(letter);
    this.suppliers.push(letter);
    for (const x of supplier[1]) this.addNocheck(registry.byName.get(x)!);
  }

  /** @returns The names of the suppliers whose enzymes were added, sorted. */
  currentSuppliers(): string[] { return this.suppliers.map((x) => suppliersDict[x]![0]).sort(); }

  /** Python `batch += other`. */
  iadd(other: RestrictionType | string): this { this.add(other); return this; }
  /**
   * Python `batch + other`: a copy with `other` added.
   *
   * Biopython builds the copy as `self.__class__(self)`, so the result keeps the receiver's class: adding to an
   * {@link Analysis} gives an `Analysis`, not a plain batch. Every subclass therefore has to accept a batch as its
   * first argument, which `Analysis` does.
   */
  plus(other: RestrictionType | string): RestrictionBatch {
    const Ctor = this.constructor as new (first: Iterable<RestrictionType | string>) => RestrictionBatch;
    const n = new Ctor(this);
    n.add(other);
    return n;
  }

  /** Remove an enzyme. @throws KeyError if it is not in the batch; ValueError if it is not an enzyme. */
  remove(other: RestrictionType | string): void {
    const e = this.format(other);
    if (!super.delete(e)) throw new KeyError(e.name);
  }

  /** Add an enzyme (or a name). @throws ValueError for anything else. */
  override add(other: RestrictionType | string): this {
    super.add(this.format(other));
    return this;
  }

  /** Add an enzyme without checking it. */
  addNocheck(other: RestrictionType): this { super.add(other); return this; }

  /**
   * @returns The enzyme names, sorted. Biopython takes `str()` of each member, and {@link RestrictionBatch.addNocheck}
   *   will put anything in the set, so a member that is not an enzyme is named by its own string form.
   */
  elements(): string[] { return [...this].map(String).sort(); }
  /** @returns The member names in batch order, `str()` of each as in {@link RestrictionBatch.elements}. */
  asString(): string[] { return [...this].map(String); }

  /** @returns The supplier codes mapped to company names. */
  static supplCodes(): Record<string, string> { return Object.fromEntries(Object.entries(suppliersDict).map(([k, v]) => [k, v[0]])); }
  /** Print `code = company` for every supplier. */
  static showCodes(): void { console.log(Object.entries(RestrictionBatch.supplCodes()).map(([k, v]) => `${k} = ${v}`).join("\n")); }

  /** Python `batch / dna`. */
  div(dna: Seq | FormattedSeq): Mapping { return this.search(dna); }

  /**
   * Search a sequence with every enzyme of the batch.
   *
   * @param dna - A `Seq` or `FormattedSeq` (a `MutableSeq` is refused, as in Biopython).
   * @param linear - False for a circular sequence.
   * @returns Cut positions by enzyme; the previous result if the same sequence is searched again.
   * @throws TypeError for other input.
   */
  search(dna: Seq | FormattedSeq, linear = true): Mapping {
    let fseq: FormattedSeq;
    let key: string;
    if (dna instanceof Seq) {
      key = JSON.stringify([dna.toString(), linear]);
      if (key === this.alreadyMapped) return this.mapping;
      fseq = new FormattedSeq(dna, linear);
    } else if (dna instanceof FormattedSeq) {
      key = JSON.stringify([dna.toString(), dna.linear]);
      if (key === this.alreadyMapped) return this.mapping;
      fseq = dna;
    } else throw new TypeError(`Expected Seq or MutableSeq instance, got ${pyClassRepr(dna)} instead`);
    this.alreadyMapped = key;
    this.mapping = new Map([...this].map((x) => {
      // Biopython calls `enzyme.search(...)` on each member, which fails on a member that is not an enzyme — and
      // `addNocheck` allows one in. Without this a string member would reach `String.prototype.search` and return -1.
      if (!(x instanceof RestrictionType)) throw new TypeError(`'${typeof x}' object has no attribute 'search'`);
      return [x, x.search(fseq)];
    }));
    return this.mapping;
  }
}
