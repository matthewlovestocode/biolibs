/**
 * PCR: a template and two primers, and the piece between where they bind.
 *
 * A PCR is an assembly like any other here — the primers are fragments, and where a primer binds the
 * template is an overlap — with two differences. The overlap finder allows mismatches, since a primer
 * need not match perfectly to bind, and only the primer's 3' end has to match at all. And the product's
 * ends come from the primers, tails and all, not from the template.
 */

import { ValueError } from "@biolibs/core";
import { Dseq } from "@biolibs/dseq";
import type { Dseqrecord } from "@biolibs/dseqrecord";
import type { Overlap } from "./algorithms.js";
import { type EdgeAssembly, annotatePrimerBindingSites, withSeq } from "./assemble.js";
import { type Fragment, isCircularFragment, textOf } from "./fragment.js";
import { Assembly, NotImplementedError } from "./assembly.js";
import { Primer } from "./primer.js";
import { type AssemblySource, SOURCE_KINDS } from "./source.js";

/** What a primer or template looks like once it is ready to be searched: upper case, DNA, circles doubled. */
export function uppercaseDnaString(record: Fragment): string {
  const text = textOf(record).toUpperCase().replaceAll("U", "T");
  // A primer is not a molecule, so it is never doubled, however the template is read.
  return isCircularFragment(record) ? text + text : text;
}

/**
 * Grow a match leftwards, as far as the two sequences keep agreeing.
 *
 * This is how a primer that matches further than it had to gets credit for it, and how one with a
 * mismatch has its match cut back to the part that really binds.
 *
 * @param x - The first sequence. @param y - The second. @param match - Where to start from, at its right-hand edge.
 * @returns The match, grown or shrunk.
 * @example
 * ```ts
 * zipMatchLeftwards(new Dseqrecord("AAAAACGTCCCGT"), new Dseqrecord("ACGTCCCGT"), [13, 9, 0]);   // [4, 0, 9]
 * ```
 */
export function zipMatchLeftwards(x: Fragment, y: Fragment, match: Overlap): Overlap {
  const textX = uppercaseDnaString(x);
  const textY = uppercaseDnaString(y);
  // On a circle the match may run back past the origin, so it is read on the doubled copy and brought back.
  let endX = match[0] + match[2];
  if (isCircularFragment(x) && endX <= x.length) endX += x.length;
  let endY = match[1] + match[2];
  if (isCircularFragment(y) && endY <= y.length) endY += y.length;
  let count = 0;
  while (count < endX && count < endY && textX[endX - count - 1] === textY[endY - count - 1]) count += 1;
  return [mod(endX - count, x.length), mod(endY - count, y.length), count];
}

/**
 * Grow a match rightwards, as far as the two sequences keep agreeing.
 *
 * @param x - The first sequence. @param y - The second. @param match - Where to start from, at its left-hand edge.
 * @returns The match, grown or shrunk.
 */
export function zipMatchRightwards(x: Fragment, y: Fragment, match: Overlap): Overlap {
  const textX = uppercaseDnaString(x);
  const textY = uppercaseDnaString(y);
  const [startX, startY] = match;
  let count = 0;
  while (startX + count < textX.length && startY + count < textY.length
         && textX[startX + count] === textY[startY + count]) count += 1;
  return [startX, startY, count];
}

/** @param value - A number. @param by - The divisor. @returns Python's remainder. */
const mod = (value: number, by: number): number => ((value % by) + by) % by;

/**
 * Where a primer binds a template, allowing mismatches.
 *
 * One of the two must be a primer and the other a template. A primer passed first is a forward primer;
 * a primer passed second is a reverse primer, given as its own reverse complement.
 *
 * @param x - The primer, or the template. @param y - The other.
 * @param limit - How many bases at the primer's 3' end must be found.
 * @param mismatches - How many of those may differ.
 * @returns Every place it binds, in order.
 * @throws `ValueError` unless one is a primer and the other is not.
 */
