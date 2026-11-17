/**
 * What to do about a host that will not phosphorylate what you asked it to make.
 *
 * `modify.ts` answers the question. This one is about what follows from the answer, and it is a
 * different kind of thing to be careful about. Diagnosing is cheap to be honest about: either the
 * motif is there or it is not, either the host is held to have the enzyme or it is not. Proposing a
 * way round is where a tool can do real damage, because the ways round are not equivalent, the most
 * computable of them is the least likely to work, and a lab that spends a month on the wrong one
 * has spent a month.
 *
 * So two things are kept apart here, and neither pretends to be the other.
 *
 * **The routes** are laid out with what each costs and how firmly it is held, and none of them is
 * recommended. Which one a lab takes depends on what it has — a tissue culture room, a second
 * selection marker, a purified kinase, patience — and nothing here knows that.
 *
 * **The one that can be computed** is the phosphomimetic: replacing each phosphoserine with a
 * glutamate or an aspartate, which carries a negative charge without needing any enzyme at all.
 * That is arithmetic and {@link phosphomimetic} does it exactly. What it is not is a substitute for
 * phosphorylation, and the honest framing is the whole value of the tool: a phosphoserine carries
 * about two negative charges at neutral pH and a glutamate carries one, in a smaller group of a
 * different shape, and for casein the clusters that bind calcium do so in a way that depends on
 * that shape. It is a way of asking whether charge alone is enough. It is not a way of making
 * phosphorylated casein, and a tool that let somebody believe otherwise would be worse than none.
 */
import { ProteinAnalysis } from "@biolibs/seqtools";
import { CODON } from "./codons.js";
import { DA_PER_KDA } from "./induce.js";
import type { HostKinases } from "./modify.js";
import type { Working } from "./pcr-working.js";

/** One way round a host that will not do it. */
export interface Remedy {
  /** Short name, to pick it by. */
  name: string;
  /** What it is, in a sentence or two. */
  what: string;
  /** What it costs the lab: what it needs and what it gives up. */
  costs: string;
  /** How firmly the route is held to work at all. */
  standing: "well established" | "reported" | "worth trying";
  /** Whether anything here can work it out, or it is only described. */
  computable: boolean;
}

/**
 * The ways round a host that will not phosphorylate what it makes, in no order of preference.
 *
 * None is recommended, because which one suits depends on what a lab has — a tissue culture room, a
 * second selection marker, a purified kinase, time — and nothing here knows that. What is said of
 * each is what it costs and how firmly it is held.
 */
export const REMEDIES: readonly Remedy[] = [
  {
    name: "co-express the kinase",
    what: "Put a kinase into the host alongside the protein, so that the cell does the phosphorylating itself. For a secreted protein the kinase has to reach the same compartment the protein passes through, which is the part that usually decides whether it works.",
    costs: "A second construct, a second selection marker, and a second thing that can go wrong. The kinase's own expression has to be got right before anything can be said about the protein's.",
    standing: "reported", computable: false,
  },
  {
    name: "a host that already has it",
    what: "Express it in something that phosphorylates secreted proteins as a matter of course — a mammalian cell line does, which is what makes milk in the first place.",
    costs: "Slow, expensive, and a different set of skills and equipment. It is why almost nobody makes a food protein this way.",
    standing: "well established", computable: false,
  },
  {
    name: "phosphorylate it afterwards",
    what: "Make the protein unphosphorylated, purify it, and treat it with a purified kinase and ATP in a tube.",
    costs: "The kinase has to be bought or made, and the reaction has to be driven to something like completion on a purified protein, which is not the same as a cell doing it as the protein is made.",
    standing: "reported", computable: false,
  },
  {
    name: "a phosphomimetic",
    what: "Change each serine that would have been phosphorylated to a glutamate or an aspartate, which carries a negative charge with no enzyme needed. The gene is rewritten; nothing is added to the cell.",
    costs: "It is not the same molecule. A phosphoserine carries about two negative charges at neutral pH and a glutamate carries one, in a smaller group of a different shape. It asks whether charge alone is enough; it does not make phosphorylated protein.",
    standing: "worth trying", computable: true,
  },
  {
    name: "measure what you actually get",
    what: "Express it, run the gel, and test the thing you care about — whether micelles form, whether calcium is bound — rather than assuming the answer from whether the host has an enzyme.",
    costs: "Nothing beyond the experiment, and it is the only one of these that tells you where you really are rather than where the literature says you probably are.",
    standing: "well established", computable: false,
  },
];

/** One residue swapped for something that carries a charge. */
export interface Swapped {
  /** Where it is, counting from 1 on the protein given. */
  at: number;
  /** What was there, and what it became. */
  was: string;
  now: string;
}

