/** `Polypeptide`, `PPBuilder` and `CaPPBuilder`: finding connected runs of amino acids (Biopython's `Bio.PDB.Polypeptide`). */

import { warn } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import { PDBException } from "./exceptions.js";
import { isAa } from "./aa-codes.js";
import { proteinLetters3to1Extended } from "./pdb-data.js";
import { calcAngle, calcDihedral } from "./rotations.js";
import type { Atom } from "./atom.js";
import type { Chain } from "./chain.js";
import type { Residue } from "./residue.js";

/** A list of residues that are connected to each other. */
export class Polypeptide extends Array<Residue> {
  /**
   * The C-alpha atom of every residue.
   *
   * @throws KeyError when a residue has no `CA`.
   */
  getCaList(): Atom[] {
    return Array.from(this, (res) => res.get("CA") as Atom);
  }

  /**
   * The (phi, psi) dihedral angles per residue, `null` where an atom is missing or there is no neighbour. The
   * angles are also stored in each residue's `xtra` under `PHI` and `PSI`.
   */
  getPhiPsiList(): [number | null, number | null][] {
    const ppl: [number | null, number | null][] = [];
    const lng = this.length;
    for (let i = 0; i < lng; i++) {
      const res = this[i]!;
      let n, ca, c;
      try {
        n = (res.get("N") as Atom).getVector();
        ca = (res.get("CA") as Atom).getVector();
        c = (res.get("C") as Atom).getVector();
      } catch {
        // Some atoms are missing: phi and psi cannot be calculated for this residue.
        ppl.push([null, null]);
        res.xtra["PHI"] = null;
        res.xtra["PSI"] = null;
        continue;
      }
      let phi: number | null = null;
      if (i > 0) {
        try { phi = calcDihedral((this[i - 1]!.get("C") as Atom).getVector(), n, ca, c); } catch { phi = null; }
      }
      let psi: number | null = null;
      if (i < lng - 1) {
        try { psi = calcDihedral(n, ca, c, (this[i + 1]!.get("N") as Atom).getVector()); } catch { psi = null; }
      }
      ppl.push([phi, psi]);
      res.xtra["PHI"] = phi;
      res.xtra["PSI"] = psi;
    }
    return ppl;
  }

  /** The tau torsion of every 4 consecutive C-alpha atoms (stored in the third residue's `xtra["TAU"]`). */
  getTauList(): number[] {
    const ca = this.getCaList();
    const out: number[] = [];
    for (let i = 0; i < ca.length - 3; i++) {
      const [v1, v2, v3, v4] = [ca[i]!, ca[i + 1]!, ca[i + 2]!, ca[i + 3]!].map((a) => a.getVector()) as [never, never, never, never];
      const tau = calcDihedral(v1, v2, v3, v4);
      out.push(tau);
      (ca[i + 2]!.getParent() as Residue).xtra["TAU"] = tau;
    }
    return out;
  }

  /** The theta angle of every 3 consecutive C-alpha atoms (stored in the middle residue's `xtra["THETA"]`). */
  getThetaList(): number[] {
    const out: number[] = [];
    const ca = this.getCaList();
    for (let i = 0; i < ca.length - 2; i++) {
      const [v1, v2, v3] = [ca[i]!, ca[i + 1]!, ca[i + 2]!].map((a) => a.getVector()) as [never, never, never];
      const theta = calcAngle(v1, v2, v3);
      out.push(theta);
      (ca[i + 1]!.getParent() as Residue).xtra["THETA"] = theta;
    }
    return out;
  }

  /** The amino-acid sequence (`X` for unknown residue names). */
  getSequence(): Seq {
    return new Seq(Array.from(this, (res) => (Object.hasOwn(proteinLetters3to1Extended, res.getResname()) ? proteinLetters3to1Extended[res.getResname()]! : "X")).join(""));
  }

  /** @returns `<Polypeptide start=START end=END>` with the sequence numbers of the outer residues. */
  repr(): string {
    if (this.length === 0) throw Object.assign(new Error("list index out of range"), { name: "IndexError" });
    return `<Polypeptide start=${(this[0]!.getId() as unknown[])[1]} end=${(this[this.length - 1]!.getId() as unknown[])[1]}>`;
  }
}

/** Base class of the builders: walks the chains and joins accepted, connected residues. Subclasses define connectivity. */
abstract class PeptideBuilder {
  /** @param radius - The distance below which two residues count as connected. */
  constructor(public radius: number) {}

