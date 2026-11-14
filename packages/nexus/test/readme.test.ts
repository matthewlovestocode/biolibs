/**
 * Runs every code block in this package's README, so the published examples cannot drift.
 *
 * The README is the first thing anyone sees on npm, and an example that no longer works there is worse
 * than no example. Each `it` mirrors one section; the assertions are the outputs the README prints as
 * comments, so changing one without changing the other fails here.
 */
import { Nexus, StepMatrix, Tree, consensus, safename } from "@biolibs/nexus";
import { describe, expect, it } from "vitest";

/** The three-taxon NEXUS file the README reads, with a data block and a trees block. */
const TEXT = `#NEXUS
begin data;
dimensions ntax=3 nchar=6;
format datatype=dna missing=? gap=-;
matrix
a ACGTAC
b AC-TAC
c ACGTTT
;
end;
begin trees;
tree one = ((a:0.1,b:0.2):0.3,c:0.4);
end;
`;

/** That file parsed afresh, since the editing examples mutate it. */
const parsed = (): Nexus => new Nexus(TEXT);
/** The README's three-taxon tree. */
const tree = (): Tree => new Tree("((a:0.1,b:0.2):0.3,c:0.4);");
/** A target that collects what is written to it. */
function sink(): { write: (t: string) => number; readonly text: string } {
  let out = "";
  return { write: (t: string) => { out += t; return t.length; }, get text() { return out; } };
}

describe("README: reading", () => {
  it("parses the blocks", () => {
    const n = parsed();
    expect(n.taxlabels).toEqual(["a", "b", "c"]);
    expect([n.ntax, n.nchar]).toEqual([3, 6]);
    expect([n.datatype, n.missing, n.gap]).toEqual(["dna", "?", "-"]);
    expect([...n.matrix!].map(([k, v]) => [k, String(v)]))
      .toEqual([["a", "ACGTAC"], ["b", "AC-TAC"], ["c", "ACGTTT"]]);
    expect(n.trees.length).toBe(1);
    expect(n.trees[0]!.name).toBe("one");
  });
});

describe("README: the blocks that catch people out", () => {
  it("applies a translate table as the trees are parsed", () => {
    const n = new Nexus(`#NEXUS
begin taxa;
dimensions ntax=3;
taxlabels alpha beta gamma;
end;
begin trees;
translate
  1 alpha,
  2 beta,
  3 gamma
;
tree one = ((1:0.1,2:0.2):0.3,3:0.4);
end;
`);
    expect(n.trees[0]!.toString()).toBe("tree one = ((alpha,beta),gamma);");
    expect([...n.translate!]).toEqual([[1, "alpha"], [2, "beta"], [3, "gamma"]]);
    // Biopython gives [] for this file too, which the README says so nobody takes it for a bug.
    expect(n.taxlabels).toEqual([]);
  });

  it("reads charstatelabels", () => {
    const c = new Nexus(`#NEXUS
begin characters;
dimensions ntax=2 nchar=2;
format datatype=standard symbols="012";
charstatelabels 1 colour / red blue, 2 size / big small;
matrix
a 01
b 10
;
end;
`);
    expect([...c.charlabels!]).toEqual([[0, "colour"], [1, "size"]]);
    expect([...c.statelabels!]).toEqual([[0, ["red", "blue"]], [1, ["big", "small"]]]);
  });

  it("keeps a block it does not know", () => {
    const m = new Nexus(`#NEXUS
begin mrbayes;
  set autoclose=yes;
end;
begin data;
dimensions ntax=2 nchar=2;
format datatype=dna;
matrix
a AC
b AG
;
end;
`);
    expect(m.unknownBlocks.map((b) => b.title)).toEqual(["mrbayes"]);
  });
});

describe("README: looking at the columns", () => {
  it("reports the constant, gap-only and inverted columns", () => {
    const n = parsed();
    expect(n.constant()).toEqual([0, 1, 2, 3]);
    expect(n.cstatus(0)).toEqual(["A"]);
    expect(n.cstatus(2)).toEqual(["G"]);
    expect(n.gaponly()).toEqual([]);
    expect(n.invert([0, 1])).toEqual([2, 3, 4, 5]);
  });
});

