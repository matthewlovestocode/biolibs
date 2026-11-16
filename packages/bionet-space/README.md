# @biolibs/bionet-space

Where things are in a lab. A tree of places — rooms, freezers, shelves, racks, boxes, benches, instruments — with where each one stands and how big it is, the positions inside a box, what is stored where, and where a camera should stand to look at any of it. Plain data and arithmetic: nothing here draws anything, and nothing depends on React or three.js.

```
npm install @biolibs/bionet-space
```

## A lab is a tree of places

```ts
import { arrange, type Layout } from "@biolibs/bionet-space";

const lab: Layout = {
  places: [
    { id: "room", kind: "room", name: "Main lab", parent: null, standing: { position: [0, 0, 0], size: [6, 3, 4] } },
    { id: "freezer", kind: "freezer", name: "−80", parent: "room" },
    { id: "box", kind: "box", name: "Box 1", parent: "freezer", grid: { rows: 9, columns: 9 } },
  ],
  stored: [{ item: "tube-1", place: "box", slot: { row: 0, column: 0 }, part: "p1", name: "pWren-402", amount: 20, unit: "µL" }],
};

const arranged = arrange(lab);
arranged.map((one) => one.place.id);      // [ "room", "freezer", "box" ]
arranged[2].path;                         // [ "room", "freezer", "box" ]
```

Sizes are in metres. A place that says where it stands is put there; one that does not is given a size for its kind and a spot inside its parent, so a lab that has only said "there is a freezer with these boxes" can still be drawn. That is what makes dimensions optional: they are lab data when a lab gives them and a sensible default when it has not.

## Where to look, and where a part is

```ts
import { arrange, exampleLab, levelOf, poseFor, search } from "@biolibs/bionet-space";

const lab = exampleLab();                 // a made-up lab: a freezer, a fridge, benches, 72 boxes
const arranged = arrange(lab);

poseFor(arranged, null).target;           // the middle of the whole lab
levelOf(arranged.find((one) => one.place.id === "minus80"));   // "unit"
search(lab, "t7 promoter").length > 0;    // true
```

`poseFor` gives a camera position and target for the whole lab or any one place, turned with the place so a freezer facing a side wall is still seen from its front. `search` matches by name, ignoring case.

## Positions in a box

`slotCenter`, `slotSize`, `slotName` (`A1`, `B7`) and `firstFreeSlot` work out a box's grid. `storedWithin` gives everything in a place however deep.

`slotFrom("C4")` reads a position the way it is written on a lid.

## From a lab's own record

```ts
import { layoutFrom } from "@biolibs/bionet-space";

const layout = layoutFrom({
  places: [{ place: "f", kind: "freezer", name: "−80", parent: null, grid: null, standing: null, retired: false }],
  items: [], parts: [],
});
layout.places.map((one) => [one.id, one.parent]);   // [ [ "~room", null ], [ "f", "~room" ] ]
```

`layoutFrom` takes a lab as `@biolibs/bionet` records it — millimetres, retired places, items that
may be nowhere — and gives a layout of what can be found. It asks for the lab by shape, so this
package still depends on nothing. Places standing in no room are put in one made up for the purpose.

## Arranging by hand

```ts
import { arrange, exampleLab, overlapping, standingAt, standingOf, sticking } from "@biolibs/bionet-space";

const arranged = arrange(exampleLab());
standingOf(arranged, "minus80")?.size;          // [ 0.9, 2, 0.85 ]
standingAt(arranged, "minus80", [3.1, 2.2]);    // the standing it would have with its base centred there
overlapping(arranged);                          // []  — pairs of places standing in each other
sticking(arranged);                             // []  — places stood partly outside what they are in
```

`standingOf` is the inverse of `arrange`: where a place stands as the lab would say it, measured from
the place it is in, including for a place nobody has stood anywhere. `standingAt` is what a drag
becomes: settled every 5 cm and kept inside the parent. `quarterTurned` turns one. None of them
moves anything; they work out what would be said.
