/** `Select` and `StructureIO`: the shared base of the structure writers (Biopython's `Bio.PDB.PDBIO`, first half). */

import { StructureBuilder } from "./structure-builder.js";
import type { Structure } from "./chain.js";

/** Anything `StructureIO.setStructure` accepts: a structure or any entity below it. */
export type StructureLike = { readonly level: string; parent: unknown; copy(): unknown };

/**
 * Select everything for output; subclass and override the `accept*` methods to write a subset.
 * Each method returns a truthy value to keep the entity (Python code returns 1 or 0).
 */
export class Select {
  /** @returns `<Select all>`. */
  repr(): string { return "<Select all>"; }
  /** @param _model - A model. @returns Truthy to write it. */
  acceptModel(_model: any): unknown { return 1; }
  /** @param _chain - A chain. @returns Truthy to write it. */
  acceptChain(_chain: any): unknown { return 1; }
  /** @param _residue - A residue. @returns Truthy to write it. */
  acceptResidue(_residue: any): unknown { return 1; }
  /** @param _atom - An atom. @returns Truthy to write it. */
  acceptAtom(_atom: any): unknown { return 1; }
}

/** The selection used when none is given. */
export const defaultSelect = new Select();

/** Base class of the structure writers: holds the structure being written. */
export class StructureIO {
  /** The structure to write, once {@link StructureIO.setStructure} has run. */
  structure?: Structure;

  /**
   * Choose what to write. A model, chain, residue or atom is copied into a new
   * structure whose missing upper levels are built (chain `A`, model 0, and a dummy
   * residue `DUM` for a bare atom); ids of the original parents are kept.
   *
   * @param pdbObject - A structure, model, chain, residue or atom.
   */
  setStructure(pdbObject: StructureLike): void {
    if (pdbObject.level === "S") {
      this.structure = pdbObject as unknown as Structure;
      return;
    }
    const sb = new StructureBuilder();
    sb.initStructure("pdb");
    sb.initSeg(" ");
    const structure = sb.structure as any;
    if (pdbObject.level === "M") {
      structure.add(pdbObject.copy());
    } else {
      sb.initModel(0);
      if (pdbObject.level === "C") {
        structure.get(0).add(pdbObject.copy());
      } else {
        let chainId = "A";
        sb.initChain(chainId);
        if (pdbObject.level === "R") {
          // A residue taken from a larger structure keeps its chain id.
          const parent = pdbObject.parent as { id: string } | null;
          if (parent !== null) {
            structure.get(0).get(chainId).id = parent.id;
            chainId = parent.id;
          }
          structure.get(0).get(chainId).add(pdbObject.copy());
        } else {
          sb.initResidue("DUM", " ", 1, " ");
          structure.get(0).get(chainId).childList[0].add(pdbObject.copy());
          // Python: try parent.parent.id except AttributeError: pass
          const chain = (pdbObject.parent as { parent: { id: string } | null } | null)?.parent;
          if (chain !== null && chain !== undefined) structure.get(0).get(chainId).id = chain.id;
        }
      }
    }
    this.structure = structure;
  }
}
