/**
 * Turning a walk through the graph into a molecule.
 *
 * An assembly is a list of edges: fragment `u` joins fragment `v`, sharing this stretch of each. To make
 * the molecule, that is first turned inside out — from the joins to the *pieces*, each with the stretch
 * it shares at either end — and then the pieces are trimmed back over their shared stretches and added
 * up. A negative fragment number means the fragment is used the other way round.
 */

import { ValueError } from "@biolibs/core";
import { annealStrands, type Dseq, exo1End, exo1Front } from "@biolibs/dseq";
import { Dseqrecord, locationBoundaries } from "@biolibs/dseqrecord";
import type { Location } from "@biolibs/seqfeature";
import { type Fragment, asRecord, isCircularFragment, textOf } from "./fragment.js";
import { locationLength, locationText, locationsOverlap } from "./locations.js";
import { AssemblySource } from "./source.js";

/** One join: the two fragments, and the stretch shared on each. */
export type AssemblyEdge = readonly [u: number, v: number, locU: Location, locV: Location];
/** One piece: the fragment, the stretch shared with what comes before, and with what comes after. */
export type SubFragment = readonly [node: number, left: Location | null, right: Location | null];
/** A whole assembly, as the joins that make it. */
export type EdgeAssembly = readonly AssemblyEdge[];
/** A whole assembly, as the pieces that make it. */
export type SubFragmentAssembly = readonly SubFragment[];

/** @param edge - A join. @returns It as `"1[8:14]:2[1:7]"`, which is how pydna prints one. */
export function edgeToString(edge: AssemblyEdge): string {
  return `${edge[0]}${String(edge[2])}:${edge[1]}${String(edge[3])}`;
}

/** @param items - Some text. @returns It as Python prints a tuple of strings. */
const pyTuple = (items: readonly string[]): string => `(${items.join(", ")}${items.length === 1 ? "," : ""})`;

/**
 * @param assembly - An assembly.
 * @returns Its joins, as pydna prints them: `"('1[8:14]:2[1:7]', '2[10:17]:3[1:8]')"`.
 */
export function assemblyToString(assembly: EdgeAssembly): string {
  return pyTuple(assembly.map((edge) => `'${edgeToString(edge)}'`));
}

/**
 * @param assembly - An assembly.
 * @returns Its joins with the fragments kept apart from the stretches:
 * `"((1, 2, '[8:14]', '[1:7]'),)"`.
 */
export function assemblyToStringTuple(assembly: EdgeAssembly): string {
  return pyTuple(assembly.map(([u, v, locU, locV]) => `(${u}, ${v}, '${String(locU)}', '${String(locV)}')`));
}

/**
 * Whether any two stretches an assembly joins at are not in fact the same bases.
 *
 * This should never happen: the overlap finders only report places that do agree. It is here because
 * pydna keeps it as a check on itself.
 *
 * @param fragments - The fragments. @param assembly - The joins.
 * @returns Whether any join is between stretches that differ.
 */
export function assemblyHasMismatches(fragments: readonly Fragment[], assembly: EdgeAssembly): boolean {
  for (const [u, v, locU, locV] of assembly) {
    const textU = locationText(locU, textOf(fragmentAt(fragments, u))).toUpperCase();
    const textV = locationText(locV, textOf(fragmentAt(fragments, v))).toUpperCase();
    if (textU !== textV) return true;
  }
  return false;
}

/** @param a - One assembly. @param b - Another. @returns Whether they are the same joins in the same order. */
export function sameAssembly(a: EdgeAssembly, b: EdgeAssembly): boolean {
  return a.length === b.length && a.every((edge, at) => edgeToString(edge) === edgeToString(b[at]!));
}

/**
 * @param fragments - The fragments. @param node - A signed fragment number.
 * @returns That fragment, turned round if the number is negative.
 */
export function fragmentAt(fragments: readonly Fragment[], node: number): Fragment {
  const found = fragments[Math.abs(node) - 1]!;
  return node > 0 ? found : found.reverseComplement();
}

/**
 * Turn the joins inside out: from "u meets v here" to "this is the piece of u that is used".
 *
 * @param assembly - The joins.
 * @param isCircular - Whether the molecule closes on itself.
 * @returns The pieces, in order.
 * @example
 * ```ts
 * // [(1, 2, locA, locB), (2, 3, locC, locD)] becomes [(1, null, locA), (2, locB, locC), (3, locD, null)]
 * ```
 */
export function edgeToSubFragment(assembly: EdgeAssembly, isCircular: boolean): SubFragmentAssembly {
  type Padded = readonly [number | null, number | null, Location | null, Location | null];
  const padded: Padded[] = isCircular
    ? [assembly[assembly.length - 1]!, ...assembly]
    : [[null, assembly[0]![0], null, null], ...assembly, [assembly[assembly.length - 1]![1], null, null, null]];
  const pieces: SubFragment[] = [];
  for (let at = 0; at + 1 < padded.length; at++) {
    const [, node, , start] = padded[at]!;
    const [, , end] = padded[at + 1]!;
    pieces.push([node!, start, end]);
  }
  return pieces;
}

