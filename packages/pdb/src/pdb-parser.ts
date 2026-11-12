/** `PDBParser`: reads PDB files into a `Structure` (Biopython's `Bio.PDB.PDBParser`). */

import { IndexError, ValueError, pyFloat, pyInt, pyStrip, setWarningHandler, warn } from "@biolibs/core";
import { PDBConstructionException, PDB_CONSTRUCTION_WARNING } from "./exceptions.js";
import { parsePdbHeaderList, type PdbHeader } from "./header.js";
import type { Structure } from "./chain.js";
import { StructureBuilder } from "./structure-builder.js";

/** Python `line[i]`: one character, or an IndexError past the end. */
function charAt(line: string, i: number): string {
  if (i >= line.length) throw new IndexError("string index out of range");
  return line[i]!;
}

/** Python `float(x)` as the parser uses it inside `try/except Exception`: the value, or null on failure. */
function tryFloat(text: string): number | null {
  try { return pyFloat(text); } catch { return null; }
}

/** Python `str.split()`. */
const words = (s: string): string[] => s.split(/\s+/).filter((w) => w.length > 0);

/** Split text into lines keeping the `\n` (Python `readlines()` on a text stream). */
export function readLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+/g) ?? [];
}

const ALLOWED_RECORDS = new Set(["ATOM  ", "HETATM", "MODEL ", "ENDMDL", "TER   ", "ANISOU", "SIGATM", "SIGUIJ", "MASTER"]);

/** Options of {@link PDBParser}. */
export interface PDBParserOptions {
  /** Continue after recoverable problems, with a warning (default true). */
  permissive?: boolean;
  /** Ignored (kept for signature compatibility; the header is always parsed). */
  getHeader?: boolean;
  /** Use this builder instead of a new `StructureBuilder`. */
  structureBuilder?: StructureBuilder | null;
  /** Suppress construction warnings (default false). */
  quiet?: boolean;
  /** Read a PQR file (charge and radius instead of occupancy and B-factor). */
  isPqr?: boolean;
}

/** Parser for PDB (and PQR) files. */
export class PDBParser {
  /** Builds the structure. */
  structureBuilder: StructureBuilder;
  /** The parsed header, or null before parsing. */
  header: PdbHeader | null = null;
  /** The lines after `END`/`CONECT`, or null. */
  trailer: string[] | null = null;
  /** Current line number. */
  lineCounter = 0;
  /** Continue after recoverable problems. */
  readonly permissive: boolean;
  /** Suppress construction warnings. */
  readonly quiet: boolean;
  /** Reading PQR. */
  readonly isPqr: boolean;

  /** @param options - See {@link PDBParserOptions}. */
  constructor(options: PDBParserOptions = {}) {
    this.structureBuilder = options.structureBuilder ?? new StructureBuilder();
    this.permissive = options.permissive === undefined ? true : Boolean(options.permissive);
    this.quiet = Boolean(options.quiet);
    this.isPqr = Boolean(options.isPqr);
  }

  /**
   * Parse a file's text into a structure.
   *
   * @param id - The structure id.
   * @param text - The file contents.
   * @throws {@link ValueError} for an empty file.
   * @throws {@link PDBConstructionException} for unrecoverable problems (or any problem when not permissive).
   */
  getStructure(id: string, text: string): Structure {
    let previous: ReturnType<typeof setWarningHandler> | null = null;
    if (this.quiet) {
      // Python: warnings.filterwarnings("ignore", category=PDBConstructionWarning) for the duration of the call.
      previous = setWarningHandler(() => undefined);
      const original = previous;
      setWarningHandler((w) => { if (w.category !== PDB_CONSTRUCTION_WARNING) original(w); });
    }
    try {
      this.header = null;
      this.trailer = null;
      this.structureBuilder.initStructure(id);
      const lines = readLines(text);
      if (lines.length === 0) throw new ValueError("Empty file.");
      this.parse(lines);
      this.structureBuilder.setHeader(this.header as unknown as Record<string, unknown>);
      return this.structureBuilder.getStructure();
    } finally {
      if (previous !== null) setWarningHandler(previous);
    }
  }

