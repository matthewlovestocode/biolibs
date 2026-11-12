/** Decoding of 454 "unique access number" read names (time, region and plate coordinates). */

const POWERS_OF_36 = [1, 36, 36 ** 2, 36 ** 3, 36 ** 4, 36 ** 5];
const TIME_DENOMINATORS = [13 * 32 * 24 * 60 * 60, 32 * 24 * 60 * 60, 24 * 60 * 60, 60 * 60, 60];

/** Python's `re.match("^[a-zA-Z0-9]{14}$", name)` (its `$` also allows a final newline). */
export const isUanName = (name: string): boolean => /^[a-zA-Z0-9]{14}\n?$/.test(name);

/** A name as a base-36 number, reading digits from the right and ignoring other characters (counted as 0). */
function stringAsBase36(s: string): number {
  let total = 0;
  const chars = [...s].reverse();
  for (let i = 0; i < Math.min(chars.length, POWERS_OF_36.length); i++) {
    const c = chars[i]!.charCodeAt(0);
    let val = 0;
    if (c >= 48 && c <= 57) val = c - 22;
    else if (c >= 65 && c <= 90) val = c - 65;
    else if (c >= 97 && c <= 122) val = c - 97;
    total += val * POWERS_OF_36[i]!;
  }
  return total;
}

/** The plate `[x, y]` coordinates encoded in a read name. */
export function readXY(name: string): [number, number] {
  const n = stringAsBase36(name.slice(9));
  return [Math.floor(n / 4096), n % 4096];
}

/** The `[year, month, day, hour, minute, second]` encoded in a read name. */
export function readTime(name: string): number[] {
  const out: number[] = [];
  let remainder = stringAsBase36(name.slice(0, 6));
  for (const d of TIME_DENOMINATORS) {
    out.push(Math.floor(remainder / d));
    remainder %= d;
  }
  out.push(remainder);
  out[0]! += 2000;
  return out;
}
