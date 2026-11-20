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
  /**
   * How loudly the piece's edges are drawn, against the rest of the thing. 1, the default, is as
   * loud as everything else.
   *
   * A scene of glowing edges spends its brightness on whatever has the most edges, not on whatever
   * matters most. Four bench legs are four thin boxes and forty-eight bright lines, so a row of
   * benches draws the eye to its legs rather than to what is standing on them. A piece that is
   * there because the thing would be wrong without it — a leg, a foot, a bracket — says so here,
   * and is drawn quietly until the thing it belongs to is the one being looked at.
   *
   * It quietens the edges and the skin together. Quietening only the edges leaves a solid block
   * with nothing outlining it, which reads as a box rather than as a leg.
   */
  loud?: number;
  /**
   * What this one piece is made of, where that is not what the rest of the thing is made of.
   *
   * Most of a thing is one material and takes the skin of the thing. The exceptions are the pieces
   * that are there precisely because they are a different material: the window in a fridge door,
   * the sash of a cabinet, the walls of a gel tank. Drawn in the same material as the case around
   * them they stop being windows, and the thing they were there to show goes with them.
   */
  skin?: string;
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
      { at: [0, 0.16, 0.36], size: [0.92, 0.12, 0.26], skin: "metal" },
      { at: [0, -0.2, -0.49], size: [0.66, 0.34, 0.02] },
      { at: [-0.3, 0.1, -0.455], size: [0.16, 0.07, 0.07], round: true, along: "x", skin: "metal" },
      { at: [0.3, 0.1, -0.455], size: [0.16, 0.07, 0.07], round: true, along: "x", skin: "metal" },
      { at: [0.36, 0.17, 0.3], size: [0.1, 0.1, 0.1], round: true, skin: "metal" },
      { at: [-0.4, -0.47, -0.36], size: [0.1, 0.06, 0.1], round: true, loud: 0.18 },
      { at: [0.4, -0.47, -0.36], size: [0.1, 0.06, 0.1], round: true, loud: 0.18 },
      { at: [-0.4, -0.47, 0.36], size: [0.1, 0.06, 0.1], round: true, loud: 0.18 },
      { at: [0.4, -0.47, 0.36], size: [0.1, 0.06, 0.1], round: true, loud: 0.18 },
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
      { at: [-0.18, -0.2, 0], size: [0.62, 0.6, 0.96], skin: "glass" },
      { at: [0.36, -0.05, -0.1], size: [0.26, 0.9, 0.6], skin: "metal" },
      { at: [-0.18, 0.02, 0], size: [0.5, 0.06, 0.8] },
      { at: [-0.44, 0.08, 0], size: [0.04, 0.3, 0.86] },
      { at: [0.08, 0.08, 0], size: [0.04, 0.3, 0.86] },
      { at: [-0.18, 0.14, -0.3], size: [0.46, 0.1, 0.03] },
      { at: [0.36, -0.12, 0.205], size: [0.1, 0.1, 0.06], round: true, along: "z", skin: "metal" },
      { at: [0.36, -0.3, 0.205], size: [0.05, 0.05, 0.04], round: true, along: "z", skin: "metal" },
      { at: [-0.4, -0.48, -0.4], size: [0.1, 0.04, 0.1], round: true, loud: 0.18 },
      { at: [0.04, -0.48, -0.4], size: [0.1, 0.04, 0.1], round: true, loud: 0.18 },
      { at: [-0.4, -0.48, 0.4], size: [0.1, 0.04, 0.1], round: true, loud: 0.18 },
      { at: [0.04, -0.48, 0.4], size: [0.1, 0.04, 0.1], round: true, loud: 0.18 },
    ],
    lid: { parts: [{ at: [-0.18, 0.22, 0], size: [0.6, 0.24, 0.94], skin: "glass" },
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
      { at: [0, 0.14, 0.4], size: [0.96, 0.12, 0.2], skin: "metal" },
      { at: [0, -0.22, -0.49], size: [0.7, 0.4, 0.02] },
      { at: [0, 0.06, -0.1], size: [0.84, 0.04, 0.7], skin: "metal" },
      { at: [-0.3, 0.13, -0.47], size: [0.18, 0.06, 0.06], round: true, along: "x", skin: "metal" },
      { at: [0.3, 0.13, -0.47], size: [0.18, 0.06, 0.06], round: true, along: "x", skin: "metal" },
      { at: [0.4, 0.15, 0.4], size: [0.09, 0.09, 0.09], round: true, skin: "metal" },
      { at: [-0.42, -0.48, -0.42], size: [0.1, 0.04, 0.1], round: true, loud: 0.18 },
      { at: [0.42, -0.48, -0.42], size: [0.1, 0.04, 0.1], round: true, loud: 0.18 },
      { at: [-0.42, -0.48, 0.42], size: [0.1, 0.04, 0.1], round: true, loud: 0.18 },
      { at: [0.42, -0.48, 0.42], size: [0.1, 0.04, 0.1], round: true, loud: 0.18 },
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
      { at: [0, 0.1, 0.42], size: [0.56, 0.2, 0.16], skin: "metal" },
      { at: [0, 0.06, -0.02], size: [0.76, 0.05, 0.76], round: true, skin: "metal" },
      { at: [0, 0.13, -0.02], size: [0.1, 0.12, 0.1], round: true, skin: "metal" },
      { at: [0.34, 0.08, 0.42], size: [0.1, 0.1, 0.08], round: true, along: "z", skin: "metal" },
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
      { at: [0, -0.42, 0.04], size: [0.82, 0.16, 0.9], skin: "metal" },
      { at: [0, -0.42, -0.38], size: [0.2, 0.1, 0.1], round: true, along: "z", skin: "glass" },
      { at: [0, 0.02, -0.3], size: [0.3, 0.84, 0.3], skin: "metal" },
      { at: [0, -0.12, 0.08], size: [0.66, 0.06, 0.5] },
      { at: [0, -0.26, 0.08], size: [0.16, 0.16, 0.16], round: true, skin: "glass" },
      { at: [0, -0.02, 0.04], size: [0.22, 0.1, 0.22], round: true, skin: "metal" },
      { at: [-0.06, -0.1, 0.04], size: [0.07, 0.14, 0.07], round: true, skin: "glass" },
      { at: [0.06, -0.1, 0.04], size: [0.07, 0.14, 0.07], round: true, skin: "glass" },
      { at: [-0.2, 0.06, -0.3], size: [0.12, 0.12, 0.12], round: true, along: "x", skin: "metal" },
      { at: [0.2, 0.06, -0.3], size: [0.12, 0.12, 0.12], round: true, along: "x", skin: "metal" },
      { at: [0, 0.3, -0.14], size: [0.26, 0.18, 0.3], skin: "metal" },
      { at: [-0.07, 0.36, 0.08], size: [0.1, 0.1, 0.22], round: true, along: "z", skin: "glass" },
      { at: [0.07, 0.36, 0.08], size: [0.1, 0.1, 0.22], round: true, along: "z", skin: "glass" },
    ],
  },
  // A case with a lid over the cuvette well, and a sloped panel at the front. What it reads is one
  // number — how much light got through — which is how dense a culture is and how much DNA is in a
  // drop. The well is the whole instrument; everything else on it is for setting the wavelength.
  spectrophotometer: {
    body: [
      { at: [0, -0.22, 0], size: [1, 0.56, 1] },
      { at: [0, 0.14, 0.36], size: [0.96, 0.14, 0.28], skin: "metal" },
      { at: [0, -0.22, -0.49], size: [0.6, 0.3, 0.02] },
      { at: [-0.22, 0.06, -0.1], size: [0.34, 0.06, 0.44], skin: "metal" },
      { at: [-0.22, 0.08, -0.1], size: [0.1, 0.12, 0.1] },
      { at: [0.3, 0.16, 0.3], size: [0.1, 0.1, 0.1], round: true, skin: "metal" },
      { at: [-0.4, 0.1, -0.35], size: [0.14, 0.06, 0.06], round: true, along: "x", skin: "metal" },
      { at: [-0.04, 0.1, -0.35], size: [0.14, 0.06, 0.06], round: true, along: "x", skin: "metal" },
      { at: [-0.42, -0.47, -0.38], size: [0.1, 0.06, 0.1], round: true, loud: 0.18 },
      { at: [0.42, -0.47, -0.38], size: [0.1, 0.06, 0.1], round: true, loud: 0.18 },
      { at: [-0.42, -0.47, 0.38], size: [0.1, 0.06, 0.1], round: true, loud: 0.18 },
      { at: [0.42, -0.47, 0.38], size: [0.1, 0.06, 0.1], round: true, loud: 0.18 },
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
      { at: [0, 0.18, 0], size: [0.9, 0.16, 0.9], skin: "metal" },
      { at: [-0.25, 0.3, 0.1], size: [0.26, 0.08, 0.3] },
      { at: [0.28, 0.32, -0.12], size: [0.22, 0.1, 0.22], round: true, skin: "metal" },
      { at: [0.28, 0.32, 0.24], size: [0.12, 0.08, 0.12], round: true, skin: "metal" },
      { at: [0, -0.2, -0.49], size: [0.5, 0.3, 0.02] },
      { at: [-0.4, -0.47, -0.4], size: [0.1, 0.06, 0.1], round: true, loud: 0.18 },
      { at: [0.4, -0.47, -0.4], size: [0.1, 0.06, 0.1], round: true, loud: 0.18 },
      { at: [-0.4, -0.47, 0.4], size: [0.1, 0.06, 0.1], round: true, loud: 0.18 },
      { at: [0.4, -0.47, 0.4], size: [0.1, 0.06, 0.1], round: true, loud: 0.18 },
    ],
    screen: { at: [-0.1, 0.3, 0.46], size: [0.4, 0.12], leans: 0 },
  },
  // A tank of water held at a temperature, with a rack of tube positions standing in it. A heat
  // shock is thirty seconds in one of these, and so is most of what an enzyme is left to do.
  "water-bath": {
    body: [
      { at: [0, -0.2, 0], size: [1, 0.6, 1] },
      { at: [0, 0.1, 0.42], size: [0.9, 0.16, 0.16], skin: "metal" },
      { at: [0, 0, -0.04], size: [0.82, 0.02, 0.78], skin: "metal" },
      { at: [0.4, 0.12, 0.42], size: [0.12, 0.12, 0.1], round: true, skin: "metal" },
      { at: [-0.4, -0.48, -0.4], size: [0.1, 0.04, 0.1], round: true, loud: 0.18 },
      { at: [0.4, -0.48, -0.4], size: [0.1, 0.04, 0.1], round: true, loud: 0.18 },
      { at: [-0.4, -0.48, 0.4], size: [0.1, 0.04, 0.1], round: true, loud: 0.18 },
      { at: [0.4, -0.48, 0.4], size: [0.1, 0.04, 0.1], round: true, loud: 0.18 },
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
      { at: [0, -0.38, 0.06], size: [1, 0.24, 0.86], skin: "metal" },
      { at: [0, -0.22, -0.08], size: [0.5, 0.08, 0.5], round: true, skin: "metal" },
      { at: [-0.44, 0.06, -0.08], size: [0.04, 0.64, 0.7], skin: "glass" },
      { at: [0.44, 0.06, -0.08], size: [0.04, 0.64, 0.7], skin: "glass" },
      { at: [0, 0.06, -0.42], size: [0.88, 0.64, 0.04], skin: "glass" },
      { at: [0, 0.36, -0.08], size: [0.88, 0.04, 0.7], skin: "glass" },
      { at: [0, -0.3, 0.46], size: [0.34, 0.12, 0.06], skin: "metal" },
      { at: [-0.38, -0.48, 0.4], size: [0.1, 0.04, 0.1], round: true, loud: 0.18 },
      { at: [0.38, -0.48, 0.4], size: [0.1, 0.04, 0.1], round: true, loud: 0.18 },
      { at: [0, -0.48, -0.3], size: [0.1, 0.04, 0.1], round: true, loud: 0.18 },
    ],
    screen: { at: [0, -0.3, 0.5], size: [0.28, 0.08], leans: 0 },
  },
  // A cup on a heavy foot that shakes whatever is pressed into it. Small, and in constant use.
  vortex: {
    body: [
      { at: [0, -0.2, 0], size: [1, 0.6, 1], skin: "metal" },
      { at: [0, 0.18, -0.1], size: [0.6, 0.16, 0.6], round: true, skin: "metal" },
      { at: [0.3, 0.1, 0.36], size: [0.26, 0.26, 0.2], round: true, along: "z", skin: "metal" },
      { at: [-0.3, 0.1, 0.42], size: [0.24, 0.1, 0.06], skin: "metal" },
      { at: [-0.38, -0.48, -0.38], size: [0.14, 0.04, 0.14], round: true, loud: 0.18 },
      { at: [0.38, -0.48, -0.38], size: [0.14, 0.04, 0.14], round: true, loud: 0.18 },
      { at: [-0.38, -0.48, 0.38], size: [0.14, 0.04, 0.14], round: true, loud: 0.18 },
      { at: [0.38, -0.48, 0.38], size: [0.14, 0.04, 0.14], round: true, loud: 0.18 },
    ],
  },
  // A dark hood over a lit surface, with a camera looking down into it. The gel station runs the
  // gel; this is the thing that makes a picture of it, which is what the result of a digest is.
  "gel-imager": {
    body: [
      { at: [0, -0.22, 0], size: [1, 0.56, 1], skin: "metal" },
      { at: [0, 0.06, 0], size: [0.8, 0.02, 0.8], skin: "glass" },
      { at: [-0.46, 0.18, 0], size: [0.08, 0.5, 0.9], skin: "hood" },
      { at: [0.46, 0.18, 0], size: [0.08, 0.5, 0.9], skin: "hood" },
      { at: [0, 0.18, -0.45], size: [0.92, 0.5, 0.1], skin: "hood" },
      { at: [0, 0.46, 0], size: [0.92, 0.08, 0.9], skin: "hood" },
      { at: [0, 0.32, 0], size: [0.18, 0.2, 0.18], round: true, skin: "metal" },
      { at: [0, 0.18, 0.44], size: [0.88, 0.46, 0.04] },
      { at: [0.3, 0.18, 0.47], size: [0.06, 0.2, 0.05], round: true, skin: "metal" },
    ],
    screen: { at: [-0.28, -0.3, 0.5], size: [0.3, 0.1], leans: 0 },
  },
  // A cabinet with a glass door and shelves, holding one temperature. Plates go in after a
  // transformation and come out with colonies on them, which is the step a strain begins at.
  incubator: {
    body: [
      { at: [0, -0.02, -0.05], size: [1, 0.96, 0.9] },
      { at: [0, -0.06, 0.44], size: [0.96, 0.8, 0.06] },
      { at: [0, -0.06, 0.47], size: [0.6, 0.56, 0.02], skin: "glass" },
      { at: [0.4, -0.06, 0.47], size: [0.06, 0.26, 0.06], round: true, skin: "metal" },
      { at: [0, 0.42, 0.44], size: [0.96, 0.14, 0.08], skin: "metal" },
      { at: [0, -0.2, -0.05], size: [0.84, 0.02, 0.78] },
      { at: [0, 0.04, -0.05], size: [0.84, 0.02, 0.78] },
      { at: [0, 0.26, -0.05], size: [0.84, 0.02, 0.78] },
      { at: [-0.42, -0.485, -0.38], size: [0.1, 0.03, 0.1], round: true, loud: 0.18 },
      { at: [0.42, -0.485, -0.38], size: [0.1, 0.03, 0.1], round: true, loud: 0.18 },
      { at: [-0.42, -0.485, 0.38], size: [0.1, 0.03, 0.1], round: true, loud: 0.18 },
      { at: [0.42, -0.485, 0.38], size: [0.1, 0.03, 0.1], round: true, loud: 0.18 },
    ],
    screen: { at: [0, 0.42, 0.49], size: [0.4, 0.1], leans: 0 },
  },
  // A hood on a stand with a sash that slides down: air pulled through the grille at the front and
  // filtered out of the top, so that what is on the work surface stays what was put there.
  "biosafety-cabinet": {
    body: [
      { at: [0, -0.32, 0], size: [1, 0.36, 1], skin: "metal" },
      { at: [0, 0.14, -0.04], size: [1, 0.56, 0.92] },
      { at: [0, 0.42, 0], size: [1, 0.16, 1], skin: "metal" },
      { at: [0, -0.12, 0], size: [0.96, 0.04, 0.96], skin: "metal" },
      { at: [0, -0.09, 0.44], size: [0.9, 0.03, 0.08] },
      { at: [0, 0.14, 0.46], size: [0.94, 0.42, 0.03], skin: "glass" },
      { at: [0, -0.06, 0.46], size: [0.3, 0.04, 0.04], round: true, along: "x", skin: "metal" },
      { at: [-0.42, 0.44, 0.46], size: [0.1, 0.1, 0.04], round: true, along: "z", skin: "metal" },
      { at: [-0.44, -0.46, -0.4], size: [0.1, 0.08, 0.1], round: true, loud: 0.18 },
      { at: [0.44, -0.46, -0.4], size: [0.1, 0.08, 0.1], round: true, loud: 0.18 },
      { at: [-0.44, -0.46, 0.4], size: [0.1, 0.08, 0.1], round: true, loud: 0.18 },
      { at: [0.44, -0.46, 0.4], size: [0.1, 0.08, 0.1], round: true, loud: 0.18 },
    ],
    screen: { at: [0.34, 0.44, 0.5], size: [0.26, 0.08], leans: 0 },
  },
  // A pressure vessel with a round door and a wheel to lock it. Everything that goes into a lab
  // sterile goes through one, and everything that comes out of it alive goes back through.
  autoclave: {
    body: [
      { at: [0, -0.04, -0.04], size: [1, 0.92, 0.92] },
      { at: [0, -0.08, 0.44], size: [0.66, 0.66, 0.06], round: true, along: "z" },
      { at: [0, -0.08, 0.48], size: [0.3, 0.3, 0.04], round: true, along: "z", skin: "metal" },
      { at: [0, 0.38, 0.44], size: [0.9, 0.16, 0.06], skin: "metal" },
      { at: [0.36, -0.4, 0.46], size: [0.1, 0.1, 0.06], round: true, along: "z", skin: "metal" },
      { at: [-0.4, -0.46, -0.38], size: [0.12, 0.08, 0.12], round: true, loud: 0.18 },
      { at: [0.4, -0.46, -0.38], size: [0.12, 0.08, 0.12], round: true, loud: 0.18 },
      { at: [-0.4, -0.46, 0.38], size: [0.12, 0.08, 0.12], round: true, loud: 0.18 },
      { at: [0.4, -0.46, 0.38], size: [0.12, 0.08, 0.12], round: true, loud: 0.18 },
    ],
    screen: { at: [0, 0.38, 0.48], size: [0.4, 0.1], leans: 0 },
  },
  // A metal block with two rows of holes for tubes, a dial, and a small display on its base.
  "heat-block": {
    body: [
      { at: [0, -0.26, 0], size: [1, 0.48, 1] },
      { at: [0, 0.02, 0], size: [0.86, 0.16, 0.86], skin: "metal" },
      { at: [-0.34, -0.24, 0.46], size: [0.18, 0.18, 0.08], round: true, along: "z", skin: "metal" },
      { at: [0.38, -0.4, 0.46], size: [0.07, 0.07, 0.06], round: true, along: "z", skin: "metal" },
    ],
    screen: { at: [0.06, -0.18, 0.5], size: [0.3, 0.14], leans: 0 },
    block: { at: [0, 0.1, 0], size: [0.72, 0.6], rows: 2, columns: 6 },
  },
};

