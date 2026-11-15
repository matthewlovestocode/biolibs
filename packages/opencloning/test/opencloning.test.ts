/**
 * Replays the cloning-plan golden cases (reference/golden/gen_opencloning_cases.py) recorded from pydna.
 *
 * Each case is a plan: some molecules, a step or two, and a product. What is compared is the document
 * the plan serialises to, the molecules read back out of it, the printed history, and — the part that
 * matters — the verdict when every step is run again, both for a product that really follows from its
 * inputs and for one that does not.
 */
import { readFileSync } from "node:fs";
import { captureWarnings } from "@biolibs/core";
import { Dseqrecord } from "@biolibs/dseqrecord";
import { enzymes } from "@biolibs/restriction";
import { Primer, fusionPcrAssembly, gibsonAssembly, inFusionAssembly, inVivoAssembly, ligationAssembly,
         pcrAssembly, restrictionLigationAssembly, createLocation, type Fragment } from "@biolibs/assembly2";
import { CloningStrategy, type CloningStrategyDocument, history, inputPrimers, inputSequences, locationText,
         minimalOverlap, rangeText, textToLocation, validateHistory } from "@biolibs/opencloning";
import type { SimpleLocation } from "@biolibs/seqfeature";
import { describe, expect, it } from "vitest";

/** One input, as the generator writes it. */
type Spec = { watson: string; circular: boolean; name: string; id: string } | { primer: string; name: string; id: string };
/** A value, or the error it raised, with any warnings. */
type Guarded<T> = ({ value: T } | { exc: { type: string; msg: string } }) & { warnings?: [string, string][] };

const golden = JSON.parse(readFileSync(new URL("./golden/opencloning.json", import.meta.url), "utf8")) as {
  plans: { name: string; inputs: Spec[]; description: string; wrong: string; result: Guarded<Record<string, unknown>> }[];
  locations: Record<string, unknown>[];
  pieces: { name: string; result: Guarded<Record<string, unknown>> }[];
  official: { name: string; document: CloningStrategyDocument; unchanged: boolean; source_types: string[] }[];
};

/** @param spec - An input. @returns The molecule or primer it stands for. */
function build(spec: Spec): Fragment {
  if ("primer" in spec) return new Primer(spec.primer, spec.id, spec.name);
  return new Dseqrecord(spec.watson, spec.circular, undefined, spec.id, spec.name);
}

/** @param fn - What to run. @returns Its value or its error, with any warnings. */
function guard<T>(fn: () => T): Guarded<unknown> {
  const { result, error, warnings } = captureWarnings(fn);
  const out: Guarded<unknown> = error === undefined
    ? { value: result === undefined ? null : result }
    : { exc: { type: (error as Error).name, msg: (error as Error).message } };
  if (warnings.length > 0) out.warnings = warnings.map((one) => [one.category, one.message] as [string, string]);
  return out;
}

/** @param record - A molecule. @returns Enough of it to pin it down, as the generator records it. */
function snap(record: Dseqrecord): unknown {
  const source = record.source as { kind?: string } | null;
  return {
    watson: record.dseq.watson, crick: record.dseq.crick, ovhg: record.dseq.ovhg, circular: record.circular,
    id: record.id, name: record.name, seguid: record.seguid(),
    features: record.features.map((feature) => [String(feature.location), feature.type]),
    source: source === null || source === undefined ? null : source.kind,
  };
}

