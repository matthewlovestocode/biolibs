/**
 * What a piece of equipment looks like, as plain data.
 *
 * A place is drawn as a box. An instrument should look like the thing a person walks up to, so a
 * model of instrument can say what it is made of: a few boxes, and the parts that matter when it is
 * used — a lid that opens, a screen, a block of wells. Everything is given as a fraction of the
 * instrument's own size, with the origin at its middle, so one shape fits whatever size a lab has
 * given the real one.
 *
 * Nothing here draws anything. The same data places the camera for each view of the instrument.
 */
import { VIEWED_FROM, type Pose } from "@biolibs/bionet-space";
import type { Meaning } from "@biolibs/bionet-theme";

/**
 * A piece of an instrument: where its middle is and how big it is, as fractions of the whole.
 *
 * A piece is a box unless it says otherwise. `round` makes it a cylinder standing on its ends,
 * which is what a drum, a knob, a foot, a flask clamp and an eyepiece all are, and `lying` lays
 * that cylinder on its side along x or z — a hinge, a roller, a lens barrel pointing at somebody.
 */
export interface Part {
  at: [number, number, number];
  size: [number, number, number];
  /** Drawn as a cylinder rather than a box. */
  round?: boolean;
  /** For a round piece, the way its ends face. `y` (the default) stands it up. */
  along?: "x" | "y" | "z";
}

/** What an instrument is made of. */
export interface Shape {
  /** The boxes that do not move. */
  body: Part[];
  /** A lid: the pieces it is made of, the line along the back it turns about, and how far it opens, in degrees. */
  lid?: { parts: Part[]; hinge: [number, number, number]; opens: number };
  /** A screen: where it is, how big across and up, and how far it leans back from upright, in degrees. */
  screen?: { at: [number, number, number]; size: [number, number]; leans: number };
  /** A block of wells on a flat top: where its middle is, how big across and deep, and how many wells. */
  block?: { at: [number, number, number]; size: [number, number]; rows: number; columns: number };
}

