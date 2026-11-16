/**
 * A PCR, worked out before it is run.
 *
 * Given a template and two primers this says what would come out, using the same engine the cloning
 * plans use. It decides nothing about the lab: it takes sequences and returns sequences, so the same
 * answer can be shown in a window, checked in a test, or worked out again by somebody who was sent
 * the run.
 */
import { Primer, pcrAssembly } from "@biolibs/assembly2";
import { Dseqrecord } from "@biolibs/dseqrecord";
import { tmWallace } from "@biolibs/seqtools";

/** How many bases at a primer's 3′ end have to bind, unless somebody says otherwise. */
export const ANNEAL_AT_LEAST = 18;

/** The longest a part can be and still be offered first as a primer. */
export const LONGEST_PRIMER = 60;

/** What a PCR would make. */
export interface PcrPlan {
  /** Every product the primers would make from the template, shortest first. */
  products: { sequence: string; length: number }[];
  /** Why there is not exactly one product, said for a person, or `null` if there is. */
  problem: string | null;
}

/**
 * Whether a part is short enough to be a primer.
 *
 * @param part - Its length and whether it is a circle.
 * @returns Whether to offer it as a primer first. Anything may still be chosen.
 */
export function looksLikePrimer(part: { length: number; circular: boolean }): boolean {
  return !part.circular && part.length <= LONGEST_PRIMER;
}

/**
 * A primer's melting temperature by the Wallace rule: 2 °C for each A or T, 4 °C for each G or C.
 *
 * It is the rough figure written on a tube, good for seeing that two primers are near each other.
 *
 * @param sequence - The primer.
 * @returns Degrees Celsius, or `null` if that is not a sequence.
 */
export function primerTm(sequence: string): number | null {
  try { return tmWallace(sequence.replace(/\s+/g, "")); } catch { return null; }
}

/**
 * Work out what a PCR would make.
 *
 * @param template - What is being copied.
 * @param forward - One primer.
 * @param reverse - The other.
 * @param options - `annealAtLeast` is how many bases at each primer's 3′ end must bind.
 * @returns The products, and what is wrong if there is not exactly one.
 *
 * @example
 * ```ts
 * import { planPcr } from "@biolibs/bionet-tools";
 *
 * const template = "GGATCACAGTCTACACTGCTCACTCCAACCCCGGCCCCTGAGTCCGAGGAGAGGGTGCTTCAGAGTATGTATACC";
 * const plan = planPcr({ sequence: template, circular: false }, "GGATCACAGTCTACACTG", "GGTATACATACTCTGAAG");
 * plan.problem;               // null
 * plan.products[0].length;    // 75
 * ```
 */
export function planPcr(template: { sequence: string; circular: boolean }, forward: string, reverse: string,
                        options: { annealAtLeast?: number } = {}): PcrPlan {
  const least = options.annealAtLeast ?? ANNEAL_AT_LEAST;
  const clean = (text: string): string => text.replace(/\s+/g, "");
  // The engine finds the primers whichever of them binds the upper strand, so the order they are
  // given in does not matter.
  let products: { sequence: string; length: number }[] = [];
  try {
    products = pcrAssembly(new Dseqrecord(clean(template.sequence), template.circular, undefined, "1", "template"),
                           new Primer(clean(forward), "2", "forward"), new Primer(clean(reverse), "3", "reverse"), false, least)
      .map((product) => ({ sequence: String(product.seq), length: product.length }));
  } catch {
    products = [];
  }
  products.sort((a, b) => a.length - b.length);
  const problem = products.length === 1 ? null
    : products.length === 0 ? `These primers do not both bind this template with ${least} bases at their 3′ ends.`
    : `These primers make ${products.length} different products from this template. A run records one.`;
  return { products, problem };
}
