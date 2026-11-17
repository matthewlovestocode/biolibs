/**
 * Codon optimisation: writing the same protein in the codons a host actually uses.
 *
 * Every amino acid but methionine and tryptophan has more than one codon, and an organism uses them
 * unevenly. A bovine gene written in bovine codons is read slowly by yeast, which is why a casein
 * expressed as it comes out of the cow gives poor yields. Optimising rewrites the gene in the
 * host's own preferences without changing one amino acid of what it makes.
 *
 * **Where the preferences come from matters more than the optimising.** There is no table of codon
 * usage built into this package, and none is asserted from memory: a table is counted here, from
 * coding sequences the lab supplies — the host's own genes, fetched and kept like anything else.
 * That makes it checkable. The counts are shown, the number of genes they came from is shown, and
 * a table counted over too few genes says so. A table is only as good as what went into it, and
 * nothing here pretends otherwise.
 *
 * The genetic code itself is not counted but read, from the NCBI tables in `@biolibs/seq`.
 */
import { CodonTable, translate } from "@biolibs/seq";
import type { Working } from "./pcr-working.js";

/** How many bases a codon is. */
export const CODON = 3;

/** Fewer coding sequences than this, and a table is too thin to lean on. */
export const FEW_GENES = 5;

/** Fewer codons than this for one amino acid, and its preference is not worth much. */
export const FEW_CODONS = 20;

/** The longest run of one base an optimised sequence is allowed to make. */
export const LONGEST_RUN = 6;

/** What one codon was counted as. */
export interface CodonCount {
  /** The amino acid it codes for. */
  aminoAcid: string;
  /** How many times it appeared. */
  count: number;
  /** Its share of the codons for that amino acid, from 0 to 1. */
  share: number;
}

/** How a host uses its codons, counted from its own genes. */
export interface CodonUsage {
  /** Which NCBI genetic code it was read with. */
  table: number;
  /** What the sequences were said to be of, for saying where this came from. Never asserted here. */
  from: string;
  /** How many coding sequences were counted. */
  genes: number;
  /** How many codons in all. */
  codons: number;
  /** Each sense codon, with its count and its share of its amino acid. */
  counts: Record<string, CodonCount>;
  /** Anything about the counting worth knowing before leaning on it. */
  warnings: string[];
}

/** One codon that was changed. */
export interface CodonChange {
  /** Which codon of the gene it is, counting from 1. */
  at: number;
  /** The amino acid, unchanged. */
  aminoAcid: string;
  /** What it was, and that codon's share in the host. */
  from: string;
  fromShare: number;
  /** What it became, and that codon's share. */
  to: string;
  toShare: number;
  /** Why, if the host's favourite was not taken. */
  instead: string | null;
}

/** A gene rewritten in a host's codons. */
export interface CodonOptimised {
  /** The rewritten sequence. */
  sequence: string;
  /** The protein, which is the same before and after. This is checked, not assumed. */
  protein: string;
  /** Every codon that changed. */
  changes: CodonChange[];
  /** How many codons there are in all. */
  codons: number;
  /** The GC content before and after, from 0 to 1. */
  gcBefore: number;
  gcAfter: number;
  /** Sites that were kept out of the sequence, by name. */
  avoided: string[];
  /** Anything a careful person would look at. */
  warnings: string[];
  /** Why it could not be done, or `null`. */
  problem: string | null;
}

const clean = (bases: string): string => bases.replace(/\s+/g, "").toUpperCase();
const gc = (bases: string): number => (bases.length === 0 ? 0 : [...bases].filter((one) => one === "G" || one === "C").length / bases.length);
const share = (value: number): string => `${Math.round(value * 100)}%`;

/** The genetic code, as the codons for each amino acid. */
function synonyms(table: number): { forward: Map<string, string>; byAminoAcid: Map<string, string[]>; stops: string[] } {
  const code = CodonTable.unambiguousDnaById.get(table);
  if (code === undefined) throw new Error(`There is no NCBI genetic code numbered ${table}.`);
  const forward = new Map<string, string>();
  const byAminoAcid = new Map<string, string[]>();
  for (const [codon, aminoAcid] of code.forwardTable as unknown as Iterable<[string, string]>) {
    forward.set(codon, aminoAcid);
    byAminoAcid.set(aminoAcid, [...(byAminoAcid.get(aminoAcid) ?? []), codon]);
  }
  return { forward, byAminoAcid, stops: [...code.stopCodons] };
}

