/** Replays Bio.Align.analysis.calculate_dn_ds_matrix golden cases (reference/golden/gen_analysis_cases.py). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Alignment } from "@biolibs/align";
import { PyFloat } from "@biolibs/core";
import { CodonTable, Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { TreeConstruction as TC } from "@biolibs/phylo";

type Json = any;
const cases: Json[] = JSON.parse(readFileSync(new URL("./golden/dnds-matrix.json", import.meta.url), "utf8"));
const build = (spec: Json): Alignment => new Alignment(spec.seqs.map((s: string, i: number) => new SeqRecord(new Seq(s), spec.ids[i])), spec.coords);
const tag = (v: TC.PyNum): Json => (v instanceof PyFloat ? ["f", v.value] : Number.isInteger(v) ? ["i", v] : ["f", v]);

describe("calculate_dn_ds_matrix", () => {
  cases.forEach((c, n) => {
    it(`${n} ${c.method}`, () => {
      const run = (): Json => {
        const table = c.table === undefined ? null : (CodonTable.genericById.get(c.table) as never);
        const [dn, ds] = TC.calculateDnDsMatrix(build(c.aln), c.method, table);
        return [dn, ds].map((m) => ({ names: [...m.names], matrix: m.matrix.map((r) => r.map(tag)), str: m.toString() }));
      };
      if (c.exc) {
        let err: any;
        try { run(); } catch (e) { err = e; }
        expect(err).toBeDefined();
        expect(err.name).toBe(c.exc.type);
        if (c.exc.msg !== null) expect(err.message).toBe(c.exc.msg);
      } else {
        const got = run();
        got.forEach((m: Json, k: number) => {
          expect(m.names).toEqual(c.result[k].names);
          m.matrix.forEach((row: Json[], i: number) => row.forEach((v, j) => {
            const w = c.result[k].matrix[i][j];
            expect(v[0], `type at ${i},${j}`).toBe(w[0]);
            expect(Math.abs(v[1] - w[1])).toBeLessThanOrEqual(1e-12 * Math.max(1, Math.abs(w[1])));
          }));
        });
      }
    });
  });
});
