/**
 * The working behind what a PCR tool says: each figure, with the steps that give it.
 *
 * Everything the tool says is worked out in the window, from the lab's own sequences. Nothing is
 * looked up and nothing comes back from a server. So it can all be shown: which bases a primer
 * matched, the count behind a melting temperature, the subtraction behind a length. Somebody who
 * doubts a figure can follow it, and somebody learning can see where it comes from.
 *
 * Some of this is exact and some is a rule of thumb, and each piece says which. That a primer's
 * bases match the template's is a fact about two sequences. That it melts at 58 °C is an estimate
 * from a simple rule, and a different rule would give a different figure.
 */
import type { PartFeature } from "@biolibs/bionet";
import { primerTm } from "./pcr.js";
import { SECONDS_PER_KB, strandCounts, type Binding, type PcrProgramme, type PcrReaction } from "./pcr-scene.js";

/** One figure, and how it was reached. */
export interface Working {
  /** What was worked out, in a few words. */
  of: string;
  /** What it came to. */
  comes: string;
  /** `exact` if it follows from the sequences alone; `estimate` if it rests on a rule that could have been another. */
  kind: "exact" | "estimate";
  /** The steps, in order. Each can be checked by hand. */
  steps: string[];
  /** For an estimate, what it rests on and how far to trust it. */
  rests?: string;
}

const count = (value: number): string => value.toLocaleString("en-US");
const clean = (bases: string): string => bases.replace(/\s+/g, "").toUpperCase();
const PAIR: Readonly<Record<string, string>> = { A: "T", T: "A", G: "C", C: "G", N: "N" };

/**
 * A primer's melting temperature, with the count behind it.
 *
 * @param name - What the primer is called.
 * @param sequence - Its bases.
 * @returns The working, or `null` if that is not a sequence the rule can be applied to.
 *
 * @example
 * ```ts
 * import { tmWorking } from "@biolibs/bionet-tools";
 *
 * tmWorking("fwd", "GGATCACAGTCTACACTG")?.steps;
 * // ["9 of its 18 bases are A or T, and 9 are G or C.", "2 × 9 + 4 × 9 = 54 °C."]
 * ```
 */
export function tmWorking(name: string, sequence: string): Working | null {
  const bases = clean(sequence);
  const tm = primerTm(bases);
  if (tm === null) return null;
  const weak = [...bases].filter((base) => base === "A" || base === "T" || base === "W").length;
  const strong = [...bases].filter((base) => base === "G" || base === "C" || base === "S").length;
  return {
    of: `${name}'s melting temperature`, comes: `about ${Math.round(tm)} °C`, kind: "estimate",
    steps: [
      `${count(weak)} of its ${count(bases.length)} bases are A or T, and ${count(strong)} are G or C.`,
      `2 × ${weak} + 4 × ${strong} = ${2 * weak + 4 * strong} °C.`,
    ],
    rests: "The Wallace rule: an A·T pair holds with two bonds and a G·C pair with three, so each is given 2 °C or 4 °C. It ignores salt, how much primer there is and which bases are neighbours, and is rough past about 20 bases. It is good for seeing that two primers are near each other.",
  };
}

/** One place along a primer laid against the template: the primer's base, the base it faces, and whether they pair. */
export interface FacedBase {
  /** The primer's base here. */
  primer: string;
  /** The base of the strand it binds that faces it, or `""` where the template has run out. */
  faces: string;
  /** Whether the two pair: A with T, G with C. */
  pairs: boolean;
  /** Whether this base is one of those at the 3′ end that must pair for the primer to bind. */
  needed: boolean;
}

/** A primer laid against the strand it binds, base by base. */
export interface BindingWorking extends Working {
  /** The primer 5′ to 3′, each base with the one it faces. */
  faced: FacedBase[];
  /** Which strand it binds. */
  strand: "top" | "bottom";
  /** Where on the template it sits, counting bases from 1 as a sequence file does. */
  from: number;
  to: number;
}

/**
 * A primer laid against the strand it binds, to show that it does.
 *
 * @param template - The template's top strand.
 * @param primer - What the primer is called, and its bases 5′ to 3′.
 * @param binding - Where it binds, from `primerBinding`.
 * @param least - How many bases at its 3′ end must pair.
 * @returns Each of the primer's bases with the base it faces, and what that shows.
 */