/**
 * Turn the pieces back into joins.
 *
 * @param assembly - The pieces.
 * @param isCircular - Whether the molecule closes on itself.
 * @returns The joins.
 */
export function subFragmentToEdge(assembly: SubFragmentAssembly, isCircular: boolean): EdgeAssembly {
  const edges: AssemblyEdge[] = [];
  for (let at = 0; at + 1 < assembly.length; at++) {
    const [first, , right] = assembly[at]!;
    const [second, left] = assembly[at + 1]!;
    edges.push([first, second, right!, left!]);
  }
  if (isCircular && assembly.length > 0) {
    const [last, , right] = assembly[assembly.length - 1]!;
    const [first, left] = assembly[0]!;
    edges.push([last, first, right!, left!]);
  }
  return edges;
}

/**
 * Whether a walk closes into a circle.
 *
 * It ends where it began, and either it began on a molecule that is already circular, or the stretch it
 * leaves the first fragment by comes after the stretch it returns to.
 *
 * @param assembly - The joins. @param fragments - The fragments.
 * @returns Whether the product is circular.
 */
export function assemblyIsCircular(assembly: EdgeAssembly, fragments: readonly Fragment[]): boolean {
  if (assembly[0]![0] !== assembly[assembly.length - 1]![1]) return false;
  const first = fragments[Math.abs(assembly[0]![0]) - 1]!;
  if (isCircularFragment(first)) return true;
  return locationBoundaries(assembly[0]![2])[0] > locationBoundaries(assembly[assembly.length - 1]![3])[0];
}

/**
 * The piece of a fragment between two shared stretches.
 *
 * @param record - The fragment.
 * @param start - The stretch it shares with what comes before, or null for its own beginning.
 * @param end - The stretch it shares with what comes after, or null for its own end.
 * @returns The piece.
 * @throws `ValueError` if a circular fragment is asked for a piece with an open end.
 */
export function extractSubfragment(record: Dseqrecord, start: Location | null, end: Location | null): Dseqrecord {
  if (record.circular && (start === null || end === null)) {
    throw new ValueError("Start and end locations cannot be None for circular sequences");
  }
  const from = start === null ? 0 : locationBoundaries(start)[0];
  const to = end === null ? null : locationBoundaries(end)[1];
  // Where the two stretches meet on a circle, the piece is the whole circle opened at that point, which
  // slicing cannot express: it is cut open instead, with the same cut used for both ends.
  if (record.circular && start !== null && end !== null && locationsOverlap(start, end, record.length)) {
    let ovhg = to! > from ? from - to! : from - to! - record.length;
    if (Math.abs(ovhg) === record.length) ovhg = 0;
    const cut = { watson: from, ovhg, enzyme: null };
    const opened = record.applyCut(cut, cut);
    const out = new Dseqrecord(opened.dseq.castToDs());
    out.features = [...opened.features];
    return out;
  }
  return record.slice(from, to) as Dseqrecord;
}

/**
 * The pieces an assembly is made of, cut out of the fragments.
 *
 * @param fragments - The fragments. @param assembly - The pieces to take.
 * @returns The pieces.
 */
export function getAssemblySubfragments(fragments: readonly Dseqrecord[], assembly: SubFragmentAssembly): Dseqrecord[] {
  return assembly.map(([node, start, end]) => extractSubfragment(fragmentAt(fragments, node) as Dseqrecord, start, end));
}

/**
 * Build the molecule an assembly describes.
 *
 * Each piece is trimmed back over the stretch it shares with the next, so that the shared stretch is
 * counted once, and the pieces are added up. A circular product is then closed.
 *
 * @param fragments - The fragments.
 * @param assembly - The joins.
 * @param isInsertion - Whether this is an insertion, which never closes into a circle.
 * @returns The product, with the provenance of how it was made.
 * @throws `ValueError` if two stretches that are supposed to join do not pair.
 */
export function assemble(fragments: readonly Fragment[], assembly: EdgeAssembly, isInsertion = false): Dseqrecord {
  const isCircular = isInsertion ? false : assemblyIsCircular(assembly, fragments);
  const pieces = edgeToSubFragment(assembly, isCircular);

  for (const [u, v, locU, locV] of assembly) {
    const fragmentU = fragmentAt(fragments, u);
    const fragmentV = fragmentAt(fragments, v);
    const textU = locationText(locU, textOf(fragmentU));
    const textV = locationText(locV, textOf(fragmentV));
    const flipped = [...textV].reverse().map(complementOf).join("");
    if (!annealStrands(textU, flipped)) throw new ValueError("Mismatch in assembly");
  }

  const records = fragments.map(asRecord);
  const subfragments = getAssemblySubfragments(records, pieces);
  const overlaps = assembly.map((edge) => locationLength(edge[3]));

  let out = subfragments.shift()!;
  subfragments.forEach((piece, at) => {
    const overlap = overlaps[at]!;
    out = withSeq(out, exo1End(out.dseq.castToDsRight(), overlap));
    out = out.add(withSeq(piece, exo1Front(piece.dseq.castToDsLeft(), overlap)));
  });
  if (isCircular) {
    const overlap = overlaps[overlaps.length - 1]!;
    let closing: Dseq = out.dseq.castToDsLeft().castToDsRight();
    closing = exo1Front(closing, overlap);
    closing = exo1End(closing, overlap);
    out = withSeq(out, closing).looped();
  }
  out.source = AssemblySource.fromSubFragments(pieces, fragments, isCircular);
  return out;
}