/** A protein with its phosphosites swapped for something charged. */
export interface Phosphomimetic {
  /** The protein, changed. */
  protein: string;
  /** Each residue that changed. */
  swapped: Swapped[];
  /** What was asked for but could not be changed, because that residue is not one that is phosphorylated. */
  notSwapped: { at: number; was: string; why: string }[];
  /** What it weighs before and after, in daltons, and what that is on a gel. */
  weight: { before: number; after: number } | null;
  kilodaltons: { before: number; after: number } | null;
  /** The pH it carries no net charge at, before and after: the figure this changes most. */
  isoelectric: { before: number; after: number } | null;
  /** What a careful person would know before leaning on it. */
  warnings: string[];
  /** Why nothing could be done, or `null`. */
  problem: string | null;
}

/** What may stand in for a phosphoserine, and how far it gets. */
const INSTEAD: Readonly<Record<string, { charge: number; says: string }>> = {
  E: { charge: 1, says: "glutamate: one negative charge, and the longer of the two side chains" },
  D: { charge: 1, says: "aspartate: one negative charge, and the shorter side chain" },
};

/** Which residues are phosphorylated at all. */
const PHOSPHORYLATED = new Set(["S", "T", "Y"]);

/**
 * Swap each named residue for something that carries a negative charge.
 *
 * @param protein - The amino acids.
 * @param sites - Where the phosphosites are, counting from 1 on that sequence.
 * @param options - `instead` is what to put there, `E` unless said.
 * @returns The changed protein, what it changed, and what it does and does not reproduce.
 *
 * @example
 * ```ts
 * import { phosphomimetic } from "@biolibs/bionet-tools";
 *
 * const asked = phosphomimetic(casein, [15, 17, 18, 19, 35]);
 * asked.isoelectric;    // what the change really does: the charge, not the shape
 * ```
 */
export function phosphomimetic(protein: string, sites: readonly number[], options: { instead?: "E" | "D" } = {}): Phosphomimetic {
  const chain = protein.replace(/\s+/g, "").toUpperCase();
  const nothing = (problem: string): Phosphomimetic =>
    ({ protein: chain, swapped: [], notSwapped: [], weight: null, kilodaltons: null, isoelectric: null, warnings: [], problem });
  if (chain === "") return nothing("There is no protein here to change.");
  if (!/^[ACDEFGHIKLMNPQRSTVWY]+$/.test(chain)) return nothing("That is written in letters that are not the twenty standard amino acids.");
  const instead = options.instead ?? "E";
  if (!Object.hasOwn(INSTEAD, instead)) return nothing("A phosphomimetic is a glutamate or an aspartate.");
  if (sites.length === 0) return nothing("No sites were given, so there is nothing to change.");

  const letters = [...chain];
  const swapped: Swapped[] = [];
  const notSwapped: Phosphomimetic["notSwapped"] = [];
  for (const at of [...new Set(sites)].sort((a, b) => a - b)) {
    const was = letters[at - 1];
    if (was === undefined) { notSwapped.push({ at, was: "", why: `This protein has ${chain.length} residues, so there is nothing at ${at}.` }); continue; }
    if (!PHOSPHORYLATED.has(was)) { notSwapped.push({ at, was, why: `${was}${at} is not a serine, a threonine or a tyrosine, so it was never phosphorylated.` }); continue; }
    letters[at - 1] = instead;
    swapped.push({ at, was, now: instead });
  }
  const changed = letters.join("");

  const figures = (one: string): { weight: number; isoelectric: number } | null => {
    try { const analysis = new ProteinAnalysis(one); return { weight: analysis.molecularWeight(), isoelectric: analysis.isoelectricPoint() }; }
    catch { return null; }
  };
  const before = figures(chain);
  const after = figures(changed);

  const warnings: string[] = [];
  if (swapped.length > 0) {
    warnings.push(`A phosphoserine carries about two negative charges at the pH of a cell; ${INSTEAD[instead]!.says}. So this reproduces something like half the charge, and none of the shape.`);
    warnings.push("Where phosphoserines sit in a cluster and bind calcium between them — which is what makes casein build a micelle — the geometry matters as much as the charge, and a glutamate does not have it.");
    warnings.push("Treat this as a way of asking whether charge alone is enough, and as something to compare against the real thing rather than to stand in for it.");
  }
  if (swapped.length > 0 && notSwapped.length > 0) warnings.push(`${notSwapped.length} of the sites given could not be changed; they are listed.`);

  return {
    protein: changed, swapped, notSwapped,
    weight: before === null || after === null ? null : { before: before.weight, after: after.weight },
    kilodaltons: before === null || after === null ? null : { before: before.weight / DA_PER_KDA, after: after.weight / DA_PER_KDA },
    isoelectric: before === null || after === null ? null : { before: before.isoelectric, after: after.isoelectric },
    warnings,
    problem: swapped.length === 0 && notSwapped.length > 0 ? "None of the sites given is a residue that is phosphorylated." : null,
  };
}

/** A gene rewritten so that it encodes a phosphomimetic. */
export interface MimeticGene {
  /** The bases, changed. */
  sequence: string;
  /** Each codon that changed, by the amino acid it is, counting codons from 1. */
  changed: { codon: number; was: string; now: string; aminoAcid: string }[];
  /** Why nothing could be done, or `null`. */
  problem: string | null;
}

