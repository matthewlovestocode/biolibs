/** `StructureBuilder`: builds a `Structure` from calls made by a parser (Biopython's `Bio.PDB.StructureBuilder`). */

import { warn } from "@biolibs/core";
import { Atom, DisorderedAtom } from "./atom.js";
import { Chain, Model, Structure } from "./chain.js";
import { PDBConstructionException, PDB_CONSTRUCTION_WARNING } from "./exceptions.js";
import { DisorderedResidue, Residue, type ResidueId } from "./residue.js";

/** Whether every atom of the residue has an altloc (none is blank). */
function isCompletelyDisordered(residue: Residue): boolean {
  return residue.getUnpackedList().every((atom) => atom.getAltloc() !== " ");
}

/** Python `%i`/`%s` formatting of a field for warnings. */
const q = (s: string): string => `'${s}'`;

/** The object a parser calls to create structure, model, chain, residue and atom objects in order. */
export class StructureBuilder {
  /** The most recently created atom. */
  atom: Atom | null = null;
  /** The current chain. */
  chain: Chain | null = null;
  /** The header dictionary set by the parser. */
  header: Record<string, unknown> = {};
  /** Line number reported in warnings. */
  lineCounter = 0;
  /** The current model. */
  model: Model | null = null;
  /** The current residue (or disordered residue). */
  residue: Residue | DisorderedResidue | null = null;
  /** The current segment id. */
  segid: string | null = null;
  /** The structure being built. */
  structure: Structure | null = null;

  /** Set the header dictionary. */
  setHeader(header: Record<string, unknown>): void { this.header = header; }
  /** Set the line number used in warnings. */
  setLineCounter(lineCounter: number): void { this.lineCounter = lineCounter; }
  /** Start a new structure. */
  initStructure(structureId: string): void { this.structure = new Structure(structureId); }

  /** Start a new model and add it to the structure. */
  initModel(modelId: number, serialNum: number | null = null): void {
    this.model = new Model(modelId, serialNum);
    this.structure!.add(this.model);
  }

  /** Start a chain, or continue an existing chain of that id (with a warning). */
  initChain(chainId: string): void {
    if (this.model!.has(chainId)) {
      this.chain = this.model!.get(chainId);
      warn(`WARNING: Chain ${chainId} is discontinuous at line ${this.lineCounter}.`, PDB_CONSTRUCTION_WARNING);
    } else {
      this.chain = new Chain(chainId);
      this.model!.add(this.chain);
    }
  }

  /** Set the segment id for new residues. */
  initSeg(segid: string): void { this.segid = segid; }

  /**
   * Start a residue, handling duplicates: a redefined residue id becomes a `DisorderedResidue` (a point mutation).
   *
   * @throws {@link PDBConstructionException} for a duplicate residue whose atoms have blank altlocs.
   */
  initResidue(resname: string, field: string, resseq: number, icode: string): void {
    if (field !== " " && field === "H") field = `H_${resname}`;
    const resId: ResidueId = [field, resseq, icode];
    const chain = this.chain!;
    if (field === " " && chain.has(resId)) {
      warn(`WARNING: Residue (${q(field)}, ${resseq}, ${q(icode)}) redefined at line ${this.lineCounter}.`, PDB_CONSTRUCTION_WARNING);
      const duplicate = chain.get(resId);
      if (duplicate.isDisordered() === 2) {
        const wrapper = duplicate as DisorderedResidue;
        if (wrapper.disorderedHasId(resname)) {
          this.residue = wrapper;
          wrapper.disorderedSelect(resname);
        } else {
          wrapper.disorderedAdd(new Residue(resId, resname, this.segid!));
          this.residue = wrapper;
          return;
        }
      } else {
        const plain = duplicate as Residue;
        if (resname === plain.resname) {
          warn(`WARNING: Residue (${q(field)}, ${resseq}, ${q(icode)},${q(resname)}) already defined with the same name at line  ${this.lineCounter}.`, PDB_CONSTRUCTION_WARNING);
          this.residue = plain;
          return;
        }
        if (!isCompletelyDisordered(plain)) {
          this.residue = null;
          throw new PDBConstructionException(`Blank altlocs in duplicate residue ${resname} (${q(field)}, ${resseq}, ${q(icode)}) of chain '${String(chain.id)}'`);
        }
        chain.detachChild(resId);
        const added = new Residue(resId, resname, this.segid!);
        const disordered = new DisorderedResidue(resId);
        chain.add(disordered);
        disordered.disorderedAdd(plain);
        disordered.disorderedAdd(added);
        this.residue = disordered;
        return;
      }
    }
    this.residue = new Residue(resId, resname, this.segid!);
    chain.add(this.residue);
  }

  /**
   * Create an atom in the current residue, combining atoms with alternative locations into a `DisorderedAtom`.
   *
   * @param isPqr - Create the atom with charge and radius (PQR) instead of B-factor and occupancy.
   */
  initAtom(name: string, coord: ArrayLike<number>, bFactor: number | null, occupancy: number | null, altloc: string, fullname: string,
    serialNumber: number | null = null, element: string | null = null, pqrCharge: number | null = null, radius: number | null = null, isPqr = false): void {
    const residue = this.residue as Residue | null;
    if (residue === null) return;
    if (residue.has(name)) {
      const duplicate = residue.get(name) as Atom;
      const duplicateFullname = duplicate.getFullname();
      if (duplicateFullname !== fullname) {
        name = fullname;
        warn(`Atom names '${duplicateFullname}' and '${fullname}' differ only in spaces at line ${this.lineCounter}.`, PDB_CONSTRUCTION_WARNING);
      }
    }
    this.atom = isPqr
      ? new Atom(name, coord, null, null, altloc, fullname, serialNumber, element, pqrCharge, radius)
      : new Atom(name, coord, bFactor, occupancy, altloc, fullname, serialNumber, element);
    if (altloc !== " ") {
      if (residue.has(name)) {
        const duplicate = residue.get(name) as Atom | DisorderedAtom;
        if (duplicate.isDisordered() === 2) (duplicate as DisorderedAtom).disorderedAdd(this.atom);
        else {
          residue.detachChild(name);
          const disordered = new DisorderedAtom(name);
          residue.add(disordered);
          disordered.disorderedAdd(this.atom);
          disordered.disorderedAdd(duplicate as Atom);
          residue.flagDisordered();
          warn(`WARNING: disordered atom found with blank altloc before line ${this.lineCounter}.\n`, PDB_CONSTRUCTION_WARNING);
        }
      } else {
        const disordered = new DisorderedAtom(name);
        residue.add(disordered);
        disordered.disorderedAdd(this.atom);
        residue.flagDisordered();
      }
    } else residue.add(this.atom);
  }

  /** Set the anisotropic factors of the last atom. */
  setAnisou(a: Float32Array): void { this.atom!.setAnisou(a); }
  /** Set the anisotropic standard deviations of the last atom. */
  setSiguij(a: Float32Array): void { this.atom!.setSiguij(a); }
  /** Set the position standard deviations of the last atom. */
  setSigatm(a: Float32Array): void { this.atom!.setSigatm(a); }

  /** The finished structure, with the header attached. */
  getStructure(): Structure {
    this.structure!.header = this.header;
    return this.structure!;
  }

  /** Space group and cell (not used by this builder). */
  setSymmetry(_spacegroup: unknown, _cell: unknown): void {
    /* nothing to do, as in Biopython */
  }
}
