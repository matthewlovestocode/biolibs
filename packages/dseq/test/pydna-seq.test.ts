/**
 * Replays the pydna.seq golden cases (reference/golden/gen_pydnaseq_cases.py).
 *
 * `cai` and `express` reach past pydna into the `cai2` package and SciPy, so those cases pin a fourth
 * library's behaviour; `express` is compared by its cells, since the table around them is `prettytable`'s
 * rendering rather than anything pydna computes. NaN cannot be written to JSON, so wherever one is the
 * answer the golden records null and a companion flag says so.
 */
import { readFileSync } from "node:fs";
import { lol, ProteinSeq, PydnaSeq } from "@biolibs/dseq";
import { captureWarnings } from "@biolibs/core";
import { describe, expect, it } from "vitest";

type Guarded<T> = ({ value: T } | { exc: { type: string; msg: string } }) &
  { warnings?: Array<[string, string]> };
type Cell = string | number | null;
interface ByOrganism {
  rarecodons: Guarded<Array<[number, number, number]>>;
  startcodon: Guarded<number | null>;
  stopcodon: Guarded<number | null>;
  n_end: Guarded<string | null>;
  cai: Guarded<number | null>;
  cai_nan: Guarded<boolean>;
  express: Guarded<Cell[][]>;
  express_nan: Guarded<number[]>;
}
interface Case {
  data: string;
  len: number;
  gc: Guarded<number>;
  seguid: Guarded<string>;
  transcribe: Guarded<string>;
  translate: Guarded<string>;
  translate_class: Guarded<string>;
  rc: Guarded<string>;
  reverse_complement: Guarded<string>;
  rc_class: Guarded<string>;
  orfs2: Record<string, Guarded<string[]>>;
  orfs: Record<string, Guarded<Array<[number, number]>>>;
  by_organism: Record<string, ByOrganism>;
}
interface Protein {
  data: string;
  len: number;
  seguid: Guarded<string>;
  molecular_weight: Guarded<number>;
  pI: Guarded<number>;
  instability_index: Guarded<number>;
  getitem: Guarded<[string, string]>;
  refusals: Record<string, Guarded<string>>;
}

const golden = JSON.parse(readFileSync(new URL("./golden/pydna-seq.json", import.meta.url), "utf8")) as
  { pydna: string; cases: Case[]; proteins: Protein[] };

/**
 * Compare one recorded answer with the port's, whichever of the two is an error, and the warnings with it.
 *
 * @param want - What the generator recorded. @param run - How to get the port's answer.
 * @param where - What is being compared.
 */
function same<T>(want: Guarded<T>, run: () => T, where: string): void {
  const { result: got, error, warnings } = captureWarnings(run);
  const err = error as Error | undefined;
  if ("exc" in want) {
    expect(err?.name, `${where}: expected ${want.exc.type}`).toBe(want.exc.type);
    expect(err?.message, where).toBe(want.exc.msg);
  } else {
    expect(err, `${where}: ${err?.message ?? ""}`).toBeUndefined();
    expect(got, where).toEqual(want.value);
  }
  expect(warnings.map((w) => [w.category, w.message]), `${where}: warnings`).toEqual(want.warnings ?? []);
}

/** @param n - A number to round as the generator's floats were. @returns It to a comparable precision. */
const close = (n: number): number => Math.round(n * 1e9) / 1e9;