/**
 * Rewrite a coding sequence so that it encodes a phosphomimetic.
 *
 * The protein is what matters; this is how you get a lab something it can order. Each named codon is
 * replaced with one for the substitute, and which codon that is can be the host's commonest, so that
 * what comes out is as readable to the host as what went in.
 *
 * @param cds - The coding sequence, a whole number of codons.
 * @param sites - Where the phosphosites are, counting amino acids from 1.
 * @param options - `instead` is what to encode, `E` unless said; `codon` picks the codon to use for
 *   it, which `optimiseCodons` can choose from a host's own usage.
 * @returns The gene, and what changed.
 *
 * @example
 * ```ts
 * import { mimeticGene } from "@biolibs/bionet-tools";
 *
 * mimeticGene(casein, [15, 17, 18, 19, 35], { codon: "GAA" }).sequence;
 * ```
 */
export function mimeticGene(cds: string, sites: readonly number[], options: { instead?: "E" | "D"; codon?: string } = {}): MimeticGene {
  const bases = cds.replace(/\s+/g, "").toUpperCase();
  if (!/^[ACGT]+$/.test(bases)) return { sequence: bases, changed: [], problem: "A gene to rewrite is written in A, C, G and T, with no uncertain bases." };
  if (bases.length % CODON !== 0) return { sequence: bases, changed: [], problem: `That is ${bases.length} bases, which is not a whole number of codons.` };
  const instead = options.instead ?? "E";
  // The commonest codon for each, where the caller does not pick one from a host's own usage.
  const usual: Readonly<Record<string, string>> = { E: "GAA", D: "GAT" };
  const codon = (options.codon ?? usual[instead] ?? "GAA").toUpperCase();
  if (!/^[ACGT]{3}$/.test(codon)) return { sequence: bases, changed: [], problem: "A codon is three bases of A, C, G and T." };

  const codons = bases.match(/.{3}/g) ?? [];
  const changed: MimeticGene["changed"] = [];
  for (const at of [...new Set(sites)].sort((a, b) => a - b)) {
    const was = codons[at - 1];
    if (was === undefined || was === codon) continue;
    codons[at - 1] = codon;
    changed.push({ codon: at, was, now: codon, aminoAcid: instead });
  }
  return { sequence: codons.join(""), changed, problem: null };
}

/**
 * The routes open to a lab whose host will not do it, with what each costs.
 *
 * @param host - What is held about the host, from `hostPhosphorylation`, or `null` if it is not known.
 * @returns The routes, and a line about where they came from.
 */
export function remediesFor(host: HostKinases | null): { routes: Remedy[]; says: string[] } {
  const says: string[] = [];
  if (host === null) {
    says.push("Nothing here says what this host does, which is not the same as its doing nothing. Find out before choosing a way round something that may not be a problem.");
  } else if (host.secretoryKinase === "yes") {
    says.push(`${host.host} is held to have the kinase, so there may be nothing to work round. Measure what you get before changing anything.`);
  } else {
    says.push(`${host.host}: ${host.says}`);
    says.push("None of these is recommended over another. Which suits depends on what the lab has, which nothing here knows.");
  }
  return { routes: [...REMEDIES], says };
}

/**
 * The working behind a phosphomimetic: what changed, and what it does and does not reproduce.
 *
 * @param made - What `phosphomimetic` gave.
 * @returns The workings. Empty if nothing could be changed.
 */
export function phosphomimeticWorking(made: Phosphomimetic): Working[] {
  if (made.problem !== null || made.swapped.length === 0) return [];
  const round = (value: number): string => value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const out: Working[] = [{
    of: "what the swap changes",
    comes: made.isoelectric === null ? `${made.swapped.length} residues` : `pH ${made.isoelectric.before.toFixed(2)} → ${made.isoelectric.after.toFixed(2)}`,
    kind: "exact",
    steps: [
      `${made.swapped.length} ${made.swapped.length === 1 ? "residue" : "residues"} changed: ${made.swapped.map((one) => `${one.was}${one.at}${one.now}`).join(", ")}.`,
      ...(made.weight === null ? [] : [`The weight goes from ${round(made.weight.before)} to ${round(made.weight.after)} Da, which is ${round(Math.abs(made.weight.after - made.weight.before))} Da and not something a gel will show.`]),
      ...(made.isoelectric === null ? [] : [`The pH it carries no net charge at goes from ${made.isoelectric.before.toFixed(2)} to ${made.isoelectric.after.toFixed(2)}. That is the figure this really changes, and it is why a mimetic is worth trying at all.`]),
    ],
    rests: "What is computed here is the sequence and what the sequence comes to. Whether a glutamate does the job a phosphoserine did is not a question a sequence can answer: it carries about half the charge, in a smaller group of a different shape, and where a cluster of phosphoserines binds calcium the shape is part of the work. This is a way of asking whether charge alone is enough.",
  }];
  return out;
}
