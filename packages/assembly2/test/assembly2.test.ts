/**
 * Replays the assembly-engine golden cases (reference/golden/gen_assembly2_cases.py) recorded from pydna.
 *
 * Every layer is compared separately, so that a difference shows up where it starts: the overlap finders
 * on one pair of fragments, the helpers on locations and lists, the graph and the walks through it, the
 * molecules those walks give, and the cloning methods built on top. The **order** is compared too — the
 * engine's output order is part of its answer, and reproducing it is most of the work in this port.
 */
import { readFileSync } from "node:fs";
import { captureWarnings } from "@biolibs/core";
import { Dseq, getCutsites } from "@biolibs/dseq";
import { Dseqrecord } from "@biolibs/dseqrecord";
import { enzymes } from "@biolibs/restriction";
import {
  Assembly, type AssemblyAlgorithm, type AssemblySource, type EdgeAssembly, type Fragment, type Overlap,
  PCRAssembly, Primer, SingleFragmentAssembly, bluntOverlap, circularPermutationMinAbs, commonSubStrings,
  createLocation, cutsOverlap, cutsiteToLocation, deduplicate, endsFromCutsite, fusionPcrAssembly,
  assemblyHasMismatches, assemblyToString, assemblyToStringTuple, edgeToSubFragment, subFragmentToEdge,
  gatherOverlappingLocations, gibsonAssembly, gibsonOverlap, goldenGateAssembly, inFusionAssembly,
  inFusionOverlap, inVivoAssembly, isSublist, ligationAssembly, limitIterator, locationOverlap,
  locationsOverlap, pcrAssembly, pcrFusionOverlap, primerTemplateOverlap, restrictionLigationAssembly,
  restrictionLigationOverlap, stickyEndSubStrings, sumIsSticky, terminalOverlap, uppercaseDnaString,
  zipMatchLeftwards, zipMatchRightwards,
} from "@biolibs/assembly2";
import { describe, expect, it } from "vitest";

/** A fragment as the generator writes one. */
type Spec = { watson: string; crick: string | null; ovhg: number; circular: boolean; name: string;
              features: [number, number, number | null, string, string][] } | { primer: string; name: string };
/** A value, or the error it raised, with any warnings — the generator's `guard`. */
type Guarded<T> = ({ value: T } | { exc: { type: string; msg: string } }) & { warnings?: [string, string][] };

const golden = JSON.parse(readFileSync(new URL("./golden/assembly2.json", import.meta.url), "utf8")) as Record<string, Record<string, unknown>[]>;

/** @param spec - A fragment, as the generator writes one. @returns The fragment. */
function build(spec: Spec): Fragment {
  if ("primer" in spec) return new Primer(spec.primer, spec.name, spec.name);
  const sequence = spec.crick === null
    ? new Dseq(spec.watson, null, null, spec.circular)
    : new Dseq(spec.watson, spec.crick, spec.ovhg, spec.circular);
  const record = new Dseqrecord(sequence, null, undefined, spec.name, spec.name);
  for (const [start, end, strand, type, label] of spec.features) {
    record.addFeature(start, end, null, type, strand as 1 | -1 | 0 | null, { label: [label] });
  }
  return record;
}

/** @param value - Anything. @returns It as the generator would record a location. */
const loc = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

/** @param fn - What to run. @returns Its value or its error, with any warnings, as the generator records it. */
function guard<T>(fn: () => T): Guarded<unknown> {
  const { result, error, warnings } = captureWarnings(fn);
  const out: Guarded<unknown> = error === undefined
    ? { value: result }
    : { exc: { type: (error as Error).name, msg: (error as Error).message } };
  if (warnings.length > 0) out.warnings = warnings.map((one) => [one.category, one.message] as [string, string]);
  return out;
}

/** @param got - What the port gave. @param want - What pydna gave. @param what - Where to say it went wrong. */
function same(got: Guarded<unknown>, want: Guarded<unknown>, what: string): void {
  expect(got, what).toEqual(want);
}

