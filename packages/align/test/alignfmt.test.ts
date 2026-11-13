/** Replays Bio.Align file-format golden cases (reference/golden/gen_alignfmt_cases.py). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Alignment, MultipleSeqAlignment, SummaryInfo, parse, read, write } from "@biolibs/align";
import { captureWarnings } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";

type Spec = { ids: string[]; rows: string[]; colann?: Record<string, string> };
interface Case { rows?: string[]; ids?: string[]; cols?: number[]; wmsg?: string[]; wtext?: string[]; warnings?: string[]; kind: string; fmt: string; text?: string; aln?: Spec; alns?: Spec[]; result?: any; exc?: { type: string; msg: string | null } }
const cases: Case[] = JSON.parse(readFileSync(new URL("./golden/alignfmt.json", import.meta.url), "utf8"));

const enc = (a: Alignment) => {
  const d: any = {
    ids: a.sequences.map((s) => (s instanceof SeqRecord ? s.id : null)),
    rows: Array.from({ length: a.size }, (_, i) => a.get(i)),
    coords: a.coordinates,
    seqs: a.sequences.map((s) => String(s instanceof SeqRecord ? s.seq : s)),
    names: a.sequences.map((s) => (s instanceof SeqRecord ? s.name : null)),
    descs: a.sequences.map((s) => (s instanceof SeqRecord ? s.description : null)),
    weights: a.sequences.map((s) => (s instanceof SeqRecord && s.annotations.has("weight") ? s.annotations.get("weight") : null)),
  };
  if (a.columnAnnotations !== undefined) d.colann = Object.fromEntries(a.columnAnnotations);
  return d;
};
const build = (spec: Spec): Alignment => {
  const parsed = Alignment.parsePrintedAlignment(spec.rows.map((r) => new TextEncoder().encode(r)));
  const recs = parsed.sequences.map((s, i) => new SeqRecord(new Seq(new TextDecoder().decode(s)), spec.ids[i]!));
  const a = new Alignment(recs, parsed.coordinates);
  if (spec.colann) a.columnAnnotations = new Map(Object.entries(spec.colann));
  return a;
};

describe("Bio.Align file formats", () => {
  cases.forEach((c, n) => {
    it(`${n} ${c.kind} ${c.fmt ?? ""}`, () => {
      const run0 = (): unknown => {
        if (c.kind === "parse") {
          const it = parse(c.text!, c.fmt);
          const alns = Array.from(it).map(enc);
          return { alns, metadata: (it as { metadata?: Record<string, unknown> }).metadata === undefined ? null : Object.fromEntries(Object.entries((it as any).metadata).map(([k, v]) => [k, String(v)])) };
        }
        if (c.kind === "read") return { alns: [enc(read(c.text!, c.fmt))] };
        if (c.kind === "alninfo") {
          const info = new SummaryInfo(new MultipleSeqAlignment(c.rows!.map((r, i) => new SeqRecord(new Seq(r), c.ids![i]!))));
          return { ic: info.icVector, cols: c.cols!.map((col) => { try { return { v: info.getColumn(col) }; } catch (e: any) { return { exc: [e.name, e.message] }; } }) };
        }
        if (c.kind === "format") return build(c.aln!).format(c.fmt);
        let text = "";
        const nw = write(c.alns!.map(build), { write: (t: string) => { text += t; } }, c.fmt);
        return { text, n: nw };
      };
      let captured: { warnings: { category: string; message: string }[] } = { warnings: [] };
      const run = (): unknown => {
        const r = captureWarnings(run0);
        captured = r;
        if (r.error !== undefined) throw r.error;
        return r.result;
      };
      const afterwards = (): void => {
        expect(captured.warnings.map((w) => w.category)).toEqual(c.warnings);
        if (c.kind !== "alninfo") expect(captured.warnings.filter((w) => w.category === "BiopythonParserWarning").map((w) => w.message)).toEqual(c.wtext);
        else expect(captured.warnings.map((w) => w.message)).toEqual(c.wmsg);
      };
      if (c.exc) {
        let err: any;
        try { run(); } catch (e) { err = e; }
        expect(err, "expected an exception").toBeDefined();
        expect(err.name).toBe(c.exc.type);
        if (c.exc.msg !== null) expect(err.message).toBe(c.exc.msg);
        afterwards();
      } else {
        const got: any = run();
        if (c.kind === "parse" && got.metadata === null) delete got.metadata;
        const want = typeof c.result === "string" ? c.result : { ...c.result };
        if (c.kind === "parse" && want.metadata === null) delete want.metadata;
        expect(got).toEqual(want);
        afterwards();
      }
    });
  });
});
