/**
 * Which residues of a protein would be phosphorylated, and whether the host would do it.
 *
 * This exists because of the gap between a band and a protein. The induction tool can tell a lab it
 * will get a 24 kDa band; it cannot tell the lab that the band will be the right mass and the wrong
 * thing. For casein that is the whole question. Casein builds a micelle — which is what makes it
 * behave like cheese rather than like dissolved protein — by binding calcium through clusters of
 * phosphorylated serines. A casein that was made but not phosphorylated weighs almost the same,
 * runs almost in the same place, and will not do the job.
 *
 * So two separate things are worked out here, and they are kept separate because one is arithmetic
 * and the other is not.
 *
 * - **Which residues carry the motif.** This is a rule over the sequence and nothing more. The
 *   secretory-pathway kinase that phosphorylates milk proteins recognises Ser-x-Glu, and once a
 *   serine is phosphorylated it acts like a glutamate for the one two residues before it, so the
 *   sites march backwards along a cluster. That hierarchy is why casein's serines come in runs.
 *   {@link phosphoSites} applies it, says which round each site was found in, and shows the working.
 * - **Whether the host has the enzyme.** This is not arithmetic, and nothing here pretends it is.
 *   {@link hostPhosphorylation} says what is generally held about the usual expression hosts, how
 *   firmly, and says plainly that it is a claim to check — which the lab's own literature tools can
 *   now do.
 *
 * A motif is a prediction. Where a curated record exists, as it does for the caseins in UniProt,
 * {@link comparedWithKnown} says which predictions it confirms and which it does not, and that
 * comparison is worth far more than either on its own.
 */
import type { Working } from "./pcr-working.js";

/** One rule for recognising a site. */
export interface PhosphoMotif {
  /** What to call it. */
  name: string;
  /** The kinase family that uses it. */
  kinase: string;
  /** The rule, written as people write it. */
  pattern: string;
  /** Which residues it can act on. */
  acts: string;
  /** What it is for, in a sentence. */
  about: string;
}

/**
 * The rules applied, in the order they are applied.
 *
 * Only two, and deliberately only two. These are the acidophilic motifs — the ones that read a
 * negative charge two or three residues along — and they are the ones that matter for a secreted
 * milk protein. A kinase whose rule is a structure rather than a few residues cannot be found by
 * looking at a sequence, and nothing here claims otherwise.
 */
export const PHOSPHO_MOTIFS: readonly PhosphoMotif[] = [
  {
    name: "S-x-E", kinase: "secretory-pathway casein kinase (FAM20C family)", pattern: "S-x-[E/D]", acts: "S",
    about: "The kinase that phosphorylates milk and other secreted proteins, inside the Golgi, as they are on their way out. It reads a negative charge two residues along.",
  },
  {
    name: "S/T-x-x-E", kinase: "casein kinase II (CK2)", pattern: "[S/T]-x-x-[E/D]", acts: "ST",
    about: "A kinase found in essentially every eukaryote, in the cytoplasm and the nucleus rather than the secretory pathway. Named after casein because casein is what it was first shown to work on, not because casein is what it does in a cell.",
  },
];

/** One residue that would be phosphorylated, and why. */
export interface PhosphoSite {
  /** Where it is, counting from 1. */
  at: number;
  /** The residue, as a letter. */
  residue: string;
  /** The rule that found it, by name. */
  by: string;
  /** The kinase family that rule belongs to. */
  kinase: string;
  /** The residues either side of it, as they are written. */
  context: string;
  /**
   * Which round found it. Round 1 is the motif read off the sequence as it stands. A later round is
   * a site that only became one because a site found in the round before gave it the charge it
   * needed — which is how a cluster of phosphoserines builds backwards along a chain.
   */
  round: number;
  /** What made it a site, said for a person. */
  because: string;
  /**
   * Any other rule that also matches this residue.
   *
   * A serine can carry more than one motif, and which one is reported first depends only on the
   * order the rules are tried in. Saying "this is a CK2 site" when it is equally the secretory
   * kinase's would be an accident of that order presented as a finding, so the others are listed.
   */
  alsoBy: { name: string; kinase: string; because: string }[];
}

/** What was worked out about a protein. */
export interface Phosphorylation {
  /** The sites, in order along the chain. */
  sites: PhosphoSite[];
  /** How many rounds found something. A further round, which found nothing, is what ended it. */
  rounds: number;
  /** Why there is nothing to say, or `null` if there is. */
  problem: string | null;
}

