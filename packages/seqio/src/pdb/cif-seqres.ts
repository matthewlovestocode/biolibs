/** Reader for the `cif-seqres` format: chain sequences from the `_pdbx_poly_seq_scheme` category of an mmCIF file. */

import { KeyError } from "@biolibs/core";
import { MMCIF2Dict } from "@biolibs/pdb";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import { SequenceIterator } from "../interfaces.js";
import { readAll } from "./atom.js";
import { res2aacode } from "./seqres.js";

/** A cross-reference collected from `_struct_ref` / `_struct_ref_seq`. */
interface Ref { pdbId: string; database: string; dbIdCode: string; dbAcc: string }

/**
 * Reads the polymer sequences of an mmCIF file, one record per chain (in sorted chain-id order). Cross-references
 * from `_struct_ref_seq` and `_struct_ref` set the id (`<pdb id>:<chain>`), description and `dbxrefs`; a chain
 * without one is named by its chain id alone. Unknown residue names become `X`.
 *
 * @throws {@link KeyError} when a `_struct_ref_seq` entry names a `_struct_ref` id that does not exist.
 */
export class CifSeqresIterator extends SequenceIterator {
  get modes(): string { return "t"; }
  private readonly records: Iterator<SeqRecord>;

  /** @param source - File contents. Parsed completely on construction. */
  constructor(source: unknown) {
    super(source, null, "Sequence");
    const d = new MMCIF2Dict(readAll(this.stream!));
    // A missing item is an empty list; a lone value (Biopython also wraps non-lists) becomes a one-item list.
    const col = (field: string): string[] => {
      const v = d.get(field);
      return v === undefined ? [] : Array.isArray(v) ? v : [v];
    };
    const zip = (...cols: string[][]): string[][] => Array.from({ length: Math.min(...cols.map((c) => c.length)) }, (_, i) => cols.map((c) => c[i]!));

    const chains = new Map<string, string[]>();
    for (const [asymId, monId] of zip(col("_pdbx_poly_seq_scheme.asym_id"), col("_pdbx_poly_seq_scheme.mon_id"))) {
      (chains.get(asymId!) ?? chains.set(asymId!, []).get(asymId!)!).push(res2aacode(monId!));
    }
    // _struct_ref records by id.
    const structRefs = new Map<string, Omit<Ref, "pdbId">>();
    for (const [refId, dbName, dbCode, dbAcc] of zip(col("_struct_ref.id"), col("_struct_ref.db_name"), col("_struct_ref.db_code"), col("_struct_ref.pdbx_db_accession"))) {
      structRefs.set(refId!, { database: dbName!, dbIdCode: dbCode!, dbAcc: dbAcc! });
    }
    // Each _struct_ref_seq row adds its _struct_ref to the metadata of its chain.
    const metadata = new Map<string, Ref[]>();
    for (const [refId, pdbId, chainId] of zip(col("_struct_ref_seq.ref_id"), col("_struct_ref_seq.pdbx_PDB_id_code"), col("_struct_ref_seq.pdbx_strand_id"))) {
      const ref = structRefs.get(refId!);
      if (ref === undefined) throw new KeyError(refId!);
      (metadata.get(chainId!) ?? metadata.set(chainId!, []).get(chainId!)!).push({ pdbId: pdbId!, ...ref });
    }

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
    this.records = records[Symbol.iterator]();
  }

  protected nextRecord(): SeqRecord | null {
    const n = this.records.next();
    return n.done ? null : n.value;
  }
}
