/** Replays Bio.Align.analysis golden cases (reference/golden/gen_analysis_cases.py). */
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
const close = (got: number, want: number): void => {
  if (Number.isNaN(want)) expect(got).toBeNaN();
  else if (!Number.isFinite(want)) expect(got).toBe(want);
  else expect(Math.abs(got - want)).toBeLessThanOrEqual(1e-12 * Math.max(1, Math.abs(want)));
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
        if (c.kind === "dnds") (c.result as Json[]).forEach((w, i) => close((got as number[])[i]!, dec(w)));
        else close(got as number, dec(c.result));
      }
    });
  });
});
