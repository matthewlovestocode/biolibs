/** `Analysis`: search a sequence with a batch of enzymes and filter or print the result. */

import { pyClassRepr, pyRepr, warn } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { RestrictionBatch, type Mapping } from "./batch.js";
import { registry, allEnzymes } from "./registry.js";
import { PrintFormat } from "./print-format.js";
import type { RestrictionType } from "./restriction-type.js";

const emptyBatch = (): RestrictionBatch => new RestrictionBatch();
const isPyInt = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);
const truthy = (d: Mapping | null): d is Mapping => d !== null && d.size > 0;

/** Python's `AttributeError` is reported as `TypeError` in this port; the message is kept for readers. */
class AttributeError extends TypeError {}

/**
 * Results of searching one sequence with a batch of enzymes, with filters (`blunt`, `with_sites`, `between`, ...) and
 * text layouts. It is a batch itself, and a {@link PrintFormat}.
 */
export class Analysis extends RestrictionBatch {
  /** The batch searched with. */
  rb: RestrictionBatch;
  /** The sequence analysed. */
  sequence: Seq;
  /** Whether the sequence is linear. */
  linear: boolean;
  private fmt = new PrintFormat();

  /**
   * @param restrictionbatch - The enzymes (default: none).
   * @param sequence - The sequence (default: empty, which is not searched).
   * @param linear - False for a circular sequence.
   */
  constructor(restrictionbatch: RestrictionBatch = emptyBatch(), sequence: Seq = new Seq(""), linear = true) {
    super(restrictionbatch);
    this.rb = restrictionbatch;
    this.sequence = sequence;
    this.linear = linear;
    this.fmt.sequence = sequence as never;
    if (this.sequence.length > 0) this.search(this.sequence, this.linear);
  }

  /** @returns `Analysis(batch,sequence,linear)` as Python prints it. */
  repr(): string { return `Analysis(${this.rb.repr()},${typeof this.sequence.repr === "function" ? this.sequence.repr() : pyRepr(this.sequence)},${this.linear ? "True" : "False"})`; }

  /** The layout settings (`NameWidth`, `ConsoleWidth`, `Indent`, `MaxSize`...). */
  get format_(): PrintFormat { return this.fmt; }

  /** Choose the layout of {@link Analysis.formatOutput}: `list`, `map` or `number`. */
  printAs(what = "list"): void { this.fmt.printAs(what); }

  /** Format results (default: the mapping of the latest search) as text. */
  formatOutput(dct: Mapping | null = null, title = "", s1 = ""): string {
    this.fmt.sequence = this.sequence as never;
    return this.fmt.formatOutput(truthy(dct) ? dct : this.mapping, title, s1);
  }

  /** Print the formatted results. */
  printThat(dct: Mapping | null = null, title = "", s1 = ""): void { console.log(this.formatOutput(dct, title, s1)); }

