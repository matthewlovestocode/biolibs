/**
 * Replays the pydna.seqrecord golden cases (reference/golden/gen_pydnasr_cases.py).
 *
 * Three members are absent and marked rather than measured. `__hash__` hashes a string built from the
 * instance dictionary, and Python's string hashing moves with the interpreter's hash seed, so there is no
 * number to agree with; `dump` writes a Python pickle, which a TypeScript port has no business producing;
 * and `stamp` is given a fixed clock here so that what it writes is the same every run.
 */
import { readFileSync } from "node:fs";
import { captureWarnings } from "@biolibs/core";
import { Seq as BioSeq } from "@biolibs/seq";
import { SeqRecord as BioSeqRecord } from "@biolibs/seqrecord";
import { identifierFromString, ProteinSeqRecord, PydnaSeqRecord } from "@biolibs/dseqrecord";
import type { SeqFeature } from "@biolibs/seqfeature";
// Imported for its side effect: @biolibs/seqio is what registers the format writers a record's `format`
// looks up, and the record layer does not depend on the IO layer.
import "@biolibs/seqio";
import { describe, expect, it } from "vitest";

type Guarded<T> = ({ value: T } | { exc: { type: string; msg: string } }) &
  { warnings?: Array<[string, string]> };
interface Feat {
  str: string | null;
  start: number | null;
  end: number | null;
  strand: number | null;
  type: string;
  len: number;
  qualifiers: Record<string, unknown>;
}
interface Snap {
  seq: string;
  id: string | null;
  name: string;
  description: string;
  dbxrefs: string[];
  annotations: Record<string, unknown>;
  features: Feat[];
  len: number;
  seq_class: string;
}
interface ByOrganism {
  cai: Guarded<number>;
  rarecodons: Guarded<Feat[]>;
  startcodon: Guarded<number | null>;
  stopcodon: Guarded<number | null>;
  express: Guarded<Array<Array<string | number | null>>>;
}
interface Case {
  data: string;
  snap: Guarded<Snap>;
  aliases?: Guarded<Array<string | null>>;
  isorf?: Record<string, Guarded<boolean>>;
  seguid?: Guarded<string>;
  gc?: Guarded<number>;
  bool?: Guarded<boolean>;
  str?: Guarded<string>;
  repr?: Guarded<string>;
  translate?: Guarded<[string, string]>;
  rc?: Guarded<Snap>;
  formats?: Record<string, Guarded<string>>;
  by_organism?: Record<string, ByOrganism>;
  add_feature?: Array<{ x: number | null; y: number | null; result: Guarded<Snap> }>;
  add_feature_seq?: Array<{ seq: string; result: Guarded<Snap> }>;
  two_features?: Guarded<Snap>;
  list_features?: Guarded<string[][]>;
  extract_feature?: Guarded<Snap[]>;
  extract_feature_bad?: Guarded<Snap>;
  sorted_features?: Guarded<Feat[]>;
  colors?: Guarded<Array<[unknown, unknown]>>;
  slices?: Array<{ start: number | null; stop: number | null; result: Guarded<Snap> }>;
  comment?: Guarded<string[]>;
  stamp?: Guarded<Array<string | null>>;
  stamp_changed?: Guarded<string[]>;
  lcs?: Array<{ other: string; limit: number; result: Guarded<Feat> }>;
  lcs_record?: Guarded<Feat>;
  lcs_type?: Guarded<Feat>;
  add?: Guarded<Snap>;
  eq?: Guarded<boolean[]>;
  order?: Guarded<boolean[]>;
  copy?: Guarded<Snap>;
  from_bio?: Guarded<Snap>;
  locus_long?: Guarded<string[]>;
  set_aliases?: Guarded<Snap>;
}
interface Protein {
  data: string;
  snap: Guarded<Snap>;
  format: Guarded<string>;
  seguid: Guarded<string>;
  refusals: Record<string, Guarded<string>>;
}

const golden = JSON.parse(
  readFileSync(new URL("./golden/pydna-seqrecord.json", import.meta.url), "utf8"),
) as { pydna: string; cases: Case[]; proteins: Protein[]; identifiers: Record<string, Guarded<string>> };

