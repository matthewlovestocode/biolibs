/** `Bio.Phylo.parse`, `read`, `write` and `convert`: tree file I/O over text. */

import { KeyError, PyFloat, ValueError, pyStr } from "@biolibs/core";
import { Nexus } from "@biolibs/nexus";
import type { Tree as BaseTree } from "./base-tree/tree.js";
import { Clade as NewickClade, Tree as NewickTree } from "./newick/newick.js";
import { Parser, type ParseOptions } from "./newick/parser.js";
import { Writer, type WriteTarget, type WriterOptions } from "./newick/writer.js";
import { Clade as BaseClade } from "./base-tree/clade.js";
import { registerFormatter } from "./base-tree/tree.js";

/** A tree file format: how to parse and write it. */
export interface TreeFormat {
  /** Iterate over the trees of a text. */
  parse(text: string, options?: Record<string, unknown>): Iterable<BaseTree>;
  /** Write trees; returns the number written. */
  write(trees: Iterable<BaseTree>, target: WriteTarget, options?: Record<string, unknown>): number;
}

const NEX_TEMPLATE = (count: number, labels: string, trees: string): string => `#NEXUS\nBegin Taxa;\n Dimensions NTax=${count};\n TaxLabels ${labels};\nEnd;\nBegin Trees;\n ${trees}\nEnd;\n`;

const newick: TreeFormat = {
  parse: (text, options) => new Parser(text).parse(options as ParseOptions),
  write: (trees, target, options = {}) => new Writer(trees).write(target, { ...(options as WriterOptions), plain: (options as WriterOptions).plain ?? false }),
};

const nexus: TreeFormat = {
  *parse(text) {
    const nex = new Nexus(text);
    for (const nxtree of nex.trees) {
      const node2clade = (id: number): NewickClade => {
        const node = nxtree.node(id);
        return new NewickClade({
          branchLength: node.data!.branchlength, name: node.data!.taxon, clades: node.succ.map(node2clade), confidence: node.data!.support === null || !Number.isInteger(node.data!.support) ? node.data!.support : new PyFloat(node.data!.support), comment: node.data!.comment,
        });
      };
      yield new NewickTree({ root: node2clade(nxtree.root), rooted: nxtree.rooted, name: nxtree.name, weight: nxtree.weight });
    }
  },
  write(obj, target, options = {}) {
    const trees = [...obj];
    const writer = new Writer(trees);
    const nexusTrees = [...writer.toStrings({ ...(options as WriterOptions), plain: false, plainNewick: true })].map((nwk, idx) => `Tree tree${idx + 1}=${nwk}`);
    const labels = trees.flatMap((t) => t.getTerminals().map((x) => pyStr(x.name)));
    target.write(NEX_TEMPLATE(labels.length, labels.join(" "), nexusTrees.join("\n")));
    return nexusTrees.length;
  },
};

/** The tree file formats that are ported. */
export const supportedFormats: Record<string, TreeFormat> = { newick, nexus };

function format(name: string): TreeFormat {
  const f = Object.hasOwn(supportedFormats, name) ? supportedFormats[name] : undefined;
  if (f === undefined) throw new KeyError(name);
  return f;
}

/** Iterate over the trees of a text in the given format (even if it holds one tree). @throws KeyError for an unknown format. */
export function parse(text: string, fmt: string, options: Record<string, unknown> = {}): Iterable<BaseTree> { return format(fmt).parse(text, options); }

/** The single tree of a text. @throws ValueError for none or several. */
export function read(text: string, fmt: string, options: Record<string, unknown> = {}): BaseTree {
  const it = parse(text, fmt, options)[Symbol.iterator]();
  const first = it.next();
  if (first.done) throw new ValueError("There are no trees in this file.");
  if (!it.next().done) throw new ValueError("There are multiple trees in this file; use parse() instead.");
  return first.value;
}

/** Write one tree or several. @returns The number of trees written. */
export function write(trees: BaseTree | BaseClade | Iterable<BaseTree>, target: WriteTarget, fmt: string, options: Record<string, unknown> = {}): number {
  const list = trees instanceof BaseClade || (trees as { root?: unknown }).root !== undefined ? [trees as BaseTree] : (trees as Iterable<BaseTree>);
  return format(fmt).write(list, target, options);
}

/** Convert the trees of a text between two formats. @returns The number of trees written. */
export function convert(text: string, inFormat: string, target: WriteTarget, outFormat: string, parseArgs: Record<string, unknown> = {}, options: Record<string, unknown> = {}): number {
  return write(parse(text, inFormat, parseArgs), target, outFormat, options);
}

/** Serialise a tree as text in a file format (used by `Tree.format`). */
registerFormatter((tree, fmt) => { let text = ""; write([tree], { write: (s: string) => { text += s; } }, fmt); return text; });
