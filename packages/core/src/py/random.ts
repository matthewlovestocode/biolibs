/**
 * Python's `random` module: the Mersenne Twister and the methods Biopython draws from it.
 *
 * Two Biopython functions — `Bio.Nexus.Trees.Tree.randomize` and `Bio.Nexus.Nexus.Nexus.bootstrap` — pick
 * their output with `random.choice`, `random.shuffle`, `random.randint` and `random.gauss`. Their results
 * can only be compared with Biopython's if the same bits come out in the same order, so this is a port of
 * MT19937 as `Modules/_randommodule.c` implements it and of the `Random` methods that sit on top of it,
 * down to the rejection loop in `_randbelow` and the cached second value in `gauss`.
 *
 * Like Python, the module keeps one shared generator: `pyRandom` is the instance that `random.choice` and
 * friends use there, so seeding it once fixes everything that follows.
 */

import { ValueError } from "../errors.js";

/** How many words of state MT19937 keeps. */
const N = 624;
/** The twist's offset into that state. */
const M = 397;
/** The twist matrix's constant. */
const MATRIX_A = 0x9908b0df;
/** The bit a twist takes from the word before it. */
const UPPER_MASK = 0x80000000;
/** The bits a twist takes from the word after it. */
const LOWER_MASK = 0x7fffffff;
/** `2 * math.pi`, as `random.gauss` computes it. */
const TWOPI = 2.0 * Math.PI;

/**
 * Python's `random.Random`: MT19937 and the methods built on it.
 *
 * Only the methods Biopython uses are here. Each is a transcription of CPython's, so the sequence of
 * values matches for a given seed — which is the whole point of having it.
 */
export class PyRandom {
  /** The generator's state, 624 words of it. */
  private readonly mt = new Uint32Array(N);
  /** How far through the state the next word is; `N` means the state has to be twisted first. */
  private index = N;
  /** The second value `gauss` computed and did not return, kept for the next call. */
  private gaussNext: number | null = null;

  /** @param a - The seed; see {@link PyRandom.seed}. */
  constructor(a: number | bigint | null = null) {
    this.seed(a);
  }

  /**
   * Seed the generator, as `random.seed` does.
   *
   * @param a - An integer, whose absolute value is split into 32-bit words and fed to `init_by_array`, or
   *   `null` for 32 bytes of system randomness, which is what Python does for a seed it is not given.
   * @throws ValueError for a value that is not an integer; Python also accepts `str`, `bytes` and `float`,
   *   which nothing here needs.
   */
  seed(a: number | bigint | null = null): void {
    if (a === null) {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      const key = new Uint32Array(8);
      for (let i = 0; i < 8; i++) {
        key[i] = bytes[4 * i]! | (bytes[4 * i + 1]! << 8) | (bytes[4 * i + 2]! << 16) | (bytes[4 * i + 3]! << 24);
      }
      this.initByArray(key);
    } else {
      if (typeof a === "number" && !Number.isInteger(a)) throw new ValueError(`seed must be an integer, got ${a}`);
      // Python takes the absolute value and splits it into 32-bit words, least significant first.
      let n = typeof a === "bigint" ? (a < 0n ? -a : a) : BigInt(Math.abs(a));
      const words: number[] = [];
      while (n > 0n) {
        words.push(Number(n & 0xffffffffn));
        n >>= 32n;
      }
      // A seed of zero still gives one word, because `keyused` is never less than one.
      if (words.length === 0) words.push(0);
      this.initByArray(Uint32Array.from(words));
    }
    this.gaussNext = null;
  }

  /**
   * `init_genrand`: fill the state from one 32-bit word.
   *
   * @param s - The word.
   */
  private initGenrand(s: number): void {
    this.mt[0] = s >>> 0;
    for (let i = 1; i < N; i++) {
      const prev = this.mt[i - 1]!;
      // 1812433253 * x + i, kept to 32 bits; Math.imul does the multiplication without losing the top bits.
      this.mt[i] = (Math.imul(1812433253, prev ^ (prev >>> 30)) + i) >>> 0;
    }
    this.index = N;
  }

