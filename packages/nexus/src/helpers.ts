/** Small helper functions of Biopython's `Bio.Nexus.Nexus` module. */

import { IndexError, KeyError, ValueError, pyFormatFixed, pySplit, pyStrip } from "@biolibs/core";
import { PUNCTUATION, WHITESPACE } from "./char-buffer.js";
import { NexusError } from "./errors.js";

/** Characters MrBayes accepts in names. */
const MRBAYES_SAFE = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890_";

/**
 * Make a name safe to write in a NEXUS file: quote it (doubling inner quotes) if it contains whitespace or
 * punctuation, or, for MrBayes, replace spaces by underscores and drop everything else unusual.
 *
 * @example
 * ```ts
 * safename("my taxon");   // "'my taxon'"
 * ```
 */
export function safename(name: string, mrbayes = false): string {
  if (mrbayes) {
    return [...name.replaceAll(" ", "_")].filter((c) => MRBAYES_SAFE.includes(c)).join("");
  }
  const safe = name.replaceAll("'", "''");
  if ([...safe].some((c) => (WHITESPACE + PUNCTUATION).includes(c))) return "'" + safe + "'";
  return safe;
}

/** Remove matching quotes around a word, repeatedly; null for an empty or missing word. */
export function quotestrip(word: string | null): string | null {
  if (!word) return null;
  while ((word.startsWith("'") && word.endsWith("'")) || (word.startsWith('"') && word.endsWith('"'))) word = word.slice(1, -1);
  return word;
}

/**
 * First and last positions of a sequence that are not in `skiplist`: `[null, null]` for an empty sequence,
 * `[-1, -1]` when everything is skipped.
 */
export function getStartEnd(sequence: string, skiplist: readonly string[] = ["-", "?"]): [number | null, number | null] {
  const length = sequence.length;
  if (length === 0) return [null, null];
  let end = length - 1;
  while (end >= 0 && skiplist.includes(sequence[end]!)) end -= 1;
  let start = 0;
  while (start < length && skiplist.includes(sequence[start]!)) start += 1;
  if (start === length && end === -1) return [-1, -1];
  return [start, end];
}

/** Python ordering of two numbers or two strings (mixed types are a `TypeError`). */
export function pyCompare(a: number | string, b: number | string): number {
  if (typeof a !== typeof b) throw new TypeError(`'<' not supported between instances of '${typeof a === "number" ? "int" : "str"}' and '${typeof b === "number" ? "int" : "str"}'`);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** `sorted(set(values))`. */
export function makeUnique<T extends number | string>(values: Iterable<T>): T[] {
  return [...new Set(values)].sort(pyCompare);
}

/** Keys of `p` whose value is a non-empty list, ordered by those lists (compared item by item). */
export function sortKeysByValues(p: Map<string, number[]>): string[] {
  const cmp = (x: number[], y: number[]): number => {
    for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i]! < y[i]! ? -1 : 1;
    return x.length - y.length;
  };
  return [...p.keys()].filter((k) => p.get(k)!.length > 0).sort((a, b) => cmp(p.get(a)!, p.get(b)!));
}

/** Make `label` unique among `previousLabels` by appending `.copy`, `.copy2`, ... */
export function uniqueLabel(previousLabels: readonly string[], label: string): string {
  while (previousLabels.includes(label)) {
    const split = label.split(".");
    const last = split[split.length - 1]!;
    if (last.startsWith("copy")) {
      let copyNum = 1;
      if (last !== "copy") copyNum = pyIntStrict(last.slice(4)) + 1;
      label = `${split.slice(0, -1).join(".")}.copy${copyNum}`;
    } else {
      label += ".copy";
    }
  }
  return label;
}

/** Python `int(text)` for the digits after `copy` (fails like Python for anything else). */
function pyIntStrict(text: string): number {
  if (!/^\s*[+-]?\d+(?:_\d+)*\s*$/.test(text)) throw new ValueError(`invalid literal for int() with base 10: '${text}'`);
  return Number(text.replaceAll("_", "").trim());
}

/**
 * Write a sorted list of 0-based site numbers as NEXUS 1-based ranges, e.g. `[0,1,2,4]` becomes `"1-3 5"`
 * (and `[0,2,4]` becomes `"1-5\2"`).
 */
