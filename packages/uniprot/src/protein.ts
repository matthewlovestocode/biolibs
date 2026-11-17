/**
 * What UniProt knows about a protein, read into positions people count.
 *
 * `@biolibs/seqio` already reads UniProt's XML, faithfully, into Biopython's shapes: a `SeqRecord`
 * with features whose locations are half-open and counted from zero. That is the right thing for a
 * port to do and the wrong thing to hand a lab, so this turns it into the few facts somebody at a
 * bench actually asks for, counted the way the rest of these packages count.
 *
 * The one that matters most is the **chain**. A UniProt entry's sequence is usually the precursor —
 * the protein as it comes off the ribosome, signal peptide and all — and the thing a lab collects
 * is the chain that is left after the cell has cut that off. They are different lengths and so
 * different masses on a gel, and a tool that quietly used the precursor would send somebody looking
 * for a band two kilodaltons too high. So the mature chain is worked out, given as its own
 * sequence, and said to be what it is.
 *
 * The second is **what is modified**. For a protein like casein the phosphoserines are the whole
 * point: they are what lets it build a micelle, and a host that does not put them on makes a
 * protein that is the right mass and the wrong thing. UniProt records them one residue at a time,
 * with evidence, and that is worth far more than anything a sequence alone can be asked.
 */
import { UniprotIterator } from "@biolibs/seqio";
import { UniProtError } from "./ask.js";

/** A stretch of a protein, counted as people count: from 1, both ends included. */
export interface Stretch {
  /** The first residue, counting from 1. */
  from: number;
  /** The last residue. */
  to: number;
}

/** The mature protein: what is left once the cell has cut off what it cuts off. */
export interface Chain extends Stretch {
  /** What UniProt calls it. */
  name: string;
  /** Its own sequence. */
  sequence: string;
  /** How many residues. */
  length: number;
}

/** One residue that carries something after it is made. */
export interface Modified {
  /** Where it is, counting from 1 on the whole entry's sequence. */
  at: number;
  /** The residue itself, as a letter. */
  residue: string;
  /** What is on it: `Phosphoserine`, `N-linked (GlcNAc) asparagine`, and so on. */
  what: string;
  /** Whether UniProt cites evidence for it. */
  evidenced: boolean;
}

/** One place the protein is known to differ between individuals or breeds. */
export interface Variant extends Stretch {
  /** What is usually there, and what it becomes. */
  was: string;
  /** What it becomes, or `""` where the residues are simply gone. */
  now: string;
  /** What UniProt says about it, which usually names the variant. */
  note: string;
}

/** A named part of a protein: a domain, a region, a repeat. */
export interface Region extends Stretch {
  /** What kind of thing it is, as UniProt types it. */
  kind: string;
  /** What it is called. */
  name: string;
}

/** What is known about one protein. */
export interface Protein {
  /** Its accession, which is what to cite it by. */
  accession: string;
  /** Every accession that leads here, since entries get merged. */
  alsoKnownAs: string[];
  /** The entry's name, such as `CASB_BOVIN`. */
  entryName: string;
  /** What the protein is called. */
  name: string;
  /** The gene it comes from, where the entry names one. */
  gene: string | null;
  /** What it is from, and where that sits. */
  organism: string | null;
  lineage: string[];
  /**
   * Whether a curator has been over this entry (Swiss-Prot) or it was made by machine (TrEMBL).
   *
   * It is the first thing to look at. A reviewed entry's modified residues have been read out of
   * papers by somebody; an unreviewed entry's have been guessed from similarity, and saying they
   * are the same thing would be a lie by omission.
   */
  reviewed: boolean;
  /** The whole entry's sequence, which is usually the precursor. */
  sequence: string;
  length: number;
  /** What UniProt says the whole entry weighs, in daltons. */
  mass: number | null;
  /** The signal peptide, if the entry marks one. */
  signal: Stretch | null;
  /** The mature chain, if the entry marks one: what a lab actually ends up holding. */
  chain: Chain | null;
  /** Each residue that carries something after it is made. */
  modifications: Modified[];
  /** Where it is known to differ between individuals or breeds. */
  variants: Variant[];
  /** Its named parts. */
  regions: Region[];
  /** The words UniProt files it under. */
  keywords: string[];
  /** Where a person would read it. */
  lookAt: string;
}

/** What `@biolibs/seqio` gives back, in as much shape as is read here. */
interface Parsed {
  id: string;
  name: string;
  description: string;
  seq: { toString(): string };
  annotations: Map<string, unknown>;
  features: { type: string; location: { start: unknown; end: unknown }; qualifiers: Map<string, unknown> }[];
}

const words = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);
const list = (value: unknown): string[] => (Array.isArray(value) ? value.filter((one): one is string => typeof one === "string") : []);

/** A position out of a Biopython location, or `null` where it is not an exact number. */
const exact = (value: unknown): number | null => {
  const at = Number(value);
  return Number.isSafeInteger(at) ? at : null;
};

/** A feature's stretch, turned from half-open and counted from zero into how people count. */
function stretchOf(feature: Parsed["features"][number]): Stretch | null {
  const [start, end] = [exact(feature.location.start), exact(feature.location.end)];
  if (start === null || end === null || end <= start) return null;
  return { from: start + 1, to: end };
}

const said = (feature: Parsed["features"][number], field: string): string => words(feature.qualifiers.get(field)) ?? "";

