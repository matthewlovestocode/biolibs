/**
 * A PCR worked out before it is run.
 *
 * Checked against molecules small enough to read: a product is the stretch between the primers
 * carrying the primers' own ends, primers given the wrong way round are still found, and a pair that
 * does not bind says so in words.
 */
import { ANNEAL_AT_LEAST, looksLikePrimer, planPcr, primerTm } from "@biolibs/bionet-tools";
import { describe, expect, it } from "vitest";

const TEMPLATE = "GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGAGAGGGTGCTTCAGAGTATGTATACC";
const FORWARD = "GGATCACAGTCTACACTG";
const REVERSE = "GGTATACATACTCTGAAG";

describe("planning a PCR", () => {
  it("makes the stretch between the primers", () => {
    const plan = planPcr({ sequence: TEMPLATE, circular: false }, FORWARD, REVERSE);
    expect(plan).toEqual({ products: [{ sequence: TEMPLATE, length: 75 }], problem: null });
    const inner = planPcr({ sequence: TEMPLATE, circular: false }, "CAACCCCGGCCCCTGAGTCC", REVERSE);
    expect(inner.products[0]!.sequence).toBe(TEMPLATE.slice(25));
  });

  it("finds primers given the other way round, and ignores stray spaces", () => {
    const plan = planPcr({ sequence: ` ${TEMPLATE}\n`, circular: false }, ` ${REVERSE}`, FORWARD);
    expect(plan.products.map((one) => one.length)).toEqual([75]);
    expect(plan.problem).toBeNull();
  });

  it("carries a primer's own tail onto the product", () => {
    const tailed = `GAATTC${FORWARD}`;
    const plan = planPcr({ sequence: TEMPLATE, circular: false }, tailed, REVERSE);
    expect(plan.products[0]!.sequence).toBe(`GAATTC${TEMPLATE}`);
  });

  it("says in words when the primers do not bind, or bind too little", () => {
    const none = planPcr({ sequence: TEMPLATE, circular: false }, "TTTTTTTTTTTTTTTTTTTT", REVERSE);
    expect(none.products).toEqual([]);
    expect(none.problem).toBe(`These primers do not both bind this template with ${ANNEAL_AT_LEAST} bases at their 3′ ends.`);
    expect(planPcr({ sequence: TEMPLATE, circular: false }, FORWARD.slice(4), REVERSE.slice(4)).problem).toMatch(/do not both bind/);
    expect(planPcr({ sequence: TEMPLATE, circular: false }, FORWARD.slice(4), REVERSE.slice(4), { annealAtLeast: 14 }).problem).toBeNull();
    expect(planPcr({ sequence: "not a sequence at all", circular: false }, FORWARD, REVERSE).products).toEqual([]);
  });

  it("says when there is more than one product, since a run records one", () => {
    const twice = planPcr({ sequence: `${TEMPLATE}AAAAAAAAAA${TEMPLATE}`, circular: false }, FORWARD, REVERSE);
    expect(twice.products.length).toBeGreaterThan(1);
    expect(twice.problem).toMatch(/different products/);
    expect(twice.products[0]!.length).toBeLessThanOrEqual(twice.products.at(-1)!.length);
  });
});

describe("what is offered as a primer", () => {
  it("is short and not a circle, with a rough melting temperature", () => {
    expect(looksLikePrimer({ length: 20, circular: false })).toBe(true);
    expect(looksLikePrimer({ length: 61, circular: false })).toBe(false);
    expect(looksLikePrimer({ length: 20, circular: true })).toBe(false);
    expect(primerTm("ATGC")).toBe(12);
    expect(primerTm(" AT GC ")).toBe(12);
    expect(primerTm("not a primer")).toBeNull();
  });
});
