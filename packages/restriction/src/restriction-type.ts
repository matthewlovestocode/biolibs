/** `RestrictionType`: one restriction enzyme, with its site, cut positions and the operations Biopython gives enzyme classes. */

import { KeyError, ValueError, pyClassRepr } from "@biolibs/core";
import type { Seq } from "@biolibs/seq";
import { FormattedSeq, type SiteMatch } from "./formatted-seq.js";
import { allEnzymes, registry } from "./registry.js";
import type { EnzymeData } from "./restriction-dictionary.js";
import { suppliers as suppliersDict } from "./restriction-dictionary.js";
import type { RestrictionBatch } from "./batch.js";

/** IUPAC ambiguity codes to the letters that match them (as regular-expression classes). */
const MATCHING: Readonly<Record<string, string>> = {
  A: "ARWMHVDN", C: "CYSMHBVN", G: "GRSKBVDN", T: "TYWKHBDN", R: "ABDGHKMNSRWV", Y: "CBDHKMNSTWVY", W: "ABDHKMNRTWVY", S: "CBDGHKMNSRVY",
  M: "ACBDHMNSRWVY", K: "BDGHKNSRTWVY", H: "ACBDHKMNSRTWVY", B: "CBDGHKMNSRTWVY", V: "ACBDGHKMNSRWVY", D: "ABDGHKMNSRTWVY", N: "ACBDGHKMNSRTWVY",
};

/** Python's `NotImplementedError`. */
class NotImplementedError extends Error { override name = "NotImplementedError"; }

const nTimes = (n: number): string => "N".repeat(Math.max(0, n));

/** A sequence as `search` and `catalyse` accept it. */
export type DnaInput = Seq | import("@biolibs/seq").MutableSeq | FormattedSeq;

/**
 * A restriction enzyme. Biopython builds one class per enzyme from mixins such as `Palindromic`, `OneCut`, `Ov5`,
 * `Defined` and `Commercially_available`; here the enzyme is an object that knows which of them apply (`kinds`).
 * Searching stores its state (`dna`, `results`, `onMinus`) on the enzyme, as the Python classes do.
 */
export class RestrictionType {
  /** The enzyme name, e.g. `EcoRI`. */
  readonly name: string;
  /** The mixins this enzyme is built from, e.g. `Palindromic`, `OneCut`, `Ov5`, `Defined`, `Meth_Dep`, `Commercially_available`. */
  readonly kinds: ReadonlySet<string>;
  /** Recognition site. */
  readonly site: string;
  /** Length of the site. */
  readonly size: number;
  /** Regular expression finding the site (on both strands for non-palindromic enzymes). */
  readonly compsite: RegExp;
  /** First cut on the top strand. */
  readonly fst5: number | null;
  /** First cut on the bottom strand. */
  readonly fst3: number | null;
  /** Second cut on the top strand. */
  readonly scd5: number | null;
  /** Second cut on the bottom strand. */
  readonly scd3: number | null;
  /** Overhang length (negative for 5' overhangs). */
  readonly ovhg: number | null;
  /** Overhang sequence. */
  readonly ovhgseq: string | null;
  /** `[fst5, fst3, scd5, scd3, site]`. */
  readonly charac: EnzymeData["charac"];
  /** Expected distance between sites in random sequence. */
  readonly freq: number;
  /** REBASE id. */
  readonly id: number | null;
  /** Inactivation temperature. */
  readonly inactTemp: number | null;
  /** Optimal temperature. */
  readonly optTemp: number | null;
  /** Substrate. */
  readonly substrat: string;
  /** Supplier codes. */
  readonly suppl: readonly string[];
  /** REBASE link. */
  readonly uri: string | null;
  /** The sequence of the latest search. */
  dna: FormattedSeq | null = null;
  /** The cut positions of the latest search. */
  results: number[] | null = null;
  /** The cuts made by sites on the bottom strand in the latest search (non-palindromic enzymes). */
  onMinus: number[] | null = null;

