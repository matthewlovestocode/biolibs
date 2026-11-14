/**
 * @packageDocumentation
 * `@biolibs/motifs`: a TypeScript port of Biopython's `Bio.motifs` — all **173 items** at parity,
 * verified against Biopython 1.88 by 3,154 recorded cases.
 *
 * A motif is built from aligned instances or from counts; its counts become frequencies, then log-odds
 * scores against a background, and that matrix scans a sequence. Eleven formats can be read and four
 * written. Sources are a file's *text*, as everywhere in this repository.
 *
 * Scores are **single precision**, as Biopython's NumPy arrays are, so compare them with a tolerance.
 *
 * - `matrix.ts`: `GenericPositionMatrix`, `FrequencyPositionMatrix`, `PositionWeightMatrix`,
 *   `PositionSpecificScoringMatrix` — dict subclasses in Biopython, which is why `equals` compares the
 *   stored rows and nothing else, and why `lt`/`le`/`gt`/`ge` always raise
 * - `motif.ts`: `Motif`, with `consensus`, `degenerateConsensus` (the IUPAC-ambiguity reading) and the
 *   pseudocounts and background the scoring needs
 * - `thresholds.ts`: `ScoreDistribution` and the false-positive, Patser and balanced thresholds
 * - `jaspar.ts`: JASPAR motifs, the `pfm`/`sites`/`jaspar` readers and writers
 * - `transfac.ts`, `clusterbuster.ts`: those formats both ways
 * - `alignace.ts`, `meme.ts`, `minimal.ts`, `mast.ts`, `xms.ts`, `pfm.ts`: the read-only formats, each
 *   returning a record that carries the run's own fields (`evalue`, `numOccurrences`, hit `diagrams`)
 *   and can be indexed by motif name (`xml.ts`, `convert.ts`: helpers)
 * - `errors.ts`, `format.ts`, `lines.ts`, `pyfloat.ts`, `slices.ts`: Python-compatibility helpers
 *
 * Not ported: `motifs.jaspar.db` (a MySQL client), `Motif.weblogo` (posts to a web service),
 * `Bio.motifs.matlab` and `universal`, and the motif-based `ScoreDistribution` path, which calls methods
 * Biopython's own `Motif` no longer has.
 */

import { Alignment } from "@biolibs/align";
import { ValueError } from "@biolibs/core";
import type { Seq } from "@biolibs/seq";
import * as alignace from "./alignace.js";
import * as clusterbuster from "./clusterbuster.js";
import * as jaspar from "./jaspar.js";
import * as mast from "./mast.js";
import * as meme from "./meme.js";
import * as minimal from "./minimal.js";
import * as pfm from "./pfm.js";
import { Motif, formatMotifs, writers } from "./motif.js";
import * as transfac from "./transfac.js";
import * as xms from "./xms.js";

export * from "./errors.js";
export * from "./format.js";
export * from "./lines.js";
export * from "./pyfloat.js";
export * from "./slices.js";
export * from "./matrix.js";
export * from "./motif.js";
export * from "./thresholds.js";
export { alignace, clusterbuster, jaspar, mast, meme, minimal, pfm, transfac, xms };

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
 * @param fmt - `pfm`, `sites`, `jaspar`, `transfac`, `clusterbuster`, `alignace`, `meme`, `minimal`, `xms`, `mast`, `pfm-four-columns` or `pfm-four-rows`.
 * @param strict - TRANSFAC only: apply the strict layout checks.
 * @throws ValueError for an unknown format.
 */
export function parse(text: string, fmt: string, strict = true): Motif[] {
  const f = fmt.toLowerCase();
  if (f === "transfac") return transfac.read(text, strict);
  if (f === "clusterbuster") return clusterbuster.read(text);
  if (f === "pfm" || f === "sites" || f === "jaspar") return jaspar.read(text, f);
  if (f === "alignace") return alignace.read(text);
  if (f === "meme") return meme.read(text);
  if (f === "minimal") return minimal.read(text);
  if (f === "xms") return xms.read(text);
  if (f === "mast") return mast.read(text) as unknown as Motif[];
  if (f === "pfm-four-columns" || f === "pfm-four-rows") return pfm.read(text, f);
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
