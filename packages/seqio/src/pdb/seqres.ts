/** Reader for the `pdb-seqres` format: chain sequences from the SEQRES header of a PDB file. */

import { IndexError, UnboundLocalError, ValueError, pySplit, pyStrip } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { SequenceIterator } from "../interfaces.js";
import { proteinLetters3to1, proteinLetters3to1Extended } from "@biolibs/pdb";

/** Residue name to one-letter code, standard amino acids overlaid with the extended (modified residue) table. */
const AA_3_TO_1: Record<string, string> = { ...proteinLetters3to1, ...proteinLetters3to1Extended };

/**
 * One-letter amino acid code of a residue name; anything unknown (including non-amino acids) is `X`.
 *
 * @param residue - Three-character PDB residue name, upper case.
 */
export function res2aacode(residue: string): string {
  return Object.hasOwn(AA_3_TO_1, residue) ? AA_3_TO_1[residue]! : "X";
}

/** Python `line[i]`: one character, or IndexError past the end. */
function charAt(line: string, i: number): string {
  if (i >= line.length) throw new IndexError("string index out of range");
  return line[i]!;
}

/** A database cross-reference taken from a DBREF record (or a DBREF1/DBREF2 pair). */
interface DbRef { pdbId: string; database: string; dbAcc: string; dbIdCode: string }

/**
 * Reads the SEQRES lines of a PDB file, one record per chain (in sorted chain-id order).
 * DBREF, DBREF1 and DBREF2 lines set the record id (`<pdb id>:<chain>`), description and `dbxrefs`; a chain
 * without a DBREF is named by its chain id alone. Unknown residue names become `X`.
 *
 * @throws {@link ValueError} for an empty file, or DBREF2 lines that do not match the preceding DBREF1.
 * @throws {@link IndexError} for a SEQRES or DBREF line too short to hold its chain id.
 */
export class PdbSeqresIterator extends SequenceIterator {
  get modes(): string { return "t"; }
  private cache: SeqRecord[] | null = null;

  /** @param source - File contents. */
  constructor(source: unknown) {
    super(source, null, "PDB");
  }

  protected nextRecord(): SeqRecord | null {
    if (this.cache === null) this.cache = this.readAll();
    return this.cache.shift() ?? null;
  }

  /** Scan the whole file, collecting residues and cross-references per chain. */
  private readAll(): SeqRecord[] {
    const chains = new Map<string, string[]>();
    const metadata = new Map<string, DbRef[]>();
    const addRef = (chn: string, ref: DbRef): void => { (metadata.get(chn) ?? metadata.set(chn, []).get(chn)!).push(ref); };
    // Python locals shared between DBREF, DBREF1 and DBREF2 branches; reading one before assignment is an UnboundLocalError.
    const v: { pdbId?: string; chnId?: string; database?: string; dbIdCode?: string; dbAcc?: string } = {};
    const need = <K extends keyof typeof v>(name: K, py: string): string => {
      if (v[name] === undefined) throw new UnboundLocalError(`cannot access local variable '${py}' where it is not associated with a value`);
      return v[name]!;
    };
    let recName: string | null = null;
    for (const line of this.stream!) {
      recName = pyStrip(line.slice(0, 6));
      if (recName === "SEQRES") {
        const chn = charAt(line, 11);
        v.chnId = chn;
        const residues = pySplit(line.slice(19)).map(res2aacode);
        (chains.get(chn) ?? chains.set(chn, []).get(chn)!).push(...residues);
      } else if (recName === "DBREF") {
        v.pdbId = line.slice(7, 11);
        v.chnId = charAt(line, 12);
        v.database = pyStrip(line.slice(26, 32));
        v.dbAcc = pyStrip(line.slice(33, 41));
        v.dbIdCode = pyStrip(line.slice(42, 54));
        addRef(v.chnId, { pdbId: v.pdbId, database: v.database, dbAcc: v.dbAcc, dbIdCode: v.dbIdCode });
      } else if (recName === "DBREF1") {
        v.pdbId = line.slice(7, 11);
        v.chnId = charAt(line, 12);
        v.database = pyStrip(line.slice(26, 32));
        v.dbIdCode = pyStrip(line.slice(47, 67));
      } else if (recName === "DBREF2") {
        if (need("pdbId", "pdb_id") !== line.slice(7, 11) || need("chnId", "chn_id") !== charAt(line, 12)) throw new ValueError("DBREF2 identifiers do not match");
        v.dbAcc = pyStrip(line.slice(18, 40));
        addRef(v.chnId!, { pdbId: v.pdbId!, database: need("database", "database"), dbAcc: v.dbAcc, dbIdCode: need("dbIdCode", "db_id_code") });
      }
    }
    if (recName === null) throw new ValueError("Empty file.");

    const records: SeqRecord[] = [];
    for (const chn of [...chains.keys()].sort()) {
      const record = new SeqRecord(new Seq(chains.get(chn)!.join("")));
      record.annotations = new Map<string, unknown>([["chain", chn], ["molecule_type", "protein"]]);
      const refs = metadata.get(chn);
      if (refs) {
        const m = refs[0]!;
        record.id = record.name = `${m.pdbId}:${chn}`;
        record.description = `${m.database}:${m.dbAcc} ${m.dbIdCode}`;
        for (const r of refs) record.dbxrefs.push(`${r.database}:${r.dbAcc}`, `${r.database}:${r.dbIdCode}`);
      } else record.id = chn;
      records.push(record);
    }
    return records;
  }
}
