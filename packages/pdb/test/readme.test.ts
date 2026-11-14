/**
 * Runs every code block in this package's README, so the published examples cannot drift.
 *
 * The README is the first thing anyone sees on npm, and an example that no longer works there is worse
 * than no example. Each `it` mirrors one section; the assertions are the outputs the README prints as
 * comments, so changing one without changing the other fails here.
 *
 * `fixtures/mini.pdb` is the three-residue structure every block parses: a GLY-ALA-SER backbone with
 * ascending B-factors, small enough that every number in the README can be read at a glance.
 */
import { readFileSync } from "node:fs";
import {
  Atom, MMCIF2Dict, MMCIFIO, MMCIFParser, NeighborSearch, PDBIO, PDBParser, PPBuilder, CaPPBuilder,
  Select, ShrakeRupley, Superimposer, Vector, calcAngle, calcDihedral, parsePdbHeader, rotaxis2m,
  unfoldEntities,
} from "@biolibs/pdb";
import type { Structure } from "@biolibs/pdb";
import { describe, expect, it } from "vitest";

const PDB_TEXT = readFileSync(new URL("./fixtures/mini.pdb", import.meta.url), "utf8");

/** @returns The fixture parsed afresh, since several examples mutate what they are given. */
const parsed = (id = "1abc"): Structure =>
  new PDBParser({ quiet: true }).getStructure(id, PDB_TEXT);

describe("README: parsing", () => {
  it("builds the hierarchy", () => {
    const structure = parsed();
    expect([structure.id, structure.level]).toEqual(["1abc", "S"]);
    expect([...structure].length).toBe(1);
    expect([...structure.getResidues()].length).toBe(3);
    expect([...structure.getAtoms()].length).toBe(15);
  });

  it("walks down it", () => {
    const model = [...parsed()][0]!;
    const chain = [...model][0]!;
    const residue = [...chain][1]!;
    expect([model.id, chain.id]).toEqual([0, "A"]);
    expect([...chain].map((r) => r.resname)).toEqual(["GLY", "ALA", "SER"]);
    expect(residue.resname).toBe("ALA");
    expect(residue.id).toEqual([" ", 2, " "]);
    expect([...residue].map((a) => a.name)).toEqual(["N", "CA", "C", "O", "CB"]);
  });

  it("carries what the ATOM record held", () => {
    const residue = [...[...[...parsed()][0]!][0]!][1]!;
    const atom = residue.get("CA")!;
    expect([atom.name, atom.fullname, atom.element]).toEqual(["CA", " CA ", "C"]);
    expect([atom.bfactor, atom.occupancy, atom.serialNumber]).toEqual([25, 1, 6]);
    // Float32, as Biopython's NumPy arrays are.
    expect([...atom.coord]).toEqual([3.700000047683716, 1.2999999523162842, 0]);
    expect(atom.getParent()!.resname).toBe("ALA");
    expect(atom.minus(residue.get("N")!)).toBe(1.4317820072174072);
  });

  it("reprs each level as Biopython does", () => {
    const structure = parsed();
    const chain = [...[...structure][0]!][0]!;
    const residue = [...chain][1]!;
    expect(residue.get("CA")!.repr()).toBe("<Atom CA>");
    expect(residue.repr()).toBe("<Residue ALA het=  resseq=2 icode= >");
    expect(chain.repr()).toBe("<Chain id=A>");
    expect(structure.repr()).toBe("<Structure id=1abc>");
  });

  it("gives the header Biopython's keys", () => {
    const parser = new PDBParser({ quiet: true });
    parser.getStructure("1abc", PDB_TEXT);
    const header = parser.getHeader() as Record<string, unknown>;
    expect(header.name).toBe("a small test structure");
    expect(header.head).toBe("hydrolase");
    expect(header.idcode).toBe("1ABC");
    expect(header.deposition_date).toBe("2000-01-01");
    expect((parsePdbHeader(PDB_TEXT) as Record<string, unknown>).head).toBe("hydrolase");
  });
});

describe("README: mmCIF", () => {
  it("round-trips through the writer, the parser and the dictionary", () => {
    const io = new MMCIFIO();
    io.setStructure(parsed());
    const cifText = io.save();

    const structure = new MMCIFParser({ quiet: true }).getStructure("1abc", cifText);
    expect([...structure.getAtoms()].length).toBe(15);
    expect([...structure.getResidues()].map((r) => r.resname)).toEqual(["GLY", "ALA", "SER"]);

    const dict = new MMCIF2Dict(cifText);
    expect(dict.get("_atom_site.Cartn_x")!.length).toBe(15);
  });
});

describe("README: writing", () => {
  it("returns the text rather than writing a file", () => {
    const io = new PDBIO();
    io.setStructure(parsed());
    const text = io.save();
    expect(text.split("\n")[0]).toBe(
      "ATOM      1  N   GLY A   1      -1.204   1.296   0.000  1.00 20.00           N  ");
    expect(text.split("\n").filter((l) => l.startsWith("ATOM")).length).toBe(15);
  });

  it("writes a selection", () => {
    class CarbonAlphaOnly extends Select {
      override acceptAtom(atom: Atom): unknown { return atom.name === "CA"; }
    }
    const io = new PDBIO();
    io.setStructure(parsed());
    expect(io.save(new CarbonAlphaOnly()).split("\n").filter((l) => l.startsWith("ATOM")).length)
      .toBe(3);
  });
});

