/**
 * Runs every code block in this package's README, so the published examples cannot drift.
 *
 * Each `it` mirrors one section; the assertions are the outputs the README prints as comments.
 */
import { Dseqrecord } from "@biolibs/dseqrecord";
import { enzymes } from "@biolibs/restriction";
import { Assembly, PyIntSet, Primer, SingleFragmentAssembly, assemblyToString, commonSubStrings,
         gibsonAssembly, gibsonOverlap, goldenGateAssembly, ligationAssembly, pcrAssembly } from "@biolibs/assembly2";
import { describe, expect, it } from "vitest";

const FIRST = "GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGA";
const SECOND = "CAACCCCGGCCCCTGAGTCCGAGGAGAGGGTGCTTCAGAGTATGTATACC";
const THIRD = "GAGGGTGCTTCAGAGTATGTATACCGGATCACAGTCTACACTGCTCACTC";

describe("README: Gibson assembly", () => {
  it("joins three fragments into a plasmid", () => {
    const first = new Dseqrecord(FIRST);
    const second = new Dseqrecord(SECOND);
    const third = new Dseqrecord(THIRD);

    const [plasmid] = gibsonAssembly([first, second, third], 25, true);

    expect(plasmid!.circular).toBe(true);
    expect(plasmid!.length).toBe(75);
    expect(plasmid!.source!.kind).toBe("GibsonAssemblySource");
    expect(plasmid!.source!.input.length).toBe(3);
  });
});

describe("README: the provenance", () => {
  it("says which fragment was used where", () => {
    const left = new Dseqrecord(FIRST);
    const right = new Dseqrecord(SECOND);

    const [product] = gibsonAssembly([left, right], 25);

    const lines = product!.source!.input.map((input) =>
      [input.sequence === left ? "left" : "right", input.reverseComplemented,
       String(input.leftLocation), String(input.rightLocation)]);
    expect(lines).toEqual([
      ["left", false, "null", "[25:50]"],
      ["right", false, "[0:25]", "null"],
    ]);
  });
});

describe("README: ligation and Golden Gate", () => {
  it("closes a cut plasmid back up", () => {
    const plasmid = new Dseqrecord("ttGAATTCaaaaaaaaaaGGATCCttttttttttGAATTCgg", true);
    const pieces = plasmid.cut(enzymes["EcoRI"]!);

    expect(pieces.length).toBe(2);
    const closed = ligationAssembly(pieces, false, false, true);
    expect(closed.length).toBe(2);
    expect(closed[0]!.circular).toBe(true);
    expect(closed[0]!.length).toBe(42);
  });

  it("assembles two parts into an acceptor", () => {
    const acceptor = new Dseqrecord("gtcaagctagcatcgatCGAATGAGACCaaccgtaacGGTCTCAAATGcatgcatgcatgc", true);
    const part = new Dseqrecord("acgtacGGTCTCAAATGgcatcgatcgtagctagctagcGCTTTGAGACCgtacgt");
    const second = new Dseqrecord("acgtacGGTCTCAGCTTgcatcgatcgtagctagctagcCGAATGAGACCgtacgt");

    const products = goldenGateAssembly([acceptor, part, second], [enzymes["BsaI"]!], true, true);
    expect(products.length).toBe(1);
    expect(products[0]!.circular).toBe(true);
    expect(products[0]!.length).toBe(79);
  });
});

describe("README: PCR", () => {
  it("copies the template and keeps the primers' own ends", () => {
    const template = new Dseqrecord("ccacgtGGATCCattacggtcagcatgcaatgcTTAAGCCGTAACGTTTGCCAT");
    const forward = new Primer("gaattcGGATCCattacggtcagc");
    const reverse = new Primer("ATGGCAAACGTTACGGCTTAA");

    const [product] = pcrAssembly(template, forward, reverse, true);

    expect(product!.length).toBe(54);
    expect(product!.toString().startsWith("Dseqrecord")).toBe(true);
    expect(product!.seq!.toString().slice(0, 6)).toBe("gaattc");
    expect(product!.features.map((feature) => feature.type)).toEqual(["primer_bind", "primer_bind"]);
  });
});

describe("README: one fragment on its own", () => {
  it("circularises and splices", () => {
    const repeated = new Dseqrecord("GCTTAAGCCGTAACGTTTGCCtttttttttttttttGCTTAAGCCGTAACGTTTGCC");
    const assembly = new SingleFragmentAssembly([repeated], 20, commonSubStrings);

    const [circle] = assembly.assembleCircular();
    expect(circle!.circular).toBe(true);
    expect(circle!.length).toBe(36);
    expect(assembly.assembleInsertion().length).toBe(0);
  });
});

describe("README: the engine underneath", () => {
  it("can be driven directly", () => {
    const left = new Dseqrecord(FIRST);
    const right = new Dseqrecord(SECOND);

    const assembly = new Assembly([left, right], 25, gibsonOverlap, false, true);

    expect(assembly.getLinearAssemblies().length).toBe(1);
    expect(assemblyToString(assembly.getLinearAssemblies()[0]!)).toBe("('1[25:50]:2[0:25]',)");
    expect(assembly.toString().split("\n")[0]).toBe("Assembly");
  });
});

describe("README: why the order matters", () => {
  it("iterates a set of integers as CPython does", () => {
    expect([...new PyIntSet([3, 1, 2])]).toEqual([1, 2, 3]);
    expect([...new PyIntSet([1, -1, 2, -2])]).toEqual([1, 2, -1, -2]);
  });
});