/**
 * Read a protein out of a UniProt XML entry.
 *
 * @param xml - The entry, as UniProt sends it.
 * @returns What is known about it.
 * @throws {@link UniProtError} if that is not a UniProt entry.
 *
 * @example
 * ```ts
 * import { lookUpProtein, readProtein } from "@biolibs/uniprot";
 *
 * const casein = readProtein(await lookUpProtein("P02666"));
 * casein.chain?.length;                                  // 209, not the precursor's 224
 * casein.modifications.map((one) => one.at);             // [30, 32, 33, 34, 50]
 * ```
 */
export function readProtein(xml: Uint8Array | string): Protein {
  const bytes = typeof xml === "string" ? new TextEncoder().encode(xml) : xml;
  let record: Parsed;
  try {
    const [first] = [...new UniprotIterator(bytes)] as unknown as Parsed[];
    if (first === undefined) throw new Error("the entry is empty");
    record = first;
  } catch (cause) {
    throw new UniProtError(`That is not a UniProt entry: ${cause instanceof Error ? cause.message : String(cause)}`, "uniprotkb");
  }
  const sequence = String(record.seq).toUpperCase();
  const accession = list(record.annotations.get("accessions"))[0] ?? record.id;

  const signal = record.features.filter((one) => one.type === "signal peptide").map(stretchOf).find((one) => one !== null) ?? null;
  const chainFeature = record.features.find((one) => one.type === "chain");
  const chainAt = chainFeature === undefined ? null : stretchOf(chainFeature);
  const chain: Chain | null = chainFeature === null || chainFeature === undefined || chainAt === null ? null : {
    ...chainAt,
    name: said(chainFeature, "description") || (words(record.description) ?? "the mature chain"),
    sequence: sequence.slice(chainAt.from - 1, chainAt.to),
    length: chainAt.to - chainAt.from + 1,
  };

  const modifications: Modified[] = [];
  for (const feature of record.features) {
    if (feature.type !== "modified residue" && feature.type !== "glycosylation site" && feature.type !== "lipid moiety-binding region") continue;
    const at = stretchOf(feature);
    if (at === null) continue;
    modifications.push({
      at: at.from, residue: sequence[at.from - 1] ?? "",
      what: said(feature, "description") || feature.type,
      evidenced: said(feature, "evidence") !== "",
    });
  }

  const variants: Variant[] = [];
  for (const feature of record.features) {
    if (feature.type !== "sequence variant") continue;
    const at = stretchOf(feature);
    if (at === null) continue;
    variants.push({ ...at, was: said(feature, "original"), now: said(feature, "variation"), note: said(feature, "description") });
  }

  const regions: Region[] = [];
  for (const feature of record.features) {
    if (!["domain", "region of interest", "repeat", "motif", "zinc finger region", "binding site", "active site"].includes(feature.type)) continue;
    const at = stretchOf(feature);
    if (at === null) continue;
    regions.push({ ...at, kind: feature.type, name: said(feature, "description") || said(feature, "note") || feature.type });
  }

  const dataset = words(record.annotations.get("dataset"));
  const mass = Number(record.annotations.get("sequence_mass"));
  return {
    accession, alsoKnownAs: list(record.annotations.get("accessions")).slice(1),
    entryName: record.name, name: words(record.description) ?? record.name,
    gene: words(record.annotations.get("gene_name_primary")),
    organism: words(record.annotations.get("organism")),
    lineage: list(record.annotations.get("taxonomy")),
    // UniProt says "Swiss-Prot" for an entry a curator has been over and "TrEMBL" for one made by
    // machine. Anything that is not plainly the first is treated as the second.
    reviewed: dataset !== null && /swiss-?prot/i.test(dataset),
    sequence, length: sequence.length,
    mass: Number.isFinite(mass) && mass > 0 ? mass : null,
    signal, chain,
    modifications: modifications.sort((a, b) => a.at - b.at),
    variants: variants.sort((a, b) => a.from - b.from),
    regions: regions.sort((a, b) => a.from - b.from),
    keywords: list(record.annotations.get("keywords")),
    lookAt: `https://www.uniprot.org/uniprotkb/${accession}`,
  };
}

/**
 * Where a modification falls on the mature chain, rather than on the precursor.
 *
 * UniProt counts every position on the whole entry, signal peptide included. A lab holding the
 * mature protein counts from the first residue it actually has, and the two differ by the length
 * of what was cut off. Getting this wrong by fifteen residues is the easiest mistake here to make
 * and the hardest to notice, because both numbers look perfectly reasonable.
 *
 * @param protein - The protein.
 * @param at - A position on the entry's sequence, counting from 1.
 * @returns The same residue counted from the start of the mature chain, or `null` if it is not on
 *   the chain at all — a residue inside the signal peptide is on nothing the lab holds.
 *
 * @example
 * ```ts
 * import { onTheChain } from "@biolibs/uniprot";
 *
 * onTheChain(casein, 30);    // 15 — the first phosphoserine, counted on what a lab collects
 * onTheChain(casein, 5);     // null — that residue is in the signal peptide and is cut off
 * ```
 */
export function onTheChain(protein: Pick<Protein, "chain">, at: number): number | null {
  const chain = protein.chain;
  if (chain === null || at < chain.from || at > chain.to) return null;
  return at - chain.from + 1;
}
