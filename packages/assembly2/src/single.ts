/**
 * What one fragment can do on its own: close into a circle, splice a piece out of itself, or turn a
 * piece of itself round.
 *
 * The graph is built from the fragment against itself, in both orientations, which is how a repeat at
 * two places in one molecule becomes an edge.
 */

import { ValueError } from "@biolibs/core";
import type { Dseqrecord } from "@biolibs/dseqrecord";
import { locationBoundaries } from "@biolibs/dseqrecord";
import { type AssemblyAlgorithm, commonSubStrings } from "./algorithms.js";
import { type EdgeAssembly, assemble } from "./assemble.js";
import { type Fragment, isCircularFragment } from "./fragment.js";
import { Assembly, NotImplementedError } from "./assembly.js";
import { simpleCycles } from "./cycles.js";
import { limitIterator } from "./traverse.js";

/**
 * Mirrors `pydna.assembly2.SingleFragmentAssembly`.
 *
 * @example
 * ```ts
 * new SingleFragmentAssembly([fragment], 20).assembleCircular();   // the circle it can close into
 * ```
 */
export class SingleFragmentAssembly extends Assembly {
  /**
   * @param fragments - Exactly one fragment.
   * @param limit - The shortest overlap that counts.
   * @param algorithm - How to find overlaps.
   * @throws `ValueError` for any number of fragments but one.
   */
  constructor(fragments: readonly Fragment[], limit: number | null = 25, algorithm: AssemblyAlgorithm = commonSubStrings) {
    if (fragments.length !== 1) throw new ValueError("SingleFragmentAssembly assembly must be initialised with a single fragment");
    super(fragments, limit, algorithm, true, true);
  }

  /** The fragment against itself, both ways round. */
  protected override buildGraph(): void {
    const fragment = this.fragments[0]!;
    const flipped = fragment.reverseComplement();
    this.graph.addNode(1);
    this.graph.addNode(-1);
    const ways: [Fragment, Fragment, number, number][] = [
      [fragment, fragment, 1, 1],
      [fragment, flipped, 1, -1],
      [flipped, fragment, -1, 1],
    ];
    for (const [first, second, u, v] of ways) {
      // A match as long as the whole molecule is the molecule itself, not a join.
      for (const match of this.algorithm(first as never, second as never, this.limit)) {
        if (match[2] !== fragment.length) this.addEdgesFromMatch(match, u, v, first, second);
      }
    }
    this.graph.removeEdges(-1, -1);
  }

  /**
   * The circles the fragment can close into.
   *
   * @param onlyAdjacentEdges - Whether a fragment may only be joined at neighbouring places on itself.
   * @param maxAssemblies - The limit.
   * @returns The assemblies.
   */
  override getCircularAssemblies(onlyAdjacentEdges = false, maxAssemblies = 50): EdgeAssembly[] {
    // A join of a stretch to itself is not a join at all.
    return super.getCircularAssemblies(onlyAdjacentEdges, maxAssemblies)
      .filter((assembly) => String(assembly[0]![2]) !== String(assembly[0]![3]))
      .filter((assembly) => this.isValid(assembly, true));
  }

  /**
   * The molecules made by splicing a piece out of the fragment.
   *
   * @param onlyAdjacentEdges - Not supported.
   * @param maxAssemblies - The limit.
   * @returns The assemblies.
   */
  override getInsertionAssemblies(onlyAdjacentEdges = false, maxAssemblies = 50): EdgeAssembly[] {
    if (onlyAdjacentEdges) throw new NotImplementedError("only_adjacent_edges not implemented for insertion assemblies");
    return super.getInsertionAssemblies(false, maxAssemblies)
      .filter((assembly) => this.splicingFilter(assembly))
      .filter((assembly) => this.isValid(assembly, false, true));
  }

  /** @param assembly - The joins. @returns Whether they splice out a piece rather than remake the molecule. */
  private splicingFilter(assembly: EdgeAssembly): boolean {
    const [, , left, right] = assembly[0]!;
    if (String(left) === String(right)) return false;
    const start = locationBoundaries(left)[0];
    const end = locationBoundaries(right)[1];
    return !(start === 0 && end === this.fragments[0]!.length);
  }

  /** @returns Never: one fragment cannot make a linear product. @throws `NotImplementedError` always. */
  override getLinearAssemblies(): EdgeAssembly[] {
    throw new NotImplementedError("Linear assembly does not make sense");
  }

  /**
   * The molecules made by turning a piece of the fragment round, which happens where a stretch appears
   * twice in opposite directions.
   *
   * @param maxAssemblies - The limit.
   * @returns The assemblies.
   */
  getInversionAssemblies(maxAssemblies = 50): EdgeAssembly[] {
    const cycles = [...limitIterator(simpleCycles(this.graph, null), 10_000)] as number[][];
    const wanted = cycles.some((cycle) => cycle.length === 2 && cycle[0] === 1 && cycle[1] === -1);
    if (!wanted) return [];
    this.checkMaxAssemblies([[1, -1, 1]], maxAssemblies);
    return this.nodePathToAssemblies([1, -1], true).filter((assembly) => this.inversionFilter(assembly));
  }

  /** @param assembly - The joins. @returns Whether they describe a piece turned round. */
  private inversionFilter(assembly: EdgeAssembly): boolean {
    if (assembly.length !== 2) return false;
    const [left, right] = assembly as [EdgeAssembly[number], EdgeAssembly[number]];
    const length = this.fragments[0]!.length;
    if (String(left[2]) === String(right[2].flip(length)) && String(left[3]) === String(right[3].flip(length))) {
      return locationBoundaries(left[2])[0] < locationBoundaries(right[3])[0];
    }
    return false;
  }

  /** @param maxAssemblies - The limit. @returns The products with a piece turned round. */
  assembleInversion(maxAssemblies = 50): Dseqrecord[] {
    const isInsertion = !isCircularFragment(this.fragments[0]!);
    return this.getInversionAssemblies(maxAssemblies).map((assembly) => assemble(this.fragments, assembly, isInsertion));
  }
}
