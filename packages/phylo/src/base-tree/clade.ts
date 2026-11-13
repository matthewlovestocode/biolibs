/** `Clade`: a recursively defined sub-tree. */

import { PyFloat, ValueError, pyRepr } from "@biolibs/core";
import { BranchColor } from "./branch-color.js";
import { TreeMixin } from "./tree-mixin.js";

/** The constructor arguments of a {@link Clade}. */
export interface CladeOptions {
  /** Length of the branch leading to this clade. */
  branchLength?: number | null;
  /** The clade's name (a label). */
  name?: string | null;
  /** Sub-clades directly under this one. */
  clades?: Clade[] | null;
  /** Support: an integer, or a float (as a `PyFloat` when the value is whole). */
  confidence?: number | PyFloat | null;
  /** Display colour of the branch and its descendants. */
  color?: BranchColor | string | number[] | null;
  /** Display width of the branch and its descendants. */
  width?: number | null;
}

/** What `clade[index]` accepts: an integer, a slice or a path of integers. */
export type CladeIndex = number | { start?: number | null; stop?: number | null; step?: number | null } | number[];

/** A clade: a node of a tree with its sub-clades. */
export class Clade extends TreeMixin {
  /** The length of the branch leading to this clade, or null. */
  branchLength: number | null;
  /** The clade's name, or null. */
  name: string | null;
  /** The sub-clades. */
  clades: Clade[];
  /** Support, or null. */
  confidence: number | PyFloat | null;
  /** The width of the branch, or null. */
  width: number | null;
  private colorValue: BranchColor | null = null;

  /** @param o - The attributes (all optional); an empty or missing `clades` gives a new empty list. */
  constructor(o: CladeOptions = {}) {
    super();
    this.branchLength = o.branchLength ?? null;
    this.name = o.name ?? null;
    this.clades = o.clades && o.clades.length > 0 ? o.clades : [];
    this.confidence = o.confidence ?? null;
    this.color = o.color ?? null;
    this.width = o.width ?? null;
  }

  override pyDict(): [string, unknown][] {
    return [
      ["branch_length", this.branchLength === null ? null : new PyFloat(this.branchLength)], ["name", this.name], ["clades", this.clades],
      ["confidence", this.confidence], ["_color", this.colorValue], ["width", this.width],
    ];
  }

  /** The clade itself (so the traversal methods work on a clade). */
  get root(): Clade { return this; }
  protected override isTree(): boolean { return false; }
  /** Always an error: a clade's root cannot be replaced. @throws TypeError (Python's `AttributeError`). */
  protected override setRoot(): Clade { throw new TypeError("property 'root' of 'Clade' object has no setter"); }

  /** Whether this is a leaf. */
  isTerminal(): boolean { return this.clades.length === 0; }

  /** The branch colour. Setting accepts a `BranchColor`, a colour name, a `#RRGGBB` string or an `[r, g, b]` list. @throws ValueError for other values. */
  get color(): BranchColor | null { return this.colorValue; }
  set color(arg: BranchColor | string | number[] | null | undefined) {
    if (arg === null || arg === undefined || arg instanceof BranchColor) this.colorValue = arg ?? null;
    else if (typeof arg === "string") {
      if (Object.hasOwn(BranchColor.colorNames, arg)) this.colorValue = BranchColor.fromName(arg);
      else if (arg.startsWith("#") && Array.from(arg).length === 7) this.colorValue = BranchColor.fromHex(arg);
      else throw new ValueError(`invalid color string ${arg}`);
    } else if (Array.isArray(arg) && arg.length === 3) this.colorValue = new BranchColor(arg[0]!, arg[1]!, arg[2]!);
    else throw new ValueError(`invalid color value ${pyRepr(arg)}`);
  }

  /** `clade[index]`: a sub-clade by integer, a list by slice, or a descendant by a path of indices. @throws IndexError for a bad index. */
  get(index: CladeIndex): Clade | Clade[] {
    if (typeof index === "number") {
      const i = index < 0 ? index + this.clades.length : index;
      if (i < 0 || i >= this.clades.length) throw Object.assign(new Error("list index out of range"), { name: "IndexError" });
      return this.clades[i]!;
    }
    if (Array.isArray(index)) {
      let ref: Clade = this;
      for (const idx of index) ref = ref.get(idx) as Clade;
      return ref;
    }
    return sliceList(this.clades, index);
  }

  /** The number of clades directly below. */
  get length(): number { return this.clades.length; }

  /** Iterate over the direct sub-clades. */
  [Symbol.iterator](): Iterator<Clade> { return this.clades[Symbol.iterator](); }

  /** The name (shortened to 37 characters and "..." above 40), or the class name. */
  override toString(): string {
    if (this.name) return Array.from(this.name).length > 40 ? Array.from(this.name).slice(0, 37).join("") + "..." : this.name;
    return this.constructor.name;
  }
}

/** Python's `list[slice]`. */
function sliceList<T>(items: T[], s: { start?: number | null; stop?: number | null; step?: number | null }): T[] {
  const n = items.length;
  const step = s.step ?? 1;
  if (step === 0) throw new ValueError("slice step cannot be zero");
  const norm = (v: number | null | undefined, dflt: number, lo: number, hi: number): number => {
    if (v === null || v === undefined) return dflt;
    const x = v < 0 ? v + n : v;
    return Math.min(Math.max(x, lo), hi);
  };
  const out: T[] = [];
  if (step > 0) {
    for (let i = norm(s.start, 0, 0, n); i < norm(s.stop, n, 0, n); i += step) out.push(items[i]!);
  } else {
    for (let i = norm(s.start, n - 1, -1, n - 1); i > norm(s.stop, -1, -1, n - 1); i += step) out.push(items[i]!);
  }
  return out;
}
