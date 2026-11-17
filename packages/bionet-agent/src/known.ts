/**
 * What is known about a protein, and what would be done to it: UniProt, and the motif rules.
 *
 * These two belong together because neither is worth much alone, and together they answer the
 * question a project like making casein in yeast actually turns on.
 *
 * UniProt alone gives a record: here are the five phosphoserines somebody read out of a paper.
 * That is true of the cow's protein and says nothing about a variant, or about a gene that has
 * been rewritten in another host's codons. The motif rules alone give a prediction, and a
 * prediction over a few residues is a thing to be sceptical of. Put together, the comparison is
 * the useful object: the rule reproduces the record on the protein somebody has studied, so it can
 * be believed on the one nobody has.
 *
 * The other thing these answer is the one a lab finds out too late. A host will happily make a
 * protein of the right mass that is the wrong thing, because the modification that makes it work is
 * put on by an enzyme the host does not have. An adviser that can say that before the month is
 * spent is worth more than one that can design the construct.
 */
import { UniProtError, lookUpProtein, onTheChain, readProtein, searchProteins, settings,
         type Protein } from "@biolibs/uniprot";
import { HOST_KINASES, PHOSPHO_MOTIFS, comparedWithKnown, hostPhosphorylation, phosphoSites, phosphoWorking } from "@biolibs/bionet-tools";
import type { AgentTool } from "./tools.js";

/** The most results one protein search gives back. */
export const MOST_PROTEINS = 25;

/** How an adviser reaches UniProt. */
export interface KnownOptions {
  /** Whether to offer these tools at all. On unless a host says otherwise. */
  known?: boolean;
  /** What to call this software to UniProt. Never a person's name. */
  tool?: string;
  /** An address UniProt could use about heavy use, if somebody has set one on purpose. */
  email?: string | null;
}

