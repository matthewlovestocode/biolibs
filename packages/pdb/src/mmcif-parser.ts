/** `MMCIFParser` and `FastMMCIFParser`: read mmCIF files into a `Structure` (Biopython's `Bio.PDB.MMCIFParser`). */

import { IndexError, KeyError, setWarningHandler, warn } from "@biolibs/core";
import { pyFloat, pyInt } from "@biolibs/core";
import { PDBConstructionException, PDB_CONSTRUCTION_WARNING } from "./exceptions.js";
import { MMCIF2Dict } from "./mmcif2dict.js";
import { readLines } from "./pdb-parser.js";
import type { Structure } from "./chain.js";
import { StructureBuilder } from "./structure-builder.js";

/** Placeholders for item values that cannot be assigned. */
const UNASSIGNED = new Set([".", "?"]);

/** The header dictionary built by {@link MMCIFParser}. */
export interface MmcifHeader {
  name: string;
  head: string;
  idcode: string;
  deposition_date: string;
  structure_method: string;
  resolution: number | null;
}

/** Python `d[key]` on the column dictionary. @throws {@link KeyError} when the column is absent. */
function column(d: Map<string, string[] | string>, key: string): string[] {
  const v = d.get(key);
  if (v === undefined) throw new KeyError(key);
  return v as string[];
}

/** Python `list[i]`. @throws {@link IndexError} past the end. */
function at<T>(list: readonly T[], i: number): T {
  if (i >= list.length) throw new IndexError("list index out of range");
  return list[i]!;
}

/** Run `fn`, with construction warnings suppressed when `quiet` (Python's `warnings.filterwarnings("ignore", category=...)`). */
function quietly<T>(quiet: boolean, fn: () => T): T {
  if (!quiet) return fn();
  const original = setWarningHandler(() => undefined);
  setWarningHandler((w) => { if (w.category !== PDB_CONSTRUCTION_WARNING) original(w); });
  try { return fn(); } finally { setWarningHandler(original); }
}

/** Python `float()` over a list of strings. */
const floats = (xs: readonly string[]): number[] => xs.map((x) => pyFloat(x));

/** Options shared by both parsers. */
export interface MmcifParserOptions {
  /** Use this builder instead of a new `StructureBuilder`. */
  structureBuilder?: StructureBuilder | null;
  /** Use author chain ids (default true) instead of the re-assigned mmCIF ids. */
  authChains?: boolean;
  /** Use author residue numbering (default true) instead of the `label` numbering. */
  authResidues?: boolean;
  /** Suppress construction warnings (default false). */
  quiet?: boolean;
  /** Continue after recoverable atom-construction problems, with a warning (default false; `MMCIFParser` only). */
  permissive?: boolean;
}

/** What differs between the two parsers while they build the structure. */
interface Mode {
  fast: boolean;
  permissive: boolean;
  handle: (message: string) => void;
}

/**
 * The loop shared by both parsers: turn the columns of `_atom_site` (and `_atom_site_anisotrop`) into builder calls.
 *
 * @param d - Column dictionary.
 * @param structureId - Id for the structure.
 * @param builder - Receives the construction calls.
 * @param authChains - Use author chain ids.
 * @param authResidues - Use author residue numbers.
 * @param mode - Differences between `MMCIFParser` and `FastMMCIFParser`.
 */