  /**
   * @param name - Enzyme name.
   * @param kinds - Mixin names.
   * @param data - The REBASE record.
   * @throws ValueError for a hyphen in the name or a bad regular expression.
   */
  constructor(name: string, kinds: readonly string[], data: EnzymeData) {
    if (name.includes("-")) throw new ValueError(`Problem with hyphen in '${name}' as enzyme name`);
    this.name = name;
    this.kinds = new Set(kinds);
    this.site = data.site; this.size = data.size; this.fst5 = data.fst5; this.fst3 = data.fst3; this.scd5 = data.scd5; this.scd3 = data.scd3;
    this.ovhg = data.ovhg; this.ovhgseq = data.ovhgseq; this.charac = data.charac; this.freq = data.freq; this.id = data.id;
    this.inactTemp = data.inact_temp; this.optTemp = data.opt_temp; this.substrat = data.substrat; this.suppl = data.suppl; this.uri = data.uri;
    try { this.compsite = new RegExp(data.compsite.replaceAll("(?P<", "(?<"), "g"); } catch {
      throw new ValueError(`Problem with regular expression, re.compiled(${JSON.stringify(data.compsite)})`);
    }
  }

  /** @param kind - A mixin name. @returns Whether the enzyme is built from it (Python `issubclass(enzyme, kind)`). */
  isA(kind: string): boolean { return this.kinds.has(kind); }

  // ---- identity, ordering and operators ----
  /** @returns The name. */
  toString(): string { return this.name; }
  /** @returns The name (Python repr). */
  repr(): string { return this.name; }
  /** @returns The length of the site (Python `len(enzyme)`). */
  len(): number { return this.size; }

  /** Python `a != b`: true unless both have the same cut characteristics (so not the negation of identity). */
  ne(other: unknown): boolean {
    if (!(other instanceof RestrictionType)) return true;
    return JSON.stringify(this.charac) !== JSON.stringify(other.charac);
  }
  /** Python `a >> b`: same site, different cut (neoschizomers). */
  rshift(other: unknown): boolean {
    return other instanceof RestrictionType && this.site === other.site && JSON.stringify(this.charac) !== JSON.stringify(other.charac);
  }
  /** Python `a % b`: whether the ends the two enzymes leave can be ligated. @throws TypeError for a non-enzyme. */
  mod(other: unknown): boolean {
    if (!(other instanceof RestrictionType)) throw new TypeError(`expected RestrictionType, got ${pyClassRepr(other)} instead`);
    return this.mod1(other);
  }
  private requireEnzyme(other: unknown): RestrictionType {
    if (!(other instanceof RestrictionType)) throw new NotImplementedError("");
    return other;
  }
  /** Python `a < b`: shorter sites first, then by name. @throws NotImplementedError for a non-enzyme. */
  lt(other: unknown): boolean { const o = this.requireEnzyme(other); return this.size < o.size || (this.size === o.size && this.name < o.name); }
  /** Python `a <= b`. */
  le(other: unknown): boolean { const o = this.requireEnzyme(other); return this.size < o.size || (this.size === o.size && this.name <= o.name); }
  /** Python `a > b`. */
  gt(other: unknown): boolean { const o = this.requireEnzyme(other); return this.size > o.size || (this.size === o.size && this.name > o.name); }
  /** Python `a >= b`. */
  ge(other: unknown): boolean { const o = this.requireEnzyme(other); return this.size > o.size || (this.size === o.size && this.name >= o.name); }
  /** A comparison function for `Array.prototype.sort`, in Biopython's order. */
  static compare(a: RestrictionType, b: RestrictionType): number { return a.lt(b) ? -1 : b.lt(a) ? 1 : 0; }