export function bindingWorking(template: string, primer: { name: string; sequence: string }, binding: Binding, least: number): BindingWorking {
  const top = clean(template);
  const bases = clean(primer.sequence);
  const bound = bases.length - binding.tail;
  // A primer that reads as the top strand binds the bottom one, and the other way about. Walking the
  // primer 5′ to 3′ walks the template rightwards for the first and leftwards for the second.
  const faced = [...bases].map((base, at): FacedBase => {
    const along = at - binding.tail;
    const place = binding.reads === "top" ? binding.start + along : binding.end - 1 - along;
    const there = along < 0 || place < 0 || place >= top.length ? "" : top[place]!;
    const faces = there === "" ? "" : binding.reads === "top" ? PAIR[there] ?? "N" : there;
    return { primer: base, faces, pairs: faces !== "" && PAIR[base] === faces, needed: at >= bases.length - least };
  });
  const paired = faced.filter((one) => one.pairs).length;
  const end = faced.slice(-least);
  // Every place the 3′ end could sit, on either strand: binding in one place only is part of what is claimed.
  const flipped = [...bases].reverse().map((base) => PAIR[base] ?? "N").join("");
  const sites = (needle: string): number => { let found = 0; for (let at = top.indexOf(needle); at !== -1; at = top.indexOf(needle, at + 1)) found++; return found; };
  const places = sites(bases.slice(-least)) + sites(flipped.slice(0, least));
  return {
    of: `where ${primer.name} binds`, kind: "exact", faced, strand: binding.reads === "top" ? "bottom" : "top",
    from: binding.start + 1, to: binding.end,
    comes: `bases ${count(binding.start + 1)} to ${count(binding.end)}, on the ${binding.reads === "top" ? "bottom" : "top"} strand`,
    steps: [
      `The last ${least} bases at its 3′ end ${end.every((one) => one.pairs) ? "each pair with the base they face" : "do not all pair"}. That is what the polymerase needs to start from.`,
      `${count(paired)} of its ${count(bases.length)} bases pair in all${binding.tail === 0 ? "." : `. The first ${binding.tail} at its 5′ end do not: they are a tail, and are carried onto the product.`}`,
      `Those ${least} bases are found in ${places === 1 ? "one place only" : `${places} places`} on the template, counting both strands.`,
      `It has the ${binding.reads} strand's sequence, so it binds the ${binding.reads === "top" ? "bottom" : "top"} strand and is copied ${binding.reads === "top" ? "rightwards" : "leftwards"}.`,
    ],
  };
}

/**
 * How long the product is, as arithmetic on where the primers bind.
 *
 * This is worked out separately from the engine that makes the product, so the two can be compared.
 *
 * @param top - Where the primer that reads as the top strand binds.
 * @param bottom - Where the other binds.
 * @param template - How long the template is, and whether it is a circle.
 * @param made - How long the engine's product is, to compare with.
 * @returns The working.
 */
export function lengthWorking(top: Binding, bottom: Binding, template: { length: number; circular: boolean }, made?: number): Working {
  const straight = bottom.end > top.start;
  const copied = straight ? bottom.end - top.start : template.length - top.start + bottom.end;
  const total = top.tail + copied + bottom.tail;
  const steps = [
    straight
      ? `The copy runs from base ${count(top.start + 1)}, where one primer starts, to base ${count(bottom.end)}, where the other ends: ${count(bottom.end)} − ${count(top.start + 1)} + 1 = ${count(copied)}.`
      : `The template is a circle and the copy runs through its origin: from base ${count(top.start + 1)} to the end is ${count(template.length - top.start)}, and from the start to base ${count(bottom.end)} is ${count(bottom.end)}, so ${count(copied)}.`,
    ...(top.tail + bottom.tail === 0 ? [] : [`The primers' tails are added at the ends: ${count(copied)} + ${top.tail} + ${bottom.tail} = ${count(total)}.`]),
    ...(made === undefined ? [] : [made === total ? `The engine that builds the product, working it out its own way, also gives ${count(made)}.` : `The engine that builds the product gives ${count(made)}, which does not agree. Trust neither until that is understood.`]),
  ];
  return { of: "the product's length", comes: `${count(total)} bp`, kind: "exact", steps };
}

/**
 * Where the suggested programme's two figures come from.
 *
 * @param reaction - The product's length and the primers' melting temperatures.
 * @param programme - The programme suggested for it.
 * @returns The working for the annealing temperature and for the extension time.
 */