  /** The parsed header. */
  getHeader(): PdbHeader | null { return this.header; }
  /** The trailer lines. */
  getTrailer(): string[] | null { return this.trailer; }

  private parse(lines: string[]): void {
    const [header, coordsTrailer] = this.getHeaderAndRest(lines);
    this.header = header;
    this.trailer = this.parseCoordinates(coordsTrailer);
  }

  /** Split off the header (lines before the first ATOM, HETATM or MODEL record) and parse it. */
  private getHeaderAndRest(lines: string[]): [PdbHeader, string[]] {
    const builder = this.structureBuilder;
    let i = 0;
    for (i = 0; i < lines.length; i++) {
      builder.setLineCounter(i + 1);
      const recordType = lines[i]!.slice(0, 6);
      if (recordType === "ATOM  " || recordType === "HETATM" || recordType === "MODEL ") break;
    }
    // Python's loop variable stays at the last index when no record is found.
    if (i >= lines.length) i = Math.max(lines.length - 1, 0);
    this.lineCounter = i;
    return [parsePdbHeaderList(lines.slice(0, i)), lines.slice(i)];
  }

  /** Report a recoverable problem: a warning when permissive, else a construction exception. */
  private handleException(message: unknown, lineCounter: number): void {
    const text = `${String(message)} at line ${lineCounter}.`;
    if (this.permissive) {
      warn(`PDBConstructionException: ${text}\nException ignored.\nSome atoms or residues may be missing in the data structure.`, PDB_CONSTRUCTION_WARNING);
    } else throw new PDBConstructionException(text);
  }

