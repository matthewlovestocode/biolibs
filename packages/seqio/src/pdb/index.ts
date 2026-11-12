/**
 * @packageDocumentation
 * PDB sequence formats, a port of the SEQRES part of Biopython's `SeqIO.PdbIO`.
 *
 * - `pdb-data.ts`: residue-name tables (generated from `Bio.Data.PDBData`)
 * - `seqres.ts`: `PdbSeqresIterator`, the `pdb-seqres` format
 */

import { registerIterator } from "../registry.js";
import { PdbSeqresIterator } from "./seqres.js";

registerIterator("pdb-seqres", PdbSeqresIterator);

export * from "./seqres.js";