  /** Whether two consecutive residues are connected (defined by the subclass). */
  protected abstract isConnected(prev: Residue, next: Residue): boolean;

  /** Whether a residue is wanted: an amino acid, or (unless `standardAaOnly`) anything with a C-alpha, with a warning. */
  private accept(residue: Residue, standardAaOnly: boolean): boolean {
    if (isAa(residue, Boolean(standardAaOnly))) return true;
    if (!standardAaOnly && residue.childDict.has("sCA")) {
      warn(`Assuming residue ${residue.getResname()} is an unknown modified amino acid`, "UserWarning");
      return true;
    }
    return false;
  }

  /**
   * Find the polypeptides in a structure (its first model), a model or a chain.
   *
   * @param entity - Where to search.
   * @param aaOnly - If truthy, only the 20 standard amino acids count.
   * @returns The polypeptides, in order.
   * @throws PDBException for any other entity level.
   */
  buildPeptides(entity: { getLevel(): string; get(id: number): any; getList(): any[] }, aaOnly: boolean | number = 1): Polypeptide[] {
    const level = entity.getLevel();
    let chains: Chain[];
    if (level === "S") chains = entity.get(0).getList();
    else if (level === "M") chains = entity.getList();
    else if (level === "C") chains = [entity as unknown as Chain];
    else throw new PDBException("Entity should be Structure, Model or Chain.");
    const out: Polypeptide[] = [];
    for (const chain of chains) {
      const it = (chain.childList as Residue[])[Symbol.iterator]();
      let prev: Residue;
      let first = it.next();
      if (first.done) continue;
      prev = first.value;
      // Skip leading residues until the first wanted one.
      while (!this.accept(prev, Boolean(aaOnly))) {
        first = it.next();
        if (first.done) { prev = undefined as never; break; }
        prev = first.value;
      }
      if (prev === undefined) continue;
      let pp: Polypeptide | null = null;
      for (let step = it.next(); !step.done; step = it.next()) {
        const next = step.value;
        if (this.accept(prev, Boolean(aaOnly)) && this.accept(next, Boolean(aaOnly)) && this.isConnected(prev, next)) {
          if (pp === null) {
            pp = new Polypeptide();
            pp.push(prev);
            out.push(pp);
          }
          pp.push(next);
        } else pp = null;
        prev = next;
      }
    }
    return out;
  }
}

/** Joins residues whose C-alpha atoms are closer than `radius` (default 4.3). */
export class CaPPBuilder extends PeptideBuilder {
  /** @param radius - Maximum CA-CA distance. */
  constructor(radius = 4.3) { super(radius); }

  protected isConnected(prev: Residue, next: Residue): boolean {
    for (const r of [prev, next]) if (!r.has("CA")) return false;
    const n = next.get("CA") as any, p = prev.get("CA") as any;
    const nlist: Atom[] = n.isDisordered() ? n.disorderedGetList() : [n];
    const plist: Atom[] = p.isDisordered() ? p.disorderedGetList() : [p];
    for (const nn of nlist) for (const pp of plist) if (nn.minus(pp) < this.radius) return true;
    return false;
  }
}

/** Joins residues whose C and N atoms are closer than `radius` (default 1.8), honouring alternative locations. */
export class PPBuilder extends PeptideBuilder {
  /** @param radius - Maximum C-N distance. */
  constructor(radius = 1.8) { super(radius); }

  protected isConnected(prev: Residue, next: Residue): boolean {
    if (!prev.has("C")) return false;
    if (!next.has("N")) return false;
    const c = prev.get("C") as any, n = next.get("N") as any;
    // Test all disordered atom positions.
    const clist: Atom[] = c.isDisordered() ? c.disorderedGetList() : [c];
    const nlist: Atom[] = n.isDisordered() ? n.disorderedGetList() : [n];
    for (const nn of nlist) {
      for (const cc of clist) {
        // A peptide bond needs the same altloc on both atoms, or one of them blank.
        const nAlt = nn.getAltloc(), cAlt = cc.getAltloc();
        if (nAlt === cAlt || nAlt === " " || cAlt === " ") {
          if (this.testDist(nn, cc)) {
            // Select the alternatives that are actually bonded.
            if (c.isDisordered()) c.disorderedSelect(cAlt);
            if (n.isDisordered()) n.disorderedSelect(nAlt);
            return true;
          }
        }
      }
    }
    return false;
  }

  private testDist(c: Atom, n: Atom): number { return c.minus(n) < this.radius ? 1 : 0; }
}