const SHAPES: Readonly<Record<string, Shape>> = {
  // A base with a control panel at the front, and a heated lid over a block of 96 wells behind it.
  // The feet, the vent and the hinge knuckles are there because an instrument drawn as two boxes is
  // a diagram of a thermocycler; the thing a person walks up to has a handle to lift.
  thermocycler: {
    body: [
      { at: [0, -0.2, 0], size: [1, 0.56, 1] },
      { at: [0, 0.16, 0.36], size: [0.92, 0.12, 0.26] },
      { at: [0, -0.2, -0.49], size: [0.66, 0.34, 0.02] },
      { at: [-0.3, 0.1, -0.455], size: [0.16, 0.07, 0.07], round: true, along: "x" },
      { at: [0.3, 0.1, -0.455], size: [0.16, 0.07, 0.07], round: true, along: "x" },
      { at: [0.36, 0.17, 0.3], size: [0.1, 0.1, 0.1], round: true },
      { at: [-0.4, -0.47, -0.36], size: [0.1, 0.06, 0.1], round: true },
      { at: [0.4, -0.47, -0.36], size: [0.1, 0.06, 0.1], round: true },
      { at: [-0.4, -0.47, 0.36], size: [0.1, 0.06, 0.1], round: true },
      { at: [0.4, -0.47, 0.36], size: [0.1, 0.06, 0.1], round: true },
    ],
    lid: { parts: [{ at: [0, 0.3, -0.13], size: [0.9, 0.4, 0.7] },
                   { at: [0, 0.48, 0.18], size: [0.34, 0.04, 0.04], round: true, along: "x" }],
           hinge: [0, 0.1, -0.48], opens: 78 },
    screen: { at: [0, 0.225, 0.36], size: [0.5, 0.16], leans: 62 },
    block: { at: [0, 0.105, -0.13], size: [0.74, 0.56], rows: 8, columns: 12 },
  },
  // A shallow tank with a lid, the tray and the two electrode walls the current runs between, the
  // comb that makes the wells, and beside it the power supply with its display, dial and lamp.
  "gel-station": {
    body: [
      { at: [-0.18, -0.2, 0], size: [0.62, 0.6, 0.96] },
      { at: [0.36, -0.05, -0.1], size: [0.26, 0.9, 0.6] },
      { at: [-0.18, 0.02, 0], size: [0.5, 0.06, 0.8] },
      { at: [-0.44, 0.08, 0], size: [0.04, 0.3, 0.86] },
      { at: [0.08, 0.08, 0], size: [0.04, 0.3, 0.86] },
      { at: [-0.18, 0.14, -0.3], size: [0.46, 0.1, 0.03] },
      { at: [0.36, -0.12, 0.205], size: [0.1, 0.1, 0.06], round: true, along: "z" },
      { at: [0.36, -0.3, 0.205], size: [0.05, 0.05, 0.04], round: true, along: "z" },
      { at: [-0.4, -0.48, -0.4], size: [0.1, 0.04, 0.1], round: true },
      { at: [0.04, -0.48, -0.4], size: [0.1, 0.04, 0.1], round: true },
      { at: [-0.4, -0.48, 0.4], size: [0.1, 0.04, 0.1], round: true },
      { at: [0.04, -0.48, 0.4], size: [0.1, 0.04, 0.1], round: true },
    ],
    lid: { parts: [{ at: [-0.18, 0.22, 0], size: [0.6, 0.24, 0.94] },
                   { at: [-0.18, 0.35, 0.2], size: [0.22, 0.04, 0.04], round: true, along: "x" }],
           hinge: [-0.18, 0.1, -0.48], opens: 70 },
    screen: { at: [0.36, 0.2, 0.205], size: [0.18, 0.2], leans: 0 },
    block: { at: [-0.18, 0.105, 0], size: [0.46, 0.7], rows: 1, columns: 8 },
  },
  // A cabinet with a lid that lifts, the platform that shakes and the clamps a flask sits in, and a
  // control panel leaning up at the front. What it shows is a temperature, a speed and a time; what
  // is going on inside it is cells growing, which no part of it displays.
  "shaking-incubator": {
    body: [
      { at: [0, -0.22, 0], size: [1, 0.56, 1] },
      { at: [0, 0.14, 0.4], size: [0.96, 0.12, 0.2] },
      { at: [0, -0.22, -0.49], size: [0.7, 0.4, 0.02] },
      { at: [0, 0.06, -0.1], size: [0.84, 0.04, 0.7] },
      { at: [-0.3, 0.13, -0.47], size: [0.18, 0.06, 0.06], round: true, along: "x" },
      { at: [0.3, 0.13, -0.47], size: [0.18, 0.06, 0.06], round: true, along: "x" },
      { at: [0.4, 0.15, 0.4], size: [0.09, 0.09, 0.09], round: true },
      { at: [-0.42, -0.48, -0.42], size: [0.1, 0.04, 0.1], round: true },
      { at: [0.42, -0.48, -0.42], size: [0.1, 0.04, 0.1], round: true },
      { at: [-0.42, -0.48, 0.42], size: [0.1, 0.04, 0.1], round: true },
      { at: [0.42, -0.48, 0.42], size: [0.1, 0.04, 0.1], round: true },
    ],
    lid: { parts: [{ at: [0, 0.28, -0.1], size: [0.94, 0.3, 0.78] },
                   { at: [0, 0.44, 0.26], size: [0.4, 0.05, 0.05], round: true, along: "x" }],
           hinge: [0, 0.13, -0.49], opens: 72 },
    screen: { at: [0, 0.2, 0.4], size: [0.44, 0.14], leans: 55 },
    block: { at: [0, 0.1, -0.1], size: [0.8, 0.66], rows: 2, columns: 3 },
  },
  // A drum with a lid over a rotor of eight buckets, which is what a centrifuge is: everything it
  // does is the rotor going round, and the positions are numbered so a tube is found again after.
  centrifuge: {
    body: [
      { at: [0, -0.22, 0], size: [1, 0.56, 1], round: true },
      { at: [0, 0.1, 0.42], size: [0.56, 0.2, 0.16] },
      { at: [0, 0.06, -0.02], size: [0.76, 0.05, 0.76], round: true },
      { at: [0, 0.13, -0.02], size: [0.1, 0.12, 0.1], round: true },
      { at: [0.34, 0.08, 0.42], size: [0.1, 0.1, 0.08], round: true, along: "z" },
      // Eight buckets round the rotor, at the eighth-turns of a circle of radius 0.27.
      { at: [0, 0.06, 0.25], size: [0.13, 0.14, 0.13], round: true },
      { at: [0.19, 0.06, 0.17], size: [0.13, 0.14, 0.13], round: true },
      { at: [0.27, 0.06, -0.02], size: [0.13, 0.14, 0.13], round: true },
      { at: [0.19, 0.06, -0.21], size: [0.13, 0.14, 0.13], round: true },
      { at: [0, 0.06, -0.29], size: [0.13, 0.14, 0.13], round: true },
      { at: [-0.19, 0.06, -0.21], size: [0.13, 0.14, 0.13], round: true },
      { at: [-0.27, 0.06, -0.02], size: [0.13, 0.14, 0.13], round: true },
      { at: [-0.19, 0.06, 0.17], size: [0.13, 0.14, 0.13], round: true },
    ],
    lid: { parts: [{ at: [0, 0.2, -0.02], size: [0.92, 0.24, 0.92], round: true },
                   { at: [0, 0.33, 0.28], size: [0.28, 0.05, 0.05], round: true, along: "x" }],
           hinge: [0, 0.08, -0.47], opens: 74 },
    screen: { at: [0, 0.14, 0.5], size: [0.34, 0.1], leans: 0 },
  },
  // A screen on a foot, the keyboard in front of it and a mouse beside that. Nothing in a lab's
  // record is kept on it; it is here because a bench has one, and a room without one is a diagram.
  computer: {
    body: [
      { at: [0, -0.44, 0.26], size: [0.88, 0.08, 0.4] },
      { at: [0, -0.2, -0.1], size: [0.12, 0.4, 0.08] },
      { at: [0, -0.44, -0.1], size: [0.46, 0.08, 0.34] },
      { at: [0, 0.12, -0.07], size: [0.98, 0.68, 0.05] },
      { at: [0.44, -0.42, 0.3], size: [0.1, 0.06, 0.16], round: true },
    ],
    screen: { at: [0, 0.12, -0.03], size: [0.9, 0.6], leans: 6 },
  },
  // The base and its lamp, the arm up the back with the focus knobs on it, the stage a slide sits
  // on, the condenser under it, the turret of objectives, and the eyepieces leaning out at whoever
  // is at it. It shows nothing: all it has to say is said by the person looking down it.
  microscope: {
    body: [
      { at: [0, -0.42, 0.04], size: [0.82, 0.16, 0.9] },
      { at: [0, -0.42, -0.38], size: [0.2, 0.1, 0.1], round: true, along: "z" },
      { at: [0, 0.02, -0.3], size: [0.3, 0.84, 0.3] },
      { at: [0, -0.12, 0.08], size: [0.66, 0.06, 0.5] },
      { at: [0, -0.26, 0.08], size: [0.16, 0.16, 0.16], round: true },
      { at: [0, -0.02, 0.04], size: [0.22, 0.1, 0.22], round: true },
      { at: [-0.06, -0.1, 0.04], size: [0.07, 0.14, 0.07], round: true },
      { at: [0.06, -0.1, 0.04], size: [0.07, 0.14, 0.07], round: true },
      { at: [-0.2, 0.06, -0.3], size: [0.12, 0.12, 0.12], round: true, along: "x" },
      { at: [0.2, 0.06, -0.3], size: [0.12, 0.12, 0.12], round: true, along: "x" },
      { at: [0, 0.3, -0.14], size: [0.26, 0.18, 0.3] },
      { at: [-0.07, 0.36, 0.08], size: [0.1, 0.1, 0.22], round: true, along: "z" },
      { at: [0.07, 0.36, 0.08], size: [0.1, 0.1, 0.22], round: true, along: "z" },
    ],
  },
  // A case with a lid over the cuvette well, and a sloped panel at the front. What it reads is one
  // number — how much light got through — which is how dense a culture is and how much DNA is in a
  // drop. The well is the whole instrument; everything else on it is for setting the wavelength.
  spectrophotometer: {
    body: [
      { at: [0, -0.22, 0], size: [1, 0.56, 1] },
      { at: [0, 0.14, 0.36], size: [0.96, 0.14, 0.28] },
      { at: [0, -0.22, -0.49], size: [0.6, 0.3, 0.02] },
      { at: [-0.22, 0.06, -0.1], size: [0.34, 0.06, 0.44] },
      { at: [-0.22, 0.08, -0.1], size: [0.1, 0.12, 0.1] },
      { at: [0.3, 0.16, 0.3], size: [0.1, 0.1, 0.1], round: true },
      { at: [-0.4, 0.1, -0.35], size: [0.14, 0.06, 0.06], round: true, along: "x" },
      { at: [-0.04, 0.1, -0.35], size: [0.14, 0.06, 0.06], round: true, along: "x" },
      { at: [-0.42, -0.47, -0.38], size: [0.1, 0.06, 0.1], round: true },
      { at: [0.42, -0.47, -0.38], size: [0.1, 0.06, 0.1], round: true },
      { at: [-0.42, -0.47, 0.38], size: [0.1, 0.06, 0.1], round: true },
      { at: [0.42, -0.47, 0.38], size: [0.1, 0.06, 0.1], round: true },
    ],
    lid: { parts: [{ at: [-0.22, 0.2, -0.1], size: [0.46, 0.16, 0.56] },
                   { at: [-0.22, 0.3, 0.1], size: [0.2, 0.04, 0.04], round: true, along: "x" }],
           hinge: [-0.22, 0.1, -0.38], opens: 80 },
    screen: { at: [0, 0.22, 0.36], size: [0.5, 0.16], leans: 60 },
    // One well, because one cuvette goes in at a time, and a reading is of that one.
    block: { at: [-0.22, 0.09, -0.1], size: [0.16, 0.18], rows: 1, columns: 1 },
  },
  // A case with the voltage dial, the pulse button and the slide the cuvette goes into. It is the
  // machine a transformation is actually done at, which until now had no machine at all.
  electroporator: {
    body: [
      { at: [0, -0.2, 0], size: [1, 0.6, 1] },
      { at: [0, 0.18, 0], size: [0.9, 0.16, 0.9] },
      { at: [-0.25, 0.3, 0.1], size: [0.26, 0.08, 0.3] },
      { at: [0.28, 0.32, -0.12], size: [0.22, 0.1, 0.22], round: true },
      { at: [0.28, 0.32, 0.24], size: [0.12, 0.08, 0.12], round: true },
      { at: [0, -0.2, -0.49], size: [0.5, 0.3, 0.02] },
      { at: [-0.4, -0.47, -0.4], size: [0.1, 0.06, 0.1], round: true },
      { at: [0.4, -0.47, -0.4], size: [0.1, 0.06, 0.1], round: true },
      { at: [-0.4, -0.47, 0.4], size: [0.1, 0.06, 0.1], round: true },
      { at: [0.4, -0.47, 0.4], size: [0.1, 0.06, 0.1], round: true },
    ],
    screen: { at: [-0.1, 0.3, 0.46], size: [0.4, 0.12], leans: 0 },
  },
  // A tank of water held at a temperature, with a rack of tube positions standing in it. A heat
  // shock is thirty seconds in one of these, and so is most of what an enzyme is left to do.
  "water-bath": {
    body: [
      { at: [0, -0.2, 0], size: [1, 0.6, 1] },
      { at: [0, 0.1, 0.42], size: [0.9, 0.16, 0.16] },
      { at: [0, 0, -0.04], size: [0.82, 0.02, 0.78] },
      { at: [0.4, 0.12, 0.42], size: [0.12, 0.12, 0.1], round: true },
      { at: [-0.4, -0.48, -0.4], size: [0.1, 0.04, 0.1], round: true },
      { at: [0.4, -0.48, -0.4], size: [0.1, 0.04, 0.1], round: true },
      { at: [-0.4, -0.48, 0.4], size: [0.1, 0.04, 0.1], round: true },
      { at: [0.4, -0.48, 0.4], size: [0.1, 0.04, 0.1], round: true },
    ],
    lid: { parts: [{ at: [0, 0.22, -0.04], size: [0.9, 0.2, 0.84] },
                   { at: [0, 0.33, 0.3], size: [0.3, 0.04, 0.04], round: true, along: "x" }],
           hinge: [0, 0.1, -0.47], opens: 70 },
    screen: { at: [0, 0.14, 0.5], size: [0.36, 0.1], leans: 0 },
    block: { at: [0, 0.04, -0.04], size: [0.72, 0.64], rows: 3, columns: 8 },
  },
  // A pan behind glass, on a base heavy enough not to move. Everything a lab makes up by hand —
  // the medium, the agarose, the buffer — starts on one of these.
  balance: {
    body: [
      { at: [0, -0.38, 0.06], size: [1, 0.24, 0.86] },
      { at: [0, -0.22, -0.08], size: [0.5, 0.08, 0.5], round: true },
      { at: [-0.44, 0.06, -0.08], size: [0.04, 0.64, 0.7] },
      { at: [0.44, 0.06, -0.08], size: [0.04, 0.64, 0.7] },
      { at: [0, 0.06, -0.42], size: [0.88, 0.64, 0.04] },
      { at: [0, 0.36, -0.08], size: [0.88, 0.04, 0.7] },
      { at: [0, -0.3, 0.46], size: [0.34, 0.12, 0.06] },
      { at: [-0.38, -0.48, 0.4], size: [0.1, 0.04, 0.1], round: true },
      { at: [0.38, -0.48, 0.4], size: [0.1, 0.04, 0.1], round: true },
      { at: [0, -0.48, -0.3], size: [0.1, 0.04, 0.1], round: true },
    ],
    screen: { at: [0, -0.3, 0.5], size: [0.28, 0.08], leans: 0 },
  },
  // A cup on a heavy foot that shakes whatever is pressed into it. Small, and in constant use.
  vortex: {
    body: [
      { at: [0, -0.2, 0], size: [1, 0.6, 1] },
      { at: [0, 0.18, -0.1], size: [0.6, 0.16, 0.6], round: true },
      { at: [0.3, 0.1, 0.36], size: [0.26, 0.26, 0.2], round: true, along: "z" },
      { at: [-0.3, 0.1, 0.42], size: [0.24, 0.1, 0.06] },
      { at: [-0.38, -0.48, -0.38], size: [0.14, 0.04, 0.14], round: true },
      { at: [0.38, -0.48, -0.38], size: [0.14, 0.04, 0.14], round: true },
      { at: [-0.38, -0.48, 0.38], size: [0.14, 0.04, 0.14], round: true },
      { at: [0.38, -0.48, 0.38], size: [0.14, 0.04, 0.14], round: true },
    ],
  },
  // A dark hood over a lit surface, with a camera looking down into it. The gel station runs the
  // gel; this is the thing that makes a picture of it, which is what the result of a digest is.
  "gel-imager": {
    body: [
      { at: [0, -0.22, 0], size: [1, 0.56, 1] },
      { at: [0, 0.06, 0], size: [0.8, 0.02, 0.8] },
      { at: [-0.46, 0.18, 0], size: [0.08, 0.5, 0.9] },
      { at: [0.46, 0.18, 0], size: [0.08, 0.5, 0.9] },
      { at: [0, 0.18, -0.45], size: [0.92, 0.5, 0.1] },
      { at: [0, 0.46, 0], size: [0.92, 0.08, 0.9] },
      { at: [0, 0.32, 0], size: [0.18, 0.2, 0.18], round: true },
      { at: [0, 0.18, 0.44], size: [0.88, 0.46, 0.04] },
      { at: [0.3, 0.18, 0.47], size: [0.06, 0.2, 0.05], round: true },
    ],
    screen: { at: [-0.28, -0.3, 0.5], size: [0.3, 0.1], leans: 0 },
  },
  // A cabinet with a glass door and shelves, holding one temperature. Plates go in after a
  // transformation and come out with colonies on them, which is the step a strain begins at.
  incubator: {
    body: [
      { at: [0, -0.02, -0.05], size: [1, 0.96, 0.9] },
      { at: [0, -0.06, 0.44], size: [0.96, 0.8, 0.06] },
      { at: [0, -0.06, 0.47], size: [0.6, 0.56, 0.02] },
      { at: [0.4, -0.06, 0.47], size: [0.06, 0.26, 0.06], round: true },
      { at: [0, 0.42, 0.44], size: [0.96, 0.14, 0.08] },
      { at: [0, -0.2, -0.05], size: [0.84, 0.02, 0.78] },
      { at: [0, 0.04, -0.05], size: [0.84, 0.02, 0.78] },
      { at: [0, 0.26, -0.05], size: [0.84, 0.02, 0.78] },
      { at: [-0.42, -0.485, -0.38], size: [0.1, 0.03, 0.1], round: true },
      { at: [0.42, -0.485, -0.38], size: [0.1, 0.03, 0.1], round: true },
      { at: [-0.42, -0.485, 0.38], size: [0.1, 0.03, 0.1], round: true },
      { at: [0.42, -0.485, 0.38], size: [0.1, 0.03, 0.1], round: true },
    ],
    screen: { at: [0, 0.42, 0.49], size: [0.4, 0.1], leans: 0 },
  },
  // A hood on a stand with a sash that slides down: air pulled through the grille at the front and
  // filtered out of the top, so that what is on the work surface stays what was put there.
  "biosafety-cabinet": {
    body: [
      { at: [0, -0.32, 0], size: [1, 0.36, 1] },
      { at: [0, 0.14, -0.04], size: [1, 0.56, 0.92] },
      { at: [0, 0.42, 0], size: [1, 0.16, 1] },
      { at: [0, -0.12, 0], size: [0.96, 0.04, 0.96] },
      { at: [0, -0.09, 0.44], size: [0.9, 0.03, 0.08] },
      { at: [0, 0.14, 0.46], size: [0.94, 0.42, 0.03] },
      { at: [0, -0.06, 0.46], size: [0.3, 0.04, 0.04], round: true, along: "x" },
      { at: [-0.42, 0.44, 0.46], size: [0.1, 0.1, 0.04], round: true, along: "z" },
      { at: [-0.44, -0.46, -0.4], size: [0.1, 0.08, 0.1], round: true },
      { at: [0.44, -0.46, -0.4], size: [0.1, 0.08, 0.1], round: true },
      { at: [-0.44, -0.46, 0.4], size: [0.1, 0.08, 0.1], round: true },
      { at: [0.44, -0.46, 0.4], size: [0.1, 0.08, 0.1], round: true },
    ],
    screen: { at: [0.34, 0.44, 0.5], size: [0.26, 0.08], leans: 0 },
  },
  // A pressure vessel with a round door and a wheel to lock it. Everything that goes into a lab
  // sterile goes through one, and everything that comes out of it alive goes back through.
  autoclave: {
    body: [
      { at: [0, -0.04, -0.04], size: [1, 0.92, 0.92] },
      { at: [0, -0.08, 0.44], size: [0.66, 0.66, 0.06], round: true, along: "z" },
      { at: [0, -0.08, 0.48], size: [0.3, 0.3, 0.04], round: true, along: "z" },
      { at: [0, 0.38, 0.44], size: [0.9, 0.16, 0.06] },
      { at: [0.36, -0.4, 0.46], size: [0.1, 0.1, 0.06], round: true, along: "z" },
      { at: [-0.4, -0.46, -0.38], size: [0.12, 0.08, 0.12], round: true },
      { at: [0.4, -0.46, -0.38], size: [0.12, 0.08, 0.12], round: true },
      { at: [-0.4, -0.46, 0.38], size: [0.12, 0.08, 0.12], round: true },
      { at: [0.4, -0.46, 0.38], size: [0.12, 0.08, 0.12], round: true },
    ],
    screen: { at: [0, 0.38, 0.48], size: [0.4, 0.1], leans: 0 },
  },
  // A metal block with two rows of holes for tubes, a dial, and a small display on its base.
  "heat-block": {
    body: [
      { at: [0, -0.26, 0], size: [1, 0.48, 1] },
      { at: [0, 0.02, 0], size: [0.86, 0.16, 0.86] },
      { at: [-0.34, -0.24, 0.46], size: [0.18, 0.18, 0.08], round: true, along: "z" },
      { at: [0.38, -0.4, 0.46], size: [0.07, 0.07, 0.06], round: true, along: "z" },
    ],
    screen: { at: [0.06, -0.18, 0.5], size: [0.3, 0.14], leans: 0 },
    block: { at: [0, 0.1, 0], size: [0.72, 0.6], rows: 2, columns: 6 },
  },
};

