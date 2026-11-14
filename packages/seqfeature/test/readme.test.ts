/**
 * Runs every code block in this package's README, so the published examples cannot drift.
 *
 * The README is the first thing anyone sees on npm, and an example that no longer works there is worse
 * than no example. Each `it` mirrors one section; the assertions are the outputs the README prints as
 * comments, so changing one without changing the other fails here.
 */
import { captureWarnings } from "@biolibs/core";
import { Seq } from "@biolibs/seq";
import {
  AfterPosition, BeforePosition, BetweenPosition, CompoundLocation, ExactPosition, Location,
  OneOfPosition, Position, Reference, SeqFeature, SimpleLocation, UncertainPosition, UnknownPosition,
  WithinPosition, insdcLocationString,
} from "@biolibs/seqfeature";
import { describe, expect, it } from "vitest";

describe("README: SimpleLocation", () => {
  it("describes one range", () => {
    const loc = new SimpleLocation(5, 10, 1);
    expect(loc.toString()).toBe("[5:10](+)");
    expect(loc.repr()).toBe("SimpleLocation(ExactPosition(5), ExactPosition(10), strand=1)");
    expect(loc.length).toBe(5);
    expect([Number(loc.start), Number(loc.end), loc.strand]).toEqual([5, 10, 1]);
    expect(loc.parts.length).toBe(1);
    expect(loc.contains(7)).toBe(true);
    expect(loc.contains(10)).toBe(false);
    expect([...loc]).toEqual([5, 6, 7, 8, 9]);
  });

  it("extracts, reverse-complementing on the minus strand", () => {
    const parent = new Seq("ACGTACGTACGTACGT");
    expect(new SimpleLocation(5, 10, 1).extract(parent).toString()).toBe("CGTAC");
    expect(new SimpleLocation(5, 10, -1).extract(parent).toString()).toBe("GTACG");
  });

  it("shifts, flips, adds and compares", () => {
    const loc = new SimpleLocation(5, 10, 1);
    expect(loc.shift(3).toString()).toBe("[8:13](+)");
    expect(loc.flip(20).toString()).toBe("[10:15](-)");
    expect(loc.add(new SimpleLocation(12, 15, 1)).toString()).toBe("join{[5:10](+), [12:15](+)}");
    expect(loc.add(3).toString()).toBe("[8:13](+)");
    expect(loc.equals(new SimpleLocation(5, 10, 1))).toBe(true);
    expect(loc.equals(new SimpleLocation(5, 10, -1))).toBe(false);
  });

  it("needs the referenced record to extract across a ref", () => {
    const far = new SimpleLocation(5, 10, 1, "AL123456.1");
    expect(far.toString()).toBe("AL123456.1[5:10](+)");
    expect(far.ref).toBe("AL123456.1");
    expect(() => far.extract(new Seq("ACGT")))
      .toThrowError("Feature references another sequence (AL123456.1), references mandatory");
  });
});

describe("README: CompoundLocation", () => {
  /** @returns The two-part join the README uses throughout. */
  const two = (): CompoundLocation => new CompoundLocation([
    new SimpleLocation(5, 10, 1),
    new SimpleLocation(20, 25, 1),
  ]);

  it("joins the parts", () => {
    const c = two();
    expect(c.toString()).toBe("join{[5:10](+), [20:25](+)}");
    expect(c.length).toBe(10);
    expect([Number(c.start), Number(c.end)]).toEqual([5, 25]);
    expect([c.operator, c.parts.length, c.strand]).toEqual(["join", 2, 1]);
  });

  it("extracts each part in order and flips the whole", () => {
    const parent = new Seq("A".repeat(10) + "C".repeat(10) + "G".repeat(10));
    expect(two().extract(parent).toString()).toBe("AAAAAGGGGG");
    expect(two().flip(30).toString()).toBe("join{[20:25](-), [5:10](-)}");
  });
});

describe("README: positions", () => {
  it("prints each kind as Biopython prints it", () => {
    expect(String(new ExactPosition(5))).toBe("5");
    expect(String(new BeforePosition(5))).toBe("<5");
    expect(String(new AfterPosition(5))).toBe(">5");
    expect(String(new UncertainPosition(5))).toBe("5");
    expect(String(new WithinPosition(5, 5, 8))).toBe("(5.8)");
    expect(String(new BetweenPosition(5, 5, 8))).toBe("(5^8)");
    expect(String(new UnknownPosition())).toBe("UnknownPosition()");
    expect(String(new OneOfPosition(5, [new ExactPosition(5), new ExactPosition(8)])))
      .toBe("one-of(5,8)");
  });

  it("carries an integer value, except UnknownPosition", () => {
    expect(new BeforePosition(5).repr()).toBe("BeforePosition(5)");
    expect(Number(new BeforePosition(5))).toBe(5);
    expect(Number(new UnknownPosition())).toBeNaN();
  });

  it("keeps its kind through arithmetic", () => {
    expect(String(new BeforePosition(5).add(3))).toBe("<8");
    expect(Number(new ExactPosition(5).add(3))).toBe(8);
  });

  it("parses one from text", () => {
    expect(String(Position.fromstring("<5"))).toBe("<5");
    expect(String(Position.fromstring("(5.8)"))).toBe("(5.8)");
    expect(String(Position.fromstring("?5"))).toBe("5");
  });

  it("parses the text forms the README's table lists", () => {
    // Each row's "parsed from" column, with the -1 offset a start position gets.
    expect(String(Position.fromstring("6", -1))).toBe("5");
    expect(String(Position.fromstring("?6", -1))).toBe("5");
    expect(String(Position.fromstring("<6", -1))).toBe("<5");
    expect(String(Position.fromstring(">6", -1))).toBe(">5");
    expect(String(Position.fromstring("(4.6)", -1))).toBe("(3.5)");
    // The table's one dash: a between-position has no text form the position parser takes.
    expect(() => Position.fromstring("6^7", -1))
      .toThrowError("invalid literal for int() with base 10: '6^7'");
    expect(String(Location.fromstring("6^7"))).toBe("[6:6](+)");
    expect(String(Position.fromstring("one-of(6,8)", -1))).toBe("one-of(5,7)");
    expect(String(Position.fromstring("?"))).toBe("UnknownPosition()");
  });
});