/** @param matches - Overlaps. @returns Them as plain arrays, which is how the generator writes them. */
const plain = (matches: readonly Overlap[]): number[][] => matches.map((match) => [...match]);

/** @param assemblies - Assemblies. @returns Them as the generator writes them. */
const edges = (assemblies: readonly EdgeAssembly[]): (number | string | null)[][][] =>
  assemblies.map((assembly) => assembly.map(([u, v, locU, locV]) => [u, v, loc(locU), loc(locV)]));

/** @param record - A product. @param fragments - What went into it. @returns It as the generator records it. */
function snap(record: Dseqrecord, fragments: readonly Fragment[]): unknown {
  const source = record.source as AssemblySource | null;
  return {
    watson: record.dseq.watson, crick: record.dseq.crick, ovhg: record.dseq.ovhg, circular: record.circular,
    code: record.dseq.code, id: record.id, name: record.name, description: record.description,
    features: record.features.map((feature) => ({
      loc: loc(feature.location), type: feature.type,
      qualifiers: Object.fromEntries([...feature.qualifiers.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
    })),
    source: source === null ? null : {
      type: source.kind, circular: source.circular,
      input: source.input.map((input) => ({
        sequence: indexOf(input.sequence, fragments), rc: input.reverseComplemented,
        left: loc(input.leftLocation), right: loc(input.rightLocation),
      })),
    },
  };
}

/** @param fragment - An input. @param fragments - All of them. @returns Which one it is. */
function indexOf(fragment: Fragment, fragments: readonly Fragment[]): number {
  const found = fragments.indexOf(fragment);
  if (found >= 0) return found;
  // A product whose primers were marked carries copies of its inputs, so they are found by what they are.
  const key = (one: Fragment): string => `${one.seq?.toString() ?? ""}|${one.id ?? ""}|${one.name}|${one.constructor.name}`;
  return fragments.findIndex((one) => key(one) === key(fragment));
}

/** @param graph - An assembly's graph. @returns Its edges as the generator records them. */
const graphOf = (assembly: Assembly): unknown[][] =>
  [...assembly.graph.edges()].map((edge) => [edge.from, edge.to, edge.key, edge.data.uid]);

/** The overlap finders the generator names. */
const ALGORITHMS: Record<string, AssemblyAlgorithm> = {
  common_sub_strings: commonSubStrings,
  gibson_overlap: gibsonOverlap,
  in_fusion_overlap: inFusionOverlap,
  pcr_fusion_overlap: pcrFusionOverlap,
  sticky: (x, y) => stickyEndSubStrings(x, y, false),
  sticky_partial: (x, y) => stickyEndSubStrings(x, y, true),
  sticky_blunt: (x, y) => [...stickyEndSubStrings(x, y, false), ...bluntOverlap(x, y)],
};

describe("the overlap finders", () => {
  const cases = golden["algorithms"]!;
  it(`find what pydna finds (${cases.length} pairs)`, () => {
    for (const one of cases) {
      const x = build(one["x"] as Spec);
      const y = build(one["y"] as Spec);
      const where = `${JSON.stringify(one["x"])} / ${JSON.stringify(one["y"])}`;
      for (const [key, want] of Object.entries((one["runs"] ?? {}) as Record<string, Guarded<unknown>>)) {
        const [name, limitText, trim] = key.split(":");
        const limit = Number(limitText);
        const run = (): number[][] => {
          if (name === "common_sub_strings") return plain(commonSubStrings(x as Dseqrecord, y as Dseqrecord, limit));
          if (name === "terminal_overlap") return plain(terminalOverlap(x as Dseqrecord, y as Dseqrecord, limit, trim === "None" ? null : trim!));
          if (name === "gibson_overlap") return plain(gibsonOverlap(x as Dseqrecord, y as Dseqrecord, limit));
          if (name === "in_fusion_overlap") return plain(inFusionOverlap(x as Dseqrecord, y as Dseqrecord, limit));
          if (name === "pcr_fusion_overlap") return plain(pcrFusionOverlap(x as Dseqrecord, y as Dseqrecord, limit));
          if (name === "sticky_end_sub_strings") return plain(stickyEndSubStrings(x as Dseqrecord, y as Dseqrecord, limitText === "True"));
          if (name === "blunt_overlap") return plain(bluntOverlap(x as Dseqrecord, y as Dseqrecord));
          throw new Error(`unknown finder ${name}`);
        };
        same(guard(run), want, `${name} ${key} on ${where}`);
      }
      for (const [key, want] of Object.entries((one["restriction"] ?? {}) as Record<string, Guarded<unknown>>)) {
        const parts = key.split(":");
        const reversed = parts[0] === "rev";
        const [partial, blunt] = parts.slice(reversed ? 1 : 0);
        const batch = (one["enzymes"] as string[]).map((name) => enzymes[name]!);
        const run = (): number[][] => plain(restrictionLigationOverlap(
          (reversed ? y : x) as Dseqrecord, (reversed ? x : y) as Dseqrecord, batch, partial === "True", blunt === "True"));
        same(guard(run), want, `restriction ${key} on ${where}`);
      }
      for (const [key, want] of Object.entries((one["primer_template"] ?? {}) as Record<string, Guarded<unknown>>)) {
        const [kind, limitText, mismatchText] = key.split(":");
        const limit = Number(limitText);
        const mismatches = Number(mismatchText);
        const run = (): number[][] => {
          if (kind === "fwd") return plain(primerTemplateOverlap(x, y, limit, mismatches));
          if (kind === "rvs") return plain(primerTemplateOverlap(y, (x as Primer).reverseComplement(), limit, mismatches));
          return plain(primerTemplateOverlap(y.reverseComplement(), (x as Primer).reverseComplement(), limit, mismatches));
        };
        same(guard(run), want, `primer ${key} on ${where}`);
      }
    }
  });
});

describe("the helpers", () => {
  const cases = golden["utils"]!;
  it(`answer as pydna's do (${cases.length} cases)`, () => {
    for (const one of cases) {
      const fn = one["fn"] as string;
      const where = `${fn} ${JSON.stringify(one).slice(0, 160)}`;
      if (fn === "location_overlap") {
        const [s1, e1] = one["a"] as [number, number];
        const [s2, e2] = one["b"] as [number, number];
        const n = one["n"] as number;
        same(guard(() => {
          const first = createLocation(s1, e1, n);
          const second = createLocation(s2, e2, n);
          const found = locationOverlap(first, second, n);
          return [loc(first), loc(second), [found.rightOverlap, found.leftOverlap, found.contained],
                  locationsOverlap(first, second, n)];
        }), one["result"] as Guarded<unknown>, where);
      } else if (fn === "create_location") {
        const [start, end, lim, strand] = one["args"] as [number, number, number, number | null];
        same(guard(() => {
          const made = createLocation(start, end, lim, strand as 1 | -1 | 0 | null);
          return [loc(made), made.parts.map((part) => [Number(part.start), Number(part.end), part.strand])];
        }), one["result"] as Guarded<unknown>, where);
      } else if (fn === "cuts_overlap") {
        const a = one["a"] as [number, number] | null;
        const b = one["b"] as [number, number] | null;
        same(guard(() => cutsOverlap(a === null ? null : { watson: a[0], ovhg: a[1] },
                                    b === null ? null : { watson: b[0], ovhg: b[1] }, one["n"] as number)),
             one["result"] as Guarded<unknown>, where);
      } else if (fn === "cutsite_to_location") {
        const cut = one["cut"] as [number, number] | null;
        same(guard(() => loc(cutsiteToLocation(cut === null ? null : { watson: cut[0], ovhg: cut[1] }, one["n"] as number))),
             one["result"] as Guarded<unknown>, where);
      } else if (fn === "sum_is_sticky") {
        const a = one["a"] as [string, string];
        const b = one["b"] as [string, string];
        const want = one["result"] as Guarded<unknown>[];
        same(guard(() => sumIsSticky(a, b, false)), want[0]!, `${where} strict`);
        same(guard(() => sumIsSticky(a, b, true)), want[1]!, `${where} partial`);
      } else if (fn === "is_sublist") {
        const part = one["sub"] as unknown[];
        const whole = one["list"] as unknown[];
        const want = one["result"] as Guarded<unknown>[];
        const equal = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
        same(guard(() => isSublist(part, whole, false, equal)), want[0]!, `${where} plain`);
        same(guard(() => isSublist(part, whole, true, equal)), want[1]!, `${where} cyclic`);
      } else if (fn === "circular_permutation_min_abs") {
        same(guard(() => circularPermutationMinAbs(one["list"] as number[])), one["result"] as Guarded<unknown>, where);
      } else if (fn === "deduplicate") {
        const items = one["items"] as unknown[];
        const want = one["result"] as Guarded<unknown>[];
        same(guard(() => deduplicate(items)), want[0]!, `${where} hashable`);
        same(guard(() => deduplicate(items, (a, b) => JSON.stringify(a) === JSON.stringify(b))), want[1]!, `${where} not`);
      } else if (fn === "gather_overlapping_locations") {
        const n = one["n"] as number;
        const spans = one["spans"] as [number, number][];
        same(guard(() => gatherOverlappingLocations(spans.map(([s, e]) => createLocation(s, e, n)), n)
                           .map((group) => group.map(loc))), one["result"] as Guarded<unknown>, where);
      } else if (fn === "assembly_strings") {
        const fragments = (one["frags"] as Spec[]).map(build);
        const assembly = new Assembly(fragments, one["limit"] as number, ALGORITHMS[one["algorithm"] as string]!, false, true);
        const kind = one["kind"] as "linear" | "circular" | "insertion";
        const get = { linear: "getLinearAssemblies", circular: "getCircularAssemblies", insertion: "getInsertionAssemblies" }[kind];
        const found = (assembly as unknown as Record<string, () => EdgeAssembly[]>)[get]!();
        const wanted = found.find((candidate) => JSON.stringify(candidate.map(([u, v, a, b]) => [u, v, loc(a), loc(b)])) === JSON.stringify(one["assembly"]));
        expect(wanted, `${where} assembly present`).toBeDefined();
        const want = one["result"] as Record<string, Guarded<unknown>>;
        const pieces = edgeToSubFragment(wanted!, kind === "circular");
        same(guard(() => assemblyToString(wanted!)), want["str"]!, `${where} str`);
        same(guard(() => assemblyToStringTuple(wanted!)), want["str_tuple"]!, `${where} str_tuple`);
        same(guard(() => assemblyHasMismatches(fragments, wanted!)), want["mismatches"]!, `${where} mismatches`);
        same(guard(() => pieces.map(([node, a, b]) => [node, loc(a), loc(b)])), want["subfragments"]!, `${where} subfragments`);
        same(guard(() => subFragmentToEdge(pieces, kind === "circular").map(([u, v, a, b]) => [u, v, loc(a), loc(b)])),
             want["round_trip"]!, `${where} round trip`);
      } else if (fn === "limit_iterator") {
        same(guard(() => [...limitIterator([1, 2, 3], one["limit"] as number)]), one["result"] as Guarded<unknown>, where);
      } else if (fn === "ends_from_cutsite") {
        const sequence = new Dseq(one["seq"] as string, null, null, one["circular"] as boolean);
        const batch = (one["enzymes"] as string[]).map((name) => enzymes[name]!);
        same(guard(() => getCutsites(sequence, ...batch).map((cut) => [[cut.watson, cut.ovhg], String(cut.enzyme),
                                                                     endsFromCutsite(cut, sequence)])),
             one["result"] as Guarded<unknown>, where);
      } else if (fn === "ends_from_cutsite_none") {
        same(guard(() => endsFromCutsite(null, new Dseq("ACGT"))), one["result"] as Guarded<unknown>, where);
      } else if (fn === "zip_match") {
        const record = new Dseqrecord(one["seq"] as string, one["circular"] as boolean);
        const primer = new Dseqrecord(one["primer"] as string);
        const match = one["match"] as Overlap;
        const want = one["result"] as Record<string, Guarded<unknown>>;
        same(guard(() => [...zipMatchLeftwards(record, primer, match)]), want["left"]!, `${where} left`);
        same(guard(() => [...zipMatchRightwards(record, primer, match)]), want["right"]!, `${where} right`);
        same(guard(() => [uppercaseDnaString(record), uppercaseDnaString(primer)]), want["text"]!, `${where} text`);
      } else if (fn === "max_assemblies") {
        const fragments = (one["frags"] as Spec[]).map(build);
        const assembly = new Assembly(fragments, one["limit"] as number, commonSubStrings, false, false);
        for (const [key, want] of Object.entries(one["result"] as Record<string, Guarded<unknown>[]>)) {
          const max = Number(key);
          same(guard(() => assembly.getLinearAssemblies(false, max).length), want[0]!, `${where} linear ${key}`);
          same(guard(() => assembly.getCircularAssemblies(false, max).length), want[1]!, `${where} circular ${key}`);
          same(guard(() => assembly.getInsertionAssemblies(false, max).length), want[2]!, `${where} insertion ${key}`);
        }
      }
    }
  });
});

describe("Assembly", () => {
  const cases = golden["assembly"]!;
  it(`finds what pydna finds (${cases.length} sets of fragments)`, () => {
    for (const one of cases) {
      const fragments = (one["frags"] as Spec[]).map(build);
      const algorithm = ALGORITHMS[one["algorithm"] as string]!;
      const limit = one["limit"] as number | null;
      const where = `${one["algorithm"]} limit=${limit} order=${one["use_fragment_order"]} all=${one["use_all_fragments"]} on ${JSON.stringify(one["frags"]).slice(0, 120)}`;
      const made = guard(() => new Assembly(fragments, limit, algorithm, one["use_fragment_order"] as boolean,
                                            one["use_all_fragments"] as boolean));
      if (one["init"] !== undefined) {
        same(made, one["init"] as Guarded<unknown>, `${where} init`);
        continue;
      }
      expect("value" in made, `${where} built`).toBe(true);
      const assembly = (made as { value: Assembly }).value;
      if (one["repr"] !== null) expect(assembly.toString(), `${where} repr`).toBe(one["repr"]);
      expect(graphOf(assembly), `${where} graph`).toEqual(one["graph"]);
      for (const kind of ["linear", "circular", "insertion"] as const) {
        for (const adjacent of [false, true]) {
          const key = `${kind}:${adjacent ? "True" : "False"}`;
          const method = { linear: "getLinearAssemblies", circular: "getCircularAssemblies", insertion: "getInsertionAssemblies" }[kind];
          same(guard(() => edges((assembly as unknown as Record<string, (a: boolean) => EdgeAssembly[]>)[method]!(adjacent))),
               one[key] as Guarded<unknown>, `${where} ${key}`);
        }
        const products = one[`${kind}:products`] as Guarded<unknown> | undefined;
        if (products === undefined) continue;
        const build2 = { linear: "assembleLinear", circular: "assembleCircular", insertion: "assembleInsertion" }[kind];
        same(guard(() => (assembly as unknown as Record<string, () => Dseqrecord[]>)[build2]!()
                           .map((product) => snap(product, fragments))), products, `${where} ${kind} products`);
      }
      same(guard(() => Object.fromEntries([...assembly.getLocationsOnFragments()].map(([node, sides]) =>
             [String(node), { left: sides.left.map(loc), right: sides.right.map(loc) }]))),
           one["locations"] as Guarded<unknown>, `${where} locations`);
    }
  });
});

describe("PCRAssembly", () => {
  const cases = golden["pcr"]!;
  it(`finds what pydna finds (${cases.length} reactions)`, () => {
    for (const one of cases) {
      const fragments = (one["frags"] as Spec[]).map(build);
      const limit = one["limit"] as number;
      const mismatches = one["mismatches"] as number;
      const where = `limit=${limit} mismatches=${mismatches} on ${JSON.stringify(one["frags"]).slice(0, 140)}`;
      const made = guard(() => new PCRAssembly(fragments, limit, mismatches));
      if (one["init"] !== undefined) {
        same(made.exc === undefined ? { value: null } : made, one["init"] as Guarded<unknown>, `${where} init`);
        continue;
      }
      const assembly = (made as { value: PCRAssembly }).value;
      expect(graphOf(assembly), `${where} graph`).toEqual(one["graph"]);
      same(guard(() => edges(assembly.getLinearAssemblies())), one["linear"] as Guarded<unknown>, `${where} linear`);
      same(guard(() => assembly.assembleLinear().map((product) => snap(product, fragments))),
           one["products"] as Guarded<unknown>, `${where} products`);
      const refused = one["refused"] as Guarded<unknown>[];
      same(guard(() => assembly.getLinearAssemblies(true)), refused[0]!, `${where} adjacent`);
      same(guard(() => assembly.getCircularAssemblies()), refused[1]!, `${where} circular`);
      same(guard(() => assembly.getInsertionAssemblies()), refused[2]!, `${where} insertion`);
      for (const add of [false, true]) {
        const fresh = (one["frags"] as Spec[]).map(build);
        const annealing = limit - mismatches > 0 ? limit - mismatches : limit;
        same(guard(() => pcrAssembly(fresh[1]!, fresh[0] as Primer, fresh[2] as Primer, add, annealing, mismatches)
                           .map((product) => snap(product, fresh))),
             one[`pcr_assembly:${add ? "True" : "False"}`] as Guarded<unknown>, `${where} pcr_assembly add=${add}`);
      }
    }
  });
});

describe("SingleFragmentAssembly", () => {
  const cases = golden["single"]!;
  it(`finds what pydna finds (${cases.length} fragments)`, () => {
    for (const one of cases) {
      const fragments = (one["frags"] as Spec[]).map(build);
      const algorithm = ALGORITHMS[one["algorithm"] as string]!;
      const limit = one["limit"] as number | null;
      const where = `${one["algorithm"]} limit=${limit} on ${JSON.stringify(one["frags"]).slice(0, 120)}`;
      const made = guard(() => new SingleFragmentAssembly(fragments, limit, algorithm));
      if (one["init"] !== undefined) {
        same(made.exc === undefined ? { value: null } : made, one["init"] as Guarded<unknown>, `${where} init`);
        continue;
      }
      const assembly = (made as { value: SingleFragmentAssembly }).value;
      expect(graphOf(assembly), `${where} graph`).toEqual(one["graph"]);
      for (const kind of ["circular", "insertion", "inversion"] as const) {
        const get = { circular: "getCircularAssemblies", insertion: "getInsertionAssemblies", inversion: "getInversionAssemblies" }[kind];
        const make = { circular: "assembleCircular", insertion: "assembleInsertion", inversion: "assembleInversion" }[kind];
        same(guard(() => edges((assembly as unknown as Record<string, () => EdgeAssembly[]>)[get]!())),
             one[kind] as Guarded<unknown>, `${where} ${kind}`);
        same(guard(() => (assembly as unknown as Record<string, () => Dseqrecord[]>)[make]!()
                           .map((product) => snap(product, fragments))),
             one[`${kind}:products`] as Guarded<unknown>, `${where} ${kind} products`);
      }
      same(guard(() => assembly.getLinearAssemblies()), one["linear"] as Guarded<unknown>, `${where} linear`);
      same(guard(() => assembly.getInsertionAssemblies(true)), one["insertion:adjacent"] as Guarded<unknown>, `${where} insertion adjacent`);
    }
  });
});

describe("the cloning methods", () => {
  const cases = golden["methods"]!;
  it(`make what pydna makes (${cases.length} runs)`, () => {
    for (const one of cases) {
      const fragments = (one["frags"] as Spec[]).map(build);
      const options = one["kwargs"] as Record<string, unknown>;
      const fn = one["fn"] as string;
      const where = `${fn} ${JSON.stringify(options)} on ${JSON.stringify(one["frags"]).slice(0, 120)}`;
      const batch = ((options["enzymes"] ?? []) as string[]).map((name) => enzymes[name]!);
      const limit = (options["limit"] ?? 25) as number;
      const circularOnly = (options["circular_only"] ?? false) as boolean;
      const run = (): unknown[] => {
        const made =
          fn === "gibson_assembly" ? gibsonAssembly(fragments, limit, circularOnly)
          : fn === "in_fusion_assembly" ? inFusionAssembly(fragments, limit, circularOnly)
          : fn === "fusion_pcr_assembly" ? fusionPcrAssembly(fragments, limit, circularOnly)
          : fn === "in_vivo_assembly" ? inVivoAssembly(fragments, limit, circularOnly)
          : fn === "ligation_assembly" ? ligationAssembly(fragments, (options["allow_blunt"] ?? false) as boolean,
                                                          (options["allow_partial_overlap"] ?? false) as boolean, circularOnly)
          : fn === "restriction_ligation_assembly" ? restrictionLigationAssembly(fragments, batch, (options["allow_blunt"] ?? true) as boolean, circularOnly)
          : goldenGateAssembly(fragments, batch, (options["allow_blunt"] ?? true) as boolean, circularOnly);
        return made.map((product) => snap(product, fragments));
      };
      same(guard(run), one["result"] as Guarded<unknown>, where);
    }
  });
});

describe("Primer", () => {
  const cases = golden["primer"]!;
  it(`behaves as pydna's does (${cases.length} cases)`, () => {
    for (const one of cases) {
      const want = one["result"] as Guarded<Record<string, unknown>>;
      const where = `primer ${JSON.stringify(one).slice(0, 120)}`;
      /** @param primer - A primer. @returns It as the generator records one. */
      const shown = (primer: Primer): unknown => ({
        seq: primer.seq?.toString() ?? "", id: primer.id, name: primer.name, footprint: primer.footprint,
        tail: primer.tail, fp: primer.fp, repr: primer.repr(), len: primer.length,
        position: primer.position, amplicon: primer.amplicon,
      });
      const run = (): unknown => {
        if (one["from"] === "seq" || one["from"] === "record" || one["from"] === "dseqrecord") {
          const made = one["from"] === "dseqrecord"
            ? new Primer(new Dseqrecord("ACGTACGT", null, undefined, "a", "b"))
            : new Primer("ACGTACGT", "a", "b", "description", null, null, null,
                         one["from"] === "record" ? { footprint: 3 } : {});
          return shown(made);
        }
        const text = one["text"] as string;
        const footprint = one["footprint"] as number;
        const primer = new Primer(text, "pid", "pname", "description", null, null, null, { footprint });
        const out: Record<string, unknown> = { new: shown(primer), rc: shown(primer.reverseComplement()) };
        out["slices"] = Object.fromEntries((["0:5", "2:None", "None:-3", "-6:None", "5:2", "None:None"]).map((key) => {
          const [from, to] = key.split(":").map((part) => (part === "None" ? null : Number(part)));
          return [key, guard(() => shown(primer.slice(from, to)))];
        }));
        out["index"] = guard(() => primer.at(0));
        out["radd"] = guard(() => shown(primer.radd("tttt") as unknown as Primer));
        return out;
      };
      same(guard(run), want, where);
    }
  });
});
