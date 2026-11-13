/** The keyword tables of the Stockholm format (Biopython's `AlignmentIterator.gf_mapping` and friends). */

/** `#=GF` feature codes and the annotation names they are stored under. */
export const GF_MAPPING: ReadonlyMap<string, string> = new Map([
  ["ID", "identifier"], ["AC", "accession"], ["DE", "definition"], ["AU", "author"], ["SE", "source of seed"], ["SS", "source of structure"],
  ["GA", "gathering method"], ["TC", "trusted cutoff"], ["NC", "noise cutoff"], ["BM", "build method"], ["SM", "search method"], ["TP", "type"],
  ["PI", "previous identifier"], ["CC", "comment"], ["CL", "clan"], ["WK", "wikipedia"], ["CB", "calibration method"], ["**", "**"],
]);

/** `#=GR` feature codes and the letter-annotation names they are stored under. */
export const GR_MAPPING: ReadonlyMap<string, string> = new Map([
  ["SS", "secondary structure"], ["PP", "posterior probability"], ["CSA", "Catalytic Site Atlas"], ["SA", "surface accessibility"], ["TM", "transmembrane"],
  ["LI", "ligand binding"], ["AS", "active site"], ["pAS", "active site - Pfam predicted"], ["sAS", "active site - from SwissProt"], ["IN", "intron"],
]);

const RFAM_KEYWORDS = ["RNA_elements", "RNA_structural_element", "RNA_structural_elements", "RNA_ligand_AdoCbl", "RNA_ligand_AqCbl", "RNA_ligand_FMN", "RNA_ligand_Guanidinium",
  "RNA_ligand_SAM", "RNA_ligand_THF_1", "RNA_ligand_THF_2", "RNA_ligand_TPP", "RNA_ligand_preQ1", "RNA_motif_k_turn", "Repeat_unit", "2L3J_B_SS", "CORE", "PK", "PK_SS", "cons"];

/** `#=GC` feature codes and the column-annotation names they are stored under (in Biopython's insertion order). */
export const GC_MAPPING: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>([
    ["RF", "reference coordinate annotation"], ["seq_cons", "consensus sequence"], ["scorecons", "consensus score"], ["scorecons_70", "consensus score 70"],
    ["scorecons_80", "consensus score 80"], ["scorecons_90", "consensus score 90"], ["MM", "model mask"],
  ]);
  for (const [key, value] of GR_MAPPING) m.set(key + "_cons", "consensus " + value);
  for (const keyword of RFAM_KEYWORDS) m.set(keyword, keyword.replaceAll("_", " "));
  return m;
})();

/** `#=GS` feature codes and the annotation names they are stored under. */
export const GS_MAPPING: ReadonlyMap<string, string> = new Map([["AC", "accession"], ["OS", "organism"], ["OC", "organism classification"], ["LO", "look"]]);

/** A mapping turned around: names to codes (Python's `{value: key for key, value in ...}`, the last code wins for repeated names). */
export function invert(mapping: ReadonlyMap<string, string>): Map<string, string> {
  return new Map([...mapping].map(([k, v]) => [v, k] as [string, string]));
}