const text = (value: unknown, what: string): string => {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${what} has to be given, as text.`);
  return value.trim();
};
const whole = (value: unknown, what: string): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`${what} has to be a whole number.`);
  return value;
};

/** What UniProt said went wrong, in words the agent can do something about. */
const asTrouble = (cause: unknown): Error => {
  if (cause instanceof UniProtError) {
    if (cause.status === 429) return new Error("UniProt is being asked too often just now. Wait a little and ask again.");
    if (cause.offline) return new Error("UniProt could not be reached. This device may be offline.");
    return new Error(cause.message);
  }
  return cause instanceof Error ? cause : new Error(String(cause));
};

/** A protein said the way the rest of these tools say things. */
const proteinView = (protein: Protein): Record<string, unknown> => ({
  accession: protein.accession, entry: protein.entryName, name: protein.name,
  gene: protein.gene, organism: protein.organism,
  // The first thing to look at, and the thing an agent is most likely to skip past.
  reviewed_by_a_curator: protein.reviewed,
  ...(protein.reviewed ? {} : { unreviewed_note: "This entry was made by machine from similarity, not read out of papers by anybody. What it says is marked on the protein is a guess, and a guess of a different kind from a curator's reading." }),
  precursor_length: protein.length,
  ...(protein.mass === null ? {} : { precursor_mass_daltons: protein.mass }),
  ...(protein.signal === null ? {} : { signal_peptide: `${protein.signal.from}-${protein.signal.to}` }),
  ...(protein.chain === null ? { mature_chain: null } : { mature_chain: {
    name: protein.chain.name, lies: `${protein.chain.from}-${protein.chain.to}`, residues: protein.chain.length,
    note: "This is what a lab ends up holding, and what its band on a gel is. The entry's own sequence is the precursor and is longer.",
  } }),
  keywords: protein.keywords.slice(0, 12),
  look_at: protein.lookAt,
});

/**
 * The tools that say what is known about a protein.
 *
 * @param options - Whether to offer them, and what to tell UniProt about who is asking.
 * @returns The tools, or none if a host asked for none.
 *
 * @example
 * ```ts
 * import { knownTools } from "@biolibs/bionet-agent";
 *
 * knownTools().map((one) => one.name);
 * // ["search_proteins", "look_up_protein", "work_out_phosphorylation"]
 * ```
 */
export function knownTools(options: KnownOptions = {}): AgentTool[] {
  if (options.known === false) return [];
  settings.tool = options.tool ?? "bionet-adviser";
  if (options.email !== undefined) settings.email = options.email;

  /** Fetch and read one entry. */
  const entry = async (accession: string): Promise<Protein> => {
    try { return readProtein(await lookUpProtein(accession)); } catch (cause) { throw asTrouble(cause); }
  };

  return [
    {
      name: "search_proteins", title: "Find a protein in UniProt", readOnly: true,
      description: [
        "Search UniProt for a protein, to get the accession that look_up_protein needs.",
        "The query takes plain words and UniProt's fields: `gene:CSN2`, `organism_id:9913`, `taxonomy_name:\"Bos taurus\"`, `reviewed:true`, `length:[200 TO 300]`. For example: `casein AND organism_id:9913`.",
        "Each result says whether a curator has been over it. A reviewed entry (Swiss-Prot) has been read out of papers by somebody; an unreviewed one (TrEMBL) was made by machine from similarity. Prefer a reviewed entry, and say which kind you used.",
        "This reaches the internet. Only the query is sent.",
      ].join(" "),
      input: { type: "object", required: ["query"], additionalProperties: false, properties: {
        query: { type: "string", description: "What to look for, in UniProt's syntax." },
        reviewed_only: { type: "boolean", description: "Only entries a curator has been over. Usually what you want." },
        limit: { type: "integer", description: `How many, up to ${MOST_PROTEINS}. 10 if not given.` },
      } },
      run: async (args) => {
        const query = text(args["query"], "The query");
        if (query.length > 300) throw new Error("A query is at most 300 characters. This searches by words; a sequence is not something to put in one.");
        try {
          const found = await searchProteins(query, {
            ...(args["reviewed_only"] === true ? { reviewedOnly: true } : {}),
            ...(args["limit"] === undefined ? {} : { limit: Math.min(MOST_PROTEINS, whole(args["limit"], "The limit")) }),
          });
          return {
            query: found.query,
            results: found.results.map((one) => ({
              accession: one.accession, entry: one.entryName, name: one.name, gene: one.gene,
              organism: one.organism, precursor_length: one.length, reviewed_by_a_curator: one.reviewed, look_at: one.lookAt,
            })),
            ...(found.results.length === 0 ? { note: "Nothing matched. Try fewer words, or an organism as organism_id:9913." } : {}),
            from_outside: "This came from UniProt and is what is known outside this lab.",
          };
        } catch (cause) { throw asTrouble(cause); }
      },
    },
    {
      name: "look_up_protein", title: "What UniProt knows about a protein", readOnly: true,
      description: [
        "Read one UniProt entry: what the protein is, where its signal peptide and its mature chain lie, every residue that is modified after it is made, where it varies between individuals or breeds, and its named parts.",
        "Two things here are worth more than the rest.",
        "The mature chain is what a lab actually ends up holding. A UniProt entry's own sequence is usually the precursor, signal peptide and all, and the two are different lengths and so different masses on a gel. Use the chain when you are saying what band to look for.",
        "The modified residues are what a sequence cannot tell you. For a protein like casein the phosphoserines are the whole point — they are what lets it build a micelle — and whether the host will put them on is a different question from whether it will make the protein. work_out_phosphorylation asks that one.",
        "Positions are given both ways: on the entry, which is how UniProt counts and how a paper will cite it, and on the mature chain, which is how a lab holding the protein counts. They differ by the length of the signal peptide, and confusing them is the easiest mistake here to make.",
        "This reaches the internet. Only the accession is sent, and nothing is added to the lab.",
      ].join(" "),
      input: { type: "object", required: ["accession"], additionalProperties: false, properties: {
        accession: { type: "string", description: "The UniProt accession, such as P02666." },
        include: { type: "string", enum: ["all", "variants", "regions"], description: "Bring the sequence variants or the named parts too; both are long. Left out if not given." },
      } },
      run: async (args) => {
        const protein = await entry(text(args["accession"], "The accession"));
        const wanted = args["include"] === undefined ? "" : text(args["include"], "What to include");
        const both = (at: number): Record<string, unknown> => {
          const on = onTheChain(protein, at);
          return { on_the_entry: at, ...(on === null ? { on_the_mature_chain: null } : { on_the_mature_chain: on }) };
        };
        return {
          ...proteinView(protein),
          sequence: protein.sequence,
          ...(protein.chain === null ? {} : { mature_sequence: protein.chain.sequence }),
          modified_residues: protein.modifications.map((one) => ({
            ...both(one.at), residue: one.residue, what: one.what,
            evidence_cited: one.evidenced,
          })),
          ...(protein.modifications.length === 0 ? { modified_residues_note: "This entry records none. For an unreviewed entry that usually means nobody has looked, not that there are none." } : {}),
          ...(wanted === "all" || wanted === "variants"
            ? { variants: protein.variants.map((one) => ({ ...both(one.from), was: one.was, now: one.now, note: one.note })) }
            : protein.variants.length === 0 ? {} : { variants_not_shown: `${protein.variants.length} sequence variants are recorded. Ask with include "variants" to see them; for a protein like beta-casein they are the difference between one milk and another.` }),
          ...(wanted === "all" || wanted === "regions"
            ? { named_parts: protein.regions.map((one) => ({ lies: `${one.from}-${one.to}`, kind: one.kind, name: one.name })) }
            : protein.regions.length === 0 ? {} : { named_parts_not_shown: protein.regions.length }),
          from_outside: "This came from UniProt. A reviewed entry is a curator's reading of the papers; it is not something this lab has seen.",
        };
      },
    },
    {
      name: "work_out_phosphorylation", title: "Which residues would be phosphorylated, and whether the host would do it", readOnly: true,
      description: [
        "Work out which serines and threonines of a protein carry a phosphorylation motif, and say whether the host it is being expressed in has the enzyme that would act on them.",
        "This is the question a project to make a milk protein turns on, and it is not the same question as whether the protein gets made. Casein builds a micelle — which is what makes it behave like cheese rather than like dissolved protein — through clusters of phosphorylated serines binding calcium. A host can make casein of exactly the right mass, giving exactly the right band, that will not do the job because it was never phosphorylated.",
        "Two things come back, and they are different in kind. The sites are a rule over the sequence: the secretory-pathway kinase reads Ser-x-Glu, and a serine that is already phosphorylated acts like a glutamate for the one two residues before it, so the sites march backwards along a cluster. That is arithmetic and the working shows it. Whether the host has the kinase is not arithmetic; it is what is generally held, it says how firmly, and it says to check the literature — which search_papers can now do.",
        "Give `uniprot` as well, and the rule is compared against what a curator recorded. That comparison is worth more than either on its own: a rule that reproduces the record on a protein somebody studied can be believed on a variant nobody has.",
        "Give the protein as a sequence, or as a part in this lab, or as a UniProt accession.",
      ].join(" "),
      input: { type: "object", additionalProperties: false, properties: {
        sequence: { type: "string", description: "The amino acids, if you have them in hand." },
        uniprot: { type: "string", description: "A UniProt accession, such as P02666. Its recorded sites are compared against the rule." },
        on_the_mature_chain: { type: "boolean", description: "With a UniProt accession: work on the mature chain rather than the precursor. The precursor if not given, since that is how UniProt and a paper number things." },
        host: { type: "string", description: "What it would be expressed in, such as \"Komagataella phaffii\" or \"Saccharomyces cerevisiae\"." },
      } },
      run: async (args) => {
        const accession = args["uniprot"] === undefined ? null : text(args["uniprot"], "The accession");
        const given = args["sequence"] === undefined ? null : text(args["sequence"], "The sequence");
        if (accession === null && given === null) throw new Error("Give a sequence, or a UniProt accession to read one from.");
        const protein = accession === null ? null : await entry(accession);
        const mature = args["on_the_mature_chain"] === true;
        if (mature && protein?.chain == null) throw new Error("That entry marks no mature chain, so there is no chain to count on.");
        const chain = given ?? (mature ? protein!.chain!.sequence : protein!.sequence);
        const found = phosphoSites(chain);
        if (found.problem !== null) throw new Error(found.problem);
        const named = args["host"] === undefined ? null : text(args["host"], "The host");
        const host = named === null ? null : hostPhosphorylation(named);

        // UniProt counts on the precursor; if the chain is what is being looked at, so must this.
        const recorded = protein === null ? null : protein.modifications
          .filter((one) => /phospho/i.test(one.what))
          .map((one) => (mature ? onTheChain(protein, one.at) : one.at))
          .filter((one): one is number => one !== null);
        const against = recorded === null ? null : comparedWithKnown(found.sites.map((one) => one.at), recorded);

        return {
          ...(protein === null ? {} : { protein: protein.name, accession: protein.accession, reviewed_by_a_curator: protein.reviewed }),
          counted_on: mature ? "the mature chain" : protein === null ? "the sequence given" : "the whole entry, precursor included",
          residues: chain.length,
          motifs: PHOSPHO_MOTIFS.map((one) => ({ name: one.name, pattern: one.pattern, kinase: one.kinase, about: one.about })),
          sites: found.sites.map((one) => ({
            at: one.at, residue: one.residue, by: one.by, kinase: one.kinase, context: one.context, round: one.round, because: one.because,
            // A residue can carry more than one motif, and which is named first is only the order
            // the rules are tried in. The others are said so that is not read as a finding.
            ...(one.alsoBy.length === 0 ? {} : { also_matches: one.alsoBy.map((other) => ({ by: other.name, kinase: other.kinase, because: other.because })) }),
          })),
          rounds: found.rounds,
          ...(against === null ? {} : { against_what_is_recorded: {
            recorded, confirmed: against.confirmed, the_rule_missed: against.missed, predicted_only: against.onlyPredicted,
            caught: `${Math.round(against.caught * 100)}% of the recorded sites`,
            note: against.missed.length === 0 && against.confirmed.length > 0
              ? "The rule reproduces every site a curator recorded, which is the reason to believe it on a sequence nobody has studied — a variant, or this gene rewritten in another host's codons."
              : "The rule and the record do not agree. Believe the record for this protein, and be careful using the rule on another.",
          } }),
          ...(host === null ? (named === null ? {} : { host: named, host_not_known: `Nothing here says what ${named} does. That is not the same as its doing nothing: search_papers is the way to find out.` })
            : { host: {
                host: host.host,
                has_the_secretory_kinase: host.secretoryKinase,
                has_casein_kinase_2: host.casein2,
                says: host.says,
                how_firmly: host.standing,
                check_it: `This is not worked out from anything; it is what is generally held. Search the literature for this host and this protein before spending a month on it.`,
              } }),
          working: phosphoWorking(found, host).map((one) => ({ of: one.of, comes: one.comes, kind: one.kind, steps: one.steps, ...(one.rests === undefined ? {} : { rests: one.rests }) })),
          hosts_this_knows_of: HOST_KINASES.map((one) => one.host),
        };
      },
    },
  ];
}
