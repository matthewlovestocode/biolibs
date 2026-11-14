/**
 * Replays Bio.Align.analysis golden cases (reference/golden/gen_analysis_cases.py).
 *
 * The ML method's numbers come out of an L-BFGS-B fit that stops where the likelihood has stopped
 * changing to `ftol`, and whose last bits follow scipy's BLAS rather than the arithmetic (see
 * `packages/align/test/lbfgsb.test.ts`), so its dN and dS are compared to 1e-4 relative — they agree to
 * about 5e-5 — where every other method is compared to 1e-12.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Alignment, analysis } from "@biolibs/align";
import { CodonTable } from "@biolibs/seq";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";

type Json = any;
const cases: Json[] = JSON.parse(readFileSync(new URL("./golden/analysis.json", import.meta.url), "utf8"));
const build = (spec: Json): Alignment => new Alignment(spec.seqs.map((s: string, i: number) => new SeqRecord(new Seq(s), spec.ids[i])), spec.coords);
const dec = (x: Json): number => (x !== null && typeof x === "object" ? (x.f === "nan" ? NaN : x.f === "inf" ? Infinity : -Infinity) : x);
const close = (got: number, want: number, tol = 1e-12, relative = false): void => {
  if (Number.isNaN(want)) expect(got).toBeNaN();
  else if (!Number.isFinite(want)) expect(got).toBe(want);
  // The relative form carries an absolute floor with it: a dN or dS down at 1e-10 is the ML optimizer's
  // own noise, since it stops where the likelihood has stopped changing to 1e-5.
  else expect(Math.abs(got - want)).toBeLessThanOrEqual(relative ? tol * Math.abs(want) + 1e-11 : tol * Math.max(1, Math.abs(want)));
};

describe("Bio.Align.analysis", () => {
  cases.forEach((c, n) => {
    it(`${n} ${c.kind} ${c.method ?? ""}`, () => {
      const run = (): number[] | number => {
        const table = c.table === undefined || c.table === null ? null : (CodonTable.genericById.get(c.table) as never);
        if (c.kind === "dnds") return analysis.calculateDnDs(build(c.aln), c.method, table, c.k ?? 1, c.cfreq ?? null);
        return analysis.mktest(build(c.aln), c.species, table);
      };
      if (c.exc) {
        let err: any;
        try { run(); } catch (e) { err = e; }
        expect(err, "expected an exception").toBeDefined();
        expect(err.name).toBe(c.exc.type);
        if (c.exc.msg !== null) expect(err.message).toBe(c.exc.msg);
      } else {
        const got = run();
        const ml = c.method === "ML";
        if (c.kind === "dnds") (c.result as Json[]).forEach((w, i) => close((got as number[])[i]!, dec(w), ml ? 1e-4 : 1e-12, ml));
        else close(got as number, dec(c.result));
      }
    });
  });
});
