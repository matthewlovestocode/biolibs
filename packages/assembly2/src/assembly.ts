/**
 * `Assembly`: the graph of how a set of fragments can be joined, and the molecules that come off it.
 *
 * There is a node for every fragment in each of its two orientations, and an edge wherever the overlap
 * finder says two of them meet. A path through the graph is a linear molecule, a cycle is a circular
 * one, and a cycle that is allowed to pass through one fragment twice is an insertion into it.
 */

import { ValueError } from "@biolibs/core";
import { locationBoundaries, shiftLocation } from "@biolibs/dseqrecord";
import { type Location, SimpleLocation } from "@biolibs/seqfeature";
import { type AssemblyAlgorithm, commonSubStrings, gibsonOverlap, inFusionOverlap, type Overlap, pcrFusionOverlap } from "./algorithms.js";
import { type AssemblyEdge, type EdgeAssembly, assemble, edgeToSubFragment, removeSubassemblies } from "./assemble.js";
import { type Fragment, isCircularFragment } from "./fragment.js";
import { simpleCycles } from "./cycles.js";
import { MultiDiGraph, type Node } from "./graph.js";
import { gatherOverlappingLocations, locationsOverlap, stableSort } from "./locations.js";
import { Primer } from "./primer.js";
import { circularPermutationMinAbs, deduplicate } from "./pyutils.js";
import { limitIterator, allSimplePaths } from "./traverse.js";
import { formatInsertionAssembly, formatInsertionEdgeCase } from "./insertion.js";

/** What is hung on each edge: the stretch shared on each fragment, and a name for the join. */
export interface EdgeInfo {
  /** The stretch on the first fragment, then on the second. */
  locations: [Location, Location];
  /** The join's name, the same for an edge and the same join read from the other strand. */
  uid: string;
}

/** The names pydna's own overlap finders go by, so that a printed assembly reads as pydna's does. */
const ALGORITHM_NAMES = new Map<AssemblyAlgorithm, string>([
  [commonSubStrings as AssemblyAlgorithm, "common_sub_strings"],
  [gibsonOverlap as AssemblyAlgorithm, "gibson_overlap"],
  [inFusionOverlap as AssemblyAlgorithm, "in_fusion_overlap"],
  [pcrFusionOverlap as AssemblyAlgorithm, "pcr_fusion_overlap"],
]);

/** How many assemblies may be found before the search is called off. */
const DEFAULT_MAX_ASSEMBLIES = 50;
/** How many paths or cycles may be walked before the search is called off. */
const MAX_PATHS = 10_000;

/**
 * Mirrors `pydna.assembly2.Assembly`.
 *
 * @example
 * ```ts
 * const assembly = new Assembly([first, second, third], 20);
 * assembly.assembleCircular();   // the plasmids these three fragments can make
 * ```
 */
export class Assembly {
  /** The graph: fragments as nodes, overlaps as edges. */
  readonly graph = new MultiDiGraph<EdgeInfo>();
  /** The fragments, as they were given. */
  readonly fragments: readonly Fragment[];
  /** The shortest overlap that counts, or null where the finder does not take one. */
  readonly limit: number | null;
  /** How overlaps are found. */
  readonly algorithm: AssemblyAlgorithm;
  /** Whether the fragments may only be joined in the order they were given. */
  readonly useFragmentOrder: boolean;
  /** Whether every fragment has to appear in the product. */
  readonly useAllFragments: boolean;
  /** What the finder is called, for printing. */
  readonly algorithmName: string;

  /**
   * @param fragments - The fragments to assemble.
   * @param limit - The shortest overlap that counts.
   * @param algorithm - How to find overlaps.
   * @param useFragmentOrder - Whether to keep to the order given.
   * @param useAllFragments - Whether every fragment must be used.
   * @param algorithmName - What to call the finder when printing.
   */
  constructor(fragments: readonly Fragment[], limit: number | null = 25, algorithm: AssemblyAlgorithm = commonSubStrings,
              useFragmentOrder = true, useAllFragments = false, algorithmName?: string) {
    this.fragments = fragments;
    this.limit = limit;
    this.algorithm = algorithm;
    this.useFragmentOrder = useFragmentOrder;
    this.useAllFragments = useAllFragments;
    this.algorithmName = algorithmName ?? ALGORITHM_NAMES.get(algorithm) ?? algorithm.name;
    this.buildGraph();
  }

