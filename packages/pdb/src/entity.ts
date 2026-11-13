/**
 * `Entity` and `DisorderedEntityWrapper`: the base of the Structure / Model / Chain / Residue hierarchy and of the
 * wrappers that hold alternative locations (Biopython's `Bio.PDB.Entity`).
 */

import { pyTypeName, warn } from "@biolibs/core";
import { PDBConstructionException } from "./exceptions.js";
import { centerOfMass, type RotMatrix } from "./geometry.js";
import { compareIds, idKey, idsEqual, keyToId, pySortedIds, pyStr, type EntityId } from "./util.js";

/** Anything with an id and a parent: an entity or an atom. */
export interface Child {
  /** The id. */
  id: EntityId;
  /** The parent, or null. */
  parent: unknown;
  /** Set the parent. */
  setParent(parent: unknown): void;
  /** Forget the parent. */
  detachParent(): void;
  /** The id (Python `get_id()`). */
  getId(): EntityId;
  /** Deep-ish copy without a parent. */
  copy(): Child;
  /** Apply a rotation and translation to the coordinates. */
  transform(rot: RotMatrix, tran: ArrayLike<number>): void;
}

/** The base class of Structure, Model, Chain and Residue. */
export abstract class Entity<C extends Child = Child> {
  /** Level code: `"S"`, `"M"`, `"C"`, `"R"` (or `"A"` for atoms). */
  abstract readonly level: string;
  /** Cached full id (a tuple), or null until first needed. */
  fullId: EntityId[] | null = null;
  /** The parent entity, or null. */
  parent: Entity<Child> | null = null;
  /** The children in order. */
  childList: C[] = [];
  /** The children by id key. */
  childDict = new Map<string, C>();
  /** Free-form extra data. */
  xtra: Record<string, unknown> = {};
  /** Solvent accessible surface area, set by `ShrakeRupley.compute` at the chosen level. */
  declare sasa?: number;
  private idValue: EntityId;

  /** @param id - The id of this entity within its parent. */
  constructor(id: EntityId) {
    this.idValue = id;
  }

  /** The id. Changing it renames the entry in the parent (warning if a sibling already has that id). */
  get id(): EntityId {
    return this.idValue;
  }
  set id(value: EntityId) {
    if (idsEqual(value, this.idValue)) return;
    if (this.parent !== null) {
      if (this.parent.childDict.has(idKey(value))) {
        warn(`The id \`${pyStr(value)}\` is already used for a sibling of this entity. Changing id from \`${pyStr(this.idValue)}\` to \`${pyStr(value)}\` might create access inconsistencies to children of the parent entity.`);
      }
      this.parent.childDict.delete(idKey(this.idValue));
      this.parent.childDict.set(idKey(value), this as unknown as Child);
    }
    this.idValue = value;
    this.resetFullId();
  }

  /** Number of children. */
  get length(): number {
    return this.childList.length;
  }

  /** The child with this id (Python `entity[id]`). @throws KeyError-like Error when absent. */
  get(id: EntityId): C {
    const child = this.childDict.get(idKey(id));
    if (child === undefined) throw Object.assign(new Error(String(Array.isArray(id) ? `(${id.map((x) => (typeof x === "string" ? `'${x}'` : x)).join(", ")})` : id)), { name: "KeyError" });
    return child;
  }

  /** Whether a child has this id. */
  has(id: EntityId): boolean {
    return this.childDict.has(idKey(id));
  }

  /** Iterate over the children. */
  [Symbol.iterator](): Iterator<C> {
    return this.childList[Symbol.iterator]();
  }

  /** Remove the child with this id (Python `del entity[id]`). */
  delete(id: EntityId): void {
    this.detachChild(id);
  }

  /** Equality as Python's `==`: same id for a root, otherwise same full id below the first level. */
  equals(other: Entity<Child>): boolean {
    if (!(other instanceof (this.constructor as new (...a: never[]) => object))) return false;
    if (this.parent === null) return idsEqual(this.id, other.id);
    return idsEqual(this.getFullId().slice(1), other.getFullId().slice(1));
  }

  /** Ordering of two entities of the same kind: negative, zero or positive. */
  compare(otherOperand: Entity<Child> | unknown, op = "<"): number {
    if (otherOperand instanceof DisorderedEntityWrapper) return compareThroughWrapper(this, otherOperand, op);
    const other = otherOperand as Entity<Child>;
    if (!(other instanceof (this.constructor as new (...a: never[]) => object))) {
      throw new TypeError(`'${op}' not supported between instances of '${this.constructor.name}' and '${pyTypeName(other)}'`);
    }
    if (this.parent === null) return compareIds(this.id, other.id);
    return compareIds(this.getFullId().slice(1), other.getFullId().slice(1));
  }

