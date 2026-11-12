/**
 * @packageDocumentation
 * A port of Biopython's `Bio.SeqUtils`: sequence statistics and conversions.
 *
 * - `args.ts`: argument helpers (`SeqLike`, `asText`, `rangeStarts`)
 * - `gc.ts`: `gcFraction`, `gc123`, `gcSkew`
 * - `search.ts`: `ntSearch`
 * - `names.ts`: `seq1`, `seq3`
 * - `weight.ts`: `molecularWeight`
 * - `six-frame.ts`: `sixFrameTranslations`
 * - `cai.ts`: `CodonAdaptationIndex`
 * - `checksum.ts`, `sha1.ts`: `crc32`, `crc64`, `gcg`, `seguid`
 * - `lcc.ts`: `lccSimp`, `lccMult`
 * - `amino-counts.ts`, `isoelectric.ts`, `protparam.ts`: `IsoelectricPoint`, `ProteinAnalysis`
 * - `melting-salt.ts`, `melting-simple.ts`, `melting-nn.ts`: `tmWallace`, `tmGC`, `tmNN`, `saltCorrection`, `chemCorrection`, `makeTable`
 * - `data/melting-temp-data.ts` (generated): nearest-neighbour tables
 * - `stderr.ts`: where `proteinScale` warnings go
 * - `data/prot-param-data.ts` (generated): amino acid scales
 *
 * `xGC_skew` (a Tkinter window) has no counterpart; `gcSkew` provides the data it plots.
 */

export * from "./args.js";
export * from "./gc.js";
export * from "./search.js";
export * from "./names.js";
export * from "./weight.js";
export * from "./six-frame.js";
export * from "./cai.js";
export * from "./checksum.js";
export * from "./lcc.js";
export * from "./amino-counts.js";
export * from "./isoelectric.js";
export * from "./protparam.js";
export * from "./stderr.js";
export * from "./melting.js";
export * as ProtParamData from "./data/prot-param-data.js";
