/** `MMCIF2Dict`: turns an mmCIF file into a dictionary of token lists (Biopython's `Bio.PDB.MMCIF2Dict`). */

import { ValueError, ZeroDivisionError, pyRstrip, pyStrip } from "@biolibs/core";
import { readLines } from "./pdb-parser.js";

const QUOTE_CHARS = new Set(["'", '"']);
const WHITESPACE_CHARS = new Set([" ", "\t"]);

/**
 * Split one (already stripped) line into mmCIF tokens, honouring quotes and comments.
 *
 * Follows the CIF 1.1 syntax as Biopython reads it: `#` starts a comment only outside a token, and a
 * quote only closes when followed by whitespace or the end of the line.
 *
 * @param line - A line without surrounding whitespace.
 * @returns The tokens in order.
 * @throws {@link ValueError} when a quote is still open at the end of the line.
 */
export function splitLine(line: string): string[] {
  const out: string[] = [];
  const cs = Array.from(line);
  let inToken = false;
  let quoteOpenChar: string | null = null;
  let start = 0;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i]!;
    if (WHITESPACE_CHARS.has(c)) {
      if (inToken && quoteOpenChar === null) {
        inToken = false;
        out.push(cs.slice(start, i).join(""));
      }
    } else if (QUOTE_CHARS.has(c)) {
      if (quoteOpenChar === null && !inToken) {
        quoteOpenChar = c;
        inToken = true;
        start = i + 1;
      } else if (c === quoteOpenChar && (i + 1 === cs.length || WHITESPACE_CHARS.has(cs[i + 1]!))) {
        quoteOpenChar = null;
        inToken = false;
        out.push(cs.slice(start, i).join(""));
      }
    } else if (c === "#" && !inToken) {
      // A comment: "#" is an ordinary character inside quotes and inside an unquoted token.
      return out;
    } else if (!inToken) {
      inToken = true;
      start = i;
    }
  }
  if (inToken) out.push(cs.slice(start).join(""));
  if (quoteOpenChar !== null) throw new ValueError("Line ended with quote open: " + line);
  return out;
}

/**
 * Tokenize the lines of an mmCIF file, including `;`-delimited multi-line values.
 *
 * Tokens are produced lazily, so an error is raised only once the consumer reaches it, like the Python generator.
 *
 * @param lines - The file's lines, each keeping its trailing newline.
 * @throws {@link ValueError} for an empty file, an unterminated `;` block, or a closing `;` not followed by whitespace.
 */
export function* tokenize(lines: string[]): Generator<string> {
  if (lines.length === 0) throw new ValueError("Empty file.");
  let k = 0;
  while (k < lines.length) {
    let line = lines[k++]!;
    if (line.startsWith("#")) continue;
    if (line.startsWith(";")) {
      // Leading whitespace of each line is preserved, trailing whitespace and the newline are dropped.
      const buffer = [pyRstrip(line.slice(1))];
      let closed = false;
      while (k < lines.length) {
        line = pyRstrip(lines[k++]!);
        if (line.startsWith(";")) {
          yield buffer.join("\n");
          line = line.slice(1);
          if (line && !WHITESPACE_CHARS.has(line[0]!)) throw new ValueError("Missing whitespace");
          closed = true;
          break;
        }
        buffer.push(line);
      }
      if (!closed) throw new ValueError("Missing closing semicolon");
    }
    yield* splitLine(pyStrip(line));
  }
}

/** A value of the dictionary: a token list, except the leading `data_` entry which maps to a string. */
export type MmcifValue = string[] | string;

/**
 * An mmCIF file as a dictionary. Each `_category.item` key maps to the list of its values (one for a plain
 * item, one per row for a `loop_`); the `data_` directive is stored under the key `"data_"` as a plain string.
 */
export class MMCIF2Dict extends Map<string, MmcifValue> {
  /**
   * @param text - The contents of the mmCIF file (Biopython also accepts a file name or handle).
   * @throws {@link ValueError} for an empty file, a file not starting with `data_`, or bad quoting/semicolon blocks.
   * @throws {@link ZeroDivisionError} for a `loop_` whose first token is not a key (Python's `i % 0`).
   */
  constructor(text: string) {
    super();
    const tokens = tokenize(readLines(text));
    const first = tokens.next();
    if (first.done) return;
    const head = first.value;
    this.set(head.slice(0, 5), head.slice(5));
    if (!head.slice(0, 5).startsWith("data_")) throw new ValueError("The input mmCIF file must begin with a 'data_' directive.");
    let loopFlag = false;
    let key: string | null = null;
    let keys: string[] = [];
    let i = 0;
    let n = 0;
    for (const token of tokens) {
      if (token.toLowerCase() === "loop_") {
        loopFlag = true;
        keys = [];
        i = 0;
        n = 0;
        continue;
      } else if (loopFlag) {
        // Some files (e.g. 4q9r) have values in later columns that start with an underscore; only the
        // first column may introduce a key.
        if (token.startsWith("_") && (n === 0 || i % n === 0)) {
          if (i > 0) loopFlag = false;
          else {
            this.set(token, []);
            keys.push(token);
            n += 1;
            continue;
          }
        } else {
          if (n === 0) throw new ZeroDivisionError("division by zero");
          (this.get(keys[i % n]!) as string[]).push(token);
          i += 1;
          continue;
        }
      }
      if (key === null) key = token;
      else {
        this.set(key, [token]);
        key = null;
      }
    }
  }
}
