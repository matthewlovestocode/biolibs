/** Where each kind of file lives in the archive, and what Biopython calls it once unpacked. */
import { BioError, OverflowError, ValueError, pyInt } from "@biolibs/core";

/** The formats `retrievePdbFile` accepts, spelled as Biopython spells them. */
export type PdbFileFormat = "pdb" | "mmCif" | "xml" | "mmtf" | "bundle";

/** The formats `retrieveAssemblyFile` accepts, in any letter case. */
export type AssemblyFileFormat = "pdb" | "mmcif";

/** The message Biopython writes to stderr when no format is asked for. */
export const DEFAULT_FORMAT_WARNING = "WARNING: The default download format has changed from PDB to PDBx/mmCif";

/** A file to ask for, and the name it has once unpacked. */
export interface Target {
  /** The full address of the gzipped file. */
  url: string;
  /** The name Biopython gives the unpacked file. */
  name: string;
}

/**
 * Where a structure file is and what it is called.
 *
 * @param server - The archive's address.
 * @param pdbCode - The entry's identifier, in any letter case.
 * @param obsolete - Whether to look among the withdrawn entries.
 * @param fileFormat - One of the five formats.
 * @returns The address and the unpacked name.
 * @throws `ValueError` for a format that is not one of the five, spelled exactly.
 * @example
 * ```ts
 * structureTarget("https://files.wwpdb.org", "4HHB", false, "pdb");
 * // { url: "https://files.wwpdb.org/pub/pdb/data/structures/divided/pdb/hh/pdb4hhb.ent.gz", name: "pdb4hhb.ent" }
 * ```
 */
export function structureTarget(server: string, pdbCode: string, obsolete: boolean, fileFormat: string): Target {
  const code = pdbCode.toLowerCase();
  const names: Record<string, [archive: string, final: string]> = {
    pdb: [`pdb${code}.ent.gz`, `pdb${code}.ent`],
    mmCif: [`${code}.cif.gz`, `${code}.cif`],
    xml: [`${code}.xml.gz`, `${code}.xml`],
    mmtf: [code, `${code}.mmtf`],
    bundle: [`${code}-pdb-bundle.tar.gz`, `${code}-pdb-bundle.tar`],
  };
  if (!Object.hasOwn(names, fileFormat)) {
    throw new ValueError(`Specified file_format ${fileFormat} does not exist or is not supported. Please use one of the following: ${Object.keys(names).join(", ")}.`);
  }
  const [archive, name] = names[fileFormat]!;
  const middle = code.slice(1, 3);
  if (fileFormat === "mmtf") return { url: `http://mmtf.rcsb.org/v1.0/full/${code}`, name };
  if (fileFormat === "bundle") return { url: `${server}/pub/pdb/compatible/pdb_bundle/${middle}/${code}/${archive}`, name };
  const kind = fileFormat === "pdb" ? "pdb" : fileFormat === "mmCif" ? "mmCIF" : "XML";
  return { url: `${server}/pub/pdb/data/structures/${obsolete ? "obsolete" : "divided"}/${kind}/${middle}/${archive}`, name };
}

/**
 * Python's `int()` of an assembly number, which Biopython applies to whatever it is given.
 *
 * @param value - Text, a number or a boolean.
 * @returns The whole number: text is parsed, a fraction is cut off, and `true` is 1.
 * @throws `ValueError` for text that is not a whole number, or for NaN; `OverflowError` for infinity.
 * @example
 * ```ts
 * assemblyNumber(" 02 ");   // 2
 * assemblyNumber(1.7);      // 1
 * ```
 */
export function assemblyNumber(value: string | number | bigint | boolean): number {
  if (typeof value === "string") return pyInt(value);
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "bigint") return Number(value);
  if (Number.isNaN(value)) throw new ValueError("cannot convert float NaN to integer");
  if (!Number.isFinite(value)) throw new OverflowError("cannot convert float infinity to integer");
  return Math.trunc(value) + 0;
}

/**
 * Where an assembly file is and what it is called.
 *
 * @param server - The archive's address.
 * @param pdbCode - The entry's identifier, in any letter case.
 * @param assemblyNum - Which assembly, already a whole number.
 * @param fileFormat - `"mmcif"` or `"pdb"`, in any letter case.
 * @returns The address and the unpacked name.
 * @throws `BioError` — a bare `Exception` in Biopython — for any other format.
 * @example
 * ```ts
 * assemblyTarget("https://files.wwpdb.org", "4HHB", 1, "mmCif");
 * // { url: "https://files.wwpdb.org/pub/pdb/data/assemblies/mmCIF/all/4hhb-assembly1.cif.gz", name: "4hhb-assembly1.cif" }
 * ```
 */
export function assemblyTarget(server: string, pdbCode: string, assemblyNum: number, fileFormat: string): Target {
  const code = pdbCode.toLowerCase();
  const format = fileFormat.toLowerCase();
  if (format === "pdb") return { url: `${server}/pub/pdb/data/biounit/PDB/all/${code}.pdb${assemblyNum}.gz`, name: `${code}.pdb${assemblyNum}` };
  if (format === "mmcif") {
    return { url: `${server}/pub/pdb/data/assemblies/mmCIF/all/${code}-assembly${assemblyNum}.cif.gz`, name: `${code}-assembly${assemblyNum}.cif` };
  }
  const error = new BioError(`Specified file_format '${format}' is not supported. Use one of the following: 'mmcif' or 'pdb'.`);
  error.name = "Exception";
  throw error;
}
