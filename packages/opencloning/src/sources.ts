/**
 * The steps of a plan: writing one down, reading one back, and running it again.
 *
 * A step records which molecules went in, which way round, and where each was joined. That is enough to
 * run the whole thing again from the inputs — which is the point. A plan that cannot be replayed is a
 * claim; one that can is evidence.
 */

import { ValueError } from "@biolibs/core";
import type { Dseq, Enzymes } from "@biolibs/dseq";
import type { Dseqrecord } from "@biolibs/dseqrecord";
import { enzymes as enzymesByName } from "@biolibs/restriction";
import { type AssemblySource, type Fragment, Primer, type SourceInput, fusionPcrAssembly, gibsonAssembly,
         inFusionAssembly, inVivoAssembly, ligationAssembly, pcrAssembly, restrictionLigationAssembly,
         AssemblySource as EngineSource } from "@biolibs/assembly2";
import { locationText, textToPlainLocation } from "./locations.js";
import { SOURCE_TYPES, type SourceModel } from "./model.js";

/** How a step reaches the molecules it was given: by the identifier each carries in the plan. */
export type LookUp = (fragment: Fragment) => number;

/**
 * Write a step into a plan.
 *
 * @param source - The step, as the engine recorded it.
 * @param id - The identifier of the molecule it makes.
 * @param idOf - Which identifier each input carries.
 * @returns The step as the plan holds it.
 */
export function sourceModelOf(source: AssemblySource, id: number, idOf: LookUp): SourceModel {
  const model: SourceModel = {
    id,
    type: source.kind,
    output_name: null,
    database_id: null,
    input: source.input.map((input) => (input.assemblyFragment
      ? {
          type: "AssemblyFragment" as const,
          sequence: idOf(input.sequence),
          left_location: input.leftLocation === null ? null : locationText(input.leftLocation),
          right_location: input.rightLocation === null ? null : locationText(input.rightLocation),
          reverse_complemented: input.reverseComplemented,
        }
      : { type: "SourceInput" as const, sequence: idOf(input.sequence) })),
    circular: source.circular,
  };
  if (source.restrictionEnzymes !== null) {
    model.restriction_enzymes = source.restrictionEnzymes.map((enzyme) => String(enzyme));
  }
  if (source.addPrimerFeatures !== null) model.add_primer_features = source.addPrimerFeatures;
  return model;
}

/**
 * Read a step out of a plan.
 *
 * @param model - The step as the plan holds it.
 * @param records - The molecules of the plan, by identifier.
 * @param primers - Its primers, by identifier.
 * @returns The step, as the engine records one.
 * @throws `ValueError` for an input the plan does not hold, or an enzyme that is not known.
 */
export function sourceFromModel(model: SourceModel, records: Map<number, Dseqrecord>,
                                primers: Map<number, Primer>): AssemblySource {
  const input: SourceInput[] = model.input.map((one) => {
    const sequence = records.get(one.sequence) ?? primers.get(one.sequence);
    if (sequence === undefined) throw new ValueError(`Sequence/Primer with id ${one.sequence} not found`);
    if (one.type === "SourceInput") {
      return { sequence, reverseComplemented: false, leftLocation: null, rightLocation: null, assemblyFragment: false };
    }
    return {
      sequence,
      reverseComplemented: one.reverse_complemented,
      leftLocation: one.left_location === null ? null : textToPlainLocation(one.left_location),
      rightLocation: one.right_location === null ? null : textToPlainLocation(one.right_location),
      assemblyFragment: true,
    };
  });
  const source = new EngineSource(input, model.circular ?? false);
  (source as { kind: string }).kind = model.type;
  if (model.restriction_enzymes !== undefined) {
    source.restrictionEnzymes = model.restriction_enzymes.map((name) => {
      const enzyme = (enzymesByName as Record<string, Enzymes | undefined>)[name];
      if (enzyme === undefined) throw new ValueError(`module 'Bio.Restriction' has no attribute '${name}'`);
      return enzyme;
    });
  }
  if (model.add_primer_features !== undefined) source.addPrimerFeatures = model.add_primer_features;
  return source;
}

/**
 * The molecules a step hands its replay.
 *
 * An insertion is recorded with the molecule it goes into at both ends, so for a replay the repeat at
 * the end is dropped.
 *
 * @param source - The step. @param handleInsertion - Whether to drop that repeat.
 * @returns The molecules, in order.
 */
export function inputSequences(source: AssemblySource, handleInsertion = true): Dseqrecord[] {
  const records = source.input.map((input) => input.sequence).filter((one) => !(one instanceof Primer)) as Dseqrecord[];
  if (handleInsertion && records.length > 1 && records[0] === records[records.length - 1]) return records.slice(0, -1);
  return records;
}

/** @param source - A step. @returns The primers it used, in order. */
export function inputPrimers(source: AssemblySource): Primer[] {
  return source.input.map((input) => input.sequence).filter((one) => one instanceof Primer) as Primer[];
}

/**
 * The shortest stretch any two of a step's fragments shared, which is the limit its replay runs at.
 *
 * @param source - The step.
 * @returns How many bases.
 * @throws `ValueError` if the step records no stretches at all.
 */
export function minimalOverlap(source: AssemblySource): number {
  const lengths: number[] = [];
  for (const input of source.input) {
    if (!input.assemblyFragment) continue;
    if (input.leftLocation !== null) lengths.push(lengthOf(input.leftLocation));
    if (input.rightLocation !== null) lengths.push(lengthOf(input.rightLocation));
  }
  if (lengths.length === 0) throw new ValueError("Assembly is not complete");
  return Math.min(...lengths);
}

