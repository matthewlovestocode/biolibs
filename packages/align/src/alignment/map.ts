/**
 * `Alignment.map` and `Alignment.mapall`: compose alignments. If `a` aligns a target to a query and `b` aligns that
 * query (as its target) to a third sequence, `a.map(b)` aligns the first target directly to the third sequence.
 */

import { IndexError, ValueError } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { columnMax, diffRows, type Matrix } from "./coords.js";
import { lengthOf } from "./sequence-utils.js";
import type { Alignment } from "./alignment.js";

/** Builds an `Alignment` (passed in so this module need not import the class). */
export type Maker = (sequences: unknown[], coordinates: Matrix | null) => Alignment;

const BIG = Number.MAX_SAFE_INTEGER;

/** `np.prod(np.sign(steps), 0)`: the sign of each step column over both rows. */
function strandOf(steps: Matrix, which: string): "+" | "-" {
  const m = steps[0]?.length ?? 0;
  const row = Array.from({ length: m }, (_, k) => steps.reduce((p, r) => p * Math.sign(r[k]!), 1));
  if (row.every((v) => v >= 0)) return "+";
  if (row.every((v) => v <= 0)) return "-";
  throw new ValueError(`Inconsistent steps in the ${which} alignment`);
}

/** Whether every step either equals the column's largest step or is not positive (`(steps == gaps) | (steps <= 0)`). */
function equalSteps(steps: Matrix): boolean {
  const gaps = columnMax(steps);
  return steps.every((row) => row.every((v, k) => v === gaps[k] || v <= 0));
}

/**
 * Map `alignment2` through `alignment1`.
 *
 * @param alignment1 - Aligns a target to a query.
 * @param alignment2 - Aligns that query (as its target) to another sequence.
 * @returns The alignment of the first target to the second query.
 * @throws {@link ValueError} when the lengths do not match or the steps are inconsistent.
 */
export function mapAlignment(alignment1: Alignment, alignment2: Alignment, make: Maker): Alignment {
  const len1 = lengthOf(alignment1.query);
  const len2 = lengthOf(alignment2.target);
  if (len1 !== len2) throw new ValueError(`length of alignment1 query sequence (${len1}) != length of alignment2 target sequence (${len2})`);
  const target = alignment1.target;
  const query = alignment2.query;
  let coordinates1 = alignment1.coordinates!.map((r) => [...r]);
  let coordinates2 = alignment2.coordinates!.map((r) => [...r]);
  const n1 = len1;
  const n2 = lengthOf(alignment2.query);
  const strand1 = strandOf(diffRows(coordinates1), "first");
  const strand2 = strandOf(diffRows(coordinates2), "second");
  if (strand1 === "+") {
    if (strand2 === "-") coordinates2[1] = coordinates2[1]!.map((v) => n2 - v); // mapped to the reverse strand
  } else {
    coordinates1[1] = coordinates1[1]!.map((v) => n1 - v);
    coordinates2[0] = [...coordinates2[0]!].reverse().map((v) => n1 - v);
    if (strand2 === "+") coordinates2[1] = [...coordinates2[1]!].reverse().map((v) => n2 - v);
    else coordinates2[1] = [...coordinates2[1]!].reverse();
  }
  if (!equalSteps(diffRows(coordinates1))) throw new ValueError("Unequal step sizes in first alignment");
  if (!equalSteps(diffRows(coordinates2))) throw new ValueError("Unequal step sizes in second alignment");
  const path: number[][] = [];
  let tEnd = BIG;
  let qEnd = BIG;
  const cols1 = coordinates1[0]!.map((t, k) => [t, coordinates1[1]![k]!] as [number, number]);
  let next1 = 0;
  let tStart1 = BIG;
  let qStart1 = BIG;
  let tEnd1 = 0;
  let qEnd1 = 0;
  /** Advance the shared iterator over the first alignment's columns until one with aligned letters is found. */
  const advance = (): boolean => {
    while (next1 < cols1.length) {
      [tEnd1, qEnd1] = cols1[next1++]!;
      if (tStart1 < tEnd1 && qStart1 < qEnd1) return true;
      tStart1 = tEnd1;
      qStart1 = qEnd1;
    }
    return false;
  };
  advance();
  let tStart2 = BIG;
  let qStart2 = BIG;
  for (let k = 0; k < coordinates2[0]!.length; k++) {
    const tEnd2 = coordinates2[0]![k]!;
    const qEnd2 = coordinates2[1]![k]!;
    while (qStart2 < qEnd2 && tStart2 < tEnd2) {
      let size = 0;
      for (;;) {
        if (tStart2 < qStart1) {
          size = tEnd2 < qStart1 ? tEnd2 - tStart2 : qStart1 - tStart2;
          break;
        }
        if (tStart2 < qEnd1) {
          const offset = tStart2 - qStart1;
          size = tEnd2 < qEnd1 ? tEnd2 - tStart2 : qEnd1 - tStart2;
          const qStart = qStart2;
          const tStart = tStart1 + offset;
          if (tStart !== tEnd || qStart !== qEnd) {
            if (tStart > tEnd && qStart > qEnd) path.push([tStart, qEnd]);
            path.push([tStart, qStart]);
          }
          qEnd = qStart2 + size;
          tEnd = tStart + size;
          path.push([tEnd, qEnd]);
          break;
        }
        tStart1 = tEnd1;
        qStart1 = qEnd1;
        if (!advance()) {
          size = qEnd2 - qStart2;
          break;
        }
      }
      qStart2 += size;
      tStart2 += size;
    }
    tStart2 = tEnd2;
    qStart2 = qEnd2;
  }
  let coordinates: Matrix = [path.map((p) => p[0]!), path.map((p) => p[1]!)];
  if (path.length === 0) {
    // NumPy builds an empty one-dimensional array here, which cannot be indexed as a matrix.
    if (strand1 !== strand2) throw new IndexError("too many indices for array: array is 1-dimensional, but 2 were indexed");
    coordinates = [];
  } else if (strand1 !== strand2) coordinates[1] = coordinates[1]!.map((v) => n2 - v);
  return make([target, query], coordinates);
}

