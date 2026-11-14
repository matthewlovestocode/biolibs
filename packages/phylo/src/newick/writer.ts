/** The Newick writer (Biopython's `Bio.Phylo.NewickIO.Writer`). */

import { PyFloat, pyFloatRepr, pyPercent, pyStr, PyTuple } from "@biolibs/core";
import type { Clade as BaseClade } from "../base-tree/clade.js";
import type { Tree as BaseTree } from "../base-tree/tree.js";
import type { Clade } from "./newick.js";

/** Anything with a `write(text)` method. */
export interface WriteTarget { write(text: string): unknown }

/** The options of {@link Writer.toStrings}. */
export interface WriterOptions {
  /** Write support values where branch lengths go. */
  confidenceAsBranchLength?: boolean;
  /** Write only branch lengths. */
  branchLengthOnly?: boolean;
  /** Write no values at all (comments only); overridden by the two options above. */
  plain?: boolean;
  /** Write bare Newick (default true); otherwise a Nexus-style `tree name = ...` line. */
  plainNewick?: boolean;
  /** `"left"` or `"right"` (any case): ladderize the trees first. */
  ladderize?: string | null;
  /** The support written for terminals with `confidenceAsBranchLength` (default 1.0). */
  maxConfidence?: number;
  /** `%`-format of support values (default `"%1.2f"`). */
  formatConfidence?: string;
  /** `%`-format of branch lengths (default `"%1.8g"`). */
  formatBranchLength?: string;
}

/** `[comment]` with brackets escaped. */
const formatComment = (text: string): string => `[${text.replaceAll("[", "\\[").replaceAll("]", "\\]")}]`;

/** The comment of a clade (Newick clades only), or "". */
function getComment(clade: BaseClade): string {
  const comment = (clade as Partial<Clade>).comment;
  return comment ? formatComment(pyStr(comment)) : "";
}

/**
 * `hasattr(clade, "confidence") and clade.confidence is not None`: a phyloXML clade with several confidences raises
 * `AttributeError` from the property, which `hasattr` reports as False (it is a `TypeError` here).
 */
function hasConfidence(clade: { confidence: unknown }): boolean {
  try { return clade.confidence !== null && clade.confidence !== undefined; } catch (e) { if (e instanceof TypeError) return false; throw e; }
}

/** A phyloXML `Confidence` is a Python `float`: give it to `%` formatting as one. */
const asNumber = (c: unknown): unknown => (typeof c === "object" && c !== null && !(c instanceof PyFloat) && typeof (c as { value?: unknown }).value === "number" ? new PyFloat((c as { value: number }).value) : c);

/** Writes trees as Newick text. */
export class Writer {
  /** @param trees - The trees to write. */
  constructor(private readonly trees: Iterable<BaseTree>) {}

  /** Write every tree followed by a newline. @returns The number of trees written. */
  write(handle: WriteTarget, options: WriterOptions = {}): number {
    let count = 0;
    for (const treestr of this.toStrings(options)) { handle.write(treestr + "\n"); count += 1; }
    return count;
  }

  /** The tree lines. */
  *toStrings(options: WriterOptions = {}): Generator<string> {
    const { confidenceAsBranchLength = false, branchLengthOnly = false, plainNewick = true, ladderize = null, maxConfidence = 1.0, formatConfidence = "%1.2f", formatBranchLength = "%1.8g" } = options;
    let plain = options.plain ?? false;
    if (confidenceAsBranchLength || branchLengthOnly) plain = false;
    const info = this.infoFactory(plain, confidenceAsBranchLength, branchLengthOnly, maxConfidence, formatConfidence, formatBranchLength);
    const newickize = (clade: BaseClade): string => {
      let label = clade.name || "";
      if (label) {
        const m = /^[^\s()[\]':;,]+/.exec(label);
        if (m === null || Array.from(m[0]).length < Array.from(label).length) label = `'${label.replaceAll("'", "''")}'`;
      }
      if (clade.isTerminal()) return label + info(clade, true);
      return `(${clade.clades.map(newickize).join(",")})${label + info(clade, false)}`;
    };
    for (const tree of this.trees) {
      if (ladderize !== null && ["left", "LEFT", "right", "RIGHT"].includes(ladderize)) tree.ladderize(ladderize === "right" || ladderize === "RIGHT");
      const rawtree = newickize(tree.root) + ";";
      if (plainNewick) { yield rawtree; continue; }
      const weight = (tree as { weight?: number }).weight;
      if (weight === undefined) throw new TypeError("object has no attribute 'weight'");
      const treeline = ["tree", tree.name || "a_tree", "="];
      if (weight !== 1) treeline.push(`[&W${pyRound3(weight)}]`);
      if (tree.rooted) treeline.push("[&R]");
      treeline.push(rawtree);
      yield treeline.join(" ");
    }
  }

  private infoFactory(plain: boolean, confAsLength: boolean, lengthOnly: boolean, maxConfidence: number, formatConfidence: string, formatBranchLength: string): (clade: BaseClade, terminal: boolean) => string {
    if (plain) return (clade) => getComment(clade);
    if (confAsLength) return (clade, terminal) => ":" + (terminal ? pyPercent(formatConfidence, new PyFloat(maxConfidence)) : pyPercent(formatConfidence, asNumber(clade.confidence))) + getComment(clade);
    if (lengthOnly) return (clade) => ":" + pyPercent(formatBranchLength, new PyFloat(clade.branchLength || 0.0)) + getComment(clade);
    return (clade, terminal) => {
      // Biopython writes `(":" + format_branch_length) % (...)`, with the colon *inside* the format
      // string and a one-element tuple on the right -- so a complaint about the format names the colon's
      // position too, and names the argument's index. Formatting first and prepending after would report
      // a position one to the left.
      if (terminal || !hasConfidence(clade)) {
        return pyPercent(":" + formatBranchLength,
                         PyTuple.from([new PyFloat(clade.branchLength || 0.0)])) + getComment(clade);
      }
      return pyPercent(formatConfidence + ":" + formatBranchLength, asNumber(clade.confidence), new PyFloat(clade.branchLength || 0.0)) + getComment(clade);
    };
  }
}

/** Python's `round(float(x), 3)` printed as a float. */
const pyRound3 = (x: number): string => pyFloatRepr(Math.round(x * 1000) / 1000);