  /**
   * Python `a + b`: a batch of the two enzymes. Adding an enzyme to a batch adds it to that batch in place and, as in
   * Biopython, returns nothing (`null`).
   */
  add(other: RestrictionType | RestrictionBatch): RestrictionBatch | null {
    if (other instanceof RestrictionType) return registry.makeBatch([this, other]);
    if (typeof (other as RestrictionBatch)?.addNocheck === "function") { (other as RestrictionBatch).addNocheck(this); return null; }
    throw new TypeError("");
  }
  /** Python `enzyme / dna`: the cut positions. */
  div(dna: DnaInput): number[] { return this.search(dna); }
  /** Python `enzyme // dna`: the fragments. */
  floordiv(dna: DnaInput): unknown[] { return this.catalyse(dna); }

  // ---- searching and cutting ----
  /** Whether the enzyme cuts once. */
  cutOnce(): boolean { return this.isA("OneCut"); }
  /** Whether the enzyme cuts twice (on each side of its site). */
  cutTwice(): boolean { return this.isA("TwoCuts"); }
  /** @returns The cut positions a site starting at `location` gives (top strand). */
  private modify(location: number): number[] {
    if (this.isA("OneCut")) return [location + this.fst5!];
    if (this.isA("TwoCuts")) return [location + this.fst5!, location + this.scd5!];
    return [location];
  }
  /** @returns The cut positions a bottom-strand site starting at `location` gives. */
  private revModify(location: number): number[] {
    if (this.isA("OneCut")) return [location - this.fst3!];
    if (this.isA("TwoCuts")) return [location - this.fst3!, location - this.scd3!];
    return [location];
  }
  /** `[fst5, fst3, scd5, scd3, site]` as it applies to this kind of cut. */
  characteristic(): (number | string | null)[] {
    if (this.isA("OneCut")) return [this.fst5, this.fst3, null, null, this.site];
    if (this.isA("TwoCuts")) return [this.fst5, this.fst3, this.scd5, this.scd3, this.site];
    return [null, null, null, null, this.site];
  }

  /**
   * Cut positions in a sequence: the 1-based position of the base after each cut, in order.
   *
   * @param dna - A `Seq`, `MutableSeq` or `FormattedSeq`.
   * @param linear - False for a circular sequence (ignored for a `FormattedSeq`, which knows).
   * @returns The positions (also kept in `results`).
   * @throws TypeError for other input or for characters that are not nucleotide letters.
   */
  search(dna: DnaInput, linear = true): number[] {
    this.dna = dna instanceof FormattedSeq ? dna : new FormattedSeq(dna, linear);
    return this.runSearch();
  }

  private runSearch(): number[] {
    const sites = this.dna!.finditer(this.compsite, this.size);
    if (this.isA("Palindromic")) {
      this.results = sites.flatMap(([s]) => this.modify(s));
      if (this.results.length > 0) this.drop();
      return this.results;
    }
    this.results = [];
    this.onMinus = [];
    for (const [start, m] of sites) {
      if (m.groups?.[this.name] !== undefined) this.results.push(...this.modify(start));
      else this.onMinus.push(...this.revModify(start));
    }
    this.results.push(...this.onMinus);
    if (this.results.length > 0) {
      this.results.sort((a, b) => a - b);
      this.drop();
    }
    return this.results;
  }

  /** Remove cuts that fall outside a linear sequence, or wrap cuts around the origin of a circular one. */
  private drop(): void {
    const dna = this.dna!;
    const length = dna.length;
    if (dna.isLinear()) {
      // An enzyme of unknown cut keeps all its sites.
      if (this.isA("NotDefined")) return;
      if (this.ovhg === null) throw new TypeError("unsupported operand type(s) for -: 'int' and 'NoneType'");
      const ovhg = this.ovhg;
      this.results = this.results!.filter((cut) => 1 < cut && cut <= length && 1 < cut - ovhg && cut - ovhg <= length);
      return;
    }
    const r = this.results!;
    for (let i = 0; i < r.length; i++) { if (r[i]! < 1) r[i]! += length; else break; }
    for (let i = r.length - 1; i >= 0; i--) { if (r[i]! > length) r[i]! -= length; else break; }
  }