const ACID = new Set(["E", "D"]);

/**
 * The residues of a protein that carry a phosphorylation motif.
 *
 * The rules are applied in rounds. In the first, each is read off the sequence as it stands. In
 * each round after, a serine whose +2 residue is a site found already counts too, because a
 * phosphoserine carries the negative charge the kinase was reading for. That is repeated until a
 * round finds nothing, which is what builds the runs of phosphoserines a casein has.
 *
 * @param protein - The amino acids, in one letter each.
 * @param options - `motifs` are the rules to apply, {@link PHOSPHO_MOTIFS} if not given; `prime`
 *   turns off the later rounds, leaving only what the bare sequence says.
 * @returns The sites, and how many rounds it took.
 *
 * @example
 * ```ts
 * import { phosphoSites } from "@biolibs/bionet-tools";
 *
 * const found = phosphoSites(casein.sequence);
 * found.sites.filter((one) => one.round > 1);    // the ones a neighbour made possible
 * ```
 */
export function phosphoSites(protein: string, options: { motifs?: readonly PhosphoMotif[]; prime?: boolean } = {}): Phosphorylation {
  const chain = protein.replace(/\s+/g, "").toUpperCase();
  if (chain === "") return { sites: [], rounds: 0, problem: "There is no protein here to look at." };
  if (!/^[ACDEFGHIKLMNPQRSTVWY]+$/.test(chain)) return { sites: [], rounds: 0, problem: "That is written in letters that are not the twenty standard amino acids." };
  const motifs = options.motifs ?? PHOSPHO_MOTIFS;
  const found = new Map<number, PhosphoSite>();
  const context = (at: number): string => chain.slice(Math.max(0, at - 4), at + 3);

  let round = 0;
  for (;;) {
    round += 1;
    const fresh: PhosphoSite[] = [];
    for (let at = 1; at <= chain.length; at += 1) {
      const residue = chain[at - 1]!;
      /** Every rule that matches this residue as things stand, in the order the rules are given. */
      const matching: { name: string; kinase: string; because: string }[] = [];
      for (const motif of motifs) {
        if (!motif.acts.includes(residue)) continue;
        const reach = motif.name === "S-x-E" ? 2 : 3;
        const charged = chain[at - 1 + reach];
        if (charged === undefined) continue;
        if (ACID.has(charged)) {
          matching.push({ name: motif.name, kinase: motif.kinase, because: `${residue}${at} with ${charged} ${reach} residues along: ${motif.pattern}` });
          continue;
        }
        // A serine that is already a site carries the charge the kinase was reading for, so the one
        // before it becomes a site in the next round. That is what builds a run of them backwards.
        if (options.prime !== false && charged === "S" && found.has(at + reach)) {
          matching.push({ name: motif.name, kinase: motif.kinase,
                          because: `${residue}${at} with the phosphoserine at ${at + reach} ${reach} residues along, which carries the negative charge a glutamate would` });
        }
      }
      if (matching.length === 0) continue;
      const already = found.get(at);
      if (already !== undefined) {
        // A rule that only matched once a neighbour was found is still a rule that matches, so it
        // joins the site it belongs to rather than being lost or restarting the round count.
        for (const one of matching) {
          if (one.name !== already.by && !already.alsoBy.some((other) => other.name === one.name)) already.alsoBy.push(one);
        }
        continue;
      }
      const [best, ...rest] = matching as [typeof matching[number], ...typeof matching];
      fresh.push({ at, residue, by: best.name, kinase: best.kinase, context: context(at), round, because: best.because, alsoBy: rest });
    }
    for (const one of fresh) found.set(one.at, one);
    // A round that adds nothing is the end, and is not counted: what is reported is how many
    // rounds found something, which is what says how deep the hierarchy went.
    if (fresh.length === 0) { round -= 1; break; }
    if (options.prime === false) break;
    if (round > chain.length) break;
  }
  return { sites: [...found.values()].sort((a, b) => a.at - b.at), rounds: Math.max(round, 1), problem: null };
}