/**
 * Compare one recorded answer with the port's, whichever of the two is an error, warnings included.
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
  start: sf.location === null ? null : Number(sf.location.start),
  end: sf.location === null ? null : Number(sf.location.end),
  strand: sf.location === null ? null : (sf.location.strand ?? null),
  type: sf.type,
  len: sf.length,
  qualifiers: Object.fromEntries([...sf.qualifiers.entries()].sort(([a], [b]) => (a < b ? -1 : 1))),
});

/** @param r - A record. @returns Enough of it to pin it down, in the generator's shape. */
const snap = (r: PydnaSeqRecord): Snap => ({
  seq: r.seq?.toString() ?? "",
  id: r.id,
  name: r.name,
  description: r.description,
  dbxrefs: [...r.dbxrefs],
  annotations: Object.fromEntries([...r.annotations.entries()].sort(([a], [b]) => (a < b ? -1 : 1))),
  features: r.features.map(feat),
  len: r.length,
  seq_class: r.seq?.constructor.name === "ProteinSeq" ? "ProteinSeq" : "Seq",
});

/** @param data - A sequence. @returns A record with features at 0–2 and 2–4, as the generator builds. */
function twoFeatures(data: string): PydnaSeqRecord {
  const q = new PydnaSeqRecord(data);
  q.addFeature(0, 2);
  q.addFeature(2, 4);
  return q;
}

