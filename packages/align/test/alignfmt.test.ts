/** Replays Bio.Align file-format golden cases (reference/golden/gen_alignfmt_cases.py). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Alignment, AutoSQLTable, type BigBedIterator, ByteWriter, MultipleSeqAlignment, NumpyArray, PyFloatValue, SummaryInfo, parse, read, write } from "@biolibs/align";
import { captureWarnings, pyStr } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { Location, SeqFeature, type SimpleLocation } from "@biolibs/seqfeature";

type Spec = { recann?: (Record<string, unknown> | null)[]; qann?: Record<string, unknown>; tann?: Record<string, unknown>; qletter?: number[]; seqs?: string[]; coords?: number[][]; undef?: boolean[]; plain?: boolean[]; extra?: Record<string, number | string>; ann?: Record<string, unknown>; ops?: string; recinfo?: { desc?: string | null; dbx?: string[]; ann?: Record<string, unknown>; letter?: Record<string, string> }[]; ids: string[]; rows: string[]; colann?: Record<string, string>; mol?: string; mols?: (string | null)[] };
interface Case { args?: unknown[]; kwargs?: Record<string, unknown>; rows?: string[]; ids?: string[]; cols?: number[]; wmsg?: string[]; wtext?: string[]; warnings?: string[]; kind: string; fmt: string; text?: string; data?: string; bed?: string; targets?: [string, number][]; opts?: Record<string, unknown>; bytes?: boolean; no_targets?: boolean; source?: string; add_cds?: string; queries?: [string | null, number | null, number | null][]; aln?: Spec; alns?: Spec[]; result?: any; exc?: { type: string; msg: string | null } }
/** Python keyword arguments to the positional arguments of each writer. */
const WRITER_PARAMS: Record<string, [string, unknown][]> = { nexus: [["interleave", null]], psl: [["header", true], ["mask", null], ["wildcard", "N"]], bed: [["bedN", 12]], sam: [["md", false]], exonerate: [["fmt", "vulgar"]], mauve: [["metadata", null], ["identifiers", null]] };
const kwargArgs = (c: Case): unknown[] => {
  if (c.args) return c.args;
  if (!c.kwargs) return [];
  const params = WRITER_PARAMS[c.fmt.toLowerCase()] ?? [];
  const last = params.reduce((m, [k], i) => (k in c.kwargs! ? i : m), -1);
  return params.slice(0, last + 1).map(([k, d]) => (k in c.kwargs! ? c.kwargs![k] : d));
};
const cases: Case[] = JSON.parse(readFileSync(new URL("./golden/alignfmt.json", import.meta.url), "utf8"));

