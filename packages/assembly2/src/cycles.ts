/**
 * Every simple cycle of a directed graph, in networkx's order.
 *
 * A cycle through the fragment graph is a circular molecule, so this is where plasmids come from. The
 * search is networkx 3.7's: self-loops first, then, for a bounded length, the algorithm of Gupta and
 * Suzumura, and otherwise Johnson's. Both are driven one strongly connected component at a time, and the
 * component each search starts from is `next(iter(component))` — the first value a CPython `set` gives,
 * which is why {@link PyIntSet} exists.
 */

import { ValueError } from "@biolibs/core";
import { DiGraph, type GraphLike, type MultiDiGraph, type Node } from "./graph.js";
import { PyIntSet, pyDifference, pyIntersection } from "./pyset.js";
import { stronglyConnectedComponents } from "./traverse.js";

/**
 * Every simple cycle of a directed multigraph, as a list of nodes.
 *
 * Parallel edges are not told apart here: a cycle is the nodes it passes through, and the caller works
 * out which combinations of edges join them.
 *
 * @param graph - The graph.
 * @param lengthBound - The most nodes a cycle may have, or null for no limit.
 * @returns Each cycle, as its nodes.
 * @throws `ValueError` for a negative bound.
 */
export function* simpleCycles<D>(graph: MultiDiGraph<D>, lengthBound: number | null = null): Generator<Node[]> {
  if (lengthBound !== null) {
    if (lengthBound === 0) return;
    if (lengthBound < 0) throw new ValueError("length bound must be non-negative");
  }
  for (const node of graph.nodes()) {
    if (graph.hasEdge(node, node)) yield [node];
  }
  if (lengthBound === 1) return;

  // Parallel edges and self-loops drop away; what is left is where the search runs.
  const simple = DiGraph.fromEdges(
    (function* () {
      for (const from of graph.nodes()) {
        for (const to of graph.succ(from)) {
          if (to !== from) yield [from, to] as [Node, Node];
        }
      }
    })(),
  );

  if (lengthBound === 2) {
    const visited = new PyIntSet();
    for (const from of simple.nodes()) {
      const both = pyIntersection(visited, [...simple.succ(from)] as number[]);
      for (const to of both) {
        if (simple.hasEdge(to, from)) yield [to, from];
      }
      visited.add(from as number);
    }
    return;
  }
  yield* directedCycleSearch(simple, lengthBound);
}

/**
 * Drive the search one strongly connected component at a time, smallest piece of work last.
 *
 * After a component is searched, the node it started from is removed from the graph — and the component
 * is a *view* of that graph, so what is searched next no longer has it.
 *
 * @param graph - The graph, which this mutates.
 * @param lengthBound - The most nodes a cycle may have, or null for no limit.
 * @returns Each cycle, as its nodes.
 */
function* directedCycleSearch(graph: DiGraph, lengthBound: number | null): Generator<Node[]> {
  const components: PyIntSet[] = [];
  for (const component of stronglyConnectedComponents(graph)) {
    if (component.size >= 2) components.push(component);
  }
  while (components.length > 0) {
    const component = components.pop()!;
    const view = graph.subgraph(component as Iterable<Node>);
    const start = [...component][0]!;
    yield* lengthBound === null
      ? johnsonCycleSearch(view, [start])
      : boundedCycleSearch(view, [start], lengthBound);
    graph.removeNode(start);
    for (const smaller of stronglyConnectedComponents(view)) {
      if (smaller.size >= 2) components.push(smaller);
    }
  }
}

/**
 * Johnson's cycle enumeration: every cycle through the first node of `path`, blocking nodes that cannot
 * reach it again until something unblocks them.
 *
 * @param graph - The component being searched.
 * @param path - The nodes walked so far, which this mutates as it goes.
 * @returns Each cycle, as its nodes.
 */