/**
 * What a model of instrument is made of.
 *
 * @param model - The instrument's model, such as `thermocycler`.
 * @returns Its shape, or `null` for a model that is drawn as a plain box.
 */
export function shapeOf(model: string | undefined): Shape | null {
  return model !== undefined && Object.hasOwn(SHAPES, model) ? SHAPES[model]! : null;
}

/** The views of an instrument in use: what it shows, then what its operator has to picture. */
export const STAGE_VIEWS = ["machine", "block", "screen", "tube", "result"] as const;

/** One of them. */
export type StageView = (typeof STAGE_VIEWS)[number];

/** What each view is called on its button. */
export const STAGE_VIEW_NAMES: Readonly<Record<StageView, string>> = {
  machine: "The machine", block: "The block", screen: "The screen", tube: "In the tube", result: "The result",
};

/**
 * How far open the lid is in a view, from 0 (shut) to 1.
 *
 * @param view - The view.
 * @returns 1 for the views that look under the lid.
 */
export function lidOpen(view: StageView): number {
  return view === "block" || view === "tube" ? 1 : 0;
}

/** How far above the instrument's top the strands in the tube are drawn, and how tall the space they take is, in metres. */
export const TUBE_SPACE = { above: 0.22, height: 0.2, width: 0.62 } as const;

