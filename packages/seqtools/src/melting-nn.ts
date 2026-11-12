/** Nearest-neighbour melting temperature (Biopython's `Tm_NN`). */

import { IndexError, KeyError, ValueError, ZeroDivisionError, pyRepr, pyStr, warn } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { countChar } from "./amino-counts.js";
import * as T from "./data/melting-temp-data.js";
import { gcFraction } from "./gc.js";
import { mlog, saltCorrection } from "./melting-salt.js";
import { checkSeq, tableEmpty, tableGet, type ThermoTable } from "./melting-simple.js";

const reverse = (s: string): string => [...s].reverse().join("");

/** Look up `key` that must exist (Python's `table[key]`). */
function need(table: ThermoTable, key: string): [number, number] {
  const v = tableGet(table, key);
  if (v === undefined) throw new KeyError(key);
  return v;
}

/** Report a neighbour pair the table does not know: an error when strict, otherwise a warning. */
function keyError(neighbors: string, strict: boolean): void {
  if (strict) throw new ValueError(`no thermodynamic data for neighbors ${pyRepr(neighbors)} available`);
  // The misspelling is Biopython's.
  warn(`no themodynamic data for neighbors ${pyRepr(neighbors)} available. Calculation will be wrong`, "BiopythonWarning");
}

/** Python `'.' * n` (a fractional count is a TypeError). */
function dots(n: number): string {
  if (!Number.isInteger(n)) throw new TypeError("can't multiply sequence by non-int of type 'float'");
  return ".".repeat(Math.max(0, n));
}

/**
 * Melting temperature of a DNA/DNA, RNA/RNA or RNA/DNA duplex from nearest-neighbour thermodynamics,
 * with optional mismatches, dangling ends and salt correction.
 *
 * @param seq - The primer, 5' to 3'.
 * @param check - Clean `seq` first (default true). @param strict - Raise instead of warn when a neighbour pair has no data.
 * @param cSeq - The complementary strand, 3' to 5' (default: the complement of `seq`); use it for mismatches.
 * @param shift - Offset of `cSeq` against `seq` (for dangling ends).
 * @param nnTable - Nearest-neighbour table (default `dnaNn3`); see `dnaNn1`..`dnaNn4`, `rnaNn1`..`rnaNn3`, `rDnaNn1`.
 * @param tmmTable - Terminal mismatch table (default `dnaTmm1`). @param immTable - Internal mismatch table (default `dnaImm1`).
 * @param deTable - Dangling end table (default `dnaDe1`).
 * @param dnac1 - Concentration of the higher-concentration strand (nM). @param dnac2 - Concentration of the other strand (nM).
 * @param selfcomp - The sequence is self-complementary.
 * @param Na - Salt concentrations in mM (`Na`, `K`, `Tris`, `Mg`, `dNTPs`). @param saltcorr - Salt correction method 0-7 (default 5).
 * @returns The melting temperature in °C.
 * @throws {@link ValueError} for a missing neighbour pair (when strict) or an invalid salt method.
 * @example
 * ```ts
 * tmNN("CGTTCCAAAGATGTGGGCATGAGCTTAC");   // 60.32...
 * ```
 */