  /** Recompute the cached full ids of this entity and everything below it. */
  protected resetFullId(): void {
    for (const child of this.childList) (child as unknown as { resetFullId?(): void }).resetFullId?.();
    this.fullId = this.generateFullId();
  }

  /** The tuple of ids from the root down to this entity. */
  protected generateFullId(): EntityId[] {
    const parts: EntityId[] = [this.getId()];
    let parent = this.getParent();
    while (parent !== null) {
      parts.push(parent.getId());
      parent = parent.getParent();
    }
    return parts.reverse();
  }

  /** The level code. */
  getLevel(): string {
    return this.level;
  }

  /** Set the parent and refresh the full ids. */
  setParent(entity: Entity<Child> | null): void {
    this.parent = entity;
    this.resetFullId();
  }

  /** Forget the parent. */
  detachParent(): void {
    this.parent = null;
  }

  /** Remove (and return nothing for) the child with this id; the child loses its parent. @throws Error (KeyError) when absent. */
  detachChild(id: EntityId): void {
    const child = this.get(id);
    child.detachParent();
    // Python deletes `child_dict[id]` with the id as given (not translated by Chain), so an
    // integer id on a Chain raises KeyError after the child has already lost its parent.
    if (!this.childDict.delete(idKey(id))) throw Object.assign(new Error(Array.isArray(id) ? `(${id.map((x) => (typeof x === "string" ? `'${x}'` : x)).join(", ")})` : String(id)), { name: "KeyError" });
    const at = this.childList.indexOf(child);
    if (at >= 0) this.childList.splice(at, 1);
  }

  /**
   * Add a child.
   *
   * @throws {@link PDBConstructionException} when a child with that id exists.
   */
  add(entity: C): void {
    const entityId = entity.getId();
    if (this.has(entityId)) throw new PDBConstructionException(`${pyStr(entityId)} defined twice`);
    entity.setParent(this);
    this.childList.push(entity);
    this.childDict.set(idKey(entityId), entity);
  }

  /** Insert a child at a position. @throws {@link PDBConstructionException} when the id exists. */
  insert(pos: number, entity: C): void {
    const entityId = entity.getId();
    if (this.has(entityId)) throw new PDBConstructionException(`${pyStr(entityId)} defined twice`);
    entity.setParent(this);
    this.childList.splice(pos, 0, entity);
    this.childDict.set(idKey(entityId), entity);
  }

  /** @returns An iterator over the children (Python `get_iterator`). */
  getIterator(): IterableIterator<C> {
    return this.childList[Symbol.iterator]();
  }

  /** A copy of the list of children. */
  getList(): C[] {
    return [...this.childList];
  }

  /** The parent. */
  getParent(): Entity<Child> | null {
    return this.parent;
  }

  /** The id. */
  getId(): EntityId {
    return this.id;
  }

  /** The full id, computed on first use. */
  getFullId(): EntityId[] {
    if (this.fullId === null) this.fullId = this.generateFullId();
    return this.fullId;
  }

  /**
   * Python `Entity.strictly_equals`: same type, id and (recursively) children.
   *
   * @param other - Entity to compare with.
   * @param compareCoordinates - Whether atoms also compare coordinates.
   */
  strictlyEquals(other: unknown, compareCoordinates = false): boolean {
    if (!(other instanceof (this.constructor as new (...a: never[]) => object))) return false;
    const o = other as Entity<Child>;
    if (idKey(this.id) !== idKey(o.id)) return false;
    if (this.childList.length !== o.childList.length) return false;
    return this.childList.every((c, k) => (c as unknown as Entity<Child>).strictlyEquals(o.childList[k], compareCoordinates));
  }

  /**
   * Apply a right-multiplying rotation and a translation to every atom below.
   *
   * @param rot - A 3x3 matrix.
   * @param tran - The translation.
   */
  transform(rot: RotMatrix, tran: ArrayLike<number>): void {
    for (const o of this.getList()) o.transform(rot, tran);
  }

  /**
   * The center of mass (or geometry) of all atoms below, as a float32 array.
   *
   * @param geometric - Weight every atom equally.
   * @throws ValueError for an entity without children.
   */
  centerOfMass(geometric = false): Float32Array {
    return centerOfMass(this as never, geometric);
  }

  /** A copy of this entity with copies of all its children (no parent). */
  copy(): this {
    const shallow = Object.create(Object.getPrototypeOf(this)) as this;
    Object.assign(shallow, this);
    shallow.childList = [];
    shallow.childDict = new Map();
    shallow.xtra = { ...this.xtra };
    shallow.detachParent();
    for (const child of this.childList) shallow.add(child.copy() as C);
    return shallow;
  }
}