/**
 * What the things that are not instruments are made of, by what kind of thing they are.
 *
 * A bench, a freezer and a fridge are not models of anything — a lab has a bench, not a bench of a
 * particular make — so they are shaped by kind. They were drawn as plain boxes until now, which is
 * the right drawing of a cupboard nobody has looked at and the wrong drawing of the three things a
 * lab is mostly made of.
 */
const BY_KIND: Readonly<Record<string, Shape>> = {
  // A worktop on legs, with a splashback behind it, shelves under it and drawers in it. Everything
  // on this bench stands on the worktop, so the worktop is where its height comes from.
  bench: {
    body: [
      { at: [0, 0.42, 0], size: [1, 0.09, 1] },
      { at: [0, 0.455, -0.46], size: [1, 0.09, 0.07] },
      { at: [0, 0.02, -0.02], size: [0.94, 0.03, 0.86] },
      { at: [0, -0.26, -0.02], size: [0.94, 0.03, 0.86] },
      { at: [-0.46, -0.06, -0.4], size: [0.05, 0.88, 0.06], loud: 0.18 },
      { at: [0.46, -0.06, -0.4], size: [0.05, 0.88, 0.06], loud: 0.18 },
      { at: [-0.46, -0.06, 0.4], size: [0.05, 0.88, 0.06], loud: 0.18 },
      { at: [0.46, -0.06, 0.4], size: [0.05, 0.88, 0.06], loud: 0.18 },
      { at: [-0.26, 0.28, 0.45], size: [0.36, 0.17, 0.04] },
      { at: [0.26, 0.28, 0.45], size: [0.36, 0.17, 0.04] },
      { at: [-0.26, 0.28, 0.48], size: [0.18, 0.03, 0.03], round: true, along: "x" },
      { at: [0.26, 0.28, 0.48], size: [0.18, 0.03, 0.03], round: true, along: "x" },
    ],
  },
  // An upright cabinet on castors with one heavy door, a long handle, a vent at the bottom and a
  // panel at the top. It is the thing a lab is arranged around: everything else in the room is for
  // putting something into it or getting something out of it.
  freezer: {
    body: [
      { at: [0, 0.02, -0.04], size: [1, 0.92, 0.92] },
      { at: [0, -0.02, 0.45], size: [0.96, 0.8, 0.05] },
      { at: [0, -0.02, 0.475], size: [0.82, 0.68, 0.02] },
      { at: [0.36, -0.02, 0.48], size: [0.06, 0.44, 0.04], round: true, skin: "metal" },
      { at: [-0.46, 0.26, 0.44], size: [0.07, 0.07, 0.07], round: true, along: "x", skin: "metal" },
      { at: [-0.46, -0.3, 0.44], size: [0.07, 0.07, 0.07], round: true, along: "x", skin: "metal" },
      { at: [0, 0.42, 0.45], size: [0.6, 0.12, 0.06], skin: "metal" },
      { at: [0, -0.4, 0.45], size: [0.8, 0.07, 0.06] },
      { at: [-0.4, -0.47, -0.34], size: [0.1, 0.06, 0.1], round: true, loud: 0.18 },
      { at: [0.4, -0.47, -0.34], size: [0.1, 0.06, 0.1], round: true, loud: 0.18 },
      { at: [-0.4, -0.47, 0.34], size: [0.1, 0.06, 0.1], round: true, loud: 0.18 },
      { at: [0.4, -0.47, 0.34], size: [0.1, 0.06, 0.1], round: true, loud: 0.18 },
    ],
    screen: { at: [0, 0.42, 0.49], size: [0.4, 0.08], leans: 0 },
  },
  // The same cabinet with a window in the door and the shelves behind it, and the compressor on
  // top rather than underneath. What is in a fridge is meant to be found without opening it.
  fridge: {
    body: [
      { at: [0, 0, -0.04], size: [1, 0.9, 0.92] },
      { at: [0, -0.04, 0.45], size: [0.96, 0.78, 0.05] },
      { at: [0, -0.04, 0.475], size: [0.7, 0.6, 0.02], skin: "glass" },
      { at: [0.36, -0.04, 0.48], size: [0.05, 0.4, 0.04], round: true, skin: "metal" },
      { at: [-0.46, 0.22, 0.44], size: [0.07, 0.07, 0.07], round: true, along: "x", skin: "metal" },
      { at: [-0.46, -0.3, 0.44], size: [0.07, 0.07, 0.07], round: true, along: "x", skin: "metal" },
      { at: [0, 0.2, -0.04], size: [0.86, 0.02, 0.84] },
      { at: [0, 0, -0.04], size: [0.86, 0.02, 0.84] },
      { at: [0, -0.2, -0.04], size: [0.86, 0.02, 0.84] },
      { at: [0, 0.42, 0.45], size: [0.3, 0.1, 0.06], skin: "metal" },
      { at: [0, 0.46, -0.2], size: [0.7, 0.08, 0.4], skin: "metal" },
      { at: [-0.4, -0.47, -0.34], size: [0.09, 0.06, 0.09], round: true, loud: 0.18 },
      { at: [0.4, -0.47, -0.34], size: [0.09, 0.06, 0.09], round: true, loud: 0.18 },
      { at: [-0.4, -0.47, 0.34], size: [0.09, 0.06, 0.09], round: true, loud: 0.18 },
      { at: [0.4, -0.47, 0.34], size: [0.09, 0.06, 0.09], round: true, loud: 0.18 },
    ],
    screen: { at: [0, 0.42, 0.49], size: [0.22, 0.07], leans: 0 },
  },
};

