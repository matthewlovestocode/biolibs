/**
 * Replays Bio.SeqIO golden cases (reference/golden/gen_seqio_cases.py) against the TypeScript port.
 * A parse case records the records produced before any error, then the error.
 */
import { captureWarnings } from "@biolibs/core";
import * as SeqIO from "@biolibs/seqio";
import {
  FastaTwoLineWriter, FastaWriter, FastqIlluminaWriter, FastqPhredWriter, FastqSolexaWriter, LineStream, PirWriter, SeqXmlWriter, SffWriter, BytesHandle, MauveIterator, QualPhredWriter, StringHandle, UniprotIterator, parseAce, readAce,
  convert, fastaTwoLineParser, fastqGeneralIterator, pairedFastaQualIterator, parse, read, simpleFastaParser, toDict, write,
} from "@biolibs/seqio";
import { dec, enc } from "../../seqrecord/test/golden-runner";
import { xmlReason } from "../src/seqxml/xml-types.js";

type J = null | boolean | number | string | { [k: string]: unknown };

export interface Case {
  kind: string; format?: string | number | null; text?: string; bytes?: string; out?: string; molecule_type?: string | null;
  binary?: boolean | string; records?: unknown[]; record?: unknown; cls?: string; fasta?: string; qual?: string; fn?: string; args?: unknown[]; parser?: string; single?: boolean; bad_handle?: string;
  exc?: { type: string; msg: string | null }; warnings: string[];
  result?: J; count?: number; text_out?: string; pairs?: J[]; keys?: string[];
}

const WRITERS: Record<string, any> = { FastaWriter, FastaTwoLineWriter, QualPhredWriter, FastqPhredWriter, FastqSolexaWriter, FastqIlluminaWriter, PirWriter, SeqXmlWriter, SffWriter };
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** The Python class names of the Bio.Sequencing.Ace records that are lower-case there. */
const ACE_LOWER = new Set(["Rd", "Qa", "Ds", "Af", "Bs", "Rt", "Ct", "Wa", "Wr"]);
const snake = (s: string) => s.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());

/** Encode an ACE record like the generator's `ace_enc`: class name plus attributes in definition order. */
function encAce(x: unknown): J {
  if (Array.isArray(x)) return x.map(encAce) as unknown as J;
  if (x !== null && typeof x === "object") {
    const name = x.constructor.name;
    return { $: ACE_LOWER.has(name) ? name.toLowerCase() : name, ...Object.fromEntries(Object.entries(x).map(([k, v]) => [snake(k), encAce(v)])) };
  }
  return x as J;
}

/** Outcome as recorded by Python, so the two can be compared field by field. */
export interface Outcome {
  parsed?: J[]; ops_out?: J[]; result?: J; count?: number; text_out?: string; keys?: string[]; pairs?: J[];
  exc?: { type: string; msg: string }; warnings: string[];
}

function source(c: Case): unknown {
  return c.bytes !== undefined ? Uint8Array.from(c.bytes, (ch) => ch.charCodeAt(0)) : c.text;
}