export function compact4nexus(origList: number[]): string {
  if (origList.length === 0) return "";
  const sorted = [...new Set(origList)].sort((a, b) => a - b);
  const shortlist: string[] = [];
  let clist = [...sorted];
  clist.push(clist[clist.length - 1]! + 0.5);
  while (clist.length > 1) {
    let step = 1;
    let broke = false;
    for (let i = 0; i < clist.length; i++) {
      const x = clist[i]!;
      if (x === clist[0]! + i * step) continue;
      else if (i === 1 && clist.length > 3 && clist[i + 1]! - x === x - clist[0]!) {
        step = x - clist[0]!;
      } else {
        const sub = clist.slice(0, i);
        if (sub.length === 1) shortlist.push(String(sub[0]! + 1));
        else if (step === 1) shortlist.push(`${sub[0]! + 1}-${sub[sub.length - 1]! + 1}`);
        else shortlist.push(`${sub[0]! + 1}-${sub[sub.length - 1]! + 1}\\${step}`);
        clist = clist.slice(i);
        broke = true;
        break;
      }
    }
    if (!broke) break;
  }
  return shortlist.join(" ");
}

/** Python's `''.join(sorted(text))`. */
const sortedChars = (text: string): string => [...text].sort().join("");

/**
 * Replace `(AG)`-style parenthesized ambiguity groups by their IUPAC code (lower case if the group was).
 *
 * @throws {@link NexusError} for unbalanced parentheses; {@link KeyError} for a group without a code.
 */
export function replaceParenthesizedAmbigs(seq: string, revAmbigValues: Record<string, string>): string {
  let opening = seq.indexOf("(");
  while (opening > -1) {
    const closing = seq.indexOf(")");
    if (closing < 0) throw new NexusError("Missing closing parenthesis in: " + seq);
    else if (closing < opening) throw new NexusError("Missing opening parenthesis in: " + seq);
    const ambig = sortedChars(seq.slice(opening + 1, closing));
    const key = ambig.toUpperCase();
    if (!Object.hasOwn(revAmbigValues, key)) throw new KeyError(key);
    let code = revAmbigValues[key]!;
    if (ambig !== key) code = code.toLowerCase();
    seq = seq.slice(0, opening) + code + seq.slice(closing + 1);
    opening = seq.indexOf("(");
  }
  return seq;
}

/**
 * Remove comments (in square brackets, nested) and mark the ends of commands (`;` outside quotes) with the
 * character U+0007; this is what Biopython's C helper `cnexus.scanfile` does.
 *
 * `[&...]` special comments are kept. Returns the text, or `"["` / `"]"` for unmatched brackets.
 *
 * @throws {@link ValueError} for text containing a NUL character.
 */
export function scanfile(input: string): string {
  if (input.includes("\0")) throw new ValueError("embedded null character");
  let quote = "";
  let special = false;
  let comm = 0;
  let out = "";
  for (let i = 0; i < input.length; i++) {
    const t = input[i]!;
    if (!(comm || special) && t === quote) quote = "";
    else if (!quote && !(comm || special) && (t === "'" || t === '"')) quote = t;
    else if (!quote && t === "[") {
      if (input[i + 1] === "&" && !(comm || special)) special = true;
      else comm += 1;
    } else if (!quote && t === "]") {
      if (special) special = false;
      else {
        comm -= 1;
        if (comm < 0) return "]";
        continue;
      }
    }
    if (!comm) out += t === ";" && !(quote || special) ? "\x07" : t;
  }
  if (comm > 0) return "[";
  return out;
}

/** Split command lines on newlines, joining each command onto one line (except `matrix`), dropping blanks. */
export function adjustLines(lines: string[]): string[] {
  const formatted: string[] = [];
  for (let line of lines) {
    line = pyStrip(line.replaceAll("\r\n", "\n").replaceAll("\r", "\n"));
    if (line.toLowerCase().startsWith("matrix")) formatted.push(line);
    else {
      line = line.replaceAll("\n", " ");
      if (line) formatted.push(line);
    }
  }
  return formatted;
}

/** The command lines of a NEXUS file body. @throws {@link NexusError} for unmatched brackets. */
export function getCommandLines(fileContents: string): string[] {
  const decommented = scanfile(fileContents);
  if (decommented === "[" || decommented === "]") throw new NexusError(`Unmatched ${decommented}`);
  return adjustLines(decommented.split("\x07"));
}

