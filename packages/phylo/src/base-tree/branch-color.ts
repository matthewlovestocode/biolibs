/** `BranchColor`: the colour of a clade when drawn. */

import { AssertionError, KeyError, ValueError } from "@biolibs/core";

/** The colour names Biopython knows, as RGB triples. */
const COLOR_NAMES: Record<string, [number, number, number]> = {
  red: [255, 0, 0], r: [255, 0, 0], yellow: [255, 255, 0], y: [255, 255, 0], green: [0, 128, 0], g: [0, 128, 0], cyan: [0, 255, 255], c: [0, 255, 255],
  blue: [0, 0, 255], b: [0, 0, 255], magenta: [255, 0, 255], m: [255, 0, 255], black: [0, 0, 0], k: [0, 0, 0], white: [255, 255, 255], w: [255, 255, 255],
  maroon: [128, 0, 0], olive: [128, 128, 0], lime: [0, 255, 0], aqua: [0, 255, 255], teal: [0, 128, 128], navy: [0, 0, 128], fuchsia: [255, 0, 255],
  purple: [128, 0, 128], silver: [192, 192, 192], gray: [128, 128, 128], grey: [128, 128, 128], pink: [255, 192, 203], salmon: [250, 128, 114],
  orange: [255, 165, 0], gold: [255, 215, 0], tan: [210, 180, 140], brown: [165, 42, 42],
};

/** The display colour of a branch and its descendants; each value is an integer from 0 to 255. */
export class BranchColor {
  /** The colour names (`color_names`). */
  static readonly colorNames: Readonly<Record<string, readonly [number, number, number]>> = COLOR_NAMES;

  /**
   * @param red - Red, 0 to 255.
   * @param green - Green, 0 to 255.
   * @param blue - Blue, 0 to 255.
   * @throws AssertionError ("Color values must be integers between 0 and 255.") otherwise.
   */
  constructor(readonly red: number, readonly green: number, readonly blue: number) {
    for (const c of [red, green, blue]) {
      if (!(typeof c === "number" && Number.isInteger(c) && c >= 0 && c <= 255)) throw new AssertionError("Color values must be integers between 0 and 255.");
    }
  }

  /** The colour of an HTML-style `#RRGGBB` string. @throws AssertionError for anything else. */
  static fromHex(hexstr: string): BranchColor {
    if (!(typeof hexstr === "string" && hexstr.startsWith("#") && hexstr.length === 7)) throw new AssertionError("need a 24-bit hexadecimal string, e.g. #000000");
    const [r, g, b] = [hexstr.slice(1, 3), hexstr.slice(3, 5), hexstr.slice(5)].map((cc) => parseHex(cc));
    return new BranchColor(r!, g!, b!);
  }

  /** The colour with a known name. @throws KeyError for an unknown name. */
  static fromName(colorname: string): BranchColor {
    const rgb = COLOR_NAMES[colorname];
    if (rgb === undefined) throw new KeyError(colorname);
    return new BranchColor(...rgb);
  }

  /** `#rrggbb` in lower case. */
  toHex(): string { return "#" + [this.red, this.green, this.blue].map((c) => c.toString(16).padStart(2, "0")).join(""); }

  /** `[red, green, blue]`. */
  toRgb(): [number, number, number] { return [this.red, this.green, this.blue]; }

  /** Python's `repr`: `BranchColor(red=1, green=2, blue=3)`. */
  repr(): string { return `BranchColor(red=${this.red}, green=${this.green}, blue=${this.blue})`; }

  /** Python's `str`: `(1, 2, 3)`. */
  toString(): string { return `(${this.red}, ${this.green}, ${this.blue})`; }
}

/** `int("0x" + cc, base=16)`. @throws ValueError for text that is not hexadecimal. */
function parseHex(cc: string): number {
  if (!/^[0-9a-fA-F]+(?:_[0-9a-fA-F]+)*$/.test(cc)) throw new ValueError(`invalid literal for int() with base 16: '0x${cc}'`);
  return parseInt(cc.replaceAll("_", ""), 16);
}