/** How big a molecule is drawn above an instrument: a ring's radius, or half a bar's length, in metres. */
export const MOLECULE_RADIUS = 0.2;

/**
 * Where the middle of a molecule drawn above an instrument is.
 *
 * @param size - How wide, tall and deep the instrument is, in metres.
 * @returns The point, for an instrument on the floor at the origin.
 */
export function moleculeCentre(size: readonly [number, number, number]): [number, number, number] {
  return [0, size[1] + MOLECULE_RADIUS * 1.35, 0];
}

/**
 * Where to stand for a view of an instrument that sits on the floor at the origin.
 *
 * @param view - The view.
 * @param size - How wide, tall and deep the instrument is, in metres.
 * @param shape - What it is made of, for where its screen and block are.
 * @param molecule - Whether what was made is drawn above the instrument in the result view, and so needs to be in the view.
 * @returns Where the camera stands, what it looks at, and its field of view in degrees.
 */
export function stagePose(view: StageView, size: readonly [number, number, number], shape: Shape | null, molecule = false): Pose & { fov: number } {
  const [w, h, d] = size;
  const point = (at: readonly [number, number, number]): [number, number, number] => [at[0] * w, h / 2 + at[1] * h, at[2] * d];
  const reach = Math.max(w, h, d);
  if (view === "block" && shape?.block !== undefined) {
    const at = point(shape.block.at);
    return { target: at, position: [at[0], at[1] + reach * 1.5, at[2] + reach * 0.9], fov: 40 };
  }
  if (view === "screen" && shape?.screen !== undefined) {
    const at = point(shape.screen.at);
    const lean = (shape.screen.leans * Math.PI) / 180;
    // Straight on to the screen: out along the way it faces.
    return { target: at, position: [at[0], at[1] + Math.sin(lean) * reach * 0.9, at[2] + Math.cos(lean) * reach * 0.9], fov: 40 };
  }
  if (view === "tube") {
    const middle = h + TUBE_SPACE.above + TUBE_SPACE.height / 2;
    // Far enough back that the whole template fits across a view that may be taller than it is wide.
    return { target: [0, middle, 0], position: [0, middle + 0.04, (TUBE_SPACE.width * 1.45) / Math.tan((30 * Math.PI) / 360) / 2 / 0.85], fov: 30 };
  }
  if (view === "result" && molecule) {
    const at = moleculeCentre(size);
    return { target: [0, (at[1] + h * 0.7) / 2, 0], position: [reach * 0.45, at[1] + reach * 0.1, reach * 1.2 + MOLECULE_RADIUS * 4.4], fov: 40 };
  }
  // The machine is seen from where the room was looking at it, so that walking up to a machine and
  // then being in front of it are the same machine seen from the same side rather than two pictures.
  const [across, up, towards] = VIEWED_FROM.inside;
  const length = Math.hypot(across, up, towards);
  // Far enough back that the whole machine is in a pane the panel has taken half of.
  const away = (reach * 3.1) / length;
  return { target: [0, h * 0.5, 0], position: [across * away, h * 0.5 + up * away, towards * away], fov: 40 };
}

/** One strand to draw in the tube, as the caller gives it. */
export interface StageStrand {
  /** Where it starts and ends, in bases. */
  from: number;
  to: number;
  /** Which row it is on, counting from the top. */
  row: number;
  /** What it is, which decides its colour. */
  kind: "template" | "primer" | "growing" | "long" | "product";
  /** Which end its 3′ end is at. */
  points: "right" | "left";
  /**
   * What it does while the step plays, if anything: `parts` from the strand it was paired with,
   * `lands` on the strand it matches, or `grows` from its 5′ end to its 3′ end.
   */
  moves?: "parts" | "lands" | "grows";
}

/** What is in the tube, for the view that looks into it. */
export interface StageTube {
  /** How long the template is, in bases: the width everything else is measured against. */
  length: number;
  /** The strands. */
  strands: readonly StageStrand[];
}

/** A strand placed in the scene. */
export interface PlacedStrand extends StageStrand {
  /** Its two ends, in metres. */
  start: [number, number, number];
  end: [number, number, number];
  /** How much of it is there, from 0 (not yet) to 1. */
  presence: number;
  /** Whether it is part-way through being copied. */
  growing: boolean;
}

/** How long a step takes to play at each speed, in seconds. */
export const STEP_SECONDS = { fast: 0.9, usual: 2.2, slow: 6 } as const;

/** One of the speeds a step plays at. */
export type StepSpeed = keyof typeof STEP_SECONDS;

/** A base pair between two strands: a short line from one to the other. */
export interface Rung {
  /** Where it is across the scene, and the heights of the two strands it joins, in metres. */
  x: number;
  top: number;
  bottom: number;
  /** How much of it is there, from 0 (broken) to 1. */
  presence: number;
}

/** How far apart the pairs are drawn, in metres. Far fewer than there are bases: enough to read as pairing. */
const RUNG_EVERY = 0.012;

/**
 * The base pairs to draw between the strands in the tube.
 *
 * Pairs are what a PCR is made of breaking and making: heat breaks them, cooling lets a primer make
 * a few, and the polymerase makes the rest one after another. So they are drawn. Two strands that
 * are parting are joined until they have moved apart; a primer is joined to the strand it has
 * landed on; a growing copy is joined as far as it has grown.
 *
 * @param placed - The strands, from `placeStrands`.
 * @returns The pairs. Strands in the top two rows pair with each other, and so do the bottom two.
 */
