/**
 * Replays Bio.SeqIO golden cases (reference/golden/gen_seqio_cases.py) against the TypeScript port.
 * A parse case records the records produced before any error, then the error.
 */
import { captureWarnings } from "@biolibs/core";
import * as SeqIO from "@biolibs/seqio";
import {
  FastaTwoLineWriter, FastaWriter, FastqIlluminaWriter, FastqPhredWriter, FastqSolexaWriter, LineStream, PirWriter, QualPhredWriter, StringHandle,
  convert, fastaTwoLineParser, fastqGeneralIterator, pairedFastaQualIterator, parse, read, simpleFastaParser, toDict, write,
} from "@biolibs/seqio";
import { dec, enc } from "../../seqrecord/test/golden-runner";

type J = null | boolean | number | string | { [k: string]: unknown };

export interface Case {
  kind: string; format?: string | number | null; text?: string; bytes?: string; out?: string; molecule_type?: string | null;
  records?: unknown[]; record?: unknown; cls?: string; fasta?: string; qual?: string; fn?: string; args?: unknown[]; parser?: string; single?: boolean; bad_handle?: string;
  exc?: { type: string; msg: string | null }; warnings: string[];
  result?: J; count?: number; text_out?: string; pairs?: J[]; keys?: string[];
}

const WRITERS: Record<string, any> = { FastaWriter, FastaTwoLineWriter, QualPhredWriter, FastqPhredWriter, FastqSolexaWriter, FastqIlluminaWriter, PirWriter };
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** Outcome as recorded by Python, so the two can be compared field by field. */
export interface Outcome {
  parsed?: J[]; result?: J; count?: number; text_out?: string; keys?: string[]; pairs?: J[];
  exc?: { type: string; msg: string }; warnings: string[];
}

function source(c: Case): unknown {
  return c.bytes !== undefined ? Uint8Array.from(c.bytes, (ch) => ch.charCodeAt(0)) : c.text;
}

/** Run one case; mirrors `run` in gen_seqio_cases.py. */
export function runCase(c: Case): Outcome {
  const out: Outcome = { warnings: [] };
  const cap = captureWarnings(() => {
    switch (c.kind) {
      case "parse": {
        const recs: J[] = [];
        out.parsed = recs;
        for (const r of parse(source(c), c.format as string)) recs.push(enc(r));
        break;
      }
      case "read": out.result = enc(read(source(c), c.format as string)); break;
      case "write":
      case "writer": {
        const h = new StringHandle();
        const recs = c.records!.map(dec);
        try {
          if (c.kind === "write") {
            const target: any = c.bad_handle === "handle_record" ? recs[0] : c.bad_handle === "handle_list" ? [] : h;
            out.count = write(c.single ? recs[0] : recs, target, c.format as string);
          } else {
            out.count = new WRITERS[c.cls!](h, ...(c.args ?? [])).writeFile(recs);
          }
        } finally {
          out.text_out = h.getvalue();
        }
        break;
      }
      case "format": out.result = dec(c.record).format(c.format); break;
      case "to_dict": out.keys = [...toDict(c.records!.map(dec)).keys()]; break;
      case "convert": {
        const h = new StringHandle();
        try {
          out.count = convert(source(c), c.format as string, h, c.out!, c.molecule_type ?? null);
        } finally {
          out.text_out = h.getvalue();
        }
        break;
      }
      case "fastq_general": {
        const items: J[] = [];
        out.pairs = items;
        for (const triple of fastqGeneralIterator(source(c))) items.push(triple);
        break;
      }
      case "paired": {
        const recs: J[] = [];
        out.parsed = recs;
        for (const r of pairedFastaQualIterator(c.fasta, c.qual)) recs.push(enc(r));
        break;
      }
      case "func": out.result = (SeqIO as any)[camel(c.fn!)](...(c.args ?? [])) as J; break;
      case "simple_parser": {
        const items: J[] = [];
        out.pairs = items;
        const fn = c.parser === "simple" ? simpleFastaParser : fastaTwoLineParser;
        for (const pair of fn(new LineStream(c.text!))) items.push(pair);
        break;
      }
      default: throw new Error(`unknown kind ${c.kind}`);
    }
  });
  out.warnings = cap.warnings.map((w) => w.message);
  if (cap.error !== undefined) out.exc = { type: (cap.error as Error).name, msg: (cap.error as Error).message };
  return out;
}

/** First difference between Python's recorded outcome and ours, or null. */
export function diff(c: Case & Record<string, any>, got: Outcome): string | null {
  const want = c;
  for (const key of ["parsed", "result", "count", "keys", "pairs", "text_out"] as const) {
    if (key in want || key in got) {
      if (JSON.stringify(want[key]) !== JSON.stringify((got as any)[key])) return `${key}: expected ${JSON.stringify(want[key])}, got ${JSON.stringify((got as any)[key])}`;
    }
  }
  const wantExc = want.exc?.type === "AttributeError" ? { type: "TypeError", msg: null } : want.exc;
  if (wantExc) {
    if (!got.exc) return `expected ${wantExc.type}: ${wantExc.msg}, got no error`;
    if (wantExc.type !== got.exc.type) return `expected ${wantExc.type}: ${wantExc.msg}, got ${got.exc.type}: ${got.exc.msg}`;
    if (wantExc.msg !== null && wantExc.msg !== got.exc.msg) return `message: expected ${JSON.stringify(wantExc.msg)}, got ${JSON.stringify(got.exc.msg)}`;
  } else if (got.exc) {
    return `expected success, got ${got.exc.type}: ${got.exc.msg}`;
  }
  if (JSON.stringify(want.warnings) !== JSON.stringify(got.warnings)) return `warnings: expected ${JSON.stringify(want.warnings)}, got ${JSON.stringify(got.warnings)}`;
  return null;
}
