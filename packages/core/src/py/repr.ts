/** Python-style `repr()`, `str()` and type names, used to reproduce Biopython's messages exactly. */

/** Quote a string the way Python's `repr(str)` does. */
function reprString(s: string): string {
  const q = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === "\\") out += "\\\\";
    else if (ch === q) out += "\\" + q;
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (c < 0x20 || c === 0x7f) out += "\\x" + c.toString(16).padStart(2, "0");
    else out += ch;
  }
  return q + out + q;
}

/**
 * A `PyFloat` reduced to its number, so that `==` and truthiness see the value rather than the wrapper.
 *
 * @param x - Any value. @returns Its number if it is a `PyFloat`, otherwise it unchanged.
 */
function unwrapFloat(x: unknown): unknown {
  if (x !== null && typeof x === "object" && x.constructor?.name === "PyFloat") {
    return (x as { value: number }).value;
  }
  // Python's bools *are* ints, so `1 == True` and `0 == False`, while `2 == True` is false.
  if (typeof x === "boolean") return x ? 1 : 0;
  return x;
}

/**
 * Python's `repr(x)`. Understands null (`None`), booleans, numbers, strings,
 * arrays (lists), `Map`s and plain objects (dicts), and any object with a
 * `repr()` method (positions, locations, features).
 */
export function pyRepr(x: unknown): string {
  if (x === null || x === undefined) return "None";
  if (typeof x === "boolean") return x ? "True" : "False";
  if (typeof x === "number") return String(x);
  if (typeof x === "string") return reprString(x);
  if (typeof (x as { repr?: unknown }).repr === "function") return (x as { repr(): string }).repr();
  if (Array.isArray(x)) return "[" + x.map(pyRepr).join(", ") + "]";
  if (x instanceof Map) return "{" + [...x].map(([k, v]) => `${pyRepr(k)}: ${pyRepr(v)}`).join(", ") + "}";
  if (typeof (x as { repr?: unknown }).repr === "function") return (x as { repr(): string }).repr();
  if (typeof x === "object") return "{" + Object.entries(x).map(([k, v]) => `${pyRepr(k)}: ${pyRepr(v)}`).join(", ") + "}";
  return String(x);
}

/** Python's `str(x)`: strings as-is, everything else like {@link pyRepr} unless it defines `toString()`. */
export function pyStr(x: unknown): string {
  if (typeof x === "string") return x;
  // An own `toString` is a port's way of saying how Python prints the object. The function check is not
  // redundant: an object made with `Object.create(null)` has no `toString` at all, and calling the
  // inherited one would throw while building an error message.
  if (x !== null && typeof x === "object" && !Array.isArray(x) && !(x instanceof Map)
      && typeof x.toString === "function" && x.toString !== Object.prototype.toString) {
    return x.toString();
  }
  return pyRepr(x);
}

/** Python's `type(x).__name__`. */
export function pyTypeName(x: unknown): string {
  if (x === null || x === undefined) return "NoneType";
  if (typeof x === "boolean") return "bool";
  if (typeof x === "number") return Number.isInteger(x) ? "int" : "float";
  if (typeof x === "string") return "str";
  // Before the Array check: a PyTuple *is* an Array subclass, so this order is what tells the two apart.
  if (x instanceof PyTuple) return "tuple";
  if (Array.isArray(x)) return "list";
  if (x instanceof Map) return "dict";
  if (typeof x === "object") return (x as object).constructor.name;
  return typeof x;
}

/** Class name to the Python module that defines it, for `<class 'Bio.Seq.Seq'>`-style messages. */
const CLASS_MODULES = new Map<string, string>();

/**
 * Tell {@link pyClassRepr} which Python module a class belongs to, so error
 * messages can say `<class 'Bio.SeqFeature.SimpleLocation'>` like Biopython.
 *
 * @param module - Python module path, e.g. `"Bio.SeqFeature"`.
 * @param names - Class names defined in that module.
 */
export function registerPythonClasses(module: string, names: string[]): void {
  for (const n of names) CLASS_MODULES.set(n, module);
}

/** Python's `str(type(x))`, e.g. `<class 'int'>` or `<class 'Bio.SeqFeature.SimpleLocation'>`. */
export function pyClassRepr(x: unknown): string {
  const n = pyTypeName(x);
  const module = CLASS_MODULES.get(n);
  return module ? `<class '${module}.${n}'>` : `<class '${n}'>`;
}