export function pairsOf(placed: readonly PlacedStrand[]): Rung[] {
  const rungs: Rung[] = [];
  const between = (a: PlacedStrand, b: PlacedStrand, presence: number): void => {
    const from = Math.max(Math.min(a.start[0], a.end[0]), Math.min(b.start[0], b.end[0]));
    const to = Math.min(Math.max(a.start[0], a.end[0]), Math.max(b.start[0], b.end[0]));
    if (to - from < 1e-6 || presence <= 0.02) return;
    // Pairs stay where they are along the template as a strand grows past them.
    for (let x = Math.ceil(from / RUNG_EVERY) * RUNG_EVERY; x <= to + 1e-9; x += RUNG_EVERY) {
      rungs.push({ x, top: Math.max(a.start[1], b.start[1]), bottom: Math.min(a.start[1], b.start[1]), presence });
    }
  };
  // Two strands parting: still joined while they are close, and not once they are a row apart.
  const parting = placed.filter((one) => one.moves === "parts");
  if (parting.length === 2) {
    const gap = Math.abs(parting[0]!.start[1] - parting[1]!.start[1]);
    between(parting[0]!, parting[1]!, 1 - Math.min(1, gap / (TUBE_SPACE.height * 0.35)));
  }
  // A primer or a copy pairs with the strand in the row beside it: rows 0 and 1, rows 2 and 3.
  for (const [outer, inner] of [[0, 1], [3, 2]] as const) {
    const template = placed.find((one) => one.row === outer && one.moves !== "parts");
    if (template === undefined) continue;
    for (const one of placed.filter((each) => each.row === inner)) {
      // A primer on its way in has not paired yet: pairs form as it settles.
      between(template, one, one.moves === "lands" ? Math.max(0, one.presence * 2 - 1) : one.presence);
    }
  }
  return rungs;
}

/**
 * Where the polymerase is on each strand it is copying.
 *
 * @param placed - The strands, from `placeStrands`.
 * @returns The point at the growing 3′ end of each strand that is part-way through being made.
 */
export function polymerasesOf(placed: readonly PlacedStrand[]): [number, number, number][] {
  return placed.filter((one) => one.moves === "grows" && one.presence > 0 && one.growing)
    .map((one) => (one.points === "right" ? one.end : one.start));
}

/** Gently away, and gently to rest: how far along a movement is, for how far through its time it is. */
const eased = (through: number): number => { const at = Math.min(Math.max(through, 0), 1); return at * at * (3 - 2 * at); };

/**
 * Where each strand in the tube is drawn, part-way through a step.
 *
 * The template's length is spread across a fixed width above the instrument, and each row is a
 * line across it, so that positions along a strand can be compared between rows by eye. A strand
 * that moves is drawn where it has got to: two strands that part start touching in the middle and
 * move out to their rows; a primer that lands drifts in from beside its place and fades up; a strand
 * that grows is drawn from its 5′ end as far as it has been copied.
 *
 * @param tube - What is in the tube.
 * @param size - How big the instrument is, in metres.
 * @param through - How far through the step it is, from 0 to 1. At 1 everything is at rest.
 * @returns Each strand with its two ends in the scene, and how much of it is there.
 */
export function placeStrands(tube: StageTube, size: readonly [number, number, number], through = 1): PlacedStrand[] {
  const rows = Math.max(1, ...tube.strands.map((one) => one.row + 1));
  const top = size[1] + TUBE_SPACE.above + TUBE_SPACE.height;
  const middle = top - TUBE_SPACE.height / 2;
  const across = (base: number): number => (tube.length <= 0 ? 0 : (base / tube.length - 0.5) * TUBE_SPACE.width);
  const at = eased(through);
  return tube.strands.map((one) => {
    const rest = top - (rows === 1 ? 0.5 : one.row / (rows - 1)) * TUBE_SPACE.height;
    let [from, to, y, presence] = [across(one.from), across(one.to), rest, 1];
    if (one.moves === "parts") {
      // Paired, the two strands lie a hair apart on the middle line.
      const paired = middle + (rest >= middle ? 0.004 : -0.004);
      y = paired + (rest - paired) * at;
    } else if (one.moves === "lands") {
      // It comes in from the side its 5′ end is on, a little off the strand it will bind.
      const aside = (one.points === "right" ? -1 : 1) * TUBE_SPACE.width * 0.12 * (1 - at);
      from += aside;
      to += aside;
      y = rest + (middle - rest) * 0.45 * (1 - at);
      presence = Math.min(1, at * 1.6);
    } else if (one.moves === "grows") {
      // Copying runs from the 5′ end to the 3′ end, so it grows towards the way it points.
      if (one.points === "right") to = from + (to - from) * at;
      else from = to + (from - to) * at;
      presence = at <= 0 ? 0 : 1;
    }
    return { ...one, start: [from, y, 0], end: [to, y, 0], presence, growing: one.moves === "grows" && at > 0 && at < 1 };
  });
}

/** The real bases at one place on the strands, for the magnified view. */
export interface StageLens {
  /** The stretch of the template it shows, in bases. */
  from: number;
  to: number;
  /** The upper strand, 5′ to 3′ from the left: what it is, and a base for each place, or `""` for none. */
  upper: { label: string; cells: readonly { base: string; state: "paired" | "single" | "fresh" }[] };
  /** The lower strand, 3′ to 5′ from the left, each base under the one it pairs with. */
  lower: { label: string; cells: readonly { base: string; state: "paired" | "single" | "fresh" }[] };
  /** For each place, whether the two bases are paired. */
  joined: readonly boolean[];
  /** The place the polymerase is at, counted from the left, if it is copying. */
  polymerase: number | null;
  /** How many more bases the copy has to go beyond what is shown. */
  beyond: number;
  /** The two rows of strands it is a closer look at, counting from the top. */
  rows: readonly [number, number];
}

/**
 * The outline, among the strands, of the stretch a magnified view is of.
 *
 * @param lens - What is magnified.
 * @param length - How long the template is, in bases.
 * @param size - How big the instrument is, in metres.
 * @param rowCount - How many rows of strands there are.
 * @returns Its corners, in order round it, ending where it began.
 */
export function lensFrame(lens: Pick<StageLens, "from" | "to" | "rows">, length: number, size: readonly [number, number, number], rowCount = 4): [number, number, number][] {
  const top = size[1] + TUBE_SPACE.above + TUBE_SPACE.height;
  const across = (base: number): number => (length <= 0 ? 0 : (base / length - 0.5) * TUBE_SPACE.width);
  const height = (row: number): number => top - (rowCount <= 1 ? 0.5 : row / (rowCount - 1)) * TUBE_SPACE.height;
  // Never so narrow that it cannot be seen: a primer is a hundredth of a plasmid.
  const middle = (across(lens.from) + across(lens.to)) / 2;
  const half = Math.max(0.012, (across(lens.to) - across(lens.from)) / 2);
  const [high, low] = [height(Math.min(...lens.rows)) + 0.012, height(Math.max(...lens.rows)) - 0.012];
  return [[middle - half, high, 0], [middle + half, high, 0], [middle + half, low, 0], [middle - half, low, 0], [middle - half, high, 0]];
}

/** A molecule to draw: a ring for a circle, a bar for anything else, with what is marked on it. */
export interface StageMolecule {
  /** What it is called. */
  name: string;
  /** How many base pairs long it is. */
  length: number;
  /** Whether it is a circle. */
  circular: boolean;
  /** What is marked on it. `strand` is 1 if it points rightwards or clockwise, -1 the other way, 0 if it does not point. */
  features: readonly { start: number; end: number; strand: -1 | 0 | 1; tone: Meaning; label: string }[];
  /** Places on it to mark and name, such as where an enzyme cuts: the number of bases before each. */
  marks?: readonly { at: number; label: string }[];
}

type Point = [number, number, number];