const seqText = (q: any): unknown => {
  if (q === null) return null;
  if (q.defined === undefined || q.defined) return String(q);
  return { len: q.length, defined: q.definedRanges.map(([a, b]: [number, number]) => [a, b, String(q.slice(a, b))]) };
};
const EXTRA_NAMES = ["matches", "misMatches", "repMatches", "nCount", "score", "thickStart", "thickEnd", "itemRgb", "flag", "mapq", "rnext", "pnext", "tlen", "hardClipLeft", "hardClipRight"] as const;
const PY_NAMES: Record<string, string> = { hardClipLeft: "hard_clip_left", hardClipRight: "hard_clip_right" };
const tagged = (v: unknown): unknown => {
  if (v instanceof PyFloatValue) return ["float", v.value];
  if (v instanceof NumpyArray) return ["np", [...v]];
  if (v instanceof Uint8Array) return ["bytes", [...v]];
  if (typeof v === "number") return ["int", v];
  if (typeof v === "string") return ["str", v];
  return ["other", String(v)];
};
const enc = (a: Alignment) => {
  const d: any = {
    ids: a.sequences.map((s) => (s instanceof SeqRecord ? s.id : null)),
    rows: Array.from({ length: a.size }, (_, i) => { try { return a.get(i); } catch (e: any) { return { err: [e.name, e.message] }; } }),
    coords: a.coordinates,
    seqs: a.sequences.map((s) => seqText(s instanceof SeqRecord ? s.seq : s)),
    dbx: a.sequences.map((s) => (s instanceof SeqRecord ? [...s.dbxrefs] : [])),
    rann: a.sequences.map((s) => (s instanceof SeqRecord ? Object.fromEntries(s.annotations) : {})),
    lann: a.sequences.map((s) => (s instanceof SeqRecord ? Object.fromEntries(s.letterAnnotations) : {})),
    ...(a.operations !== undefined ? { ops: new TextDecoder().decode(a.operations) } : {}),
    feat: a.sequences.map((s) => (s instanceof SeqRecord ? s.features.map((f) => [f.type, String(f.location), Object.fromEntries(f.qualifiers)]) : [])),
    ...(EXTRA_NAMES.some((k) => a[k] !== undefined) ? { extra: Object.fromEntries(EXTRA_NAMES.filter((k) => a[k] !== undefined).map((k) => [PY_NAMES[k] ?? k, a[k]])) } : {}),
    ...(a.flag !== undefined && a.annotations !== undefined && a.annotations.size > 0 ? { sann: Object.fromEntries([...a.annotations].map(([k, v]) => [k, tagged(v)])) } : {}),
    names: a.sequences.map((s) => (s instanceof SeqRecord ? s.name : null)),
    descs: a.sequences.map((s) => (s instanceof SeqRecord ? s.description : null)),
    weights: a.sequences.map((s) => (s instanceof SeqRecord && s.annotations.has("weight") ? s.annotations.get("weight") : null)),
  };
  if (a.annotations !== undefined && a.annotations.size > 0) d.ann = Object.fromEntries([...a.annotations].map(([k, v]) => [k, k === "empty" ? (v as [SeqRecord, number[], string][]).map((e) => [e[0].id, e[0].seq!.length, e[1], e[2]]) : v instanceof PyFloatValue ? v.value : v instanceof NumpyArray || v instanceof Uint8Array ? [...v] : v]));
  if (a.columnAnnotations !== undefined) d.colann = Object.fromEntries(a.columnAnnotations);
  return d;
};
const build = (spec: Spec): Alignment => {
  if (spec.seqs !== undefined) {
    const recs = spec.seqs.map((q, i) => {
      const seq = spec.undef?.[i] ? new Seq(null, q.length) : new Seq(q);
      return spec.plain?.[i] ? seq : new SeqRecord(seq, spec.ids[i]!);
    });
    const aln = new Alignment(recs, spec.coords!);
    Object.assign(aln, spec.extra ?? {});
    (spec.recann ?? []).forEach((info, i) => { const r = recs[i]; if (r instanceof SeqRecord) for (const [k, v] of Object.entries(info ?? {})) r.annotations.set(k, v); });
    if (spec.ann !== undefined) aln.annotations = new Map(Object.entries(spec.ann).map(([k, v]) => k === "empty" ? [k, (v as { id: string; len: number; segment: [number, number]; status: string }[]).map((e) => [new SeqRecord(new Seq(null, e.len), e.id), e.segment, e.status])] : [k, v !== null && typeof v === "object" && "float" in (v as object) ? new PyFloatValue((v as { float: number }).float) : v]));
    const [t, q] = recs;
    if (t instanceof SeqRecord) for (const [k, v] of Object.entries(spec.tann ?? {})) t.annotations.set(k, v);
    if (q instanceof SeqRecord) {
      for (const [k, v] of Object.entries(spec.qann ?? {})) q.annotations.set(k, v);
      if (spec.qletter) q.letterAnnotations.set("phred_quality", [...spec.qletter]);
    }
    if (spec.ops !== undefined) aln.operations = new TextEncoder().encode(spec.ops);
    return aln;
  }
  const parsed = Alignment.parsePrintedAlignment(spec.rows.map((r) => new TextEncoder().encode(r)));
  const recs = parsed.sequences.map((s, i) => new SeqRecord(new Seq(new TextDecoder().decode(s)), spec.ids[i]!));
  const a = new Alignment(recs, parsed.coordinates);
  if (spec.mol) for (const r of recs) r.annotations.set("molecule_type", spec.mol);
  if (spec.mols) spec.mols.forEach((m, i) => { if (m !== null) recs[i]!.annotations.set("molecule_type", m); });
  (spec.recinfo ?? []).forEach((info, i) => {
    const r = recs[i]!;
    if (info.desc !== undefined && info.desc !== null) r.description = info.desc;
    if (info.dbx && info.dbx.length > 0) r.dbxrefs = [...info.dbx];
    for (const [k, v] of Object.entries(info.ann ?? {})) r.annotations.set(k, v);
    for (const [k, v] of Object.entries(info.letter ?? {})) r.letterAnnotations.set(k, v);
  });
  if (spec.ann !== undefined) a.annotations = new Map(Object.entries(spec.ann));
  if (spec.ops !== undefined) a.operations = new TextEncoder().encode(spec.ops);
  if (spec.colann && Object.keys(spec.colann).length > 0) a.columnAnnotations = new Map(Object.entries(spec.colann));
  return a;
};

/** Bytes from the hex a bigBed case carries its file as. */
const bytesFromHex = (hex: string): Uint8Array =>
  Uint8Array.from({ length: hex.length / 2 }, (_, i) => Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16));