function buildStructure(d: Map<string, string[] | string>, structureId: string, builder: StructureBuilder, authChains: boolean, authResidues: boolean, mode: Mode): void {
  const atomSerialList = column(d, "_atom_site.id");
  const atomIdList = column(d, "_atom_site.label_atom_id");
  const residueIdList = column(d, "_atom_site.label_comp_id");
  const elementList = d.has("_atom_site.type_symbol") ? column(d, "_atom_site.type_symbol") : null;
  const chainIdList = authChains ? column(d, "_atom_site.auth_asym_id") : column(d, "_atom_site.label_asym_id");
  const xList = floats(column(d, "_atom_site.Cartn_x"));
  const yList = floats(column(d, "_atom_site.Cartn_y"));
  const zList = floats(column(d, "_atom_site.Cartn_z"));
  const altList = column(d, "_atom_site.label_alt_id");
  const icodeList = column(d, "_atom_site.pdbx_PDB_ins_code");
  const bFactorList = column(d, "_atom_site.B_iso_or_equiv");
  const occupancyList = column(d, "_atom_site.occupancy");
  const fieldnameList = column(d, "_atom_site.group_PDB");
  let serialList: number[] | null = null;
  if (d.has("_atom_site.pdbx_PDB_model_num")) {
    try { serialList = column(d, "_atom_site.pdbx_PDB_model_num").map((n) => pyInt(n)); } catch { throw new PDBConstructionException("Invalid model number"); }
  }
  const anisoKeys = ["U[1][1]", "U[1][2]", "U[1][3]", "U[2][2]", "U[2][3]", "U[3][3]"].map((k) => `_atom_site_anisotrop.${k}`);
  const aniso = anisoKeys.every((k) => d.has(k)) ? anisoKeys.map((k) => column(d, k)) : null;
  const seqIdList = authResidues && d.has("_atom_site.auth_seq_id") ? column(d, "_atom_site.auth_seq_id") : column(d, "_atom_site.label_seq_id");

  let currentChainId: string | null = null;
  let currentResidueId: string | null = null;
  let currentResname: string | null = null;
  builder.initStructure(structureId);
  builder.initSeg(" ");
  // Biopython's model id is an array index; the serial id is the model number from the file.
  let currentModelId = -1;
  let currentSerialId = -1;
  for (let i = 0; i < atomIdList.length; i++) {
    // Counts atom records only, unlike the global line counter of PDBParser.
    builder.setLineCounter(i);
    let serial: number | string;
    if (mode.fast) serial = at(atomSerialList, i);
    else {
      // Serial numbers may be strings in mmCIF; keep going with a warning.
      try { serial = pyInt(at(atomSerialList, i)); } catch (e) {
        if (e instanceof IndexError) throw e;
        serial = atomSerialList[i]!;
        warn("PDBConstructionWarning: Some atom serial numbers are not numerical", PDB_CONSTRUCTION_WARNING);
      }
    }
    const x = at(xList, i);
    const y = at(yList, i);
    const z = at(zList, i);
    const resname = at(residueIdList, i);
    const chainid = at(chainIdList, i);
    let altloc = at(altList, i);
    if (UNASSIGNED.has(altloc)) altloc = " ";
    const resseq = at(seqIdList, i);
    if (resseq === ".") {
      // Non-existing residue ID
      let msg: string;
      try { msg = `Non-existing residue ID in chain '${chainid}', residue '${at(column(d, "_atom_site.auth_seq_id"), i)}'`; } catch { msg = `Non-existing residue ID in chain '${chainid}'`; }
      warn("PDBConstructionWarning: " + msg, PDB_CONSTRUCTION_WARNING);
      continue;
    }
    const intResseq = pyInt(resseq);
    let icode = at(icodeList, i);
    if (UNASSIGNED.has(icode)) icode = " ";
    // Fast parser: remove occasional quotes from atom names (e.g. xNA).
    const name = mode.fast ? at(atomIdList, i).replace(/^"+|"+$/g, "") : at(atomIdList, i);
    let tempfactor: number;
    try { tempfactor = pyFloat(at(bFactorList, i)); } catch (e) { if (e instanceof IndexError) throw e; throw new PDBConstructionException("Invalid or missing B factor"); }
    let occupancy: number;
    try { occupancy = pyFloat(at(occupancyList, i)); } catch (e) { if (e instanceof IndexError) throw e; throw new PDBConstructionException("Invalid or missing occupancy"); }
    const fieldname = at(fieldnameList, i);
    let hetatmFlag = " ";
    if (fieldname === "HETATM") hetatmFlag = !mode.fast && (resname === "HOH" || resname === "WAT") ? "W" : "H";
    const residueId = JSON.stringify([hetatmFlag, intResseq, icode]);

    if (serialList !== null) {
      const serialId = at(serialList, i);
      if (currentSerialId !== serialId) {
        currentSerialId = serialId;
        currentModelId += 1;
        builder.initModel(currentModelId, currentSerialId);
        currentChainId = null;
        currentResidueId = null;
        currentResname = null;
      }
    } else builder.initModel(currentModelId);

    if (currentChainId !== chainid) {
      currentChainId = chainid;
      builder.initChain(currentChainId);
      currentResidueId = null;
      currentResname = null;
    }
    if (currentResidueId !== residueId || currentResname !== resname) {
      currentResidueId = residueId;
      currentResname = resname;
      builder.initResidue(resname, hetatmFlag, intResseq, icode);
    }
    const coord = Float32Array.from([x, y, z]);
    let element: string | null = null;
    if (elementList !== null && elementList.length > 0) element = mode.fast ? at(elementList, i) : at(elementList, i).toUpperCase();
    if (mode.fast) builder.initAtom(name, coord, tempfactor, occupancy, altloc, name, serial, element);
    else {
      try { builder.initAtom(name, coord, tempfactor, occupancy, altloc, name, serial, element); } catch (e) {
        if (!(e instanceof PDBConstructionException)) throw e;
        mode.handle(e.message);
      }
    }
    if (aniso !== null && i < aniso[0]!.length) {
      const u = aniso.map((col) => at(col, i));
      builder.setAnisou(Float32Array.from(floats(u)));
    }
  }
  if (!mode.fast) {
    // Try to set the cell; any problem just means no cell was found.
    try {
      const num = (k: string): number => pyFloat(at(column(d, k), 0));
      const cell = Float32Array.from([num("_cell.length_a"), num("_cell.length_b"), num("_cell.length_c"), num("_cell.angle_alpha"), num("_cell.angle_beta"), num("_cell.angle_gamma")]);
      const spacegroup = at(column(d, "_symmetry.space_group_name_H-M"), 0).slice(1, -1); // get rid of the quotes
      builder.setSymmetry(spacegroup, cell);
    } catch { /* no cell found */ }
  }
}

