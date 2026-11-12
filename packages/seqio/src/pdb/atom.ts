/** Readers for the `pdb-atom` and `cif-atom` formats: chain sequences taken from the atoms of a 3D structure. */

import { KeyError, warn } from "@biolibs/core";
import { MMCIFParser, PDBParser, type Residue, type Structure } from "@biolibs/pdb";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { SequenceIterator } from "../interfaces.js";
import { res2aacode } from "./seqres.js";

const PARSER = "BiopythonParserWarning";

/** The whole text of an open input, as the Bio.PDB parsers need it. */
export function readAll(stream: Iterable<string>): string {
  return [...stream].join("");
}

/** Convert the header's plain objects to `Map`s, the representation of Python dicts in annotations. */
function dictsToMaps(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(dictsToMaps);
  if (x !== null && typeof x === "object" && !(x instanceof Map) && !ArrayBuffer.isView(x)) return new Map(Object.entries(x).map(([k, v]) => [k, dictsToMaps(v)]));
  return x;
}

/**
 * Sequence records from a parsed structure, one per chain of the first model (in chain-id order).
 *
 * Residues whose name is not a known amino acid are dropped; a gap in the residue numbering is filled
 * with `X` characters. An out-of-order residue after a gap ends the chain, with a `BiopythonParserWarning`.
 * Each record carries `molecule_type`, `model`, `chain`, `start` and `end` annotations.
 *
 * @param pdbId - The PDB id used to name the records (`<pdbId>:<chain>`).
 * @param structure - A structure from one of the Bio.PDB parsers.
 * @throws {@link KeyError} when the structure has no model 0.
 */
export function* atomIterator(pdbId: string, structure: Structure): Generator<SeqRecord> {
  const model = structure.get(0);
  const chains = [...model.childList].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const chain of chains) {
    // HETATM modified residues: keep if they map to an amino acid, else discard.
    const residues: Residue[] = chain.getUnpackedList().filter((r) => res2aacode(r.getResname().toUpperCase()) !== "X");
    if (residues.length === 0) continue;
    // Missing residues (jumps in the numbering) become runs of X.
    const gaps: [number, number, number][] = [];
    const rnumbers = residues.map((r) => (r.id as readonly [string, number, string])[1]);
    for (let i = 0; i < rnumbers.length - 1; i++) {
      const rnum = rnumbers[i]!;
      if (rnumbers[i + 1] !== rnum + 1 && rnumbers[i + 1] !== rnum) gaps.push([i + 1, rnum, rnumbers[i + 1]!]);
    }
    const aa = (rs: Residue[]): string[] => rs.map((x) => res2aacode(x.resname));
    let resOut: string[];
    if (gaps.length > 0) {
      resOut = [];
      let prevIdx = 0;
      let broke = false;
      for (const [i, pregap, postgap] of gaps) {
        if (postgap > pregap) {
          const gapsize = postgap - pregap - 1;
          resOut.push(...aa(residues.slice(prevIdx, i)));
          prevIdx = i;
          resOut.push("X".repeat(gapsize));
        } else {
          warn("Ignoring out-of-order residues after a gap", PARSER);
          // Keep the normal part, drop the out-of-order segment (modified or hetero residues, e.g. 3BEG).
          resOut.push(...aa(residues.slice(prevIdx, i)));
          broke = true;
          break;
        }
      }
      if (!broke) resOut.push(...aa(residues.slice(prevIdx)));
    } else resOut = aa(residues);
    const recordId = `${pdbId}:${chain.id}`;
    const record = new SeqRecord(new Seq(resOut.join("")), recordId, undefined, recordId);
    record.annotations = new Map<string, unknown>([["molecule_type", "protein"], ["model", model.id], ["chain", chain.id], ["start", Math.trunc(rnumbers[0]!)], ["end", Math.trunc(rnumbers[rnumbers.length - 1]!)]]);
    yield record;
  }
}

/**
 * Reads the 3D structure of a PDB file (its ATOM and HETATM records, not the SEQRES lines) and yields one
 * record per chain. The PDB header is copied into every record's annotations; the record id is
 * `<idcode>:<chain>`, with `????` and a warning when the file has no HEADER line.
 */
export class PdbAtomIterator extends SequenceIterator {
  get modes(): string { return "t"; }
  private readonly records: Iterator<SeqRecord>;

  /** @param source - File contents. Parsed completely on construction, as Biopython does. */
  constructor(source: unknown) {
    super(source, null, "PDB");
    const structure = new PDBParser().getStructure("", readAll(this.stream!));
    const header = structure.header as Record<string, unknown>;
    let pdbId = header["idcode"] as string;
    if (!pdbId) {
      warn("'HEADER' line not found; can't determine PDB ID.", PARSER);
      pdbId = "????";
    }
    const records: SeqRecord[] = [];
    for (const record of atomIterator(pdbId, structure)) {
      for (const [k, v] of Object.entries(header)) record.annotations.set(k, dictsToMaps(v));
      records.push(record);
    }
    this.records = records[Symbol.iterator]();
  }

  protected nextRecord(): SeqRecord | null {
    const n = this.records.next();
    return n.done ? null : n.value;
  }
}

/**
 * Reads the 3D structure of an mmCIF file (its `_atom_site` fields) and yields one record per chain;
 * see {@link PdbAtomIterator}. Unlike the PDB reader, the structure is read up front but records are built lazily.
 */
export class CifAtomIterator extends SequenceIterator {
  get modes(): string { return "t"; }
  private readonly records: Generator<SeqRecord>;

  /** @param source - File contents. */
  constructor(source: unknown) {
    super(source, null, "Sequence");
    const structure = new MMCIFParser().getStructure("", readAll(this.stream!));
    let pdbId = (structure.header as Record<string, unknown>)["idcode"] as string;
    if (!pdbId) {
      warn("Could not determine the PDB ID.", PARSER);
      pdbId = "????";
    }
    this.records = atomIterator(pdbId, structure);
  }

  protected nextRecord(): SeqRecord | null {
    const n = this.records.next();
    return n.done ? null : n.value;
  }
}
