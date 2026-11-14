/**
 * Runs every code block in this package's README, so the published examples cannot drift.
 *
 * The README is the first thing anyone sees on npm, and an example that no longer works there is worse
 * than no example. Each `it` mirrors one section; the assertions are the outputs the README prints as
 * comments, so changing one without changing the other fails here.
 */
import { MultipleSeqAlignment } from "@biolibs/align";
import { Seq } from "@biolibs/seq";
import { SeqRecord } from "@biolibs/seqrecord";
import {
  BranchColor, Clade, Consensus, PhyloXML, PhyloXMLIO, Tree, TreeConstruction, convert, parse, read,
  write,
} from "@biolibs/phylo";
import { describe, expect, it } from "vitest";

/** The four-taxon Newick tree the README uses throughout. */
const NWK = "((A:0.1,B:0.2)90:0.3,(C:0.4,D:0.5):0.6);";

/** The phyloXML document the README's phyloXML section reads. */
const XML = '<phyloxml xmlns="http://www.phyloxml.org"><phylogeny rooted="true"><name>t1</name>'
  + "<clade><clade><name>A</name><branch_length>0.1</branch_length>"
  + "<taxonomy><scientific_name>Homo sapiens</scientific_name></taxonomy></clade>"
  + '<clade><name>B</name><branch_length>0.2</branch_length><confidence type="bootstrap">90</confidence>'
  + "</clade></clade></phylogeny></phyloxml>";

/** A target that collects what is written to it, as every write example uses. */
function sink(): { write: (s: string) => number; readonly text: string } {
  let out = "";
  return { write: (s: string) => { out += s; return s.length; }, get text() { return out; } };
}

describe("README: read, parse, write, convert", () => {
  it("reads a tree and reports its shape", () => {
    const tree = read(NWK, "newick");
    expect(tree.getTerminals().map((c) => c.name)).toEqual(["A", "B", "C", "D"]);
    expect(tree.countTerminals()).toBe(4);
    expect(tree.totalBranchLength()).toBe(2.1);
    expect(tree.rooted).toBe(false);
    expect(tree.isBifurcating()).toBe(true);
  });

  it("writes Newick the way Biopython writes it", () => {
    const target = sink();
    expect(write(read(NWK, "newick"), target, "newick")).toBe(1);
    expect(target.text).toBe("((A:0.1,B:0.2)90.00:0.3,(C:0.4,D:0.5):0.6):0;\n");
    expect(read(NWK, "newick").format("newick")).toBe(target.text);
  });

  it("parses several trees, and read insists on one", () => {
    expect([...parse("((A,B),(C,D));\n((A,C),(B,D));\n", "newick")].length).toBe(2);
    expect(() => read("((A,B),(C,D));\n((A,C),(B,D));\n", "newick"))
      .toThrowError("There are multiple trees in this file; use parse() instead.");
    expect(() => read("((A,B),(C,D));", "nope")).toThrowError("nope");
  });

  it("converts Newick to NEXUS", () => {
    const target = sink();
    expect(convert("((A,B),(C,D));", "newick", target, "nexus")).toBe(1);
    expect(target.text.split("\n").filter((l) => l.trim())[0]).toBe("#NEXUS");
  });
});

describe("README: NEXUS", () => {
  it("writes the taxa and trees blocks", () => {
    const target = sink();
    write(read(NWK, "newick"), target, "nexus");
    expect(target.text.split("\n").filter((l) => l.trim())).toEqual([
      "#NEXUS",
      "Begin Taxa;",
      " Dimensions NTax=4;",
      " TaxLabels A B C D;",
      "End;",
      "Begin Trees;",
      " Tree tree1=((A:0.1,B:0.2)90.00:0.3,(C:0.4,D:0.5):0.6):0;",
      "End;",
    ]);
  });
});

describe("README: searching", () => {
  it("finds by name, class and pattern", () => {
    const tree = read(NWK, "newick");
    expect(tree.findAny("A")!.name).toBe("A");
    expect([...tree.findClades(Clade)].length).toBe(7);
    expect([...tree.findClades({ name: "A" })].map((c) => c.name)).toEqual(["A"]);
    // A string pattern is a whole-string regular expression, so this matches two clades.
    expect([...tree.findClades({ name: "A|B" })].map((c) => c.name)).toEqual(["A", "B"]);
  });

  it("refuses a float pattern, as Biopython does", () => {
    expect(() => [...read(NWK, "newick").findElements({ branchLength: 0.1 })])
      .toThrowError("invalid query type: <class 'float'>");
  });

  it("tests only the first key of an attribute pattern", () => {
    // Biopython's behaviour, stated in the README's "Things to know".
    const tree = read(NWK, "newick");
    expect([...tree.findClades({ name: "A", width: 2 })].map((c) => c.name)).toEqual(["A"]);
  });
});

