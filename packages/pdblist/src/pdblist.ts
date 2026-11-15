/**
 * `PDBList`: Biopython's client for the Protein Data Bank's file archive.
 *
 * Biopython's class keeps a copy of the archive on disk: it downloads to a directory and hands back a
 * path. There is no disk here, so the two methods that fetch a file hand back its name and its
 * contents, already unpacked, and the methods whose whole purpose is the copy on disk are not ported.
 */
import { AssertionError, IndexError, KeyError } from "@biolibs/core";
import { URLError } from "@biolibs/entrez";
import { JSONDecodeError } from "./errors.js";
import { type Fetcher, type PdbRequest, fetchBytes } from "./fetcher.js";
import { DEFAULT_FORMAT_WARNING, assemblyNumber, assemblyTarget, structureTarget } from "./formats.js";
import { gunzip } from "./gzip.js";
import { byteLines, byteSplit, byteStrip, decode, startsWith } from "./pybytes.js";

/** The archive Biopython uses unless told otherwise. */
export const DEFAULT_SERVER = "https://files.wwpdb.org";

/** Where RCSB's search service lists every assembly. */
export const ASSEMBLY_SEARCH_URL = "https://search.rcsb.org/rcsbsearch/v2/query";

/** The query that asks it for all of them, as Python's `json.dumps` writes it. */
export const ASSEMBLY_SEARCH_BODY = '{"request_options": {"return_all_hits": true}, "return_type": "assembly"}';

/** How a {@link PDBList} is set up. Everything is optional. */
export interface PDBListOptions {
  /** The archive to ask. Default {@link DEFAULT_SERVER}. */
  server?: string;
  /** Whether to report progress, as Biopython prints it. Default `true`. */
  verbose?: boolean;
  /** What sends the requests. Default {@link fetchBytes}. */
  fetcher?: Fetcher;
  /** Receives each line Biopython would print to stdout, without its newline. Default `console.log`. */
  stdout?: (line: string) => void;
  /** Receives each line Biopython would write to stderr, without its newline. Default `console.error`. */
  stderr?: (line: string) => void;
}

/** A file fetched from the archive: what Biopython would have left on disk. */
export interface PdbFile {
  /** The name Biopython gives the file, without a directory. */
  name: string;
  /** The file's contents, unpacked. */
  data: Uint8Array;
}

/** What `retrieveAssemblyFile` returns: the name always, and the contents if the download worked. */
export interface AssemblyFile {
  /** The name Biopython gives the file, without a directory. */
  name: string;
  /** The file's contents, unpacked, or `null` if it could not be downloaded. */
  data: Uint8Array | null;
}

/** @param url - An address. @returns A plain download of it. */
const get = (url: string): PdbRequest => ({ url, method: "GET", data: null, headers: {} });

/**
 * Mirrors `Bio.PDB.PDBList.PDBList`: fetches structure and assembly files, and the archive's lists of
 * entries.
 *
 * @example
 * ```ts
 * const pdbl = new PDBList({ verbose: false });
 * const file = await pdbl.retrievePdbFile("4HHB", { fileFormat: "mmCif" });
 * file?.name;                             // "4hhb.cif"
 * new TextDecoder().decode(file?.data);   // "data_4HHB\n#\n_entry.id   4HHB\n..."
 * ```
 */
export class PDBList {
  /** The archive being asked (`pdb_server` in Biopython). */
  pdbServer: string;
  /** Whether progress is reported. */
  verbose: boolean;
  /** What sends the requests. */
  fetcher: Fetcher;
  /** Receives stdout lines. */
  stdout: (line: string) => void;
  /** Receives stderr lines. */
  stderr: (line: string) => void;
  /** The list of assemblies, once {@link PDBList.getAllAssemblies} has fetched it. */
  assemblies: [string, string][] | null = null;

  /** @param options - The archive, verbosity and how to reach the network. */
  constructor(options: PDBListOptions = {}) {
    this.pdbServer = options.server ?? DEFAULT_SERVER;
    this.verbose = options.verbose ?? true;
    this.fetcher = options.fetcher ?? fetchBytes;
    this.stdout = options.stdout ?? ((line) => console.log(line));
    this.stderr = options.stderr ?? ((line) => console.error(line));
  }

