/**
 * The cloning methods themselves: what a biologist asks for.
 *
 * Each one is the same engine with a different idea of where two fragments may join — a shared stretch
 * at the ends for Gibson, complementary overhangs for a ligation, the ends an enzyme would leave for
 * Golden Gate — and each labels its products with the method that made them.
 */

import { warn } from "@biolibs/core";
import { type CutSite, type Dseq, type Enzymes, getCutsitePairs, getCutsites } from "@biolibs/dseq";
import { type Dseqrecord, locationBoundaries } from "@biolibs/dseqrecord";
import { type AssemblyAlgorithm, bluntOverlap, combineAlgorithms, commonSubStrings, gibsonOverlap, inFusionOverlap,
         pcrFusionOverlap, restrictionLigationOverlap, stickyEndSubStrings } from "./algorithms.js";
import { type EdgeAssembly, assemble, filterLinearSubassemblies } from "./assemble.js";
import { type Fragment, isCircularFragment, textOf } from "./fragment.js";
import { Assembly } from "./assembly.js";
import { cutsiteToLocation } from "./locations.js";
import { deduplicate } from "./pyutils.js";
import { SingleFragmentAssembly } from "./single.js";
import { type AssemblySource, SOURCE_KINDS } from "./source.js";

/**
 * Run an assembly and take its products: circles, and the linear molecules that are not merely part of
 * one, and for a single fragment the splices and inversions it can make of itself.
 *
 * @param fragments - The fragments.
 * @param limit - The shortest overlap that counts.
 * @param algorithm - How to find overlaps.
 * @param circularOnly - Whether to keep only the circular products.
 * @param onlyAdjacentEdges - Whether a fragment may only be joined at neighbouring places on itself.
 * @returns The products.
 */
export function assemblyProducts(fragments: readonly Fragment[], limit: number | null, algorithm: AssemblyAlgorithm,
                                 circularOnly: boolean, onlyAdjacentEdges = false): Dseqrecord[] {
  const single = fragments.length === 1;
  const assembly = single
    ? new SingleFragmentAssembly(fragments, limit, algorithm)
    : new Assembly(fragments, limit, algorithm, false, true);
  let found: EdgeAssembly[] = assembly.getCircularAssemblies(onlyAdjacentEdges);
  if (!circularOnly && fragments.length > 1) {
    found = [...found, ...filterLinearSubassemblies(assembly.getLinearAssemblies(onlyAdjacentEdges), found, fragments)];
  }
  if (single) {
    const one = assembly as SingleFragmentAssembly;
    if (!circularOnly) {
      found = [...found, ...one.getInsertionAssemblies(), ...one.getInversionAssemblies()];
    } else if (isCircularFragment(fragments[0]!)) {
      found = [...found, ...one.getInversionAssemblies()];
    }
  }
  return found.map((one) => assemble(fragments, one));
}

/** @param products - The products. @param kind - The method that made them. @param extra - What that method records. @returns The products. */
function recast(products: Dseqrecord[], kind: string, extra: { restrictionEnzymes?: Enzymes[] } = {}): Dseqrecord[] {
  for (const product of products) product.source = (product.source as AssemblySource).recast(kind, extra);
  return products;
}

/**
 * Gibson assembly: fragments whose ends share a stretch are chewed back and joined.
 *
 * @param fragments - The fragments.
 * @param limit - How much the ends must share.
 * @param circularOnly - Whether to keep only the circular products.
 * @returns The products.
 * @example
 * ```ts
 * gibsonAssembly([backbone, insert], 25, true);   // the plasmid those two make
 * ```
 */
export function gibsonAssembly(fragments: readonly Fragment[], limit = 25, circularOnly = false): Dseqrecord[] {
  return recast(assemblyProducts(fragments, limit, gibsonOverlap, circularOnly), SOURCE_KINDS.gibson);
}

/**
 * In-Fusion: the same join as Gibson, with the other strand chewed back.
 *
 * @param fragments - The fragments. @param limit - How much the ends must share.
 * @param circularOnly - Whether to keep only the circular products.
 * @returns The products.
 */
export function inFusionAssembly(fragments: readonly Fragment[], limit = 25, circularOnly = false): Dseqrecord[] {
  return recast(assemblyProducts(fragments, limit, inFusionOverlap, circularOnly), SOURCE_KINDS.inFusion);
}

/**
 * Fusion PCR: fragments whose ends share a stretch are joined by extending one on the other.
 *
 * @param fragments - The fragments. @param limit - How much the ends must share.
 * @param circularOnly - Whether to keep only the circular products.
 * @returns The products.
 */
export function fusionPcrAssembly(fragments: readonly Fragment[], limit = 25, circularOnly = false): Dseqrecord[] {
  return recast(assemblyProducts(fragments, limit, pcrFusionOverlap, circularOnly), SOURCE_KINDS.fusionPcr);
}

/**
 * In-vivo assembly: the cell's own recombination joins fragments that share a stretch anywhere, not
 * only at their ends.
 *
 * @param fragments - The fragments. @param limit - How much they must share.
 * @param circularOnly - Whether to keep only the circular products.
 * @returns The products.
 */
