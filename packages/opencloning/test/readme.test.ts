/**
 * Runs every code block in this package's README, so the published examples cannot drift.
 *
 * Each `it` mirrors one section; the assertions are the outputs the README prints as comments.
 */
import { ValueError } from "@biolibs/core";
import { Dseqrecord } from "@biolibs/dseqrecord";
import { Primer, gibsonAssembly, pcrAssembly } from "@biolibs/assembly2";
import { CloningStrategy, history } from "@biolibs/opencloning";
import { describe, expect, it } from "vitest";

const F1 = "GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGA";
const F2 = "CAACCCCGGCCCCTGAGTCCGAGGAGAGGGTGCTTCAGAGTATGTATACC";
const F3 = "GAGGGTGCTTCAGAGTATGTATACCGGATCACAGTCTACACTGCTCACTC";

/** @returns The plasmid the README builds, and the plan it writes. */
function example(): { plasmid: Dseqrecord; plan: CloningStrategy } {
  const first = new Dseqrecord(F1, false, undefined, "1", "f1");
  const second = new Dseqrecord(F2, false, undefined, "2", "f2");
  const third = new Dseqrecord(F3, false, undefined, "3", "f3");
  const [plasmid] = gibsonAssembly([first, second, third], 25, true);
  plasmid!.id = "100";
  return { plasmid: plasmid!, plan: CloningStrategy.fromRecords([plasmid!], { description: "a 75 bp circle" }) };
}

describe("README: writing a plan down", () => {
  it("writes the plasmid and its three parts", () => {
    const { plan } = example();
    expect([plan.sequences.length, plan.sources.length]).toEqual([4, 4]);
    expect(plan.sources[0]?.type).toBe("GibsonAssemblySource");
    expect(plan.sources[1]?.type).toBe("ManuallyTypedSource");
    expect(plan.idsOfSequencesThatAreNotInputs()).toEqual([100]);
    const sent = JSON.stringify(plan.document);
    expect((JSON.parse(sent) as { schema_version: string }).schema_version).toBe("1.0.0");
  });
});

describe("README: checking one that arrives", () => {
  it("replays every step and rebuilds the plasmid", () => {
    const sent = JSON.stringify(example().plan.document);
    const received = CloningStrategy.fromDocument(JSON.parse(sent) as never);
    received.validate();
    const [rebuilt] = received.toRecords();
    expect(rebuilt!.circular).toBe(true);
    expect(rebuilt!.length).toBe(75);
    expect(rebuilt!.seguid()).toBe("cdseguid=sYESdtpVMj71Meubth63wObHHwE");
  });

  it("refuses a plan whose product does not follow", () => {
    const sent = JSON.stringify(example().plan.document);
    const tampered = JSON.parse(sent) as { sequences: { id: number; file_content: string }[] };
    const product = tampered.sequences.find((one) => one.id === 100)!;
    product.file_content = product.file_content.replace("ggatcacagt", "ggatcacagc");
    let caught: unknown;
    try {
      CloningStrategy.fromDocument(tampered as never).validate();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ValueError);
    expect((caught as Error).message)
      .toBe("Result sequence does not match any of the 1 product(s) from GibsonAssemblySource");
  });
});

describe("README: drawing one", () => {
  it("prints the tree", () => {
    const { plasmid } = example();
    expect(history(plasmid)).toBe([
      "╙── name (Dseqrecord(o75))",
      "    └─╼ GibsonAssemblySource",
      "        ├─╼ f1 (Dseqrecord(-50))",
      "        ├─╼ f2 (Dseqrecord(-50))",
      "        └─╼ f3 (Dseqrecord(-50))",
    ].join("\n"));
  });
});

describe("README: normalising one", () => {
  it("rebuilds every molecule from its own step", () => {
    const sent = JSON.stringify(example().plan.document);
    const received = CloningStrategy.fromDocument(JSON.parse(sent) as never);
    const normalised = received.normalize();
    expect(normalised.sequences.length).toBe(4);
    expect(normalised.idsOfSequencesThatAreNotInputs().length).toBe(1);
  });
});

describe("README: a plan with more than one step", () => {
  it("carries both steps and replays both", () => {
    const arm = "CAACCCCGGCCCCTGAGTCCGAGGA";
    const tag = "CCTAGGTTACGGCATTAGCC";
    const template = new Dseqrecord(`GGATCACAGTCTACA${arm}GAGGGTGCTTCAGAGTATGTATACCGGAT${tag}CACTGCTCACTC`,
                                    false, undefined, "1", "template");
    const forwardPrimer = new Primer(arm, "2", "fwd");
    const reversePrimer = new Primer("GGCTAATGCCGTAACCTAGG", "3", "rvs");
    const backbone = new Dseqrecord(`${tag}GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCC${arm}`,
                                    false, undefined, "4", "backbone");

    const amplified = pcrAssembly(template, forwardPrimer, reversePrimer, false, 20);
    amplified[0]!.id = "50";
    const [construct] = gibsonAssembly([backbone, amplified[0]!], 20, true);
    construct!.id = "101";

    const twoStep = CloningStrategy.fromRecords([construct!], { description: "amplify, then assemble" });
    expect(twoStep.sources.map((one) => one.type))
      .toEqual(["GibsonAssemblySource", "ManuallyTypedSource", "PCRSource", "ManuallyTypedSource"]);
    expect(twoStep.primers.length).toBe(2);
    twoStep.validate();
  });
});
