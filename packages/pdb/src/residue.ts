/** `Residue` and `DisorderedResidue` (Biopython's `Bio.PDB.Residue`). */

import { DisorderedEntityWrapper, Entity, type Child } from "./entity.js";
import { PDBConstructionException } from "./exceptions.js";
import type { Atom, DisorderedAtom } from "./atom.js";
import type { EntityId } from "./util.js";

/** The id of a residue: `[hetero flag, sequence number, insertion code]`. */
export type ResidueId = [string, number, string];

/** A residue: a group of atoms. */
export class Residue extends Entity<Atom | DisorderedAtom> implements Child {
  readonly level = "R";
  /** 1 if some atoms have alternative locations. */
  disordered = 0;
  /** The residue name, e.g. `"ALA"`. */
  resname: string;
  /** The segment identifier. */
  segid: string;
  /** Internal coordinates (not ported); always null. */
  internalCoord: null = null;

  /** @param id - `[hetero flag, sequence number, insertion code]`. @param resname - Residue name. @param segid - Segment id. */
  constructor(id: ResidueId, resname: string, segid: string) {
    super(id);
    this.resname = resname;
    this.segid = segid;
  }

  /** Python `repr`. */
  repr(): string {
    const [het, resseq, icode] = this.getId() as ResidueId;
    return `<Residue ${this.getResname()} het=${het} resseq=${resseq} icode=${icode}>`;
  }

  /** Same residue name, id and (recursively) atoms. */
  strictlyEquals(other: Residue, compareCoordinates = false): boolean {
    if (!(other instanceof Residue)) return false;
    if (this.resname !== other.resname || JSON.stringify(this.id) !== JSON.stringify(other.id)) return false;
    if (this.childList.length !== other.childList.length) return false;
    return this.childList.every((c, k) => (c as Atom).strictlyEquals(other.childList[k] as Atom, compareCoordinates));
  }

  /**
   * Add an atom.
   *
   * @throws {@link PDBConstructionException} when an atom with that id exists.
   */
  override add(atom: Atom | DisorderedAtom): void {
    const atomId = atom.getId();
    if (this.has(atomId)) throw new PDBConstructionException(`Atom ${atomId} defined twice in residue ${this.repr()}`);
    super.add(atom);
  }

  /** Mark the residue as holding atoms with alternative locations. */
  flagDisordered(): void { this.disordered = 1; }
  /** 1 when atoms have alternative locations (0 or 1; a `DisorderedResidue` wrapper reports 2). */
  isDisordered(): number { return this.disordered; }
  /** The residue name. */
  getResname(): string { return this.resname; }
  /** The segment id. */
  getSegid(): string { return this.segid; }

  /** The atoms, with each disordered atom replaced by its alternatives. */
  getUnpackedList(): Atom[] {
    const out: Atom[] = [];
    for (const atom of this.getList()) {
      if (atom.isDisordered()) out.push(...(atom as DisorderedAtom).disorderedGetList());
      else out.push(atom as Atom);
    }
    return out;
  }

  /** Iterate over the atoms. */
  getAtoms(): IterableIterator<Atom | DisorderedAtom> {
    return this.childList[Symbol.iterator]();
  }
}

/** Alternative versions of a residue at one position (a point mutation); one is selected. */
export class DisorderedResidue extends DisorderedEntityWrapper {
  /** @param id - The shared residue id. */
  constructor(id: ResidueId) {
    super(id);
  }

  /** Python `repr`. */
  repr(): string {
    if (this.childDict.size === 0) return "<Empty DisorderedResidue>";
    const [het, resseq, icode] = this.getId() as ResidueId;
    return `<DisorderedResidue ${(this as unknown as Residue).getResname()} het=${het} resseq=${Math.trunc(resseq)} icode=${icode}>`;
  }

  /**
   * Add an atom to the selected residue.
   *
   * @throws {@link PDBConstructionException} when the atom is not a disordered one (blank altlocs in a duplicate residue).
   */
  add(atom: Atom | DisorderedAtom): void {
    const residue = this.disorderedGet() as Residue;
    if (atom.isDisordered() !== 2) {
      const [het, resseq, icode] = residue.getId() as ResidueId;
      residue.add(atom);
      throw new PDBConstructionException(`Blank altlocs in duplicate residue ${residue.getResname()} (${het}, ${Math.trunc(resseq)}, ${icode})`);
    }
    residue.add(atom);
  }

  /** Sort the atoms of every version (not needed here: children keep insertion order). */
  sort(): void {
    /* Residue.sort does not exist in Biopython 1.88 either, so this would raise there for a non-empty wrapper. */
    for (const residue of this.disorderedGetList()) (residue as unknown as { sort(): void }).sort();
  }

  /** Add a version of the residue (keyed by residue name) and select it. */
  disorderedAdd(residue: Residue): void {
    const resname = residue.getResname();
    const chain = this.getParent();
    residue.setParent(chain);
    if (this.disorderedHasId(resname)) throw Object.assign(new Error(""), { name: "AssertionError" });
    this.childDict.set(`s${resname}`, residue);
    this.disorderedSelect(resname);
  }

  /** Remove a version by residue name; another version becomes the selected one. */
  disorderedRemove(resname: string): void {
    const residue = this.childDict.get(`s${resname}`)!;
    const isSelected = this.selectedChild === residue;
    this.childDict.delete(`s${resname}`);
    residue.detachParent();
    if (isSelected && this.childDict.size > 0) {
      const next = this.childDict.keys().next().value as string;
      this.disorderedSelect(next.slice(1));
    } else if (this.childDict.size === 0) this.selectedChild = null;
  }
}

/** Re-exported for convenience: the id type of residues. */
export type { EntityId };