describe("README: polypeptides", () => {
  it("builds them two ways", () => {
    const structure = parsed();
    const peptides = new PPBuilder().buildPeptides(structure);
    expect(peptides.length).toBe(1);
    expect(peptides[0]!.getSequence().toString()).toBe("GAS");
    expect(peptides[0]!.repr()).toBe("<Polypeptide start=1 end=3>");
    expect(peptides[0]!.getCaList().length).toBe(3);
    expect(new CaPPBuilder().buildPeptides(structure)[0]!.getSequence().toString()).toBe("GAS");
  });

  it("measures the backbone torsions", () => {
    const peptides = new PPBuilder().buildPeptides(parsed());
    expect(peptides[0]!.getPhiPsiList().map(([phi, psi]) =>
      [phi === null ? null : Number(phi.toFixed(4)), psi === null ? null : Number(psi.toFixed(4))]))
      .toEqual([[null, -3.1416], [-3.1416, -3.1416], [-3.1416, null]]);
  });
});

describe("README: NeighborSearch", () => {
  it("searches by point and by pair", () => {
    const search = new NeighborSearch([...parsed().getAtoms()]);
    expect(search.search([3.7, 1.3, 0], 2.0).length).toBe(4);
    expect(search.searchAll(2.0).length).toBe(14);
    // The level argument gives pairs of residues instead of atoms.
    expect(search.searchAll(2.0, "R").length).toBe(2);
  });
});

describe("README: ShrakeRupley", () => {
  it("records the area at the level asked for", () => {
    const whole = parsed();
    new ShrakeRupley().compute(whole, "S");
    expect(Number(whole.sasa!.toFixed(2))).toBe(395.65);

    const perAtom = parsed();
    new ShrakeRupley().compute(perAtom, "A");
    expect(Number([...perAtom.getAtoms()][0]!.sasa!.toFixed(2))).toBe(51.4);
    // Level "A" records on the atoms and leaves the structure's own sasa unset.
    expect(perAtom.sasa).toBeUndefined();
  });
});

describe("README: Superimposer", () => {
  it("finds the transform between two copies", () => {
    const fixed = [...parsed("a").getAtoms()].slice(0, 5);
    const moving = [...parsed("b").getAtoms()].slice(0, 5);
    const sup = new Superimposer();
    sup.setAtoms(fixed, moving);
    // Not exactly zero: the SVD runs either way, and this is the float noise it leaves.
    expect(sup.rms).toBe(2.9373740229761033e-16);
    expect(sup.rotran !== null).toBe(true);
    expect(() => sup.apply(moving)).not.toThrow();
  });
});

describe("README: vectors and rotations", () => {
  it("does the arithmetic and the geometry", () => {
    const v = new Vector(1, 0, 0);
    expect(v.repr()).toBe("<Vector 1.00, 0.00, 0.00>");
    expect(v.getArray()).toEqual([1, 0, 0]);
    expect([v.norm(), v.normsq()]).toEqual([1, 1]);
    expect(v.add(new Vector(0, 1, 0)).repr()).toBe("<Vector 1.00, 1.00, 0.00>");
    expect(v.dot(new Vector(1, 1, 0))).toBe(1);
    expect(v.cross(new Vector(0, 1, 0)).repr()).toBe("<Vector 0.00, -0.00, 1.00>");
    expect(v.angle(new Vector(0, 1, 0))).toBe(1.5707963267948966);
    expect(v.leftMultiply(rotaxis2m(Math.PI / 2, new Vector(0, 0, 1))).repr())
      .toBe("<Vector 0.00, 1.00, 0.00>");
    expect(calcAngle(new Vector(1, 0, 0), new Vector(0, 0, 0), new Vector(0, 1, 0)))
      .toBe(1.5707963267948966);
    expect(calcDihedral(new Vector(1, 0, 0), new Vector(0, 0, 0),
                        new Vector(0, 1, 0), new Vector(0, 1, 1)))
      .toBe(-1.5707963267948966);
  });
});

describe("README: unfoldEntities", () => {
  it("collects a level and refuses an unknown one", () => {
    const structure = parsed();
    expect(unfoldEntities(structure, "A").length).toBe(15);
    expect(unfoldEntities(structure, "R").length).toBe(3);
    expect(unfoldEntities(structure, "C").length).toBe(1);
    expect(() => unfoldEntities(structure, "Z")).toThrowError("Z: Not an entity level.");
  });
});

describe("README: internal coordinates", () => {
  it("measures a chain's angles and rebuilds its atoms from them", () => {
    const structure = parsed();
    const chain = [...[...structure][0]!][0]!;

    chain.atomToInternalCoordinates();
    const ic = chain.internalCoord!;
    expect([ic.hedra.size, ic.dihedra.size]).toEqual([15, 12]);

    const hedron = [...ic.hedra.values()][0]!;
    expect(Number(hedron.angle.toFixed(4))).toBe(120.0418);
    expect(Number(hedron.len12.toFixed(4))).toBe(1.4433);
    expect([...ic.dihedra.keys()][0]!.toString()).toBe("1_G_N:1_G_CA:1_G_C:2_A_N");

    const before = [...chain.getAtoms()].map((a) => [...a.coord]);
    chain.internalToAtomCoordinates();
    const after = [...chain.getAtoms()].map((a) => [...a.coord]);
    expect([before.length, after.length]).toEqual([15, 15]);
    // The README says the rebuilt atoms land exactly where they were, so that is asserted exactly.
    expect(after).toEqual(before);
  });
});

describe("README: things to know", () => {
  it("indexes a residue by its three-part id", () => {
    const chain = [...[...parsed()][0]!][0]!;
    expect(chain.get([" ", 2, " "] as never)!.resname).toBe("ALA");
  });
});
