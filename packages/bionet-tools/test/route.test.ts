/**
 * Whether a route has one answer.
 *
 * The case worth catching is not a route that fails. It is a route that works and also works some
 * other way: a piece with the same overhang at both ends goes in either way round, both ways close
 * into a plasmid of exactly the right length, and a check digest with the enzymes that made it shows
 * the same bands for both. So what is checked here is that the second plasmid is found and named,
 * and that a route which really has one answer is left alone rather than warned about.
 */
import { checkRoute, routeOf, saysRoute } from "@biolibs/bionet-tools";
import { partChecksum } from "@biolibs/bionet";
import { describe, expect, it } from "vitest";

/**
 * A small plasmid with XhoI in two places and AvrII in one. Cut with both, the piece between the two
 * XhoI sites has the same overhang at either end, so it can go back either way round.
 */
const AMBIGUOUS = "AGATGGCCATGGCCAAGGCCAATTGGCCAGGCTCCATTATATTTCGTTCACTCGTCGTATATAGAACTCCCTCGAGTACGCTGG" +
  "AGCTAAGACGGTCGACGACGCTTACCCTGCACTGTTAGTGGGGATGCGATATGGATCGATAACTCGAGTAAGTTGTTAACCGGT" +
  "TAACAACCAAGTACAGAGGCTTAATTCGTATCTCCAGGTTGGACGAACTATTTTCCTAGG";

/** The same, with one BamHI site in place of the two XhoI ones: two pieces, two different ends. */
const ONE_WAY = "AGATGGCCATGGCCAAGGCCAATTGGCCAGGCTCCATTATATTTCGTTCACTCGTCGTATATAGAACTCCGGATCCTACGCTGG" +
  "AGCTAAGACGGTCGACGACGCTTACCCTGCACTGTTAGTGGGGATGCGATATGGATCGATAACCTAGG";

describe("checking a route", () => {
  it("says nothing about a route that can only go together one way", () => {
    const checked = checkRoute({ sequence: ONE_WAY, circular: true }, ["BamHI", "AvrII"]);
    expect(checked.problem).toBeNull();
    expect(checked.enzymes).toEqual(["BamHI", "AvrII"]);
    expect(checked.pieces).toHaveLength(2);
    expect(checked.makesIt).toBe(true);
    expect(checked.instead).toEqual([]);
    // A route with one answer needs no remark.
    expect(saysRoute(checked)).toBeNull();
  });

  it("finds the other plasmid a route could make when a piece has the same end twice", () => {
    const checked = checkRoute({ sequence: AMBIGUOUS, circular: true }, ["XhoI", "AvrII"]);
    expect(checked.problem).toBeNull();
    expect(checked.pieces).toHaveLength(3);
    expect(checked.makesIt).toBe(true);
    expect(checked.instead).toHaveLength(1);
    // It is the same length as the design, which is why a gel cannot tell them apart.
    expect(checked.instead[0]!.length).toBe(AMBIGUOUS.length);
    expect(checked.instead[0]!.checksum).not.toBe(partChecksum({ sequence: AMBIGUOUS, circular: true }));
    expect(checked.instead[0]!.pieces.some((one) => one.flipped)).toBe(true);
    expect(saysRoute(checked)).toContain("either way round");
  });

  it("names the design as the intended product and puts it first", () => {
    const checked = checkRoute({ sequence: AMBIGUOUS, circular: true }, ["XhoI", "AvrII"]);
    expect(checked.products[0]!.intended).toBe(true);
    expect(checked.products[0]!.checksum).toBe(partChecksum({ sequence: AMBIGUOUS, circular: true }));
    expect(checked.products.filter((one) => one.intended)).toHaveLength(1);
  });

  it("reports each piece with the unpaired bases at its ends", () => {
    const checked = checkRoute({ sequence: ONE_WAY, circular: true }, ["BamHI", "AvrII"]);
    // BamHI leaves GATC and AvrII leaves CTAG, and the two pieces each carry one of each.
    const ends = checked.pieces.flatMap((one) => [one.left, one.right]).sort();
    expect(ends).toEqual(["CTAG", "CTAG", "GATC", "GATC"]);
  });

  it("says so when the plan does not say what to cut with", () => {
    const checked = checkRoute({ sequence: ONE_WAY, circular: true }, []);
    expect(checked.problem).toBe("The plan does not say what to cut with.");
    expect(saysRoute(checked)).toBe("The plan does not say what to cut with.");
  });

  it("says so when none of them is an enzyme", () => {
    expect(checkRoute({ sequence: ONE_WAY, circular: true }, ["Scissors"]).problem)
      .toBe("None of those is an enzyme this knows.");
  });

  it("says so when the enzymes do not cut it into pieces", () => {
    const checked = checkRoute({ sequence: ONE_WAY, circular: true }, ["NotI"]);
    expect(checked.problem).toBe("NotI does not cut this into pieces.");
    expect(checked.makesIt).toBe(false);
  });

  it("says so rather than enumerating a digest that falls into too many pieces", () => {
    const checked = checkRoute({ sequence: AMBIGUOUS, circular: true }, ["XhoI", "AvrII", "NcoI", "SalI", "HpaI", "ClaI", "AgeI"]);
    expect(checked.problem).toMatch(/too many to put back together/);
    expect(checked.products).toEqual([]);
  });

  it("says so when there is nothing to cut", () => {
    expect(checkRoute({ sequence: "", circular: true }, ["BamHI"]).problem).toBe("There is nothing to cut.");
  });
});

describe("reading the enzymes a plan says to cut with", () => {
  it("reads them as a person writes them", () => {
    expect(routeOf({ settings: { cut_with: "BamHI and AvrII" } })).toEqual(["BamHI", "AvrII"]);
    expect(routeOf({ settings: { cut_with: "NcoI, XhoI" } })).toEqual(["NcoI", "XhoI"]);
    expect(routeOf({ settings: { cut_with: "EcoRI + HindIII" } })).toEqual(["EcoRI", "HindIII"]);
  });

  it("finds nothing where a plan says nothing, rather than guessing", () => {
    expect(routeOf({ settings: {} })).toEqual([]);
    expect(routeOf({})).toEqual([]);
    expect(routeOf({ settings: { cut_with: 7 } })).toEqual([]);
  });

  it("takes the setting it is told to", () => {
    expect(routeOf({ settings: { digest: "BamHI" } }, "digest")).toEqual(["BamHI"]);
  });

  it("reads a plan straight through to its route", () => {
    const plan = { settings: { cut_with: "BamHI and AvrII" } };
    expect(checkRoute({ sequence: ONE_WAY, circular: true }, routeOf(plan)).instead).toEqual([]);
  });
});
