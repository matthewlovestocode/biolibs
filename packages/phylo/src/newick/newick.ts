/** `Bio.Phylo.Newick`: the `Tree` and `Clade` classes that Newick (and Nexus) files are read into. */

import { PyFloat } from "@biolibs/core";
import { Clade as BaseClade, type CladeOptions } from "../base-tree/clade.js";
import { Tree as BaseTree, type TreeOptions } from "../base-tree/tree.js";

/** The constructor arguments of a Newick {@link Clade}: the usual ones plus a `comment`. */
export interface NewickCladeOptions extends CladeOptions {
  /** The comment in square brackets after the clade, if any. */
  comment?: string | null;
}

/** A Newick clade: a clade with a `comment`. */
export class Clade extends BaseClade {
  /** The bracketed comment, or null. */
  comment: string | null;

  /** @param o - The attributes (all optional). */
  constructor(o: NewickCladeOptions = {}) {
    super(o);
    this.comment = o.comment ?? null;
  }

  override pyDict(): [string, unknown][] { return [...super.pyDict(), ["comment", this.comment]]; }
}

/** The constructor arguments of a Newick {@link Tree}: the usual ones (but unrooted by default) plus a `weight`. */
export interface NewickTreeOptions extends TreeOptions {
  /** The tree's weight (default 1.0). */
  weight?: number;
}

/** A Newick tree: unrooted by default, with a `weight`. */
export class Tree extends BaseTree {
  /** The tree's weight. */
  weight: number;

  /** @param o - The attributes (all optional). */
  constructor(o: NewickTreeOptions = {}) {
    super({ ...o, rooted: o.rooted ?? false });
    this.weight = o.weight ?? 1.0;
  }

  protected override newClade(): BaseClade { return new Clade(); }

  override pyDict(): [string, unknown][] { return [...super.pyDict(), ["weight", new PyFloat(this.weight)]]; }
}
