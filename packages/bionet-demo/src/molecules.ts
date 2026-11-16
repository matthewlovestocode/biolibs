/**
 * The molecules the demo lab holds, made rather than pasted.
 *
 * A demo has to be the same every time, and everything in it has to be real: the enzymes must cut
 * where the tour says, the primers must bind, and the pieces must join. So the sequences are built
 * here from a fixed starting number, with the sites and the gene put where the tour needs them and
 * every other site patched out — a site on one of these plasmids is always one somebody planted.
 * The package's tests check that what comes out still does what the tour says it does.
 */
import type { PartFeature } from "@biolibs/bionet";
import { cutSites, cutsOf, digestPieces } from "@biolibs/bionet-tools";

/** The sites the demo plants, and which it keeps out of everything else. */
const PLANTED = { ecoRI: "GAATTC", bamHI: "GGATCC" } as const;

/** Sites kept out of the filler, so that every site on these plasmids was put there on purpose. */
const AVOID = ["GAATTC", "GGATCC", "AAGCTT", "CTCGAG", "GCGGCCGC", "ACCGGT", "GGTACC", "CATATG", "CCCGGG",
               "AGATCT", "GGCGCGCC", "GTCGAC", "GCTAGC", "TCTAGA", "CTGCAG", "CCATGG", "GAGCTC", "ATCGAT",
               "ACGCGT", "GATATC", "GGGCCC", "GGTCTC", "CGTCTC"];

const PAIR: Readonly<Record<string, string>> = { A: "T", T: "A", G: "C", C: "G" };

/**
 * The other strand of a stretch of DNA, read 5′ to 3′.
 *
 * @param bases - The stretch.
 * @returns Its partner.
 */
export function otherStrand(bases: string): string {
  return [...bases].reverse().map((base) => PAIR[base] ?? "N").join("");
}

/** The same bases every time, from a number that is written down. */
function bases(seed: { at: number }, many: number): string {
  const next = (): number => (seed.at = (seed.at * 1103515245 + 12345) % 2147483648) / 2147483648;
  const patterns = [...new Set(AVOID.flatMap((site) => [site, otherStrand(site)]))];
  let made = Array.from({ length: many }, () => "ACGT"[Math.floor(next() * 4)]!).join("");
  // A site that turned up by chance is written over in the middle, and the scan runs again in case
  // writing over it made another.
  for (let guard = 0; guard < 500; guard++) {
    let again = false;
    for (const site of patterns) {
      const at = made.indexOf(site);
      if (at === -1) continue;
      again = true;
      made = made.slice(0, at + 3) + "ACGT"[Math.floor(next() * 4)]! + made.slice(at + 4);
    }
    if (!again) return made;
  }
  throw new Error("The filler could not be made free of the sites the demo plants.");
}

/** One molecule the demo lab holds. */
export interface DemoMolecule {
  /** What the lab calls it. */
  name: string;
  /** Its bases, every one either strand has. */
  sequence: string;
  /** Whether it is a circle. */
  circular: boolean;
  /** What is marked on it. */
  features: PartFeature[];
  /** How many bases at each end are on one strand only, for a piece that was cut. */
  ends?: { left: number; right: number };
}

/** Everything the demo lab starts with. */
export interface DemoMolecules {
  /** The small plasmid the gene is taken out of. */
  pGene: DemoMolecule;
  /** The backbone the gene is going into, already cut and waiting in the freezer. */
  backbone: DemoMolecule;
  /** The two primers the gene is checked with. */
  forward: DemoMolecule;
  reverse: DemoMolecule;
  /** Where the gene sits on `pGene`, for what the tour says about it. */
  gene: { start: number; end: number };
}

/**
 * The demo lab's molecules.
 *
 * `pGene` is a small plasmid with one gene between an EcoRI site and a BamHI site. `backbone` is a
 * bigger plasmid already cut with the same two enzymes and run on a gel, waiting as a linear piece
 * with sticky ends. Cutting `pGene` with those two enzymes and joining the gene to the backbone is
 * the whole of what the tour does, and it is ordinary subcloning.
 *
 * @returns The molecules, the same every time.
 *
 * @example
 * ```ts
 * import { demoMolecules } from "@biolibs/bionet-demo";
 *
 * const { pGene } = demoMolecules();
 * pGene.circular;    // true
 * ```
 */
export function demoMolecules(): DemoMolecules {
  const seed = { at: 20261116 };
  const gene = bases(seed, 780);
  const before = bases(seed, 300);
  const pGene = `${before}${PLANTED.ecoRI}${gene}${PLANTED.bamHI}${bases(seed, 620)}`;
  const vector = `${bases(seed, 1500)}${PLANTED.ecoRI}${bases(seed, 140)}${PLANTED.bamHI}${bases(seed, 1200)}`;
  // The backbone is not described: it is cut, by the same code the gel station cuts with, so that
  // what waits in the freezer is exactly what that plasmid gives when those two enzymes are used.
  const whole = { sequence: vector, circular: true };
  const sites = [PLANTED.ecoRI, PLANTED.bamHI].map((_, index) => ["EcoRI", "BamHI"][index]!)
    .flatMap((name) => { const cutter = cutsOf(whole, name); return cutter === null ? [] : cutSites(whole, cutter); });
  const cut = digestPieces(whole, sites);
  const backbone = cut[0]!;
  const geneAt = { start: before.length + 6, end: before.length + 6 + gene.length };
  const mark = (type: string, label: string, strand: -1 | 0 | 1, start: number, end: number): PartFeature =>
    ({ type, label, strand, parts: [{ start, end }] });
  return {
    pGene: {
      name: "pGene", sequence: pGene, circular: true,
      features: [
        mark("CDS", "wrenA", 1, geneAt.start, geneAt.end),
        mark("promoter", "lac promoter", 1, before.length - 90, before.length - 20),
        mark("rep_origin", "ori", 1, geneAt.end + 60, geneAt.end + 480),
      ],
    },
    backbone: {
      name: "pWren backbone", sequence: backbone.sequence, circular: false, ends: backbone.ends,
      features: [mark("CDS", "AmpR", -1, 300, 1160), mark("rep_origin", "ori", 1, 1400, 1820)],
    },
    forward: { name: "wrenA-F", sequence: gene.slice(40, 62), circular: false, features: [] },
    reverse: { name: "wrenA-R", sequence: otherStrand(gene.slice(520, 542)), circular: false, features: [] },
    gene: geneAt,
  };
}