  /**
   * Warn that the default format is mmCIF, if no format was asked for.
   *
   * @param fileFormat - What the caller passed. @returns It, or `"mmCif"` after the warning.
   */
  private formatOrDefault(fileFormat: string | null | undefined): string {
    if (fileFormat !== null && fileFormat !== undefined) return fileFormat;
    this.stderr(DEFAULT_FORMAT_WARNING);
    return "mmCif";
  }

  /**
   * Mirrors `PDBList.get_status_list`: the entry codes in one of the weekly status files, one per line.
   *
   * @param url - The file's address.
   * @param fetcher - What sends the request. Default {@link fetchBytes}.
   * @returns The codes.
   * @throws `AssertionError` for a line that is not four bytes long once stripped, as Biopython asserts.
   */
  static async getStatusList(url: string, fetcher: Fetcher = fetchBytes): Promise<string[]> {
    const answer: string[] = [];
    for (const line of byteLines(await fetcher(get(url)))) {
      const pdb = byteStrip(line);
      if (pdb.length !== 4) throw new AssertionError();
      answer.push(decode(pdb));
    }
    return answer;
  }

  /**
   * Mirrors `PDBList.get_recent_changes`: this week's added, modified and obsolete entries.
   *
   * @returns Three lists of codes, in that order.
   */
  async getRecentChanges(): Promise<[added: string[], modified: string[], obsolete: string[]]> {
    const path = `${this.pdbServer}/pub/pdb/data/status/latest/`;
    const added = await PDBList.getStatusList(`${path}added.pdb`, this.fetcher);
    const modified = await PDBList.getStatusList(`${path}modified.pdb`, this.fetcher);
    const obsolete = await PDBList.getStatusList(`${path}obsolete.pdb`, this.fetcher);
    return [added, modified, obsolete];
  }

  /**
   * Mirrors `PDBList.get_all_entries`: every entry code in the archive's index, a file of about 27 MB.
   *
   * @returns The codes, as the index writes them (upper case).
   */
  async getAllEntries(): Promise<string[]> {
    if (this.verbose) this.stdout("Retrieving index file. Takes about 27 MB.");
    const lines = byteLines(await this.fetcher(get(`${this.pdbServer}/pub/pdb/derived_data/index/entries.idx`)));
    return lines.slice(2).filter((line) => line.length > 4).map((line) => decode(line.subarray(0, 4)));
  }

  /**
   * Mirrors `PDBList.get_all_obsolete`: every entry that has ever been withdrawn.
   *
   * @returns The codes, as the file writes them (upper case).
   * @throws `IndexError` for an `OBSLTE` line with no code, and `AssertionError` for a code that is not
   * four bytes, as in Biopython.
   */
  async getAllObsolete(): Promise<string[]> {
    const obsolete: string[] = [];
    for (const line of byteLines(await this.fetcher(get(`${this.pdbServer}/pub/pdb/data/status/obsolete.dat`)))) {
      if (!startsWith(line, "OBSLTE ")) continue;
      const pdb = byteSplit(line)[2];
      if (pdb === undefined) throw new IndexError("list index out of range");
      if (pdb.length !== 4) throw new AssertionError();
      obsolete.push(decode(pdb));
    }
    return obsolete;
  }

  /**
   * Mirrors `PDBList.get_all_assemblies`: every entry that has a biological assembly, from RCSB's
   * search service. The list is kept, so a second call does not ask again.
   *
   * @returns Pairs of entry code (lower case) and assembly number (as text).
   * @throws {@link JSONDecodeError} for a reply that is not JSON, and `KeyError` for one without
   * `result_set`, or with an entry that has no `identifier`.
   */
  async getAllAssemblies(): Promise<[string, string][]> {
    if (this.assemblies !== null && this.assemblies.length > 0) {
      if (this.verbose) this.stdout("Retrieving cached list of assemblies.");
      return this.assemblies;
    }
    if (this.verbose) this.stdout("Retrieving list of assemblies. This might take a while.");
    const data = new TextEncoder().encode(ASSEMBLY_SEARCH_BODY);
    const headers = { "Content-Type": "application/json; charset=utf-8", "Content-Length": String(data.length) };
    const text = decode(await this.fetcher({ url: ASSEMBLY_SEARCH_URL, method: "POST", data, headers }));
    let reply: Record<string, unknown>;
    try {
      reply = JSON.parse(text) as Record<string, unknown>;
    } catch (error) {
      throw new JSONDecodeError((error as Error).message);
    }
    if (!Object.hasOwn(reply, "result_set")) throw new KeyError("result_set");
    const assemblies = (reply["result_set"] as Record<string, unknown>[]).map((assembly): [string, string] => {
      if (!Object.hasOwn(assembly, "identifier")) throw new KeyError("identifier");
      const split = String(assembly["identifier"]).split("-");
      return [split[0]!.toLowerCase(), split[split.length - 1]!];
    });
    this.assemblies = assemblies;
    return assemblies;
  }

