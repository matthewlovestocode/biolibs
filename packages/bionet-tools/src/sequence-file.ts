/**
 * Bringing a sequence in from the file a lab already has.
 *
 * Most labs keep their sequences as SnapGene or GenBank files, with the genes, promoters and origins
 * already marked. This reads one into what a lab's freezer keeps of a part: a name, the bases,
 * whether it is a circle, and what is marked on it. SnapGene's own format, GenBank, EMBL and FASTA
 * are read, by `@biolibs/seqio`.
 */
import type { PartFeature } from "@biolibs/bionet";
import { parse } from "@biolibs/seqio";

/** A sequence read from a file. */
export interface SequenceFile {
  /** The file it came from. */
  fileName: string;
  /** What kind of file it was read as: `snapgene`, `genbank`, `embl` or `fasta`. */
  format: string;
  /** What the file calls the sequence. */
  name: string;
  /** What the file says about it. */
  description: string;
  /** The bases, in capitals. */
  sequence: string;
  /** Whether it is a circle. */
  circular: boolean;
  /** What is marked on it. */
  features: PartFeature[];
}

const TEXT_FORMATS: Readonly<Record<string, string>> = { gb: "genbank", gbk: "genbank", gbff: "genbank", genbank: "genbank", embl: "embl", fa: "fasta", fasta: "fasta", fna: "fasta" };

/**
 * What kind of sequence file something is, from its name or failing that from how it begins.
 *
 * @param name - The file's name.
 * @param bytes - What is in it.
 * @returns The format's name, or `null` if it is none this reads.
 */
export function sequenceFormat(name: string, bytes: Uint8Array): string | null {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "dna") return "snapgene";
  if (Object.hasOwn(TEXT_FORMATS, extension)) return TEXT_FORMATS[extension]!;
  if (bytes[0] === 0x09) return "snapgene";            // every SnapGene file opens with a packet of type 9
  const start = new TextDecoder().decode(bytes.slice(0, 16));
  if (start.startsWith("LOCUS")) return "genbank";
  if (start.startsWith(">")) return "fasta";
  if (start.startsWith("ID ")) return "embl";
  return null;
}

/**
 * Read the first sequence in a file.
 *
 * @param name - The file's name.
 * @param bytes - What is in it.
 * @returns The sequence and what is marked on it.
 * @throws If it is not a kind of file this reads, or holds no sequence.
 *
 * @example
 * ```ts
 * import { readSequenceFile } from "@biolibs/bionet-tools";
 *
 * const read = readSequenceFile("pUC19.fa", new TextEncoder().encode(">pUC19\nGGATCACAGTCTACACTG\n"));
 * read.name;        // "pUC19"
 * read.sequence;    // "GGATCACAGTCTACACTG"
 * ```
 */