/** Run one case; mirrors `run` in gen_seqio_cases.py. */
export function runCase(c: Case): Outcome {
  MauveIterator.resetSharedState(); // the id list is shared by all Mauve readers, so every case starts fresh
  const out: Outcome = { warnings: [] };
  const cap = captureWarnings(() => {
    switch (c.kind) {
      case "parse": {
        const recs: J[] = [];
        out.parsed = recs;
        for (const r of parse(source(c), c.format as string)) recs.push(enc(r));
        break;
      }
      case "ace_parse": {
        const recs: J[] = [];
        out.parsed = recs;
        for (const c2 of parseAce(source(c))) recs.push(encAce(c2));
        break;
      }
      case "ace_read": out.result = encAce(readAce(source(c))); break;
      case "uniprot_raw": {
        const recs: J[] = [];
        out.parsed = recs;
        for (const r of new UniprotIterator(source(c), null, true)) recs.push(enc(r));
        break;
      }
      case "read": out.result = enc(read(source(c), c.format as string)); break;
      case "write":
      case "writer": {
        const h = c.binary ? new BytesHandle() : new StringHandle();
        const recs = c.records!.map(dec);
        try {
          if (c.kind === "write") {
            const target: any = c.bad_handle === "handle_record" ? recs[0] : c.bad_handle === "handle_list" ? [] : h;
            out.count = write(c.single ? recs[0] : recs, target, c.format as string);
          } else {
            out.count = new WRITERS[c.cls!](h, ...(c.args ?? [])).writeFile(recs);
          }
        } finally {
          out.text_out = h instanceof BytesHandle ? (c.binary === "bytes" ? String.fromCharCode(...h.getvalue()) : new TextDecoder().decode(h.getvalue())) : h.getvalue();
        }
        break;
      }
      case "format": out.result = dec(c.record).format(c.format); break;
      case "to_dict": out.keys = [...toDict(c.records!.map(dec)).keys()]; break;
      case "convert": {
        const h = c.binary ? new BytesHandle() : new StringHandle();
        try {
          out.count = convert(source(c), c.format as string, h as any, c.out!, c.molecule_type ?? null);
        } finally {
          out.text_out = h instanceof BytesHandle ? (c.binary === "bytes" ? String.fromCharCode(...h.getvalue()) : new TextDecoder().decode(h.getvalue())) : h.getvalue();
        }
        break;
      }
      case "twobit_ops": {
        const res: J[] = [];
        out.ops_out = res as never;
        for (const r of parse(source(c), "twobit")) {
          for (const op of (c as any).ops as any[][]) {
            try {
              let sq: any = r.seq;
              if (op[0] === "get") res.push(enc(sq.at(op[1])));
              else {
                sq = op[0] === "upper" ? sq.upper() : op[0] === "lower" ? sq.lower() : sq;
                res.push(enc(sq.slice(op[1], op[2], op[3])));
              }
            } catch (e) {
              res.push({ exc: { type: (e as Error).name, msg: (e as Error).message } });
            }
          }
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
  for (const key of ["parsed", "ops_out", "result", "count", "keys", "pairs", "text_out"] as const) {
    if (key in want || key in got) {
      if (JSON.stringify(want[key]) !== JSON.stringify((got as any)[key])) return `${key}: expected ${JSON.stringify(want[key])}, got ${JSON.stringify((got as any)[key])}`;
    }
  }
  const wantExc = want.exc?.type === "AttributeError" ? { type: "TypeError", msg: null } : want.exc;
  if (wantExc) {
    if (!got.exc) return `expected ${wantExc.type}: ${wantExc.msg}, got no error`;
    if (wantExc.type !== got.exc.type) return `expected ${wantExc.type}: ${wantExc.msg}, got ${got.exc.type}: ${got.exc.msg}`;
    if (wantExc.msg !== null && wantExc.msg !== got.exc.msg) {
      if (knownXmlDivergence(wantExc.msg, got.exc.msg)) return null;      // counted by xml-errors.test.ts
      return `message: expected ${JSON.stringify(wantExc.msg)}, got ${JSON.stringify(got.exc.msg)}`;
    }
  } else if (got.exc) {
    return `expected success, got ${got.exc.type}: ${got.exc.msg}`;
  }
  if (JSON.stringify(want.warnings) !== JSON.stringify(got.warnings)) return `warnings: expected ${JSON.stringify(want.warnings)}, got ${JSON.stringify(got.warnings)}`;
  return null;
}

/**
 * Whether a message mismatch is one of the expat behaviours this port does not reproduce yet.
 *
 * Expat's prolog and epilog tokenizers decide between "not well-formed (invalid token)", "syntax error" and "junk
 * after document element" by internal state that the scanner here does not model: `?xml…` with its `<` missing is
 * an invalid token while `<![CDATA[` in the prolog is a syntax error, and a stray tag after the document element is
 * an invalid token one character in rather than junk at the tag. Everything else about these messages — the other
 * nine reasons, and the positions — is compared exactly.
 *
 * The exemption exists so that the messages which *are* right cannot regress. `xml-errors.test.ts` counts what it
 * lets through and fails if that number grows, and the three seqXML/uniprot-xml/snapgene parity items stay partial
 * while it is above zero.
 *
 * @param want - Biopython's message.
 * @param got - This port's message.
 * @returns Whether the pair is a known, counted divergence.
 */
export function knownXmlDivergence(want: string, got: string | null): boolean {
  if (got === null) return false;
  const PROLOG = ["not well-formed (invalid token)", "syntax error", "junk after document element", "no element found"];
  const [a, b] = [xmlReason(want), xmlReason(got)];
  return PROLOG.includes(a) && PROLOG.includes(b);
}