/**
 * Count how a host uses its codons, from its own coding sequences.
 *
 * @param genes - The coding sequences, each a whole number of codons. Anything else is left out and said so.
 * @param options - `from` says where the genes came from, which is kept with the table; `table` is
 *   the NCBI genetic code, 1 unless said.
 * @returns The table, with the counts it was made of.
 *
 * @example
 * ```ts
 * import { countCodonUsage } from "@biolibs/bionet-tools";
 *
 * const usage = countCodonUsage([geneOne, geneTwo], { from: "12 Pichia pastoris genes" });
 * usage.counts["CTG"]?.share;    // how much of this host's leucine is CTG
 * ```
 */
export function countCodonUsage(genes: readonly string[], options: { from?: string; table?: number } = {}): CodonUsage {
  const table = options.table ?? 1;
  const { forward, byAminoAcid } = synonyms(table);
  const counts: Record<string, CodonCount> = {};
  for (const [codon, aminoAcid] of forward) counts[codon] = { aminoAcid, count: 0, share: 0 };
  const warnings: string[] = [];
  let used = 0;
  let codons = 0;
  for (const [at, gene] of genes.entries()) {
    const bases = clean(gene);
    if (bases.length < CODON || bases.length % CODON !== 0) {
      warnings.push(`Sequence ${at + 1} is ${bases.length} bases, which is not a whole number of codons, so it was left out.`);
      continue;
    }
    if (!/^[ACGT]+$/.test(bases)) {
      warnings.push(`Sequence ${at + 1} has bases that are not A, C, G or T, so it was left out.`);
      continue;
    }
    used += 1;
    for (let start = 0; start + CODON <= bases.length; start += CODON) {
      const held = counts[bases.slice(start, start + CODON)];
      // A stop codon is not counted: nothing chooses between stops when optimising.
      if (held !== undefined) { held.count += 1; codons += 1; }
    }
  }
  for (const family of byAminoAcid.values()) {
    const total = family.reduce((sum, codon) => sum + counts[codon]!.count, 0);
    for (const codon of family) counts[codon]!.share = total === 0 ? 0 : counts[codon]!.count / total;
    if (total > 0 && total < FEW_CODONS) {
      warnings.push(`${counts[family[0]!]!.aminoAcid} appears only ${total} times, so which of ${family.join(", ")} this host prefers is not well counted.`);
    }
  }
  if (used < FEW_GENES) warnings.push(`Counted over ${used} ${used === 1 ? "gene" : "genes"}, which is few. A table counted over more genes is worth more.`);
  return { table, from: options.from ?? "sequences the lab supplied", genes: used, codons, counts, warnings };
}

/**
 * Why putting `codon` after `sequence` would not do, or `null` if it would.
 *
 * Only the join is looked at, far enough back to catch a run or a site that straddles it: what came
 * before was already allowed when it was put there.
 */
function trouble(sequence: string, codon: string, avoid: readonly { name: string; site: string }[], longestRun: number): string | null {
  const whole = sequence + codon;
  const longest = Math.max(longestRun + CODON, ...avoid.map((one) => one.site.length + CODON));
  const tail = whole.slice(Math.max(0, whole.length - longest));
  const run = new RegExp(`(.)\\1{${longestRun}}`).exec(tail);
  if (run !== null) return `a run of ${run[0]!.length} ${run[1]!}s`;
  for (const one of avoid) {
    if (tail.includes(one.site)) return `a ${one.name} site`;
  }
  return null;
}

