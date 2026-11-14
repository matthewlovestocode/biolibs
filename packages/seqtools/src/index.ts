/**
 * @packageDocumentation
 * `@biolibs/seqtools`: a TypeScript port of Biopython's `Bio.SeqUtils` and its submodules — all **39
 * items** at parity, verified against Biopython 1.88 by 4,984 recorded calls.
 *
 * Every function takes plain text, a `Seq` or a `MutableSeq`.
 *
 * **Floating point is the boundary here, not behaviour.** Anything built on `log`, `exp` or `pow` —
 * `lccSimp`, `lccMult`, `CodonAdaptationIndex.calculate`, `tmGC`, `tmNN`, `saltCorrection`,
 * `IsoelectricPoint.chargeAtPH` — agrees with Biopython to about a relative 1e-12 rather than to the
 * last bit, because V8 and the C library round them differently. Sums go through `@biolibs/core`'s
 * `pySum`, which is Python 3.12's compensated summation, so `molecularWeight` and weighted `gcFraction`
 * do agree exactly.
 *
 * - `args.ts`: argument helpers (`SeqLike`, `asText`, `rangeStarts`)
 * - `gc.ts`: `gcFraction` — whose `ambiguous` argument decides whether an unread base belongs in the
 *   denominator, which is the whole point of the function — with `gc123` and `gcSkew`
 * - `search.ts`: `ntSearch`, IUPAC-aware and overlapping
 * - `names.ts`: `seq1`, `seq3`
 * - `weight.ts`: `molecularWeight`, single- or double-stranded, linear or circular, average or
 *   monoisotopic
 * - `six-frame.ts`: `sixFrameTranslations`
 * - `cai.ts`: `CodonAdaptationIndex`, which extends `Map`
 * - `checksum.ts`: `crc32`, `crc64`, `gcg`, `seguid` (SHA-1 and base64 come from `@biolibs/core`, so
 *   these run in a browser bundle)
 * - `lcc.ts`: `lccSimp`, `lccMult`
 * - `amino-counts.ts`, `isoelectric.ts`, `protparam.ts`: `IsoelectricPoint`, `ProteinAnalysis`
 * - `melting-salt.ts`, `melting-simple.ts`, `melting-nn.ts`: `tmWallace`, `tmGC`, `tmNN`,
 *   `saltCorrection`, `chemCorrection`, `makeTable`. Salt methods 1 to 6 refuse a total ion
 *   concentration of zero, so `saltCorrection()` with no arguments raises
 * - `data/melting-temp-data.ts`, `data/prot-param-data.ts` (generated): the nearest-neighbour tables
 *   and the 28 hydropathy scales
 * - `stderr.ts`: where `proteinScale`'s "not a standard amino acid" warnings go; `setStderrWriter`
 *   redirects them
 *
 * `xGC_skew` has no counterpart — it opens a Tkinter window — and `gcSkew` gives the data it plots.
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