  /** @param node - A signed fragment number. @returns The fragment, turned round if the number is negative. */
  protected sequenceOf(node: number): Fragment {
    const found = this.fragments[Math.abs(node) - 1]!;
    return node > 0 ? found : found.reverseComplement();
  }

  /** Put every fragment in the graph both ways round, and join them wherever they overlap. */
  protected buildGraph(): void {
    const count = this.fragments.length;
    for (let i = 1; i <= count; i++) this.graph.addNode(i);
    for (let i = 1; i <= count; i++) this.graph.addNode(-i);
    for (let i = 1; i <= count; i++) {
      for (let j = i + 1; j <= count; j++) {
        for (const u of [i, -i]) {
          for (const v of [j, -j]) {
            const first = this.sequenceOf(u);
            const second = this.sequenceOf(v);
            for (const match of this.algorithm(first as never, second as never, this.limit)) {
              this.addEdgesFromMatch(match, u, v, first, second);
            }
          }
        }
      }
    }
  }

  /**
   * Add the edge a match stands for, and the same join read from the other strand.
   *
   * @param match - Where the two fragments meet.
   * @param u - The first fragment's number. @param v - The second's.
   * @param first - The first fragment. @param second - The second.
   */
  protected addEdgesFromMatch(match: Overlap, u: number, v: number, first: Fragment, second: Fragment): void {
    const [startX, startY, length] = match;
    const locations: [Location, Location] = length === 0
      ? [new SimpleLocation(startX, startX, null), new SimpleLocation(startY, startY, null)]
      : [shiftLocation(new SimpleLocation(startX, startX + length, null), 0, first.length),
         shiftLocation(new SimpleLocation(startY, startY + length, null), 0, second.length)];
    const flipped: [Location, Location] = [locations[1]!.flip(second.length), locations[0]!.flip(first.length)];
    const uid = `${u}${String(locations[0])}:${v}${String(locations[1])}`;
    for (const [from, to, pair] of [[u, v, locations], [-v, -u, flipped]] as [number, number, [Location, Location]][]) {
      this.graph.addEdge(from, to, `${from}${String(pair[0])}:${to}${String(pair[1])}`, { locations: pair, uid });
    }
  }

  /** @param edge - A graph edge. @returns It as the engine passes assemblies about. */
  protected formatEdge(from: Node, to: Node, key: string): AssemblyEdge {
    const { locations } = this.graph.edgeData(from, to, key)!;
    return [from as number, to as number, locations[0], locations[1]];
  }

  /**
   * Whether a walk through the graph is a molecule that could really be made.
   *
   * @param fragments - The fragments. @param assembly - The joins.
   * @param isCircular - Whether it closes into a circle.
   * @param useAllFragments - Whether every fragment has to appear.
   * @param isInsertion - Whether it is an insertion.
   * @returns Whether it holds up.
   */
  static assemblyIsValid(fragments: readonly Fragment[], assembly: EdgeAssembly, isCircular: boolean | null,
                         useAllFragments: boolean, isInsertion = false): boolean {
    if (isCircular === null) return false;
    if (assembly.length === 0) return false;
    const first = fragments[Math.abs(assembly[0]![0]) - 1]!;
    const last = fragments[Math.abs(assembly[assembly.length - 1]![1]) - 1]!;
    // A circular fragment cannot be part of a linear product: it would have to be cut open first.
    const circularFragment = isCircularFragment;
    if (!isCircular && (circularFragment(first) || circularFragment(last))) return false;
    if (useAllFragments) {
      const used = new Set(assembly.flatMap((edge) => [Math.abs(edge[0]), Math.abs(edge[1])]));
      if (fragments.length !== used.size) return false;
    }
    let pairs: [AssemblyEdge, AssemblyEdge][];
    if (isCircular) {
      if (assembly[0]![0] !== assembly[assembly.length - 1]![1]) return false;
      pairs = assembly.map((edge, at) => [edge, assembly[(at + 1) % assembly.length]!]);
    } else {
      pairs = assembly.slice(0, -1).map((edge, at) => [edge, assembly[at + 1]!]);
    }
    // Within one fragment, the stretch it is entered by has to come before the stretch it is left by.
    for (const [[, node, , start], [, , end]] of pairs) {
      const fragment = fragments[Math.abs(node) - 1]!;
      const isPrimer = fragment instanceof Primer;
      if ((isPrimer || !circularFragment(fragment)) && locationBoundaries(start)[1] >= locationBoundaries(end)[1]) return false;
    }
    const nodes = edgeToSubFragment(assembly, isCircular || isInsertion).map(([node]) => node);
    if (nodes.length !== new Set(nodes.map(Math.abs)).size) return false;
    return true;
  }