/** Each plan, built the way the generator builds it. */
const PLANS: Record<string, (fragments: Fragment[]) => Dseqrecord[]> = {
  gibson_three: (f) => gibsonAssembly(f, 25, true),
  gibson_two: (f) => gibsonAssembly(f, 25),
  in_fusion: (f) => inFusionAssembly(f, 25, true),
  fusion_pcr: (f) => fusionPcrAssembly(f, 25, true),
  in_vivo: (f) => inVivoAssembly(f, 25, true),
  ligation: (f) => {
    const pieces = (f[0] as Dseqrecord).cut(enzymes["EcoRI"]!);
    pieces.forEach((piece, at) => {
      piece.id = String(10 + at);
      piece.name = `piece${at + 1}`;
      piece.source = null;
    });
    return ligationAssembly(pieces, false, false, true);
  },
  restriction_ligation: (f) => restrictionLigationAssembly(f, [enzymes["EcoRI"]!, enzymes["BamHI"]!], true, true),
  golden_gate: (f) => restrictionLigationAssembly(f, [enzymes["BsaI"]!], true, true),
  pcr: (f) => pcrAssembly(f[0]!, f[1] as Primer, f[2] as Primer, false, 14),
  pcr_features: (f) => pcrAssembly(f[0]!, f[1] as Primer, f[2] as Primer, true, 14),
  pcr_then_gibson: (f) => {
    const amplified = pcrAssembly(f[0]!, f[1] as Primer, f[2] as Primer, false, 20);
    if (amplified.length === 0) return [];
    amplified[0]!.id = "50";
    amplified[0]!.name = "amplicon";
    return gibsonAssembly([f[3]!, amplified[0]!], 20, true);
  },
  gibson_nested: (f) => {
    const first = gibsonAssembly(f.slice(0, 2), 25);
    if (first.length === 0) return [];
    first[0]!.id = "50";
    return gibsonAssembly([first[0]!, f[2]!], 25);
  },
  tampered: (f) => {
    const products = gibsonAssembly(f, 25, true);
    if (products.length === 0) return [];
    const product = products[0]!;
    const forged = new Dseqrecord(product.dseq.toString().slice(0, -3), true, undefined, "100", product.name);
    forged.source = product.source;
    return [forged];
  },
};

describe("a cloning plan", () => {
  for (const plan of golden.plans.filter((one) => one.name !== "reassign_ids")) {
    it(`${plan.name} is written, read and replayed as pydna does it`, () => {
      const want = (plan.result as { value: Record<string, unknown> }).value;
      const fragments = plan.inputs.map(build);
      const products = PLANS[plan.name]!(fragments);
      expect(products.length, "how many products").toBe(want["products"]);
      if (products.length === 0) return;
      products.forEach((product, at) => {
        product.id = String(100 + at);
      });

      const strategy = CloningStrategy.fromRecords(products, { description: plan.description });
      expect(strategy.document, "the document").toEqual(want["document"]);
      expect(history(products[0]!), "the history").toBe(want["history"]);
      expect(products.map(snap), "the products").toEqual(want["snaps"]);

      // Replaying: the product that follows from its inputs, and one that does not.
      expect(guard(() => validateHistory(products[0]!)), "replaying the plan").toEqual(want["validate"]);
      const wrong = new Dseqrecord(plan.wrong);
      expect(guard(() => validateSourceOf(products[0]!, wrong)), "replaying against another molecule")
        .toEqual(want["validate_wrong"]);

      // Everything below starts from a plan written afresh, as the generator does.
      const second = CloningStrategy.fromRecords(products, { description: plan.description });
      expect(guard(() => second.toRecords().map(snap)), "read back").toEqual(want["read_back"]);
      expect(guard(() => second.normalize().document), "normalised").toEqual(want["normalized"]);
      expect(guard(() => second.validate()), "the whole plan").toEqual(want["validate_strategy"]);
      expect(guard(() => second.idsOfSequencesThatAreNotInputs()), "what it ends with").toEqual(want["not_inputs"]);
      expect(guard(() => second.idsOfSequencesThatAreInputs()), "what went in").toEqual(want["inputs"]);
    });
  }
});

/** @param record - A product. @param other - Another molecule. Replays the step against that molecule. */
function validateSourceOf(record: Dseqrecord, other: Dseqrecord): void {
  const kept = other.source;
  other.source = record.source;
  try {
    validateHistory(Object.assign(Object.create(Object.getPrototypeOf(other) as object), other) as Dseqrecord);
  } finally {
    other.source = kept;
  }
}