/** The operator Python retries when the left-hand operand refuses a comparison. */
const MIRROR: Readonly<Record<string, string>> = { "<": ">", "<=": ">=", ">": "<", ">=": "<=" };

/**
 * Comparing an entity or atom with a disordered wrapper, which Biopython only ever does by reflection.
 *
 * `Atom.__lt__` and `Entity.__lt__` accept nothing but their own kind, so a wrapper on the right makes them return
 * `NotImplemented`; Python then retries the mirrored operator on the wrapper, which delegates it to its selected
 * child. The comparison that actually happens is therefore the mirror of the one asked for, so its sign is negated
 * here — and its `TypeError`, when the two cannot be compared at all, names the operands in that mirrored order,
 * which is what Biopython reports.
 *
 * @param left - The operand that was asked first and cannot take a wrapper.
 * @param wrapper - The wrapper on the right.
 * @param op - The operator as asked.
 * @returns The sign of `left` against the wrapper's selected child.
 */
export function compareThroughWrapper(left: unknown, wrapper: DisorderedEntityWrapper, op: string): number {
  return -wrapper.compare(left, MIRROR[op] ?? op);
}

/** Wrap a disordered wrapper so unknown properties are read from its selected child (Python's `__getattr__`). */
function forwardToSelected<T extends DisorderedEntityWrapper>(wrapper: T): T {
  return new Proxy(wrapper, {
    get(target, prop, receiver) {
      if (typeof prop === "symbol" || prop in target) return Reflect.get(target, prop, receiver);
      const child = target.selectedChild as unknown as Record<string, unknown> | null;
      if (child === null) return undefined;
      const value = child[prop as string];
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(child) : value;
    },
  });
}

/** Holds the alternative versions (altlocs, or point-mutated residues) of one position; one of them is selected. */
export abstract class DisorderedEntityWrapper {
  /** Solvent accessible surface area, set by `ShrakeRupley.compute` (on the wrapper itself, not its children). */
  declare sasa?: number;
  /** The id shared by all alternatives. */
  id: EntityId;
  /** Alternatives by id key. */
  childDict = new Map<string, Child>();
  /** The currently selected alternative. */
  selectedChild: Child | null = null;

  /**
   * Transform the selected child only (Python forwards unknown methods to it); `DisorderedAtom` overrides this to move every alternative.
   *
   * @param rot - A 3x3 matrix.
   * @param tran - The translation.
   * @throws TypeError (Python's AttributeError) when nothing is selected.
   */
  transform(rot: RotMatrix, tran: ArrayLike<number>): void {
    if (this.selectedChild === null) throw new TypeError("'NoneType' object has no attribute 'transform'");
    this.selectedChild.transform(rot, tran);
  }
  /** The parent entity. */
  parent: Entity<Child> | null = null;
  /** Any other attribute is read from the selected child (Python's `__getattr__`). */
  [key: string]: any;

  /**
   * @param id - The shared id. The returned object forwards unknown properties to the selected child.
   */
  constructor(id: EntityId) {
    this.id = id;
    return forwardToSelected(this);
  }

  /** The id. */
  getId(): EntityId {
    return this.id;
  }

  /** Iterate the selected child (Python `__iter__`). */
  [Symbol.iterator](): Iterator<unknown> {
    return (this.selectedChild as unknown as Iterable<unknown>)[Symbol.iterator]();
  }

  /** The Python type name of the selected child, which is what its own operations name in their messages. */
  private get childType(): string {
    return this.selectedChild === null ? "NoneType" : this.selectedChild.constructor.name;
  }

  /**
   * Ordering (`<`, `<=`, `>`, `>=`), which Biopython delegates to the selected child: `self.selected_child < other`.
   *
   * Both sides end up unwrapped. `Atom.__lt__` and `Entity.__lt__` accept only their own kind and return
   * `NotImplemented` for a wrapper, so Python retries the reflected operator on the other side, which unwraps it in
   * turn and compares the two selected children. The `TypeError` for something that is not comparable therefore
   * names the *child's* class, not the wrapper's.
   *
   * @param other - The right-hand operand; a wrapper is compared by its selected child.
   * @param op - The operator, for the message.
   * @returns Negative, zero or positive.
   * @throws TypeError when nothing is selected, or the child cannot be compared with `other`.
   */
  compare(other: unknown, op = "<"): number {
    if (this.selectedChild === null) throw new TypeError(`'${op}' not supported between instances of 'NoneType' and '${pyTypeName(other)}'`);
    const child = this.selectedChild as unknown as { compare(o: unknown, op?: string): number };
    return child.compare(other, op);
  }