/** A molecule worked out into lines in the scene. */
export interface PlacedMolecule {
  /** The backbone, as points along it. A circle's last point is its first. */
  backbone: Point[];
  /** Each stretch marked on it: the line to draw, a barb at the end it points to, and where to write its name. */
  features: { points: Point[]; barb: Point[] | null; tone: Meaning; label: string; at: Point }[];
  /** Each place marked: a short line across the backbone, and where to write its name. */
  marks: { points: Point[]; label: string; at: Point }[];
  /** Where to write what it is: the middle of a ring, under a bar. */
  middle: Point;
  /** What to call it there. */
  name: string;
  /** How long it is, said for a person. */
  size: string;
}

/**
 * Work a molecule out into lines, facing whoever is looking.
 *
 * A circle is read like a clock, from the top and clockwise, as a plasmid map is. Stretches that
 * overlap are drawn in lanes, the first on the backbone and the rest inside it, so both can be seen.
 *
 * @param molecule - What to draw.
 * @param centre - Where its middle is.
 * @param toward - Where it is looked at from: it is drawn flat on to there.
 * @param radius - A ring's radius, or half a bar's length, in metres.
 * @returns The lines, and where to write the names.
 */
export function placeMolecule(molecule: StageMolecule, centre: readonly [number, number, number], toward: readonly [number, number, number], radius: number): PlacedMolecule {
  const unit = (v: Point): Point => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
  const cross = (a: Point, b: Point): Point => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const facing = unit([toward[0] - centre[0], toward[1] - centre[1], toward[2] - centre[2]]);
  // Looked at from straight above, "up" on screen is away from the viewer along the floor.
  const right = unit(cross(Math.abs(facing[1]) > 0.98 ? [0, 0, -1] : [0, 1, 0], facing));
  const up = cross(facing, right);
  const at = (x: number, y: number): Point => [centre[0] + right[0] * x + up[0] * y, centre[1] + right[1] * x + up[1] * y, centre[2] + right[2] * x + up[2] * y];
  const length = Math.max(1, molecule.length);
  const lane = radius * 0.13;
  // Along the molecule at a position, `out` further from the backbone: outwards on a ring, upwards on a bar.
  const on = (position: number, out: number): Point => {
    if (!molecule.circular) return at((position / length) * 2 * radius - radius, out);
    const angle = (position / length) * 2 * Math.PI;
    return at(Math.sin(angle) * (radius + out), Math.cos(angle) * (radius + out));
  };
  const along = (from: number, to: number, out: number): Point[] => {
    const steps = Math.max(1, Math.ceil(((to - from) / length) * (molecule.circular ? 96 : 1)));
    return Array.from({ length: steps + 1 }, (_, step) => on(from + ((to - from) * step) / steps, out));
  };
  // Lanes: each stretch takes the first lane where it overlaps nothing already there.
  const taken: { start: number; end: number }[][] = [];
  const features = molecule.features.filter((one) => one.end > one.start && one.end <= length).map((one) => {
    let depth = taken.findIndex((row) => row.every((other) => one.end <= other.start || one.start >= other.end));
    if (depth === -1) { depth = Math.min(taken.length, 3); taken[depth] ??= []; }
    taken[depth]!.push(one);
    const out = molecule.circular ? -depth * lane : (depth + 0.6) * lane;
    const [tip, back] = one.strand === -1 ? [one.start, Math.min(one.end, one.start + length * 0.012)] : [one.end, Math.max(one.start, one.end - length * 0.012)];
    return {
      points: along(one.start, one.end, out), tone: one.tone, label: one.label,
      barb: one.strand === 0 ? null : [on(back, out + lane * 0.45), on(tip, out), on(back, out - lane * 0.45)],
      at: on((one.start + one.end) / 2, molecule.circular ? lane * 1.6 : out + lane * 1.1),
    };
  });
  return {
    backbone: along(0, length, 0), features,
    // A mark crosses the backbone and is named outside it, clear of the features inside.
    marks: (molecule.marks ?? []).filter((one) => one.at >= 0 && one.at <= length).map((one) => ({
      points: [on(one.at, -lane * 0.9), on(one.at, lane * 1.3)], label: one.label, at: on(one.at, molecule.circular ? lane * 2.4 : -lane * 1.5),
    })),
    middle: molecule.circular ? at(0, 0) : at(0, -lane * 2.6),
    name: molecule.name, size: `${molecule.length.toLocaleString("en-US")} bp`,
  };
}

/** A length to mark off under the strands in the tube: from one base to another, with what it comes to. */
export interface StageMeasure {
  /** Where it starts and ends, in bases along the template. */
  from: number;
  to: number;
  /** What to write under it, such as the subtraction that gives the length. */
  label: string;
}

/**
 * A measure worked out into a line to draw: a bar under the strands with a tick at each end.
 *
 * It is how a length is shown to be a difference of two positions: the bar's ends stand under the
 * bases it is measured between.
 *
 * @param measure - What to mark off.
 * @param length - How long the template is, in bases.
 * @param size - How wide, tall and deep the instrument is, in metres.
 * @param nth - Which measure this is, counting from 0, so that several sit one under another.
 * @returns The points of the line, in order, and where to write its label.
 */
export function measureLine(measure: StageMeasure, length: number, size: readonly [number, number, number], nth = 0): { points: [number, number, number][]; at: [number, number, number] } {
  const across = (base: number): number => (length <= 0 ? 0 : (base / length - 0.5) * TUBE_SPACE.width);
  const y = size[1] + TUBE_SPACE.above - 0.03 - nth * 0.03;
  const [left, right] = [across(Math.min(measure.from, measure.to)), across(Math.max(measure.from, measure.to))];
  const tick = 0.008;
  return { points: [[left, y + tick, 0], [left, y - tick, 0], [left, y, 0], [right, y, 0], [right, y + tick, 0], [right, y - tick, 0]], at: [(left + right) / 2, y - 0.012, 0] };
}

/** What each view is called for a model of instrument, where it differs from a thermocycler's. */
const VIEW_NAMES: Readonly<Record<string, Partial<Record<StageView, string>>>> = {
  "gel-station": { machine: "The gel box", block: "The gel", screen: "The power supply", tube: "In the tube", result: "The gel, run" },
  "heat-block": { machine: "The heat block", block: "The wells", screen: "The temperature", tube: "In the tube", result: "What it makes" },
  "shaking-incubator": { machine: "The incubator", block: "The flasks", screen: "The display", tube: "In the cells", result: "The gel" },
  spectrophotometer: { machine: "The machine", block: "The cuvette well", screen: "The reading", tube: "The light through it", result: "What it means" },
};

/**
 * What a view is called on its button, for a model of instrument.
 *
 * The five views are the same for every instrument: the machine, what is under its lid, what it
 * displays, what is in the tube, and the result. What they are called depends on the machine.
 *
 * @param model - The instrument's model.
 * @param view - The view.
 * @returns Its name.
 */
export function stageViewName(model: string, view: StageView): string {
  return VIEW_NAMES[model]?.[view] ?? STAGE_VIEW_NAMES[view];
}

/** A gel that has been run, to draw: lanes of bands, as somebody reading it would see them. */
export interface StageGel {
  /** The lanes, left to right. */
  lanes: readonly {
    /** What was loaded. */
    name: string;
    /** What its bands mean, which decides their colour. */
    tone: Meaning;
    /** Its bands: how far down each is, from 0 at the wells to 1 at the front; how bright, from 0 to 1; and what to write beside it. */
    bands: readonly { position: number; intensity: number; label: string }[];
  }[];
  /** How far the gel has run, from 0 (just loaded) to 1 (stopped). Bands are drawn that fraction of the way to where they end up. */
  ran?: number;
}

/** A gel worked out into lines in the scene. */
export interface PlacedGel {
  /** The slab's outline, as a closed line. */
  slab: Point[];
  /** Each well: a short line at the top of its lane. */
  wells: Point[][];
  /** Each band: the line to draw, how strongly, in what colour, and where to write its label. */
  bands: { points: Point[]; strength: number; tone: Meaning; label: string; at: Point; lane: number }[];
  /** Where to write each lane's name. */
  names: { name: string; at: Point }[];
}