export function inVivoAssembly(fragments: readonly Fragment[], limit = 25, circularOnly = false): Dseqrecord[] {
  return recast(assemblyProducts(fragments, limit, commonSubStrings, circularOnly), SOURCE_KINDS.inVivo);
}

/**
 * Ligation: fragments that have already been cut are joined where their ends fit.
 *
 * @param fragments - The fragments.
 * @param allowBlunt - Whether two blunt ends may be joined.
 * @param allowPartialOverlap - Whether overhangs that agree over only part of their length may join.
 * @param circularOnly - Whether to keep only the circular products.
 * @returns The products.
 */
export function ligationAssembly(fragments: readonly Fragment[], allowBlunt = false, allowPartialOverlap = false,
                                 circularOnly = false): Dseqrecord[] {
  const sticky: AssemblyAlgorithm = (x, y) => stickyEndSubStrings(x, y, allowPartialOverlap);
  const algorithm = allowBlunt ? combineAlgorithms(sticky, (x, y) => bluntOverlap(x, y)) : sticky;
  return recast(assemblyProducts(fragments, null, algorithm, circularOnly), SOURCE_KINDS.ligation);
}

/**
 * The inputs of a restriction-ligation product that were not cut at a real site.
 *
 * A fragment joined at a place where the enzyme would not have cut means the molecule was only
 * partially digested, and the product is one nobody would get.
 *
 * @param product - A product.
 * @returns The inputs that do not hold up.
 */
export function partiallyDigestedInputs(product: Dseqrecord): Fragment[] {
  const source = product.source as AssemblySource;
  const enzymes = source.restrictionEnzymes ?? [];
  const out: Fragment[] = [];
  for (const input of source.input) {
    const record = input.sequence as Dseqrecord;
    const sequence: Dseq = input.reverseComplemented ? record.dseq.reverseComplement() : record.dseq;
    const cuts: CutSite[] = getCutsites(sequence, ...enzymes);
    const allowed = new Set(getCutsitePairs(sequence, cuts).map(([one, other]) =>
      `${String(cutsiteToLocation(one, sequence.length))}|${String(cutsiteToLocation(other, sequence.length))}`));
    // An end that was already sticky when it arrived is not something this digest had to make.
    const leftWasEnd = input.leftLocation !== null && locationBoundaries(input.leftLocation)[0] === 0 && sequence.leftOvhg !== 0;
    const rightWasEnd = input.rightLocation !== null && locationBoundaries(input.rightLocation)[1] === sequence.length && sequence.rightOvhg !== 0;
    if (leftWasEnd || rightWasEnd) continue;
    if (!allowed.has(`${String(input.leftLocation)}|${String(input.rightLocation)}`)) out.push(input.sequence);
  }
  return out;
}

/**
 * Cutting and ligating in one pot: the fragments are cut with the enzymes and joined wherever the ends
 * they leave fit together.
 *
 * @param fragments - The fragments.
 * @param enzymes - The enzymes.
 * @param allowBlunt - Whether two blunt ends may be joined.
 * @param circularOnly - Whether to keep only the circular products.
 * @returns The products, leaving out any that would need a partial digest.
 */
export function restrictionLigationAssembly(fragments: readonly Fragment[], enzymes: Enzymes[], allowBlunt = true,
                                            circularOnly = false): Dseqrecord[] {
  const algorithm: AssemblyAlgorithm = (x, y) => restrictionLigationOverlap(x, y, enzymes, false, allowBlunt);
  const products = recast(assemblyProducts(fragments, null, algorithm, circularOnly, true),
                          SOURCE_KINDS.restrictionAndLigation, { restrictionEnzymes: enzymes });
  const kept: Dseqrecord[] = [];
  let partial: Fragment[] = [];
  for (const product of products) {
    const bad = partiallyDigestedInputs(product);
    if (bad.length === 0) kept.push(product);
    else partial = [...partial, ...bad];
  }
  partial = deduplicate(partial, (a, b) => a === b || textOf(a) === textOf(b));
  if (partial.length > 0) {
    const named = partial.map((one) => {
      const record = one as { name?: string; id?: string | null };
      return `Seq ${record.name ?? ""} (id: ${record.id ?? ""})`;
    }).join(", ");
    warn(`${partial.length} partially digested products were filtered out: ${named}`, "UserWarning");
  }
  return kept;
}

/**
 * Golden Gate: restriction and ligation with an enzyme that cuts outside its own site, so that the
 * overhangs can be chosen and the site is not left in the product.
 *
 * @param fragments - The fragments. @param enzymes - The enzymes.
 * @param allowBlunt - Whether two blunt ends may be joined.
 * @param circularOnly - Whether to keep only the circular products.
 * @returns The products.
 */
export function goldenGateAssembly(fragments: readonly Fragment[], enzymes: Enzymes[], allowBlunt = true,
                                   circularOnly = false): Dseqrecord[] {
  return restrictionLigationAssembly(fragments, enzymes, allowBlunt, circularOnly);
}
