/**
 * The Bionet mark and logo, drawn in whatever the current theme's colours are.
 *
 * They are drawn from the geometry in `@biolibs/bionet-theme` with colours taken from its CSS
 * variables, so they follow a light or dark theme with no image to swap. The variables have to be
 * on the page: import `@biolibs/bionet-theme/theme.css`, or render `ThemeStyle` once.
 */
import { LOGO, MARK, cssVariable, themeCss } from "@biolibs/bionet-theme";

const yours = `var(${cssVariable("yours")})`;
const theirs = `var(${cssVariable("theirs")})`;
const ink = `var(${cssVariable("ink")})`;

const strokes = (
  <g fill="none" strokeLinecap="round" strokeWidth={MARK.strokeWidth}>
    <path d={MARK.yours} stroke={yours} />
    <path d={MARK.theirs} stroke={theirs} />
  </g>
);

/**
 * The mark alone: a lower-case b whose bowl is a plasmid.
 *
 * @param props - `size` is its height in pixels; `title` is what it is called, for anybody who cannot see it.
 */
export function Mark({ size = 28, title = "Bionet" }: { size?: number; title?: string }) {
  return (
    <svg viewBox={`0 0 ${MARK.width} ${MARK.height}`} height={size} width={(size * MARK.width) / MARK.height} role="img" aria-label={title}>
      <g transform={`translate(${MARK.offsetX} 0)`}>{strokes}</g>
    </svg>
  );
}

/**
 * The logo: the mark standing for the b of the word.
 *
 * @param props - `height` is its height in pixels.
 */
export function Logo({ height = 44 }: { height?: number }) {
  return (
    <svg viewBox={`0 0 ${LOGO.width} ${LOGO.height}`} height={height} width={(height * LOGO.width) / LOGO.height} role="img" aria-label="Bionet">
      <g transform={`translate(${LOGO.offsetX} 0)`}>
        {strokes}
        <path d={LOGO.letters} fill={ink} />
      </g>
    </svg>
  );
}

/**
 * The theme's CSS variables, as a style element. Render it once, near the top, in an app that does
 * not import `@biolibs/bionet-theme/theme.css`.
 */
export function ThemeStyle() {
  return <style>{themeCss()}</style>;
}