export function primerTemplateOverlap(x: Fragment, y: Fragment, limit = 25, mismatches = 0): Overlap[] {
  const xIsPrimer = x instanceof Primer;
  const yIsPrimer = y instanceof Primer;
  if (xIsPrimer === yIsPrimer) throw new ValueError("One of the sequences must be a primer and the other a Dseqrecord");
  const primer = (xIsPrimer ? x : y) as Primer;
  const template = xIsPrimer ? y : x;
  const reverse = yIsPrimer;
  if (primer.length < limit) return [];

  const subject = uppercaseDnaString(template);
  // A reverse primer is read from its own start, a forward one from its 3' end: that is the part that binds.
  const query = uppercaseDnaString(reverse ? primer.slice(0, limit) : primer.slice(primer.length - limit));
  const found = new Map<string, Overlap>();
  for (let start = 0; start + query.length <= subject.length; start++) {
    if (start >= template.length) continue;
    let wrong = 0;
    for (let at = 0; at < query.length && wrong <= mismatches; at++) {
      if (subject[start + at] !== query[at]) wrong += 1;
    }
    if (wrong > mismatches) continue;
    const grown = reverse
      ? zipMatchRightwards(template, primer, [start, 0, query.length])
      : zipMatchLeftwards(primer, template, [primer.length - limit, start, query.length]);
    found.set(String(grown), grown);
  }
  return [...found.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
}

/**
 * Mirrors `pydna.assembly2.PCRAssembly`: an assembly of exactly primer, template, primer.
 *
 * @example
 * ```ts
 * new PCRAssembly([forward, template, reverse], 14).assembleLinear();   // the products
 * ```
 */
export class PCRAssembly extends Assembly {
  /** How many bases of a primer may differ from the template. */
  readonly mismatches: number;

  /**
   * @param fragments - The forward primer, the template and the reverse primer, in that order.
   * @param limit - How many bases at a primer's 3' end must be found.
   * @param mismatches - How many of those may differ.
   * @throws `ValueError` if the three are not a primer, a template and a primer.
   */
  constructor(fragments: readonly Fragment[], limit = 25, mismatches = 0) {
    const wrong = new ValueError("PCRAssembly assembly must be initialised with a list/tuple of primer, template, primer");
    if (fragments.length !== 3) throw wrong;
    if (!(fragments[0] instanceof Primer) || fragments[1] instanceof Primer || !(fragments[2] instanceof Primer)) throw wrong;
    super(fragments, limit, (x, y, lim) => primerTemplateOverlap(x, y, lim ?? 25, mismatches), false, true, "primer_template_overlap");
    this.mismatches = mismatches;
  }

  /**
   * Only a primer against the template, and only the way round a PCR can run.
   *
   * This runs from the base class's constructor, before this class's own fields are set, so it leans
   * only on what the base class has already filled in. The mismatch count it needs is carried in the
   * overlap finder itself.
   */
  protected override buildGraph(): void {
    for (let i = 1; i <= 3; i++) this.graph.addNode(i);
    for (let i = 1; i <= 3; i++) this.graph.addNode(-i);
    const pairs: [number, number][] = [[1, 2], [1, -2], [3, 2], [3, -2], [2, -1], [2, -3], [-2, -1], [-2, -3]];
    for (const [u, v] of pairs) {
      const first = this.sequenceOf(u);
      const second = this.sequenceOf(v);
      for (const match of this.algorithm(first as never, second as never, this.limit)) {
        this.addEdgesFromMatch(match, u, v, first, second);
      }
    }
  }

  /** @param onlyAdjacentEdges - Not supported. @param maxAssemblies - The limit. @returns The assemblies. */
  override getLinearAssemblies(onlyAdjacentEdges = false, maxAssemblies = 50): EdgeAssembly[] {
    if (onlyAdjacentEdges) throw new NotImplementedError("only_adjacent_edges not implemented for PCR assemblies");
    return super.getLinearAssemblies(false, maxAssemblies);
  }

  /** @returns Never: a PCR makes a linear product. @throws `NotImplementedError` always. */
  override getCircularAssemblies(): EdgeAssembly[] {
    throw new NotImplementedError("get_circular_assemblies not implemented for PCR assemblies");
  }

  /** @returns Never. @throws `NotImplementedError` always. */
  override getInsertionAssemblies(): EdgeAssembly[] {
    throw new NotImplementedError("get_insertion_assemblies not implemented for PCR assemblies");
  }

  /**
   * The products, with each one's far end replaced by the reverse primer.
   *
   * The template only tells you where the primers sat; what is actually made carries the primers
   * themselves, including any tail that does not match the template.
   *
   * @param onlyAdjacentEdges - Not supported. @param maxAssemblies - The limit.
   * @returns The products.
   */
  override assembleLinear(onlyAdjacentEdges = false, maxAssemblies = 50): Dseqrecord[] {
    const products = super.assembleLinear(onlyAdjacentEdges, maxAssemblies);
    const reverse = this.fragments[2]!;
    return products.map((product) => {
      const kept = product.dseq.slice(0, product.length - reverse.length);
      const tail = new Dseq(reverseComplementText(textOf(reverse)));
      return withSeq(product, kept.add(tail) as Dseq);
    });
  }
}

/** @param text - Some DNA. @returns Its reverse complement, keeping the case. */
function reverseComplementText(text: string): string {
  const table: Record<string, string> = { a: "t", c: "g", g: "c", t: "a", u: "a" };
  return [...text].reverse().map((base) => {
    const lower = base.toLowerCase();
    const mapped = table[lower] ?? lower;
    return base === lower ? mapped : mapped.toUpperCase();
  }).join("");
}

/**
 * Run a PCR: the piece of the template between where the two primers bind, carrying the primers' own ends.
 *
 * @param template - What is being copied.
 * @param forward - The primer that binds the upper strand.
 * @param reverse - The primer that binds the lower one.
 * @param addPrimerFeatures - Whether to mark where the primers sat on the product.
 * @param limit - How many bases at a primer's 3' end must be found.
 * @param mismatches - How many of those may differ.
 * @returns The products.
 * @example
 * ```ts
 * pcrAssembly(plasmid, forward, reverse);   // every piece those two primers make
 * ```
 */
export function pcrAssembly(template: Fragment, forward: Primer, reverse: Primer, addPrimerFeatures = false,
                            limit = 14, mismatches = 0): Dseqrecord[] {
  const fragments: Fragment[] = [forward, template, reverse];
  const assembly = new PCRAssembly(fragments, limit + mismatches, mismatches);
  let products = assembly.assembleLinear();
  // With the same primer at both ends, each product would otherwise be reported twice, once per strand.
  if (textOf(forward).toUpperCase() === textOf(reverse).toUpperCase()) {
    products = products.filter((product) => !(product.source as AssemblySource).input[1]!.reverseComplemented);
  }
  if (addPrimerFeatures) products = products.map((product) => annotatePrimerBindingSites(product, fragments));
  for (const product of products) {
    product.source = (product.source as AssemblySource).recast(SOURCE_KINDS.pcr, { addPrimerFeatures });
  }
  return products;
}
