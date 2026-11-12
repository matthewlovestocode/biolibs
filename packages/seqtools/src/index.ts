/**
 * @packageDocumentation
 * Practical wet-lab sequence utilities: GC content and skew, melting
 * temperature estimates, and restriction-enzyme site finding and digestion.
 */

import { BioError } from "@biolibs/core";
import { reverseComplement } from "@biolibs/seq";

/**
 * GC fraction of a sequence. `G`, `C` and the IUPAC code `S` (G or C) count as
 * GC. The denominator is the full sequence length, so other ambiguity codes
 * lower the result.
 *
 * @param seq - DNA/RNA sequence (case-insensitive).
 * @returns A value in `[0, 1]`; `0` for an empty sequence.
 *
 * @example
 * ```ts
 * gcContent("ATGC"); // 0.5
 * ```
 */
export function gcContent(seq: string): number {
  if (!seq.length) return 0;
  let gc = 0;
  for (const c of seq.toUpperCase()) if (c === "G" || c === "C" || c === "S") gc++;
  return gc / seq.length;
}

/**
 * GC skew, `(G − C) / (G + C)`. Positive values mean G-rich; the sign of the
 * cumulative skew is used to locate replication origins.
 *
 * @param seq - DNA sequence (case-insensitive).
 * @returns A value in `[-1, 1]`; `0` when the sequence has no G or C.
 */
export function gcSkew(seq: string): number {
  let g = 0, c = 0;
  for (const ch of seq.toUpperCase()) { if (ch === "G") g++; else if (ch === "C") c++; }
  return g + c === 0 ? 0 : (g - c) / (g + c); // avoid dividing by zero
}

/**
 * Basic melting-temperature estimate for a DNA oligo, in °C.
 *
 * - Under 14 nt: Wallace rule, `2·(A+T) + 4·(G+C)`.
 * - 14 nt or longer: `64.9 + 41·(G+C − 16.4) / N`.
 *
 * Ignores salt, strand concentration and nearest-neighbour effects, so use it
 * for screening rather than final primer design.
 *
 * @param seq - DNA oligo (case-insensitive).
 * @returns Estimated Tm in °C.
 * @throws {@link BioError} for an empty sequence.
 */
export function meltingTemp(seq: string): number {
  const s = seq.toUpperCase();
  const n = s.length;
  if (!n) throw new BioError("Empty sequence");
  let gc = 0;
  for (const c of s) if (c === "G" || c === "C") gc++;
  // Wallace: (n - gc) is the AT count here (assumes no ambiguity codes).
  return n < 14 ? 2 * (n - gc) + 4 * gc : 64.9 + (41 * (gc - 16.4)) / n;
}

/** Definition of a restriction enzyme. Pass your own objects of this shape to add enzymes. */
export interface RestrictionEnzyme {
  /** Enzyme name, for example `"EcoRI"`. */
  name: string;
  /** Recognition sequence; IUPAC ambiguity codes are allowed. */
  site: string;
  /** Top-strand cut position, as an offset from the start of the site. */
  cut: number;
}

/**
 * Built-in enzymes keyed by name: EcoRI, BamHI, HindIII, NotI, XhoI, NdeI,
 * SalI, PstI, SmaI, KpnI, XbaI, SacI, EcoRV.
 */
export const ENZYMES: Readonly<Record<string, RestrictionEnzyme>> = Object.fromEntries(
  (
    [
      // [name, recognition site, top-strand cut offset]
      ["EcoRI", "GAATTC", 1],
      ["BamHI", "GGATCC", 1],
      ["HindIII", "AAGCTT", 1],
      ["NotI", "GCGGCCGC", 2],
      ["XhoI", "CTCGAG", 1],
      ["NdeI", "CATATG", 2],
      ["SalI", "GTCGAC", 1],
      ["PstI", "CTGCAG", 5],
      ["SmaI", "CCCGGG", 3],
      ["KpnI", "GGTACC", 5],
      ["XbaI", "TCTAGA", 1],
      ["SacI", "GAGCTC", 5],
      ["EcoRV", "GATATC", 3],
    ] as const
  ).map(([name, site, cut]) => [name, { name, site, cut }]),
);