/**
 * Rewrite a coding sequence in a host's codons, without changing the protein.
 *
 * Each codon becomes the one the host uses most for that amino acid, unless that would make a long
 * run of one base or a site that was to be kept out; then the next most used is taken, and the
 * reason is kept with the change.
 *
 * @param cds - The coding sequence: a whole number of codons, starting at the first one.
 * @param usage - How the host uses its codons, from `countCodonUsage`.
 * @param options - `avoid` are sites to keep out, by name and sequence; `longestRun` is the longest
 *   run of one base allowed, 6 unless said.
 * @returns The rewritten gene, every change, and what it did to the GC content. `problem` says why
 *   if it could not be done.
 *
 * @example
 * ```ts
 * import { countCodonUsage, optimiseCodons } from "@biolibs/bionet-tools";
 *
 * const done = optimiseCodons(gene, countCodonUsage(hostGenes), { avoid: [{ name: "EcoRI", site: "GAATTC" }] });
 * done.protein === translate(gene);    // the same protein, which is checked
 * ```
 */
export function optimiseCodons(cds: string, usage: CodonUsage, options: { avoid?: readonly { name: string; site: string }[]; longestRun?: number } = {}): CodonOptimised {
  const nothing = (problem: string): CodonOptimised =>
    ({ sequence: "", protein: "", changes: [], codons: 0, gcBefore: 0, gcAfter: 0, avoided: [], warnings: [], problem });
  const bases = clean(cds);
  if (bases.length < CODON || bases.length % CODON !== 0) return nothing(`That is ${bases.length} bases, which is not a whole number of codons.`);
  if (!/^[ACGT]+$/.test(bases)) return nothing("A coding sequence to optimise is written in A, C, G and T, with no uncertain bases.");
  if (usage.codons === 0) return nothing("The codon usage was counted over nothing, so there is nothing to prefer.");

  const { forward, byAminoAcid, stops } = synonyms(usage.table);
  const avoid = (options.avoid ?? []).map((one) => ({ name: one.name, site: clean(one.site) }));
  const longestRun = options.longestRun ?? LONGEST_RUN;
  const warnings: string[] = [];
  const changes: CodonChange[] = [];
  let out = "";
  /** The codons for an amino acid, the host's favourite first, with ties broken the same way always. */
  const liked = (aminoAcid: string): string[] =>
    [...(byAminoAcid.get(aminoAcid) ?? [])].sort((a, b) => usage.counts[b]!.share - usage.counts[a]!.share || (a < b ? -1 : 1));

  for (let start = 0; start + CODON <= bases.length; start += CODON) {
    const was = bases.slice(start, start + CODON);
    const at = start / CODON + 1;
    // A stop stays exactly as it is: it is not an amino acid and nothing is gained by moving it.
    if (stops.includes(was)) { out += was; continue; }
    const aminoAcid = forward.get(was);
    if (aminoAcid === undefined) return nothing(`Codon ${at} is ${was}, which is not a codon of NCBI table ${usage.table}.`);
    const family = liked(aminoAcid);
    let chosen: string | undefined;
    let instead: string | null = null;
    for (const candidate of family) {
      const why = trouble(out, candidate, avoid, longestRun);
      if (why === null) { chosen = candidate; break; }
      if (instead === null) instead = `the host's ${share(usage.counts[candidate]!.share)} codon ${candidate} would have made ${why}`;
    }
    if (chosen === undefined && changes.length > 0 && out.length >= CODON) {
      // Nothing fits after what was chosen last time, which means last time's choice was the
      // mistake: taking the host's favourite there left this amino acid nowhere to go. A run of one
      // amino acid does this every time. So the one before is tried again, and the pair taken
      // together, which is enough for a run and costs one step of looking back.
      const back = out.slice(0, out.length - CODON);
      const previous = out.slice(out.length - CODON);
      const earlier = forward.get(previous);
      outer: for (const other of earlier === undefined ? [] : liked(earlier)) {
        if (other === previous || trouble(back, other, avoid, longestRun) !== null) continue;
        for (const candidate of family) {
          if (trouble(back + other, candidate, avoid, longestRun) !== null) continue;
          out = back + other;
          const last = changes.at(-1);
          if (last !== undefined && last.at === at - 1) {
            last.to = other;
            last.toShare = usage.counts[other]!.share;
            last.instead = `the host's favourite left codon ${at} nowhere to go`;
          }
          chosen = candidate;
          break outer;
        }
      }
    }
    if (chosen === undefined) {
      // Still nothing. The sequence has to say something, so it keeps what it had and says so.
      chosen = was;
      warnings.push(`At codon ${at}, no codon for ${aminoAcid} would avoid a run or a site, so it was left as ${was}.`);
      instead = null;
    }
    if (chosen !== was) {
      changes.push({ at, aminoAcid, from: was, fromShare: usage.counts[was]?.share ?? 0, to: chosen, toShare: usage.counts[chosen]!.share, instead });
    }
    out += chosen;
  }

  // The one thing that must be true. If it is not, nothing is handed back.
  const before = String(translate(bases));
  const after = String(translate(out));
  if (before !== after) return nothing("The rewrite would have changed the protein, so nothing was changed. This is a fault in the tool, not in what was asked.");
  if (usage.genes < FEW_GENES) warnings.push(`The codon usage was counted over ${usage.genes} ${usage.genes === 1 ? "gene" : "genes"}, which is few to lean on.`);
  const after_gc = gc(out);
  if (after_gc > 0.65 || after_gc < 0.3) warnings.push(`The rewritten gene is ${share(after_gc)} GC, which is far from the middle and may be hard to make.`);
  return {
    sequence: out, protein: after, changes, codons: bases.length / CODON,
    gcBefore: gc(bases), gcAfter: after_gc, avoided: avoid.map((one) => one.name),
    warnings: [...new Set(warnings)], problem: null,
  };
}