/** Commands whose arguments are kept as one string. */
export const SPECIAL_COMMANDS = [
  "charstatelabels", "charlabels", "taxlabels", "taxset", "charset", "charpartition", "taxpartition", "matrix", "tree", "utree", "translate", "codonposset", "title",
];

/** One NEXUS command: its name and arguments (a string for special commands, otherwise a map of options). */
export class Commandline {
  options: Map<string, string | null> | string = new Map();
  command: string;

  /** @param line - The command text. @param title - The block's title (unused). */
  constructor(line: string, _title: string) {
    let options: string;
    const stripped = pyStrip(line);
    const nl = stripped.indexOf("\n");
    if (nl >= 0) {
      this.command = stripped.slice(0, nl);
      options = stripped.slice(nl + 1);
    } else {
      const words = pySplit(line);
      if (words.length === 0) throw new IndexError("list index out of range");
      this.command = words[0]!;
      options = words.slice(1).join(" ");
    }
    this.command = pyStrip(this.command).toLowerCase();
    if (SPECIAL_COMMANDS.includes(this.command)) {
      this.options = pyStrip(options);
    } else if (options.length > 0) {
      const tokens = pySplit(options.replaceAll("=", " = "));
      const valued: [number, number, number][] = [];
      for (let n = 0; n < tokens.length; n++) if (tokens[n] === "=" && n !== 0 && n !== tokens.length) valued.push([n - 1, n, n + 1]);
      const indices = new Set(valued.flat());
      const opts = new Map<string, string | null>();
      for (const opt of valued) {
        if (opt[2] >= tokens.length) throw new IndexError("list index out of range");
        opts.set(tokens[opt[0]]!.toLowerCase(), tokens[opt[2]]!);
      }
      for (let n = 0; n < tokens.length; n++) if (!indices.has(n)) opts.set(tokens[n]!.toLowerCase(), null);
      this.options = opts;
    }
  }
}

/** A NEXUS block: a title and its commands. */
export class Block {
  commandlines: unknown[] = [];
  /** @param title - The block name. */
  constructor(public title: string | null = null) {}
}

/** Counts of character changes between states, used to build a weighted step matrix for PAUP. */
export class StepMatrix {
  data = new Map<string, number>();
  symbols: string[];

  /** @param symbols - The unambiguous states. @param gap - The gap character, added as a state if given. */
  constructor(symbols: string, gap: string) {
    this.symbols = [...symbols].sort();
    if (gap) this.symbols.push(gap);
    for (const x of this.symbols) for (const y of this.symbols.filter((s) => s !== x)) this.set(x, y, 0);
  }

  /** Set the count for a pair of states (order does not matter). */
  set(x: string, y: string, value: number): void {
    if (x > y) [x, y] = [y, x];
    this.data.set(x + y, value);
  }

  /** Add to the count for a pair of states. */
  add(x: string, y: string, value: number): void {
    if (x > y) [x, y] = [y, x];
    if (!this.data.has(x + y)) throw new KeyError(x + y);
    this.data.set(x + y, this.data.get(x + y)! + value);
  }

  /** Sum of all counts. */
  sum(): number {
    if (this.data.size === 0) throw new TypeError("reduce() of empty iterable with no initial value");
    return [...this.data.values()].reduce((a, b) => a + b);
  }

  /** Scale counts so they sum to 1. */
  transformation(): this {
    const total = this.sum();
    if (total !== 0) for (const [k, v] of this.data) this.data.set(k, v / total);
    return this;
  }

  /** Replace nonzero counts by their negative logarithm. */
  weighting(): this {
    for (const [k, v] of this.data) if (v !== 0) this.data.set(k, -Math.log(v));
    return this;
  }

  /** The PAUP `usertype` text for the matrix. */
  smprint(name = "your_name_here"): string {
    let matrix = `usertype ${name} stepmatrix=${this.symbols.length}\n`;
    matrix += `        ${this.symbols.join("        ")}\n`;
    for (const x of this.symbols) {
      // Python: `"[%s]".ljust(8) % x` pads the *template*, so the label gets four spaces whatever its width.
      matrix += `[${x}]    `;
      for (const y of this.symbols) {
        if (x === y) matrix += " .       ";
        else {
          const [x1, y1] = x > y ? [y, x] : [x, y];
          const v = this.data.get(x1 + y1)!;
          matrix += v === 0 ? "inf.     " : pyFormatFixed(v, 2) + "     ";
        }
      }
      matrix += "\n";
    }
    return matrix + ";\n";
  }
}