  /**
   * Mirrors `PDBList.retrieve_pdb_file`: fetch one structure file and unpack it.
   *
   * Where Biopython returns the path of the file it wrote, this returns the file. A structure that is
   * not there is not an error, here or there: a line is printed and `null` comes back.
   *
   * @param pdbCode - The entry's identifier, such as `"4HHB"`, in any letter case.
   * @param options - `fileFormat`: `"mmCif"` (the default, with a warning on stderr), `"pdb"`, `"xml"`,
   * `"mmtf"` or `"bundle"`. `obsolete`: look among the withdrawn entries instead.
   * @returns The file's name and contents, or `null` if it could not be downloaded.
   * @throws `ValueError` for a format that is not one of the five; `BadGzipFile` or `EOFError` if what
   * arrives is not a whole gzip file.
   */
  async retrievePdbFile(pdbCode: string, options: { obsolete?: boolean; fileFormat?: string | null } = {}): Promise<PdbFile | null> {
    const fileFormat = this.formatOrDefault(options.fileFormat);
    const code = pdbCode.toLowerCase();
    const { url, name } = structureTarget(this.pdbServer, code, options.obsolete ?? false, fileFormat);
    if (this.verbose) this.stdout(`Downloading PDB structure '${code}'...`);
    let packed: Uint8Array;
    try {
      packed = await this.fetcher(get(url));
    } catch (error) {
      if (!(error instanceof URLError)) throw error;
      this.stdout(`Desired structure not found or download failed. '${code}': ${error.message}`);
      return null;
    }
    return { name, data: gunzip(packed) };
  }

  /**
   * Mirrors `PDBList.retrieve_assembly_file`: fetch one biological assembly and unpack it.
   *
   * Biopython returns the path it would have written even when the download fails, so here the name
   * always comes back and the contents are `null` if there are none.
   *
   * @param pdbCode - The entry's identifier, in any letter case.
   * @param assemblyNum - Which assembly; Python's `int()` is applied, so `"1"`, `1` and `" 01 "` are the same.
   * @param options - `fileFormat`: `"mmCif"` (the default, with a warning on stderr) or `"pdb"`, in any letter case.
   * @returns The file's name, and its contents or `null`.
   * @throws `ValueError` for an assembly number that is not one; `BioError` (named `Exception`) for any
   * other format; `BadGzipFile` or `EOFError` if what arrives is not a whole gzip file.
   */
  async retrieveAssemblyFile(pdbCode: string, assemblyNum: string | number | bigint | boolean,
    options: { fileFormat?: string | null } = {}): Promise<AssemblyFile> {
    const code = pdbCode.toLowerCase();
    const number = assemblyNumber(assemblyNum);
    const { url, name } = assemblyTarget(this.pdbServer, code, number, this.formatOrDefault(options.fileFormat));
    if (this.verbose) this.stdout(`Downloading assembly (${number}) for PDB entry '${code}'...`);
    let packed: Uint8Array;
    try {
      packed = await this.fetcher(get(url));
    } catch (error) {
      if (!(error instanceof URLError)) throw error;
      this.stdout(`Download failed! Maybe the desired assembly does not exist: ${error.message}`);
      return { name, data: null };
    }
    return { name, data: gunzip(packed) };
  }

  /**
   * Mirrors `PDBList.get_seqres_file`: the sequences of every chain in the archive, as FASTA, in a file
   * of over 110 MB.
   *
   * @param savefile - The name Biopython would save it under. Default `"pdb_seqres.txt"`.
   * @returns That name, and the file. Unlike a structure, it is not compressed, and a failure is raised.
   */
  async getSeqresFile(savefile = "pdb_seqres.txt"): Promise<PdbFile> {
    if (this.verbose) this.stdout("Retrieving sequence file (takes over 110 MB).");
    return { name: savefile, data: await this.fetcher(get(`${this.pdbServer}/pub/pdb/derived_data/pdb_seqres.txt`)) };
  }
}