  /** @param assembly - The joins. @param isCircular - Whether it closes. @returns Whether it holds up, by this assembly's rules. */
  protected isValid(assembly: EdgeAssembly, isCircular: boolean, isInsertion = false): boolean {
    return Assembly.assemblyIsValid(this.fragments, assembly, isCircular, this.useAllFragments, isInsertion);
  }

  /**
   * Every combination of edges along one walk, since two fragments may overlap in more than one place.
   *
   * @param path - The fragments walked through.
   * @param circular - Whether the walk closes.
   * @returns One assembly for each combination.
   */
  protected nodePathToAssemblies(path: readonly number[], circular: boolean): EdgeAssembly[] {
    const choices: [number, number, string][][] = [];
    const pairs: [number, number][] = circular
      ? path.map((node, at) => [node, path[(at + 1) % path.length]!])
      : path.slice(0, -1).map((node, at) => [node, path[at + 1]!]);
    for (const [from, to] of pairs) choices.push(this.graph.keys(from, to).map((key) => [from, to, key]));
    // The last choice varies fastest, as `itertools.product` varies it.
    let combinations: [number, number, string][][] = [[]];
    for (const choice of choices) {
      const next: [number, number, string][][] = [];
      for (const sofar of combinations) {
        for (const one of choice) next.push([...sofar, one]);
      }
      combinations = next;
    }
    return combinations.map((combination) => combination.map(([from, to, key]) => this.formatEdge(from, to, key)));
  }

  /**
   * How many assemblies the walks could give between them, before any is checked.
   *
   * @param paths - The walks.
   * @returns The count.
   */
  protected possibleAssemblyNumber(paths: readonly (readonly number[])[]): number {
    let total = 0;
    for (const path of paths) {
      let here = 1;
      for (let at = 0; at + 1 < path.length; at++) {
        const keys = this.graph.keys(path[at]!, path[at + 1]!);
        if (keys.length > 0) here *= keys.length;
      }
      total += here;
    }
    return total;
  }

  /** @param paths - The walks. @param max - How many assemblies are allowed. @throws `ValueError` past that. */
  protected checkMaxAssemblies(paths: readonly (readonly number[])[], max: number): void {
    const possible = this.possibleAssemblyNumber(paths);
    if (possible > max) throw new ValueError(`Too many assemblies (${possible} pre-validation) to assemble`);
  }

  /**
   * The walks from one end of the fragment set to the other, with each walk's mirror image left out.
   *
   * @param graph - The graph with the two extra nodes a walk runs between.
   * @returns The walks, as fragment numbers.
   */
  protected uniqueLinearPaths(graph: MultiDiGraph<EdgeInfo>): number[][] {
    const simple = graph.toDiGraph();
    const walked: number[][] = [];
    for (const path of limitIterator(allSimplePaths(simple, "begin", "end", this.fragments.length + 1), MAX_PATHS)) {
      walked.push(path.slice(1, -1) as number[]);
    }
    let paths = walked.filter((path) => path.length === new Set(path.map(Math.abs)).size);
    if (this.useAllFragments) paths = paths.filter((path) => path.length === this.fragments.length);
    const unique: number[][] = [];
    for (const path of paths) {
      const mirrored = [...path].reverse().map((node) => -node);
      if (!unique.some((other) => other.length === mirrored.length && other.every((node, at) => node === mirrored[at]))) {
        unique.push(path);
      }
    }
    return unique;
  }