/** Regex fragments for each IUPAC code, used to turn a site into a pattern. */
const IUPAC: Record<string, string> = {
  A: "A", C: "C", G: "G", T: "T", R: "[AG]", Y: "[CT]", S: "[GC]", W: "[AT]",
  K: "[GT]", M: "[AC]", B: "[CGT]", D: "[AGT]", H: "[ACT]", V: "[ACG]", N: "[ACGT]",
};

/**
 * Compile a recognition site into a global regex. The site is wrapped in a
 * lookahead `(?=(...))` so overlapping matches are all found, and match
 * `index` is the start of each site.
 *
 * @param site - Recognition sequence (IUPAC allowed).
 */
const siteRegex = (site: string) => new RegExp(`(?=(${[...site].map((c) => IUPAC[c] ?? c).join("")}))`, "g");

/**
 * Find recognition sites in a DNA sequence. Overlapping sites are included.
 * Non-palindromic sites are also searched on the reverse strand; those hits
 * are reported at their position in forward-strand coordinates.
 *
 * @param dna - DNA sequence (case-insensitive).
 * @param enzyme - A name from {@link ENZYMES}, or a {@link RestrictionEnzyme}.
 * @returns Sorted 0-based start positions of the sites.
 * @throws {@link BioError} for an unknown enzyme name.
 *
 * @example
 * ```ts
 * findSites("AAAGAATTCCCC", "EcoRI"); // [3]
 * ```
 */
export function findSites(dna: string, enzyme: RestrictionEnzyme | string): number[] {
  const e = typeof enzyme === "string" ? ENZYMES[enzyme] : enzyme;
  if (!e) throw new BioError(`Unknown enzyme: ${String(enzyme)}`);
  const s = dna.toUpperCase();
  const out: number[] = [];
  // Forward strand.
  for (const m of s.matchAll(siteRegex(e.site))) out.push(m.index!);
  // A palindromic site equals its own reverse complement, so searching again
  // would double-count; only non-palindromic sites need the second pass.
  const rc = reverseComplement(e.site);
  if (rc !== e.site) {
    for (const m of s.matchAll(siteRegex(rc))) out.push(m.index!);
    out.sort((a, b) => a - b); // merge the two strands' hits in order
  }
  return out;
}

/**
 * Digest a **linear** DNA molecule with one or more enzymes and return the
 * fragments in order. Only top-strand cuts are modelled, so overhangs are
 * ignored; fragments are slices of the input.
 *
 * @param dna - DNA sequence.
 * @param enzymes - Enzyme names and/or {@link RestrictionEnzyme} objects.
 * @returns Fragments from 5' to 3'; a single element (the whole sequence) if
 *   there are no cuts.
 * @throws {@link BioError} for an unknown enzyme name.
 *
 * @example
 * ```ts
 * digest("AAAGAATTCCCCGGATCCTTT", ["EcoRI", "BamHI"]);
 * // ["AAAG", "AATTCCCCG", "GATCCTTT"]
 * ```
 */
export function digest(dna: string, enzymes: (RestrictionEnzyme | string)[]): string[] {
  // A Set de-duplicates cut positions shared by several enzymes.
  const cuts = new Set<number>();
  for (const e of enzymes) {
    const resolved = typeof e === "string" ? ENZYMES[e] : e;
    if (!resolved) throw new BioError(`Unknown enzyme: ${String(e)}`);
    for (const p of findSites(dna, resolved)) cuts.add(p + resolved.cut);
  }
  // Boundaries of the fragments: start, every interior cut (sorted), end.
  // Cuts at the very ends would create empty fragments, so they are dropped.
  const points = [0, ...[...cuts].filter((c) => c > 0 && c < dna.length).sort((a, b) => a - b), dna.length];
  const frags: string[] = [];
  for (let i = 0; i < points.length - 1; i++) frags.push(dna.slice(points[i]!, points[i + 1]!));
  return frags;
}
