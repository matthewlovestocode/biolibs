/**
 * The graphs the engine walks, with networkx's ordering.
 *
 * pydna builds a directed multigraph — a node for each fragment in each orientation, an edge for each
 * place two of them overlap — and reads the molecules off it as paths and cycles. Everything here keeps
 * the orders networkx keeps, because those decide the order the products come back in: nodes and edges
 * iterate in the order they were added, and a subgraph is a *view*, so removing a node from the graph
 * removes it from every view of it too.
 */

/** A node: a signed fragment number, or one of the two ends added when linear paths are looked for. */
export type Node = number | string;

/** What a graph has to answer for the searches in `traverse.ts`. */
export interface GraphLike {
  /** The nodes, in order. */
  nodes(): Iterable<Node>;
  /** @param node - A node. @returns The nodes it points at, in order. */
  succ(node: Node): Iterable<Node>;
  /** @param node - A node. @returns Whether the graph has it. */
  hasNode(node: Node): boolean;
  /** @param from - A node. @param to - Another. @returns Whether an edge runs between them. */
  hasEdge(from: Node, to: Node): boolean;
}

/** One edge of a multigraph, as the searches report it. */
export interface MultiEdge<D> {
  /** Where it starts. */
  from: Node;
  /** Where it ends. */
  to: Node;
  /** What tells it apart from a parallel edge. */
  key: string;
  /** What is hung on it. */
  data: D;
}

/**
 * A directed multigraph: several edges may run from one node to another, each with its own key.
 *
 * @example
 * ```ts
 * const g = new MultiDiGraph<string>();
 * g.addNode(1);
 * g.addEdge(1, 2, "a", "first");
 * [...g.edges()].map((e) => e.key);   // ["a"]
 * ```
 */
export class MultiDiGraph<D> implements GraphLike {
  /** The nodes, in the order they were added. */
  private readonly nodeOrder = new Map<Node, unknown>();
  /** For each node, what it points at, and the keyed edges to each. */
  private readonly out = new Map<Node, Map<Node, Map<string, D>>>();

  /** @param node - A node to add. Adding one that is there already keeps its place. */
  addNode(node: Node, data: unknown = null): void {
    if (!this.nodeOrder.has(node)) {
      this.nodeOrder.set(node, data);
      this.out.set(node, new Map());
    }
  }

  /**
   * @param from - Where the edge starts. @param to - Where it ends.
   * @param key - What tells it apart from a parallel edge.
   * @param data - What to hang on it.
   */
  addEdge(from: Node, to: Node, key: string, data: D): void {
    this.addNode(from);
    this.addNode(to);
    const neighbours = this.out.get(from)!;
    let keyed = neighbours.get(to);
    if (keyed === undefined) {
      keyed = new Map();
      neighbours.set(to, keyed);
    }
    keyed.set(key, data);
  }

  /** @param node - A node. @returns Whether the graph has it. */
  hasNode(node: Node): boolean {
    return this.nodeOrder.has(node);
  }

  /** @returns The nodes, in order. */
  nodes(): Iterable<Node> {
    return this.nodeOrder.keys();
  }

  /** How many nodes there are. */
  get order(): number {
    return this.nodeOrder.size;
  }

  /** @param node - A node. @returns What it points at, in order. */
  succ(node: Node): Iterable<Node> {
    return this.out.get(node)?.keys() ?? [];
  }

  /** @param from - A node. @param to - Another. @returns Whether any edge runs between them. */
  hasEdge(from: Node, to: Node): boolean {
    return (this.out.get(from)?.get(to)?.size ?? 0) > 0;
  }

  /** @param from - A node. @param to - Another. @returns The keys of the edges between them, in order. */
  keys(from: Node, to: Node): string[] {
    return [...(this.out.get(from)?.get(to)?.keys() ?? [])];
  }

  /** @param from - A node. @param to - Another. @param key - An edge's key. @returns What is hung on it. */
  edgeData(from: Node, to: Node, key: string): D | undefined {
    return this.out.get(from)?.get(to)?.get(key);
  }

  /** @returns Every edge, by node order and then by the order the edges were added. */
  *edges(): Generator<MultiEdge<D>> {
    for (const from of this.nodeOrder.keys()) {
      for (const [to, keyed] of this.out.get(from)!) {
        for (const [key, data] of keyed) yield { from, to, key, data };
      }
    }
  }