  private parseCoordinates(coordsTrailer: string[]): string[] {
    let local = 0;
    const builder = this.structureBuilder;
    let currentModelId = 0;
    let modelOpen = 0;
    let currentChainId: string | null = null;
    let currentSegid: string | null = null;
    let currentResidueId: string | null = null;
    let currentResname: string | null = null;
    for (const raw of coordsTrailer) {
      const line = raw.replace(/\n$/, "");
      const recordType = line.slice(0, 6);
      const globalLine = this.lineCounter + local + 1;
      builder.setLineCounter(globalLine);
      if (!pyStrip(line)) { continue; }
      if (recordType === "ATOM  " || recordType === "HETATM") {
        if (!modelOpen) {
          builder.initModel(currentModelId);
          currentModelId++;
          modelOpen = 1;
        }
        const fullname = line.slice(12, 16);
        const split = words(fullname);
        const name = split.length !== 1 ? fullname : split[0]!;
        const altloc = charAt(line, 16);
        const resname = pyStrip(line.slice(17, 20));
        const chainid = charAt(line, 21);
        let serialNumber: number;
        try { serialNumber = pyInt(line.slice(6, 11)); } catch { serialNumber = 0; }
        const resseqWords = words(line.slice(22, 26));
        if (resseqWords.length === 0) throw new IndexError("list index out of range");
        const resseq = pyInt(resseqWords[0]!);
        const icode = charAt(line, 26);
        const hetero = recordType === "HETATM" ? (resname === "HOH" || resname === "WAT" ? "W" : "H") : " ";
        const residueId = JSON.stringify([hetero, resseq, icode]);
        const x = tryFloat(line.slice(30, 38));
        const y = x === null ? null : tryFloat(line.slice(38, 46));
        const z = y === null ? null : tryFloat(line.slice(46, 54));
        if (x === null || y === null || z === null) throw new PDBConstructionException(`Invalid or missing coordinate(s) at line ${globalLine}.`);
        const coord = Float32Array.from([x, y, z]);
        let occupancy: number | null = null;
        let bfactor = 0.0;
        let pqrCharge: number | null = null;
        let radius: number | null = null;
        if (!this.isPqr) {
          const occ = tryFloat(line.slice(54, 60));
          if (occ === null) { this.handleException("Invalid or missing occupancy", globalLine); occupancy = null; }
          else occupancy = occ;
          if (occupancy !== null && occupancy < 0) warn("Negative occupancy in one or more atoms", PDB_CONSTRUCTION_WARNING);
          const bf = tryFloat(line.slice(60, 66));
          if (bf === null) { this.handleException("Invalid or missing B factor", globalLine); bfactor = 0.0; }
          else bfactor = bf;
        } else {
          const charge = tryFloat(line.slice(54, 62));
          if (charge === null) { this.handleException("Invalid or missing charge", globalLine); pqrCharge = null; }
          else pqrCharge = charge;
          const rad = tryFloat(line.slice(62, 70));
          if (rad === null) { this.handleException("Invalid or missing radius", globalLine); radius = null; }
          else radius = rad;
          if (radius !== null && radius < 0) { this.handleException("Negative atom radius", globalLine); radius = null; }
        }
        const segid = line.slice(72, 76);
        const element = pyStrip(line.slice(76, 78)).toUpperCase();
        if (currentSegid !== segid) {
          currentSegid = segid;
          builder.initSeg(currentSegid);
        }
        if (currentChainId !== chainid) {
          currentChainId = chainid;
          builder.initChain(currentChainId);
          currentResidueId = residueId;
          currentResname = resname;
          try { builder.initResidue(resname, hetero, resseq, icode); }
          catch (e) { if (e instanceof PDBConstructionException) this.handleException(e.message, globalLine); else throw e; }
        } else if (currentResidueId !== residueId || currentResname !== resname) {
          currentResidueId = residueId;
          currentResname = resname;
          try { builder.initResidue(resname, hetero, resseq, icode); }
          catch (e) { if (e instanceof PDBConstructionException) this.handleException(e.message, globalLine); else throw e; }
        }
        try {
          if (!this.isPqr) builder.initAtom(name, coord, bfactor, occupancy, altloc, fullname, serialNumber, element);
          else builder.initAtom(name, coord, pqrCharge, radius, altloc, fullname, serialNumber, element, pqrCharge, radius, this.isPqr);
        } catch (e) { if (e instanceof PDBConstructionException) this.handleException(e.message, globalLine); else throw e; }
      } else if (recordType === "ANISOU") {
        const values = [line.slice(28, 35), line.slice(35, 42), line.slice(43, 49), line.slice(49, 56), line.slice(56, 63), line.slice(63, 70)].map(pyFloat);
        builder.setAnisou(Float32Array.from(Float32Array.from(values), (v) => Math.fround(v / 10000.0)));
      } else if (recordType === "MODEL ") {
        let serialNum: number;
        try { serialNum = pyInt(line.slice(10, 14)); }
        catch { this.handleException("Invalid or missing model serial number", globalLine); serialNum = 0; }
        builder.initModel(currentModelId, serialNum);
        currentModelId++;
        modelOpen = 1;
        currentChainId = null;
        currentResidueId = null;
      } else if (recordType === "END   " || recordType === "CONECT") {
        this.lineCounter += local;
        return coordsTrailer.slice(local);
      } else if (recordType === "ENDMDL") {
        modelOpen = 0;
        currentChainId = null;
        currentResidueId = null;
      } else if (recordType === "SIGUIJ") {
        const values = [line.slice(28, 35), line.slice(35, 42), line.slice(42, 49), line.slice(49, 56), line.slice(56, 63), line.slice(63, 70)].map(pyFloat);
        builder.setSiguij(Float32Array.from(Float32Array.from(values), (v) => Math.fround(v / 10000.0)));
      } else if (recordType === "SIGATM") {
        const values = [line.slice(30, 38), line.slice(38, 46), line.slice(46, 54), line.slice(54, 60), line.slice(60, 66)].map(pyFloat);
        builder.setSigatm(Float32Array.from(values));
      } else if (!ALLOWED_RECORDS.has(recordType)) {
        warn(`Ignoring unrecognized record '${recordType}' at line ${globalLine}`, PDB_CONSTRUCTION_WARNING);
      }
      local++;
    }
    this.lineCounter += local;
    return [];
  }
}
