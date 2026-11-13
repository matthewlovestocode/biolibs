/** Matching tree elements: Biopython's `_object_matcher` family and `_combine_args`. */

import { PyFloat, ValueError, pyRepr } from "@biolibs/core";
import { TreeElement } from "./tree-element.js";

/** A predicate on tree elements. */
export type Matcher = (node: unknown) => boolean;

/**
 * What a search can be given: a tree element (matched by identity), a class (matched with `instanceof`), a string (matched against
 * clade names), a plain object of attribute patterns (strings are regular expressions, integers and booleans compare directly, `null`
 * means "is None"), or a function.
 */
export type Target = TreeElement | (abstract new (...args: never[]) => unknown) | string | Record<string, unknown> | ((node: any) => unknown) | null | undefined;

/** The keyword arguments of the search methods, with attribute names in camel case (`branchLength`, not `branch_length`). */
export type Pattern = Record<string, unknown>;

/** Python's name for a camel-case option (`branchLength` is `branch_length`). */
export const snake = (key: string): string => key.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());

/** Python's `class` repr of a value's type for `TypeError` messages. */
function typeRepr(value: unknown): string {
  if (typeof value === "number") return Number.isInteger(value) ? "<class 'int'>" : "<class 'float'>";
  if (Array.isArray(value)) return "<class 'list'>";
  return "<class 'object'>";
}

/** Python's truth value of a tree attribute. */
export function truthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false || value === 0 || value === "") return false;
  if (value instanceof PyFloat) return value.value !== 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** The match function for a dictionary of attribute patterns (Biopython's `_attribute_matcher`), including its habit of stopping at the first key. */
export function attributeMatcher(kwargs: Pattern): Matcher {
  return (node: unknown): boolean => {
    let rest: Pattern = kwargs;
    if ("terminal" in kwargs) {
      rest = { ...kwargs };
      const pattern = rest["terminal"];
      delete rest["terminal"];
      const n = node as { isTerminal?: () => boolean };
      if (pattern !== null && pattern !== undefined && (typeof n.isTerminal !== "function" || n.isTerminal() !== pattern)) return false;
    }
    for (const [key, pattern] of Object.entries(rest)) {
      if (!(key in (node as object))) return false;
      const target = (node as Record<string, unknown>)[key];
      if (typeof pattern === "string") return typeof target === "string" && new RegExp(`^(?:${pattern})$`).test(target);
      if (typeof pattern === "boolean") return pattern === truthy(target);
      if (typeof pattern === "number") {
        if (!Number.isInteger(pattern)) throw new TypeError(`invalid query type: ${typeRepr(pattern)}`);
        return pattern === (target instanceof PyFloat ? target.value : target);
      }
      if (pattern === null || pattern === undefined) return target === null || target === undefined;
      throw new TypeError(`invalid query type: ${typeRepr(pattern)}`);
    }
    return true;
  };
}

/** A matcher that catches `LookupError`, `AttributeError`, `ValueError` and `TypeError`-like failures and says "no match". */
function functionMatcher(fn: (node: any) => unknown): Matcher {
  return (node) => {
    try { return Boolean(fn(node)); } catch (e) {
      if (e instanceof TypeError || e instanceof ValueError || (e instanceof Error && /^(IndexError|KeyError|AttributeError)$/.test(e.name))) return false;
      throw e;
    }
  };
}

/** Whether `target` is a class (a constructor of tree elements or other objects). */
function isClass(target: unknown): target is abstract new (...args: never[]) => unknown {
  return typeof target === "function" && /^class[\s{]/.test(Function.prototype.toString.call(target));
}

/** The matcher for a single target object (Biopython's `_object_matcher`). @throws ValueError for other values. */
export function objectMatcher(obj: unknown): Matcher {
  if (obj instanceof TreeElement) return (node) => node === obj;
  if (isClass(obj)) return (node) => node instanceof obj;
  if (typeof obj === "string") {
    return (node) => {
      const n = node as { name?: unknown; isTerminal?: unknown; root?: unknown };
      if (node instanceof TreeElement && "root" in n) return n.name === obj;
      return String(node) === obj;
    };
  }
  if (typeof obj === "function") return functionMatcher(obj as (node: unknown) => unknown);
  if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) return attributeMatcher(obj as Pattern);
  throw new ValueError(`${pyRepr(obj)} (type ${typeRepr(obj)}) is not a valid type for comparison.`);
}

/** Whether a target counts as "no target" (Python's falsy values). */
function isEmptyTarget(target: unknown): boolean {
  if (target === null || target === undefined || target === "" || target === 0 || target === false) return true;
  return typeof target === "object" && !(target instanceof TreeElement) && !Array.isArray(target) && Object.keys(target as object).length === 0;
}

/** Merge a target and keyword patterns into one predicate (Biopython's `_combine_matchers`). @throws ValueError when a specification is required and missing. */
export function combineMatchers(target: unknown, kwargs: Pattern, requireSpec: boolean): Matcher {
  if (isEmptyTarget(target)) {
    if (Object.keys(kwargs).length === 0) {
      if (requireSpec) throw new ValueError("you must specify a target object or keyword arguments.");
      return () => true;
    }
    return attributeMatcher(kwargs);
  }
  const matchObj = objectMatcher(target);
  if (Object.keys(kwargs).length === 0) return matchObj;
  const matchKwargs = attributeMatcher(kwargs);
  return (x) => matchObj(x) && matchKwargs(x);
}

/**
 * Turn `[targets]` or `targets...` into one list (Biopython's `_combine_args`).
 *
 * @throws ValueError if both a list and separate targets are given.
 */
export function combineArgs(first: unknown, ...rest: unknown[]): unknown[] {
  const isIterable = typeof first === "object" && first !== null && Symbol.iterator in first && !(first instanceof TreeElement);
  if (isIterable) {
    if (rest.length > 0) throw new ValueError("Arguments must be either a single list of targets, or separately specified targets (e.g. foo(t1, t2, t3)), but not both.");
    return Array.from(first as Iterable<unknown>);
  }
  return [first, ...rest];
}
