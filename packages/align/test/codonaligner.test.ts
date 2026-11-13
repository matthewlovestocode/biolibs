/** Replays Bio.Align.CodonAligner golden cases (reference/golden/gen_codonaligner_cases.py). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CodonAligner } from "@biolibs/align";
import { CodonTable, MutableSeq, Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";

type Exc = { type: string; msg: string | null };
interface Case { kind: string; a?: [string, string]; b?: [string, string]; settings?: [string, unknown][]; table?: number | string; names?: string[]; result?: any; exc?: Exc }
const cases: Case[] = JSON.parse(readFileSync(new URL("./golden/codonaligner.json", import.meta.url), "utf8"));

const mk = ([kind, text]: [string, string]): unknown => {
  switch (kind) {
    case "str": return text;
    case "seq": return new Seq(text);
    case "mut": return new MutableSeq(text);
    case "rec": return new SeqRecord(new Seq(text), "x");
    case "list": return Array.from(text);
    case "int": return 5;
  }
  throw new Error(kind);
};
const camel = (s: string): string => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const NAMES: Record<string, string> = { match: "match", mismatch: "mismatch" };

describe("Bio.Align.CodonAligner", () => {
  cases.forEach((c, n) => {
    it(`${n} ${c.kind}`, () => {
      const run = (): unknown => {
        const aligner = c.table === "bad" ? new CodonAligner("not a table") : new CodonAligner(c.table === undefined ? null : CodonTable.genericById.get(c.table as number));
        for (const [name, value] of c.settings ?? []) (aligner as any)[NAMES[name] ?? camel(name)] = value;
        switch (c.kind) {
          case "score": return aligner.score(mk(c.a!), mk(c.b!));
          case "align": {
            const al = aligner.align(mk(c.a!), mk(c.b!));
            const paths: number[][][] = [];
            for (let i = 0; i < 60; i++) { const a = al.next(); if (a === null) break; paths.push(a.coordinates!); }
            return { score: al.score, n: Number(al.length), paths };
          }
          case "str": return [aligner.toString(), aligner.repr()];
          default: return c.names!.map((name) => (aligner as any)[NAMES[name] ?? camel(name)]);
        }
      };
      if (c.exc) {
        let err: any;
        try { run(); } catch (e) { err = e; }
        expect(err, "expected an exception").toBeDefined();
        expect(err.name).toBe(c.exc.type);
        if (c.exc.msg !== null) expect(err.message).toBe(c.exc.msg);
      } else expect(run()).toEqual(c.result);
    });
  });
});
