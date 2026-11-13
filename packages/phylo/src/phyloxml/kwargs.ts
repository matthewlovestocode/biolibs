/** `Cls(**attrib)`: turning XML attributes into constructor arguments with Python's argument errors. */

/** `snake_case` to `camelCase`. */
export const camel = (s: string): string => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** CPython's edit distance for "Did you mean" hints: moves cost 2, a change of case costs 1 (`Python/suggestions.c`). */
function distance(a: string, b: string, maxCost: number): number {
  let x = Array.from(a), y = Array.from(b);
  while (x.length && y.length && x[0] === y[0]) { x = x.slice(1); y = y.slice(1); }
  while (x.length && y.length && x.at(-1) === y.at(-1)) { x = x.slice(0, -1); y = y.slice(0, -1); }
  if (x.length === 0 || y.length === 0) return (x.length + y.length) * 2;
  if (x.length > 40 || y.length > 40) return maxCost + 1;
  if (y.length < x.length) [x, y] = [y, x];
  if ((y.length - x.length) * 2 > maxCost) return maxCost + 1;
  const buffer = x.map((_, i) => (i + 1) * 2);
  let result = 0;
  for (let bi = 0; bi < y.length; bi++) {
    const code = y[bi]!;
    let dist = (result = bi * 2);
    let minimum = Infinity;
    for (let i = 0; i < x.length; i++) {
      const sub = dist + (x[i] === code ? 0 : x[i]!.toLowerCase() === code.toLowerCase() ? 1 : 2);
      dist = buffer[i]!;
      result = Math.min(Math.min(result, dist) + 2, sub);
      buffer[i] = result;
      if (result < minimum) minimum = result;
    }
    if (minimum > maxCost) return maxCost + 1;
  }
  return result;
}

/** The closest of `candidates` to `name` as CPython suggests it ("Did you mean 'x'?"), or null. */
export function suggest(name: string, candidates: readonly string[]): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const c of candidates) {
    if (c === name) continue;
    let max = Math.floor((Array.from(name).length + Array.from(c).length + 3) * 2 / 6);
    max = Math.min(max, bestDistance - 1);
    const d = distance(name, c, max);
    if (d > max) continue;
    bestDistance = d;
    best = c;
  }
  return best;
}

/**
 * Check the attributes of an element as keyword arguments for `cls`, and return them as options.
 *
 * @param cls - The class name (for messages).
 * @param params - The names (snake_case) its `__init__` accepts.
 * @param attrib - The XML attributes, in document order.
 * @param explicit - Arguments also passed by name; an attribute with one of these names is a duplicate.
 * @param module - Whether duplicates are reported with the module path (a class call) as Python does.
 * @throws TypeError for a duplicate or unknown name, with Python's message.
 */
export function attrsAsOptions(cls: string, params: readonly string[], attrib: ReadonlyMap<string, string>, explicit: readonly string[] = []): Record<string, unknown> {
  for (const key of attrib.keys()) {
    if (explicit.includes(key)) throw new TypeError(`Bio.Phylo.PhyloXML.${cls}() got multiple values for keyword argument '${key}'`);
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of attrib) {
    if (!params.includes(key)) {
      const hint = suggest(key, params);
      throw new TypeError(`${cls}.__init__() got an unexpected keyword argument '${key}'${hint === null ? "" : `. Did you mean '${hint}'?`}`);
    }
    out[camel(key)] = value;
  }
  return out;
}

/** The `__init__` parameters of the phyloXML classes whose attributes are read with `**attrib`. */
export const PARAMS = {
  Phylogeny: ["root", "rooted", "rerootable", "branch_length_unit", "type", "name", "id", "description", "date", "confidences", "clade_relations", "sequence_relations", "properties", "other"],
  Clade: ["branch_length", "id_source", "name", "width", "color", "node_id", "events", "binary_characters", "date", "confidences", "taxonomies", "sequences", "distributions", "references", "properties", "clades", "other"],
  Sequence: ["type", "id_ref", "id_source", "symbol", "accession", "name", "location", "mol_seq", "uri", "domain_architecture", "annotations", "other"],
  Taxonomy: ["id_source", "id", "code", "scientific_name", "authority", "rank", "uri", "common_names", "synonyms", "other"],
  Annotation: ["ref", "source", "evidence", "type", "desc", "confidence", "uri", "properties"],
} as const;

/** Python's list of names in an error: `'a'`, `'a' and 'b'`, `'a', 'b', and 'c'`. */
function nameList(names: string[]): string {
  const q = names.map((n) => `'${n}'`);
  if (q.length === 1) return q[0]!;
  if (q.length === 2) return `${q[0]} and ${q[1]}`;
  return `${q.slice(0, -1).join(", ")}, and ${q.at(-1)}`;
}

/**
 * `Cls(**dict)`: check a dictionary as keyword arguments and build the object.
 *
 * @param cls - Class name for messages.
 * @param params - Accepted names.
 * @param required - Names that must be present.
 * @param dict - The dictionary.
 * @param build - Constructs the object from the checked arguments.
 * @throws TypeError for unknown or missing names with Python's messages.
 */
export function callKwargs<T>(cls: string, params: readonly string[], required: readonly string[], dict: ReadonlyMap<string, unknown>, build: (args: Record<string, unknown>) => T): T {
  const args: Record<string, unknown> = {};
  for (const [key, value] of dict) {
    if (!params.includes(key)) {
      const hint = suggest(key, params);
      throw new TypeError(`${cls}.__init__() got an unexpected keyword argument '${key}'${hint === null ? "" : `. Did you mean '${hint}'?`}`);
    }
    args[key] = value;
  }
  const missing = required.filter((r) => !dict.has(r));
  if (missing.length > 0) throw new TypeError(`${cls}.__init__() missing ${missing.length} required positional argument${missing.length > 1 ? "s" : ""}: ${nameList(missing)}`);
  return build(args);
}
