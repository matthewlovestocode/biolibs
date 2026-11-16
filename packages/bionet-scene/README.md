# @biolibs/bionet-scene

A lab in three dimensions. Rooms, freezers, boxes and tubes drawn as edges in the Bionet theme — glowing on black, or plainly on a pale ground — with a camera that moves from the whole lab down to one position in a box. The same view arranges the lab by hand: drag, turn, resize, add and retire places.

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
press it to turn it a quarter, set its size or its height off the floor, and with nothing picked set
the size of the room. "Arrange inside" goes into a freezer, a shelf or a bench to arrange what is
there; shelves are dragged up and down, everything else across.
Every move is handed to `onStand` and the room is redrawn from what the lab then says. Places
standing in each other, or through a wall, turn the attention colour and are named in words.

Given `onAdd` and `onRetire` as well, places are added and retired there too: a freezer in the room,
a shelf in the freezer, a box on the shelf, an instrument on a bench. A lab with no places offers
its first room, so a lab can be built without leaving the view.

```tsx
<LabView lab={lab} onStand={stand} onAdd={(place) => act("addPlace", place)} onRetire={(place) => act("retirePlace", { place })} />
```

`onUse`, if given, puts a "Use it" button beside an instrument once it has been pressed, and is told
which. What opens is the host's to decide; `@biolibs/bionet-tools` has the tools.

`LabBuilder` is the same thing on its own, taking a `Layout`.

## An instrument in use

```tsx
import { InstrumentStage } from "@biolibs/bionet-scene";

<InstrumentStage model="thermocycler" name="Thermocycler" view={view} onView={setView}
                 screen={[{ text: "Anneal  55 °C   0:30", lit: true }]} well={{ row: 0, column: 0 }} tube={tube}>
  {panel}
</InstrumentStage>
```

One instrument in a space of its own, away from the lab, with five views as buttons: the machine,
its block with the lid up, its screen, what is in the tube, and the result. The first three are
what the machine shows; the last two are what its operator has to picture. What is on the screen,
which well is taken and what is in the tube are handed in as plain data, and `children` is drawn
beside the scene. `@biolibs/bionet-tools` supplies all of it for a PCR.

A thermocycler and a gel station are drawn to resemble the equipment, from a `Shape`: a body, a lid
that opens, a screen, a block of wells. They are drawn that way in the lab as well.

What is in the tube plays out, slowly enough to follow: strands part, primers land, copies grow
from each primer, with a polymerase at each growing end. A strand says what it does
(`moves: "parts" | "lands" | "grows"`), and the stage plays the step over about two seconds, with
Pause, a scrubber to drag to any moment, and Slow and Fast. `onPlayed` is told when a step finishes,
which is how a host runs one step into the next.

The strands are thousands of bases long and are lines. `lens` gives the real bases at one place on
them for any moment of the step, and they are written out over the scene as two rows of letters, each
base above the one it pairs with, with the stretch they are of outlined on the strands.

`measures` marks lengths off under the strands in the tube: a bar from one base to another with a
tick at each end and a label, such as the subtraction that gives a product's length.

Each model of instrument names the five views in its own words (`stageViewName`): a gel station's
are the gel box, the gel, the power supply, in the tube, and the gel, run. `gel` is a gel that has
been run, drawn above the instrument in the result view: lanes of bands with their sizes beside
them, and `ran` from 0 to 1 for how far it has got. A molecule may carry `marks`, places named
across its backbone, such as where an enzyme cuts; with no strands to draw, it is shown in the tube
view.

## A molecule in the scene

```tsx
import { InstrumentStage, LabView } from "@biolibs/bionet-scene";

<LabView lab={lab} molecule={(item) => moleculeFor(item)} />
<InstrumentStage model="thermocycler" name="Thermocycler" view="result" onView={setView} molecule={product} />
```

A `StageMolecule` is a name, a length, whether it is a circle, and the stretches marked on it, each
with a colour's meaning. It is drawn as a plasmid map is: a ring read from the top and clockwise, or
a bar, with overlapping stretches in lanes and a barb on the ones that point. In the lab it is drawn
over a tube that has been picked, so the tube in the box and the construct in it are seen together.
On an instrument's stage it is drawn above the machine in the result view, as what the run made.
`placeMolecule` works one out into lines facing whoever is looking, and is plain arithmetic.
`moleculeOf` in `@biolibs/bionet-tools` makes one from a part.

## Motion can be turned off

Every scene has a switch, and starts as the system's "reduce motion" setting says. With motion off a
change of view is a cut and nothing moves by itself: a step in the tube is shown finished, with
Before and After buttons and the scrubber to look at any moment of it. `motion="off"` pins it.

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
