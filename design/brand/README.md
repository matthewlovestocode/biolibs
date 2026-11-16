# The Bionet mark

A lower-case **b** whose bowl is a plasmid: a ring drawn as three arcs, two in cyan and one in violet,
with a cyan stem. Most of the ring is yours; one piece came from another lab. That is the product in
one shape, a construct you can only finish with somebody else's part, and it is also the first letter
of the name.

Nothing here is taken from the identity of the first Bionet.

| File | What it is | Use it |
|---|---|---|
| `bionet-mark-on-dark.svg` | The mark alone, on transparency | On a dark surface |
| `bionet-mark-on-light.svg` | The mark alone, on transparency | On a light surface |
| `bionet-logo-on-dark.svg` | The mark as the b of the word, on transparency | On a dark surface |
| `bionet-logo-on-light.svg` | The same, with deeper colours and dark letters | On a light surface |
| `bionet-logo-glow.svg` | The logo glowing, on its near-black ground | Where a glow is wanted; a glow needs something dark to glow against |
| `bionet-icon.svg` | The mark, glowing, on a rounded near-black tile | App and site icons |

Every file but the last two has no background, so it sits on whatever is behind it.

## How it is drawn

`make-logo.cjs` draws it from the measurements of Geist ExtraLight, so the ring is exactly the height
of the letters beside it and its stroke is exactly their weight. The letters of the word are written
out as shapes, so the files need no font to display.

```
npm install opentype.js @fontsource/geist-sans    # anywhere outside this repository
node make-logo.cjs <folder to write into>
```

## Colours

One meaning per colour, with a value for each theme. The dark-theme cyan and near-white letters are
too faint on a light surface, so the light values are deeper.

| Meaning | On dark | On light |
|---|---|---|
| Yours | `#22d3ee` | `#0891b2` |
| Theirs | `#a78bfa` | `#7c3aed` |
| Letters | `#e8fbff` | `#0b1020` |

## Rules

- **Colour means something.** Cyan is yours, violet is theirs. Do not recolour the arcs.
- **Use the version for the surface.** `on-dark` on dark, `on-light` on light.
- **The glow belongs to dark.** There is no glowing version for a light surface.
- **Leave it room.** Keep clear space of at least the stem's width, three times over, on every side.
- **The gaps stay open.** Below about 16 pixels the arcs begin to merge; do not go smaller.
