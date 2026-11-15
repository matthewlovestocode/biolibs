/**
 * Replays the Dseqrecord molecule-layer golden cases (reference/golden/gen_dseqrec_cases.py).
 *
 * Nearly every case is run on a record carrying features, because that is where the difficulty is: closing
 * a molecule shortens it by its overhangs, moving the origin renumbers everything, and a feature that no
 * longer fits has to go. Cutting with enzymes, `synced` and the output formats are not here; nor are the
 * provenance members, which need pydna's OpenCloning models.
 */
import { readFileSync } from "node:fs";
import { captureWarnings } from "@biolibs/core";
import { Dseq } from "@biolibs/dseq";
import { Dseqrecord } from "@biolibs/dseqrecord";
import { Seq as BioSeq } from "@biolibs/seq";
import type { SeqFeature } from "@biolibs/seqfeature";
import { SeqRecord as BioSeqRecord } from "@biolibs/seqrecord";
import { describe, expect, it } from "vitest";
// Registers the file-format writers `format` needs: this package does not depend on the IO layer,
// so a caller that wants GenBank or FASTA imports it, exactly as the README says.
import "@biolibs/seqio";

type Guarded<T> = ({ value: T } | { exc: { type: string; msg: string } }) &
  { warnings?: Array<[string, string]> };
interface Feat {
  str: string | null;
  parts: Array<[number, number, number | null]> | null;
  type: string;
  len: number;
  qualifiers: Record<string, unknown>;
}
interface Snap {
  code: string;
  watson: string;
  crick: string;
  circular: boolean;
  len: number;
  ovhg: number | null;
  id: string | null;
  name: string;
  description: string;
  annotations: Record<string, unknown>;
  features: Feat[];
  n: number;
  repr: string;
}
interface Case {
  data: string;
  circular: boolean;
  snap: Guarded<Snap>;
  m?: Guarded<number>;
  seguid?: Guarded<string>;
  str?: Guarded<string>;
  repr?: Guarded<string>;
  looped?: Guarded<Snap>;
  tolinear?: Guarded<Snap>;
  rc?: Guarded<Snap>;
  upper?: Guarded<Snap>;
  lower?: Guarded<Snap>;
  terminal_transferase?: Record<string, Guarded<Snap>>;
  shifted?: Record<string, Guarded<Snap>>;
  formats?: Record<string, Guarded<string>>;
  format_leaks_topology?: Guarded<string>;
  figure?: Record<string, Guarded<string>>;
  orfs?: Record<string, Guarded<Snap[]>>;
  orfs_to_features?: Record<string, Guarded<Feat[]>>;
  find?: Record<string, Guarded<number>>;
  contains?: Record<string, Guarded<boolean>>;
  find_aa?: Record<string, Guarded<[number, number] | null>>;
  add?: Guarded<Snap>;
  mul?: Record<string, Guarded<Snap>>;
  mul_bad?: Guarded<Snap>;
  join?: Guarded<Snap>;
  eq?: Guarded<boolean[]>;
  slices?: Array<{ start: number | null; stop: number | null; result: Guarded<Snap> }>;
  add_feature_wrap?: Array<{ x: number; y: number; result: Guarded<Feat[]> }>;
}

const golden = JSON.parse(
  readFileSync(new URL("./golden/dseqrecord.json", import.meta.url), "utf8"),
) as { pydna: string; cases: Case[]; builds: Array<{ label: string; result: Guarded<Snap> }> };

/**
 * Compare one recorded answer with the port's, whichever of the two is an error.
 *
 * @param want - What the generator recorded. @param run - How to get the port's answer.
 * @param where - What is being compared.
 */
function same<T>(want: Guarded<T>, run: () => T, where: string): void {
  const { result: got, error, warnings } = captureWarnings(run);
  const err = error as Error | undefined;
  if ("exc" in want) {
    expect(err?.name, `${where}: expected ${want.exc.type}, got ${err?.name}: ${err?.message ?? ""}`)
      .toBe(want.exc.type);
    expect(err?.message, where).toBe(want.exc.msg);
  } else {
    expect(err, `${where}: ${err?.name ?? ""}: ${err?.message ?? ""}`).toBeUndefined();
    expect(got, where).toEqual(want.value);
  }
  expect(warnings.map((w) => [w.category, w.message]), `${where}: warnings`).toEqual(want.warnings ?? []);
}

