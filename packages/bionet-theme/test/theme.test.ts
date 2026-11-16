/**
 * The colours, the stylesheet and the mark all come from one table, and these check that they still do.
 *
 * A theme package fails quietly: a colour edited in one place and not another looks fine until two
 * apps sit side by side. So what is tested here is agreement — the CSS file is the text `themeCss()`
 * returns, every meaning has a value in both themes, and the logo files on disk are drawn with the
 * geometry and the colours the package exports.
 */
import { readFileSync } from "node:fs";
import { COLOURS, LOGO, MARK, MEANINGS, THEME_ATTRIBUTE, colour, cssVariable, markSvg, themeCss } from "@biolibs/bionet-theme";
import { describe, expect, it } from "vitest";

const file = (name: string): string => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

/** How bright a colour is, as the contrast formula counts it. */
function luminance(hex: string): number {
  const channel = (at: number): number => {
    const value = parseInt(hex.slice(at, at + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
const contrast = (a: string, b: string): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
};

describe("the colours", () => {
  it("gives every meaning a value in both themes, as six hex digits", () => {
    expect(Object.keys(COLOURS.light)).toEqual(Object.keys(COLOURS.dark));
    for (const theme of ["dark", "light"] as const) {
      for (const meaning of MEANINGS) expect(colour(meaning, theme)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("keeps text readable and meanings visible on the ground, in both themes", () => {
    for (const theme of ["dark", "light"] as const) {
      const on = COLOURS[theme];
      expect(contrast(on.ink, on.ground)).toBeGreaterThan(7);
      expect(contrast(on.dim, on.ground)).toBeGreaterThan(4.5);
      expect(contrast(on.onAction, on.action)).toBeGreaterThan(4.5);
      for (const meaning of ["yours", "theirs", "held", "found", "good", "attention"] as const) {
        expect(contrast(on[meaning], on.ground), `${meaning} on ${theme}`).toBeGreaterThan(3);
      }
    }
  });

  it("keeps yours and theirs apart in both themes", () => {
    expect(COLOURS.dark.yours).not.toBe(COLOURS.dark.theirs);
    expect(COLOURS.light.yours).not.toBe(COLOURS.light.theirs);
  });
});

describe("the stylesheet", () => {
  it("names a variable for each meaning", () => {
    expect(cssVariable("yours")).toBe("--bionet-yours");
    expect(cssVariable("onAction")).toBe("--bionet-on-action");
  });

  it("is the same text as the file that ships", () => {
    expect(file("theme.css")).toBe(themeCss());
  });

  it("follows the system and lets either theme be pinned", () => {
    const css = themeCss();
    expect(css).toContain(`:root, [${THEME_ATTRIBUTE}="light"] { color-scheme: light;`);
    expect(css).toContain("@media (prefers-color-scheme: dark)");
    expect(css).toContain(`[${THEME_ATTRIBUTE}="dark"] { color-scheme: dark;`);
    for (const meaning of MEANINGS) {
      expect(css.split(`${cssVariable(meaning)}: ${COLOURS.light[meaning]};`)).toHaveLength(2);
      expect(css.split(`${cssVariable(meaning)}: ${COLOURS.dark[meaning]};`)).toHaveLength(3);
    }
  });
});

describe("the mark", () => {
  it("draws itself in a theme's colours, on transparency", () => {
    const svg = markSvg("light");
    expect(svg).toContain(`viewBox="0 0 ${MARK.width} ${MARK.height}"`);
    expect(svg).toContain(`d="${MARK.yours}" stroke="${COLOURS.light.yours}"`);
    expect(svg).toContain(`d="${MARK.theirs}" stroke="${COLOURS.light.theirs}"`);
    expect(svg).not.toContain("<rect");
  });

  it("is the geometry the files on disk were drawn with, in the colours of their theme", () => {
    for (const theme of ["dark", "light"] as const) {
      for (const name of [`bionet-mark-on-${theme}.svg`, `bionet-logo-on-${theme}.svg`]) {
        const svg = file(`brand/${name}`);
        expect(svg, name).toContain(`d="${MARK.yours}" stroke="${COLOURS[theme].yours}"`);
        expect(svg, name).toContain(`d="${MARK.theirs}" stroke="${COLOURS[theme].theirs}"`);
        expect(svg, name).not.toContain("<rect");
      }
      expect(file(`brand/bionet-logo-on-${theme}.svg`)).toContain(`<path d="${LOGO.letters}" fill="${COLOURS[theme].ink}"/>`);
      expect(file(`brand/bionet-logo-on-${theme}.svg`)).toContain(`viewBox="0 0 ${LOGO.width} ${LOGO.height}"`);
    }
  });

  it("keeps a ground under the versions that glow", () => {
    for (const name of ["bionet-logo-glow.svg", "bionet-icon.svg"]) {
      expect(file(`brand/${name}`), name).toContain(`fill="${COLOURS.dark.ground}"`);
      expect(file(`brand/${name}`), name).toContain("feGaussianBlur");
    }
  });
});