  /**
   * Cut a sequence into fragments.
   *
   * @param dna - The sequence.
   * @param linear - False for a circular sequence.
   * @returns The fragments in order (a circular sequence's first fragment wraps the origin); the whole sequence if there is no site.
   * @throws NotImplementedError (`name restriction is unknown.`) for an enzyme whose cut is unknown.
   */
  catalyse(dna: DnaInput, linear = true): (Seq | import("@biolibs/seq").MutableSeq)[] {
    if (this.isA("Unknown")) throw new NotImplementedError(`${this.name} restriction is unknown.`);
    const r = this.search(dna, linear);
    const d = this.dna!;
    if (r.length === 0) return [d.slice(1)];
    const n = r.length - 1;
    const fragments: (Seq | import("@biolibs/seq").MutableSeq)[] = [];
    if (d.isLinear()) {
      fragments.push(d.slice(1, r[0]));
      for (let x = 0; x < n; x++) fragments.push(d.slice(r[x], r[x + 1]));
      fragments.push(d.slice(r[r.length - 1]));
    } else {
      fragments.push(d.slice(r[r.length - 1]).add(d.slice(1, r[0]) as Seq) as Seq);
      if (n === 0) return fragments;
      for (let x = 0; x < n; x++) fragments.push(d.slice(r[x], r[x + 1]));
    }
    return fragments;
  }
  /** Alias of {@link RestrictionType.catalyse}. */
  catalyze(dna: DnaInput, linear = true): (Seq | import("@biolibs/seq").MutableSeq)[] { return this.catalyse(dna, linear); }

  // ---- classification ----
  /** Whether the enzyme cuts both strands at the same place. */
  isBlunt(): boolean { return this.isA("Blunt"); }
  /** Whether the enzyme leaves a 5' overhang. */
  is5overhang(): boolean { return this.isA("Ov5"); }
  /** Whether the enzyme leaves a 3' overhang. */
  is3overhang(): boolean { return this.isA("Ov3"); }
  /** @returns `blunt`, `5' overhang`, `3' overhang` or `unknown`. */
  overhang(): string { return this.isA("Blunt") ? "blunt" : this.isA("Ov5") ? "5' overhang" : this.isA("Ov3") ? "3' overhang" : "unknown"; }
  /** Whether the site is palindromic. */
  isPalindromic(): boolean { return this.isA("Palindromic"); }
  /** Whether the cut position is fully known. */
  isDefined(): boolean { return this.isA("Defined"); }
  /** Whether the cut position is only known approximately. */
  isAmbiguous(): boolean { return this.isA("Ambiguous"); }
  /** Whether the cut position is not known. */
  isUnknown(): boolean { return this.isA("NotDefined"); }
  /** Whether the enzyme is sensitive to methylation. */
  isMethylable(): boolean { return this.isA("Meth_Dep"); }
  /** Whether the enzyme is sold by a supplier. */
  isComm(): boolean { return this.isA("Commercially_available"); }
  /** @returns The enzyme's expected site frequency (base pairs per site). */
  frequency(): number { return this.freq; }
  /** Whether this enzyme cuts like `other` (same site and cut). */
  isEquischizomer(other: RestrictionType): boolean { return !this.ne(other); }
  /** Whether `other` recognises the same site but cuts differently. */
  isNeoschizomer(other: RestrictionType): boolean { return this.rshift(other); }
  /** Whether `other` recognises the same site (equi- or neoschizomer). */
  isIsoschizomer(other: RestrictionType): boolean { return !this.ne(other) || this.rshift(other); }