describe("renumbering a plan", () => {
  it("sorts the identifiers and counts from one, as pydna renumbers one", () => {
    const plan = golden.plans.find((one) => one.name === "reassign_ids")!;
    const want = (plan.result as { value: Record<string, unknown> }).value;
    const fragments = plan.inputs.map(build);
    const products = gibsonAssembly(fragments, 25, true);
    products[0]!.id = "100";
    const strategy = CloningStrategy.fromRecords(products, { description: plan.description });
    expect(strategy.sequences.map((one) => one.id), "before").toEqual(want["before"]);
    strategy.reassignIds();
    expect(strategy.document, "after").toEqual(want["after"]);
    expect(Object.keys(strategy.document).sort(), "the plain form's keys").toEqual(want["dump_keys"]);
    expect(strategy.document.sequences.map((one) => one.id), "the plain form's identifiers").toEqual(want["dump_ids"]);
  });
});

describe("where two fragments were joined", () => {
  it("is written and read as pydna writes and reads it", () => {
    for (const one of golden.locations) {
      if (one["from_start_and_end"] !== undefined) {
        const [start, end, length] = one["from_start_and_end"] as [number, number, number];
        expect(guard(() => rangeText(start, end, length)), `${start}..${end} of ${length}`).toEqual(one["text"]);
        continue;
      }
      if (one["text_in"] !== undefined) {
        const text = one["text_in"] as string;
        expect(guard(() => String(textToLocation(text))), `parsing ${text}`).toEqual(one["parsed"]);
        continue;
      }
      const [start, end, length] = [one["start"] as number, one["end"] as number, one["length"] as number];
      const made = createSpan(start, end, length);
      expect(guard(() => locationText(made)), `${start}..${end} of ${length}`).toEqual(one["text"]);
      expect(guard(() => String(textToLocation(locationText(made)))), `${start}..${end} round trip`)
        .toEqual(one["round_trip"]);
    }
  });
});

/** @param start - Where it starts. @param end - Where it ends. @param length - The molecule's length. @returns The stretch. */
const createSpan = (start: number, end: number, length: number): SimpleLocation =>
  createLocation(start, end, length) as SimpleLocation;

describe("what a step hands its replay", () => {
  for (const piece of golden.pieces) {
    it(`${piece.name}: the inputs, the primers and the overlap`, () => {
      const plan = golden.plans.find((one) => one.name === piece.name)!;
      const fragments = plan.inputs.map(build);
      const products = PLANS[piece.name]!(fragments);
      const source = products[0]!.source as never;
      expect(guard(() => ({
        inputs_handled: inputSequences(source, true).map((one) => one.name),
        inputs_plain: inputSequences(source, false).map((one) => one.name),
        primers: inputPrimers(source).map((one) => one.name),
        overlap: minimalOverlap(source),
      }))).toEqual(piece.result);
    });
  }
});

describe("a plan written by the data model itself", () => {
  for (const one of golden.official) {
    it(`${one.name}: replays what opencloning_linkml emits`, () => {
      // The document here was handed to the library the OpenCloning data model is defined by and
      // written back out by it, so this is the format as that library understands it, not as this
      // port or pydna happens to write it.
      expect(one.unchanged, "the official library emitted it unchanged").toBe(true);
      const plan = CloningStrategy.fromDocument(one.document);
      expect(plan.sources.map((source) => source.type)).toEqual(one.source_types);
      plan.validate();
      expect(plan.toRecords().length).toBeGreaterThan(0);
    });

    it(`${one.name}: reads the same however the fields are ordered`, () => {
      // Nothing may depend on where a key happens to sit, since another tool writes them in its own order.
      const shuffle = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(shuffle);
        if (value !== null && typeof value === "object") {
          return Object.fromEntries([...Object.entries(value)].reverse().map(([k, v]) => [k, shuffle(v)]));
        }
        return value;
      };
      const plan = CloningStrategy.fromDocument(shuffle(one.document) as CloningStrategyDocument);
      plan.validate();
    });
  }
});
