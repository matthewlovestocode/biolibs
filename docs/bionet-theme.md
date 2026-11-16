# @biolibs/bionet-theme

What Bionet looks like, kept in one place: each colour's meaning with a value for a light theme and a dark one, and the Bionet mark and logo. It has no dependencies and knows nothing of React, so a desktop window, a web page and a 3D scene can all read it.

```ts
import { colour, cssVariable, markSvg, themeCss } from "@biolibs/bionet-theme";

colour("yours", "dark");     // "#22d3ee"
colour("yours", "light");    // "#0891b2"
cssVariable("onAction");     // "--bionet-on-action"
themeCss();                  // every colour as a CSS variable, following the system's theme
markSvg("light");            // the mark as an SVG document, on transparency
```

## Why there is a package here at all

Before it existed, the brand's colours were written into a desktop app's stylesheet, the mark into one of its components, and two web pages each had a palette of their own. Changing what "yours" looks like meant four edits and finding all four. A look that several applications share has to live outside every one of them.

## A colour means something

There are no decorative colours. Each is named for what it says, never for what it is: `yours` and `theirs`, `held`, `found`, `good`, `attention`, and the neutral ones a page is built from. Cyan against violet is the central pair, what is this lab's and what is another's, and it is the reason the mark has an arc in each.

Every meaning has two values because the same colour does not work on both grounds: the cyan that reads on near-black is too faint on a pale page. The tests hold this to account. They compute contrast for every meaning against its ground in both themes, so a palette change that makes text unreadable fails before anybody sees it.

## One table, three forms

`COLOURS` is the only place a colour is written down. `themeCss()` is generated from it, `theme.css` is that same text written to a file, and the logo files in `brand/` are drawn with those values. A test checks that all of them still agree, because a theme fails quietly: a colour edited in one form and not another looks fine until two applications sit side by side.

The stylesheet follows the system's light or dark setting. Either can be pinned with `data-bionet-theme` on an element, which applies to everything inside it.

## The mark is geometry

`MARK` and `LOGO` are path data, not images: a lower-case b whose bowl is a plasmid in three arcs, and the letters that follow it written out as one shape. Anything can draw them in the current theme's colours, and nothing needs a font. They are measured from Geist ExtraLight by `scripts/make-logo.cjs`, so the ring is exactly the height and weight of the letters beside it.

The glowing versions keep a dark ground on purpose. A glow has nothing to show against on transparency or on white.

## Source layout

```
packages/bionet-theme/
  src/index.ts          the colours, the stylesheet, the mark and logo as geometry
  theme.css             themeCss(), as a file
  brand/                the mark, logo and icon as SVG
  scripts/              the scripts that write theme.css and draw the brand files
```
