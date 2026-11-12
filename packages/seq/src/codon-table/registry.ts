/** Registries of every NCBI genetic code, populated at import time. */

import * as IUPAC from "../data/iupac-data.js";
import { NCBI_TABLES } from "../data/ncbi-tables.js";
import { AmbiguousCodonTable } from "./ambiguity.js";
import { NCBICodonTable, NCBICodonTableDNA, NCBICodonTableRNA } from "./codon-table.js";

/** DNA tables by name (including the alternative name such as `SGC0`). */
export const unambiguousDnaByName = new Map<string, NCBICodonTableDNA>();

/** DNA tables by NCBI id. */
export const unambiguousDnaById = new Map<number, NCBICodonTableDNA>();

/** RNA tables by name. */
export const unambiguousRnaByName = new Map<string, NCBICodonTableRNA>();

/** RNA tables by NCBI id. */
export const unambiguousRnaById = new Map<number, NCBICodonTableRNA>();

/** Tables accepting both T and U codons, by name. */
export const genericByName = new Map<string, NCBICodonTable>();

/** Tables accepting both T and U codons, by NCBI id. */
export const genericById = new Map<number, NCBICodonTable>();

/** DNA tables with IUPAC ambiguity resolution, by name. */
export const ambiguousDnaByName = new Map<string, AmbiguousCodonTable>();

/** DNA tables with IUPAC ambiguity resolution, by id. */
export const ambiguousDnaById = new Map<number, AmbiguousCodonTable>();

/** RNA tables with IUPAC ambiguity resolution, by name. */
export const ambiguousRnaByName = new Map<string, AmbiguousCodonTable>();

/** RNA tables with IUPAC ambiguity resolution, by id. */
export const ambiguousRnaById = new Map<number, AmbiguousCodonTable>();

/** Generic ambiguity-aware tables by name (the ones `translate` uses). */
export const ambiguousGenericByName = new Map<string, AmbiguousCodonTable>();

/** Generic ambiguity-aware tables by id (the ones `translate` uses). */
export const ambiguousGenericById = new Map<number, AmbiguousCodonTable>();

/** The standard DNA table (id 1). */
export let standardDnaTable: NCBICodonTableDNA | null = null;

/** The standard RNA table (id 1). */
export let standardRnaTable: NCBICodonTableRNA | null = null;

/**
 * Register an NCBI genetic code in every registry.
 *
 * @param name - Table name; several names may be separated by `"; "`, `", "` or `" and "`.
 * @param altName - Alternative name such as `"SGC0"`, or null.
 * @param id - NCBI table id.
 * @param table - DNA codon to amino acid for sense codons.
 * @param startCodons - DNA start codons.
 * @param stopCodons - DNA stop codons.
 */
export function registerNcbiTable(
  name: string,
  altName: string | null,
  id: number,
  table: Record<string, string>,
  startCodons: string[],
  stopCodons: string[],
): void {
  const names: (string | null)[] = name.replaceAll(" and ", "; ").replaceAll(", ", "; ").split("; ").map((x) => x.trim());
  const allNames = [...names, altName];
  const dna = new NCBICodonTableDNA(id, allNames, table, startCodons, stopCodons);
  const ambigDna = new AmbiguousCodonTable(dna, IUPAC.ambiguousDnaLetters, IUPAC.ambiguousDnaValues, IUPAC.extendedProteinLetters, IUPAC.extendedProteinValues);

  const rnaTable = new Map<string, string>();
  const genericTable = new Map<string, string>();
  for (const [codon, val] of Object.entries(table)) {
    genericTable.set(codon, val);
    const rnaCodon = codon.replaceAll("T", "U");
    genericTable.set(rnaCodon, val);
    rnaTable.set(rnaCodon, val);
  }
  const rnaStart: string[] = [];
  const genericStart: string[] = [];
  for (let codon of startCodons) {
    genericStart.push(codon);
    if (codon.includes("T")) {
      codon = codon.replaceAll("T", "U");
      genericStart.push(codon);
    }
    rnaStart.push(codon);
  }
  const rnaStop: string[] = [];
  const genericStop: string[] = [];
  for (let codon of stopCodons) {
    genericStop.push(codon);
    if (codon.includes("T")) {
      codon = codon.replaceAll("T", "U");
      genericStop.push(codon);
    }
    rnaStop.push(codon);
  }
  const generic = new NCBICodonTable(id, allNames, genericTable, genericStart, genericStop);
  const mergedValues: Record<string, string> = { ...IUPAC.ambiguousRnaValues, T: "U" };
  const ambigGeneric = new AmbiguousCodonTable(generic, null, mergedValues, IUPAC.extendedProteinLetters, IUPAC.extendedProteinValues);
  const rna = new NCBICodonTableRNA(id, allNames, rnaTable, rnaStart, rnaStop);
  const ambigRna = new AmbiguousCodonTable(rna, IUPAC.ambiguousRnaLetters, IUPAC.ambiguousRnaValues, IUPAC.extendedProteinLetters, IUPAC.extendedProteinValues);

  if (id === 1) {
    standardDnaTable = dna;
    standardRnaTable = rna;
  }
  // Record the table under its id in every registry, then under each of its names.
  unambiguousDnaById.set(id, dna);
  unambiguousRnaById.set(id, rna);
  genericById.set(id, generic);
  ambiguousDnaById.set(id, ambigDna);
  ambiguousRnaById.set(id, ambigRna);
  ambiguousGenericById.set(id, ambigGeneric);
  if (altName !== null) names.push(altName);
  for (const n of names as string[]) {
    unambiguousDnaByName.set(n, dna);
    unambiguousRnaByName.set(n, rna);
    genericByName.set(n, generic);
    ambiguousDnaByName.set(n, ambigDna);
    ambiguousRnaByName.set(n, ambigRna);
    ambiguousGenericByName.set(n, ambigGeneric);
  }
}

// Register every NCBI table from the generated data.
for (const t of NCBI_TABLES) {
  const altName = t.names[t.names.length - 1] ?? null;
  registerNcbiTable(t.names.slice(0, -1).join("; "), altName, t.id, t.table, t.startCodons, t.stopCodons);
}
