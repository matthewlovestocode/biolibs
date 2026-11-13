/**
 * @packageDocumentation
 * Shared types, Python-style errors and warnings used across the biolibs packages.
 * This package has no runtime dependencies.
 *
 * - `errors.ts`: {@link BioError} and Python-style subclasses
 * - `warnings.ts`: `warn`, `setWarningHandler`, `captureWarnings`
 * - `assert.ts`: `assert`
 * - `py/`: Python-compatible `int()`, `repr()`, `==` and type names
 */

export * from "./errors.js";
export * from "./warnings.js";
export * from "./assert.js";
export * from "./py/index.js";
export * from "./zlib/inflate.js";
