# @biolibs/bionet-scene

A lab in three dimensions, drawn from `@biolibs/bionet-space` in the colours of `@biolibs/bionet-theme`. See [the package README](../packages/bionet-scene/README.md) for the API with worked examples.

```tsx
import { exampleLab } from "@biolibs/bionet-space";
import { LabExplorer } from "@biolibs/bionet-scene";

<LabExplorer layout={exampleLab()} labName="The Wren Lab" />
```

## Deciding and drawing are kept apart

`view.ts` answers every question worth asking: which places are drawn from this distance, in which colour, how strongly, which can be pressed, which tubes stand in the box, where the camera is. Its answer is a list of plain objects. `scene.tsx` draws that list and decides nothing.

The reason is testing. A three.js scene cannot be checked without a graphics card, and a rule that lives inside one is checked by looking. The rules here are the part that can be wrong in ways that matter — a box marked empty that is not, a search that lights the wrong shelf — so they are in the half that runs under the tests.

## Four distances

The same lab is drawn from four distances, and pressing something moves to the next.

- **The lab.** Rooms, what stands in them, and each box as a small slab coloured by whether anything is in it. No tubes: there are thousands and none is worth drawing from here.
- **A freezer or a bench.** Its shelves and racks appear; everything else fades.
- **A box.** Drawn as if taken out. What it stood in is left as a faint outline to say where it came from and nothing else is drawn, because a box in a rack in a freezer cannot be seen where it stands. Its tubes and empty positions are drawn.
- **A tube.** The same box, with one tube picked and its name, amount and position shown.

## Colour is meaning

Nothing here names a colour. A place or a tube carries a meaning — `yours`, `theirs`, `held`, `found`, `attention`, `dim` — and the theme says what that looks like. In the dark theme edges are drawn brighter than white and a bloom pass makes them glow; tubes are a quiet body with a bright rim, since a box of solid glowing cylinders reads as one slab. In the light theme the same edges are drawn plainly, with strength as opacity: a glow needs something dark to glow against.

## What is written is kept legible

Names are written over the scene at the places they belong to, and from most angles some would sit on each other. `legible` decides which to show: the ones that matter most are kept first, and one that would overlap something already kept is left out until the camera moves. A picked tube matters most, then anything flagged or found, then what stands in a room, then instruments, then the room itself, which is named at a back corner. A box being looked into is not named over its own tubes; the way back names it.

## A long lens for a box

Seen from close above with a wide lens, the tubes at the edges of a box lean outwards and hide their neighbours. So a box is looked at through a narrow lens from further off, and the lens changes along with the distance on the way in.

## A press goes to the smallest thing

A freezer stands inside a room, so a ray from the pointer passes through the room's wall first. The press is given to the smallest thing under the pointer, not the nearest, and a movement of more than a few pixels is a drag of the camera and not a press.

## Arranging

The builder follows the same split. `arranging.ts` decides, as plain data, which places may be moved, what the room looks like with a move not yet made, what has gone wrong, and what the lab must be told. `builder.tsx` turns a drag into calls to it.

Three choices are worth knowing.

- **A move is tried, then said, then redrawn from the lab.** The builder keeps only the standing being tried. On letting go it hands the standing to `onStand` and forgets it; what is drawn next is whatever the lab says. If the lab refuses, the place goes back.
- **Standing one place pins the ones beside it.** A place nobody has stood is put where there is room, and that changes when its neighbour is stood by hand. So the first move in a room also says where the others already are. Arranging one thing must not make the rest shuffle.
- **One place is arranged at a time.** What is dragged is whatever is directly in the place being arranged: a room's freezers and benches, a freezer's shelves, a shelf's racks, a bench's instruments. Everything inside a dragged thing goes with it. "Arrange inside" goes down a level and the crumbs come back up.
- **Shelves move up and down, everything else across.** A shelf is dragged over a wall facing the camera; anything else over the floor it stands on. Height is also a number on every place, for the cases a drag cannot reach.
- **A press goes to what is being arranged.** Inside a freezer the smallest thing under the pointer is a box, but the thing being arranged is the shelf it is on, so the press is given to that.

Places are added from the same view. The form offers what is usually kept in the kind of place being arranged (`kindsFor`) and names the new place by its kind and the next free number (`nameFor`); both are suggestions, since a lab may keep anything in anything. A new place stands where there is room, and `arrange` now looks for a clear spot among things already stood by hand, so a new freezer appears beside the bench and not in it. Retiring asks first, because there is no un-retiring.

A drag follows the floor the place stands on, not the camera's depth, and turns the camera's own dragging off while it lasts.

## Other labs

`neighbours` draws other labs as outlines in `theirs`, each joined to this one by a line something travels along. It is a picture of the fact that labs reach each other, and carries no data of its own.

## A real lab

`LabView` takes a lab's record as plain data and draws it, so the same component sits in a desktop window and on a web page. It has an empty state because a lab has no places until somebody adds one.

## What is fixed

How the scene looks is not configurable. Sizes are the lab's data; colours are the theme's. The design record says why: every option is something a person must be given a way to set.

## Source layout

```
packages/bionet-scene/src/
  view.ts        what to draw at each distance, as plain data
  scene.tsx      that list, drawn with three.js
  arranging.ts   a room being arranged by hand, as plain data
  builder.tsx    dragging, turning and resizing what stands in a room
  explorer.tsx   the scene with the way back, a search, and what was picked
packages/bionet-scene/scene.css   the frame and what is written over the scene
```
