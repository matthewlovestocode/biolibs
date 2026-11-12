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
 * Python's `repr(x)`. Understands null (`None`), booleans, numbers, strings,
 * arrays (lists), `Map`s and plain objects (dicts), and any object with a
 * `repr()` method (positions, locations, features).
 */
export function pyRepr(x: unknown): string {
  if (x === null || x === undefined) return "None";
  if (typeof x === "boolean") return x ? "True" : "False";
  if (typeof x === "number") return String(x);
  if (typeof x === "string") return reprString(x);
  if (Array.isArray(x)) return "[" + x.map(pyRepr).join(", ") + "]";
  if (x instanceof Map) return "{" + [...x].map(([k, v]) => `${pyRepr(k)}: ${pyRepr(v)}`).join(", ") + "}";
  if (typeof (x as { repr?: unknown }).repr === "function") return (x as { repr(): string }).repr();
  if (typeof x === "object") return "{" + Object.entries(x).map(([k, v]) => `${pyRepr(k)}: ${pyRepr(v)}`).join(", ") + "}";
  return String(x);
}

/** Python's `str(x)`: strings as-is, everything else like {@link pyRepr} unless it defines `toString()`. */
export function pyStr(x: unknown): string {
  if (typeof x === "string") return x;
  if (x !== null && typeof x === "object" && !Array.isArray(x) && !(x instanceof Map) && x.toString !== Object.prototype.toString) return x.toString();
  return pyRepr(x);
}

/** Python's `type(x).__name__`. */
export function pyTypeName(x: unknown): string {
  if (x === null || x === undefined) return "NoneType";
  if (typeof x === "boolean") return "bool";
  if (typeof x === "number") return Number.isInteger(x) ? "int" : "float";
  if (typeof x === "string") return "str";
  if (Array.isArray(x)) return "list";
  if (x instanceof Map) return "dict";
  if (typeof x === "object") return (x as object).constructor.name;
  return typeof x;
}

/** Biopython classes defined in `Bio.SeqFeature`, for `<class 'Bio.SeqFeature.X'>` messages. */
const FEATURE_CLASSES = new Set([
  "SeqFeature", "Reference", "SimpleLocation", "CompoundLocation", "ExactPosition", "UncertainPosition", "UnknownPosition",
  "WithinPosition", "BetweenPosition", "BeforePosition", "AfterPosition", "OneOfPosition",
]);

/** Python's `str(type(x))`, e.g. `<class 'int'>` or `<class 'Bio.SeqFeature.SimpleLocation'>`. */
export function pyClassRepr(x: unknown): string {
  const n = pyTypeName(x);
  return FEATURE_CLASSES.has(n) ? `<class 'Bio.SeqFeature.${n}'>` : n === "Seq" || n === "MutableSeq" ? `<class 'Bio.Seq.${n}'>` : `<class '${n}'>`;
}