/** @param sf - A feature. @returns It in the generator's shape. */
const feat = (sf: SeqFeature): Feat => ({
  str: sf.location === null ? null : sf.location.toString(),
  parts: sf.location === null ? null
    : sf.location.parts.map((p) => [Number(p.start), Number(p.end), p.strand ?? null] as
      [number, number, number | null]),
  type: sf.type,
  len: sf.length,
  qualifiers: Object.fromEntries([...sf.qualifiers.entries()].sort(([a], [b]) => (a < b ? -1 : 1))),
});

/** @param r - A record. @returns Enough of it to pin it down, in the generator's shape. */
const snap = (r: Dseqrecord): Snap => ({
  code: r.dseq.code,
  watson: r.dseq.watson,
  crick: r.dseq.crick,
  circular: r.circular,
  len: r.length,
  ovhg: r.dseq.ovhg,
  id: r.id,
  name: r.name,
  description: r.description,
  annotations: Object.fromEntries([...r.annotations.entries()].sort(([a], [b]) => (a < b ? -1 : 1))),
  features: r.features.map(feat),
  n: r.n,
  repr: r.repr(),
});

/**
 * A record with the same features the generator puts on one.
 *
 * @param data - The molecule's dscode. @param circular - Whether to close it.
 * @returns The record.
 */
function withFeatures(data: string, circular: boolean): Dseqrecord {
  const r = new Dseqrecord(data, circular);
  if (r.length >= 4) {
    r.addFeature(1, 3, null, "misc", 1, { label: ["inner"] });
    r.addFeature(0, 2, null, "gene", 1, { label: ["head"] });
  }
  if (circular && r.length >= 4) r.addFeature(r.length - 1, 1, null, "misc", 1, { label: ["wraps"] });
  return r;
}