  /**
   * Change a setting or the data: `NameWidth`, `ConsoleWidth`, `sequence`, `rb`, `linear`, `Indent`, `Maxsize`.
   *
   * @throws AttributeError (a TypeError) for `Cmodulo`, `PrefWidth` or an unknown name.
   */
  change(what: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(what)) {
      if (k === "NameWidth" || k === "ConsoleWidth") {
        (this.fmt as unknown as Record<string, unknown>)[k] = v;
        this.fmt.Cmodulo = this.fmt.ConsoleWidth % this.fmt.NameWidth;
        this.fmt.PrefWidth = this.fmt.ConsoleWidth - this.fmt.Cmodulo;
      } else if (k === "sequence") { this.sequence = v as Seq; this.search(this.sequence, this.linear); }
      else if (k === "rb") { this.rb = v as RestrictionBatch; this.clear(); for (const e of this.rb) this.addNocheck(e); this.mapping = new Map([...this].map((e) => [e, null as never])); if (this.sequence.length > 0) this.search(this.sequence, this.linear); }
      else if (k === "linear") { this.linear = v as boolean; this.search(this.sequence, v as boolean); }
      else if (k === "Indent" || k === "Maxsize") (this.fmt as unknown as Record<string, unknown>)[k === "Maxsize" ? "MaxSize" : k] = v;
      else if (k === "Cmodulo" || k === "PrefWidth") throw new AttributeError(`To change ${k}, change NameWidth and/or ConsoleWidth`);
      else throw new AttributeError(`Analysis has no attribute ${k}`);
    }
  }

  /** @returns The whole mapping. */
  full(_linear = true): Mapping { return this.mapping; }

  private filtered(dct: Mapping | null, pred: (k: RestrictionType, v: number[]) => boolean): Mapping {
    const d = truthy(dct) ? dct : this.mapping;
    return new Map([...d].filter(([k, v]) => pred(k, v)));
  }
  /** Enzymes that cut blunt. */
  blunt(dct: Mapping | null = null): Mapping { return this.filtered(dct, (k) => k.isBlunt()); }
  /** Enzymes that leave 5' overhangs. */
  overhang5(dct: Mapping | null = null): Mapping { return this.filtered(dct, (k) => k.is5overhang()); }
  /** Enzymes that leave 3' overhangs. */
  overhang3(dct: Mapping | null = null): Mapping { return this.filtered(dct, (k) => k.is3overhang()); }
  /** Enzymes with a fully defined cut. */
  defined(dct: Mapping | null = null): Mapping { return this.filtered(dct, (k) => k.isDefined()); }
  /** Enzymes that cut the sequence. */
  withSites(dct: Mapping | null = null): Mapping { return this.filtered(dct, (_k, v) => v.length > 0); }
  /** Enzymes that do not cut the sequence. */
  withoutSite(dct: Mapping | null = null): Mapping { return this.filtered(dct, (_k, v) => v.length === 0); }
  /** Enzymes that cut exactly `n` times. */
  withNSites(n: number, dct: Mapping | null = null): Mapping { return this.filtered(dct, (_k, v) => v.length === n); }
  /** Enzymes whose number of cuts is in the list. */
  withNumberList(list: number[], dct: Mapping | null = null): Mapping { return this.filtered(dct, (_k, v) => list.includes(v.length)); }

  /**
   * The results for the named enzymes. Names that are not enzymes are removed from the list (in place) with a warning.
   *
   * @param names - Enzyme names.
   * @param dct - Restrict to this mapping instead of searching again.
   */
  withName(names: string[], dct: Mapping | null = null): Mapping {
    for (let i = 0; i < names.length; i++) {
      const enzyme = names[i]!;
      if (!allEnzymes().has(enzyme)) {
        warn(`no data for the enzyme: ${enzyme}`, "BiopythonWarning");
        names.splice(i, 1);
      }
    }
    if (!truthy(dct)) return new RestrictionBatch(names).search(this.sequence, this.linear);
    return new Map(names.filter((n) => [...dct.keys()].some((k) => k.name === n)).map((n) => [[...dct.keys()].find((k) => k.name === n)!, dct.get([...dct.keys()].find((k) => k.name === n)!)!]));
  }

  /**
   * The results of the enzymes of the batch whose site has this size.
   *
   * @param siteSize - The site length.
   * @param dct - Restrict to this mapping (the size must then be a list, as Biopython's test is `k in site_size`).
   */
  withSiteSize(siteSize: number, dct: Mapping | null = null): Mapping {
    const sites = [...this].filter((e) => e.size === siteSize);
    if (!truthy(dct)) return new RestrictionBatch(sites).search(this.sequence);
    throw new TypeError("argument of type 'int' is not iterable");
  }

  /** Normalise `[start, end]`: negative positions count from the end, and the pair is put in order. */
  private boundaries(start: unknown, end: unknown): [number, number, (s: number, e: number, site: number) => boolean] | null {
    if (!isPyInt(start)) throw new TypeError(`expected int, got ${pyClassRepr(start)} instead`);
    if (!isPyInt(end)) throw new TypeError(`expected int, got ${pyClassRepr(end)} instead`);
    let s = start, e = end;
    if (s < 1) s += this.sequence.length;
    if (e < 1) e += this.sequence.length;
    if (!(s < e)) [s, e] = [e, s];
    if (s < e) return [s, e, (a, b, site) => a <= site && site < b];
    return null;
  }

  private bounds(start: unknown, end: unknown): [number, number, (s: number, e: number, site: number) => boolean] {
    const b = this.boundaries(start, end);
    if (b === null) throw new TypeError("cannot unpack non-iterable NoneType object");
    return b;
  }

  /** Enzymes that cut only between `start` and `end` (every cut there). */
  onlyBetween(start: number, end: number, dct: Mapping | null = null): Mapping {
    const [s, e, test] = this.bounds(start, end);
    const src = truthy(dct) ? dct : this.mapping;
    const d = new Map(src);
    for (const [key, sites] of src) {
      if (sites.length === 0) { d.delete(key); continue; }
      for (const site of sites) if (!test(s, e, site)) { d.delete(key); break; }
    }
    return d;
  }

  /** Enzymes that cut at least once between `start` and `end`. */
  between(start: number, end: number, dct: Mapping | null = null): Mapping {
    const [s, e, test] = this.bounds(start, end);
    const d: Mapping = new Map();
    for (const [key, sites] of truthy(dct) ? dct : this.mapping) if (sites.some((site) => test(s, e, site))) d.set(key, sites);
    return d;
  }

  /** The cuts of the enzymes that cut between `start` and `end`, limited to that stretch (a start after the end wraps). */
  showOnlyBetween(start: number, end: number, dct: Mapping | null = null): Mapping {
    const d: Mapping = new Map();
    for (const [k, v] of this.between(start, end, dct)) d.set(k, start <= end ? v.filter((x) => start <= x && x <= end) : v.filter((x) => start <= x || x <= end));
    return d;
  }

  /** Enzymes that cut only outside `start`..`end`. */
  onlyOutside(start: number, end: number, dct: Mapping | null = null): Mapping {
    const [s, e, test] = this.bounds(start, end);
    const src = truthy(dct) ? dct : this.mapping;
    const d = new Map(src);
    for (const [key, sites] of src) {
      if (sites.length === 0) { d.delete(key); continue; }
      for (const site of sites) if (test(s, e, site)) { d.delete(key); break; }
    }
    return d;
  }

  /** Enzymes that cut at least once outside `start`..`end`. */
  outside(start: number, end: number, dct: Mapping | null = null): Mapping {
    const [s, e, test] = this.bounds(start, end);
    const d: Mapping = new Map();
    for (const [key, sites] of truthy(dct) ? dct : this.mapping) if (sites.some((site) => !test(s, e, site))) d.set(key, sites);
    return d;
  }

  /** Enzymes that do not cut at all, plus those that cut only outside `start`..`end`. */
  doNotCut(start: number, end: number, dct: Mapping | null = null): Mapping {
    const d = this.withoutSite();
    for (const [k, v] of this.onlyOutside(start, end, truthy(dct) ? dct : this.mapping)) d.set(k, v);
    return d;
  }

  /** @returns The registry's batch maker (kept for symmetry with `RestrictionBatch`). */
  static makeBatch(items: Iterable<RestrictionType>): RestrictionBatch { return registry.makeBatch(items); }
}