/**
 * The working behind a rewrite: what was counted, what changed, and what it did to the gene.
 *
 * @param done - The rewrite.
 * @param usage - The table it used.
 * @returns One working for the table, one for the rewrite, and one for the protein being unchanged.
 */
export function codonWorking(done: CodonOptimised, usage: CodonUsage): Working[] {
  if (done.problem !== null) return [];
  const count = (value: number): string => value.toLocaleString("en-US");
  const favourite = (aminoAcid: string): string => {
    const family = Object.entries(usage.counts).filter(([, one]) => one.aminoAcid === aminoAcid).sort((a, b) => b[1].share - a[1].share);
    return family.map(([codon, one]) => `${codon} ${share(one.share)}`).join(", ");
  };
  const touched = [...new Set(done.changes.map((one) => one.aminoAcid))].sort();
  return [
    {
      of: "the host's preferences",
      comes: `${count(usage.codons)} codons counted over ${usage.genes} ${usage.genes === 1 ? "gene" : "genes"}`,
      kind: "estimate",
      steps: [
        `counted from: ${usage.from}`,
        `read with NCBI genetic code ${usage.table}`,
        ...touched.slice(0, 8).map((aminoAcid) => `${aminoAcid}: ${favourite(aminoAcid)}`),
        ...(touched.length > 8 ? [`and ${touched.length - 8} more amino acids`] : []),
      ],
      rests: "Nothing here is a published table. It is counted from the sequences it was given, and it is worth exactly what those genes are worth as a sample of the host.",
    },
    {
      of: "the rewrite",
      comes: `${count(done.changes.length)} of ${count(done.codons)} codons changed`,
      kind: "exact",
      steps: [
        `${count(done.codons - done.changes.length)} codons were already the host's choice`,
        ...done.changes.slice(0, 6).map((one) => `codon ${one.at}: ${one.from} → ${one.to} for ${one.aminoAcid}, ${share(one.fromShare)} → ${share(one.toShare)}${one.instead === null ? "" : ` (${one.instead})`}`),
        ...(done.changes.length > 6 ? [`and ${count(done.changes.length - 6)} more`] : []),
        ...(done.avoided.length === 0 ? [] : [`kept out of the sequence: ${done.avoided.join(", ")}`]),
        `GC went from ${share(done.gcBefore)} to ${share(done.gcAfter)}`,
      ],
    },
    {
      of: "the protein",
      comes: `${count(done.protein.length)} amino acids, unchanged`,
      kind: "exact",
      steps: [
        "every codon was replaced only by another for the same amino acid",
        "the gene was translated before and after, and the two were compared",
        `it begins ${done.protein.slice(0, 24)}${done.protein.length > 24 ? "…" : ""}`,
      ],
    },
  ];
}
