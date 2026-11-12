/**
 * @packageDocumentation
 * PDB and mmCIF sequence formats, a port of Biopython's `SeqIO.PdbIO`.
 *
 * - `pdb-data.ts`: residue-name tables (generated from `Bio.Data.PDBData`)
 * - `seqres.ts`: `PdbSeqresIterator`, the `pdb-seqres` format
 * - `atom.ts`: `atomIterator`, `PdbAtomIterator` (`pdb-atom`), `CifAtomIterator` (`cif-atom`)
 * - `cif-seqres.ts`: `CifSeqresIterator`, the `cif-seqres` format
 */

import { registerIterator } from "../registry.js";
import { PdbSeqresIterator } from "./seqres.js";
import { CifAtomIterator, PdbAtomIterator } from "./atom.js";
import { CifSeqresIterator } from "./cif-seqres.js";

registerIterator("pdb-seqres", PdbSeqresIterator);
registerIterator("pdb-atom", PdbAtomIterator);
registerIterator("cif-atom", CifAtomIterator);
registerIterator("cif-seqres", CifSeqresIterator);

export * from "./seqres.js";
export * from "./atom.js";
export * from "./cif-seqres.js";