describe(`pydna.dseqrecord.Dseqrecord: parity with pydna ${golden.pydna}`, () => {
  golden.cases.forEach((c, index) => {
    it(`${index} ${c.circular ? "circular" : "linear"} ${JSON.stringify(c.data)}`, () => {
      same(c.snap, () => snap(withFeatures(c.data, c.circular)), "record");
      if ("exc" in c.snap) return;
      const r = withFeatures(c.data, c.circular);
      // The mass is the molecular weight times an amount, and the weight is a sum of per-base floats
      // whose order is not observable; `packages/dseq/test/dseq.test.ts` compares it the same way.
      if ("value" in c.m!) {
        const want = c.m.value;
        expect(Math.abs(r.m() - want) <= 1e-9 * Math.max(1, Math.abs(want)), "m").toBe(true);
      } else {
        same(c.m!, () => r.m(), "m");
      }
      same(c.seguid!, () => r.seguid(), "seguid");
      same(c.str!, () => r.toString(), "str");
      same(c.repr!, () => r.repr(), "repr");
      same(c.looped!, () => snap(r.looped()), "looped");
      same(c.tolinear!, () => snap(r.tolinear()), "tolinear");
      same(c.rc!, () => snap(r.rc()), "rc");
      same(c.upper!, () => snap(r.upper()), "upper");
      same(c.lower!, () => snap(r.lower()), "lower");
      for (const [n, want] of Object.entries(c.terminal_transferase!)) {
        same(want, () => snap(r.terminalTransferase(n)), `terminalTransferase ${JSON.stringify(n)}`);
      }
      for (const [name, want] of Object.entries(c.formats!)) {
        same(want, () => r.format(name), `format ${name}`);
      }
      // pydna's `format` deep-copies, so `topology` must not reach the record it was called on.
      same(c.format_leaks_topology!, () => {
        r.format("gb");
        return (r.annotations.get("topology") as string | undefined) ?? "unset";
      }, "format leaks topology");
      for (const [name, want] of Object.entries(c.figure!)) {
        const args: Record<string, Parameters<typeof r.figure>> = {
          default: [], first: [0], plain: [0, "<", ">"], second: [1], negative: [-1],
        };
        same(want, () => r.figure(...args[name]!), `figure ${name}`);
      }
      for (const [shift, want] of Object.entries(c.shifted!)) {
        same(want, () => snap(r.shifted(Number(shift))), `shifted ${shift}`);
      }
      for (const [minsize, want] of Object.entries(c.orfs!)) {
        same(want, () => r.orfs(Number(minsize)).map(snap), `orfs ${minsize}`);
      }
      for (const [minsize, want] of Object.entries(c.orfs_to_features!)) {
        same(want, () => r.orfsToFeatures(Number(minsize)).map(feat), `orfsToFeatures ${minsize}`);
      }
      for (const [other, want] of Object.entries(c.find!)) {
        same(want, () => r.find(new Dseqrecord(other)), `find ${JSON.stringify(other)}`);
      }
      for (const [other, want] of Object.entries(c.contains!)) {
        same(want, () => r.contains(other), `contains ${JSON.stringify(other)}`);
      }
      for (const [other, want] of Object.entries(c.find_aa!)) {
        same(want, () => r.findAa(other), `findAa ${JSON.stringify(other)}`);
      }
      same(c.add!, () => snap(new Dseqrecord(c.data).add(new Dseqrecord("tt")) as unknown as Dseqrecord),
           "add");
      for (const [times, want] of Object.entries(c.mul!)) {
        same(want, () => snap(r.multiply(Number(times))), `multiply ${times}`);
      }
      same(c.mul_bad!, () => snap(r.multiply(1.5)), "multiply 1.5");
      same(c.join!, () => snap(new Dseqrecord("a").joinRecords(
        [new Dseqrecord("A"), new Dseqrecord("B"), new Dseqrecord("C")])), "join");
      same(c.eq!, () => [
        withFeatures(c.data, c.circular).equals(withFeatures(c.data, c.circular)),
        withFeatures(c.data, c.circular).equals(new Dseqrecord("tt")),
        withFeatures(c.data, c.circular).ne(withFeatures(c.data, c.circular)),
      ], "equality");
      c.slices!.forEach(({ start, stop, result }) => {
        same(result, () => snap(r.slice(start, stop) as unknown as Dseqrecord), `slice ${start}:${stop}`);
      });
      c.add_feature_wrap!.forEach(({ x, y, result }) => {
        same(result, () => {
          const q = new Dseqrecord(c.data, c.circular);
          q.addFeature(x, y);
          return q.features.map(feat);
        }, `addFeature ${x}:${y}`);
      });
    });
  });
});

describe(`pydna.dseqrecord.Dseqrecord: what the constructor accepts (pydna ${golden.pydna})`, () => {
  const makers: Record<string, () => Dseqrecord> = {
    "str": () => new Dseqrecord("gaattc"),
    "str circular": () => new Dseqrecord("gaattc", true),
    "dseq": () => new Dseqrecord(new Dseq("gaattc")),
    "dseq circular true": () => new Dseqrecord(new Dseq("gaattc"), true),
    "dseq circular false": () => new Dseqrecord(new Dseq("gaattc", null, null, true), false),
    "bioseq": () => new Dseqrecord(new BioSeq("gaattc")),
    "bioseq circular": () => new Dseqrecord(new BioSeq("gaattc"), true),
    "biorecord": () => new Dseqrecord(new BioSeqRecord(new BioSeq("gaattc"), "bio", "bn", "bd")),
    "dseqrecord": () => new Dseqrecord(new Dseqrecord("gaattc", true)),
    "refused int": () => new Dseqrecord(7 as never),
    "refused none": () => new Dseqrecord(null as never),
    "from_string": () => Dseqrecord.fromString("gaattc"),
    "from_string circular": () => Dseqrecord.fromString("gaattc", true),
    "from_SeqRecord": () => Dseqrecord.fromSeqRecord(new BioSeqRecord(new BioSeq("gaattc"), "x")),
    "from_SeqRecord topology": () => Dseqrecord.fromSeqRecord(
      new BioSeqRecord(new BioSeq("gaattc"), "x", "<unknown name>", "<unknown description>", null, null,
                       new Map<string, unknown>([["topology", "circular"], ["molecule_type", "DNA"]]))),
  };
  golden.builds.forEach(({ label, result }) => {
    it(label, () => {
      same(result, () => snap(makers[label]!()), label);
    });
  });
});