  /**
   * Python `len(wrapper)`, which is `len(self.selected_child)`. An `Atom` is not a container, so a
   * {@link DisorderedAtom} always raises here while a {@link DisorderedResidue} reports its residue's atom count.
   *
   * @throws TypeError when the selected child has no length (or nothing is selected).
   */
  get length(): number {
    if (!(this.selectedChild instanceof Entity)) throw new TypeError(`object of type '${this.childType}' has no len()`);
    return this.selectedChild.length;
  }

  /**
   * Python `wrapper[id]`, which is `self.selected_child[id]`.
   *
   * @param id - The child id to look up in the selected child.
   * @throws TypeError when the selected child is not subscriptable (every `DisorderedAtom`); KeyError from the child.
   */
  get(id: EntityId): Child {
    if (!(this.selectedChild instanceof Entity)) throw new TypeError(`'${this.childType}' object is not subscriptable`);
    return this.selectedChild.get(id) as Child;
  }

  /**
   * Python `id in wrapper`, which is `id in self.selected_child`.
   *
   * @param id - The child id to look for in the selected child.
   * @throws TypeError when the selected child is not a container (every `DisorderedAtom`).
   */
  has(id: EntityId): boolean {
    if (!(this.selectedChild instanceof Entity)) throw new TypeError(`argument of type '${this.childType}' is not a container or iterable`);
    return this.selectedChild.has(id);
  }

  /**
   * Python `DisorderedEntityWrapper.strictly_equals`: same wrapper type, id, selected child id,
   * alternatives and (recursively) alternatives' strict equality.
   *
   * @param other - Wrapper to compare with.
   * @param compareCoordinates - Whether atoms also compare coordinates.
   */
  strictlyEquals(other: unknown, compareCoordinates = false): boolean {
    if (!(other instanceof (this.constructor as new (...a: never[]) => object))) return false;
    const o = other as DisorderedEntityWrapper;
    if (idKey(this.id) !== idKey(o.id)) return false;
    if (idKey(this.selectedChild!.getId()) !== idKey(o.selectedChild!.getId())) return false;
    if (this.childDict.size !== o.childDict.size || [...this.childDict.keys()].some((k) => !o.childDict.has(k))) return false;
    for (const [k, c] of this.childDict) {
      if (!(c as unknown as Entity<Child>).strictlyEquals(o.childDict.get(k), compareCoordinates)) return false;
    }
    return true;
  }

  /** The parent. */
  getParent(): Entity<Child> | null {
    return this.parent;
  }

  /** Set the parent of the wrapper and of every alternative. */
  setParent(parent: Entity<Child> | null): void {
    this.parent = parent;
    for (const child of this.disorderedGetList()) child.setParent(parent);
  }

  /** Forget the parent (of the wrapper and of every alternative). */
  detachParent(): void {
    this.parent = null;
    for (const child of this.disorderedGetList()) child.detachParent();
  }

  /**
   * Python `wrapper[id] = child`: store a child under an id without touching the selection or the child's parent.
   *
   * @param id - The key.
   * @param child - The alternative to store.
   */
  set(id: EntityId, child: Child): void {
    this.childDict.set(idKey(id), child);
  }

  /** Select the alternative with this id. @throws Error (KeyError) when absent. */
  disorderedSelect(id: EntityId): void {
    const child = this.childDict.get(idKey(id));
    if (child === undefined) throw Object.assign(new Error(pyStr(id)), { name: "KeyError" });
    this.selectedChild = child;
  }

  /** Always 2: marks a disordered wrapper. */
  isDisordered(): number {
    return 2;
  }

  /** Whether an alternative with this id exists. */
  disorderedHasId(id: EntityId): boolean {
    return this.childDict.has(idKey(id));
  }

  /** Sorted ids of the alternatives. */
  disorderedGetIdList(): EntityId[] {
    return pySortedIds([...this.childDict.keys()].map(keyToId));
  }

  /** The alternative with this id, or the selected one when no id is given. */
  disorderedGet(id: EntityId | null = null): Child {
    if (id === null) return this.selectedChild!;
    const child = this.childDict.get(idKey(id));
    if (child === undefined) throw Object.assign(new Error(String(id)), { name: "KeyError" });
    return child;
  }

  /** All alternatives (subclasses define the order). */
  disorderedGetList(): Child[] {
    return [...this.childDict.values()];
  }

  /** A copy with copies of every alternative. */
  copy(): this {
    const shallow = Object.create(Object.getPrototypeOf(this)) as this;
    Object.assign(shallow, this);
    shallow.childDict = new Map();
    shallow.detachParent();
    for (const child of this.disorderedGetList()) (shallow as unknown as { disorderedAdd(c: Child): void }).disorderedAdd(child.copy());
    return forwardToSelected(shallow);
  }
}
