/**
 * Where a molecule came from: the provenance the engine hangs on everything it makes.
 *
 * Every product records which fragments went into it, which way round each was used, and the stretch of
 * each that was shared with its neighbours. That is enough to replay the assembly from the inputs and
 * check that the same molecule comes out — which is the point of recording it.
 *
 * pydna's own `source` carries more: it maps onto the OpenCloning data model, which also holds where
 * each input itself came from, and serialises a whole project to JSON. That layer is not ported yet;
 * what is here is the part the engine fills in.
 */

import type { Enzymes } from "@biolibs/dseq";
import type { Location } from "@biolibs/seqfeature";
import type { Fragment, SubFragmentAssembly } from "./assemble.js";

/** One input to an assembly, and how it was used. */
export interface SourceInput {
  /** The fragment itself. */
  sequence: Fragment;
  /** Whether it was used the other way round. */
  reverseComplemented: boolean;
  /** The stretch shared with what came before, or null at the start of a linear product. */
  leftLocation: Location | null;
  /** The stretch shared with what came after, or null at the end of one. */
  rightLocation: Location | null;
  /**
   * Whether this input was joined at a place on itself, which every input of an assembly is. pydna has
   * a class for each case rather than a flag; what is written down differs, so the difference is kept.
   */
  assemblyFragment: boolean;
}

/**
 * How a molecule was assembled.
 *
 * @example
 * ```ts
 * product.source?.kind;            // "GibsonAssemblySource"
 * product.source?.input.length;    // 3, the fragments that went in
 * ```
 */
export class AssemblySource {
  /** Which method made it. pydna has a class per method; this is that class's name. */
  readonly kind: string = "AssemblySource";
  /** Whether the product is circular. */
  circular: boolean;
  /** The inputs, in the order they were joined. */
  input: SourceInput[];
  /** The enzymes used, where the method cut with any. */
  restrictionEnzymes: Enzymes[] | null = null;
  /** Whether the primers were marked on the product, for a PCR. */
  addPrimerFeatures: boolean | null = null;

  /** @param input - The inputs. @param circular - Whether the product is circular. */
  constructor(input: SourceInput[], circular: boolean) {
    this.input = input;
    this.circular = circular;
  }

  /**
   * @param pieces - The assembly, as the pieces it is made of.
   * @param fragments - The fragments those pieces come from.
   * @param isCircular - Whether the product is circular.
   * @returns The provenance.
   */
  static fromSubFragments(pieces: SubFragmentAssembly, fragments: readonly Fragment[], isCircular: boolean): AssemblySource {
    const input = pieces.map(([node, left, right]): SourceInput => ({
      sequence: fragments[Math.abs(node) - 1]!,
      reverseComplemented: node < 0,
      leftLocation: left,
      rightLocation: right,
      assemblyFragment: true,
    }));
    return new AssemblySource(input, isCircular);
  }

  /**
   * The same provenance, said to have been made by another method.
   *
   * @param kind - The method's name.
   * @param extra - What that method records beyond the joins.
   * @returns The recast provenance.
   */
  recast(kind: string, extra: { restrictionEnzymes?: Enzymes[]; addPrimerFeatures?: boolean } = {}): AssemblySource {
    const out = new AssemblySource(this.input, this.circular);
    (out as { kind: string }).kind = kind;
    out.restrictionEnzymes = extra.restrictionEnzymes ?? this.restrictionEnzymes;
    out.addPrimerFeatures = extra.addPrimerFeatures ?? this.addPrimerFeatures;
    return out;
  }
}

/** The names pydna gives the provenance of each method, which `recast` sets. */
export const SOURCE_KINDS = {
  /** Gibson assembly. */
  gibson: "GibsonAssemblySource",
  /** In-Fusion, which is Gibson with the other strand chewed back. */
  inFusion: "InFusionSource",
  /** Fusion PCR, joined by overlap extension. */
  fusionPcr: "OverlapExtensionPCRLigationSource",
  /** Homologous recombination inside a cell. */
  inVivo: "InVivoAssemblySource",
  /** Plain ligation of fragments that are already cut. */
  ligation: "LigationSource",
  /** Cutting and ligating in one pot, which is what Golden Gate is. */
  restrictionAndLigation: "RestrictionAndLigationSource",
  /** A PCR. */
  pcr: "PCRSource",
} as const;