/** How a predicted set of sites stands against a curated one. */
export interface Compared {
  /** Sites that were predicted and are recorded: the ones to trust. */
  confirmed: number[];
  /** Sites that are recorded and were not predicted: the rule missed them. */
  missed: number[];
  /** Sites that were predicted and are not recorded: they may be wrong, or merely unstudied. */
  onlyPredicted: number[];
  /** What fraction of the recorded sites the rule found. */
  caught: number;
}

/**
 * How a prediction stands against what somebody has actually recorded.
 *
 * This is the honest way to use a motif. A rule over a sequence says what could be phosphorylated;
 * a curated record says what somebody saw. Where both exist, how well they agree is the measure of
 * whether to believe the rule anywhere else — on a variant, say, or on a gene that has been
 * rewritten in another host's codons.
 *
 * @param predicted - Where the rule said, counting from 1.
 * @param known - Where a record says, counting from 1 on the same sequence.
 * @returns What agrees, what was missed, and what is predicted alone.
 *
 * @example
 * ```ts
 * import { comparedWithKnown, phosphoSites } from "@biolibs/bionet-tools";
 *
 * const found = phosphoSites(casein.sequence);
 * comparedWithKnown(found.sites.map((one) => one.at), [30, 32, 33, 34, 50]).caught;    // 1
 * ```
 */
export function comparedWithKnown(predicted: readonly number[], known: readonly number[]): Compared {
  const said = new Set(predicted);
  const recorded = new Set(known);
  const confirmed = [...recorded].filter((one) => said.has(one)).sort((a, b) => a - b);
  return {
    confirmed,
    missed: [...recorded].filter((one) => !said.has(one)).sort((a, b) => a - b),
    onlyPredicted: [...said].filter((one) => !recorded.has(one)).sort((a, b) => a - b),
    caught: recorded.size === 0 ? 0 : confirmed.length / recorded.size,
  };
}

/** What is held about whether a host phosphorylates a secreted protein this way. */
export interface HostKinases {
  /** The organism, as it would be written. */
  host: string;
  /** Whether it is held to have the secretory-pathway kinase, and whether it has CK2. */
  secretoryKinase: "yes" | "no" | "not known";
  casein2: boolean;
  /** What is held, in a sentence or two. */
  says: string;
  /** How firmly: something long settled, something reported, or something to go and check. */
  standing: "well established" | "reported" | "check";
}

/**
 * What is generally held about the usual expression hosts.
 *
 * Everything here is a claim about biology and not something computed, which is why it carries a
 * `standing` and why the answer tells a reader to check it. It rots: a homologue nobody had found
 * when this was written may have been found since, and a host engineered to carry the kinase is now
 * a thing people build. What it is for is to stop a lab discovering at the end of a month that the
 * protein it made was never going to be phosphorylated — and then to point at the literature, which
 * the lab's own tools can now read.
 */
export const HOST_KINASES: readonly HostKinases[] = [
  {
    host: "Escherichia coli", secretoryKinase: "no", casein2: false, standing: "well established",
    says: "A bacterium has no secretory pathway of this kind and no kinase in it. Casein made in E. coli is reported unphosphorylated, and that is the usual reason a group that wanted micelles moved away from it.",
  },
  {
    host: "Bacillus subtilis", secretoryKinase: "no", casein2: false, standing: "well established",
    says: "As for E. coli: it secretes well, which is why people use it, but not through a compartment that phosphorylates what passes through.",
  },
  {
    host: "Saccharomyces cerevisiae", secretoryKinase: "not known", casein2: true, standing: "reported",
    says: "Budding yeast has casein kinase I and II homologues, but no homologue of the secretory-pathway kinase has been identified. Phosphorylation of casein expressed in yeast is reported, and reported as partial and uneven between sites rather than as the full pattern.",
  },
  {
    host: "Komagataella phaffii", secretoryKinase: "not known", casein2: true, standing: "reported",
    says: "The yeast formerly called Pichia pastoris, and the usual choice for a secreted protein because it secretes a great deal of it. The same holds as for budding yeast: the kinase of the secretory pathway has not been identified in it.",
  },
  {
    host: "Nicotiana benthamiana", secretoryKinase: "not known", casein2: true, standing: "reported",
    says: "Plants have CK2 and a secretory pathway, and phosphorylated casein has been reported from plant expression. How complete the pattern is varies by report.",
  },
  {
    host: "Cricetulus griseus", secretoryKinase: "yes", casein2: true, standing: "well established",
    says: "CHO cells are mammalian and have the secretory-pathway kinase, so they phosphorylate a milk protein as a mammal does. They are slow and expensive, which is why nobody makes cheese protein in them.",
  },
];

