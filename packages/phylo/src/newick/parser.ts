/** The Newick reader (Biopython's `Bio.Phylo.NewickIO.Parser`). */

import { BioError, PyFloat, ValueError, pyFloat, pyInt } from "@biolibs/core";
import { Clade, Tree } from "./newick.js";

/** Raised when Newick text cannot be turned into a tree. */
export class NewickError extends BioError {
  constructor(message: string) { super(message); this.name = "NewickError"; }
}

/** The Newick tokens, in the order Biopython tries them. */
export const TOKEN_PATTERNS: [string, string][] = [
  ["\\(", "open parens"],
  ["\\)", "close parens"],
  ["[^\\s\\(\\)\\[\\]\\'\\:\;\\,]+", "unquoted node label"],
  ["\\:\\ ?[+-]?[0-9]*\\.?[0-9]+(?:[eE][+-]?[0-9]+)?", "edge length"],
  ["\\,", "comma"],
  ["\\[(?:\\\\.|[^\\]])*\\]", "comment"],
  ["\\'(?:\\\\.|[^\\'])*\\'", "quoted node label"],
  ["\;", "semicolon"],
  ["\\n", "newline"],
];

/** The options of {@link Parser.parse}. */
export interface ParseOptions {
  /** Read branch values as support values instead of branch lengths. */
  valuesAreConfidence?: boolean;
  /** Read comments as support values. */
  commentsAreConfidence?: boolean;
  /** Mark the trees as rooted. */
  rooted?: boolean;
}

/** `_parse_confidence`: an integer for digits, a float if the text is one, otherwise null. */
function parseConfidence(text: string): number | PyFloat | null {
  if (/^[0-9]+$/.test(text)) return pyInt(text);
  try {
    const x = pyFloat(text);
    return Number.isInteger(x) ? new PyFloat(x) : x;
  } catch (e) {
    if (e instanceof ValueError) return null;
    throw e;
  }
}

/** Reads the trees of a Newick text. */
export class Parser {
  private valuesAreConfidence = false;
  private commentsAreConfidence = false;
  private rooted = false;
  private readonly parents = new Map<Clade, Clade>();

  /** @param text - The contents of a Newick file. */
  constructor(private readonly text: string) {}

  /** Read the trees of a string. */
  static fromString(text: string): Parser { return new Parser(text); }

  /** Iterate over the trees: one per `;`-terminated tree, and a last one without `;`. */
  *parse(options: ParseOptions = {}): Generator<Tree> {
    this.valuesAreConfidence = options.valuesAreConfidence ?? false;
    this.commentsAreConfidence = options.commentsAreConfidence ?? false;
    this.rooted = options.rooted ?? false;
    let buf = "";
    // Lines keep their newline in Python; `rstrip` removes it again.
    const lines = this.text.split(/(?<=\n)/);
    for (const line of lines) {
      buf += line.replace(/\s+$/, "");
      if (buf.endsWith(";")) { yield this.parseTree(buf); buf = ""; }
    }
    if (buf) yield this.parseTree(buf);
  }

  private parseTree(text: string): Tree {
    const regex = new RegExp(`(${TOKEN_PATTERNS.map(([p]) => p).join("|")})`, "g");
    const input = text.replace(/^\s+|\s+$/g, "");
    const tokens: string[] = [];
    for (let m = regex.exec(input); m !== null; m = regex.exec(input)) tokens.push(m[0]);
    let rootClade = this.newClade();
    let current = rootClade;
    let lp = 0, rp = 0;
    let i = 0;
    for (; i < tokens.length; i++) {
      const token = tokens[i]!;
      if (token.startsWith("'")) {
        if (!current.name) current.name = token.slice(1, -1);
        else current.name += token.slice(0, -1);
      } else if (token.startsWith("[")) {
        current.comment = token.slice(1, -1);
        if (this.commentsAreConfidence) current.confidence = parseConfidence(current.comment);
      } else if (token === "(") {
        current = this.newClade(current);
        lp += 1;
      } else if (token === ",") {
        if (current === rootClade) {
          rootClade = this.newClade();
          this.parents.set(current, rootClade);
        }
        const parent = this.processClade(current);
        current = this.newClade(parent);
      } else if (token === ")") {
        const parent = this.processClade(current);
        if (!parent) throw new NewickError("Parenthesis mismatch.");
        current = parent;
        rp += 1;
      } else if (token === ";") { i++; break; }
      else if (token.startsWith(":")) {
        const value = pyFloat(token.slice(1));
        if (this.valuesAreConfidence) current.confidence = Number.isInteger(value) ? new PyFloat(value) : value;
        else current.branchLength = value;
      } else if (token === "\n") { /* ignored */ }
      else current.name = token;
    }
    if (lp !== rp) throw new NewickError(`Mismatch, ${lp} open vs ${rp} close parentheses.`);
    if (i < tokens.length) throw new NewickError(`Text after semicolon in Newick tree: ${tokens[i]}`);
    this.processClade(current);
    this.processClade(rootClade);
    return new Tree({ root: rootClade, rooted: this.rooted });
  }

  /** A new clade, optionally remembering its parent until it is processed. */
  newClade(parent?: Clade): Clade {
    const clade = new Clade();
    if (parent) this.parents.set(clade, parent);
    return clade;
  }

  /** Final processing of a parsed clade: attach it to its parent and return that parent. */
  processClade(clade: Clade): Clade | undefined {
    if (clade.name && !(this.valuesAreConfidence || this.commentsAreConfidence) && clade.confidence === null && clade.clades.length > 0) {
      clade.confidence = parseConfidence(clade.name);
      if (clade.confidence !== null) clade.name = null;
    }
    const parent = this.parents.get(clade);
    if (parent === undefined) return undefined;
    parent.clades.push(clade);
    this.parents.delete(clade);
    return parent;
  }
}
