/**
 * @packageDocumentation
 * SEGUID v2: checksums that identify a sequence rather than naming it.
 *
 * A port of the [seguid](https://github.com/seguid/seguid-python) package, which `pydna` uses to give a
 * construct a stable identifier. Measured against it the same way the other ports are measured: see
 * `docs/parity-seguid/`.
 *
 * - `tables.ts` — the alphabets, and the checks that a sequence and a duplex fit one.
 * - `checksum.ts` — the five checksums, and the smallest rotation a circular one is read from.
 */

export * from "./checksum.js";
export * from "./tables.js";
