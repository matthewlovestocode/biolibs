# @biolibs/bionet-space

Where things are in a lab, as plain data: a tree of places, where each one stands and how big it is, the positions inside a box, and where a camera should look. Nothing is drawn here and nothing depends on React or three.js. See [the package README](../packages/bionet-space/README.md) for the API with worked examples.

```ts
import { arrange, exampleLab, poseFor, search } from "@biolibs/bionet-space";

const lab = exampleLab();
const arranged = arrange(lab);            // every place with a centre, a size and the path to it
poseFor(arranged, "minus80");             // where to stand to look at the freezer
search(lab, "t7 promoter");               // every stored item of that name
```

## Why there is a package here at all

A drawing of a lab and a list of a lab need the same facts: what is inside what, which position of which box a tube is in, how to describe where something is. If the scene owned those, the freezer panel would have to work them out again, and they would disagree. So the facts are here, and both read them.

## One kind of thing

There is no freezer type, shelf type and rack type. There is a `Place`, with a kind, a name and a parent. A lab with racks inside shelves and a lab with boxes straight on a fridge shelf are the same tree at different depths, which is what real labs are like. Only two things about a place are special: a `grid` makes it a box with positions, and a `standing` says where it is and how big.

## Dimensions are lab data, and optional

Sizes are in metres. A place with a `standing` is put where it says. A place without one is given a default size for its kind and a spot inside its parent: boxes in rows, shelves stacked, instruments along a bench. So a lab can be drawn the moment it has said what it holds, and made to match the real room later by adding numbers, with no second format to move to.

A place added among ones already stood by hand is moved to the first clear spot on the same floor, looking along the back wall first. If nowhere is clear it is left where the usual arrangement put it, to be flagged: a full room is for a person to sort out.

## The camera is arithmetic too

`poseFor` returns a position and a target, by level: the whole lab from above a corner, a freezer from its front, a box from overhead. Keeping it here means it can be tested with numbers, and that anything else which wants to point at a place agrees with the scene about where that is.

## A layout from a lab's own record

`layoutFrom` is the join between the protocol and a drawing. It reads a lab by shape — a few fields of places, items and parts — so this package depends on nothing and `@biolibs/bionet`'s lab state fits as it is. Retired places are left out with everything in them, and so are items nobody has put anywhere: a layout is of what can be found.

## Arranging is the inverse, and is arithmetic too

Dragging a freezer across a floor has to become something a lab can say: a position measured from the place the freezer is in, in that place's own facing. `standingOf` and `standingAt` are that inverse of `arrange`. They are here, not in the scene, for the reason the camera is: they can be tested with numbers. The test that matters stands every place exactly where `arrange` put it and checks that nothing moves.

`overlapping` and `sticking` say what has gone wrong. Only places in the same place are compared, and only places stood by hand are said to stick out: where `arrange` put something is not the lab's mistake.

## Source layout

```
packages/bionet-space/src/
  model.ts     what a place is, and what is stored in one
  arrange.ts   where each place stands, and the positions inside a box
  find.ts      levels, bounds, camera poses, search
  build.ts     arranging by hand: what a drag would have the lab say, and what has gone wrong
  from.ts      a layout made from a lab's own record of itself
  example.ts   a made-up lab to draw before a real one has places
```
