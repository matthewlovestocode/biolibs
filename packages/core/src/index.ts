/**
 * @packageDocumentation
 * The layer every other biolibs package sits on: Python's answers, in TypeScript. It has no runtime
 * dependencies, does no I/O, and keeps no global state beyond the warning handler.
 *
 * Everything here is measured against CPython rather than recalled from it: `reference/golden/
 * gen_pycompat_cases.py` runs the interpreter and records the value, or the exception type *and* message,
 * that each function has to reproduce.
 *
 * - `errors.ts`: {@link BioError} and the twelve Python-style subclasses, each reporting Python's name
 * - `warnings.ts`: `warn`, `setWarningHandler`, `captureWarnings`
 * - `assert.ts`: `assert`, a TypeScript assertion function for programming errors
 * - `py/`: CPython's own results for `int()`, `float()`, `round()`, `repr()`, `str()`, `%` formatting,
 *   `==`, truthiness, `in`, the string predicates, `textwrap.fill` and `random.Random` — plus
 *   {@link PyTuple} and {@link PyFloat}, the two distinctions JavaScript cannot draw but Python's output
 *   depends on, and strict UTF-8/ASCII decoding with Python's own error text
 * - `zlib/`: inflate *and* deflate, byte for byte what `zlib.compress` writes at every level
 * - `hash/`: SHA-1 and base64, which the sequence checksums and SEGUID rest on
 */

export * from "./errors.js";
export * from "./warnings.js";
export * from "./assert.js";
export * from "./py/index.js";
export * from "./zlib/inflate.js";
export * from "./zlib/deflate.js";
export * from "./hash/index.js";