export function readSequenceFile(name: string, bytes: Uint8Array): SequenceFile {
  const format = sequenceFormat(name, bytes);
  if (format === null) throw new Error("Could not tell what kind of file that is. SnapGene (.dna), GenBank (.gb), EMBL and FASTA are read.");
  let record;
  try {
    // Binary formats take bytes and text formats take a string.
    record = parse(format === "snapgene" ? bytes : new TextDecoder().decode(bytes), format)[Symbol.iterator]().next().value;
  } catch (cause) {
    throw new Error(`That ${format} file could not be read: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  if (record === undefined || record === null || !record.seq) throw new Error("That file holds no sequence.");
  const sequence = String(record.seq).toUpperCase();
  const whole = (position: unknown): number => Number((position as { position?: number }).position ?? position);
  const first = (values: unknown): string | undefined => (Array.isArray(values) && values.length > 0 ? String(values[0]) : undefined);
  const features: PartFeature[] = [];
  for (const feature of record.features) {
    if (!feature.location || feature.type === "source") continue;
    const said = (key: string): string | undefined => first(feature.qualifiers.get(key));
    const parts = (feature.location.parts as { start: unknown; end: unknown }[]).map((part) => ({ start: whole(part.start), end: whole(part.end) }))
      .filter((part) => Number.isSafeInteger(part.start) && Number.isSafeInteger(part.end) && part.start >= 0 && part.end > part.start && part.end <= sequence.length);
    if (parts.length === 0) continue;
    const strand = feature.location.strand === 1 ? 1 : feature.location.strand === -1 ? -1 : 0;
    features.push({ type: String(feature.type).slice(0, 40), label: (said("label") ?? said("gene") ?? said("product") ?? said("note") ?? String(feature.type)).slice(0, 200), strand, parts });
  }
  const stem = name.replace(/\.[^.]+$/, "");
  const called = record.name && record.name !== "<unknown name>" ? record.name : record.id && record.id !== "<unknown id>" ? record.id : stem;
  return {
    fileName: name, format, name: String(called || stem).slice(0, 200),
    description: record.description === "<unknown description>" ? "" : String(record.description ?? ""),
    sequence, circular: record.annotations.get("topology") === "circular", features,
  };
}

/**
 * What is marked on a stretch of a sequence, as it would be marked on that stretch alone.
 *
 * A PCR's product is a stretch of its template, so whatever was marked there is marked on the
 * product, moved to where it now is. Something only partly inside is kept as far as it is inside,
 * and its name says so, since half a gene is not the gene.
 *
 * @param features - What is marked on the whole sequence.
 * @param from - Where the stretch starts.
 * @param to - Where it stops.
 * @param shift - How many bases the stretch is preceded by where it is going, such as a primer's tail.
 * @returns What is marked on the stretch.
 */
export function carryFeatures(features: readonly PartFeature[], from: number, to: number, shift = 0): PartFeature[] {
  const carried: PartFeature[] = [];
  for (const feature of features) {
    const inside = feature.parts.map((part) => ({ start: Math.max(part.start, from), end: Math.min(part.end, to) })).filter((part) => part.end > part.start);
    if (inside.length === 0) continue;
    const whole = inside.length === feature.parts.length && inside.every((part, at) => part.start === feature.parts[at]!.start && part.end === feature.parts[at]!.end);
    carried.push({ type: feature.type, strand: feature.strand, label: whole ? feature.label : `${feature.label} (part)`.slice(0, 200),
                   parts: inside.map((part) => ({ start: part.start - from + shift, end: part.end - from + shift })) });
  }
  return carried;
}

/**
 * What a kind of feature's colour means, in the theme's terms.
 *
 * @param type - The feature's type, as sequence files say it.
 * @returns One of the theme's meanings.
 */
export function featureTone(type: string): "yours" | "theirs" | "held" | "found" | "good" | "attention" | "dim" {
  switch (type) {
    case "CDS": case "gene": return "yours";
    case "promoter": return "held";
    case "terminator": return "attention";
    case "rep_origin": return "theirs";
    case "primer_bind": return "found";
    case "misc_feature": case "regulatory": return "good";
    default: return "dim";
  }
}

/** A molecule as a scene draws one. It is the shape `@biolibs/bionet-scene` takes, so it can be handed straight over. */
export interface DrawnMolecule {
  name: string;
  length: number;
  circular: boolean;
  /** Each piece of each feature, with the theme's meaning for its colour. */
  features: { start: number; end: number; strand: -1 | 0 | 1; tone: ReturnType<typeof featureTone>; label: string }[];
}

/**
 * A part as a molecule to draw in a scene.
 *
 * @param part - Its name, length, shape and what is marked on it.
 * @returns The molecule, with each feature's pieces as stretches and its colour as a meaning.
 *
 * @example
 * ```ts
 * import { moleculeOf } from "@biolibs/bionet-tools";
 *
 * const drawn = moleculeOf({ name: "pUC19", length: 2686, circular: true, features: [{ type: "CDS", label: "bla", strand: -1, parts: [{ start: 1626, end: 2487 }] }] });
 * drawn.features[0].tone;    // "yours"
 * ```
 */
export function moleculeOf(part: { name: string; length: number; circular: boolean; features: readonly PartFeature[] }): DrawnMolecule {
  return {
    name: part.name, length: part.length, circular: part.circular,
    features: part.features.flatMap((feature) => feature.parts.map((piece) => ({ start: piece.start, end: piece.end, strand: feature.strand, tone: featureTone(feature.type), label: feature.label }))),
  };
}
