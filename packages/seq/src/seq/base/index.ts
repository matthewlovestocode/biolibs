/**
 * The shared `Seq`/`MutableSeq` base class, built as a chain of layers so no
 * single file holds every method:
 *
 * `SeqCoreBase` (core.ts) -> `SeqSearchBase` (search.ts) -> `SeqEditBase` (edit.ts) -> `SeqAbstractBaseClass` (biology.ts)
 */

export { SeqCoreBase } from "./core.js";
export { SeqSearchBase } from "./search.js";
export { SeqEditBase } from "./edit.js";
export { SeqAbstractBaseClass } from "./biology.js";