describe(`pydna.seqrecord.SeqRecord: parity with pydna ${golden.pydna}`, () => {
  golden.cases.forEach((c, index) => {
    it(`${index} ${JSON.stringify(c.data)}`, () => {
      same(c.snap, () => snap(new PydnaSeqRecord(c.data)), "record");
      if ("exc" in c.snap) return;
      const r = new PydnaSeqRecord(c.data);
      same(c.aliases!, () => [r.locus, r.accession, r.definition], "aliases");
      for (const [table, want] of Object.entries(c.isorf!)) {
        same(want, () => r.isorf(Number(table)), `isorf ${table}`);
      }
      same(c.seguid!, () => r.seguid(), "seguid");
      same(c.gc!, () => r.gc(), "gc");
      same(c.bool!, () => r.isTruthy(), "bool");
      same(c.str!, () => r.toString(), "str");
      same(c.repr!, () => r.repr(), "repr");
      same(c.translate!, () => [r.translate().seq?.toString() ?? "",
        r.translate() instanceof ProteinSeqRecord ? "ProteinSeqRecord" : "other"] as [string, string],
           "translate");
      same(c.rc!, () => snap(r.rc()), "rc");
      for (const [name, want] of Object.entries(c.formats!)) {
        same(want, () => r.format(name), `format ${name}`);
      }
      for (const [organism, want] of Object.entries(c.by_organism!)) {
        same(want.cai, () => r.cai(organism), `cai ${organism}`);
        same(want.rarecodons, () => r.rarecodons(organism).map(feat), `rarecodons ${organism}`);
        same(want.startcodon, () => r.startcodon(organism), `startcodon ${organism}`);
        same(want.stopcodon, () => r.stopcodon(organism), `stopcodon ${organism}`);
        same(want.express, () => [r.express(organism).fieldNames as string[],
          r.express(organism).row.map((v) => (typeof v === "number" && Number.isNaN(v) ? null : v))],
             `express ${organism}`);
      }
      c.add_feature!.forEach(({ x, y, result }) => {
        same(result, () => {
          const q = new PydnaSeqRecord(c.data);
          q.addFeature(x, y);
          return snap(q);
        }, `addFeature ${x}:${y}`);
      });
      c.add_feature_seq!.forEach(({ seq, result }) => {
        same(result, () => {
          const q = new PydnaSeqRecord(c.data);
          q.addFeature(null, null, seq);
          return snap(q);
        }, `addFeature seq ${JSON.stringify(seq)}`);
      });
      same(c.two_features!, () => snap(twoFeatures(c.data)), "two features");
      same(c.list_features!, () => {
        const t = twoFeatures(c.data).listFeatures();
        return [t.fieldNames.map(String), ...t.rows.map((row) => row.map(String))];
      }, "listFeatures");
      same(c.extract_feature!, () => [0, 1].map((i) => snap(twoFeatures(c.data).extractFeature(i))),
           "extractFeature");
      same(c.extract_feature_bad!, () => snap(twoFeatures(c.data).extractFeature(5)),
           "extractFeature out of range");
      same(c.sorted_features!, () => {
        const q = new PydnaSeqRecord(c.data);
        q.addFeature(3, 4);
        q.addFeature(2, 4);
        return q.sortedFeatures().map(feat);
      }, "sortedFeatures");
      same(c.colors!, () => {
        const q = twoFeatures(c.data);
        q.addColorsToFeaturesForApe();
        return q.features.map((f) => [f.qualifiers.get("ApEinfo_fwdcolor"),
          f.qualifiers.get("ApEinfo_revcolor")] as [unknown, unknown]);
      }, "ApE colours");
      c.slices!.forEach(({ start, stop, result }) => {
        same(result, () => snap(twoFeatures(c.data).slice(start, stop)), `slice ${start}:${stop}`);
      });
      same(c.comment!, () => {
        const q = new PydnaSeqRecord(c.data);
        return [q.comment(), q.comment("hello"), q.comment(), q.comment("again")];
      }, "comment");
      same(c.stamp!, () => {
        const q = new PydnaSeqRecord(c.data);
        return [q.stamp(() => "NOW"), (q.annotations.get("comment") as string | undefined) ?? null,
          q.stamp(() => "NOW")];
      }, "stamp");
      same(c.stamp_changed!, () => {
        const q = new PydnaSeqRecord(c.data);
        q.annotations.set("comment", `lsseguid=${"x".repeat(27)}`);
        return [q.stamp(() => "NOW"), q.annotations.get("comment") as string];
      }, "stamp over a different checksum");
      c.lcs!.forEach(({ other, limit, result }) => {
        same(result, () => feat(r.lcs(other, limit)), `lcs ${JSON.stringify(other)} ${limit}`);
      });
      same(c.lcs_record!, () => feat(r.lcs(new PydnaSeqRecord("GATC", "id", "theread"), 4)), "lcs record");
      same(c.lcs_type!, () => feat(r.lcs("GATC", 4, { type: "mapped", label: "mylabel" })), "lcs type");
      same(c.add!, () => snap(new PydnaSeqRecord(c.data).add(new PydnaSeqRecord("tt"))), "add");
      same(c.eq!, () => {
        const a = new PydnaSeqRecord(c.data);
        return [a.equals(new PydnaSeqRecord(c.data)), a.equals(new PydnaSeqRecord("tt")),
          !a.equals(new PydnaSeqRecord(c.data)), a.equals(c.data as never)];
      }, "equality");
      same(c.order!, () => {
        const a = new PydnaSeqRecord(c.data);
        return [a.lessThan(new PydnaSeqRecord("tt")) as boolean,
          a.greaterThan(new PydnaSeqRecord("tt")) as boolean, a.lessThan("tt") === null];
      }, "ordering");
      same(c.copy!, () => snap(new PydnaSeqRecord(c.data).copy()), "copy");
      same(c.from_bio!, () => snap(PydnaSeqRecord.fromBioSeqRecord(
        new BioSeqRecord(new BioSeq(c.data), "bio", "bioname", "biodesc"))), "fromBioSeqRecord");
      same(c.locus_long!, () => {
        const q = new PydnaSeqRecord(c.data);
        q.locus = "x".repeat(20);
        return [q.locus, q.name];
      }, "locus truncated");
      same(c.set_aliases!, () => {
        const q = new PydnaSeqRecord(c.data);
        q.accession = "ACC1";
        q.definition = "a definition";
        q.locus = "short";
        return snap(q);
      }, "aliases set");
    });
  });
});

describe(`pydna.seqrecord.ProteinSeqRecord: parity with pydna ${golden.pydna}`, () => {
  golden.proteins.forEach((p, index) => {
    it(`${index} ${JSON.stringify(p.data)}`, () => {
      const r = new ProteinSeqRecord(p.data);
      same(p.snap, () => snap(r), "record");
      same(p.format, () => r.format("fasta"), "fasta");
      same(p.seguid, () => r.seguid(), "seguid");
      const methods: Record<string, () => unknown> = {
        reverse_complement: () => r.reverseComplement(),
        rc: () => r.rc(),
        isorf: () => r.isorf(),
        gc: () => r.gc(),
        cai: () => r.cai(),
        rarecodons: () => r.rarecodons(),
        startcodon: () => r.startcodon(),
        stopcodon: () => r.stopcodon(),
        express: () => r.express(),
      };
      for (const [name, want] of Object.entries(p.refusals)) {
        same(want, methods[name]! as () => string, `${name} refused`);
      }
    });
  });
});

describe("pydna.utils.identifier_from_string", () => {
  Object.entries(golden.identifiers).forEach(([label, want]) => {
    it(JSON.stringify(label), () => {
      same(want, () => identifierFromString(label), "identifierFromString");
    });
  });
});
