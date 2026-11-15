/**
 * The shape of a cloning plan written down: the OpenCloning data model, as pydna serialises it.
 *
 * A plan is three lists and a description. **Sequences** are molecules, each as a GenBank file with its
 * overhangs noted beside it, because GenBank cannot write a sticky end. **Primers** are the short pieces
 * a PCR used. **Sources** are the steps: one per sequence, saying how that sequence was made and which
 * of the others went into it, by identifier.
 *
 * Everything here is plain data. What makes the plan worth sending to another lab is that the steps can
 * be run again from the inputs — see `strategy.ts`.
 */

/** The version of the data model these documents are written in. */
export const SCHEMA_VERSION = "1.0.0";

/** A molecule in a plan: a GenBank file, and the overhangs that file cannot express. */
export interface SequenceModel {
  /** Its identifier within the plan. */
  id: number;
  /** Always `"TextFileSequence"`. */
  type: "TextFileSequence";
  /** Always `"genbank"` here. */
  sequence_file_format: string;
  /** How far the lower strand's 3' end hangs over at the left; negative for a 5' overhang. */
  overhang_crick_3prime: number;
  /** How far the upper strand's 3' end hangs over at the right. */
  overhang_watson_3prime: number;
  /** The molecule as a GenBank file. */
  file_content: string;
}

/** A primer in a plan. */
export interface PrimerModel {
  /** Its identifier within the plan. */
  id: number;
  /** Always `"Primer"`. */
  type: "Primer";
  /** What it is called. */
  name: string;
  /** Where it came from in some database, if anywhere. */
  database_id: number | null;
  /** Its bases. */
  sequence: string;
}

/** One input to a step that is not an assembly: just which sequence. */
export interface SourceInputModel {
  /** Always `"SourceInput"`. */
  type: "SourceInput";
  /** The identifier of the sequence or primer used. */
  sequence: number;
}

/** One input to an assembly: which sequence, which way round, and where it was joined. */
export interface AssemblyFragmentModel {
  /** Always `"AssemblyFragment"`. */
  type: "AssemblyFragment";
  /** The identifier of the sequence or primer used. */
  sequence: number;
  /** The stretch shared with what came before, as a GenBank location, or null at the start. */
  left_location: string | null;
  /** The stretch shared with what came after, or null at the end. */
  right_location: string | null;
  /** Whether it was used the other way round. */
  reverse_complemented: boolean;
}

/** One step of a plan: how a sequence was made. */
export interface SourceModel {
  /** The identifier of the sequence this step makes. */
  id: number;
  /** Which kind of step, for example `"GibsonAssemblySource"`. */
  type: string;
  /** What the product should be called, if the plan says. */
  output_name: string | null;
  /** Where the product came from in some database, if anywhere. */
  database_id: number | null;
  /** What went in. */
  input: (SourceInputModel | AssemblyFragmentModel)[];
  /** Whether the product is circular. Assemblies only. */
  circular?: boolean;
  /** The enzymes used, by name. Restriction and ligation only. */
  restriction_enzymes?: string[];
  /** Whether the primers were marked on the product. PCR only. */
  add_primer_features?: boolean;
}

/** A whole cloning plan. */
export interface CloningStrategyDocument {
  /** The molecules, the product of each step first. */
  sequences: SequenceModel[];
  /** The steps, one per sequence. */
  sources: SourceModel[];
  /** The primers used. */
  primers: PrimerModel[];
  /** What the plan is for. */
  description: string | null;
  /** Which version of the data model this is. */
  schema_version: string;
  /** Which version of the tool wrote it, if it said. */
  backend_version: string | null;
  /** Which version of the interface wrote it, if it said. */
  frontend_version: string | null;
  /** Files carried alongside the plan, if any. */
  files: unknown;
}

/** The name the data model gives each kind of step this package can replay. */
export const SOURCE_TYPES = {
  /** A sequence typed in rather than made: the leaves of a plan. */
  manuallyTyped: "ManuallyTypedSource",
  /** Gibson assembly. */
  gibson: "GibsonAssemblySource",
  /** In-Fusion. */
  inFusion: "InFusionSource",
  /** Fusion PCR, which the model calls overlap-extension PCR ligation. */
  fusionPcr: "OverlapExtensionPCRLigationSource",
  /** Assembly by the cell's own recombination. */
  inVivo: "InVivoAssemblySource",
  /** Ligation of ends that already fit. */
  ligation: "LigationSource",
  /** Cutting and ligating in one pot, which is what Golden Gate is. */
  restrictionAndLigation: "RestrictionAndLigationSource",
  /** A PCR. */
  pcr: "PCRSource",
} as const;

/** The steps this package knows how to run again. */
export const REPLAYABLE: readonly string[] = [
  SOURCE_TYPES.gibson, SOURCE_TYPES.inFusion, SOURCE_TYPES.fusionPcr, SOURCE_TYPES.inVivo,
  SOURCE_TYPES.ligation, SOURCE_TYPES.restrictionAndLigation, SOURCE_TYPES.pcr,
];