describe(`pydna.seq.Seq: parity with pydna ${golden.pydna}`, () => {
  golden.cases.forEach((c, index) => {
    it(`${index} ${JSON.stringify(c.data)}`, () => {
      const s = new PydnaSeq(c.data);
      expect(s.length, "length").toBe(c.len);
      same(c.gc, () => s.gc(), "gc");
      same(c.seguid, () => s.seguid(), "seguid");
      same(c.transcribe, () => s.transcribe().toString(), "transcribe");
      same(c.translate, () => s.translate().toString(), "translate");
      // pydna's translate hands back a ProteinSeq, not a sequence of its own class.
      same(c.translate_class, () => (s.translate() as unknown as ProteinSeq instanceof ProteinSeq
        ? "ProteinSeq" : "Seq"), "translate class");
      same(c.rc, () => s.rc().toString(), "rc");
      same(c.reverse_complement, () => s.reverseComplement().toString(), "reverseComplement");
      same(c.rc_class, () => (s.rc() instanceof PydnaSeq ? "Seq" : "other"), "rc class");
      for (const [minsize, want] of Object.entries(c.orfs2)) {
        same(want, () => s.orfs2(Number(minsize)).map((x) => x.toString()), `orfs2 ${minsize}`);
      }
      for (const [minsize, want] of Object.entries(c.orfs)) {
        same(want, () => s.orfs(Number(minsize)).map((t) => [...t]) as Array<[number, number]>,
             `orfs ${minsize}`);
      }
      for (const [organism, want] of Object.entries(c.by_organism)) {
        same(want.rarecodons, () => s.rarecodons(organism).map((sl) => [sl.start, sl.stop, sl.step]),
             `rarecodons ${organism}`);
        same(want.startcodon, () => s.startcodon(organism), `startcodon ${organism}`);
        same(want.stopcodon, () => s.stopcodon(organism), `stopcodon ${organism}`);
        same(want.n_end, () => s.nEnd(organism), `nEnd ${organism}`);
        // NaN is recorded as null, so the port's NaN is turned into null the same way before comparing.
        same(want.cai, () => { const v = s.cai(organism); return Number.isNaN(v) ? null : v; },
             `cai ${organism}`);
        same(want.cai_nan, () => Number.isNaN(s.cai(organism)), `cai NaN ${organism}`);
        same(want.express, () => lol(s.express(organism)).map((row) =>
          row.map((v) => (typeof v === "number" && Number.isNaN(v) ? null : v))) as Cell[][],
             `express ${organism}`);
        same(want.express_nan, () => lol(s.express(organism))[1]!
          .flatMap((v, i) => (typeof v === "number" && Number.isNaN(v) ? [i] : [])),
             `express NaN ${organism}`);
      }
    });
  });
});

describe(`pydna.seq.ProteinSeq: parity with pydna ${golden.pydna}`, () => {
  golden.proteins.forEach((p, index) => {
    it(`${index} ${JSON.stringify(p.data)}`, () => {
      const s = new ProteinSeq(p.data);
      expect(s.length, "length").toBe(p.len);
      same(p.seguid, () => s.seguid(), "seguid");
      // ProtParam's numbers come out of the same arithmetic as Biopython's, so they are compared closely
      // rather than exactly: see docs/seqtools.md on where the last bits can differ.
      same("value" in p.molecular_weight ? { ...p.molecular_weight, value: close(p.molecular_weight.value) }
        : p.molecular_weight, () => close(s.molecularWeight()), "molecularWeight");
      same("value" in p.pI ? { ...p.pI, value: close(p.pI.value) } : p.pI, () => close(s.pI()), "pI");
      same("value" in p.instability_index
        ? { ...p.instability_index, value: close(p.instability_index.value) } : p.instability_index,
           () => close(s.instabilityIndex()), "instabilityIndex");
      same(p.getitem, () => [s.slice(1, 4).toString(),
        s.slice(1, 4) instanceof ProteinSeq ? "ProteinSeq" : "other"] as [string, string], "slice");
      const methods: Record<string, () => string> = {
        translate: () => s.translate(),
        complement: () => s.complement(),
        complement_rna: () => s.complementRna(),
        reverse_complement: () => s.reverseComplement(),
        reverse_complement_rna: () => s.reverseComplementRna(),
        transcribe: () => s.transcribe(),
        back_transcribe: () => s.backTranscribe(),
        rc: () => s.rc(),
      };
      for (const [name, call] of Object.entries(p.refusals)) {
        same(call, methods[name]!, `${name} refused`);
      }
    });
  });
});
