/**
 * The graph searches networkx provides and pydna leans on: components, and every simple path.
 *
 * Ported from networkx 3.7 rather than written afresh, because the engine's output order is the order
 * these produce. Where networkx builds a `set`, so does this, through {@link PyIntSet}, which iterates
 * the way CPython's does.
 */

import { ValueError } from "@biolibs/core";
import type { GraphLike, Node } from "./graph.js";
import { PyIntSet } from "./pyset.js";

/**
 * Stop an iterator that goes on too long, as pydna's `limit_iterator` does.
 *
 * @param items - What to pass through.
 * @param limit - How many items are allowed.
 * @returns The items.
 * @throws `ValueError` as soon as one past the limit arrives.
 * @example
 * ```ts
 * [...limitIterator([1, 2], 5)];   // [1, 2]
 * ```
 */
export function* limitIterator<T>(items: Iterable<T>, limit: number): Generator<T> {
  let seen = 0;
  for (const item of items) {
    if (seen >= limit) throw new ValueError(`Too many possible paths (more than ${limit})`);
    seen += 1;
    yield item;
  }
}

/**
 * The strongly connected components of a directed graph: Tarjan's algorithm, iterative, as networkx
 * writes it.
 *
 * @param graph - The graph.
 * @returns Each component, as a set that iterates the way CPython's does.
 */
export function* stronglyConnectedComponents(graph: GraphLike): Generator<PyIntSet> {
  const all = [...graph.nodes()];
  const total = all.length;
  if (total === 0) return;
  const lowlink = new Map<Node, number>();
  const found = new Set<Node>();
  const stackNodes: Node[] = [];
  const stackIters: Iterator<Node>[] = [];
  const stackLead: boolean[] = [];
  const pending: Node[] = [];
  let index = 0;

  for (const source of all) {
    if (lowlink.has(source)) continue;
    index += 1;
    const rootLow = index;
    lowlink.set(source, index);
    stackNodes.push(source);
    stackIters.push(graph.succ(source)[Symbol.iterator]());
    stackLead.push(true);

    while (stackNodes.length > 0) {
      const node = stackNodes[stackNodes.length - 1]!;
      const neighbours = stackIters[stackIters.length - 1]!;
      let descended = false;
      for (;;) {
        const step = neighbours.next();
        if (step.done === true) break;
        const to = step.value;
        if (!lowlink.has(to)) {
          index += 1;
          lowlink.set(to, index);
          stackNodes.push(to);
          stackIters.push(graph.succ(to)[Symbol.iterator]());
          stackLead.push(true);
          descended = true;
          break;
        }
        if (!found.has(to) && lowlink.get(node)! > lowlink.get(to)!) {
          stackLead[stackLead.length - 1] = false;
          lowlink.set(node, lowlink.get(to)!);
          // Everything still on the stack is one component, and there is nothing left to visit.
          if (lowlink.get(node) === rootLow && index === total) {
            const whole = new PyIntSet(pending as number[]);
            whole.update(stackNodes as number[]);
            yield whole;
            return;
          }
        }
      }
      if (descended) continue;

      stackNodes.pop();
      stackIters.pop();
      if (stackLead.pop() === true) {
        const low = lowlink.get(node)!;
        const component = new PyIntSet([node as number]);
        while (pending.length > 0 && lowlink.get(pending[pending.length - 1]!)! >= low) {
          component.add(pending.pop() as number);
        }
        for (const member of component) found.add(member);
        yield component;
      } else {
        pending.push(node);
        const parent = stackNodes[stackNodes.length - 1]!;
        if (lowlink.get(parent)! > lowlink.get(node)!) {
          stackLead[stackLead.length - 1] = false;
          lowlink.set(parent, lowlink.get(node)!);
        }
      }
    }
  }
}

/**
 * The connected components of an undirected graph, found breadth-first as networkx finds them.
 *
 * @param nodes - The nodes, in order.
 * @param adjacency - For each node, its neighbours, in order.
 * @returns Each component, as a set that iterates the way CPython's does.
 */
export function* connectedComponents(nodes: readonly number[], adjacency: Map<number, number[]>): Generator<PyIntSet> {
  const seen = new Set<number>();
  for (const start of nodes) {
    if (seen.has(start)) continue;
    const component = new PyIntSet([start]);
    const inComponent = new Set<number>([start]);
    let level = [start];
    // networkx stops early once the component has taken every node not yet spoken for; that only saves
    // work, so it is left out, and what comes back is the same set in the same order.
    while (level.length > 0) {
      const next: number[] = [];
      for (const node of level) {
        for (const to of adjacency.get(node) ?? []) {
          if (!inComponent.has(to)) {
            inComponent.add(to);
            component.add(to);
            next.push(to);
          }
        }
      }
      level = next;
    }
    for (const member of component) seen.add(member);
    yield component;
  }
}

/**
 * Every simple path from one node to another: depth-first, keeping no node twice, as networkx does it.
 *
 * @param graph - The graph.
 * @param source - Where the paths start.
 * @param target - Where they end.
 * @param cutoff - The most edges a path may have.
 * @returns Each path, as its nodes.
 */
export function* allSimplePaths(graph: GraphLike, source: Node, target: Node, cutoff: number): Generator<Node[]> {
  if (!graph.hasNode(source)) throw new ValueError(`source node ${String(source)} not in graph`);
  if (cutoff < 0) return;
  // The path so far, as node -> the edge that reached it. The leading entry stands for networkx's
  // `{None: None}`, which is what makes its length one more than the number of edges.
  const path = new Map<Node, [Node, Node] | null>([[ROOT, null]]);
  const stack: Iterator<[Node, Node]>[] = [[[ROOT, source] as [Node, Node]][Symbol.iterator]()];

  while (stack.length > 0) {
    const edges = stack[stack.length - 1]!;
    let edge: [Node, Node] | null = null;
    for (;;) {
      const step = edges.next();
      if (step.done === true) break;
      if (!path.has(step.value[1])) {
        edge = step.value;
        break;
      }
    }
    if (edge === null) {
      stack.pop();
      const last = [...path.keys()].pop()!;
      path.delete(last);
      continue;
    }
    const to = edge[1];
    if (to === target) {
      // networkx drops the two leading entries: its `None` root and the edge that reached the source.
      const edgesSoFar = [...path.values(), edge].slice(2) as [Node, Node][];
      yield [source, ...edgesSoFar.map((e) => e[1])];
    }
    if (path.size - 1 < cutoff && target !== to && !path.has(target)) {
      path.set(to, edge);
      stack.push(outgoing(graph, to));
    }
  }
}

/** Stands for the `None` key networkx starts its path dictionary with. */
const ROOT = "\u0000root";

/** @param graph - A graph. @param node - A node. @returns Its outgoing edges, in order. */
function* outgoing(graph: GraphLike, node: Node): Generator<[Node, Node]> {
  for (const to of graph.succ(node)) yield [node, to];
}
