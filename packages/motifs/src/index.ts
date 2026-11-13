/**
 * @packageDocumentation
 * `@biolibs/motifs`: a TypeScript port of Biopython's `Bio.motifs`: sequence motifs, position matrices, scoring,
 * score thresholds and the JASPAR and TRANSFAC formats.
 *
 * - `matrix.ts`: `GenericPositionMatrix`, `FrequencyPositionMatrix`, `PositionWeightMatrix`, `PositionSpecificScoringMatrix`
 * - `motif.ts`: `Motif`
 * - `thresholds.ts`: `ScoreDistribution`
 * - `jaspar.ts`: JASPAR motifs, `pfm`/`sites`/`jaspar` readers and writers
 * - `transfac.ts`: TRANSFAC reader and writer
 * - `clusterbuster.ts`: Cluster-Buster reader and writer
 * - `errors.ts`, `format.ts`, `lines.ts`, `pyfloat.ts`, `slices.ts`: Python-compatibility helpers
 */

import { Alignment } from "@biolibs/align";
import { ValueError } from "@biolibs/core";
import type { Seq } from "@biolibs/seq";
import * as clusterbuster from "./clusterbuster.js";
import * as jaspar from "./jaspar.js";
import { Motif, formatMotifs, writers } from "./motif.js";
import * as transfac from "./transfac.js";

export * from "./errors.js";
export * from "./format.js";
export * from "./lines.js";
export * from "./pyfloat.js";
export * from "./slices.js";
export * from "./matrix.js";
export * from "./motif.js";
export * from "./thresholds.js";
export { clusterbuster, jaspar, transfac };

writers["pfm"] = (m) => jaspar.write(m, "pfm");
writers["jaspar"] = (m) => jaspar.write(m, "jaspar");
writers["transfac"] = (m) => transfac.write(m);
writers["clusterbuster"] = (m) => clusterbuster.write(m);

/**
 * A motif from aligned instances.
 *
 * @param instances - Sequences of equal length.
 * @param alphabet - The letters (default `ACGT`).
 */
export function create(instances: Seq[], alphabet = "ACGT"): Motif {
  return new Motif(alphabet, new Alignment(instances));
}

/**
 * Parse motifs from text.
 *
 * @param text - The file contents.
 * @param fmt - `pfm`, `sites`, `jaspar`, `transfac` or `clusterbuster`.
 * @param strict - TRANSFAC only: apply the strict layout checks.
 * @throws ValueError for an unknown format; Error for formats not ported yet (alignace, meme, minimal, clusterbuster, pfm-four-columns/rows, xms, mast).
 */
export function parse(text: string, fmt: string, strict = true): Motif[] {
  const f = fmt.toLowerCase();
  if (f === "transfac") return transfac.read(text, strict);
  if (f === "clusterbuster") return clusterbuster.read(text);
  if (f === "pfm" || f === "sites" || f === "jaspar") return jaspar.read(text, f);
  if (["alignace", "meme", "minimal", "pfm-four-columns", "pfm-four-rows", "xms", "mast"].includes(f)) throw new Error(`Motif format '${f}' is not ported yet`);
  throw new ValueError(`Unknown format ${f}`);
}

/**
 * Read exactly one motif from text.
 *
 * @throws ValueError if the text holds no motif or more than one.
 */
export function read(text: string, fmt: string, strict = true): Motif {
  const motifs = parse(text, fmt.toLowerCase(), strict);
  if (motifs.length === 0) throw new ValueError("No motifs found in handle");
  if (motifs.length > 1) throw new ValueError("More than one motif found in handle");
  return motifs[0]!;
}

/**
 * Write motifs as text.
 *
 * @param motifs - The motifs.
 * @param fmt - `pfm`, `jaspar`, `transfac` or `clusterbuster`.
 * @throws ValueError (`Unknown format type ...`) otherwise.
 */
export function write(motifs: Motif[], fmt: string): string {
  return formatMotifs(motifs, fmt.toLowerCase());
}
