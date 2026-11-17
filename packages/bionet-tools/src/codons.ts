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
 * The GC content of the genes a codon usage was counted from, from 0 to 1.
 *
 * Useful as a target: a gene written to sit where the host's own genes sit is a gene the host has
 * shown it can transcribe, which is not the same as a gene made of the host's favourite codons.
 * Taking the single most-used codon every time compounds the bias — for an AT-rich host it lands
 * well below anything the host actually has.
 *
 * @param usage - How the host uses its codons, from `countCodonUsage`.
 * @returns The GC content of what was counted, or 0 if nothing was.
 *
 * @example
 * ```ts
 * import { countCodonUsage, gcOfHost, reverseTranslate } from "@biolibs/bionet-tools";
 *
 * const usage = countCodonUsage(genes, { from: "Komagataella phaffii" });
 * gcOfHost(usage);                                   // 0.421
 * reverseTranslate(protein, usage, { gc: "host" });  // a gene that sits there too
 * ```
 */
export function gcOfHost(usage: CodonUsage): number {
  let bases = 0, strong = 0;
  for (const [codon, one] of Object.entries(usage.counts)) {
    bases += one.count * codon.length;
    strong += one.count * [...codon].filter((each) => each === "G" || each === "C").length;
  }
  return bases === 0 ? 0 : strong / bases;
}

/** Whether swapping the codon at `at` has made a run or a site anywhere it could reach. */
function spoils(whole: string, at: number, avoid: readonly { name: string; site: string }[], longestRun: number): boolean {
  const reach = Math.max(longestRun + CODON, ...avoid.map((one) => one.site.length + CODON));
  const window = whole.slice(Math.max(0, at - reach), at + CODON + reach);
  if (new RegExp(`(.)\\1{${longestRun}}`).test(window)) return true;
  return avoid.some((one) => window.includes(one.site));
}

/**
 * Move a rewritten gene's GC toward a target by swapping synonymous codons, biggest step first.
 *
 * The protein never changes, since only synonyms are swapped, and a swap that would make a run or
 * a site is put back. It stops when it arrives, when nothing is left to swap, or at a bound, so it
 * always ends.
 */
function steer(sequence: string, target: number, usage: CodonUsage, avoid: readonly { name: string; site: string }[],
               longestRun: number, changes: CodonChange[], forward: Map<string, string>,
               byAminoAcid: Map<string, string[]>, stops: readonly string[]): string {
  const codons: string[] = [];
  for (let at = 0; at + CODON <= sequence.length; at += CODON) codons.push(sequence.slice(at, at + CODON));
  const strong = (codon: string): number => [...codon].filter((one) => one === "G" || one === "C").length;
  const refused = new Set<string>();
  for (let guard = 0; guard < codons.length * 6; guard += 1) {
    const now = gc(codons.join(""));
    if (Math.abs(now - target) <= 0.005) break;
    const want = now < target ? 1 : -1;
    let best: { at: number; codon: string; gain: number } | null = null;
    for (const [at, was] of codons.entries()) {
      if (stops.includes(was)) continue;
      const aminoAcid = forward.get(was);
      if (aminoAcid === undefined) continue;
      for (const candidate of byAminoAcid.get(aminoAcid) ?? []) {
        if (candidate === was || refused.has(`${at} ${candidate}`)) continue;
        const gain = (strong(candidate) - strong(was)) * want;
        if (gain <= 0) continue;
        const share = usage.counts[candidate]?.share ?? 0;
        if (best === null || gain + share > best.gain + (usage.counts[best.codon]?.share ?? 0)) best = { at, codon: candidate, gain };
      }
    }
    if (best === null) break;
    const was = codons[best.at]!;
    codons[best.at] = best.codon;
    const whole = codons.join("");
    if (spoils(whole, best.at * CODON, avoid, longestRun)) { codons[best.at] = was; refused.add(`${best.at} ${best.codon}`); continue; }
    const already = changes.find((one) => one.at === best.at + 1);
    if (already !== undefined) { already.to = best.codon; already.toShare = usage.counts[best.codon]?.share ?? 0; already.instead = "steered toward the host's own GC"; }
    else changes.push({ at: best.at + 1, aminoAcid: forward.get(was)!, from: was, fromShare: usage.counts[was]?.share ?? 0,
                        to: best.codon, toShare: usage.counts[best.codon]?.share ?? 0, instead: "steered toward the host's own GC" });
  }
  return codons.join("");
}

