/**
 * Replays the Dseqrecord cutting golden cases (reference/golden/gen_dseqreccut_cases.py).
 *
 * `Dseq` already knows where the enzymes break the strands; what is compared here is the second half of
 * the job — which fragment each feature belongs to. So every molecule carries features placed deliberately
 * across its cut sites: inside a fragment, over a cut, and through the origin.
 */
import { readFileSync } from "node:fs";
import { captureWarnings } from "@biolibs/core";
import { Dseqrecord } from "@biolibs/dseqrecord";
// The enzymes are reached through the `enzymes` record rather than as named exports.
import { CommOnly, enzymes, RestrictionBatch, type RestrictionType } from "@biolibs/restriction";
import type { SeqFeature } from "@biolibs/seqfeature";
import { describe, expect, it } from "vitest";

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
  features: Feat[];
  repr: string;
}
interface Cuts {
  fragments: Guarded<Snap[]>;
  number_of_cuts: Guarded<number>;
  linearize: Guarded<Snap>;
}
interface Case {
  data: string;
  circular: boolean;
  spans: Array<[number, number]>;
  built: Guarded<Snap>;
  cuts?: Record<string, Cuts>;
  queries?: Record<string, Guarded<string[]>>;
  n_cutters?: Record<string, Guarded<string[]>>;
  default_batch_sizes?: Guarded<[number, number, number]>;
}
interface SyncedCase {
  data: string;
  ref: string | { record: string };
  limit: number;
  circular: boolean;
  result: Guarded<Snap>;
}

const golden = JSON.parse(
  readFileSync(new URL("./golden/dseqrecord-cut.json", import.meta.url), "utf8"),
) as { pydna: string; cases: Case[]; synced: SyncedCase[] };

/** The enzymes the generator names, looked up under the same names. */
const ENZYMES: Record<string, RestrictionType> = Object.fromEntries(
  ["EcoRI", "BamHI", "HindIII", "EcoRV", "SmaI", "NotI"].map((n) =>
    [n, (enzymes as unknown as Record<string, RestrictionType>)[n]!]),
);
/** The small batch the cutter queries are asked about, so the answers stay readable. */
const BATCH = () => new RestrictionBatch(Object.values(ENZYMES));

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

/** @param r - A fragment. @returns Enough of it to pin it down, in the generator's shape. */
const snap = (r: Dseqrecord): Snap => ({
  code: r.dseq.code,
  watson: r.dseq.watson,
  crick: r.dseq.crick,
  circular: r.circular,
  len: r.length,
  ovhg: r.dseq.ovhg,
  id: r.id,
  name: r.name,
  features: r.features.map(feat),
  repr: r.repr(),
});

describe(`pydna.dseqrecord.Dseqrecord: cutting (pydna ${golden.pydna})`, () => {
  golden.cases.forEach((c, index) => {
    /** @returns The molecule with the generator's features on it. */
    const build = (): Dseqrecord => {
      const r = new Dseqrecord(c.data, c.circular);
      c.spans.forEach(([x, y], i) => {
        if (y <= r.length) r.addFeature(x, y, null, "misc", 1, { label: [`f${i}`] });
      });
      return r;
    };
    it(`${index} ${c.circular ? "circular" : "linear"} ${JSON.stringify(c.data)}`, () => {
      same(c.built, () => snap(build()), "molecule");
      if ("exc" in c.built) return;
      for (const [key, want] of Object.entries(c.cuts!)) {
        const enzymes = key === "none" ? [] : key.split("+").map((n) => ENZYMES[n]!);
        same(want.fragments, () => build().cut(...enzymes).map(snap), `cut ${key}`);
        same(want.number_of_cuts, () => build().numberOfCuts(...enzymes), `numberOfCuts ${key}`);
        same(want.linearize, () => snap(build().linearize(...enzymes)), `linearize ${key}`);
      }
      const r = build();
      const batch = BATCH();
      const queries: Record<string, () => RestrictionBatch> = {
        no_cutters: () => r.noCutters(batch),
        unique_cutters: () => r.uniqueCutters(batch),
        once_cutters: () => r.onceCutters(batch),
        twice_cutters: () => r.twiceCutters(batch),
        cutters: () => r.cutters(batch),
      };
      for (const [name, want] of Object.entries(c.queries!)) {
        same(want, () => [...queries[name]!()].map(String).sort(), name);
      }
      for (const [n, want] of Object.entries(c.n_cutters!)) {
        same(want, () => [...r.nCutters(Number(n), batch)].map(String).sort(), `nCutters ${n}`);
      }
      // The default batch is CommOnly, which is large, so only its size is compared.
      same(c.default_batch_sizes!, () => [[...r.cutters()].length, [...r.noCutters()].length,
        [...CommOnly].length] as [number, number, number], "default batch sizes");
    });
  });
});

describe(`pydna.dseqrecord.Dseqrecord.synced: parity with pydna ${golden.pydna}`, () => {
  golden.synced.forEach((c, index) => {
    const label = typeof c.ref === "string" ? JSON.stringify(c.ref) : `record ${c.ref.record}`;
    it(`${index} ${JSON.stringify(c.data)} vs ${label} limit ${c.limit}`, () => {
      same(c.result, () => {
        const r = new Dseqrecord(c.data, c.circular);
        const ref = typeof c.ref === "string" ? c.ref : new Dseqrecord(c.ref.record);
        return snap(r.synced(ref, c.limit));
      }, "synced");
    });
  });
});
