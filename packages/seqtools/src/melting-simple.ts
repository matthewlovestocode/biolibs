/** The simple melting-temperature estimates: Wallace rule and GC content (Biopython's `Tm_Wallace`, `Tm_GC`), plus `make_table`. */

import { UnboundLocalError, ValueError, ZeroDivisionError, pySplit, pyStr } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { countChar } from "./amino-counts.js";
import { gcFraction } from "./gc.js";
import { saltCorrection } from "./melting-salt.js";

/** Nearest-neighbour style table: key to `[enthalpy, entropy]`; a `Map` or a plain object. */
export type ThermoTable = Map<string, [number, number]> | Record<string, [number, number]>;

/** Look up `key` in a table; undefined if absent. */
export function tableGet(table: ThermoTable, key: string): [number, number] | undefined {
  if (table instanceof Map) return table.get(key);
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

/** Whether a table has no entries (Python's `not table`). */
export function tableEmpty(table: ThermoTable | null | undefined): boolean {
  return table === null || table === undefined || (table instanceof Map ? table.size === 0 : Object.keys(table).length === 0);
}

/**
 * A nearest-neighbour table with all initiation and neighbour terms set to `[0, 0]`, or a copy of
 * `oldTable`, with `values` merged in.
 *
 * @example
 * ```ts
 * makeTable(null, { "AA/TT": [-9.1, -24] }).get("AA/TT");   // [-9.1, -24]
 * ```
 */
export function makeTable(oldTable: ThermoTable | null = null, values: ThermoTable | null = null): Map<string, [number, number]> {
  const keys = ["init", "init_A/T", "init_G/C", "init_oneG/C", "init_allA/T", "init_5T/A", "sym", "AA/TT", "AT/TA", "TA/AT", "CA/GT", "GT/CA", "CT/GA", "GA/CT", "CG/GC", "GC/CG", "GG/CC"];
  const table = new Map<string, [number, number]>(oldTable === null ? keys.map((k) => [k, [0, 0]]) : oldTable instanceof Map ? oldTable : Object.entries(oldTable));
  if (values !== null && !tableEmpty(values)) for (const [k, v] of values instanceof Map ? values : Object.entries(values)) table.set(k, v);
  return table;
}

/** Letters kept by `_check` for each method. */
const BASESETS: Record<string, string> = { Tm_GC: "ABCDGHIKMNRSTVWXY", Tm_NN: "ACGTI" };

/** Clean a sequence the way Biopython does: remove whitespace, upper-case, turn U into T, and drop letters the method cannot use. */
export function checkSeq(seq: string, method: "Tm_Wallace" | "Tm_GC" | "Tm_NN"): string {
  let s = pySplit(seq).join("").toUpperCase();
  s = new Seq(s).backTranscribe().toString();
  if (method === "Tm_Wallace") return s;
  return [...s].filter((base) => BASESETS[method]!.includes(base)).join("");
}

const total = (seq: string, letters: string): number => [...letters].reduce((n, ch) => n + countChar(seq, ch), 0);

/**
 * Melting temperature by the Wallace rule: 2 °C per A/T and 4 °C per G/C (a rough guide for short oligos).
 *
 * @param seq - DNA text or sequence. @param check - Clean the sequence first (default true). @param strict - Refuse ambiguous bases (default true).
 * @throws {@link ValueError} for ambiguous bases when `strict`.
 * @example
 * ```ts
 * tmWallace("ACGTTGCAATGCCGTA");   // 48
 * ```
 */
export function tmWallace(seq: unknown, check = true, strict = true): number {
  let s = pyStr(seq);
  if (check) s = checkSeq(s, "Tm_Wallace");
  let meltingTemp = 2 * total(s, "ATW") + 4 * total(s, "CGS");
  const tmp = 3 * total(s, "KMNRY") + (10 / 3.0) * total(s, "BV") + (8 / 3.0) * total(s, "DH");
  if (strict && tmp) throw new ValueError("ambiguous bases B, D, H, K, M, N, R, V, Y not allowed when strict=True");
  meltingTemp += tmp;
  return meltingTemp;
}

/**
 * Melting temperature from GC content with empirical constants (Marmur and Doty, Wetmur, Chester and Marshak, ...).
 *
 * @param seq - DNA text or sequence.
 * @param check - Clean the sequence first.
 * @param strict - Refuse ambiguous bases.
 * @param valueset - Constant set 1-8 (default 7, Von Ahsen et al. 2001).
 * @param userset - Your own `[A, B, C, D]` constants instead of a set.
 * @param Na - Salt concentrations in mM (`Na`, `K`, `Tris`, `Mg`, `dNTPs`) for the salt correction.
 * @param saltcorr - Salt correction method (overridden by the value set unless `userset` is given).
 * @param mismatch - Treat `X` as a mismatch and correct for it.
 * @throws {@link ValueError} for ambiguous bases, method 5, or a value set above 8.
 * @throws {@link UnboundLocalError} for a value set that is not 1-8 and no `userset` (a quirk of Biopython).
 */
export function tmGC(
  seq: unknown, check = true, strict = true, valueset = 7, userset: number[] | null = null,
  Na = 50, K = 0, Tris = 0, Mg = 0, dNTPs = 0, saltcorr = 0, mismatch = true,
): number {
  if (saltcorr === 5) throw new ValueError("salt-correction method 5 not applicable to Tm_GC");
  let s = pyStr(seq);
  if (check) s = checkSeq(s, "Tm_GC");
  if (strict && [..."KMNRYBVDH"].some((x) => s.includes(x))) throw new ValueError("ambiguous bases B, D, H, K, M, N, R, V, Y not allowed when 'strict=True'");
  let percentGc = gcFraction(s, "weighted") * 100;
  if (mismatch) {
    if (s.length === 0) throw new ZeroDivisionError();
    percentGc -= (countChar(s, "X") * 50.0) / s.length;
  }
  let A: number | undefined, B: number | undefined, C: number | undefined, D: number | undefined;
  if (userset && userset.length > 0) {
    if (userset.length !== 4) throw new ValueError(userset.length < 4 ? `not enough values to unpack (expected 4, got ${userset.length})` : `too many values to unpack (expected 4, got ${userset.length})`);
    [A, B, C, D] = userset as [number, number, number, number];
  } else {
    const sets: Record<number, [number, number, number, number, number]> = {
      1: [69.3, 0.41, 650, 1, 0], 2: [81.5, 0.41, 675, 1, 0], 3: [81.5, 0.41, 675, 1, 1], 4: [81.5, 0.41, 500, 1, 2],
      5: [78.0, 0.7, 500, 1, 2], 6: [67.0, 0.8, 500, 1, 2], 7: [81.5, 0.41, 600, 1, 1], 8: [77.1, 0.41, 528, 1, 4],
    };
    const chosen = sets[valueset];
    if (chosen !== undefined) [A, B, C, D, saltcorr] = chosen;
  }
  if (valueset > 8) throw new ValueError("allowed values for parameter 'valueset' are 0-8.");
  if (A === undefined || B === undefined || C === undefined || D === undefined) {
    throw new UnboundLocalError("cannot access local variable 'A' where it is not associated with a value");
  }
  if (s.length === 0) throw new ZeroDivisionError();
  let meltingTemp = A + B * percentGc - C / s.length;
  if (saltcorr) meltingTemp += saltCorrection(Na, K, Tris, Mg, dNTPs, saltcorr, s);
  if (mismatch) meltingTemp -= D * ((countChar(s, "X") * 100.0) / s.length);
  return meltingTemp;
}