/**
 * What a place is made of: by model for an instrument, by kind for everything else that has a shape.
 *
 * @param place - What kind of place it is, and which model of instrument where it is one.
 * @returns Its shape, or `null` for a place that is drawn as a plain box — a room, a shelf, a rack,
 *   a box of positions, and anything a lab has invented a kind for.
 *
 * @example
 * ```ts
 * import { shapeFor } from "@biolibs/bionet-scene";
 *
 * shapeFor({ kind: "bench" })?.body.length;                              // a worktop, legs, shelves, drawers
 * shapeFor({ kind: "instrument", model: "thermocycler" })?.lid?.opens;   // 78
 * shapeFor({ kind: "room" });                                            // null
 * ```
 */
export function shapeFor(place: { kind: string; model?: string | undefined }): Shape | null {
  if (place.kind === "instrument") return shapeOf(place.model);
  return Object.hasOwn(BY_KIND, place.kind) ? BY_KIND[place.kind]! : null;
}

/**
 * How to scale a round piece so that it comes out round.
 *
 * A piece is written as fractions of the instrument it belongs to, and the instrument is drawn by
 * scaling the whole of it to its own size in metres. That scaling is not even — an autoclave is
 * 0.7 m wide and 1.2 m tall — and it happens after the piece has been turned, so a disc written as
 * a circle of fractions comes out an ellipse of metres: the autoclave's door was drawn 792 mm one
 * way and 462 mm the other.
 *
 * So a round piece's cross-section is given one diameter in metres and scaled back into fractions
 * on each axis. The diameter is the smaller of the two the piece was written with, because a piece
 * has to stay inside the box it was given a size for.
 *
 * @param part - The piece, with its size as fractions of the instrument.
 * @param within - How wide, tall and deep the instrument is, in metres.
 * @returns The scale to draw the cylinder at, in the cylinder's own axes: across, along, across.
 *
 * @example
 * ```ts
 * import { roundScale } from "@biolibs/bionet-scene";
 *
 * // An autoclave's door: a circle of 462 mm, not an ellipse of 792 by 462.
 * roundScale({ at: [0, 0, 0.44], size: [0.66, 0.66, 0.06], round: true, along: "z" }, [0.7, 1.2, 0.8]);
 * ```
 */