describe("README: paths and distances", () => {
  it("walks and measures", () => {
    const tree = read(NWK, "newick");
    expect(tree.getPath("A")!.map((c) => c.name ?? "(inner)")).toEqual(["(inner)", "A"]);
    expect(tree.commonAncestor("A", "B")!.confidence).toBe(90);
    expect(tree.distance("A", "B")).toBe(0.30000000000000004);
    expect(tree.trace("A", "D").map((c) => c.name ?? "(inner)"))
      .toEqual(["(inner)", "(inner)", "(inner)", "D"]);
    expect([...tree.depths()].filter(([c]) => c.name === "A").map(([, d]) => d)).toEqual([0.4]);
  });

  it("compares clades by object in isMonophyletic", () => {
    const tree = read(NWK, "newick");
    const tips = tree.getTerminals().filter((c) => c.name === "A" || c.name === "B");
    expect(tree.isMonophyletic(tips) !== null).toBe(true);
    expect(tree.isMonophyletic("A", "B")).toBe(false);
  });
});

describe("README: editing and re-rooting", () => {
  it("collapses, prunes and re-roots", () => {
    const collapsed = read(NWK, "newick");
    collapsed.collapseAll();
    expect(collapsed.format("newick").trim()).toBe("(A:0.4,B:0.5,C:1,D:1.1):0;");

    const pruned = read(NWK, "newick");
    pruned.prune("A");
    expect(pruned.format("newick").trim()).toBe("(B:0.5,(C:0.4,D:0.5):0.6):0;");

    const midpoint = read(NWK, "newick");
    midpoint.rootAtMidpoint();
    expect(midpoint.format("newick").trim())
      .toBe("((B:0.2,A:0.1)90.00:0.6,(D:0.5,C:0.4):0.3):0;");

    const outgroup = read(NWK, "newick");
    outgroup.rootWithOutgroup("A");
    expect(outgroup.format("newick").trim())
      .toBe("(((C:0.4,D:0.5):0.9,B:0.2)90.00:0.1,A:0):0;");
  });
});

describe("README: clades", () => {
  it("is a container of its children", () => {
    const tree = read(NWK, "newick");
    expect(tree.root.length).toBe(2);
    expect([...tree.root].length).toBe(2);
    expect(tree.clade === tree.root).toBe(true);
  });

  it("is built from an options object", () => {
    const built = new Tree({
      root: new Clade({
        name: "root",
        clades: [new Clade({ name: "A", branchLength: 0.1 }),
                 new Clade({ name: "B", branchLength: 0.2 })],
      }),
    });
    expect(built.format("newick").trim()).toBe("(A:0.1,B:0.2)root:0;");
    expect(new Clade({ branchLength: 0.5, name: "x" }).repr())
      .toBe("Clade(branch_length=0.5, name='x')");
  });

  it("takes a colour in any of the forms Biopython takes", () => {
    const tree = read("((A,B),(C,D));", "newick");
    tree.root.color = "red";
    expect(String(tree.root.color)).toBe("(255, 0, 0)");
    expect(tree.root.color!.red).toBe(255);
    expect(new BranchColor(1, 2, 3).repr()).toBe("BranchColor(red=1, green=2, blue=3)");
  });
});

describe("README: Consensus", () => {
  /** @returns The three-tree forest the README reduces. */
  const forest = (): Tree[] => [
    read("((A,B),(C,D));", "newick"),
    read("((A,C),(B,D));", "newick"),
    read("((A,B),(C,D));", "newick"),
  ];

  it("reduces a forest three ways", () => {
    expect(Consensus.strictConsensus(forest()).format("newick").trim())
      .toBe("((A:0,B:0):0,(C:0,D:0):0):0;");
    expect(Consensus.majorityConsensus(forest()).format("newick").trim())
      .toBe("(C:0,D:0,(A:0,B:0)100.00:0):0;");
    expect(Consensus.adamConsensus(forest()).format("newick").trim())
      .toBe("(D:0,C:0,B:0,A:0):0;");
  });

  it("annotates a tree with branch support", () => {
    const target = read("((A,B),(C,D));", "newick");
    Consensus.getSupport(target, forest());
    expect(target.format("newick").trim())
      .toBe("((A:0,B:0)66.67:0,(C:0,D:0)66.67:0)100.00:0;");
  });

  it("raises on an empty forest", () => {
    expect(() => Consensus.strictConsensus([])).toThrowError();
  });
});