  /**
   * The linear molecules these fragments can make.
   *
   * @param onlyAdjacentEdges - Whether a fragment may only be joined at neighbouring places on itself.
   * @param maxAssemblies - How many assemblies are allowed before the search is called off.
   * @returns The assemblies.
   */
  getLinearAssemblies(onlyAdjacentEdges = false, maxAssemblies = DEFAULT_MAX_ASSEMBLIES): EdgeAssembly[] {
    const graph = new MultiDiGraph<EdgeInfo>();
    for (const node of this.graph.nodes()) graph.addNode(node);
    for (const edge of this.graph.edges()) graph.addEdge(edge.from, edge.to, edge.key, edge.data);
    graph.addNode("begin");
    graph.addNode("end");
    if (this.useFragmentOrder) {
      graph.addEdge("begin", 1, "0", null as never);
      graph.addEdge("begin", -1, "0", null as never);
      graph.addEdge(this.fragments.length, "end", "0", null as never);
      graph.addEdge(-this.fragments.length, "end", "0", null as never);
    } else {
      for (const node of [...graph.nodes()].filter((node) => typeof node === "number")) {
        graph.addEdge("begin", node, "0", null as never);
        graph.addEdge(node, "end", "0", null as never);
      }
    }
    const paths = this.uniqueLinearPaths(graph);
    this.checkMaxAssemblies(paths, maxAssemblies);
    let found = paths.flatMap((path) => this.nodePathToAssemblies(path, false));
    found = found.filter((assembly) => this.isValid(assembly, false));
    if (onlyAdjacentEdges) found = found.filter((assembly) => this.usesOnlyAdjacentEdges(assembly, false));
    return removeSubassemblies(found);
  }

  /** @param cycles - The cycles found. @returns The ones that could be molecules. */
  protected filterCycles(cycles: number[][]): number[][] {
    const wanted = this.useAllFragments ? cycles.filter((cycle) => cycle.length === this.fragments.length) : cycles;
    return wanted.filter((cycle) => cycle.length === new Set(cycle.map(Math.abs)).size);
  }

  /**
   * The circular molecules these fragments can make.
   *
   * @param onlyAdjacentEdges - Whether a fragment may only be joined at neighbouring places on itself.
   * @param maxAssemblies - How many assemblies are allowed before the search is called off.
   * @returns The assemblies.
   */
  getCircularAssemblies(onlyAdjacentEdges = false, maxAssemblies = DEFAULT_MAX_ASSEMBLIES): EdgeAssembly[] {
    const cycles: number[][] = [];
    for (const cycle of limitIterator(simpleCycles(this.graph, this.fragments.length), MAX_PATHS)) {
      const turned = circularPermutationMinAbs(cycle as number[]);
      if (turned[0]! > 0) cycles.push(turned);
    }
    const wanted = this.filterCycles(cycles);
    this.checkMaxAssemblies(wanted.map((cycle) => [...cycle, cycle[0]!]), maxAssemblies);
    let found = wanted.flatMap((cycle) => this.nodePathToAssemblies(cycle, true));
    found = found.filter((assembly) => this.isValid(assembly, true));
    if (onlyAdjacentEdges) found = found.filter((assembly) => this.usesOnlyAdjacentEdges(assembly, true));
    return found;
  }

  /**
   * The molecules made by putting one run of fragments inside another, which is what homologous
   * recombination into a genome does.
   *
   * @param onlyAdjacentEdges - Not supported here.
   * @param maxAssemblies - How many assemblies are allowed before the search is called off.
   * @returns The assemblies.
   * @throws `NotImplementedError` if asked to keep to neighbouring joins.
   */
  getInsertionAssemblies(onlyAdjacentEdges = false, maxAssemblies = DEFAULT_MAX_ASSEMBLIES): EdgeAssembly[] {
    if (onlyAdjacentEdges) throw new NotImplementedError("only_adjacent_edges not implemented for insertion assemblies");
    const all = [...limitIterator(simpleCycles(this.graph, null), MAX_PATHS)] as number[][];
    this.checkMaxAssemblies(this.filterCycles(all).map((cycle) => [...cycle, cycle[0]!]), maxAssemblies);
    // pydna counts the filtered cycles but then builds from every cycle, filtered or not.
    const assemblies = all.flatMap((cycle) => this.nodePathToAssemblies(cycle, true));
    const found: EdgeAssembly[] = [];
    for (const assembly of assemblies) {
      const sorted = formatInsertionAssembly(formatInsertionEdgeCase(assembly, this.fragments), this.fragments);
      if (sorted !== null && sorted[0]![0] > 0) found.push(sorted);
    }
    return found.filter((assembly) => this.isValid(assembly, false, true));
  }

  /** @param onlyAdjacentEdges - Whether to keep to neighbouring joins. @param maxAssemblies - The limit. @returns The linear products. */
  assembleLinear(onlyAdjacentEdges = false, maxAssemblies = DEFAULT_MAX_ASSEMBLIES): ReturnType<typeof assemble>[] {
    return this.getLinearAssemblies(onlyAdjacentEdges, maxAssemblies).map((assembly) => assemble(this.fragments, assembly));
  }