export function roundScale(part: Part, within: readonly [number, number, number]): [number, number, number] {
  const along = part.along ?? "y";
  // The two axes the cross-section lies in, and the one the piece runs along.
  const [first, second] = along === "y" ? [0, 2] as const : along === "x" ? [1, 2] as const : [0, 1] as const;
  const length = along === "y" ? 1 : along === "x" ? 0 : 2;
  const across = Math.min(part.size[first]! * within[first]!, part.size[second]! * within[second]!);
  // A cylinder is modelled across x and z and along y, whatever it is turned to afterwards.
  const safe = (metres: number): number => (metres > 0 ? across / metres : 0);
  return [safe(within[first]!), part.size[length]!, safe(within[second]!)];
}

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
  electroporator: { machine: "The machine", block: "The cuvette", screen: "The pulse", tube: "In the cuvette", result: "What grew" },
  "gel-imager": { machine: "The machine", block: "The gel on the light", screen: "The exposure", tube: "What the bands hold", result: "Against what was expected" },
  centrifuge: { machine: "The machine", block: "The rotor", screen: "The speed", tube: "What separates", result: "What it leaves" },
  incubator: { machine: "The machine", block: "The shelves", screen: "The temperature", tube: "On the plate", result: "What came up" },
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

/** The field between two electrodes, for the machine that puts DNA in by breaking cells open. */
export interface StageField {
  /** The gap between the electrodes, in millimetres. */
  gap: number;
  /** The field across it, in kilovolts per centimetre, which is what the cells are in. */
  strength: number;
  /** The field this host is usually given, for drawing the one set against it, or `null` if unknown. */
  usual: number | null;
  /** How many cells to draw. */
  cells: number;
  /** How many of them took something up. */
  taken: number;
}