/**
 * Map each of `alignments` (which align the sequences of `alignment` pairwise to a query) through `alignment`, and
 * combine the results into one multiple alignment of the queries.
 *
 * @throws {@link ValueError} for unexpected or inconsistent step sizes.
 */
export function mapAll(self: Alignment, alignments: Alignment[], make: Maker): Alignment {
  let factor: number | null = null;
  const list = [...alignments];
  for (const alignment of list) {
    const steps = diffRows(alignment.coordinates!);
    const aligned = steps[0]!.map((_, k) => steps.reduce((n, r) => n + (r[k] !== 0 ? 1 : 0), 0) > 1);
    const sums = steps.map((row) => row.filter((_, k) => aligned[k]).reduce((a, b) => a + b, 0));
    if (sums.length !== 2) throw new ValueError(sums.length < 2 ? `not enough values to unpack (expected 2, got ${sums.length})` : `too many values to unpack (expected 2, got ${sums.length})`);
    const [step1, step2] = sums as [number, number];
    let step: number;
    if (step1 === step2) step = 1; // nucleotide-nucleotide or protein-protein
    else if (step1 === -step2) step = 1; // nucleotide-nucleotide on the reverse strand
    else if (step2 === 3 * step1) step = 3; // protein-nucleotide
    else throw new ValueError(`unexpected steps ${step1}, ${step2}`);
    if (factor === null) factor = step;
    else if (factor !== step) throw new ValueError("inconsistent step sizes in alignments");
  }
  const own = self.coordinates!;
  const stepsAll = own[0]!.slice(1).map((_, k) => Math.max(...own.map((r) => Math.abs(r[k + 1]! - r[k]!))));
  if (factor === null) throw new TypeError("unsupported operand type(s) for *: 'NoneType' and 'int'");
  let total = 0;
  const first = [0, ...stepsAll.map((s) => (total += s) * factor!)];
  const results: Alignment[] = [];
  for (let i = 0; i < list.length; i++) {
    const second = own[i]!.map((v) => factor! * v);
    const sequences = [new Seq(null, first[first.length - 1]!), new Seq(null, second[second.length - 1]!)];
    const alignment1 = make(sequences, [first, second]);
    const coordinates2 = list[i]!.coordinates!.map((r) => [...r]);
    coordinates2[0] = coordinates2[0]!.map((v) => v * factor!);
    const alignment2 = make([sequences[1], list[i]!.sequences[1]], coordinates2);
    results.push(mapAlignment(alignment1, alignment2, make));
  }
  const coordinates: number[][] = results.map(() => []);
  let previous = 0;
  let done = false;
  const cols = results.map((a) => a.coordinates!.map((r) => [...r]));
  while (!done) {
    done = true;
    const live = cols.filter((c) => c.length > 0 && c[0]!.length > 0);
    if (live.length === 0) throw new ValueError("min() iterable argument is empty");
    const position = Math.min(...live.map((c) => c[0]![0]!));
    cols.forEach((c, i) => {
      if (c.length === 0 || c[0]!.length === 0) {
        if (coordinates[i]!.length === 0) throw new IndexError("list index out of range");
        coordinates[i]!.push(coordinates[i]![coordinates[i]!.length - 1]!);
      } else if (c[0]![0] === position) {
        coordinates[i]!.push(c[1]![0]!);
        c[0]!.shift();
        c[1]!.shift();
        if (c.some((r) => r.some((v) => v !== 0))) done = false;
      } else if (c[0]![0]! > position) {
        if (coordinates[i]!.length) {
          const step = c[1]![0]! > coordinates[i]![coordinates[i]!.length - 1]! ? position - previous : 0;
          coordinates[i]!.push(coordinates[i]![coordinates[i]!.length - 1]! + step);
        } else coordinates[i]!.push(c[1]![0]!);
      } else throw new Error("");
    });
    previous = position;
  }
  return make(results.map((a) => a.sequences[1]), coordinates);
}
