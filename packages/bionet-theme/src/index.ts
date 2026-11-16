/**
 * @packageDocumentation
 * `@biolibs/bionet-theme`: what Bionet looks like, in one place.
 *
 * Anything that draws Bionet — a desktop window, a lab's web page, a 3D scene — takes its colours and
 * its mark from here, so that changing what "yours" looks like is one edit and not one per app.
 *
 * The rule the colours follow is that **a colour means something**. There are no decorative colours:
 * each is named for what it says, and has a value for a dark theme and a value for a light one,
 * because the cyan that reads on black is too faint on a pale ground. Cyan against violet is the
 * central pair: what is yours, and what is another lab's.
 *
 * It is offered three ways, all from the same table, so they cannot disagree:
 *
 * - `COLOURS` and `colour()` — the values as data, for anything that is not CSS (a 3D scene, a canvas)
 * - `themeCss()` and `theme.css` — the values as CSS variables, following the system's theme
 * - `MARK` and the files in `brand/` — the Bionet mark, as geometry and as SVG
 *
 * It has no dependencies and knows nothing of React.
 */

/** The two themes. */
export type Theme = "dark" | "light";

/**
 * What each colour means. Nothing is coloured for decoration.
 *
 * - `yours` — this lab, and the brand's primary colour
 * - `theirs` — other labs
 * - `held` — something is there
 * - `found` — a match
 * - `good` — in step, as it should be
 * - `attention` — needs a person to look
 * - `ground` — what everything sits on
 * - `surface` — a card or panel raised from the ground
 * - `field` — the inside of something typed into
 * - `ink` — text
 * - `dim` — text that matters less
 * - `rule` — lines between things
 * - `action` — a button's fill, with `onAction` for the words on it
 */
export type Meaning = "yours" | "theirs" | "held" | "found" | "good" | "attention" | "ground" | "surface"
                    | "field" | "ink" | "dim" | "rule" | "action" | "onAction";

/** Every colour, by theme and by meaning. This table is the only place a colour is written down. */
export const COLOURS: Readonly<Record<Theme, Readonly<Record<Meaning, string>>>> = {
  dark: {
    yours: "#22d3ee", theirs: "#a78bfa", held: "#fbbf24", found: "#f472b6", good: "#34d399", attention: "#f87171",
    ground: "#05070d", surface: "#0b1020", field: "#070b16", ink: "#e8fbff", dim: "#8aa0b8", rule: "#1e293b",
    action: "#22d3ee", onAction: "#05070d",
  },
  light: {
    yours: "#0891b2", theirs: "#7c3aed", held: "#b45309", found: "#db2777", good: "#059669", attention: "#dc2626",
    ground: "#f6f7f9", surface: "#ffffff", field: "#ffffff", ink: "#0b1020", dim: "#5b6472", rule: "#dde1e7",
    action: "#0e7490", onAction: "#ffffff",
  },
};

/** Every meaning, in the order they are written out. */
export const MEANINGS = Object.keys(COLOURS.dark) as Meaning[];

/**
 * One colour.
 *
 * @param meaning - What it is for.
 * @param theme - Which theme.
 * @returns The colour, as `#rrggbb`.
 *
 * @example
 * ```ts
 * import { colour } from "@biolibs/bionet-theme";
 *
 * colour("yours", "dark");    // "#22d3ee"
 * colour("yours", "light");   // "#0891b2"
 * ```
 */
export function colour(meaning: Meaning, theme: Theme): string {
  return COLOURS[theme][meaning];
}