/** That, worked out. */
export interface PlacedField {
  /** The two electrodes, each as a line. */
  electrodes: [Point[], Point[]];
  /** The field between them, as lines across the gap, each at the strength it is drawn at. */
  lines: { points: [Point, Point]; strength: number }[];
  /** The cells in it: a ring each, whether it took something up, and the DNA going in if it did. */
  cells: { ring: Point[]; taken: boolean; dna: [Point, Point] | null }[];
  /** The gap, marked off under them. */
  measure: { points: Point[]; at: Point };
  /** What to write, and where. */
  labels: { key: string; text: string; at: Point }[];
}

/**
 * Where to draw the field inside a cuvette.
 *
 * What a protocol writes down is a voltage; what the cells are in is a field, which is that voltage
 * over the gap. Drawing the gap with its measurement beside the field it makes is the one picture
 * that keeps those two apart, which is the thing people get wrong when they carry a voltage over
 * from a protocol written for another cuvette.
 *
 * @param field - The gap, the field, and the cells in it.
 * @param centre - Where the middle of the cuvette goes.
 * @param toward - A point it should face, usually the camera.
 * @param size - How wide and tall to draw the whole thing, in metres.
 * @returns The electrodes, the field lines, the cells and the gap.
 *
 * @example
 * ```ts
 * import { placeField } from "@biolibs/bionet-scene";
 *
 * placeField({ gap: 2, strength: 7.5, usual: 7.5, cells: 14, taken: 2 }, centre, camera, [0.5, 0.3]);
 * ```
 */
