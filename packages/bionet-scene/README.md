# @biolibs/bionet-scene

A lab in three dimensions. Rooms, freezers, boxes and tubes drawn as edges in the Bionet theme — glowing on black, or plainly on a pale ground — with a camera that moves from the whole lab down to one position in a box.

```
npm install @biolibs/bionet-scene @biolibs/bionet-space @biolibs/bionet-theme three @react-three/fiber @react-three/drei @react-three/postprocessing
```

## The whole thing

```tsx
import "@biolibs/bionet-theme/theme.css";
import "@biolibs/bionet-scene/scene.css";
import { exampleLab } from "@biolibs/bionet-space";
import { LabExplorer } from "@biolibs/bionet-scene";

<LabExplorer layout={exampleLab()} labName="The Wren Lab"
             neighbours={[{ id: "https://lab-thistle.onrender.com", name: "Thistle Lab" }]} />
```

Press a freezer to look into it, a box to take it out, a tube to pick it. The line at the top is the way back. Typing a part's name lights up every box holding one, and Return goes to the first. It fills whatever it is put in, and follows the system's light or dark setting unless `theme` pins one.

three.js needs a canvas, so in Next.js load it in the browser only: `dynamic(() => import("@biolibs/bionet-scene").then((m) => m.LabExplorer), { ssr: false })`.

## A real lab

```tsx
import { useLab } from "@biolibs/bionet-react";
import { LabView } from "@biolibs/bionet-scene";

const lab = useLab()?.lab;
lab && <LabView lab={lab} name={lab.name ?? "Lab"} />
```

`LabView` draws a lab from its own record: the places its members added and where they put each
tube. Until the lab has a place it says there is nothing to draw yet.

## Arranging the lab

```tsx
import { LabView } from "@biolibs/bionet-scene";

<LabView lab={lab} name="The Wren Lab" onStand={(place, standing) => act("standPlace", { place, standing })} />
```

Given `onStand`, the view gains an Arrange switch. In it, drag what stands in a room to move it,
press it to turn it a quarter or set its size, and with nothing picked set the size of the room.
Every move is handed to `onStand` and the room is redrawn from what the lab then says. Places
standing in each other, or through a wall, turn the attention colour and are named in words.

`LabBuilder` is the same thing on its own, taking a `Layout`.

## What to draw is decided before anything is drawn

```ts
import { exampleLab } from "@biolibs/bionet-space";
import { focusOn, sceneView } from "@biolibs/bionet-scene";

const lab = exampleLab();
sceneView(lab, { place: null }).level;                // "lab"
sceneView(lab, { place: null }).tubes.length;         // 0: from across the room, no tube is worth drawing
sceneView(lab, { place: "minus80-s3-B-4" }).level;    // "box"
focusOn(lab, "tube-1622");                            // { place: "minus80-s3-B-4", item: "tube-1622" }
```

`sceneView` turns a lab and a focus into a list: each place with its colour's meaning and how strongly to draw it, the tubes and empty positions of the box being looked at, where the camera stands, and the way back. It is plain data and is tested without a graphics card. `LabScene` draws that list and reports what was pressed; `LabExplorer` is `LabScene` with the crumbs, the search and the picked tube's card.

## What is fixed

There are no options for how the scene looks. Colours come from `@biolibs/bionet-theme` by meaning (`yours`, `theirs`, `held`, `found`, `attention`), and sizes come from the lab's own data.