export function programmeWorking(reaction: PcrReaction, programme: PcrProgramme): Working[] {
  const sorted = [...reaction.primers].sort((a, b) => a.tm - b.tm);
  const coolest = sorted[0];
  const [, anneal, extend] = programme.steps;
  const wanted = (reaction.length / 1000) * SECONDS_PER_KB;
  const under = coolest === undefined ? null : Math.round(coolest.tm) - 5;
  return [
    ...(coolest === undefined || under === null ? [] : [{
      of: "the annealing temperature suggested", comes: `${anneal.celsius} °C`, kind: "estimate" as const,
      steps: [
        `The cooler primer is ${coolest.name}, at about ${Math.round(coolest.tm)} °C.`,
        `Five degrees under it: ${Math.round(coolest.tm)} − 5 = ${under} °C${under === anneal.celsius ? "." : `, kept between 45 and 72, so ${anneal.celsius} °C.`}`,
      ],
      rests: "Five under the cooler primer is a convention. It rests on the melting temperatures, which are estimates themselves, so it is where to start and not where to stop.",
    }]),
    {
      of: "the extension time suggested", comes: `${extend.seconds} s`, kind: "estimate" as const,
      steps: [
        `${count(reaction.length)} bases at a minute for every thousand: ${count(reaction.length)} ÷ 1,000 × ${SECONDS_PER_KB} = ${Math.round(wanted * 10) / 10} s.`,
        `Rounded up to the next 5 s, and never under 15: ${extend.seconds} s.`,
      ],
      rests: "A minute for every thousand bases suits an ordinary polymerase. A fast one needs a quarter of that, and its maker says so.",
    },
  ];
}

/**
 * How many strands a tube holds after each cycle, as a table that can be followed down.
 *
 * @param cycles - How many cycles the programme runs.
 * @returns The working, and a row for each of the first cycles and for the last.
 */
export function countsWorking(cycles: number): Working & { rows: { cycle: number; template: number; long: number; product: number; total: number }[] } {
  const last = Math.max(0, Math.floor(cycles));
  const shown = [...new Set([0, 1, 2, 3, 4, 5, last].filter((one) => one <= last))];
  const rows = shown.map((cycle) => { const at = strandCounts(cycle); return { cycle, ...at, total: at.template + at.long + at.product }; });
  const end = strandCounts(last);
  return {
    of: `how many strands there are after ${last} cycles`, comes: `${count(end.product)} of the product`, kind: "estimate", rows,
    steps: [
      "Every cycle copies every strand once, so the number of strands doubles: 2, 4, 8, and after n cycles 2 × 2ⁿ.",
      "The template's two strands are only ever copied, never made: 2.",
      "Each cycle copies those two into two strands that start at a primer and run on too far: 2 × n.",
      `Everything else is the product: 2 × 2ⁿ − 2n − 2. After ${last} cycles, ${count(2 * 2 ** last)} − ${count(2 * last)} − 2 = ${count(end.product)}.`,
    ],
    rests: "The counting is exact for a tube in which every strand is copied every cycle. A real one falls behind as primers and nucleotides run low, usually after 25 to 30 cycles, so the real figure is lower.",
  };
}

/**
 * How each feature on the product was carried from the template, one line for each.
 *
 * @param features - What is marked on the template.
 * @param from - Where the stretch copied starts.
 * @param to - Where it stops.
 * @param shift - How many bases precede it on the product: the forward primer's tail.
 * @returns A line for each feature that touches the stretch, with the subtraction that moved it.
 */
export function carriedWorking(features: readonly PartFeature[], from: number, to: number, shift = 0): string[] {
  return features.flatMap((feature) => feature.parts.flatMap((piece) => {
    const [start, end] = [Math.max(piece.start, from), Math.min(piece.end, to)];
    if (end <= start) return [];
    const cut = start !== piece.start || end !== piece.end;
    return [`${feature.label}: ${count(piece.start + 1)}..${count(piece.end)} on the template${cut ? `, of which ${count(start + 1)}..${count(end)} is copied` : ""}. `
      + `Less the ${count(from)} bases before the copy${shift === 0 ? "" : ` and plus the tail's ${shift}`}: ${count(start - from + shift + 1)}..${count(end - from + shift)} on the product.`];
  }));
}
