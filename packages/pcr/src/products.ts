/**
 * The products a set of primers would amplify from a template.
 *
 * A product needs a forward primer and a reverse primer pointing at each other: the forward primer's 3' end must lie
 * before the reverse primer's, so the two polymerases run towards one another. The product runs from the forward
 * primer's 5' end to the reverse primer's 5' end, because each primer is copied into the product whole — including
 * any 5' tail it carries, which is how assembly primers add overlaps.
 *
 * One forward site and one reverse site give exactly one product, on a circle as on a line: a primer extends in one
 * direction only. On a circle the product wraps the origin when the reverse site lies before the forward one, which
 * is the only way a circular template differs here.
 */

import { ValueError } from "@biolibs/core";
import { type BindingOptions, type BindingSite, type Topology, findBindingSites } from "./binding.js";

/** Longest product reported, so a pair with many sites on a large template cannot run away. */
export const MAX_PRODUCT_LENGTH = 20000;

/** Most products reported for one call. */
export const MAX_PRODUCTS = 50;

/** A primer with a name, so a product can say which pair made it. */
export interface NamedPrimer {
  /** What to call it in a result. */
  name: string;
  /** A cleaned primer sequence. */
  sequence: string;
}

/** One product a pair of primers would amplify. */
export interface Product {
  /** The forward primer's name. */
  forward: string;
  /** The reverse primer's name. */
  reverse: string;
  /** Where the product starts on the template, 0-based: the forward primer's 5' end. */
  start: number;
  /** One past where it ends: the reverse primer's 5' end. On a circular template this may exceed the length. */
  end: number;
  /** Length in base pairs, including both primers. */
  length: number;
  /** True when the product runs across the origin of a circular template. */
  wraps: boolean;
  /** The forward primer's binding site. */
  forwardSite: BindingSite;
  /** The reverse primer's binding site. */
  reverseSite: BindingSite;
}

/**
 * Every product the given primers would amplify, taking each primer as both a forward and a reverse primer and
 * trying every pair including a primer with itself.
 *
 * @param template - The template sequence, upper case.
 * @param topology - `"linear"` or `"circular"`.
 * @param primers - The primers in the reaction, named.
 * @param options - How tolerant to be about binding; passed to {@link findBindingSites}.
 * @param maxLength - Longest product to report. Defaults to {@link MAX_PRODUCT_LENGTH}.
 * @returns The products, shortest first, at most {@link MAX_PRODUCTS} of them.
 * @throws {@link ValueError} for a duplicate primer name or a non-positive `maxLength`.
 * @example
 * ```ts
 * const products = predictProducts(template, "circular", [
 *   { name: "M13F", sequence: "GTAAAACGACGGCCAGT" },
 *   { name: "M13R", sequence: "CAGGAAACAGCTATGAC" },
 * ]);
 * products[0]?.length;
 * ```
 */
export function predictProducts(
  template: string,
  topology: Topology,
  primers: readonly NamedPrimer[],
  options: BindingOptions = {},
  maxLength = MAX_PRODUCT_LENGTH,
): Product[] {
  if (!Number.isFinite(maxLength) || maxLength <= 0) throw new ValueError(`maxLength must be a positive number, got ${maxLength}`);
  const names = new Set<string>();
  for (const primer of primers) {
    if (names.has(primer.name)) throw new ValueError(`two primers are both called '${primer.name}'`);
    names.add(primer.name);
  }

  // Find every site once; a primer's forward sites pair with any primer's reverse sites, its own included.
  const sites = primers.map((primer) => ({ primer, sites: findBindingSites(template, topology, primer.sequence, options) }));
  const forwards = sites.flatMap(({ primer, sites: s }) => s.filter((site) => site.strand === "forward").map((site) => ({ primer, site })));
  const reverses = sites.flatMap(({ primer, sites: s }) => s.filter((site) => site.strand === "reverse").map((site) => ({ primer, site })));

  const products: Product[] = [];
  for (const f of forwards) {
    for (const r of reverses) {
      // The product spans both primers in full: from the forward primer's 5' end to the reverse primer's 5' end.
      const candidates: { start: number; end: number; wraps: boolean }[] = [];
      if (r.site.end >= f.site.end) candidates.push({ start: f.site.start, end: r.site.end, wraps: false });
      // On a circle the pair also amplifies the other way round, through the origin.
      if (topology === "circular" && r.site.end < f.site.end) {
        candidates.push({ start: f.site.start, end: r.site.end + template.length, wraps: true });
      }
      for (const { start, end, wraps } of candidates) {
        const length = end - start;
        if (length <= 0 || length > maxLength) continue;
        products.push({
          forward: f.primer.name, reverse: r.primer.name,
          start, end, length, wraps,
          forwardSite: f.site, reverseSite: r.site,
        });
      }
    }
  }

  products.sort((a, b) => a.length - b.length || a.start - b.start || a.forward.localeCompare(b.forward) || a.reverse.localeCompare(b.reverse));
  return products.slice(0, MAX_PRODUCTS);
}

/**
 * The sequence of a product, read off the template.
 *
 * The product is the stretch of template between the primers' 5' ends, so a primer carrying a 5' tail that does not
 * match the template is *not* reflected here. Use {@link productWithTails} for that.
 *
 * @param template - The template the product was predicted from.
 * @param product - A product from {@link predictProducts}.
 * @returns The product's top strand, 5' to 3'.
 */
export function productSequence(template: string, product: Product): string {
  return product.wraps
    ? template.slice(product.start) + template.slice(0, product.end - template.length)
    : template.slice(product.start, product.end);
}

/**
 * The sequence of a product amplified by primers that carry 5' tails.
 *
 * Each primer is copied into the product whole, so the product is the forward primer, then the template between the
 * two primers' binding sites, then the reverse complement of the reverse primer. Where a primer's tail does not match
 * the template, this differs from {@link productSequence} — which is the point of an assembly primer.
 *
 * @param template - The template the product was predicted from.
 * @param product - A product from {@link predictProducts}.
 * @param forwardPrimer - The forward primer's full sequence, tail included.
 * @param reversePrimer - The reverse primer's full sequence, tail included.
 * @returns The product's top strand, 5' to 3'.
 * @throws {@link ValueError} if either primer is shorter than its binding site, which cannot happen for a product
 *   from {@link predictProducts} and means the primers given do not match it.
 */
export function productWithTails(template: string, product: Product, forwardPrimer: string, reversePrimer: string): string {
  const forwardFootprint = product.forwardSite.end - product.forwardSite.start;
  const reverseFootprint = product.reverseSite.end - product.reverseSite.start;
  if (forwardPrimer.length < forwardFootprint) throw new ValueError(`the forward primer is shorter than its ${forwardFootprint}-base binding site`);
  if (reversePrimer.length < reverseFootprint) throw new ValueError(`the reverse primer is shorter than its ${reverseFootprint}-base binding site`);

  const middleStart = product.forwardSite.end;
  const middleEnd = product.reverseSite.start + (product.wraps ? template.length : 0);
  const middle = middleEnd >= template.length
    ? template.slice(middleStart) + template.slice(0, middleEnd - template.length)
    : template.slice(middleStart, middleEnd);

  // The reverse primer appears in the product as its reverse complement, at the far end.
  const complement: Record<string, string> = { A: "T", T: "A", G: "C", C: "G" };
  let tail = "";
  for (let i = reversePrimer.length - 1; i >= 0; i--) tail += complement[reversePrimer[i]!] ?? reversePrimer[i]!;
  return forwardPrimer + middle + tail;
}
