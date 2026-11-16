// Draws the Bionet logo from Geist's own measurements, so the ring is exactly the height of the letters
// beside it and its stroke is exactly their weight. Writes plain SVG with every letter as a shape.
const opentype = require("opentype.js");
const fs = require("fs");
const OUT = process.argv[2];
const font = opentype.parse(fs.readFileSync("node_modules/@fontsource/geist-sans/files/geist-sans-latin-200-normal.woff").buffer);

// One meaning per colour, with a value for each theme. On a light surface the dark-theme cyan and the
// near-white letters are too faint to read, so the light values are deeper.
const THEMES = {
  dark: { yours: "#22d3ee", theirs: "#a78bfa", ink: "#e8fbff" },
  light: { yours: "#0891b2", theirs: "#7c3aed", ink: "#0b1020" },
};
const GROUND = "#05070d";
let CYAN = THEMES.dark.yours, VIOLET = THEMES.dark.theirs, INK = THEMES.dark.ink;
const box = (ch) => font.charToGlyph(ch).getBoundingBox();
const W = box("i").x2 - box("i").x1;                 // the weight of a stem
const ASC = box("b").y2;                             // how tall a b stands
const O = box("o");                                  // an o, with its overshoot above and below
const R = (O.y2 - O.y1 - W) / 2;                     // the ring's radius, to the middle of its stroke
const stemX = box("b").x1 + W / 2;
const cx = stemX + R, cyUp = (O.y2 + O.y1) / 2;      // the ring's centre, in font units (y up)
const rsb = font.charToGlyph("b").advanceWidth - box("b").x2;

const r2 = (n) => Math.round(n * 100) / 100;
// A point on the ring, by degrees clockwise from the top, in SVG coordinates with the baseline at y = base.
const at = (deg, base) => [r2(cx + R * Math.sin(deg * Math.PI / 180)), r2(base - cyUp - R * Math.cos(deg * Math.PI / 180))];
const arc = (from, to, base) => {
  const [x1, y1] = at(from, base), [x2, y2] = at(to, base);
  const span = ((to - from) % 360 + 360) % 360;
  return `M${x1} ${y1}A${r2(R)} ${r2(R)} 0 ${span > 180 ? 1 : 0} 1 ${x2} ${y2}`;
};
// Three arcs with gaps wide enough to stay open under round ends: two that are yours, one that is theirs.
// The long arc runs up the stem and over the top, so no arc ends beside the stem and reads as a stray tick.
const GAP = ((W * 1.7) / R) * (180 / Math.PI) / 2;
const A = 28, B = 98, C = 172;                        // where the gaps are, in degrees clockwise from the top
const mine = (base) => `M${r2(stemX)} ${r2(base - ASC + W / 2)}L${r2(stemX)} ${r2(base - W / 2)}${arc(C + GAP, A - GAP + 360, base)}${arc(A + GAP, B - GAP, base)}`;
const theirs = (base) => arc(B + GAP, C - GAP, base);
const markRight = cx + R + W / 2;

const strokes = (base, width = W, extra = "") =>
  `<path d="${mine(base)}" stroke="${CYAN}" stroke-width="${r2(width)}"${extra}/><path d="${theirs(base)}" stroke="${VIOLET}" stroke-width="${r2(width)}"${extra}/>`;
// The glow is the same strokes, blurred, underneath the sharp ones.
const blur = `<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${r2(W * 0.85)}"/></filter>`;
const glow = (base) => `<g filter="url(#glow)" opacity="0.85">${strokes(base, W * 1.5)}</g>`;
const head = (w, h, title) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(w)} ${r2(h)}" role="img"><title>${title}</title>`;

// The mark alone and the mark as the b of the word, on transparency, once for each theme.
const pad = W * 1.5, base = pad + ASC;
const shift = pad - (stemX - W / 2);
const word = font.getPath("ionet", markRight + rsb, base, font.unitsPerEm, { kerning: true });
const wordBox = word.getBoundingBox();
for (const [theme, colours] of Object.entries(THEMES)) {
  CYAN = colours.yours; VIOLET = colours.theirs; INK = colours.ink;
  fs.writeFileSync(`${OUT}/bionet-mark-on-${theme}.svg`,
    `${head(markRight + shift + pad, ASC + pad * 2 + 12, "Bionet")}<g transform="translate(${r2(shift)} 0)" fill="none" stroke-linecap="round">${strokes(base)}</g></svg>\n`);
  fs.writeFileSync(`${OUT}/bionet-logo-on-${theme}.svg`,
    `${head(wordBox.x2 + shift + pad, ASC + pad * 2 + 12, "bionet")}<g transform="translate(${r2(shift)} 0)"><g fill="none" stroke-linecap="round">${strokes(base)}</g><path d="${word.toPathData(2)}" fill="${INK}"/></g></svg>\n`);
}

// The glowing versions need their ground: a glow on transparency has nothing to glow against.
CYAN = THEMES.dark.yours; VIOLET = THEMES.dark.theirs; INK = THEMES.dark.ink;
fs.writeFileSync(`${OUT}/bionet-logo-glow.svg`,
  `${head(wordBox.x2 + shift + pad * 3, ASC + pad * 4 + 12, "bionet")}${blur}<rect width="100%" height="100%" fill="${GROUND}"/><g transform="translate(${r2(shift + pad)} ${r2(pad)})"><g fill="none" stroke-linecap="round">${glow(base)}${strokes(base)}</g><path d="${word.toPathData(2)}" fill="${INK}"/></g></svg>\n`);

// The icon: the mark, glowing, on its ground.
const size = 1024, markW = markRight - (stemX - W / 2), scale = (size * 0.56) / ASC;
const tx = size / 2 - (stemX - W / 2 + markW / 2) * scale, ty = size / 2 - (ASC / 2) * scale;
fs.writeFileSync(`${OUT}/bionet-icon.svg`,
  `${head(size, size, "Bionet")}${blur}<rect width="${size}" height="${size}" rx="${size * 0.225}" fill="${GROUND}"/><g transform="translate(${r2(tx)} ${r2(ty)}) scale(${r2(scale)})" fill="none" stroke-linecap="round">${glow(ASC)}${strokes(ASC)}</g></svg>\n`);

console.log(`stem ${W}, ring radius ${r2(R)}, gap ${r2(GAP * 2)} degrees, ratio ${r2(W / R)}`);