/**
 * Python `==` for plain data: primitives, arrays (lists), `Map`s (dicts), and
 * objects with an `equals()` method.
 */
export function pyEquals(a: unknown, b: unknown): boolean {
  // A PyFloat only exists to remember that a whole number came from a float; `1 == 1.0` in Python, so
  // unwrap both sides before comparing.
  a = unwrapFloat(a);
  b = unwrapFloat(b);
  if (a === b) return true;
  // A list and a tuple are never equal in Python, whatever they hold, and a PyTuple is an Array
  // subclass -- so the kinds have to match before the contents are compared at all.
  if (a instanceof PyTuple !== b instanceof PyTuple) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => pyEquals(v, b[i]));
  if (a instanceof Map && b instanceof Map) return a.size === b.size && [...a].every(([k, v]) => b.has(k) && pyEquals(v, b.get(k)));
  if (a !== null && typeof a === "object" && typeof (a as { equals?: unknown }).equals === "function") return (a as { equals(o: unknown): boolean }).equals(b);
  return false;
}

/** Python truthiness: `None`, `0`, `""`, `[]` and empty dicts are false; everything else is true. */
export function pyTruthy(x: unknown): boolean {
  x = unwrapFloat(x);
  if (x === null || x === undefined) return false;
  if (typeof x === "boolean") return x;
  if (typeof x === "number") return x !== 0;
  if (typeof x === "string") return x.length > 0;
  if (Array.isArray(x)) return x.length > 0;
  if (x instanceof Map) return x.size > 0;
  return true;
}

/**
 * Python's `needle in haystack` for strings (substring), lists (membership) and dicts (key).
 *
 * @throws TypeError for other container types, with Python's message.
 */
export function pyContains(needle: unknown, haystack: unknown): boolean {
  if (typeof haystack === "string") {
    if (typeof needle !== "string") throw new TypeError(`'in <string>' requires string as left operand, not ${pyTypeName(needle)}`);
    return haystack.includes(needle);
  }
  if (Array.isArray(haystack)) return haystack.some((h) => pyEquals(h, needle));
  if (haystack instanceof Map) return haystack.has(needle);
  throw new TypeError(`argument of type '${pyTypeName(haystack)}' is not a container or iterable`);
}

/**
 * Iterate like Python's `for x in obj`: a string gives its characters, a list its items, a `Map` its keys.
 *
 * @throws TypeError ("'int' object is not iterable") for anything else.
 * @example
 * ```ts
 * [...pyIter("ab")];   // ["a", "b"]
 * ```
 */
export function* pyIter(x: unknown): Generator<unknown> {
  if (typeof x === "string") yield* x;
  else if (Array.isArray(x) || x instanceof Uint8Array) yield* x;
  else if (x instanceof Map) yield* x.keys();
  else if (x instanceof Set) yield* x;
  else throw new TypeError(`'${pyTypeName(x)}' object is not iterable`);
}

/**
 * Python's `repr(bytes)`, for example `b'ABIF'` or `b"it's"`.
 *
 * @example
 * ```ts
 * pyBytesRepr(Uint8Array.of(65, 0, 255));   // "b'A\\x00\\xff'"
 * ```
 */
export function pyBytesRepr(bytes: Uint8Array): string {
  let hasSingle = false;
  let hasDouble = false;
  for (const b of bytes) {
    if (b === 0x27) hasSingle = true;
    if (b === 0x22) hasDouble = true;
  }
  const q = hasSingle && !hasDouble ? '"' : "'";
  let out = "";
  for (const b of bytes) {
    if (b === 0x5c) out += "\\\\";
    else if (b === q.charCodeAt(0)) out += "\\" + q;
    else if (b === 0x0a) out += "\\n";
    else if (b === 0x0d) out += "\\r";
    else if (b === 0x09) out += "\\t";
    else if (b < 0x20 || b >= 0x7f) out += "\\x" + b.toString(16).padStart(2, "0");
    else out += String.fromCharCode(b);
  }
  return `b${q}${out}${q}`;
}

/** A Python tuple: an array that prints as `(1, 2)` (and `(1,)` for one item). */
export class PyTuple<T = unknown> extends Array<T> {
  /** @returns Python's `repr(tuple)`. */
  repr(): string {
    const items = Array.from(this, pyRepr);
    return items.length === 1 ? `(${items[0]},)` : `(${items.join(", ")})`;
  }
}