  /** @param onlyAdjacentEdges - Whether to keep to neighbouring joins. @param maxAssemblies - The limit. @returns The circular products. */
  assembleCircular(onlyAdjacentEdges = false, maxAssemblies = DEFAULT_MAX_ASSEMBLIES): ReturnType<typeof assemble>[] {
    return this.getCircularAssemblies(onlyAdjacentEdges, maxAssemblies).map((assembly) => assemble(this.fragments, assembly));
  }

  /** @param onlyAdjacentEdges - Not supported. @returns The insertion products. */
  assembleInsertion(onlyAdjacentEdges = false): ReturnType<typeof assemble>[] {
    return this.getInsertionAssemblies(onlyAdjacentEdges).map((assembly) => assemble(this.fragments, assembly, true));
  }

  /**
   * For each fragment, the stretches where something joins it on the left and on the right.
   *
   * @returns The stretches, by node, each list ordered by where it begins.
   */
  getLocationsOnFragments(): Map<Node, { left: Location[]; right: Location[] }> {
    const out = new Map<Node, { left: Location[]; right: Location[] }>();
    const edges = [...this.graph.edges()];
    for (const node of this.graph.nodes()) {
      const here: { left: Location[]; right: Location[] } = { left: [], right: [] };
      for (const edge of edges) {
        const ends: [Node, "right" | "left"][] = [[edge.from, "right"], [edge.to, "left"]];
        ends.forEach(([at, side], index) => {
          if (at !== node) return;
          const location = edge.data.locations[index]!;
          if (!here[side].some((other) => String(other) === String(location))) here[side].push(location);
        });
      }
      here.left = stableSort(here.left, (location) => locationBoundaries(location)[0]);
      here.right = stableSort(here.right, (location) => locationBoundaries(location)[0]);
      out.set(node, here);
    }
    return out;
  }

  /**
   * Whether every fragment in the assembly is entered and left at places that are next to one another.
   *
   * A fragment cut out of a plasmid is joined at its own two ends; a join that skipped a stretch in
   * between would be a molecule nobody made.
   *
   * @param assembly - The joins. @param isCircular - Whether it closes.
   * @returns Whether it holds up.
   */
  usesOnlyAdjacentEdges(assembly: EdgeAssembly, isCircular: boolean): boolean {
    const locations = this.getLocationsOnFragments();
    const allowed = new Map<Node, Set<string>>();
    for (const [node, sides] of locations) {
      const fragment = this.fragments[Math.abs(node as number) - 1]!;
      const together = gatherOverlappingLocations([...sides.left, ...sides.right], fragment.length)
        .map((group) => deduplicate(group, (a, b) => String(a) === String(b)));
      const circular = isCircularFragment(fragment);
      const pairs: [Location | null, Location | null][] = [];
      const neighbouring: [(Location | null)[], (Location | null)[]][] = circular
        ? together.map((group, at) => [group, together[(at + 1) % together.length] ?? [null]])
        : [[[null], together[0] ?? [null]], ...together.map((group, at) => [group, together[at + 1] ?? [null]] as [(Location | null)[], (Location | null)[]])];
      for (const [before, after] of neighbouring) {
        for (const one of before) {
          for (const other of after) pairs.push([one, other]);
        }
      }
      allowed.set(node, new Set(pairs.map(([a, b]) => `${String(a)}|${String(b)}`)));
    }
    for (const [node, start, end] of edgeToSubFragment(assembly, isCircular)) {
      if (!allowed.get(node)?.has(`${String(start)}|${String(end)}`)) return false;
    }
    return true;
  }

  /** @returns pydna's summary of the assembly. */
  toString(): string {
    const sizes = this.fragments.map((fragment) => `${fragment.length}bp`).join(" ");
    return `Assembly\nfragments..: ${sizes}\nlimit(bp)..: ${this.limit}\nG.nodes....: ${this.graph.order}\nalgorithm..: ${this.algorithmName}`;
  }
}

/** Mirrors Python's `NotImplementedError`, which pydna raises for the combinations it does not handle. */
export class NotImplementedError extends ValueError {
  /** @param message - What is not supported. */
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}

/** Kept so that `locationsOverlap` is reachable from here, as pydna reaches it from this module. */
export { locationsOverlap };
