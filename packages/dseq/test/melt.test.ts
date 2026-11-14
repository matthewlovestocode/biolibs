/**
 * Replays the melting golden cases (reference/golden/gen_dseqmelt_cases.py).
 *
 * For each molecule and each temperature the case records the sites both searches find, what shedding
 * the single strands leaves, how the melting cuts are widened, and every piece the molecule falls into.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type CutSite, Dseq, getCutsitePairs, getDsMeltsites, getSsMeltsites, melt, meltSsDna,
  shiftMeltCutsitePairs } from "@biolibs/dseq";

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
interface Round {
  length: number;
  ss_sites: Guarded<number[][][]>;
  ds_sites: Guarded<EncodedCut[]>;
  shed: Guarded<{ rest: Snapshot; strands: Snapshot[] }>;
  pairs: Guarded<(EncodedCut | null)[][]>;
  melted: Guarded<Snapshot[]>;
}
interface Case {
  data: string;
  circular: boolean;
  lengths: number[];
  snap?: Snapshot;
  rounds?: Round[];
  exc?: { type: string; msg: string };
}

const cases: Case[] = JSON.parse(readFileSync(new URL("./golden/dseq-melt.json", import.meta.url), "utf8"));

/** @param d - A molecule. @returns Enough of it to pin it down, in the generator's shape. */
const snap = (d: Dseq): Snapshot => ({
  data: d.code, watson: d.watson, crick: d.crick, len: d.length, ovhg: d.ovhg, right_ovhg: d.rightOvhg,
  str: d.toString(), circular: d.circular,
});

/** @param c - A cut site, or null. @returns It in the generator's shape. */
const encCut = (c: CutSite | null): EncodedCut | null =>
  c === null ? null : { watson: c.watson, ovhg: c.ovhg, enzyme: c.enzyme === null ? null : c.enzyme.name };

/**
 * Compare one recorded value with what the port gives, whichever of the two is an error.
 *
 * @param want - What the generator recorded. @param run - How to get the port's answer.
 * @param where - What is being compared.
 */
function same<T>(want: Guarded<T>, run: () => T, where: string): void {
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

describe("pydna.dseq.Dseq: melting", () => {
  cases.forEach((c, index) => {
    it(`${index} ${c.circular ? "circular" : "linear"} ${JSON.stringify(c.data)}`, () => {
      if (c.exc) {
        let err: { name?: string; message?: string } = {};
        try { new Dseq(c.data, null, null, c.circular); } catch (e) { err = e as Error; }
        expect(err.name, "exception type").toBe(c.exc.type);
        expect(err.message).toBe(c.exc.msg);
        return;
      }
      const d = new Dseq(c.data, null, null, c.circular);
      expect(snap(d), "molecule").toEqual(c.snap);
      c.rounds!.forEach(({ length, ss_sites, ds_sites, shed, pairs, melted }) => {
        const at = `length ${length}`;
        same(ss_sites, () => getSsMeltsites(d, length).map((side) => side.map(([a, b]) => [a, b])), `${at} ss sites`);
        same(ds_sites, () => getDsMeltsites(d, length).map((cut) => encCut(cut)!), `${at} ds sites`);
        same(shed, () => {
          const [rest, strands] = meltSsDna(d, length);
          return { rest: snap(rest), strands: strands.map(snap) };
        }, `${at} shed`);
        same(pairs, () => {
          const [rest] = meltSsDna(d, length);
          return shiftMeltCutsitePairs(d, getCutsitePairs(d, getDsMeltsites(rest, length)))
            .map(([a, b]) => [encCut(a), encCut(b)]);
        }, `${at} pairs`);
        same(melted, () => melt(d, length).map(snap), `${at} melted`);
      });
    });
  });
});