/** Parser for mmCIF files, with the full dictionary, a header, and permissive error handling. */
export class MMCIFParser {
  /** Builds the structure. */
  structureBuilder: StructureBuilder;
  /** The header (`name`, `head`, `idcode`, ...), or null before parsing. */
  header: MmcifHeader | null = null;
  /** Unused, as in Biopython. */
  lineCounter = 0;
  /** Use author chain ids. */
  readonly authChains: boolean;
  /** Use author residue numbering. */
  readonly authResidues: boolean;
  /** Suppress construction warnings. */
  readonly quiet: boolean;
  /** Continue after recoverable atom problems. */
  readonly permissive: boolean;
  /** The parsed dictionary of the last file. */
  mmcifDict: MMCIF2Dict | null = null;

  /** @param options - See {@link MmcifParserOptions}. */
  constructor(options: MmcifParserOptions = {}) {
    this.structureBuilder = options.structureBuilder ?? new StructureBuilder();
    this.authChains = options.authChains === undefined ? true : Boolean(options.authChains);
    this.authResidues = options.authResidues === undefined ? true : Boolean(options.authResidues);
    this.quiet = Boolean(options.quiet);
    this.permissive = Boolean(options.permissive);
  }

  /**
   * Parse mmCIF text into a structure.
   *
   * @param id - The structure id.
   * @param text - The file contents (Biopython also takes a file name or handle).
   * @throws {@link ValueError} for malformed files, {@link KeyError} for missing `_atom_site` columns,
   *   {@link PDBConstructionException} for construction problems when not permissive.
   */
  getStructure(id: string, text: string): Structure {
    return quietly(this.quiet, () => {
      this.mmcifDict = new MMCIF2Dict(text);
      this.buildStructure(id);
      this.structureBuilder.setHeader(this.getHeader() as unknown as Record<string, unknown>);
      return this.structureBuilder.getStructure();
    });
  }

  private buildStructure(id: string): void {
    buildStructure(this.mmcifDict!, id, this.structureBuilder, this.authChains, this.authResidues, { fast: false, permissive: this.permissive, handle: (m) => this.handlePdbException(m) });
  }

  /** Store the first usable value (not `?` or `.`) of the listed keys under `target`. */
  private updateHeaderEntry(target: keyof MmcifHeader, keys: string[]): void {
    for (const key of keys) {
      const item = (this.mmcifDict!.get(key) as string[] | undefined)?.[0];
      if (item === undefined) continue;
      if (item !== "?" && item !== ".") {
        (this.header as unknown as Record<string, unknown>)[target] = item;
        break;
      }
    }
  }