  /** The enzymes of a batch (default: all) that cut like this one, without itself. @throws ValueError if this enzyme is not in the batch. */
  equischizomers(batch: RestrictionBatch | null = null): RestrictionType[] {
    const r = [...(batch && batch.size ? batch : allEnzymes())].filter((x) => !this.ne(x));
    return this.withoutSelf(r).sort(RestrictionType.compare);
  }
  /** The enzymes of a batch (default: all) with the same site and a different cut, sorted. */
  neoschizomers(batch: RestrictionBatch | null = null): RestrictionType[] {
    return [...(batch && batch.size ? batch : allEnzymes())].filter((x) => this.rshift(x)).sort(RestrictionType.compare);
  }
  /** The enzymes of a batch (default: all) with the same site, without itself. @throws ValueError if this enzyme is not in the batch. */
  isoschizomers(batch: RestrictionBatch | null = null): RestrictionType[] {
    const r = [...(batch && batch.size ? batch : allEnzymes())].filter((x) => this.rshift(x) || !this.ne(x));
    return this.withoutSelf(r).sort(RestrictionType.compare);
  }
  private withoutSelf(r: RestrictionType[]): RestrictionType[] {
    const i = r.indexOf(this);
    if (i === -1) throw new ValueError("list.index(x): x not in list");
    r.splice(i, 1);
    return r;
  }

  /** Enzymes that leave ends this enzyme's ends can be ligated to (always searched among all enzymes, as in Biopython). */
  compatibleEnd(batch?: RestrictionBatch | null): RestrictionType[] {
    if (this.isA("Unknown")) {
      // Biopython's version for enzymes of unknown cut takes no batch argument at all.
      if (batch !== undefined) throw new TypeError("Unknown.compatible_end() takes 1 positional argument but 2 were given");
      return [];
    }
    const all = [...allEnzymes()];
    if (this.isA("Blunt")) return all.filter((x) => x.isBlunt()).sort(RestrictionType.compare);
    if (this.isA("Ov5")) return all.filter((x) => x.is5overhang() && x.mod(this)).sort(RestrictionType.compare);
    return all.filter((x) => x.is3overhang() && x.mod(this)).sort(RestrictionType.compare);
  }

  private mod1(other: RestrictionType): boolean {
    if (this.isA("Unknown")) return false;
    if (this.isA("Blunt")) return other.isA("Blunt");
    if (this.isA("Ov5")) return other.isA("Ov5") ? this.mod2(other) : false;
    return other.isA("Ov3") ? this.mod2(other) : false;
  }

  private mod2(other: RestrictionType): boolean {
    if (this.isA("Defined")) {
      if (other.ovhgseq === this.ovhgseq) return true;
      return other.isA("Ambiguous") ? other.mod2(this) : false;
    }
    if (this.isA("Ambiguous")) {
      if (this.ovhgseq === null || other.ovhgseq === null) throw new TypeError("object of type 'NoneType' has no len()");
      if (this.ovhgseq.length !== other.ovhgseq.length) return false;
      let se = this.ovhgseq;
      // The same piecemeal substitution as Biopython, base by base over the original overhang.
      for (const base of this.ovhgseq) {
        if (base === "N") se = se.split("N").join(".");
        if ("RYWMSKHDBV".includes(base)) se = se.split(base).join("[" + MATCHING[base] + "]");
      }
      return new RegExp("^" + se).test(other.ovhgseq);
    }
    throw new ValueError(`${this.name}.mod2(${other.name}), ${this.name} : NotDefined. pas glop pas glop!`);
  }

