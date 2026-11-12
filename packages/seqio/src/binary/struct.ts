/** A small port of Python's `struct.pack` and `struct.unpack` for the formats the binary readers need. */

/** Mirrors `struct.error` (Python reports its type name as `error`). */
export class StructError extends Error {
  /** @param message - What was wrong with the buffer or value. */
  constructor(message: string) {
    super(message);
    this.name = "error";
  }
}

interface Item { code: string; count: number }

const SIZES: Record<string, number> = { x: 1, c: 1, b: 1, B: 1, "?": 1, h: 2, H: 2, i: 4, I: 4, l: 4, L: 4, q: 8, Q: 8, f: 4, d: 8, s: 1 };

/** Split a format such as `">BBxH12s"` into byte order and items. */
function parseFormat(fmt: string): { little: boolean; items: Item[] } {
  let little = true;
  let rest = fmt;
  if ("@=<>!".includes(fmt[0] ?? "")) {
    little = fmt[0] === "<" || fmt[0] === "@" || fmt[0] === "=";
    rest = fmt.slice(1);
  }
  const items: Item[] = [];
  const re = /(\d*)([a-zA-Z?])/gy;
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(rest)) !== null) {
    if (SIZES[m[2]!] === undefined) throw new StructError("bad char in struct format");
    items.push({ code: m[2]!, count: m[1] === "" ? 1 : Number(m[1]) });
    consumed = re.lastIndex;
  }
  if (consumed !== rest.length) throw new StructError("bad char in struct format");
  return { little, items };
}

/** Total byte size of a format (Python `struct.calcsize`). */
export function calcsize(fmt: string): number {
  return parseFormat(fmt).items.reduce((n, it) => n + SIZES[it.code]! * it.count, 0);
}

/**
 * Decode a buffer exactly as long as the format needs.
 *
 * @returns One value per field: numbers (64-bit ones as `bigint`), booleans, 1-byte strings for `c`, and byte arrays for `s`.
 * @throws {@link StructError} ("unpack requires a buffer of N bytes") if the length is wrong.
 * @example
 * ```ts
 * unpack(">HB2x", Uint8Array.of(1, 2, 3, 0, 0));   // [258, 3]
 * ```
 */
export function unpack(fmt: string, data: Uint8Array): (number | bigint | boolean | string | Uint8Array)[] {
  const { little, items } = parseFormat(fmt);
  const size = items.reduce((n, it) => n + SIZES[it.code]! * it.count, 0);
  if (data.length !== size) throw new StructError(`unpack requires a buffer of ${size} bytes`);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const out: (number | bigint | boolean | string | Uint8Array)[] = [];
  let at = 0;
  for (const { code, count } of items) {
    if (code === "x") { at += count; continue; }
    if (code === "s") { out.push(data.slice(at, at + count)); at += count; continue; }
    for (let i = 0; i < count; i++) {
      switch (code) {
        case "c": out.push(String.fromCharCode(data[at]!)); break;
        case "b": out.push(view.getInt8(at)); break;
        case "B": out.push(view.getUint8(at)); break;
        case "?": out.push(view.getUint8(at) !== 0); break;
        case "h": out.push(view.getInt16(at, little)); break;
        case "H": out.push(view.getUint16(at, little)); break;
        case "i": case "l": out.push(view.getInt32(at, little)); break;
        case "I": case "L": out.push(view.getUint32(at, little)); break;
        case "q": out.push(view.getBigInt64(at, little)); break;
        case "Q": out.push(view.getBigUint64(at, little)); break;
        case "f": out.push(view.getFloat32(at, little)); break;
        case "d": out.push(view.getFloat64(at, little)); break;
      }
      at += SIZES[code]!;
    }
  }
  return out;
}

/** Read one big- or little-endian unsigned integer from the start of `bytes` (Python `int.from_bytes`). */
export function intFromBytes(bytes: Uint8Array, little: boolean): number {
  let n = 0;
  const list = little ? [...bytes].reverse() : [...bytes];
  for (const b of list) n = n * 256 + b;
  return n;
}

/**
 * Encode values to bytes.
 *
 * @throws {@link StructError} for a value outside the range of its field or the wrong number of values.
 * @example
 * ```ts
 * pack(">BH", 1, 513);   // Uint8Array [1, 2, 1]
 * ```
 */
export function pack(fmt: string, ...values: (number | bigint | boolean | Uint8Array)[]): Uint8Array {
  const { little, items } = parseFormat(fmt);
  const size = items.reduce((n, it) => n + SIZES[it.code]! * it.count, 0);
  const needed = items.reduce((n, it) => n + (it.code === "x" ? 0 : it.code === "s" ? 1 : it.count), 0);
  if (values.length !== needed) throw new StructError(`pack expected ${needed} items for packing (got ${values.length})`);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let at = 0;
  let v = 0;
  const LIMITS: Record<string, [number, number]> = {
    b: [-128, 127], B: [0, 255], h: [-32768, 32767], H: [0, 65535], i: [-2147483648, 2147483647], l: [-2147483648, 2147483647], I: [0, 4294967295], L: [0, 4294967295],
  };
  const range = (code: string, x: unknown): number => {
    if (typeof x === "boolean") x = Number(x);
    if (typeof x !== "number" || !Number.isInteger(x)) throw new StructError("required argument is not an integer");
    const [lo, hi] = LIMITS[code]!;
    if (x < lo || x > hi) throw new StructError(`'${code}' format requires ${lo} <= number <= ${hi}`);
    return x;
  };
  for (const { code, count } of items) {
    if (code === "x") { at += count; continue; }
    if (code === "s") {
      const b = values[v++];
      if (!(b instanceof Uint8Array)) throw new StructError("argument for 's' must be a bytes object");
      out.set(b.subarray(0, count), at);
      at += count;
      continue;
    }
    for (let i = 0; i < count; i++) {
      const x = values[v++];
      switch (code) {
        case "B": view.setUint8(at, range("B", x)); break;
        case "b": view.setInt8(at, range("b", x)); break;
        case "H": view.setUint16(at, range("H", x), little); break;
        case "h": view.setInt16(at, range("h", x), little); break;
        case "I": case "L": view.setUint32(at, range(code, x), little); break;
        case "i": case "l": view.setInt32(at, range(code, x), little); break;
        case "Q": case "q": {
          if (typeof x !== "bigint" && !(typeof x === "number" && Number.isInteger(x)) && typeof x !== "boolean") throw new StructError("required argument is not an integer");
          const big = BigInt(x as number | bigint | boolean);
          const [lo, hi] = code === "Q" ? [0n, 18446744073709551615n] : [-9223372036854775808n, 9223372036854775807n];
          if (big < lo || big > hi) throw new StructError(`'${code}' format requires ${lo} <= number <= ${hi}`);
          if (code === "Q") view.setBigUint64(at, big, little); else view.setBigInt64(at, big, little);
          break;
        }
        default: throw new StructError(`unsupported format ${code}`);
      }
      at += SIZES[code]!;
    }
  }
  return out;
}