/**
 * Work a gel out into lines, facing whoever is looking, wells at the top.
 *
 * @param gel - The lanes and their bands.
 * @param centre - Where the slab's middle is.
 * @param toward - Where it is looked at from.
 * @param size - How wide and tall the slab is, in metres.
 * @returns The lines. Labels of the first lane are written to its left and the rest to their right.
 */
export function placeGel(gel: StageGel, centre: readonly [number, number, number], toward: readonly [number, number, number], size: readonly [number, number]): PlacedGel {
  const unit = (v: Point): Point => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
  const cross = (a: Point, b: Point): Point => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const facing = unit([toward[0] - centre[0], toward[1] - centre[1], toward[2] - centre[2]]);
  const right = unit(cross(Math.abs(facing[1]) > 0.98 ? [0, 0, -1] : [0, 1, 0], facing));
  const up = cross(facing, right);
  const at = (x: number, y: number): Point => [centre[0] + right[0] * x + up[0] * y, centre[1] + right[1] * x + up[1] * y, centre[2] + right[2] * x + up[2] * y];
  const [w, h] = size;
  const lanes = Math.max(1, gel.lanes.length);
  const pitch = w / (lanes + 0.6);
  const half = pitch * 0.36;
  const x = (lane: number): number => (lane - (lanes - 1) / 2) * pitch;
  const [first, last] = [h / 2 - h * 0.1, -h / 2 + h * 0.06];
  const ran = Math.min(1, Math.max(0, gel.ran ?? 1));
  return {
    slab: [at(-w / 2, h / 2), at(w / 2, h / 2), at(w / 2, -h / 2), at(-w / 2, -h / 2), at(-w / 2, h / 2)],
    wells: gel.lanes.map((_, lane) => [at(x(lane) - half, first + h * 0.035), at(x(lane) + half, first + h * 0.035)]),
    names: gel.lanes.map((one, lane) => ({ name: one.name, at: at(x(lane), h / 2 + h * 0.06) })),
    bands: gel.lanes.flatMap((one, lane) => one.bands.map((band) => {
      const y = first + (last - first) * Math.min(1, Math.max(0, band.position)) * ran;
      return { points: [at(x(lane) - half, y), at(x(lane) + half, y)], strength: 0.35 + 0.65 * Math.min(1, Math.max(0, band.intensity)), tone: one.tone, label: band.label, lane,
               at: at(lane === 0 ? x(lane) - half - w * 0.02 : x(lane) + half + w * 0.02, y) };
    })),
  };
}

/** Pieces being joined, to draw: what is in the tube while a ligation is going on. */
/** Light going through a cuvette, for the one instrument whose whole job is how much came out. */
export interface StageBeam {
  /** The wavelength, in nanometres, which is what the light is drawn as. */
  nm: number;
  /** How much of it came out the other side, from 0 (none) to 1 (all of it). */
  through: number;
  /** What is in the cuvette. */
  what: string;
  /** Whether what is in there scatters the light out of the beam rather than absorbing it. */
  scatters?: boolean;
}

/** That, worked out: where the cuvette is, where the light goes, and how much of it is left at each step. */
export interface PlacedBeam {
  /** The cuvette's outline, as a closed line. */
  cuvette: Point[];
  /** What is in it, as a line across it where the liquid stands. */
  surface: Point[];
  /** The beam, in pieces from the lamp to the detector, each with how much light is left in it. */
  pieces: { points: [Point, Point]; strength: number }[];
  /** Light thrown out sideways, for something that scatters rather than absorbs. */
  scattered: [Point, Point][];
  /** The detector, as a short upright line the beam ends on. */
  detector: Point[];
  /** What to write, and where. */
  labels: { key: string; text: string; at: Point }[];
}

/**
 * Where to draw a beam of light going through a cuvette.
 *
 * The light is drawn in pieces so that it can fade along its path: what leaves the lamp is all of
 * it, what reaches the detector is `through` of it, and in between it falls the way it falls. That
 * picture is the whole of what the instrument does, and the number on its screen is the last piece.
 *
 * @param beam - The light and what is in the way of it.
 * @param centre - Where the middle of the cuvette goes.
 * @param toward - A point the picture should face, usually the camera.
 * @param size - How wide and tall to draw the whole thing, in metres.
 * @returns The cuvette, the light in pieces, and what to write.
 *
 * @example
 * ```ts
 * import { placeBeam } from "@biolibs/bionet-scene";
 *
 * placeBeam({ nm: 600, through: 0.25, what: "the culture", scatters: true }, centre, camera, [0.4, 0.26]);
 * ```
 */
export function placeBeam(beam: StageBeam, centre: readonly [number, number, number], toward: readonly [number, number, number],
                          size: readonly [number, number]): PlacedBeam {
  const unit = (v: Point): Point => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
  const cross = (a: Point, b: Point): Point => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const facing = unit([toward[0] - centre[0], toward[1] - centre[1], toward[2] - centre[2]]);
  const right = unit(cross(Math.abs(facing[1]) > 0.98 ? [0, 0, -1] : [0, 1, 0], facing));
  const up = cross(facing, right);
  const at = (x: number, y: number): Point => [centre[0] + right[0] * x + up[0] * y, centre[1] + right[1] * x + up[1] * y, centre[2] + right[2] * x + up[2] * y];
  const [w, h] = size;
  const [left, far] = [-w * 0.18, w * 0.18];
  const [lamp, detector] = [-w * 0.46, w * 0.46];
  const through = Math.min(1, Math.max(0, beam.through));
  // How much light is left at a point along the path: all of it before the cuvette, falling across
  // it the way light falls through a solution, and what is left of it after.
  const leftAt = (x: number): number =>
    x <= left ? 1 : x >= far ? through : through ** ((x - left) / (far - left));
  const PIECES = 26;
  const pieces = Array.from({ length: PIECES }, (_, index) => {
    const from = lamp + ((detector - lamp) * index) / PIECES;
    const to = lamp + ((detector - lamp) * (index + 1)) / PIECES;
    return { points: [at(from, 0), at(to, 0)] as [Point, Point], strength: leftAt((from + to) / 2) };
  });
  // A sample that scatters throws light out of the beam rather than swallowing it, which is the
  // difference between a culture and everything else read here, and the reason its number is not
  // an absorbance. It is drawn as the light leaving sideways.
  const scattered: [Point, Point][] = beam.scatters !== true ? [] : Array.from({ length: 8 }, (_, index) => {
    const x = left + ((far - left) * (index + 0.5)) / 8;
    const away = (index % 2 === 0 ? 1 : -1) * h * (0.22 + 0.12 * ((index * 7) % 3));
    return [at(x, 0), at(x + (index % 3) * w * 0.02 - w * 0.02, away)] as [Point, Point];
  });
  return {
    cuvette: [at(left, -h * 0.42), at(left, h * 0.42), at(far, h * 0.42), at(far, -h * 0.42), at(left, -h * 0.42)],
    surface: [at(left, h * 0.24), at(far, h * 0.24)],
    pieces, scattered,
    detector: [at(detector, -h * 0.2), at(detector, h * 0.2)],
    labels: [
      { key: "lamp", text: `${beam.nm} nm`, at: at(lamp, h * 0.16) },
      { key: "what", text: beam.what, at: at((left + far) / 2, -h * 0.52) },
      { key: "through", text: `${Math.round(through * 100)}% through`, at: at(detector, h * 0.3) },
    ],
  };
}

/** A reading set on a scale, with the range it has to be in marked on it. */
export interface StageScale {
  /** What the scale is of, written at its middle. */
  what: string;
  /** The ends of it. */
  from: number;
  to: number;
  /** Values to mark with a tick. */
  ticks: readonly number[];
  /** Bands on it that mean something: the range the instrument is linear over, the window to act in. */
  bands: readonly { from: number; to: number; label: string; tone: Meaning }[];
  /** Where the reading falls, and what to write there. */
  at: number;
  label: string;
}