describe("README: TreeConstruction", () => {
  /** @returns The four-row alignment the distance examples use. */
  const msa = (): MultipleSeqAlignment => new MultipleSeqAlignment([
    new SeqRecord(new Seq("ACGTACGT"), "a"),
    new SeqRecord(new Seq("ACGTTCGT"), "b"),
    new SeqRecord(new Seq("ACGAACGA"), "c"),
    new SeqRecord(new Seq("TCGAACGA"), "d"),
  ]);

  it("builds a distance matrix", () => {
    expect(TreeConstruction.DistanceCalculator.models.length).toBe(31);
    const dm = new TreeConstruction.DistanceCalculator("identity").getDistance(msa());
    expect(dm.names).toEqual(["a", "b", "c", "d"]);
    expect(dm.get([1, 0])).toBe(0.125);
    expect(dm.toString().split("\n").slice(0, 3))
      .toEqual(["a   0.000000", "b   0.125000    0.000000", "c   0.250000    0.375000    0.000000"]);
  });

  it("builds trees by neighbour joining and UPGMA", () => {
    const calculator = new TreeConstruction.DistanceCalculator("identity");
    expect(new TreeConstruction.DistanceTreeConstructor(calculator, "nj")
      .buildTree(msa()).format("newick").trim())
      .toBe("((a:0,b:0.125)Inner1:0.25,c:0,d:0.125)Inner2:0;");
    expect(new TreeConstruction.DistanceTreeConstructor(calculator, "upgma")
      .buildTree(msa()).format("newick").trim())
      .toBe("((d:0.0625,c:0.0625)Inner1:0.125,(b:0.0625,a:0.0625)Inner2:0.125)Inner3:0;");
  });

  it("scores and improves a tree by parsimony", () => {
    // A three-taxon tree: four taxa hit the UnboundLocalError noted in "Things to know".
    const three = (): MultipleSeqAlignment => new MultipleSeqAlignment([
      new SeqRecord(new Seq("GTGGATCCTGAT"), "S0"),
      new SeqRecord(new Seq("GCGACGGTAGAA"), "S1"),
      new SeqRecord(new Seq("AGACGGTTGATT"), "S2"),
    ]);
    const nwk = "(S0:1.05,(S2:0.47,S1:1.03):0.72):0.57;";
    const scorer = new TreeConstruction.ParsimonyScorer();

    expect(scorer.getScore(read(nwk, "newick"), three())).toBe(17);

    const searcher = new TreeConstruction.NNITreeSearcher(scorer);
    expect(new TreeConstruction.ParsimonyTreeConstructor(searcher, read(nwk, "newick"))
      .buildTree(three()).format("newick").trim())
      .toBe("(S0:1.77,(S1:1.03,S2:0.47):0.37):0.57;");
  });

  it("crashes where Biopython crashes, with Biopython's message", () => {
    const scorer = new TreeConstruction.ParsimonyScorer();
    expect(() => scorer.getScore(read("((a,b),(c,d));", "newick"), msa()))
      .toThrowError("cannot access local variable 'tip1' where it is not associated with a value");
  });
});

describe("README: phyloXML", () => {
  it("reads the document and its tree", () => {
    const doc = PhyloXMLIO.read(XML);
    expect(doc.phylogenies.length).toBe(1);
    expect(doc.phylogenies[0]!.name).toBe("t1");

    const tree = read(XML, "phyloxml");
    expect([tree.name, tree.rooted]).toEqual(["t1", true]);
    expect(tree.getTerminals().map((c) => c.name)).toEqual(["A", "B"]);
    expect(tree.getTerminals()[0]!.taxonomies[0]!.scientificName).toBe("Homo sapiens");
  });

  it("writes a list of trees and refuses a bare one", () => {
    const target = sink();
    PhyloXMLIO.write([read(XML, "phyloxml")], target);
    expect(target.text.split("\n")[1]).toBe('  <phylogeny rooted="true">');
    expect(() => PhyloXMLIO.write(read(XML, "phyloxml") as never, sink()))
      .toThrowError("'Phylogeny' object has no attribute 'to_phyloxml'");
  });

  it("promotes a Newick tree", () => {
    const promoted = read("((A:0.1,B:0.2),C:0.3);", "newick").asPhyloxml();
    expect(promoted.constructor.name).toBe("Phylogeny");
    expect(promoted.getTerminals().length).toBe(3);
    expect(new PhyloXML.Taxonomy({ scientificName: "Homo sapiens" }).scientificName)
      .toBe("Homo sapiens");
  });
});

describe("README: confidences are two different things", () => {
  it("is a number in Newick and an element in phyloXML", () => {
    expect(read(NWK, "newick").commonAncestor("A", "B")!.confidence).toBe(90);

    const b = read(XML, "phyloxml").getTerminals()[1]!;
    expect(b.confidence).toMatchObject({ value: 90, type: "bootstrap" });
    expect(b.confidences.length).toBe(1);

    const two = read('<phyloxml xmlns="http://www.phyloxml.org"><phylogeny><clade>'
      + "<confidence>1</confidence><confidence>2</confidence></clade></phylogeny></phyloxml>",
      "phyloxml");
    expect(() => two.root.confidence)
      .toThrowError("more than 1 confidence value available; use Clade.confidences");
  });
});

describe("README: things to know", () => {
  it("reports two different topologies as equal, as Biopython does", () => {
    const a = read("((A,B),(C,D));", "newick");
    const b = read("((A,C),(B,D));", "newick");
    expect(Consensus.equalTopology(a, b)).toBe(true);
  });
});