export function placeField(field: StageField, centre: readonly [number, number, number], toward: readonly [number, number, number],
                           size: readonly [number, number]): PlacedField {
  const unit = (v: Point): Point => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
  const cross = (a: Point, b: Point): Point => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const facing = unit([toward[0] - centre[0], toward[1] - centre[1], toward[2] - centre[2]]);
  const right = unit(cross(Math.abs(facing[1]) > 0.98 ? [0, 0, -1] : [0, 1, 0], facing));
  const up = cross(facing, right);
  const at = (x: number, y: number): Point => [centre[0] + right[0] * x + up[0] * y, centre[1] + right[1] * x + up[1] * y, centre[2] + right[2] * x + up[2] * y];
  const [w, h] = size;
  // The gap is drawn to scale against the others a lab has, so a 4 mm cuvette looks twice a 2 mm one.
  const across = (w * 0.76 * Math.min(4, Math.max(1, field.gap))) / 4;
  const [left, far] = [-across / 2, across / 2];
  // How hard the field is drawn: against the one this host is usually given, where that is known.
  const hard = field.usual === null || field.usual <= 0 ? 0.7 : Math.min(1.3, field.strength / field.usual) / 1.3;
  // Enough of them, drawn thinly, to read as a field rather than as the rungs of a ladder.
  const LINES = 13;
  const lines = Array.from({ length: LINES }, (_, index) => {
    const y = h * 0.34 * (1 - (2 * index) / (LINES - 1));
    return { points: [at(left, y), at(far, y)] as [Point, Point], strength: Math.max(0.08, hard) };
  });
  // A ring of twelve, which reads as round without being a circle of a hundred points.
  const ring = (x: number, y: number, radius: number): Point[] =>
    Array.from({ length: 13 }, (_, index) => {
      const angle = (index / 12) * Math.PI * 2;
      return at(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
    });
  const many = Math.max(0, Math.min(40, Math.floor(field.cells)));
  const columns = Math.max(1, Math.ceil(Math.sqrt(many * (across / (h * 0.6)))));
  const rows = Math.max(1, Math.ceil(many / columns));
  const radius = Math.min(across / (columns * 3.2), (h * 0.6) / (rows * 3.2));
  const cells = Array.from({ length: many }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = left + (across * (column + 0.5)) / columns;
    const y = h * 0.3 - (h * 0.6 * (row + 0.5)) / rows;
    const taken = index < Math.max(0, Math.min(many, Math.floor(field.taken)));
    return {
      ring: ring(x, y, radius), taken,
      dna: taken ? [at(x - radius * 2.4, y + radius * 1.4), at(x, y)] as [Point, Point] : null,
    };
  });
  return {
    electrodes: [[at(left, h * 0.46), at(left, -h * 0.46)], [at(far, h * 0.46), at(far, -h * 0.46)]],
    lines, cells,
    measure: { points: [at(left, -h * 0.54), at(far, -h * 0.54)], at: at(0, -h * 0.66) },
    labels: [
      { key: "gap", text: `${field.gap} mm`, at: at(0, -h * 0.66) },
      { key: "field", text: `${field.strength} kV/cm`, at: at(0, h * 0.6) },
      ...(field.taken > 0 ? [{ key: "taken", text: `${field.taken} of ${many} took it up`, at: at(0, -h * 0.9) }] : []),
    ],
  };
}

/** A lane of a gel as a profile along it, which is where an exposure that has burnt out shows. */
export interface StageTrace {
  /** What the lane is, written over it. */
  what: string;
  /** The brightness along the lane, from the wells to the front, each from 0 to 1. */
  along: readonly number[];
  /** Where the camera stops being able to record a greater brightness, from 0 to 1. */
  ceiling: number;
  /** The bands on it: where along, what to call them, and whether they are at the ceiling. */
  marks: readonly { at: number; label: string; saturated: boolean }[];
}

/** That, worked out. */
export interface PlacedTrace {
  /** The lane's own line, from the wells to the front. */
  axis: Point[];
  /** The profile, as a line. */
  curve: Point[];
  /** The ceiling, as a line across it. */
  ceiling: Point[];
  /** Each band: a tick up from the axis, where to write it, and whether it is at the ceiling. */
  marks: { points: Point[]; at: Point; label: string; saturated: boolean }[];
  /** What to write, and where. */
  labels: { key: string; text: string; at: Point }[];
}