/** That, worked out. */
export interface PlacedScale {
  /** The scale itself, as a line. */
  line: Point[];
  /** Each tick: the line to draw and where to write its value. */
  ticks: { points: Point[]; at: Point; label: string }[];
  /** Each band: the line along the scale, where to name it, and in what colour. */
  bands: { points: Point[]; at: Point; label: string; tone: Meaning }[];
  /** The pointer at the reading, and where its label goes. */
  pointer: Point[];
  /** Whether the reading is off the end of the scale, which is itself worth seeing. */
  beyond: boolean;
  /** What to write, and where. */
  labels: { key: string; text: string; at: Point }[];
}

/**
 * Where to draw a reading on a scale.
 *
 * One number on its own says nothing: 0.62 is a good place to induce E. coli and nowhere near
 * enough for Pichia, and 1.6 is not a reading at all. A scale with the ranges marked on it is the
 * number and what to make of it in the same picture, which is the whole job.
 *
 * @param scale - The scale, the bands on it and where the reading falls.
 * @param centre - Where the middle of it goes.
 * @param toward - A point it should face, usually the camera.
 * @param size - How wide and tall to draw it, in metres.
 * @returns The line, the ticks, the bands and the pointer.
 *
 * @example
 * ```ts
 * import { placeScale } from "@biolibs/bionet-scene";
 *
 * placeScale({ what: "600 nm", from: 0, to: 1, ticks: [0, 0.5, 1], at: 0.62, label: "0.62",
 *              bands: [{ from: 0.4, to: 0.8, label: "induce", tone: "good" }] }, centre, camera, [0.5, 0.2]);
 * ```
 */
export function placeScale(scale: StageScale, centre: readonly [number, number, number], toward: readonly [number, number, number],
                           size: readonly [number, number]): PlacedScale {
  const unit = (v: Point): Point => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
  const cross = (a: Point, b: Point): Point => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const facing = unit([toward[0] - centre[0], toward[1] - centre[1], toward[2] - centre[2]]);
  const right = unit(cross(Math.abs(facing[1]) > 0.98 ? [0, 0, -1] : [0, 1, 0], facing));
  const up = cross(facing, right);
  const at = (x: number, y: number): Point => [centre[0] + right[0] * x + up[0] * y, centre[1] + right[1] * x + up[1] * y, centre[2] + right[2] * x + up[2] * y];
  const [w, h] = size;
  const span = scale.to - scale.from || 1;
  // Where a value falls along the scale, kept on it so that a reading off the end is drawn at the
  // end rather than outside the picture — and said to be off the end, which is the point of it.
  const along = (value: number): number => (Math.min(scale.to, Math.max(scale.from, value)) - scale.from) / span * w - w / 2;
  const short = (value: number): string => `${Math.round(value * 100) / 100}`;
  return {
    line: [at(-w / 2, 0), at(w / 2, 0)],
    ticks: scale.ticks.map((value) => ({
      points: [at(along(value), -h * 0.12), at(along(value), h * 0.12)],
      at: at(along(value), -h * 0.3), label: short(value),
    })),
    bands: scale.bands.map((band) => ({
      points: [at(along(band.from), h * 0.26), at(along(band.to), h * 0.26)],
      at: at((along(band.from) + along(band.to)) / 2, h * 0.42), label: band.label, tone: band.tone,
    })),
    pointer: [at(along(scale.at), -h * 0.42), at(along(scale.at), h * 0.1)],
    beyond: scale.at > scale.to || scale.at < scale.from,
    labels: [
      { key: "reading", text: scale.label, at: at(along(scale.at), -h * 0.56) },
      { key: "what", text: scale.what, at: at(0, h * 0.68) },
    ],
  };
}

/** Pieces being joined, for the view into a tube where there are no strands to draw. */
export interface StageJoining {
  /** The pieces, in the order they go round or along the product. */
  pieces: readonly { name: string; length: number; flipped: boolean; tone: Meaning }[];
  /** What is written at each join, such as the overhang the two ends share. A circle has one for each piece, a line one fewer. */
  joins: readonly { label: string }[];
  /** Whether they close into a circle. */
  circular: boolean;
  /** How far along the joining is, from 0 (the pieces apart) to 1 (joined). */
  joined?: number;
}

/** Pieces worked out into lines in the scene. */
export interface PlacedJoining {
  /** Each piece: the line to draw, its colour, and where to write its name. */
  pieces: { points: Point[]; tone: Meaning; label: string; at: Point }[];
  /** Each join: where to write what it is made of, and a short line across it once it is closed. */
  joins: { label: string; at: Point; points: Point[]; closed: number }[];
}

/**
 * Work pieces being joined out into lines, facing whoever is looking.
 *
 * Each piece takes a share of the whole in proportion to its length, so the picture is to scale.
 * While they are apart there is a gap at every join, and the gaps close as the joining goes on: for
 * a circle that is the ring closing, which is the thing itself and not decoration.
 *
 * @param joining - The pieces and their joins.
 * @param centre - Where the middle is.
 * @param toward - Where it is looked at from: it is drawn flat on to there.
 * @param radius - A ring's radius, or half a line's length, in metres.
 * @returns The lines, and where to write the names.
 */
export function placeJoining(joining: StageJoining, centre: readonly [number, number, number], toward: readonly [number, number, number], radius: number): PlacedJoining {
  const unit = (v: Point): Point => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
  const cross = (a: Point, b: Point): Point => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const facing = unit([toward[0] - centre[0], toward[1] - centre[1], toward[2] - centre[2]]);
  const right = unit(cross(Math.abs(facing[1]) > 0.98 ? [0, 0, -1] : [0, 1, 0], facing));
  const up = cross(facing, right);
  const at = (x: number, y: number): Point => [centre[0] + right[0] * x + up[0] * y, centre[1] + right[1] * x + up[1] * y, centre[2] + right[2] * x + up[2] * y];
  const whole = Math.max(1, joining.pieces.reduce((sum, piece) => sum + Math.max(1, piece.length), 0));
  const joined = Math.min(1, Math.max(0, joining.joined ?? 1));
  // Apart, a fifth of the way round is gaps; joined, none of it is.
  const gaps = joining.circular ? joining.pieces.length : Math.max(0, joining.pieces.length - 1);
  const gap = gaps === 0 ? 0 : ((1 - joined) * 0.2) / gaps;
  const span = 1 - gap * gaps;
  // Along the whole, from 0 to 1: round a circle from the top clockwise, or left to right along a line.
  const on = (where: number, out = 0): Point => {
    if (!joining.circular) return at((where - 0.5) * 2 * radius, out);
    const angle = where * 2 * Math.PI;
    return at(Math.sin(angle) * (radius + out), Math.cos(angle) * (radius + out));
  };
  const line = (from: number, to: number, out = 0): Point[] => {
    const steps = joining.circular ? Math.max(2, Math.ceil((to - from) * 72)) : 1;
    return Array.from({ length: steps + 1 }, (_, step) => on(from + ((to - from) * step) / steps, out));
  };
  const pieces: PlacedJoining["pieces"] = [];
  const joins: PlacedJoining["joins"] = [];
  let where = joining.circular ? gap / 2 : 0;
  for (const [index, piece] of joining.pieces.entries()) {
    const takes = (Math.max(1, piece.length) / whole) * span;
    pieces.push({ points: line(where, where + takes), tone: piece.tone, label: `${piece.name}${piece.flipped ? " ↺" : ""}`,
                  at: on(where + takes / 2, joining.circular ? radius * 0.2 : -radius * 0.12) });
    where += takes;
    const join = joining.joins[index];
    // A join sits in the gap after its piece: before the next one, or back at the start for a circle.
    if (join !== undefined && (joining.circular || index < joining.pieces.length - 1)) {
      joins.push({ label: join.label, at: on(where + gap / 2, joining.circular ? -radius * 0.22 : radius * 0.16),
                   points: line(where, where + gap, 0), closed: joined });
      where += gap;
    }
  }
  return { pieces, joins };
}