  /** The cut written as `GAATT^C`-style text (`^` top-strand cut, `_` bottom-strand cut). */
  elucidate(): string {
    const f5 = this.fst5!, f3 = this.fst3!, site = this.site;
    if (this.isA("NotDefined")) return `? ${site} ?`;
    if (this.isA("Defined")) {
      if (this.cutTwice()) return "cut twice, not yet implemented sorry.";
      if (this.is5overhang()) {
        if (f5 === 0 && f3 === 0) return "N^" + site + "_N";
        if (f3 === 0) return site.slice(0, f5) + "^" + site.slice(f5) + "_N";
        return site.slice(0, f5) + "^" + site.slice(f5, f3) + "_" + site.slice(f3);
      }
      if (this.isBlunt()) return site.slice(0, f5) + "^_" + site.slice(f5);
      if (f5 === 0 && f3 === 0) return "N_" + site + "^N";
      return site.slice(0, f3) + "_" + site.slice(f3, f5) + "^" + site.slice(f5);
    }
    // Ambiguous
    const length = this.size;
    if (this.cutTwice()) return "cut twice, not yet implemented sorry.";
    if (this.is5overhang()) {
      if (f3 === 0 && f5 === 0) return "N^" + site + "_N";
      if (0 <= f5 && f5 <= length && 0 <= f3 + length && f3 + length <= length) return site.slice(0, f5) + "^" + site.slice(f5, f3) + "_" + site.slice(f3);
      if (0 <= f5 && f5 <= length) return site.slice(0, f5) + "^" + site.slice(f5) + nTimes(f3) + "_N";
      if (0 <= f3 + length && f3 + length <= length) return "N^" + nTimes(Math.abs(f5)) + site.slice(0, f3) + "_" + site.slice(f3);
      if (f3 + length < 0) return "N^" + nTimes(Math.abs(f5)) + "_" + nTimes(Math.abs(length + f3)) + site;
      if (f5 > length) return site + nTimes(f5 - length) + "^" + nTimes(length + f3 - f5) + "_N";
      return "N^" + nTimes(Math.abs(f5)) + site + nTimes(f3) + "_N";
    }
    if (this.isBlunt()) {
      if (f5 < 0) return "N^_" + nTimes(Math.abs(f5)) + site;
      if (f5 > length) return site + nTimes(f5 - length) + "^_N";
      throw new TypeError("");   // Python: '%s.easyrepr() : error f5=%i' % (cls.name, f5) fails on the missing `name`
    }
    if (f3 === 0) return f5 === 0 ? "N_" + site + "^N" : site + "_" + nTimes(f5 - length) + "^N";
    if (0 < f3 + length && f3 + length <= length && 0 <= f5 && f5 <= length) return site.slice(0, f3) + "_" + site.slice(f3, f5) + "^" + site.slice(f5);
    if (0 < f3 + length && f3 + length <= length) return site.slice(0, f3) + "_" + site.slice(f3) + nTimes(f5 - length) + "^N";
    if (0 <= f5 && f5 <= length) return "N_" + nTimes(f3 + length) + site.slice(0, f5) + "^" + site.slice(f5);
    if (f3 > 0) return site + nTimes(f3) + "_" + nTimes(f5 - f3 - length) + "^N";
    if (f5 < 0) return "N_" + nTimes(Math.abs(f3 - f5 + length)) + "^" + nTimes(Math.abs(f5)) + site;
    return "N_" + nTimes(Math.abs(f3 + length)) + site + nTimes(f5 - length) + "^N";
  }

  // ---- suppliers ----
  /** @returns Names of the suppliers that sell the enzyme, in the order of Biopython's supplier table (empty if none). */
  supplierList(): string[] {
    if (!this.isComm()) return [];
    return Object.entries(suppliersDict).filter(([k]) => this.suppl.includes(k)).map(([, v]) => v[0]);
  }
  /** Print the supplier names, one per line, each followed by a comma (nothing for an enzyme that is not sold). @returns null. */
  suppliers(): null {
    if (this.isComm()) for (const s of this.suppl) console.log(suppliersDict[s]![0] + ",");
    return null;
  }
  /** Print every supplier name. */
  static allSuppliers(): void { console.log(Object.values(suppliersDict).map((v) => v[0]).sort().join(",\n")); }
  /** Python's `buffers` placeholder: does nothing for a commercial enzyme. @throws TypeError (`Enzyme not commercially available.`) otherwise. */
  buffers(_supplier: string): void {
    if (!this.isComm()) throw new TypeError("Enzyme not commercially available.");
  }
}

export { type SiteMatch, KeyError };
