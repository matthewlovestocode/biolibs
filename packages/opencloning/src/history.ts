/**
 * A plan drawn as a tree: what was made, by what step, out of what.
 *
 * pydna renders this with networkx's text drawing, and the glyphs are its: a double-ruled corner for
 * the root, an arrow into each child, and a bar carried down the margin where an ancestor still has
 * siblings to come.
 */

import type { Dseqrecord } from "@biolibs/dseqrecord";
import { type AssemblySource, Primer } from "@biolibs/assembly2";

/** @param record - A molecule or a primer. @returns How the tree labels it. */
function label(record: Dseqrecord | Primer): string {
  return `${record.name} (${record.repr()})`;
}

/**
 * The cloning history of a molecule, as pydna prints it.
 *
 * @param record - The molecule.
 * @returns The tree, or an empty string for a molecule with no history.
 * @example
 * ```ts
 * history(plasmid);
 * // ╙── name (Dseqrecord(o75))
 * //     └─╼ GibsonAssemblySource
 * //         ├─╼ f1 (Dseqrecord(-50))
 * //         └─╼ f2 (Dseqrecord(-50))
 * ```
 */
export function history(record: Dseqrecord): string {
  const source = record.source as AssemblySource | null;
  if (source === null || source === undefined) return "";
  const lines = [`╙── ${label(record)}`];
  drawSource(source, "    ", true, lines);
  return lines.join("\n");
}

/**
 * Draw a step and everything under it.
 *
 * @param source - The step. @param prefix - What to put in the margin.
 * @param last - Whether this is the last child of its parent.
 * @param lines - Where to put the drawing.
 */
function drawSource(source: AssemblySource, prefix: string, last: boolean, lines: string[]): void {
  lines.push(`${prefix}${last ? "└─╼ " : "├─╼ "}${source.kind}`);
  const inner = prefix + (last ? "    " : "│   ");
  source.input.forEach((input, at) => {
    const isLast = at === source.input.length - 1;
    const fragment = input.sequence;
    lines.push(`${inner}${isLast ? "└─╼ " : "├─╼ "}${label(fragment)}`);
    const nested = (fragment as Dseqrecord).source as AssemblySource | null | undefined;
    if (!(fragment instanceof Primer) && nested !== null && nested !== undefined) {
      drawSource(nested, inner + (isLast ? "    " : "│   "), true, lines);
    }
  });
}