export function tmNN(
  seq: unknown, check = true, strict = true, cSeq: unknown = null, shift = 0,
  nnTable: ThermoTable | null = null, tmmTable: ThermoTable | null = null, immTable: ThermoTable | null = null, deTable: ThermoTable | null = null,
  dnac1 = 25, dnac2 = 25, selfcomp = false, Na = 50, K = 0, Tris = 0, Mg = 0, dNTPs = 0, saltcorr = 5,
): number {
  const nn = tableEmpty(nnTable) ? T.dnaNn3 : nnTable!;
  const tmm = tableEmpty(tmmTable) ? T.dnaTmm1 : tmmTable!;
  const imm = tableEmpty(immTable) ? T.dnaImm1 : immTable!;
  const de = tableEmpty(deTable) ? T.dnaDe1 : deTable!;
  let s = pyStr(seq);
  const hasC = cSeq !== null && cSeq !== undefined && !(typeof cSeq === "string" && cSeq === "") && !(cSeq instanceof Seq && cSeq.length === 0);
  let c = hasC ? pyStr(cSeq) : new Seq(s).complement().toString();
  if (check) {
    s = checkSeq(s, "Tm_NN");
    c = checkSeq(c, "Tm_NN");
  }
  let tmpSeq = s;
  let tmpC = c;
  let deltaH = 0;
  let deltaS = 0;
  const H = 0, S = 1;
  if (shift || s.length !== c.length) {
    if (shift > 0) tmpSeq = dots(shift) + s;
    if (shift < 0) tmpC = dots(Math.abs(shift)) + c;
    if (tmpC.length > tmpSeq.length) tmpSeq += ".".repeat(tmpC.length - tmpSeq.length);
    if (tmpC.length < tmpSeq.length) tmpC += ".".repeat(tmpSeq.length - tmpC.length);
    while (tmpSeq.startsWith("..") || tmpC.startsWith("..")) { tmpSeq = tmpSeq.slice(1); tmpC = tmpC.slice(1); }
    while (tmpSeq.endsWith("..") || tmpC.endsWith("..")) { tmpSeq = tmpSeq.slice(0, -1); tmpC = tmpC.slice(0, -1); }
    if (tmpSeq.startsWith(".") || tmpC.startsWith(".")) {
      const leftDe = tmpSeq.slice(0, 2) + "/" + tmpC.slice(0, 2);
      const v = tableGet(de, leftDe);
      if (v !== undefined) { deltaH += v[H]; deltaS += v[S]; } else keyError(leftDe, strict);
      tmpSeq = tmpSeq.slice(1);
      tmpC = tmpC.slice(1);
    }
    if (tmpSeq.endsWith(".") || tmpC.endsWith(".")) {
      const rightDe = reverse(tmpC.slice(-2)) + "/" + reverse(tmpSeq.slice(-2));
      const v = tableGet(de, rightDe);
      if (v !== undefined) { deltaH += v[H]; deltaS += v[S]; } else keyError(rightDe, strict);
      tmpSeq = tmpSeq.slice(0, -1);
      tmpC = tmpC.slice(0, -1);
    }
  }
  const leftTmm = reverse(tmpC.slice(0, 2)) + "/" + reverse(tmpSeq.slice(0, 2));
  const lt = tableGet(tmm, leftTmm);
  if (lt !== undefined) {
    deltaH += lt[H]; deltaS += lt[S];
    tmpSeq = tmpSeq.slice(1);
    tmpC = tmpC.slice(1);
  }
  const rightTmm = tmpSeq.slice(-2) + "/" + tmpC.slice(-2);
  const rt = tableGet(tmm, rightTmm);
  if (rt !== undefined) {
    deltaH += rt[H]; deltaS += rt[S];
    tmpSeq = tmpSeq.slice(0, -1);
    tmpC = tmpC.slice(0, -1);
  }
  const init = need(nn, "init");
  deltaH += init[H]; deltaS += init[S];
  if (gcFraction(s, "ignore") === 0) {
    const v = need(nn, "init_allA/T");
    deltaH += v[H]; deltaS += v[S];
  } else {
    const v = need(nn, "init_oneG/C");
    deltaH += v[H]; deltaS += v[S];
  }
  if (s.startsWith("T")) { const v = need(nn, "init_5T/A"); deltaH += v[H]; deltaS += v[S]; }
  if (s.endsWith("A")) { const v = need(nn, "init_5T/A"); deltaH += v[H]; deltaS += v[S]; }
  if (s.length === 0) throw new IndexError("string index out of range");
  const ends = s[0]! + s[s.length - 1]!;
  const AT = countChar(ends, "A") + countChar(ends, "T");
  const GC = countChar(ends, "G") + countChar(ends, "C");
  const at = need(nn, "init_A/T");
  deltaH += at[H] * AT; deltaS += at[S] * AT;
  const gc = need(nn, "init_G/C");
  deltaH += gc[H] * GC; deltaS += gc[S] * GC;
  for (let i = 0; i < tmpSeq.length - 1; i++) {
    const neighbors = tmpSeq.slice(i, i + 2) + "/" + tmpC.slice(i, i + 2);
    const rev = reverse(neighbors);
    const v = tableGet(imm, neighbors) ?? tableGet(imm, rev) ?? tableGet(nn, neighbors) ?? tableGet(nn, rev);
    if (v !== undefined) { deltaH += v[H]; deltaS += v[S]; } else keyError(neighbors, strict);
  }
  let k = (dnac1 - dnac2 / 2.0) * 1e-09;
  if (selfcomp) {
    k = dnac1 * 1e-09;
    const v = need(nn, "sym");
    deltaH += v[H]; deltaS += v[S];
  }
  const R = 1.987;
  let corr = 0;
  if (saltcorr) corr = saltCorrection(Na, K, Tris, Mg, dNTPs, saltcorr, s);
  if (saltcorr === 5) deltaS += corr;
  const denominator = deltaS + R * mlog(k);
  if (denominator === 0) throw new ZeroDivisionError();
  let meltingTemp = (1000 * deltaH) / denominator - 273.15;
  if (saltcorr === 1 || saltcorr === 2 || saltcorr === 3 || saltcorr === 4) meltingTemp += corr;
  if (saltcorr === 6 || saltcorr === 7) {
    const inner = meltingTemp + 273.15;
    if (inner === 0) throw new ZeroDivisionError();
    const outer = 1 / inner + corr;
    if (outer === 0) throw new ZeroDivisionError();
    meltingTemp = 1 / outer - 273.15;
  }
  return meltingTemp;
}