/** The name of the CSS variable that carries a meaning's colour. */
export function cssVariable(meaning: Meaning): string {
  return `--bionet-${meaning.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

/** The attribute that pins a theme on an element and everything inside it. */
export const THEME_ATTRIBUTE = "data-bionet-theme";

const block = (theme: Theme): string => MEANINGS.map((meaning) => `${cssVariable(meaning)}: ${COLOURS[theme][meaning]};`).join(" ");

/**
 * The colours as CSS variables.
 *
 * The light values are the default and the dark ones apply when the system asks for dark. Either can
 * be pinned, whatever the system says, by putting `data-bionet-theme="dark"` or `"light"` on an
 * element: it and everything inside it take that theme.
 *
 * `theme.css` in this package is exactly this text, for anything that would sooner import a file.
 *
 * @returns The stylesheet.
 */
export function themeCss(): string {
  return [
    `:root, [${THEME_ATTRIBUTE}="light"] { color-scheme: light; ${block("light")} }`,
    `@media (prefers-color-scheme: dark) { :root:not([${THEME_ATTRIBUTE}="light"]) { color-scheme: dark; ${block("dark")} } }`,
    `[${THEME_ATTRIBUTE}="dark"] { color-scheme: dark; ${block("dark")} }`,
    "",
  ].join("\n");
}

/**
 * The Bionet mark as geometry: a lower-case b whose bowl is a plasmid.
 *
 * The ring is three arcs. The long one runs up the stem and over the top and, with the short one,
 * is drawn in the colour for `yours`; the third is drawn in the colour for `theirs`. Most of the
 * ring is yours and one piece came from another lab.
 *
 * It is given as path data so that anything can draw it — an SVG element, a canvas, a line in a 3D
 * scene — in whatever the theme's colours are. Draw both paths with no fill, round ends, and a stroke
 * of `strokeWidth`, inside a box `width` by `height`, moved across by `offsetX`.
 */
export const MARK = {
  /** The box the mark is drawn in. */
  width: 713,
  height: 881,
  /** How far to move both paths across before drawing them. */
  offsetX: -3.5,
  /** How thick the strokes are, in the same units. */
  strokeWidth: 53,
  /** The stem and the two arcs that are yours. */
  yours: "M109.5 106L109.5 763M349.93 774.8A250.5 250.5 0 1 1 436.14 285.85M515.27 327.92A250.5 250.5 0 0 1 610.3 514.43",
  /** The arc that is theirs. */
  theirs: "M597.83 603.17A250.5 250.5 0 0 1 438.67 762.33",
} as const;

/**
 * The logo as geometry: the mark standing for the b of the word, and the letters after it.
 *
 * The letters are Geist ExtraLight written out as one shape, so nothing that draws the logo needs
 * the font. Draw `MARK`'s two paths as strokes and `letters` as a fill in the colour for `ink`, all
 * moved across by `offsetX`, inside a box `width` by `height`.
 */
export const LOGO = {
  /** The box the logo is drawn in. */
  width: 2939,
  height: 881,
  /** How far to move everything across before drawing it. */
  offsetX: -3.5,
  /** The letters i, o, n, e, t, as one filled shape. */
  letters: "M769 259.50L769 789.50L818 789.50L818 259.50M767 174.50L820 174.50L820 95.50L767 95.50M1181 801.50C1322 801.50 1412 694.50 1412 524.50C1412 354.50 1322 247.50 1181 247.50C1040 247.50 950 354.50 950 524.50C950 694.50 1040 801.50 1181 801.50M1001 524.50C1001 382.50 1069 294.50 1181 294.50C1293 294.50 1361 382.50 1361 524.50C1361 666.50 1293 754.50 1181 754.50C1069 754.50 1001 666.50 1001 524.50M1542 259.50L1542 789.50L1591 789.50L1591 472.50C1591 364.50 1651 292.50 1753 292.50C1852 292.50 1892 363.50 1892 472.50L1892 789.50L1940 789.50L1940 448.50C1940 336.50 1882 247.50 1765 247.50C1683 247.50 1612 283.50 1589 365.50L1587 259.50M2055 524.50C2055 680.50 2137 801.50 2286 801.50C2385 801.50 2469 740.50 2500 644.50L2448 640.50C2420 710.50 2358 754.50 2286 754.50C2179 754.50 2111 672.50 2107 538.50L2513 538.50L2513 520.50C2510 357.50 2425 247.50 2286 247.50C2137 247.50 2055 368.50 2055 524.50M2108 492.50C2117 369.50 2184 294.50 2286 294.50C2382 294.50 2450 363.50 2460 492.50M2681 139.50L2681 259.50L2593 259.50L2593 304.50L2681 304.50L2681 670.50C2681 745.50 2725 789.50 2799 789.50L2862 789.50L2862 746.50L2799 746.50C2754 746.50 2730 719.50 2730 670.50L2730 304.50L2863 304.50L2863 259.50L2730 259.50L2730 139.50",
} as const;

/**
 * The mark as an SVG document, in one theme's colours, on transparency.
 *
 * @param theme - Which theme's colours.
 * @returns The SVG, as text.
 */
export function markSvg(theme: Theme): string {
  const path = (d: string, stroke: string): string => `<path d="${d}" stroke="${stroke}" stroke-width="${MARK.strokeWidth}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MARK.width} ${MARK.height}" role="img"><title>Bionet</title>`
       + `<g transform="translate(${MARK.offsetX} 0)" fill="none" stroke-linecap="round">`
       + `${path(MARK.yours, COLOURS[theme].yours)}${path(MARK.theirs, COLOURS[theme].theirs)}</g></svg>\n`;
}