/**
 * The same record carrying a different molecule.
 *
 * pydna assigns to `record.seq`; here a record holds a `Dseq`, which is not the kind of sequence a
 * record's own setter takes, so a new record is built instead. Chewing an end back leaves the molecule
 * the same length, so the features keep their places.
 *
 * @param record - The record. @param sequence - The molecule to put in it.
 * @returns The new record.
 */
export function withSeq(record: Dseqrecord, sequence: Dseq): Dseqrecord {
  const out = new Dseqrecord(sequence, null, record.n, record.id, record.name, record.description);
  out.features = [...record.features];
  out.annotations = new Map(record.annotations);
  out.source = record.source;
  return out;
}

/** @param base - One base. @returns Its complement, keeping the case. */
function complementOf(base: string): string {
  const table: Record<string, string> = { a: "t", c: "g", g: "c", t: "a", u: "a" };
  const lower = base.toLowerCase();
  const mapped = table[lower] ?? lower;
  return base === lower ? mapped : mapped.toUpperCase();
}

/**
 * The same assembly read from the other strand: the fragments in reverse order, each turned round.
 *
 * @param assembly - The joins. @param fragments - The fragments.
 * @returns The joins, complemented.
 */
export function reverseComplementAssembly(assembly: EdgeAssembly, fragments: readonly Fragment[]): EdgeAssembly {
  const out: AssemblyEdge[] = [];
  for (const [u, v, locU, locV] of assembly) {
    const lengthU = fragments[Math.abs(u) - 1]!.length;
    const lengthV = fragments[Math.abs(v) - 1]!.length;
    out.push([-v, -u, locV.flip(lengthV), locU.flip(lengthU)]);
  }
  return out.reverse();
}

/**
 * Drop the assemblies that are only part of another one.
 *
 * @param assemblies - The assemblies.
 * @returns The ones that stand alone, longest first.
 */
export function removeSubassemblies(assemblies: readonly EdgeAssembly[]): EdgeAssembly[] {
  const byLength = [...assemblies].sort((a, b) => b.length - a.length);
  const kept: EdgeAssembly[] = [];
  for (const assembly of byLength) {
    if (!kept.some((other) => containsRun(assembly, other, false))) kept.push(assembly);
  }
  return kept;
}

/**
 * Drop the linear assemblies that are part of a circular one, which would be made as the circle instead.
 *
 * @param linear - The linear assemblies. @param circular - The circular ones. @param fragments - The fragments.
 * @returns The linear assemblies that stand alone.
 */
export function filterLinearSubassemblies(linear: readonly EdgeAssembly[], circular: readonly EdgeAssembly[],
                                          fragments: readonly Fragment[]): EdgeAssembly[] {
  const every = [...circular, ...circular.map((one) => reverseComplementAssembly(one, fragments))];
  return linear.filter((one) => !every.some((whole) => containsRun(one, whole, true)));
}

/**
 * Whether one assembly's joins appear, in order, inside another's.
 *
 * @param part - The shorter assembly. @param whole - The longer one.
 * @param cyclic - Whether the longer one is a ring.
 * @returns Whether it appears.
 */
function containsRun(part: EdgeAssembly, whole: EdgeAssembly, cyclic: boolean): boolean {
  const list = cyclic ? [...whole, ...whole] : whole;
  for (let at = 0; at + part.length <= list.length; at++) {
    if (part.every((edge, i) => edgeToString(edge) === edgeToString(list[at + i]!))) return true;
  }
  return false;
}

/**
 * Mark where the two primers sat on a PCR product.
 *
 * @param product - The product. @param fragments - The primer, template and primer it was made from.
 * @returns A copy with a `primer_bind` feature at each end.
 */
export function annotatePrimerBindingSites(product: Dseqrecord, fragments: readonly Fragment[]): Dseqrecord {
  const [forward, , reverse] = fragments;
  const out = product.copy() as Dseqrecord;
  const name = (fragment: Fragment): string => (fragment as { name?: string }).name ?? "name";
  out.addFeature(0, forward!.length, null, "primer_bind", 1,
                 { label: [name(forward!)], note: [`sequence: ${textOf(forward!)}`] });
  out.addFeature(out.length - reverse!.length, out.length, null, "primer_bind", -1,
                 { label: [name(reverse!)], note: [`sequence: ${textOf(reverse!)}`] });
  return out;
}

export type { Fragment };