/**
 * What is held about one host.
 *
 * @param host - What it is, as the lab writes it. Matched loosely, so `Pichia pastoris GS115` finds
 *   the entry for the species under its current name.
 * @returns What is held, or `null` for a host nothing here knows about, which is not the same as a
 *   host that does not do it.
 *
 * @example
 * ```ts
 * import { hostPhosphorylation } from "@biolibs/bionet-tools";
 *
 * hostPhosphorylation("Saccharomyces cerevisiae W303")?.secretoryKinase;    // "not known"
 * ```
 */
export function hostPhosphorylation(host: string): HostKinases | null {
  const asked = host.trim().toLowerCase();
  if (asked === "") return null;
  // The old names are what a lab's own records are most likely to say.
  const also: Readonly<Record<string, string>> = {
    "pichia pastoris": "komagataella phaffii", "pichia": "komagataella phaffii",
    "e. coli": "escherichia coli", "b. subtilis": "bacillus subtilis",
    "s. cerevisiae": "saccharomyces cerevisiae", "cho": "cricetulus griseus", "tobacco": "nicotiana benthamiana",
  };
  for (const [old, now] of Object.entries(also)) {
    if (asked.includes(old)) return HOST_KINASES.find((one) => one.host.toLowerCase() === now) ?? null;
  }
  return HOST_KINASES.find((one) => asked.includes(one.host.toLowerCase())
    || asked.includes(one.host.split(" ")[0]!.toLowerCase())) ?? null;
}

/**
 * The working behind what was found: the rule, the rounds, and what it rests on.
 *
 * @param found - What {@link phosphoSites} gave.
 * @param host - What is held about the host, if a host was named.
 * @returns The workings, in the order to read them.
 */
export function phosphoWorking(found: Phosphorylation, host: HostKinases | null = null): Working[] {
  if (found.problem !== null) return [];
  const byRound = new Map<number, PhosphoSite[]>();
  for (const one of found.sites) byRound.set(one.round, [...(byRound.get(one.round) ?? []), one]);
  const out: Working[] = [{
    of: "the sites the sequence carries",
    comes: `${found.sites.length} ${found.sites.length === 1 ? "residue" : "residues"}`,
    kind: "estimate",
    steps: [
      ...PHOSPHO_MOTIFS.map((one) => `${one.name}: ${one.pattern}, which is ${one.kinase}.`),
      ...[...byRound.entries()].sort(([a], [b]) => a - b).map(([round, sites]) => {
        const named = sites.map((one) => `${one.residue}${one.at}`).join(", ");
        if (round === 1) return `Round 1 reads the sequence as it stands: ${named}.`;
        return sites.length === 1
          ? `Round ${round} adds ${named}, which only became a site because the one two residues along was found in the round before.`
          : `Round ${round} adds ${named}, each of which only became a site because the one two residues along was found in the round before.`;
      }),
      found.rounds === 1
        ? "One round found anything; the next found nothing more."
        : `${found.rounds} rounds found something, and the next found nothing more, which is how far back along the chain the cluster builds.`,
    ],
    rests: "A motif says a residue could be phosphorylated, not that it is. It is a rule over a few residues, and the kinases it stands for are not the only ones there are; a kinase that reads a shape rather than a sequence cannot be found this way at all. Where somebody has recorded the real sites, compare against those and believe the comparison rather than the rule.",
  }];
  if (host !== null) {
    out.push({
      of: `whether ${host.host} would do it`,
      comes: host.secretoryKinase === "yes" ? "it has the kinase" : host.secretoryKinase === "no" ? "it has no such kinase" : "not known to have the kinase",
      kind: "estimate",
      steps: [
        host.says,
        host.casein2 ? "It does have CK2, so a site that is CK2's may still be phosphorylated." : "It has no CK2 either.",
        "This is not worked out from anything. It is what is generally held, and it is what to check in the literature before spending a month on it.",
      ],
      rests: `Held as ${host.standing}. A host engineered to carry the kinase is a thing people now build, and a homologue nobody had found when this was written may have been found since. Search the literature for this host and this protein rather than taking this for the answer.`,
    });
  }
  return out;
}
