/** `PrintFormat`: text layouts for the result of a restriction analysis (lists, numbers of cuts, or a map along the sequence). */

import type { RestrictionType } from "./restriction-type.js";

/** What `PrintFormat` needs from the class it is mixed into. */
export interface Formattable {
  /** The analysed sequence (for the map layout). */
  sequence: { length: number; toString(): string; complement(): { toString(): string } };
  /** The default results. */
  results?: Map<RestrictionType, number[]>;
}

/** A section: an enzyme and its cut positions. */
type Section = [RestrictionType, number[]];

const ljust = (s: string, w: number): string => s + " ".repeat(Math.max(0, w - s.length));
const rjust = (s: string, w: number): string => " ".repeat(Math.max(0, w - s.length)) + s;
/** Python's `sorted(ls)` of `(enzyme, sites)`: by enzyme. */
const bySection = (a: Section, b: Section): number => (a[0].lt(b[0]) ? -1 : b[0].lt(a[0]) ? 1 : 0);

/** The layout settings and methods shared by `Analysis`. */
export class PrintFormat {
  /** Width of the console. */
  ConsoleWidth = 80;
  /** Width of the column of enzyme names. */
  NameWidth = 10;
  /** Reserved width for a cut position. */
  MaxSize = 6;
  /** `ConsoleWidth % NameWidth`. */
  Cmodulo = 80 % 10;
  /** `ConsoleWidth - Cmodulo`. */
  PrefWidth = 80 - (80 % 10);
  /** Indentation of continuation lines. */
  Indent = 4;
  /** Width available for cut positions: fixed at 70 when the class is defined, whatever is changed later. */
  linesize = 70;
  /** The sequence analysed. */
  sequence!: Formattable["sequence"];
  /** The default results of {@link PrintFormat.formatOutput} (`Analysis` uses its mapping instead). */
  results?: Map<RestrictionType, number[]>;
  /** The layout used by {@link PrintFormat.formatOutput}. */
  makeFormat: (cut: Section[], title: string, nc: RestrictionType[], s1: string) => string = (c, t, n, s) => this.makeList(c, t, n, s);

  /** Choose the layout: `list` (default), `map` or `number`. */
  printAs(what = "list"): void {
    this.makeFormat = what === "map" ? (c, t, n, s) => this.makeMap(c, t, n, s) : what === "number" ? (c, t, n, s) => this.makeNumber(c, t, n, s) : (c, t, n, s) => this.makeList(c, t, n, s);
  }

  /**
   * Format results: enzymes that cut, then those that do not.
   *
   * @param dct - Cut positions by enzyme (default: the object's results).
   * @param title - Heading.
   * @param s1 - Heading of the list of enzymes that do not cut.
   */
  formatOutput(dct: Map<RestrictionType, number[]> | null, title = "", s1 = ""): string {
    let d = dct;
    if (!d || d.size === 0) d = this.results ?? undefined as never;
    if (d === undefined) throw new TypeError("'Analysis' object has no attribute 'results'");
    const ls: Section[] = [], nc: RestrictionType[] = [];
    for (const [k, v] of d) { if (v && v.length > 0) ls.push([k, v]); else nc.push(k); }
    return this.makeFormat(ls, title, nc, s1);
  }

  /** Print the formatted results. */
  printThat(dct: Map<RestrictionType, number[]> | null, title = "", s1 = ""): void { console.log(this.formatOutput(dct, title, s1)); }

  private makeList(ls: Section[], title: string, nc: RestrictionType[], s1: string): string { return this.makeListOnly(ls, title) + this.makeNocutOnly(nc, s1); }
  private makeMap(ls: Section[], title: string, nc: RestrictionType[], s1: string): string { return this.makeMapOnly(ls, title) + this.makeNocutOnly(nc, s1); }
  private makeNumber(ls: Section[], title: string, nc: RestrictionType[], s1: string): string { return this.makeNumberOnly(ls, title) + this.makeNocutOnly(nc, s1); }

  private makeNocutOnly(nc: RestrictionType[], s1: string): string {
    if (nc.length === 0) return s1;
    let st = "";
    let stringsite = s1 || "\n   Enzymes which do not cut the sequence.\n\n";
    for (const key of [...nc].sort((a, b) => (a.lt(b) ? -1 : b.lt(a) ? 1 : 0))) {
      st += ljust(String(key), this.NameWidth);
      if (st.length > this.linesize) { stringsite += st + "\n"; st = ""; }
    }
    return stringsite + st + "\n";
  }

  private makeListOnly(ls: Section[], title: string): string { return ls.length === 0 ? title : this.nextSection(ls, title); }