/**
 * Where to draw a lane as a profile along it.
 *
 * A photograph of a gel shows a band as bright or not bright. It cannot show that a band is at the
 * top of what the camera can record, because a band at the top and a band well past the top look
 * exactly the same — brighter, and no more. Drawn as a profile they do not: one is a peak and the
 * other is a peak with its top cut off, against a line that says where the cut is.
 *
 * @param trace - The profile, the ceiling, and the bands on it.
 * @param centre - Where the middle of it goes.
 * @param toward - A point it should face, usually the camera.
 * @param size - How wide and tall to draw it, in metres.
 * @returns The axis, the profile, the ceiling and the bands.
 *
 * @example
 * ```ts
 * import { placeTrace } from "@biolibs/bionet-scene";
 *
 * placeTrace({ what: "the cut lane", along, ceiling: 0.98, marks }, centre, camera, [0.6, 0.3]);
 * ```
 */
export function placeTrace(trace: StageTrace, centre: readonly [number, number, number], toward: readonly [number, number, number],
                           size: readonly [number, number]): PlacedTrace {
  const unit = (v: Point): Point => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
  const cross = (a: Point, b: Point): Point => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const facing = unit([toward[0] - centre[0], toward[1] - centre[1], toward[2] - centre[2]]);
  const right = unit(cross(Math.abs(facing[1]) > 0.98 ? [0, 0, -1] : [0, 1, 0], facing));
  const up = cross(facing, right);
  const at = (x: number, y: number): Point => [centre[0] + right[0] * x + up[0] * y, centre[1] + right[1] * x + up[1] * y, centre[2] + right[2] * x + up[2] * y];
  const [w, h] = size;
  const floor = -h * 0.34;
  const tall = h * 0.68;
  const along = (fraction: number): number => (Math.min(1, Math.max(0, fraction)) - 0.5) * w;
  const high = (value: number): number => floor + Math.min(1, Math.max(0, value)) * tall;
  const ceiling = Math.min(1, Math.max(0, trace.ceiling));
  // A profile of one point is a point, not a line; two make the shortest line there is.
  const points = trace.along.length >= 2 ? trace.along : [0, ...trace.along, 0];
  return {
    axis: [at(-w / 2, floor), at(w / 2, floor)],
    curve: points.map((value, index) => at(along(index / (points.length - 1)), high(value))),
    ceiling: [at(-w / 2, high(ceiling)), at(w / 2, high(ceiling))],
    marks: trace.marks.map((mark) => ({
      points: [at(along(mark.at), floor), at(along(mark.at), floor - h * 0.1)],
      at: at(along(mark.at), floor - h * 0.2), label: mark.label, saturated: mark.saturated,
    })),
    labels: [
      { key: "what", text: trace.what, at: at(0, floor + tall + h * 0.14) },
      { key: "ceiling", text: "as bright as the camera records", at: at(w * 0.5, high(ceiling) + h * 0.07) },
    ],
  };
}

/** A rotor seen from above: which positions are loaded, and where that pulls. */
export interface StageRotor {
  /** How many positions it has. */
  positions: number;
  /** The ones with a tube in them, counting from 0. */
  loaded: readonly number[];
  /** A position a tube would go in to balance it, if one would. */
  put: readonly number[];
  /** How far off the axis the load sits, from 0 to 1. */
  offset: number;
  /** What the rotor is, written over it. */
  what: string;
}

/** That, worked out. */
export interface PlacedRotor {
  /** The rotor's rim. */
  rim: Point[];
  /** A cross at the axis, which is where a balanced load pulls. */
  axis: Point[][];
  /** Each position: its ring, whether it holds a tube, whether one should go in it, and its number. */
  holes: { ring: Point[]; loaded: boolean; suggested: boolean; at: Point; label: string }[];
  /** The line from the axis to where the load actually pulls, or `null` when it pulls nowhere. */
  pull: Point[] | null;
  /** What to write, and where. */
  labels: { key: string; text: string; at: Point }[];
}

/**
 * Where to draw a rotor and what is in it.
 *
 * A centrifuge does not know whether it is balanced; it finds out at full speed. Seen from above
 * with a line from the axis to where the load pulls, the answer is in the picture before it is in
 * the arithmetic: a balanced rotor has no line, and an unbalanced one has one pointing at the
 * problem.
 *
 * @param rotor - The positions, what is in them, and how far off the load sits.
 * @param centre - Where the middle of it goes.
 * @param toward - A point it should face, usually the camera.
 * @param radius - How big across to draw it, in metres.
 * @returns The rim, the positions, and where the load pulls.
 *
 * @example
 * ```ts
 * import { placeRotor } from "@biolibs/bionet-scene";
 *
 * placeRotor({ positions: 24, loaded: [0], put: [12], offset: 1, what: "24 × 1.5 mL" }, centre, camera, 0.22);
 * ```
 */