function* johnsonCycleSearch(graph: GraphLike, path: Node[]): Generator<Node[]> {
  const blocked = new Set<Node>(path);
  const blockedBy = new Map<Node, PyIntSet>();
  /** @param node - A node. @returns What is waiting on it to be unblocked. */
  const waiting = (node: Node): PyIntSet => {
    let set = blockedBy.get(node);
    if (set === undefined) {
      set = new PyIntSet();
      blockedBy.set(node, set);
    }
    return set;
  };
  const start = path[0]!;
  const stack: Iterator<Node>[] = [graph.succ(path[path.length - 1]!)[Symbol.iterator]()];
  const closed: boolean[] = [false];

  while (stack.length > 0) {
    const neighbours = stack[stack.length - 1]!;
    let descended = false;
    for (;;) {
      const step = neighbours.next();
      if (step.done === true) break;
      const to = step.value;
      if (to === start) {
        yield [...path];
        closed[closed.length - 1] = true;
      } else if (!blocked.has(to)) {
        path.push(to);
        closed.push(false);
        stack.push(graph.succ(to)[Symbol.iterator]());
        blocked.add(to);
        descended = true;
        break;
      }
    }
    if (descended) continue;

    stack.pop();
    const node = path.pop()!;
    if (closed.pop() === true) {
      if (closed.length > 0) closed[closed.length - 1] = true;
      // Unblocking spreads to whatever was waiting. A node reached twice is already unblocked the
      // second time, so a plain stack does the work of networkx's set.
      const toUnblock: Node[] = [node];
      while (toUnblock.length > 0) {
        const unblocking = toUnblock.pop()!;
        if (blocked.has(unblocking)) {
          blocked.delete(unblocking);
          const set = waiting(unblocking);
          toUnblock.push(...set);
          blockedBy.set(unblocking, new PyIntSet());
        }
      }
    } else {
      for (const to of graph.succ(node)) waiting(to).add(node as number);
    }
  }
}

/**
 * The bounded cycle search of Gupta and Suzumura: Johnson's, with a lock on each node recording how far
 * along a path it has already been tried, so that a node is not walked again where it cannot pay off.
 *
 * @param graph - The component being searched.
 * @param path - The nodes walked so far, which this mutates as it goes.
 * @param lengthBound - The most nodes a cycle may have.
 * @returns Each cycle, as its nodes.
 */
function* boundedCycleSearch(graph: GraphLike, path: Node[], lengthBound: number): Generator<Node[]> {
  const lock = new Map<Node, number>(path.map((node) => [node, 0]));
  const blockedBy = new Map<Node, PyIntSet>();
  /** @param node - A node. @returns What is waiting on it. */
  const waiting = (node: Node): PyIntSet => {
    let set = blockedBy.get(node);
    if (set === undefined) {
      set = new PyIntSet();
      blockedBy.set(node, set);
    }
    return set;
  };
  const start = path[0]!;
  const stack: Iterator<Node>[] = [graph.succ(path[path.length - 1]!)[Symbol.iterator]()];
  const bounds: number[] = [lengthBound];

  while (stack.length > 0) {
    const neighbours = stack[stack.length - 1]!;
    let descended = false;
    for (;;) {
      const step = neighbours.next();
      if (step.done === true) break;
      const to = step.value;
      if (to === start) {
        yield [...path];
        bounds[bounds.length - 1] = 1;
      } else if (path.length < (lock.get(to) ?? lengthBound)) {
        path.push(to);
        bounds.push(lengthBound);
        lock.set(to, path.length);
        stack.push(graph.succ(to)[Symbol.iterator]());
        descended = true;
        break;
      }
    }
    if (descended) continue;

    stack.pop();
    const node = path.pop()!;
    const bound = bounds.pop()!;
    if (bounds.length > 0) bounds[bounds.length - 1] = Math.min(bounds[bounds.length - 1]!, bound);
    if (bound < lengthBound) {
      const relax: [number, Node][] = [[bound, node]];
      while (relax.length > 0) {
        const [at, relaxing] = relax.pop()!;
        if ((lock.get(relaxing) ?? lengthBound) < lengthBound - at + 1) {
          lock.set(relaxing, lengthBound - at + 1);
          for (const other of pyDifference(waiting(relaxing), path as number[])) relax.push([at + 1, other]);
        }
      }
    } else {
      for (const to of graph.succ(node)) waiting(to).add(node as number);
    }
  }
}
