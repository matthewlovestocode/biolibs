/**
 * @packageDocumentation
 * `Seq` and `MutableSeq`: a port of Biopython's `Bio.Seq`.
 *
 * ## Python -> TypeScript naming
 *
 * | Python | TypeScript |
 * |---|---|
 * | `len(s)` | `s.length` |
 * | `s[i]` | `s.at(i)` |
 * | `s[a:b:c]` | `s.slice(a, b, c)` (or `s.get({start, stop, step})`) |
 * | `s[i] = v`, `del s[i]` | `s.set(i, v)`, `s.delete(i)` |
 * | `a + b`, `"x" + a` | `a.add(b)`, `a.radd("x")` |
 * | `a * n`, `n * a`, `a *= n` | `a.mul(n)`, `a.rmul(n)`, `a.imul(n)` |
 * | `a == b`, `<`, `<=`, `>`, `>=` | `a.equals(b)`, `lt`, `le`, `gt`, `ge` |
 * | `x in s` | `s.contains(x)` |
 * | `str(s)`, `bytes(s)`, `repr(s)` | `s.toString()`, `s.toBytes()`, `s.repr()` |
 * | `hash(s)` | `s.hashCode()` (value differs from CPython) |
 * | `for c in s` | `for (const c of s)` |
 * | snake_case names | camelCase |
 * | `None` | `null` / `undefined` |
 * | `bytes`/`bytearray` | `Uint8Array` |
 *
 * Arguments keep Python's positional order, so `s.translate(table, stopSymbol,
 * toStop, cds, gap)`. `translate` additionally accepts a single options object.
 *
 * ## Layout
 *
 * - `seq.ts`, `mutable-seq.ts`: the two classes
 * - `base/`: the shared base class, as layers (core, search, edit, biology)
 * - `functions.ts`: module-level functions
 * - `translate.ts`: translation engine
 * - `args.ts`, `pytypes.ts`, `complement-tables.ts`, `seq-record-brand.ts`: support
 */

export { Seq } from "./seq.js";
export { MutableSeq } from "./mutable-seq.js";
export { SeqAbstractBaseClass } from "./base/index.js";
export type { SubLike } from "./args.js";
export { translateStr, type TableArg, type TranslateOptions } from "./translate.js";
export { SEQ_RECORD_BRAND } from "./seq-record-brand.js";
export * from "./functions.js";