export function placeRotor(rotor: StageRotor, centre: readonly [number, number, number], toward: readonly [number, number, number],
                           radius: number): PlacedRotor {
  const unit = (v: Point): Point => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
  const cross = (a: Point, b: Point): Point => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const facing = unit([toward[0] - centre[0], toward[1] - centre[1], toward[2] - centre[2]]);
  const right = unit(cross(Math.abs(facing[1]) > 0.98 ? [0, 0, -1] : [0, 1, 0], facing));
  const up = cross(facing, right);
  const at = (x: number, y: number): Point => [centre[0] + right[0] * x + up[0] * y, centre[1] + right[1] * x + up[1] * y, centre[2] + right[2] * x + up[2] * y];
  const circle = (x: number, y: number, size: number, sides = 24): Point[] =>
    Array.from({ length: sides + 1 }, (_, index) => {
      const angle = (index / sides) * Math.PI * 2;
      return at(x + Math.cos(angle) * size, y + Math.sin(angle) * size);
    });
  const many = Math.max(1, Math.min(48, Math.floor(rotor.positions)));
  const ring = radius * 0.74;
  const hole = Math.min(radius * 0.13, (Math.PI * ring) / (many * 1.3));
  const angle = (position: number): number => (position / many) * Math.PI * 2;
  const loaded = new Set(rotor.loaded);
  const suggested = new Set(rotor.put);
  // Where the load pulls: the unit masses added up, which is what `balance` works out as a number.
  const x = [...loaded].reduce((sum, one) => sum + Math.cos(angle(one)), 0);
  const y = [...loaded].reduce((sum, one) => sum + Math.sin(angle(one)), 0);
  const length = Math.hypot(x, y);
  return {
    rim: circle(0, 0, radius),
    axis: [[at(-radius * 0.06, 0), at(radius * 0.06, 0)], [at(0, -radius * 0.06), at(0, radius * 0.06)]],
    holes: Array.from({ length: many }, (_, position) => {
      const [hx, hy] = [Math.cos(angle(position)) * ring, Math.sin(angle(position)) * ring];
      return {
        ring: circle(hx, hy, hole), loaded: loaded.has(position), suggested: suggested.has(position),
        at: at(hx * 1.3, hy * 1.3), label: `${position + 1}`,
      };
    }),
    pull: length < 1e-6 || loaded.size === 0 ? null
      : [at(0, 0), at((x / loaded.size) * ring, (y / loaded.size) * ring)],
    labels: [
      { key: "what", text: rotor.what, at: at(0, radius * 1.24) },
      { key: "offset", text: rotor.offset <= 0.02 ? "balanced" : `${Math.round(rotor.offset * 100)}% off the axis`, at: at(0, -radius * 1.24) },
    ],
  };
}

/** A plate seen from above, with whatever has come up on it. */
export interface StagePlate {
  /** What is on it, written under it. */
  what: string;
  /** The colonies: where on the dish, from -1 to 1 each way; how big across, as a fraction of it. */
  colonies: readonly { at: readonly [number, number]; size: number; satellite: boolean }[];
  /** Whether what is on it has run together, so that no one colony is one colony. */
  overgrown: boolean;
}

/** That, worked out. */
export interface PlacedPlate {
  /** The dish's rim. */
  rim: Point[];
  /** Each colony: its outline, whether it is a satellite, and whether it is touching another. */
  colonies: { ring: Point[]; satellite: boolean; touching: boolean }[];
  /** What to write, and where. */
  labels: { key: string; text: string; at: Point }[];
}

/**
 * Where to draw a plate and what has come up on it.
 *
 * The two things this picture is for are the two a plate does not announce. A satellite is a small
 * colony in the ring a real one has cleared around itself, and it took nothing up — drawn small and
 * beside a large one, which is what it looks like. And a colony touching another is not one colony,
 * however much it looks like one, so the ones that touch are drawn as touching.
 *
 * @param plate - What is on the dish.
 * @param centre - Where the middle of it goes.
 * @param toward - A point it should face, usually the camera.
 * @param radius - How big across to draw the dish, in metres.
 * @returns The rim and the colonies.
 *
 * @example
 * ```ts
 * import { placePlate } from "@biolibs/bionet-scene";
 *
 * placePlate({ what: "on ampicillin", colonies, overgrown: false }, centre, camera, 0.2);
 * ```
 */
export function placePlate(plate: StagePlate, centre: readonly [number, number, number], toward: readonly [number, number, number],
                           radius: number): PlacedPlate {
  const unit = (v: Point): Point => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
  const cross = (a: Point, b: Point): Point => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const facing = unit([toward[0] - centre[0], toward[1] - centre[1], toward[2] - centre[2]]);
  const right = unit(cross(Math.abs(facing[1]) > 0.98 ? [0, 0, -1] : [0, 1, 0], facing));
  const up = cross(facing, right);
  const at = (x: number, y: number): Point => [centre[0] + right[0] * x + up[0] * y, centre[1] + right[1] * x + up[1] * y, centre[2] + right[2] * x + up[2] * y];
  const circle = (x: number, y: number, size: number, sides: number): Point[] =>
    Array.from({ length: sides + 1 }, (_, index) => {
      const angle = (index / sides) * Math.PI * 2;
      return at(x + Math.cos(angle) * size, y + Math.sin(angle) * size);
    });
  const drawn = plate.colonies.slice(0, 200);
  return {
    rim: circle(0, 0, radius, 40),
    colonies: drawn.map((one) => {
      const size = Math.max(radius * 0.012, (one.size * radius) / 2);
      // A dish is round, so a colony given the corner of the square is brought in to the rim, and
      // then in again by its own width: a colony half off the edge of a plate is not a thing.
      const out = Math.hypot(one.at[0], one.at[1]);
      const reach = Math.max(0, radius - size - radius * 0.04);
      const scale = out <= 1e-9 ? 0 : (Math.min(1, out) * reach) / out;
      const [x, y] = [one.at[0] * scale, one.at[1] * scale];
      // Touching another is the thing worth seeing, so it is worked out rather than asserted.
      const touching = drawn.some((other) => {
        if (other === one) return false;
        const theirs = Math.max(radius * 0.012, (other.size * radius) / 2);
        const away = Math.hypot(other.at[0], other.at[1]);
        const put = away <= 1e-9 ? 0 : (Math.min(1, away) * Math.max(0, radius - theirs - radius * 0.04)) / away;
        return Math.hypot(other.at[0] * put - x, other.at[1] * put - y) < size + theirs;
      });
      return { ring: circle(x, y, size, one.satellite ? 8 : 14), satellite: one.satellite, touching };
    }),
    labels: [
      { key: "what", text: plate.what, at: at(0, -radius * 1.2) },
      ...(plate.overgrown ? [{ key: "overgrown", text: "run together", at: at(0, radius * 1.2) }] : []),
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