  /** @param from - A node. @param to - Another. Removes every edge between them, in that direction. */
  removeEdges(from: Node, to: Node): void {
    this.out.get(from)?.delete(to);
  }

  /** @returns A simple directed graph with one edge wherever this has any, as `nx.DiGraph(G)` gives. */
  toDiGraph(): DiGraph {
    const out = new DiGraph();
    for (const node of this.nodeOrder.keys()) out.addNode(node);
    for (const { from, to } of this.edges()) out.addEdge(from, to);
    return out;
  }
}

/**
 * A simple directed graph: at most one edge from one node to another.
 *
 * It can be mutated while a view of it is being read, which is what the cycle search does: it takes a
 * subgraph, searches it, and then removes a node from underneath it.
 */
export class DiGraph implements GraphLike {
  /** For each node, what it points at, in order. */
  private readonly out = new Map<Node, Set<Node>>();

  /**
   * Build a graph from edges, adding each node as it first appears — the order `nx.DiGraph(edges)`
   * leaves the nodes in, which decides where the searches start.
   *
   * @param edges - The edges, in order.
   * @returns The graph.
   */
  static fromEdges(edges: Iterable<[Node, Node]>): DiGraph {
    const out = new DiGraph();
    for (const [from, to] of edges) out.addEdge(from, to);
    return out;
  }

  /** @param node - A node to add. */
  addNode(node: Node): void {
    if (!this.out.has(node)) this.out.set(node, new Set());
  }

  /** @param from - Where the edge starts. @param to - Where it ends. */
  addEdge(from: Node, to: Node): void {
    this.addNode(from);
    this.addNode(to);
    this.out.get(from)!.add(to);
  }

  /** @param node - A node. @returns Whether the graph has it. */
  hasNode(node: Node): boolean {
    return this.out.has(node);
  }

  /** @returns The nodes, in order. */
  nodes(): Iterable<Node> {
    return this.out.keys();
  }

  /** How many nodes there are. */
  get order(): number {
    return this.out.size;
  }

  /** @param node - A node. @returns What it points at, in order. */
  succ(node: Node): Iterable<Node> {
    return this.out.get(node) ?? [];
  }

  /** @param from - A node. @param to - Another. @returns Whether an edge runs between them. */
  hasEdge(from: Node, to: Node): boolean {
    return this.out.get(from)?.has(to) ?? false;
  }

  /** @param node - The node to remove, along with every edge touching it. */
  removeNode(node: Node): void {
    this.out.delete(node);
    for (const neighbours of this.out.values()) neighbours.delete(node);
  }

  /**
   * @param kept - Which nodes the view shows.
   * @returns A live view: what it shows follows this graph as this graph changes.
   */
  subgraph(kept: Iterable<Node>): SubDiGraph {
    return new SubDiGraph(this, new Set(kept));
  }
}

/** A view of part of a {@link DiGraph}, showing only the nodes it was given that the graph still has. */
export class SubDiGraph implements GraphLike {
  /**
   * @param parent - The graph underneath.
   * @param kept - The nodes this view shows.
   */
  constructor(private readonly parent: DiGraph, private readonly kept: Set<Node>) {}

  /** @returns The nodes, in the parent's order. */
  *nodes(): Generator<Node> {
    for (const node of this.parent.nodes()) {
      if (this.kept.has(node)) yield node;
    }
  }

  /** @param node - A node. @returns What it points at within the view, in the parent's order. */
  *succ(node: Node): Generator<Node> {
    if (!this.hasNode(node)) return;
    for (const to of this.parent.succ(node)) {
      if (this.kept.has(to)) yield to;
    }
  }

  /** @param node - A node. @returns Whether the view shows it. */
  hasNode(node: Node): boolean {
    return this.kept.has(node) && this.parent.hasNode(node);
  }

  /** @param from - A node. @param to - Another. @returns Whether an edge runs between them in the view. */
  hasEdge(from: Node, to: Node): boolean {
    return this.hasNode(from) && this.hasNode(to) && this.parent.hasEdge(from, to);
  }
}