  private makeNumberOnly(ls: Section[], title0: string): string {
    if (ls.length === 0) return title0;
    let title = title0;
    ls.sort((a, b) => a[1].length - b[1].length);
    let curLen = 1;
    let newSect: Section[] = [];
    for (const [name, sites] of ls) {
      const length = sites.length;
      if (length > curLen) {
        title += `\n\nenzymes which cut ${curLen} times :\n\n`;
        title = this.nextSection(newSect, title);
        newSect = [[name, sites]];
        curLen = length;
        continue;
      }
      newSect.push([name, sites]);
    }
    title += `\n\nenzymes which cut ${curLen} times :\n\n`;
    return this.nextSection(newSect, title);
  }

  private makeMapOnly(ls: Section[], title: string): string {
    if (ls.length === 0) return title;
    let map = title || "";
    const enzymemap = new Map<number, string[]>();
    for (const [enzyme, cut] of ls) for (const c of cut) { const l = enzymemap.get(c); if (l) l.push(String(enzyme)); else enzymemap.set(c, [String(enzyme)]); }
    let mapping = [...enzymemap.keys()].sort((a, b) => a - b);
    const cutloc = new Map<number, number[]>();
    const length = this.sequence.length;
    let x = 0, counter = 0;
    for (x = 60; x < length; x += 60) {
      counter = x - 60;
      const loc: number[] = [];
      cutloc.set(counter, loc);
      const remaining: number[] = [];
      for (const key of mapping) { if (key <= x) loc.push(key); else remaining.push(key); }
      mapping = remaining;
    }
    // Python leaves x at the last value of its range (or 0 when the range was empty).
    x = length > 60 ? 60 * Math.ceil(length / 60 - 1) : 0;
    cutloc.set(x, mapping);
    const sequence = this.sequence.toString();
    const revsequence = this.sequence.complement().toString();
    const a = "|";
    let base = 0;
    const emptyline = " ".repeat(60);
    const lastBase = length > 60 ? 60 * Math.ceil(length / 60 - 1) : 0;
    for (base = 60; base < length; base += 60) {
      counter = base - 60;
      let line = emptyline;
      for (const key of cutloc.get(counter)!) {
        let s = "";
        if (key === base) {
          for (const n of enzymemap.get(key)!) s = [s, n].join(" ");
          const chunk = line.slice(0, 59);
          map += chunk + String(key) + s + "\n" + (chunk + a + "\n");
          break;
        }
        for (const n of enzymemap.get(key)!) s = [s, n].join(" ");
        const k = key % 60;
        const lineo = line.slice(0, k - 1) + String(key) + s + "\n";
        line = line.slice(0, k - 1) + a + line.slice(k);
        map += lineo + (line.slice(0, k - 1) + a + line.slice(k) + "\n");
      }
      map += [sequence.slice(counter, base), a.repeat(60), revsequence.slice(counter, base), ljust(String(counter + 1), 15) + " ".repeat(30) + rjust(String(base), 15) + "\n\n"].join("\n");
    }
    base = lastBase;
    let line = " ".repeat(60);
    for (const key of cutloc.get(base)!) {
      let s = "";
      if (key === length) {
        for (const n of enzymemap.get(key)!) s += " " + n;
        const chunk = line.slice(0, length - 1);
        map += chunk + String(key) + s + "\n" + (chunk + a + "\n");
        break;
      }
      for (const n of enzymemap.get(key)!) s += " " + n;
      const k = key % 60;
      const lineo = line.slice(0, k - 1) + String(key) + s + "\n";
      line = line.slice(0, k - 1) + a + line.slice(k);
      map += lineo + (line.slice(0, k - 1) + a + line.slice(k) + "\n");
    }
    let mapunit = sequence.slice(base, length) + "\n";
    mapunit += a.repeat(length - base) + "\n";
    mapunit += revsequence.slice(base, length) + "\n";
    mapunit += ljust(String(base + 1), 15) + " ".repeat(Math.max(0, length - base - 30)) + rjust(String(length), 15) + "\n\n";
    return map + mapunit;
  }

  private nextSection(ls: Section[], into0: string): string {
    let into = into0;
    const indentation = "\n" + " ".repeat(this.NameWidth + this.Indent);
    const linesize = this.linesize - this.MaxSize;
    const pat = new RegExp(`([\\w,\\s()]){1,${linesize}}[,.]`, "g");
    for (const [name, sites] of [...ls].sort(bySection)) {
      const output = sites.map(String).join(", ") + ".";
      const stringsite = output.length > linesize ? [...output.matchAll(pat)].map((m) => m[0]).join(indentation) : output;
      into += ljust(String(name), this.NameWidth) + " :  " + stringsite + "\n";
    }
    return into;
  }
}