  /**
   * `init_by_array`: fill the state from a key of any length, which is how Python seeds from an integer.
   *
   * @param key - The key's words.
   */
  private initByArray(key: Uint32Array): void {
    this.initGenrand(19650218);
    let i = 1, j = 0;
    for (let k = Math.max(N, key.length); k > 0; k--) {
      const prev = this.mt[i - 1]!;
      this.mt[i] = (((this.mt[i]! ^ Math.imul(prev ^ (prev >>> 30), 1664525)) >>> 0) + key[j]! + j) >>> 0;
      i++;
      j++;
      if (i >= N) { this.mt[0] = this.mt[N - 1]!; i = 1; }
      if (j >= key.length) j = 0;
    }
    for (let k = N - 1; k > 0; k--) {
      const prev = this.mt[i - 1]!;
      this.mt[i] = (((this.mt[i]! ^ Math.imul(prev ^ (prev >>> 30), 1566083941)) >>> 0) - i) >>> 0;
      i++;
      if (i >= N) { this.mt[0] = this.mt[N - 1]!; i = 1; }
    }
    this.mt[0] = 0x80000000;
  }

  /**
   * `genrand_uint32`: the next 32 bits out of the generator.
   *
   * @returns Them, as an unsigned number.
   */
  private genrandUint32(): number {
    const mt = this.mt;
    if (this.index >= N) {
      // Twist the whole state at once, exactly as the C does in its three loops.
      for (let kk = 0; kk < N - M; kk++) {
        const y = ((mt[kk]! & UPPER_MASK) | (mt[kk + 1]! & LOWER_MASK)) >>> 0;
        mt[kk] = (mt[kk + M]! ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0)) >>> 0;
      }
      for (let kk = N - M; kk < N - 1; kk++) {
        const y = ((mt[kk]! & UPPER_MASK) | (mt[kk + 1]! & LOWER_MASK)) >>> 0;
        mt[kk] = (mt[kk + (M - N)]! ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0)) >>> 0;
      }
      const y = ((mt[N - 1]! & UPPER_MASK) | (mt[0]! & LOWER_MASK)) >>> 0;
      mt[N - 1] = (mt[M - 1]! ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0)) >>> 0;
      this.index = 0;
    }
    let y = mt[this.index++]!;
    y ^= y >>> 11;
    y = (y ^ ((y << 7) & 0x9d2c5680)) >>> 0;
    y = (y ^ ((y << 15) & 0xefc60000)) >>> 0;
    y ^= y >>> 18;
    return y >>> 0;
  }

  /**
   * `random.random`: a float in [0, 1), built from 53 bits as Python builds it.
   *
   * @returns The value.
   */
  random(): number {
    const a = this.genrandUint32() >>> 5, b = this.genrandUint32() >>> 6;
    return (a * 67108864.0 + b) * (1.0 / 9007199254740992.0);
  }

  /**
   * `random.getrandbits` for a width a double holds exactly.
   *
   * @param k - How many bits, from 0 to 53.
   * @returns An integer with that many random bits.
   * @throws ValueError for a negative `k`, as Python does, or for one above 53, where
   *   {@link PyRandom.getrandbitsBig} is the method to use.
   */
  getrandbits(k: number): number {
    if (k < 0) throw new ValueError("number of bits must be non-negative");
    if (k > 53) throw new ValueError("more than 53 bits do not fit a number; use getrandbitsBig");
    if (k === 0) return 0;
    if (k <= 32) return this.genrandUint32() >>> (32 - k);
    // Two words, least significant first, with the leftover bits taken off the second.
    const low = this.genrandUint32();
    const high = this.genrandUint32() >>> (64 - k);
    return low + high * 4294967296;
  }

  /**
   * `random.getrandbits` for any width.
   *
   * @param k - How many bits.
   * @returns An integer with that many random bits.
   * @throws ValueError for a negative `k`.
   */
  getrandbitsBig(k: number): bigint {
    if (k < 0) throw new ValueError("number of bits must be non-negative");
    if (k === 0) return 0n;
    const words = Math.floor((k - 1) / 32) + 1;
    let out = 0n, left = k;
    for (let i = 0; i < words; i++, left -= 32) {
      let r = this.genrandUint32();
      if (left < 32) r >>>= 32 - left;
      out |= BigInt(r) << BigInt(32 * i);
    }
    return out;
  }

  /**
   * `Random._randbelow_with_getrandbits`: an integer in [0, n), by drawing the right number of bits and
   * throwing away anything too large.
   *
   * @param n - The exclusive upper bound.
   * @returns The value, or 0 for `n` of 0, as the method's callers never ask.
   */
  randbelow(n: number): number {
    if (n === 0) return 0;
    // `n.bit_length()`: the position of the highest set bit, counted over both halves for a large `n`.
    const bits = n < 4294967296 ? 32 - Math.clz32(n) : 64 - Math.clz32(Math.floor(n / 4294967296));
    let r = this.getrandbits(bits);
    while (r >= n) r = this.getrandbits(bits);
    return r;
  }

  /**
   * `random.choice`: one element of a sequence.
   *
   * @param seq - The sequence.
   * @returns The element chosen.
   * @throws ValueError with Python's `IndexError` wording for an empty sequence.
   */
  choice<T>(seq: readonly T[]): T {
    if (seq.length === 0) throw new PyIndexError("Cannot choose from an empty sequence");
    return seq[this.randbelow(seq.length)]!;
  }

  /**
   * `random.shuffle`: reorder a list in place, drawing the partner for each position from the left of it.
   *
   * @param x - The list.
   */
  shuffle<T>(x: T[]): void {
    for (let i = x.length - 1; i >= 1; i--) {
      const j = this.randbelow(i + 1);
      const t = x[i]!;
      x[i] = x[j]!;
      x[j] = t;
    }
  }

  /**
   * `random.randrange` with a unit step.
   *
   * @param start - The lower bound, or the exclusive upper bound when `stop` is left out.
   * @param stop - The exclusive upper bound.
   * @returns The value.
   * @throws ValueError for an empty range, with Python's wording.
   */
  randrange(start: number, stop: number | null = null): number {
    if (stop === null) {
      if (start > 0) return this.randbelow(start);
      throw new ValueError("empty range for randrange()");
    }
    const width = stop - start;
    if (width > 0) return start + this.randbelow(width);
    throw new ValueError(`empty range in randrange(${start}, ${stop})`);
  }

  /**
   * `random.randint`: an integer in [a, b], both ends included.
   *
   * @param a - The lower bound. @param b - The upper bound.
   * @returns The value.
   */
  randint(a: number, b: number): number {
    return this.randrange(a, b + 1);
  }

  /**
   * `random.gauss`: a normally distributed value.
   *
   * Each pair of uniform draws yields two independent normal values, and Python returns one and keeps the
   * other for the following call — so the number of `random()` draws depends on how many times `gauss` has
   * been called before, and seeding clears what was kept.
   *
   * @param mu - The mean. @param sigma - The standard deviation.
   * @returns The value.
   */
  gauss(mu = 0.0, sigma = 1.0): number {
    let z = this.gaussNext;
    this.gaussNext = null;
    if (z === null) {
      const x2pi = this.random() * TWOPI;
      const g2rad = Math.sqrt(-2.0 * Math.log(1.0 - this.random()));
      z = Math.cos(x2pi) * g2rad;
      this.gaussNext = Math.sin(x2pi) * g2rad;
    }
    return mu + z * sigma;
  }
}

/** Mirrors Python's `IndexError` as `random.choice` raises it for an empty sequence. */
export class PyIndexError extends ValueError {
  override name = "IndexError";
}

/**
 * The one generator the module-level `random` functions share, as Python's `random._inst` is shared.
 *
 * Biopython's `randomize` and `bootstrap` call those module functions, so this is the instance to seed
 * before either of them if the result has to be reproducible.
 */
export const pyRandom = new PyRandom(null);