/**
 * Write a gene for a protein, in a host's own codons.
 *
 * This is how a lab gets something it can order. A protein is what somebody wants — read out of
 * UniProt, or worked out, or decided on — and a synthesis company needs DNA. Going the other way
 * round cannot be done exactly, because a protein does not say which of its synonymous codons was
 * used and it does not matter; what matters is which the host reads best, and that is what this
 * chooses.
 *
 * It is the optimiser underneath. A gene is written with any codon per residue and then rewritten
 * into the host's own, so the host's preferences, the sites kept out and the runs of one base are
 * handled by the same code that handles them for a gene somebody already had.
 *
 * @param protein - The amino acids, with or without a stop on the end.
 * @param usage - How the host uses its codons, from `countCodonUsage`.
 * @param options - `avoid` are sites to keep out; `longestRun` is the longest run of one base
 *   allowed; `stop` adds a stop codon on the end, which it does unless told not to.
 * @returns The gene. `changes` is empty, because nothing was changed from anything.
 *
 * @example
 * ```ts
 * import { countCodonUsage, reverseTranslate } from "@biolibs/bionet-tools";
 *
 * const gene = reverseTranslate(casein, countCodonUsage(pichiaGenes), { avoid: [{ name: "EcoRI", site: "GAATTC" }] });
 * gene.sequence;    // what to send to be synthesised
 * ```
 */
export function reverseTranslate(protein: string, usage: CodonUsage,
                                 options: { avoid?: readonly { name: string; site: string }[]; longestRun?: number; stop?: boolean; gc?: number | "host" } = {}): CodonOptimised {
  const chain = protein.replace(/\s+/g, "").toUpperCase().replace(/\*$/, "");
  const nothing = (problem: string): CodonOptimised =>
    ({ sequence: "", protein: "", changes: [], codons: 0, gcBefore: 0, gcAfter: 0, avoided: [], warnings: [], problem });
  if (chain === "") return nothing("There is no protein here to write a gene for.");
  if (!/^[ACDEFGHIKLMNPQRSTVWY]+$/.test(chain)) return nothing("A protein to write a gene for is written in the twenty standard amino acids.");
  if (usage.codons === 0) return nothing("The codon usage was counted over nothing, so there is nothing to prefer.");

  // Any codon per residue, since what matters is only that the protein is right: `optimiseCodons`
  // then rewrites it into the host's own, which is the whole of the work and is already tested.
  const { byAminoAcid, stops } = synonyms(usage.table);
  const first: string[] = [];
  for (const residue of chain) {
    const choices = byAminoAcid.get(residue);
    if (choices === undefined || choices.length === 0) return nothing(`Nothing in genetic code ${usage.table} reads as ${residue}.`);
    first.push([...choices].sort()[0]!);
  }
  if (options.stop !== false) first.push([...stops].sort()[0] ?? "TAA");
  const made = optimiseCodons(first.join(""), usage, options);
  if (made.problem !== null) return made;
  // Nothing was rewritten from anything: every codon here was chosen, so a list of changes would be
  // a list of what an arbitrary starting point happened to be, which says nothing about anything.
  return { ...made, changes: [], warnings: [...made.warnings, `Written from the protein, not rewritten from a gene: every codon is the host's own choice, so there is nothing it was changed from.${options.stop === false ? "" : " A stop codon is on the end."}`] };
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
export function optimiseCodons(cds: string, usage: CodonUsage, options: { avoid?: readonly { name: string; site: string }[]; longestRun?: number; gc?: number | "host" } = {}): CodonOptimised {
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

  // Where the host's own genes sit, if that was asked for. Only synonyms move, so the protein is
  // untouched; it is still checked below, because that is the one thing that must be true.
  if (options.gc !== undefined) {
    const target = options.gc === "host" ? gcOfHost(usage) : options.gc;
    if (target > 0 && target < 1) out = steer(out, target, usage, avoid, longestRun, changes, forward, byAminoAcid, stops);
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