  private getHeader(): MmcifHeader {
    this.header = { name: "", head: "", idcode: "", deposition_date: "", structure_method: "", resolution: null };
    this.updateHeaderEntry("idcode", ["_entry_id", "_exptl.entry_id", "_struct.entry_id"]);
    this.updateHeaderEntry("name", ["_struct.title"]);
    this.updateHeaderEntry("head", ["_struct_keywords.pdbx_keywords", "_struct_keywords.text"]);
    this.updateHeaderEntry("deposition_date", ["_pdbx_database_status.recvd_initial_deposition_date"]);
    this.updateHeaderEntry("structure_method", ["_exptl.method"]);
    this.updateHeaderEntry("resolution", ["_refine.ls_d_res_high", "_refine_hist.d_res_high", "_em_3d_reconstruction.resolution"]);
    if (this.header.resolution !== null) {
      try { this.header.resolution = pyFloat(this.header.resolution as unknown as string); } catch { this.header.resolution = null; }
    }
    return this.header;
  }

  /** Warn when permissive, otherwise raise the exception again. */
  private handlePdbException(message: string): void {
    if (this.permissive) {
      warn(`PDBConstructionException: ${message}\nException ignored.\nSome atoms or residues may be missing in the data structure.`, PDB_CONSTRUCTION_WARNING);
    } else throw new PDBConstructionException(message);
  }
}

/** Faster mmCIF parser that reads only the `_atom_site` and `_atom_site_anisotrop` categories, splitting on whitespace. */
export class FastMMCIFParser {
  /** Builds the structure. */
  structureBuilder: StructureBuilder;
  /** Unused, as in Biopython. */
  lineCounter = 0;
  /** Use author chain ids. */
  readonly authChains: boolean;
  /** Use author residue numbering. */
  readonly authResidues: boolean;
  /** Suppress construction warnings. */
  readonly quiet: boolean;

  /** @param options - See {@link MmcifParserOptions} (`permissive` is not used). */
  constructor(options: MmcifParserOptions = {}) {
    this.structureBuilder = options.structureBuilder ?? new StructureBuilder();
    this.authChains = options.authChains === undefined ? true : Boolean(options.authChains);
    this.authResidues = options.authResidues === undefined ? true : Boolean(options.authResidues);
    this.quiet = Boolean(options.quiet);
  }

  /**
   * Parse mmCIF text into a structure.
   *
   * @param id - The structure id.
   * @param text - The file contents.
   */
  getStructure(id: string, text: string): Structure {
    return quietly(this.quiet, () => {
      const d = this.readColumns(text);
      buildStructure(d, id, this.structureBuilder, this.authChains, this.authResidues, { fast: true, permissive: false, handle: () => undefined });
      return this.structureBuilder.getStructure();
    });
  }

  /** Collect the two categories into columns, as `dict(zip(fields, zip(*map(str.split, records))))` does. */
  private readColumns(text: string): Map<string, string[]> {
    let readAtom = false;
    let readAniso = false;
    const fields: string[] = [];
    const records: string[] = [];
    const anisoFields: string[] = [];
    const anisoRecords: string[] = [];
    for (const line of readLines(text)) {
      if (line.startsWith("_atom_site.")) { readAtom = true; fields.push(line.trim()); }
      else if (line.startsWith("_atom_site_anisotrop.")) { readAniso = true; anisoFields.push(line.trim()); }
      else if (readAtom && line.startsWith("#")) readAtom = false;
      else if (readAniso && line.startsWith("#")) readAniso = false;
      else if (readAtom) records.push(line.trim());
      else if (readAniso) anisoRecords.push(line.trim());
    }
    const transpose = (rows: string[]): string[][] => {
      const split = rows.map((r) => r.split(/\s+/).filter((w) => w.length > 0));
      if (split.length === 0) return [];
      const width = Math.min(...split.map((r) => r.length));
      return Array.from({ length: width }, (_, c) => split.map((r) => r[c]!));
    };
    const d = new Map<string, string[]>();
    const cols = transpose(records);
    for (let k = 0; k < Math.min(fields.length, cols.length); k++) d.set(fields[k]!, cols[k]!);
    const acols = transpose(anisoRecords);
    for (let k = 0; k < Math.min(anisoFields.length, acols.length); k++) d.set(anisoFields[k]!, acols[k]!);
    return d;
  }
}
