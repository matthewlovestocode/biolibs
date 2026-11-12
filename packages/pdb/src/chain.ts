/** `Chain`, `Model` and `Structure`: the upper levels of the hierarchy (`Bio.PDB.Chain`, `Model`, `Structure`). */

import { pyInt } from "@biolibs/core";
import type { Atom, DisorderedAtom } from "./atom.js";
import { Entity, type Child } from "./entity.js";
import type { DisorderedResidue, Residue } from "./residue.js";
import type { EntityId } from "./util.js";

/** A chain of residues. */
export class Chain extends Entity<Residue | DisorderedResidue> implements Child {
  readonly level = "C";
  /** Internal coordinates (not ported); always null. */
  internalCoord: null = null;

  /** @param id - The chain id (usually one letter). */
  constructor(id: string) {
    super(id);
  }

  /** Python `>` (and friends): a blank chain id sorts oddly, exactly as in Biopython. */
  private order(other: Chain, op: "gt" | "ge" | "lt" | "le"): boolean {
    const blank = (c: Chain): boolean => c.id === " ";
    if (blank(this) && !blank(other)) return false;
    if (!blank(this) && blank(other)) return true;
    const a = Array.from(this.id as string, (c) => c.codePointAt(0)!);
    const b = Array.from(other.id as string, (c) => c.codePointAt(0)!);
    let c = 0;
    for (let k = 0; k < Math.min(a.length, b.length) && c === 0; k++) c = a[k]! - b[k]!;
    if (c === 0) c = a.length - b.length;
    return op === "gt" ? c > 0 : op === "ge" ? c >= 0 : op === "lt" ? c < 0 : c <= 0;
  }
  /** `self > other`. */
  gt(other: Chain): boolean { return this.order(other, "gt"); }
  /** `self >= other`. */
  ge(other: Chain): boolean { return this.order(other, "ge"); }
  /** `self < other`. */
  lt(other: Chain): boolean { return this.order(other, "lt"); }
  /** `self <= other`. */
  le(other: Chain): boolean { return this.order(other, "le"); }

  /** An integer (or numeric string) id means a plain residue: `[" ", id, " "]`. */
  private translateId(id: EntityId | null): EntityId {
    let value: unknown = id;
    if (typeof id === "string") {
      try { value = pyInt(id); } catch { /* not numeric: keep the string */ }
    } else if (typeof id === "number") value = Math.trunc(id);
    if (typeof value === "number") return [" ", value, " "];
    return id as EntityId;
  }

  override get(id: EntityId): Residue | DisorderedResidue { return super.get(this.translateId(id)); }
  override has(id: EntityId): boolean { return super.has(this.translateId(id)); }
  override delete(id: EntityId): void { super.delete(this.translateId(id)); }

  /** Python `repr`. */
  repr(): string { return `<Chain id=${this.getId()}>`; }

  /** The residues, with each disordered residue replaced by its versions. */
  getUnpackedList(): Residue[] {
    const out: Residue[] = [];
    for (const residue of this.getList()) {
      if (residue.isDisordered() === 2) out.push(...((residue as DisorderedResidue).disorderedGetList() as Residue[]));
      else out.push(residue as Residue);
    }
    return out;
  }

  /** Iterate over the residues. */
  getResidues(): IterableIterator<Residue | DisorderedResidue> { return this.childList[Symbol.iterator](); }

  /** Iterate over every atom. */
  *getAtoms(): IterableIterator<Atom | DisorderedAtom> {
    for (const r of this.getResidues()) yield* (r as unknown as Iterable<Atom | DisorderedAtom>);
  }
}

/** A model: a set of chains (one conformation in an NMR structure). */
export class Model extends Entity<Chain> implements Child {
  readonly level = "M";
  /** The serial number from the file (defaults to the id). */
  serialNum: number;

  /** @param id - Model index. @param serialNum - Serial number from the file. */
  constructor(id: number, serialNum: number | null = null) {
    super(id);
    this.serialNum = serialNum === null ? id : serialNum;
  }

  /** Python `repr`. */
  repr(): string { return `<Model id=${this.getId()}>`; }
  /** Iterate over the chains. */
  getChains(): IterableIterator<Chain> { return this.childList[Symbol.iterator](); }
  /** Iterate over the residues of all chains. */
  *getResidues(): IterableIterator<Residue | DisorderedResidue> { for (const c of this.getChains()) yield* c; }
  /** Iterate over every atom. */
  *getAtoms(): IterableIterator<Atom | DisorderedAtom> { for (const r of this.getResidues()) yield* (r as unknown as Iterable<Atom | DisorderedAtom>); }
}

/** A structure: a set of models. */
export class Structure extends Entity<Model> {
  readonly level = "S";
  /** The parsed header, when the parser provides one. */
  header: Record<string, unknown> | null = null;

  /** @param id - Structure id. */
  constructor(id: string) {
    super(id);
  }

  /** Python `repr`. */
  repr(): string { return `<Structure id=${this.getId()}>`; }
  /** Iterate over the models. */
  getModels(): IterableIterator<Model> { return this.childList[Symbol.iterator](); }
  /** Iterate over the chains of all models. */
  *getChains(): IterableIterator<Chain> { for (const m of this.getModels()) yield* m; }
  /** Iterate over the residues of all chains. */
  *getResidues(): IterableIterator<Residue | DisorderedResidue> { for (const c of this.getChains()) yield* c; }
  /** Iterate over every atom. */
  *getAtoms(): IterableIterator<Atom | DisorderedAtom> { for (const r of this.getResidues()) yield* (r as unknown as Iterable<Atom | DisorderedAtom>); }
}
