/** Cluster-Buster motif files (Biopython's `Bio.motifs.clusterbuster`): `>name`, optional `# GAP`/`# WEIGHT`, then four count columns. */

import { pyFloat, pyFloatRepr } from "@biolibs/core";
import { fixedWidth } from "./format.js";
import { splitLines } from "./lines.js";
import { Motif } from "./motif.js";

/** A motif with the gap and weight of the Cluster-Buster format. */
export class ClusterbusterMotif extends Motif {
  /** The `# GAP` value, or null. */
  gap: number | null = null;
  /** The `# WEIGHT` value, or null. */
  weight: number | null = null;
}

/** The motifs of a Cluster-Buster file. */
export class ClusterbusterRecord extends Array<ClusterbusterMotif> {
  /** @returns The motifs' texts joined by newlines. */
  override toString(): string { return Array.from(this, (m) => m.toString()).join("\n"); }
}

/**
 * Read a Cluster-Buster file. As in Biopython the last motif is always added, so even empty text gives one empty motif.
 *
 * @param text - The file contents.
 * @throws ValueError for a `GAP`, `WEIGHT` or count that is not a number.
 */
export function read(text: string): ClusterbusterRecord {
  let motifNbr = 0;
  const record = new ClusterbusterRecord();
  let counts = new Map<string, number[]>([["A", []], ["C", []], ["G", []], ["T", []]]);
  let name = "";
  let gap: number | null = null, weight: number | null = null;
  const make = (): void => {
    const motif = new ClusterbusterMotif("GATC", null, counts);
    motif.name = name; motif.gap = gap; motif.weight = weight;
    record.push(motif);
  };
  for (const raw of splitLines(text)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith(">")) {
      if (motifNbr !== 0) make();
      name = line.slice(1).trim();
      counts = new Map([["A", []], ["C", []], ["G", []], ["T", []]]);
      gap = null; weight = null;
      motifNbr += 1;
    } else {
      const cols = line.split(/\s+/).filter(Boolean);
      if (line.startsWith("# GAP")) { gap = pyFloat(cols[2]!); continue; }
      if (line.startsWith("# WEIGHT")) { weight = pyFloat(cols[2]!); continue; }
      if (line.startsWith("#")) continue;
      if (cols.length === 4) "ACGT".split("").forEach((n, k) => counts.get(n)!.push(pyFloat(cols[k]!)));
    }
  }
  make();
  return record;
}

/**
 * Write motifs in Cluster-Buster format.
 *
 * @param motifs - Motifs over a DNA alphabet (an RNA motif raises KeyError for `T`).
 * @param precision - Decimals for the counts (default 0).
 */
export function write(motifs: Iterable<Motif>, precision = 0): string {
  const lines: string[] = [];
  for (const m of motifs) {
    lines.push(`>${m.name ?? "None"}\n`);
    const { weight, gap } = m as ClusterbusterMotif;
    if (weight) lines.push(`# WEIGHT: ${pyFloatRepr(weight)}\n`);
    if (gap) lines.push(`# GAP: ${pyFloatRepr(gap)}\n`);
    const c = m.counts;
    if (c === null) throw new TypeError("'NoneType' object is not subscriptable");
    const [a, cc, g, t] = [c.row("A"), c.row("C"), c.row("G"), c.row("T")];
    const n = Math.min(a.length, cc.length, g.length, t.length);
    for (let i = 0; i < n; i++) lines.push([a[i]!, cc[i]!, g[i]!, t[i]!].map((v) => fixedWidth(v, 0, Math.trunc(precision))).join("\t") + "\n");
  }
  return lines.join("");
}