describe("Bio.Align file formats", () => {
  cases.forEach((c, n) => {
    it(`${n} ${c.kind} ${c.fmt ?? ""}`, () => {
      const run0 = (): unknown => {
        if (c.kind === "parse") {
          const it = parse(c.text!, c.fmt);
          const alns = Array.from(it).map(enc);
          const tg = (it as { targets?: SeqRecord[] }).targets;
          const ids = (it as { identifiers?: string[] }).identifiers;
          return { ...(ids !== undefined ? { identifiers: ids } : {}), ...(tg !== undefined ? { targets: tg.map((t) => [t.id, t.seq!.length, t.description, Object.fromEntries(t.annotations)]) } : {}), alns, metadata: (it as { metadata?: Record<string, unknown> }).metadata === undefined ? null : Object.fromEntries(Object.entries((it as any).metadata).map(([k, v]) => [k, pyStr(v)])) };
        }
        if (c.kind === "rewrite") {
          let text = "";
          const nw = write(parse(c.text!, c.fmt), { write: (t: string) => { text += t; } }, c.fmt, ...kwargArgs(c));
          return { text, n: nw };
        }
        if (c.kind === "roundtrip") return Array.from(parse(c.text!, c.fmt)).map((a) => a.format(c.fmt));
        if (c.kind === "read") return { alns: [enc(read(c.text!, c.fmt))] };
        if (c.kind === "alninfo") {
          const info = new SummaryInfo(new MultipleSeqAlignment(c.rows!.map((r, i) => new SeqRecord(new Seq(r), c.ids![i]!))));
          return { ic: info.icVector, cols: c.cols!.map((col) => { try { return { v: info.getColumn(col) }; } catch (e: any) { return { exc: [e.name, e.message] }; } }) };
        }
        if (c.kind === "format") return build(c.aln!).format(c.fmt);
        if (c.kind === "bbparse") {
          const it = parse(bytesFromHex(c.data!), c.fmt) as unknown as BigBedIterator;
          const alns = Array.from(it as Iterable<Alignment>).map(enc);
          return { alns, metadata: null, len: it.length, declaration: it.declaration.toString(), bedN: it.bedN,
            targets: it.targets.map((t) => [t.id, t.seq!.length]),
            fields: it.declaration.fields.map((f) => [f.asType, f.name, f.comment]) };
        }
        if (c.kind === "bigwrite") {
          const alns = [...parse(c.text!, c.source!)];
          if (c.fmt === "bigpsl") for (const a of alns) a.annotations = new Map();
          if (c.add_cds !== undefined) {
            for (const a of alns) {
              const query = a.sequences[1] as SeqRecord;
              const loc = Location.fromstring(c.add_cds, query.seq!.length) as SimpleLocation;
              query.features.push(new SeqFeature(loc, "CDS"));
            }
          }
          const targets = c.targets!.map(([id, length]) => new SeqRecord(new Seq(null, length), id));
          const out = new ByteWriter();
          const n = write(alns, out, c.fmt, { ...c.opts, targets }) as number | undefined;
          const data = out.toBytes();
          const it = parse(data, c.fmt) as unknown as BigBedIterator;
          return {
            n: n === undefined ? null : n,
            size: data.length,
            hex: [...data].map((b) => b.toString(16).padStart(2, "0")).join(""),
            logical: {
              alns: Array.from(it as Iterable<Alignment>).map(enc), len: it.length,
              declaration: it.declaration.toString(),
              targets: it.targets.map((t) => [t.id, t.seq!.length]),
            },
          };
        }
        if (c.kind === "bbwrite") {
          const alns = [...parse(c.bed!, "bed")];
          const targets = c.targets!.map(([id, length]) => new SeqRecord(new Seq(null, length), id));
          const opts: Record<string, unknown> = { ...c.opts };
          if (typeof opts["declaration"] === "string") opts["declaration"] = AutoSQLTable.fromString(opts["declaration"]);
          const out = new ByteWriter();
          // Without `targets` the writer looks for them on the alignments, which a plain array does not have.
          const n = write(alns, out, "bigbed", c.no_targets === true ? opts : { ...opts, targets }) as number | undefined;
          const data = out.toBytes();
          const it = parse(data, "bigbed") as unknown as BigBedIterator;
          // A file whose scores are whole numbers cannot be compared byte for byte, since Python writes those
          // as floats ("100.0"); everything else can, compressed or not.
          const byteExact = c.bytes !== false;
          return {
            n: n === undefined ? null : n,
            size: byteExact ? data.length : null,
            hex: byteExact ? [...data].map((b) => b.toString(16).padStart(2, "0")).join("") : null,
            logical: {
              alns: Array.from(it as Iterable<Alignment>).map(enc), len: it.length, bedN: it.bedN,
              declaration: it.declaration.toString(),
              targets: it.targets.map((t) => [t.id, t.seq!.length]),
            },
          };
        }
        if (c.kind === "bbsearch") {
          const it = parse(bytesFromHex(c.data!), c.fmt) as unknown as BigBedIterator;
          return c.queries!.map(([chrom, start, end]) => {
            try { return { hits: [...it.search(chrom, start, end)].map(enc) }; }
            catch (e: any) { return { exc: { type: e.name, msg: e.message } }; }
          });
        }
        let text = "";
        const nw = write(c.alns!.map(build), { write: (t: string) => { text += t; } }, c.fmt, ...kwargArgs(c));
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
        if ((c.kind === "parse" || c.kind === "bbparse") && got.metadata === null) delete got.metadata;
        const want = typeof c.result === "string" || Array.isArray(c.result) ? c.result : { ...c.result };
        if ((c.kind === "parse" || c.kind === "bbparse") && want.metadata === null) delete want.metadata;
        expect(got).toEqual(want);
        afterwards();
      }
    });
  });
});
