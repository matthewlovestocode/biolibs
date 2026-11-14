/**
 * Replays the Dseq cutting golden cases (reference/golden/gen_dseqcut_cases.py).
 *
 * Every case compares the cut sites pydna finds, how it pairs them up, each fragment that comes out, the
 * ends written as cut sites, the slices cutting a circle depends on, and the cutter counts.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyCut, circularAt, circularFind, circularShifted, circularSlice, cut, cutaround, cuttersBy,
  Dseq, getCutsitePairs, getCutsites, getLeftEndAsCutsite, getRightEndAsCutsite, leftEndPosition,
  replaceWith, rightEndPosition } from "@biolibs/dseq";
import { RestrictionBatch } from "@biolibs/restriction";

interface Snapshot {
  data: string;
  watson: string;
  crick: string;
  len: number;
  ovhg: number | null;
  right_ovhg: number | null;
  str: string;
  circular: boolean;
}
interface EncodedCut { watson: number; ovhg: number | null; enzyme: string | null }
type Guarded<T> = { value: T } | { exc: { type: string; msg: string } };
interface Case {
  data: string;
  circular: boolean;
  enzymes: string[];
  slices: (number | null)[][];
  pairs: number[][];
  snap?: Snapshot;
  cutsites?: Guarded<EncodedCut[]>;
  pairs_out?: Guarded<(EncodedCut | null)[][]>;
  fragments?: Guarded<Snapshot[]>;
  left_end?: Guarded<number[]>;
  right_end?: Guarded<number[]>;
  left_cutsite?: Guarded<EncodedCut>;
  right_cutsite?: Guarded<EncodedCut>;
  slices_out?: Guarded<Snapshot>[];
  applied?: (Guarded<Snapshot> | null)[];
  cutters?: Guarded<string[]>;
  no_cutters?: Guarded<string[]>;
  unique_cutters?: Guarded<string[]>;
  twice_cutters?: Guarded<string[]>;
  three_cutters?: Guarded<string[]>;
  exc?: { type: string; msg: string };
}

/** The batch the recorded cutter counts were taken over. */
const SMALL = ["EcoRI", "BamHI", "HindIII", "SmaI", "PstI", "NotI", "XbaI", "KpnI", "BsaI", "EcoRV"];

/** One case for the circular byte string itself. */
interface CircularCase { data: string; ops: [string, unknown[]][]; ops_out: Guarded<string | number>[] }

const golden = JSON.parse(readFileSync(new URL("./golden/dseq-cut.json", import.meta.url), "utf8")) as
  { cuts: Case[]; circular: CircularCase[] };
const cases: Case[] = golden.cuts;

/** @param d - A molecule. @returns Enough of it to pin it down, in the generator's shape. */
const snap = (d: Dseq): Snapshot => ({
  data: d.code, watson: d.watson, crick: d.crick, len: d.length, ovhg: d.ovhg,
  right_ovhg: d.rightOvhg, str: d.toString(), circular: d.circular,
});

/** @param c - A cut site. @returns It in the generator's shape. */
const encCut = (c: { watson: number; ovhg: number | null; enzyme: { name: string } | null }): EncodedCut =>
  ({ watson: c.watson, ovhg: c.ovhg, enzyme: c.enzyme === null ? null : c.enzyme.name });

/**
 * Compare one recorded value with what the port gives, whichever of the two is an error.
 *
 * @param want - What the generator recorded. @param run - How to get the port's answer.
 * @param where - What is being compared.
 */
function same<T>(want: Guarded<T> | undefined, run: () => T, where: string): void {
  if (want === undefined) return;
  let got: T | undefined;
  let err: Error | undefined;
  try { got = run(); } catch (e) { err = e as Error; }
  if ("exc" in want) {
    expect(err?.name, `${where}: expected ${want.exc.type}`).toBe(want.exc.type);
    expect(err?.message, where).toBe(want.exc.msg);
  } else {
    expect(err, `${where}: ${err?.message ?? ""}`).toBeUndefined();
    expect(got, where).toEqual(want.value);
  }
}

describe("pydna.dseq.CircularBytes", () => {
  golden.circular.forEach((c, index) => {
    it(`${index} ${JSON.stringify(c.data)} (${c.ops.length} operations)`, () => {
      c.ops.forEach(([name, args], i) => {
        const run = (): string | number => {
          const a = args as (number | string | null)[];
          switch (name) {
            case "shifted": return circularShifted(c.data, a[0] as number);
            case "slice": return circularSlice(c.data, a[0] as number, a[1] as number, a[2] as number);
            case "cutaround": return cutaround(c.data, a[0] as number, a[1] as number);
            case "find": return circularFind(c.data, a[0] as string);
            case "replace_with": return replaceWith(c.data, a[0] as number, a[1] as number, a[2] as string);
            case "at": return circularAt(c.data, a[0] as number);
            default: throw new Error(`unknown op ${name}`);
          }
        };
        same(c.ops_out[i], run, `op ${i} ${name}(${JSON.stringify(args)})`);
      });
    });
  });
});

describe("pydna.dseq.Dseq: cutting", () => {
  cases.forEach((c, index) => {
    it(`${index} ${c.circular ? "circular" : "linear"} ${c.enzymes.join("+") || "no enzymes"} (${c.data.length} bp)`, () => {
      const batch = new RestrictionBatch(c.enzymes);
      const enzymes = [...batch];
      const d = new Dseq(c.data, null, null, c.circular);
      expect(snap(d), "molecule").toEqual(c.snap);
      same(c.cutsites, () => getCutsites(d, enzymes).map(encCut), "cutsites");
      same(c.pairs_out, () => getCutsitePairs(d, getCutsites(d, enzymes))
        .map(([a, b]) => [a === null ? null : encCut(a), b === null ? null : encCut(b)]), "pairs");
      same(c.fragments, () => cut(d, enzymes).map(snap), "fragments");
      same(c.left_end, () => leftEndPosition(d), "left end");
      same(c.right_end, () => rightEndPosition(d), "right end");
      same(c.left_cutsite, () => encCut(getLeftEndAsCutsite(d)), "left end as a cut");
      same(c.right_cutsite, () => encCut(getRightEndAsCutsite(d)), "right end as a cut");
      c.slices.forEach(([start, stop, step], i) => {
        same(c.slices_out?.[i], () => snap(d.slice(start, stop, step)), `slice ${i}`);
      });
      const sites = getCutsites(d, enzymes);
      c.pairs.forEach(([i, j], n) => {
        const want = c.applied![n];
        if (want === null) return;
        same(want, () => snap(applyCut(d, sites[i!]!, sites[j!]!)), `applied ${n}`);
      });
      const names = (b: RestrictionBatch): string[] => [...b].map((e) => e.name).sort();
      const small = new RestrictionBatch(SMALL);
      same(c.cutters, () => names(cuttersBy(d, small, null)), "cutters");
      same(c.no_cutters, () => names(cuttersBy(d, small, 0)), "no cutters");
      same(c.unique_cutters, () => names(cuttersBy(d, small, 1)), "unique cutters");
      same(c.twice_cutters, () => names(cuttersBy(d, small, 2)), "twice cutters");
      same(c.three_cutters, () => names(cuttersBy(d, small, 3)), "three cutters");
    });
  });
});