describe("README: Location.fromstring", () => {
  it("parses the grammar, converting to zero-based half-open", () => {
    expect(String(Location.fromstring("5..10"))).toBe("[4:10](+)");
    expect(String(Location.fromstring("complement(5..10)"))).toBe("[4:10](-)");
    expect(String(Location.fromstring("join(5..10,20..25)")))
      .toBe("join{[4:10](+), [19:25](+)}");
    expect(String(Location.fromstring("complement(join(1..10,20..30))")))
      .toBe("join{[19:30](-), [0:10](-)}");
    expect(String(Location.fromstring("<5..>10"))).toBe("[<4:>10](+)");
    expect(String(Location.fromstring("(5.8)..10"))).toBe("[(4.7):10](+)");
    expect(String(Location.fromstring("one-of(5,8)..10"))).toBe("[one-of(4,7):10](+)");
    expect(String(Location.fromstring("5^6"))).toBe("[5:5](+)");
    expect(String(Location.fromstring("NC_1.1:5..10"))).toBe("NC_1.1[4:10](+)");
    expect(String(Location.fromstring("order(1..10,20..30)")))
      .toBe("order{[0:10](+), [19:30](+)}");
    expect(() => Location.fromstring("nonsense"))
      .toThrowError("Could not parse feature location 'nonsense'");
  });

  it("repairs an origin-spanning feature only when told the topology", () => {
    const { result, warnings } = captureWarnings(() =>
      String(Location.fromstring("1000..10", 1010, true)));
    expect(result).toBe("join{[999:1010](+), [0:10](+)}");
    expect(warnings[0]!.category).toBe("BiopythonParserWarning");

    expect(() => Location.fromstring("1000..10", 1010)).toThrowError(
      "it appears that '1000..10' is a feature that spans the origin,"
      + " but the sequence topology is undefined");
  });
});

describe("README: the INSDC writers", () => {
  it("writes GenBank text back out", () => {
    expect(insdcLocationString(new SimpleLocation(5, 10, 1), 100)).toBe("6..10");
    expect(insdcLocationString(new SimpleLocation(5, 10, -1), 100)).toBe("complement(6..10)");
    expect(insdcLocationString(new CompoundLocation([
      new SimpleLocation(5, 10, 1),
      new SimpleLocation(20, 25, 1),
    ]), 100)).toBe("join(6..10,21..25)");
  });

  it("loses the fuzziness Biopython loses", () => {
    // Stated in the README as a known asymmetry rather than a shortcut, so it is pinned here.
    expect(insdcLocationString(new SimpleLocation(new UncertainPosition(5), 10, 1), 100))
      .toBe("6..10");
    expect(insdcLocationString(new SimpleLocation(5, new UnknownPosition(), 1), 100))
      .toBe("6..>6");
  });
});

describe("README: SeqFeature", () => {
  it("carries a location, a type, an id and qualifiers", () => {
    const f = new SeqFeature(new SimpleLocation(5, 10, 1), "CDS", "gene1",
                             { gene: ["abc"], note: ["hello"] });
    expect([f.type, f.id, f.length]).toEqual(["CDS", "gene1", 5]);
    expect(f.qualifiers.get("gene")).toEqual(["abc"]);
    expect(f.contains(7)).toBe(true);
    expect(f.extract(new Seq("ACGTACGTACGTACGT")).toString()).toBe("CGTAC");
    expect(String(f.shift(5).location)).toBe("[10:15](+)");
    expect(String(f.flip(20).location)).toBe("[10:15](-)");
    expect(f.toString()).toBe(
      "type: CDS\nlocation: [5:10](+)\nid: gene1\nqualifiers:\n"
      + "    Key: gene, Value: ['abc']\n    Key: note, Value: ['hello']\n");
  });

  it("translates through the feature, reading its own qualifiers", () => {
    const cds = new SeqFeature(new SimpleLocation(0, 12, 1), "CDS");
    expect(cds.translate(new Seq("ATGGCCATTTGA")).toString()).toBe("MAI");

    const shifted = new SeqFeature(new SimpleLocation(0, 12, 1), "CDS", undefined,
                                   { codon_start: ["2"] });
    expect(shifted.translate(new Seq("AATGGCCTGA"), { cds: false }).toString()).toBe("MA*");
  });

  it("refuses to extract without a location", () => {
    expect(() => new SeqFeature().extract(new Seq("ACGT"))).toThrowError(
      "The feature's .location is None. Check the sequence file for a valid location.");
  });
});

describe("README: Reference", () => {
  it("holds a citation", () => {
    const r = new Reference();
    r.authors = "Smith J";
    r.title = "A paper";
    r.journal = "Nature";
    expect(r.repr()).toBe("Reference(title='A paper', ...)");
    expect(r.toString().split("\n")[0]).toBe("authors: Smith J");
  });
});

describe("README: things to know", () => {
  it("compares positions by value", () => {
    expect(new ExactPosition(5).equals(new BeforePosition(5))).toBe(true);
    expect(new ExactPosition(5).equals(5)).toBe(true);
    expect(new ExactPosition(5) === new ExactPosition(5)).toBe(false);
  });
});
