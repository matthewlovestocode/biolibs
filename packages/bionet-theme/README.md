# @biolibs/bionet-theme

What Bionet looks like, in one place: each colour's meaning with a value for a light theme and a dark
one, and the Bionet mark and logo. No dependencies, and nothing to do with React.

Anything that draws Bionet takes its colours and its mark from here, so that changing what "yours"
looks like is one edit and not one per app.

## Install

```bash
npm install @biolibs/bionet-theme
```

## Colours mean something

There are no decorative colours. Each is named for what it says, and cyan against violet is the
central pair: what is yours, and what is another lab's.

| Meaning | For | Dark | Light |
|---|---|---|---|
| `yours` | This lab, and the primary colour | `#22d3ee` | `#0891b2` |
| `theirs` | Other labs | `#a78bfa` | `#7c3aed` |
| `held` | Something is there | `#fbbf24` | `#b45309` |
| `found` | A match | `#f472b6` | `#db2777` |
| `good` | In step | `#34d399` | `#059669` |
| `attention` | Needs a person to look | `#f87171` | `#dc2626` |
| `ground`, `surface`, `field` | What things sit on | | |
| `ink`, `dim`, `rule` | Text and lines | | |
| `action`, `onAction` | A button, and the words on it | | |

The dark values are too faint on a pale ground, which is why each meaning has two.

## As CSS

```css
@import "@biolibs/bionet-theme/theme.css";

.mine { color: var(--bionet-yours); }
```

The variables follow the system's light or dark setting. To pin one, put `data-bionet-theme="dark"`
or `"light"` on an element: it and everything inside it take that theme.

## As data

For anything that is not CSS, such as a 3D scene:

```ts
import { colour, themeCss } from "@biolibs/bionet-theme";

colour("yours", "dark");    // "#22d3ee"
colour("yours", "light");   // "#0891b2"
themeCss();                 // the same text as theme.css
```

## The mark

A lower-case **b** whose bowl is a plasmid: a ring in three arcs, two in the colour for yours and
one in the colour for theirs. Most of the ring is yours; one piece came from another lab.

```ts
import { MARK, LOGO, markSvg } from "@biolibs/bionet-theme";

markSvg("light");   // the mark as an SVG document, on transparency
MARK.yours;         // its path data, to draw however you like
LOGO.letters;       // the letters "ionet" as one shape, so no font is needed
```

| File in `brand/` | Use it |
|---|---|
| `bionet-mark-on-dark.svg`, `bionet-mark-on-light.svg` | The mark alone, on transparency |
| `bionet-logo-on-dark.svg`, `bionet-logo-on-light.svg` | The mark as the b of the word, on transparency |
| `bionet-logo-glow.svg` | Glowing, on its near-black ground. A glow needs something dark to glow against |
| `bionet-icon.svg` | The glowing mark on a rounded near-black tile, for icons |

They are drawn by `scripts/make-logo.cjs` from the measurements of Geist ExtraLight, so the ring is
the height and weight of the letters beside it.

## Rules

- Do not recolour the arcs. Cyan is yours and violet is theirs.
- Use the version for the surface: `on-dark` on dark, `on-light` on light.
- There is no glowing version for a light surface.
- Below about 16 pixels the arcs begin to merge. Do not go smaller.

## Testing

`test/theme.test.ts` checks that the stylesheet, the data and the files on disk all agree, and that
every colour is readable on its ground in both themes.

## License

MIT
