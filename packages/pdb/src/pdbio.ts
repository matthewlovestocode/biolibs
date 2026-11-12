/** `PDBIO`: writes a structure (or part of one) as a PDB or PQR file (Biopython's `Bio.PDB.PDBIO.PDBIO`). */

import { IUPACData } from "@biolibs/seq";
import { ValueError, pyFloatRepr, pyInt, pyRepr, pyStrip, warn } from "@biolibs/core";
import { PDBIOException, PDB_IO_WARNING } from "./exceptions.js";
import { Select, StructureIO, defaultSelect } from "./structure-io.js";
import { AssertionError, capitalize, fixed, padLeft, padRight, pctC, pctI, strLen, truncInt } from "./pyformat.js";
import type { Atom } from "./atom.js";

const MAX_B_FACTOR_2DP = 1_000;
const MAX_B_FACTOR_1DP = 10_000;
const MAX_B_FACTOR = 999_999;

/** Python `repr` of an id tuple such as a full id: arrays print as tuples. */
function tupleRepr(x: unknown): string {
  if (!Array.isArray(x)) return pyRepr(x);
  return `(${x.map(tupleRepr).join(", ")}${x.length === 1 ? "," : ""})`;
}

/** Python `isalpha()` on one character. */
const isAlpha = (c: string): boolean => /^\p{L}$/u.test(c);

/**
 * Format a B-factor into at most 6 characters as the wwPDB specification allows, dropping decimals
 * (and finally truncating to 999999 with a warning) as the value grows.
 *
 * @param value - The B-factor; null raises the same `TypeError` Python's comparison does.
 * @returns A 6-column string.
 * @throws AssertionError when the text still exceeds 6 characters (very negative values).
 */
export function formatBFactor(value: number | null): string {
  if (value === null) throw new TypeError("'<' not supported between instances of 'NoneType' and 'int'");
  let text: string;
  if (value < MAX_B_FACTOR_2DP) {
    text = padLeft(fixed(value, fixed(value, 2).length > 6 ? 1 : 2), 6);
  } else if (value < MAX_B_FACTOR_1DP) {
    text = padLeft(fixed(value, fixed(value, 1).length > 6 ? 0 : 1), 6);
  } else if (value < MAX_B_FACTOR) {
    text = padLeft(String(Math.trunc(value)), 6);
  } else {
    warn(`Truncated bfactor ${pyFloatRepr(value)} to ${MAX_B_FACTOR} to fit wwPDB spec. Consider using mmCIF instead!`, PDB_IO_WARNING);
    text = padLeft(String(MAX_B_FACTOR), 6);
  }
  if (text.length > 6) throw new AssertionError("");
  return text;
}

/** Options of {@link PDBIO}. */
export interface PDBIOOptions {
  /** Always write `MODEL`/`ENDMDL` records, even for a single model. */
  useModelFlag?: boolean | number;
  /** Write PQR (charge and radius) instead of PDB. */
  isPqr?: boolean;
}

/** Writer of PDB and PQR files. */
export class PDBIO extends StructureIO {
  /** Force `MODEL` records. */
  useModelFlag: boolean | number;
  /** Write PQR. */
  isPqr: boolean;

  /** @param options - See {@link PDBIOOptions}. */
  constructor(options: PDBIOOptions = {}) {
    super();
    this.useModelFlag = options.useModelFlag ?? 0;
    this.isPqr = Boolean(options.isPqr);
  }

