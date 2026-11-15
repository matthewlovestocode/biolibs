/**
 * @packageDocumentation
 * `@biolibs/pdblist`: downloads from the Protein Data Bank, ported from Biopython's `Bio.PDB.PDBList`.
 *
 * It builds the same addresses Biopython builds, prints the same lines, and unpacks what arrives, for
 * the PDB and mmCIF parsers of the pdb package to read. Biopython's class writes files to a directory;
 * this one hands back names and contents, and leaves out the methods that only maintain a copy on disk.
 * The network is reached through a single replaceable function.
 *
 * - `pdblist.ts`: `PDBList` — `retrievePdbFile`, `retrieveAssemblyFile`, `getAllEntries`,
 *   `getAllObsolete`, `getAllAssemblies`, `getRecentChanges`, `getStatusList`, `getSeqresFile`
 * - `formats.ts`: `structureTarget`, `assemblyTarget`, `assemblyNumber` — where each file is, and its name
 * - `gzip.ts`: `gunzip`, `crc32` — Python's `gzip`, with its errors
 * - `fetcher.ts`: `Fetcher`, `PdbRequest`, `fetchBytes` — the only code that touches the network — and
 *   `viaMirror`, `PDBE_ARCHIVE`, `WWPDB_ARCHIVE`, for a mirror a web page is allowed to read
 * - `pybytes.ts`: `byteLines`, `byteStrip`, `byteSplit`, `decode`, `startsWith` — Python's `bytes`, for the list files
 * - `errors.ts`: `BadGzipFile`, `EOFError`, `JSONDecodeError`; `HTTPError`, `URLError` and
 *   `UnicodeDecodeError` are the entrez package's, re-exported
 *
 * @example
 * ```ts
 * import { PDBList } from "@biolibs/pdblist";
 *
 * const pdbl = new PDBList({ verbose: false });
 * const file = await pdbl.retrievePdbFile("4HHB", { fileFormat: "pdb" });
 * file?.name;   // "pdb4hhb.ent"
 * ```
 */
export { HTTPError, URLError, UnicodeDecodeError } from "@biolibs/entrez";
export * from "./errors.js";
export * from "./gzip.js";
export * from "./pybytes.js";
export * from "./fetcher.js";
export * from "./formats.js";
export * from "./pdblist.js";