/** @param location - A stretch. @returns How many bases it covers. */
function lengthOf(location: { parts: { start: unknown; end: unknown }[] }): number {
  return location.parts.reduce((total, part) => total + (Number(part.end) - Number(part.start)), 0);
}

/**
 * Run a step again from its inputs.
 *
 * @param source - The step.
 * @param handleInsertion - Whether to treat it as an insertion, dropping the repeated fragment.
 * @returns Everything that step would make.
 * @throws `ValueError` for a step this package cannot run again.
 */
export function replayProducts(source: AssemblySource, handleInsertion = true): Dseqrecord[] {
  const records = inputSequences(source, handleInsertion);
  switch (source.kind) {
    case SOURCE_TYPES.gibson:
      return gibsonAssembly(records, minimalOverlap(source));
    case SOURCE_TYPES.inFusion:
      return inFusionAssembly(records, minimalOverlap(source));
    case SOURCE_TYPES.fusionPcr:
      return fusionPcrAssembly(records, minimalOverlap(source));
    case SOURCE_TYPES.inVivo:
      return inVivoAssembly(records, minimalOverlap(source));
    case SOURCE_TYPES.ligation:
      // A recorded overlap of nothing means the ends were blunt.
      return ligationAssembly(records, minimalOverlap(source) === 0, true);
    case SOURCE_TYPES.restrictionAndLigation:
      return restrictionLigationAssembly(records, source.restrictionEnzymes ?? []);
    case SOURCE_TYPES.pcr: {
      const primers = inputPrimers(source);
      return pcrAssembly(records[0]!, primers[0]!, primers[1]!, source.addPrimerFeatures ?? false,
                         minimalOverlap(source));
    }
    default:
      throw new ValueError(`_replay_products() not implemented for ${source.kind}`);
  }
}

/** @param a - One step. @param b - Another. @returns Whether they record the same thing. */
export function sameSource(a: AssemblySource, b: AssemblySource): boolean {
  if (a.kind !== b.kind || a.circular !== b.circular) return false;
  if ((a.addPrimerFeatures ?? null) !== (b.addPrimerFeatures ?? null)) return false;
  const enzymesOf = (source: AssemblySource): string =>
    (source.restrictionEnzymes ?? []).map((enzyme) => String(enzyme)).join(",");
  if (enzymesOf(a) !== enzymesOf(b)) return false;
  if (a.input.length !== b.input.length) return false;
  return a.input.every((input, at) => {
    const other = b.input[at]!;
    return input.sequence === other.sequence
      && input.reverseComplemented === other.reverseComplemented
      && String(input.leftLocation) === String(other.leftLocation)
      && String(input.rightLocation) === String(other.rightLocation);
  });
}

/**
 * @param a - One molecule. @param b - Another.
 * @returns Whether they are the same molecule, which takes no notice of case: a molecule written into a
 * plan comes back in lower case, because that is how GenBank writes one.
 */
function sameMolecule(a: Dseq, b: Dseq): boolean {
  return a.equals(b);
}

/**
 * Run a step again and check that the molecule the plan claims really comes out of it.
 *
 * A step that records no inputs is something brought in from outside, and there is nothing to check.
 *
 * @param source - The step. @param result - What the plan says it made.
 * @throws `ValueError` naming the step, if nothing it makes is that molecule.
 */
export function validateSource(source: AssemblySource, result: Dseqrecord): void {
  if (source.input.length === 0) return;
  // An assembly is tried as an insertion first, and then plainly, because the two differ only in
  // whether the fragment at both ends is one fragment or two.
  const products = replayProducts(source, true);
  try {
    checkAmong(source, result, products);
  } catch (error) {
    if (!(error instanceof ValueError)) throw error;
    checkAmong(source, result, replayProducts(source, false));
  }
}

/** @param source - The step. @param result - The claim. @param products - What the replay made. */
function checkAmong(source: AssemblySource, result: Dseqrecord, products: Dseqrecord[]): void {
  const matched = products.some((product) =>
    sameMolecule(product.dseq, result.dseq) && sameSource(product.source as AssemblySource, source));
  if (!matched) {
    throw new ValueError(`Result sequence does not match any of the ${products.length} product(s) from ${source.kind}`);
  }
}

/**
 * Run a step again and hand back its own product, the one that is the same molecule as the plan's.
 *
 * The molecules are matched by checksum, which does not care where a circle was cut open or which
 * strand is called the upper one, so this finds the product even when the plan's copy was rotated.
 *
 * @param source - The step. @param result - What the plan says it made.
 * @returns The replay's product, under the plan's name and identifier.
 * @throws `ValueError` naming the step, if nothing it makes has that checksum.
 */
export function normalizeSource(source: AssemblySource, result: Dseqrecord): Dseqrecord {
  if (source.input.length === 0) return result;
  let product: Dseqrecord;
  try {
    product = byChecksum(source, result, replayProducts(source, true));
  } catch (error) {
    if (!(error instanceof ValueError)) throw error;
    product = byChecksum(source, result, replayProducts(source, false));
  }
  product.name = result.name;
  product.id = result.id;
  return product;
}

/** @param source - The step. @param result - The claim. @param products - The replay's. @returns The match. */
function byChecksum(source: AssemblySource, result: Dseqrecord, products: Dseqrecord[]): Dseqrecord {
  const wanted = result.seguid();
  const found = products.find((product) => product.seguid() === wanted);
  if (found === undefined) {
    throw new ValueError(`No product with matching seguid among ${products.length} product(s) from ${source.kind}`);
  }
  return found;
}
