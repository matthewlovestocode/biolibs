/** Nodes and chains of nodes (Biopython's `Bio.Nexus.Nodes`). */

import { KeyError, ValueError } from "@biolibs/core";
import { ChainException, NodeException } from "./errors.js";

/** A node holding data, a link to its predecessor and the ids of its successors. */
export class Node<T = unknown> {
  id: number | null = null;
  data: T | null;
  prev: number | null = null;
  succ: number[] = [];

  /** @param data - What the node holds. */
  constructor(data: T | null = null) {
    this.data = data;
  }

  /** Set the id, once. @throws {@link NodeException} if it is already set. */
  setId(id: number): void {
    if (this.id !== null) throw new NodeException("Node id cannot be changed.");
    this.id = id;
  }

  getId(): number | null { return this.id; }
  getSucc(): number[] { return this.succ; }
  getPrev(): number | null { return this.prev; }

  /** Add one successor id, or several. */
  addSucc(id: number | number[]): void {
    if (Array.isArray(id)) this.succ.push(...id);
    else this.succ.push(id);
  }

  /** Remove a successor id. @throws {@link ValueError} if it is not there, as `list.remove` does. */
  removeSucc(id: number): void {
    const i = this.succ.indexOf(id);
    if (i < 0) throw new ValueError("list.remove(x): x not in list");
    this.succ.splice(i, 1);
  }

  /** Replace the successor list. @throws {@link NodeException} unless it is an array. */
  setSucc(newSucc: number[]): void {
    if (!Array.isArray(newSucc)) throw new NodeException("Node successor must be of list type.");
    this.succ = newSucc;
  }

  setPrev(id: number | null): void { this.prev = id; }
  getData(): T | null { return this.data; }
  setData(data: T | null): void { this.data = data; }
}

/** A tree-like collection of nodes by id. */
export class Chain<T = unknown> {
  chain = new Map<number, Node<T>>();
  id = -1;

  private nextId(): number {
    this.id += 1;
    return this.id;
  }

  /** All node ids. */
  allIds(): number[] {
    return [...this.chain.keys()];
  }

  /**
   * Add a node below `prev` (or as a root) and return its id.
   *
   * @throws {@link ChainException} for an unknown predecessor.
   */
  add(node: Node<T>, prev: number | null = null): number {
    if (prev !== null && !this.chain.has(prev)) throw new ChainException("Unknown predecessor: " + String(prev));
    const id = this.nextId();
    node.setId(id);
    node.setPrev(prev);
    if (prev !== null) this.at(prev).addSucc(id);
    this.chain.set(id, node);
    return id;
  }

  /** The node with an id; a missing id is a Python-style `KeyError` (whose message is the key, `None` for null). */
  private at(id: number | null | undefined): Node<T> {
    const node = this.chain.get(id as number);
    if (node === undefined) throw new KeyError(id === null || id === undefined ? "None" : String(id));
    return node;
  }

  /** Remove a node, attaching its successors to its predecessor; returns the node. */
  collapse(id: number): Node<T> {
    if (!this.chain.has(id)) throw new ChainException("Unknown ID: " + String(id));
    const prevId = this.at(id).getPrev();
    this.at(prevId as number).removeSucc(id);
    const succIds = this.at(id).getSucc();
    for (const i of succIds) this.at(i).setPrev(prevId);
    this.at(prevId as number).addSucc(succIds);
    const node = this.at(id);
    this.kill(id);
    return node;
  }

  /** Delete a node (not its links). */
  kill(id: number): void {
    if (!this.chain.has(id)) throw new ChainException("Unknown ID: " + String(id));
    this.chain.delete(id);
  }

  /** Detach a node from its predecessor; returns that predecessor's id. */
  unlink(id: number): number | null {
    if (!this.chain.has(id)) throw new ChainException("Unknown ID: " + String(id));
    const node = this.at(id);
    const prevId = node.prev;
    if (prevId !== null) {
      const succ = this.at(prevId).succ;
      succ.splice(succ.indexOf(id), 1);
    }
    node.prev = null;
    return prevId;
  }

  /** Make `child` a successor of `parent`. */
  link(parent: number, child: number): void {
    if (!this.chain.has(child)) throw new ChainException("Unknown ID: " + String(child));
    if (!this.chain.has(parent)) throw new ChainException("Unknown ID: " + String(parent));
    this.unlink(child);
    this.at(parent).succ.push(child);
    this.at(child).setPrev(parent);
  }

  /** Whether `parent` is `grandchild` or an ancestor of it. */
  isParentOf(parent: number, grandchild: number): boolean {
    if (grandchild === parent || this.at(parent).getSucc().includes(grandchild)) return true;
    for (const sn of this.at(parent).getSucc()) if (this.isParentOf(sn, grandchild)) return true;
    return false;
  }

  /** Ids on the path from `start` (excluded) to `finish`. */
  trace(start: number, finish: number): number[] | undefined {
    if (!this.chain.has(start) || !this.chain.has(finish)) throw new NodeException("Unknown node.");
    if (!this.isParentOf(start, finish) || start === finish) return [];
    for (const sn of this.at(start).getSucc()) {
      if (this.isParentOf(sn, finish)) return [sn, ...(this.trace(sn, finish) ?? [])];
    }
    return undefined;
  }
}
