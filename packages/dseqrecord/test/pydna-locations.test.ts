/**
 * Replays the location-helper golden cases (reference/golden/gen_pydnaloc_cases.py).
 *
 * `shiftLocation` is the one that matters here. It is what rewrites every feature on a circular molecule
 * whenever the origin moves, and a mistake in it does not raise — it moves annotations onto the wrong
 * bases. So the cases cover the shapes that make it decide: parts landing on the origin, parts that must be
 * split, adjacent parts that must be joined, zero-length parts, and the limits under which pydna's own
 * assertion gives way.
 */
import { readFileSync } from "node:fs";
import { captureWarnings } from "@biolibs/core";
import { flatten, locationBoundaries, shiftFeature, shiftLocation } from "@biolibs/dseqrecord";
import { CompoundLocation, SeqFeature, type Location, SimpleLocation, type Strand }
  from "@biolibs/seqfeature";
import { describe, expect, it } from "vitest";

type Guarded<T> = ({ value: T } | { exc: { type: string; msg: string } }) &
  { warnings?: Array<[string, string]> };
type Spec = [number, number, Strand];
interface Enc {
  str: string;
  cls: string;
  len: number;
  strand: Strand;
  parts: Array<[number, number, Strand]>;
}
interface Case {
  spec: Spec[];
  shift: number;
  lim: number | null;
  before: Enc;
  after: Guarded<Enc>;
  boundaries: Guarded<[number, number]>;
}
interface FeatureCase {
  spec: Spec;
  shift: number;
  lim: number | null;
  result: Guarded<{
    moved: Enc;
    type: string;
    qualifiers: Record<string, unknown>;
    original_untouched: boolean;
  }>;
}

const golden = JSON.parse(
  readFileSync(new URL("./golden/pydna-locations.json", import.meta.url), "utf8"),
) as {
  pydna: string;
  cases: Case[];
  features: FeatureCase[];
  flatten: Array<{ input: unknown; result: Guarded<unknown[]> }>;
};

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

/** @param loc - A location. @returns It in the generator's shape. */
const enc = (loc: Location): Enc => ({
  str: loc.toString(),
  cls: loc instanceof CompoundLocation ? "CompoundLocation" : "SimpleLocation",
  len: loc.length,
  strand: loc.strand,
  parts: loc.parts.map((p) => [Number(p.start), Number(p.end), p.strand] as [number, number, Strand]),
});

/** @param spec - One or more `[start, end, strand]`. @returns The location they describe. */
const build = (spec: Spec[]): Location =>
  spec.length > 1
    ? new CompoundLocation(spec.map(([a, b, st]) => new SimpleLocation(a, b, st)))
    : new SimpleLocation(spec[0]![0], spec[0]![1], spec[0]![2]);

describe(`pydna.utils.shift_location: parity with pydna ${golden.pydna}`, () => {
  golden.cases.forEach((c, index) => {
    const name = `${index} ${JSON.stringify(c.spec)} shift ${c.shift} lim ${c.lim}`;
    it(name, () => {
      const loc = build(c.spec);
      // The location the generator built must be the one this builds, or the comparison is of two
      // different things.
      expect(enc(loc), "the location itself").toEqual(c.before);
      same(c.after, () => enc(shiftLocation(loc, c.shift, c.lim)), "shiftLocation");
      same(c.boundaries, () => locationBoundaries(loc), "locationBoundaries");
    });
  });
});

describe(`pydna.utils.shift_feature: parity with pydna ${golden.pydna}`, () => {
  golden.features.forEach((c, index) => {
    it(`${index} ${JSON.stringify(c.spec)} shift ${c.shift} lim ${c.lim}`, () => {
      same(c.result, () => {
        const sf = new SeqFeature(new SimpleLocation(c.spec[0], c.spec[1], c.spec[2]), "misc",
                                  "<unknown id>",
                                  new Map<string, unknown>([["label", ["a label"]], ["note", ["a note"]]]));
        const moved = shiftFeature(sf, c.shift, c.lim);
        return {
          moved: enc(moved.location!),
          type: moved.type,
          qualifiers: Object.fromEntries([...moved.qualifiers.entries()]
            .sort(([a], [b]) => (a < b ? -1 : 1))),
          // Moving a feature must not move the one it was made from.
          original_untouched: sf.location!.toString()
            === new SimpleLocation(c.spec[0], c.spec[1], c.spec[2]).toString(),
        };
      }, "shiftFeature");
    });
  });
});

describe(`pydna.utils.flatten: parity with pydna ${golden.pydna}`, () => {
  golden.flatten.forEach((c, index) => {
    it(`${index} ${JSON.stringify(c.input)}`, () => {
      same(c.result, () => flatten(c.input), "flatten");
    });
  });
});