describe("README: writing", () => {
  it("writes NEXUS to a target with write(text)", () => {
    const target = sink();
    parsed().writeNexusData({ filename: target });
    expect(target.text.split("\n").slice(0, 6)).toEqual([
      "#NEXUS", "begin data;", "dimensions ntax=3 nchar=6;",
      "format datatype=dna missing=? gap=-;", "matrix", "a ACGTAC"]);
  });

  it("returns the filename Biopython would have derived", () => {
    const target = sink();
    const name = parsed().exportFasta({ filename: target });
    expect(name).toBe("input_string.fas");
    expect(target.text.split("\n").slice(0, 4)).toEqual([">a", "ACGTAC", ">b", "AC-TAC"]);
  });

  it("refuses to guess a target", () => {
    expect(() => parsed().writeNexusData({})).toThrowError(
      "Writing to a file by name is not supported; pass an object with a write(text) method as filename");
  });
});

describe("README: Tree", () => {
  it("reports its shape, by node id", () => {
    const t = tree();
    expect(t.getTaxa()).toEqual(["a", "b", "c"]);
    expect(t.countTerminals()).toBe(3);
    expect(t.isBifurcating()).toBe(true);
    expect(t.allIds()).toEqual([0, 1, 2, 3, 4]);
    expect(t.root).toBe(0);
    expect(t.getTerminals()).toEqual([2, 3, 4]);

    const a = t.searchTaxon("a")!;
    const b = t.searchTaxon("b")!;
    expect([a, b]).toEqual([2, 3]);
    expect(t.commonAncestor(a, b)).toBe(1);
    expect(Number(t.distance(a, b).toFixed(4))).toBe(0.3);
    expect(Number(t.sumBranchlength(t.root, a).toFixed(4))).toBe(0.4);
  });

  it("carries data on each node", () => {
    const t = tree();
    const node = t.node(t.searchTaxon("a")!);
    expect([node.data.taxon, node.data.branchlength, node.prev]).toEqual(["a", 0.1, 1]);
  });

  it("returns a node id from isMonophyletic, not a boolean", () => {
    const t = tree();
    expect(t.isMonophyletic(["a", "b"])).toBe(1);
    expect(t.isMonophyletic(["a", "c"])).toBe(-1);
  });

  it("inverts isPreterminal, as Biopython does", () => {
    const t = tree();
    expect(t.isPreterminal(t.root)).toBe(false);
    expect(t.isPreterminal(t.searchTaxon("a")!)).toBe(true);
  });

  it("prunes, prints and compares", () => {
    const p = tree();
    p.prune("a");
    expect(p.toString()).toBe("tree a_tree = (c,b);");

    const t = tree();
    expect(t.toString()).toBe("tree a_tree = ((a,b),c);");
    expect(t.toString({ plain: false }))
      .toBe("tree a_tree = ((a:0.10000,b:0.20000)0.00000:0.30000,c:0.40000);");
    expect(t.isIdentical(new Tree("((a,b),c);"))).toBe(true);
  });

  it("prints the table display() returns", () => {
    expect(tree().display().split("\n")[0]).toContain("taxon");
  });

  it("raises from sumBranchlength with no root", () => {
    // Stated in "Things to know": the default argument is not a usable node.
    expect(() => tree().sumBranchlength()).toThrowError("Missing node id.");
  });
});

describe("README: consensus", () => {
  it("builds a majority-rule tree", () => {
    const forest = ["((a,b),c);", "((a,b),c);", "((a,c),b);"].map((s) => new Tree(s));
    expect(consensus(forest)!.toString()).toBe("tree consensus_0.5 = (c,(a,b));");
    // Past the 2-in-3 support for (a,b), the clade goes.
    expect(consensus(forest, 0.9)!.toString()).toBe("tree consensus_0.9 = (a,b,c);");
  });
});

describe("README: the supporting pieces", () => {
  it("quotes a NEXUS name and sums a step matrix", () => {
    expect(safename("a b")).toBe("'a b'");
    expect(safename("it's")).toBe("'it''s'");
    expect(safename("plain")).toBe("plain");

    const sm = new StepMatrix(["A", "C"]);
    sm.add("A", "C", 1);
    expect(sm.sum()).toBe(1);
  });
});