  /**
   * One `ATOM`/`HETATM` (or PQR) line.
   *
   * @throws ValueError for a non-numeric or too-large serial number or an unknown element, and
   *   TypeError/ValueError/OverflowError for values Python's `%` formatting rejects.
   */
  private atomLine(atom: Atom, hetfield: string, segid: string, atomNumber: number | string | null, resname: string, resseq: number, icode: string, chainId: string, charge = "  "): string {
    const recordType = hetfield !== " " ? "HETATM" : "ATOM  ";
    // mmCIF-built structures may carry non-numeric serial numbers.
    let serial: number;
    if (typeof atomNumber === "number") {
      serial = truncInt(atomNumber);
    } else if (typeof atomNumber === "string") {
      try { serial = pyInt(atomNumber); } catch {
        throw new ValueError(`${pyRepr(atomNumber)} is not a number.Atom serial numbers must be numerical If you are converting from an mmCIF structure, try using preserve_atom_numbering=False`);
      }
    } else throw new TypeError("int() argument must be a string, a bytes-like object or a real number, not 'NoneType'");
    if (serial > 99999) throw new ValueError(`Atom serial number ('${serial}') exceeds PDB format limit.`);

    let element: string;
    if (atom.element) {
      element = pyStrip(atom.element).toUpperCase();
      if (!Object.hasOwn(IUPACData.atomWeights, capitalize(element)) && element !== "X") throw new ValueError(`Unrecognised element ${atom.element}`);
      element = padLeft(element, 2);
    } else element = "  ";

    // Pad the name unless it is already 4 characters, a two-letter element, or starts with a digit.
    let name = pyStrip(atom.fullname);
    if (strLen(name) < 4 && name !== "" && isAlpha(Array.from(name)[0]!) && strLen(pyStrip(element)) < 2) name = " " + name;

    const altloc = atom.altloc;
    const [x, y, z] = atom.coord as unknown as [number, number, number];
    const head = `${recordType}${pctI(serial, 5)} ${padRight(name, 4)}${pctC(altloc, 4)}${padLeft(resname, 3)} ${pctC(chainId, 6)}${pctI(resseq, 4)}${pctC(icode, 8)}   `;
    const xyz = padLeft(fixed(x, 3), 8) + padLeft(fixed(y, 3), 8) + padLeft(fixed(z, 3), 8);
    const fullId = tupleRepr(atom.fullId);

    if (!this.isPqr) {
      let occupancy: string;
      if (atom.occupancy === null) {
        occupancy = " ".repeat(6);
        warn(`Missing occupancy in atom ${fullId} written as blank`, PDB_IO_WARNING);
      } else occupancy = padLeft(fixed(atom.occupancy, 2), 6);
      const bfactor = formatBFactor(atom.bfactor);
      return `${head}${xyz}${occupancy}${bfactor}      ${padLeft(segid, 4)}${element}${padLeft(charge, 2)}\n`;
    }
    let pqrCharge: string;
    if (atom.pqrCharge === null) {
      pqrCharge = " ".repeat(7);
      warn(`Missing PQR charge in atom ${fullId} written as blank`, PDB_IO_WARNING);
    } else pqrCharge = fixed(atom.pqrCharge, 4);
    let radius: string;
    if (atom.radius === null) {
      radius = " ".repeat(6);
      warn(`Missing radius in atom ${fullId} written as blank`, PDB_IO_WARNING);
    } else radius = fixed(atom.radius, 4);
    return `${head}${xyz} ${padLeft(pqrCharge, 7)}  ${padLeft(radius, 6)}      ${element}\n`;
  }

  /**
   * Write the structure as PDB text.
   *
   * Python writes to a file or handle and, on failure, deletes the file or truncates the handle; here
   * the text is returned, so a failure simply yields no text.
   *
   * @param select - Which models, chains, residues and atoms to write (default: all).
   * @param writeEnd - Finish with an `END` record (default true).
   * @param preserveAtomNumbering - Use each atom's own serial number instead of counting from 1 per model.
   * @returns The file contents.
   * @throws PDBIOException for an over-long chain id, a residue number above 9999 or an atom that cannot be formatted.
   */
  save(select: Select = defaultSelect, writeEnd = true, preserveAtomNumbering = false): string {
    if (this.structure === undefined) throw new TypeError("'PDBIO' object has no attribute 'structure'");
    const out: string[] = [];
    const modelFlag = this.structure.length > 1 || Boolean(this.useModelFlag);
    // These stay in scope across loops in Python; the TER record reads the last values.
    let atomNumber: number | string | null = 1;
    let resname = "", resseq = 0, icode = "";
    for (const model of this.structure.getList()) {
      if (!select.acceptModel(model)) continue;
      let modelResiduesWritten = false;
      if (!preserveAtomNumbering) atomNumber = 1;
      if (modelFlag) out.push(`MODEL      ${model.serialNum}\n`);
      for (const chain of model.getList()) {
        if (!select.acceptChain(chain)) continue;
        const chainId = chain.id as string;
        if (strLen(chainId) > 1) throw new PDBIOException(`Chain id ('${chainId}') exceeds PDB format limit.`);
        let chainResiduesWritten = false;
        for (const residue of chain.getUnpackedList()) {
          if (!select.acceptResidue(residue)) continue;
          const [hetfield, rseq, ic] = residue.id as [string, number, string];
          resname = residue.resname; resseq = rseq; icode = ic;
          const segid = residue.segid;
          if (rseq > 9999) throw new PDBIOException(`Residue number ('${rseq}') exceeds PDB format limit.`);
          for (const atom of residue.getUnpackedList()) {
            if (!select.acceptAtom(atom)) continue;
            chainResiduesWritten = true;
            modelResiduesWritten = true;
            if (preserveAtomNumbering) atomNumber = atom.serialNumber;
            let line: string;
            try {
              line = this.atomLine(atom, hetfield, segid, atomNumber, resname, resseq, icode, chainId);
            } catch (err) {
              throw new PDBIOException(`Error when writing atom ${tupleRepr(atom.fullId)}: ${(err as Error).message}`);
            }
            out.push(line);
            // Outside the try in Python: a string serial number fails here, unwrapped.
            if (typeof atomNumber === "string") throw new TypeError('can only concatenate str (not "int") to str');
            atomNumber = (atomNumber as number) + 1;
          }
        }
        if (chainResiduesWritten) {
          out.push(`TER   ${pctI(atomNumber as number, 5)}      ${padLeft(resname, 3)} ${pctC(chainId, 3)}${pctI(resseq, 4)}${pctC(icode, 5)}${" ".repeat(54)}\n`);
        }
      }
      if (modelFlag && modelResiduesWritten) out.push("ENDMDL\n");
    }
    if (writeEnd) out.push("END   \n");
    return out.join("");
  }
}
