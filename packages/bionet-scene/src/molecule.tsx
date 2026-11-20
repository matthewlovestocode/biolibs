"use client";

/**
 * A molecule drawn in the scene: a plasmid as a ring, anything else as a bar, with what is marked on it.
 *
 * Nobody sees this in a lab. It is what somebody at the bench pictures when they hold a tube: which
 * construct it is and what is on it. It is drawn the way a plasmid map is, so that the picture in
 * the scene and the map on the page are the same picture.
 */
import { Line } from "@react-three/drei";
import type { Theme } from "@biolibs/bionet-theme";
import { paint, type Label } from "./scene.js";
import type { PlacedBeam, PlacedField, PlacedGel, PlacedJoining, PlacedMolecule, PlacedRotor, PlacedScale, PlacedTrace } from "./shapes.js";

/**
 * The names to write over a molecule: each stretch marked on it, and what it is.
 *
 * @param placed - The molecule, worked out by `placeMolecule`.
 * @param named - Whether to write its name and length at its middle. Off where something else
 *   already does. A long name is cut short, since it is written across the middle of a ring.
 * @returns Labels for `Follow`. Stretches matter less than the name, so they give way when crowded.
 */
export function moleculeLabels(placed: PlacedMolecule, named = true): Label[] {
  return [
    ...(named ? [{ key: "molecule", at: placed.middle, rank: 0, content: <span className="molecule-name">{placed.name.length > 26 ? `${placed.name.slice(0, 25)}…` : placed.name}<small>{placed.size}</small></span> }] : []),
    ...placed.marks.map((one, at): Label => ({ key: `molecule mark ${at}`, at: one.at, rank: 1, content: <span className="molecule-cut">{one.label}</span> })),
    ...placed.features.map((one, at): Label => ({ key: `molecule ${at}`, at: one.at, rank: 3, content: <span className={`molecule-mark tone-${one.tone}`}>{one.label}</span> })),
  ];
}

/**
 * The lines of a molecule. It goes inside a canvas.
 *
 * @param props - `placed` is the molecule, worked out by `placeMolecule`; `theme` is the theme to paint it in.
 */
export function Molecule({ placed, theme }: { placed: PlacedMolecule; theme: Theme }) {
  const ink = paint("ink", theme, 0.75);
  return (
    <group>
      <Line points={placed.backbone} color={ink.color} lineWidth={2} transparent opacity={ink.opacity} toneMapped={false} />
      {placed.marks.map((one, at) => <Line key={`mark ${at}`} points={one.points} color={paint("attention", theme, 1).color} lineWidth={2.5} toneMapped={false} />)}
      {placed.features.map((one, at) => {
        const tone = paint(one.tone, theme, 1);
        return (
          <group key={at}>
            <Line points={one.points} color={tone.color} lineWidth={6} toneMapped={false} />
            {one.barb !== null && <Line points={one.barb} color={tone.color} lineWidth={3} toneMapped={false} />}
          </group>
        );
      })}
    </group>
  );
}

/**
 * The names to write over a gel: each lane's, and each band's size.
 *
 * @param placed - The gel, worked out by `placeGel`.
 * @returns Labels for `Follow`. A sample's bands matter more than the ladder's, which give way when crowded.
 */
export function gelLabels(placed: PlacedGel): Label[] {
  return [
    ...placed.names.map((one, at): Label => ({ key: `gel lane ${at}`, at: one.at, rank: 1, content: <span className="gel-lane">{one.name}</span> })),
    ...placed.bands.map((one, at): Label => ({ key: `gel band ${at}`, at: one.at, rank: one.lane === 0 ? 4 : 2, content: <span className={`gel-size ${one.lane === 0 ? "left" : "right"} tone-${one.tone}`}>{one.label}</span> })),
  ];
}

/**
 * The lines of a gel that has been run. It goes inside a canvas.
 *
 * @param props - `placed` is the gel, worked out by `placeGel`; `theme` is the theme to paint it in.
 */
export function GelSlab({ placed, theme }: { placed: PlacedGel; theme: Theme }) {
  const rule = paint("ink", theme, 0.45);
  return (
    <group>
      <Line points={placed.slab} color={rule.color} lineWidth={1.5} transparent opacity={rule.opacity} toneMapped={false} />
      {placed.wells.map((well, at) => <Line key={`well ${at}`} points={well} color={rule.color} lineWidth={3} transparent opacity={rule.opacity} toneMapped={false} />)}
      {placed.bands.map((band, at) => {
        const tone = paint(band.tone, theme, 1);
        return <Line key={at} points={band.points} color={tone.color} lineWidth={band.lane === 0 ? 3 : 5} transparent opacity={band.strength} toneMapped={false} />;
      })}
    </group>
  );
}

/**
 * The names to write over pieces being joined: each piece's, and what each join is made of.
 *
 * @param placed - The pieces, worked out by `placeJoining`.
 * @returns Labels for `Follow`. A join matters more than a piece's name, since it is what is being looked at.
 */
export function joiningLabels(placed: PlacedJoining): Label[] {
  return [
    ...placed.joins.map((one, at): Label => ({ key: `join ${at}`, at: one.at, rank: 0, content: <span className="molecule-cut">{one.label}</span> })),
    ...placed.pieces.map((one, at): Label => ({ key: `piece ${at}`, at: one.at, rank: 2, content: <span className={`molecule-mark tone-${one.tone}`}>{one.label}</span> })),
  ];
}

/**
 * The lines of pieces being joined. It goes inside a canvas.
 *
 * @param props - `placed` is from `placeJoining`; `theme` is the theme to paint it in.
 */
export function Joining({ placed, theme }: { placed: PlacedJoining; theme: Theme }) {
  return (
    <group>
      {placed.pieces.map((piece, at) => {
        const tone = paint(piece.tone, theme, 1);
        return <Line key={at} points={piece.points} color={tone.color} lineWidth={6} toneMapped={false} />;
      })}
      {placed.joins.map((join, at) => {
        const tone = paint("attention", theme, 1);
        // The join itself is drawn only once the ends have met: until then there is a gap, which is the point.
        return join.closed < 1 ? null : <Line key={at} points={join.points} color={tone.color} lineWidth={4} toneMapped={false} />;
      })}
    </group>
  );
}

/**
 * What to write over a beam: the wavelength at the lamp, what is in the cuvette, and how much of
 * the light came out the other side, which is the whole of what the instrument measures.
 *
 * @param placed - The beam, worked out by `placeBeam`.
 * @returns Labels for `Follow`.
 */
export function beamLabels(placed: PlacedBeam): Label[] {
  return placed.labels.map((one): Label => ({
    key: `beam ${one.key}`, at: one.at, rank: one.key === "through" ? 0 : 2,
    content: <span className={`beam-said ${one.key}`}>{one.text}</span>,
  }));
}

/**
 * Light going through a cuvette. It goes inside a canvas.
 *
 * The beam is drawn in pieces, each at the strength the light still has there, so that what the
 * instrument does is visible rather than asserted: light goes in, less comes out, and the number on
 * the screen is how much less. Ultraviolet is drawn in the colour of something that is not there to
 * be seen; the 600 nm a culture is read at is drawn as the light it is.
 *
 * @param props - `placed` is the beam, worked out by `placeBeam`; `nm` is its wavelength; `theme` is the theme.
 */
export function Beam({ placed, nm, theme }: { placed: PlacedBeam; nm: number; theme: Theme }) {
  const glass = paint("ink", theme, 0.4);
  // Under about 400 nm there is nothing for an eye to see, so it is drawn as the odd thing it is.
  const light = nm < 400 ? "theirs" : nm < 580 ? "good" : "held";
  return (
    <group>
      <Line points={placed.cuvette} color={glass.color} lineWidth={1.5} transparent opacity={glass.opacity} toneMapped={false} />
      <Line points={placed.surface} color={glass.color} lineWidth={1} transparent opacity={glass.opacity * 0.8} toneMapped={false} />
      <Line points={placed.detector} color={glass.color} lineWidth={3} transparent opacity={glass.opacity} toneMapped={false} />
      {placed.pieces.map((piece, at) => {
        const tone = paint(light, theme, 1);
        return <Line key={at} points={piece.points} color={tone.color} lineWidth={3.2} transparent
                     opacity={Math.max(0.04, piece.strength)} toneMapped={false} />;
      })}
      {placed.scattered.map((ray, at) => {
        const tone = paint(light, theme, 0.7);
        return <Line key={`out ${at}`} points={ray} color={tone.color} lineWidth={1.4} transparent opacity={0.35} toneMapped={false} />;
      })}
    </group>
  );
}

/**
 * What to write over a scale: the reading, what the scale is of, and what each band on it is.
 *
 * @param placed - The scale, worked out by `placeScale`.
 * @returns Labels for `Follow`. The reading matters most; the ticks give way first.
 */
export function scaleLabels(placed: PlacedScale): Label[] {
  return [
    ...placed.labels.map((one): Label => ({
      key: `scale ${one.key}`, at: one.at, rank: one.key === "reading" ? 0 : 2,
      content: <span className={`scale-said ${one.key}${one.key === "reading" && placed.beyond ? " beyond" : ""}`}>{one.text}</span>,
    })),
    ...placed.bands.map((one, at): Label => ({ key: `scale band ${at}`, at: one.at, rank: 1, content: <span className={`scale-band tone-${one.tone}`}>{one.label}</span> })),
    ...placed.ticks.map((one, at): Label => ({ key: `scale tick ${at}`, at: one.at, rank: 4, content: <span className="scale-tick">{one.label}</span> })),
  ];
}

/**
 * A reading on a scale, with the ranges that matter marked on it. It goes inside a canvas.
 *
 * @param props - `placed` is the scale, worked out by `placeScale`; `theme` is the theme.
 */
export function Scale({ placed, theme }: { placed: PlacedScale; theme: Theme }) {
  const rule = paint("dim", theme, 0.7);
  const mark = paint(placed.beyond ? "attention" : "ink", theme, 1);
  return (
    <group>
      <Line points={placed.line} color={rule.color} lineWidth={1.5} transparent opacity={rule.opacity} toneMapped={false} />
      {placed.ticks.map((tick, at) => (
        <Line key={`tick ${at}`} points={tick.points} color={rule.color} lineWidth={1.2} transparent opacity={rule.opacity * 0.9} toneMapped={false} />
      ))}
      {placed.bands.map((band, at) => {
        const tone = paint(band.tone, theme, 0.9);
        return <Line key={`band ${at}`} points={band.points} color={tone.color} lineWidth={5} transparent opacity={0.85} toneMapped={false} />;
      })}
      <Line points={placed.pointer} color={mark.color} lineWidth={3} transparent opacity={mark.opacity} toneMapped={false} />
    </group>
  );
}

/**
 * What to write over a field: the gap, the field it makes, and how many cells took something up.
 *
 * @param placed - The field, worked out by `placeField`.
 * @returns Labels for `Follow`. The field matters most: it is the number the voltage is not.
 */
export function fieldLabels(placed: PlacedField): Label[] {
  return placed.labels.map((one): Label => ({
    key: `field ${one.key}`, at: one.at, rank: one.key === "field" ? 0 : 2,
    content: <span className={`field-said ${one.key}`}>{one.text}</span>,
  }));
}

/**
 * The inside of a cuvette during a pulse. It goes inside a canvas.
 *
 * The two electrodes, the field between them drawn at the strength it is against what this host is
 * usually given, the cells in it, and the DNA going into the ones that took it up.
 *
 * @param props - `placed` is the field, worked out by `placeField`; `theme` is the theme.
 */
export function Field({ placed, theme }: { placed: PlacedField; theme: Theme }) {
  const metal = paint("dim", theme, 0.9);
  const live = paint("held", theme, 1);
  const wall = paint("ink", theme, 0.6);
  const took = paint("good", theme, 1);
  return (
    <group>
      {placed.electrodes.map((one, at) => (
        <Line key={`electrode ${at}`} points={one} color={metal.color} lineWidth={5} transparent opacity={metal.opacity} toneMapped={false} />
      ))}
      {placed.lines.map((one, at) => (
        <Line key={`field ${at}`} points={one.points} color={live.color} lineWidth={1.3} transparent opacity={one.strength * 0.55} toneMapped={false} />
      ))}
      {placed.cells.map((cell, at) => (
        <group key={`cell ${at}`}>
          <Line points={cell.ring} color={cell.taken ? took.color : wall.color} lineWidth={cell.taken ? 2.4 : 1.6}
                transparent opacity={cell.taken ? 1 : wall.opacity} toneMapped={false} />
          {cell.dna !== null && <Line points={cell.dna} color={took.color} lineWidth={2} transparent opacity={0.85} toneMapped={false} />}
        </group>
      ))}
      <Line points={placed.measure.points} color={metal.color} lineWidth={1.4} transparent opacity={metal.opacity * 0.8} toneMapped={false} />
    </group>
  );
}

/**
 * What to write over a lane's profile: which lane it is, where the camera gives out, and each band.
 *
 * @param placed - The profile, worked out by `placeTrace`.
 * @returns Labels for `Follow`. A band at the ceiling is the thing to read first.
 */
export function traceLabels(placed: PlacedTrace): Label[] {
  return [
    ...placed.labels.map((one): Label => ({ key: `trace ${one.key}`, at: one.at, rank: one.key === "what" ? 1 : 3,
                                            content: <span className={`trace-said ${one.key}`}>{one.text}</span> })),
    ...placed.marks.map((one, at): Label => ({ key: `trace band ${at}`, at: one.at, rank: one.saturated ? 0 : 2,
                                               content: <span className={`trace-band${one.saturated ? " burnt" : ""}`}>{one.label}</span> })),
  ];
}

/**
 * A lane of a gel as a profile along it. It goes inside a canvas.
 *
 * @param props - `placed` is the profile, worked out by `placeTrace`; `theme` is the theme.
 */
export function Trace({ placed, theme }: { placed: PlacedTrace; theme: Theme }) {
  const rule = paint("dim", theme, 0.7);
  const line = paint("ink", theme, 0.9);
  const top = paint("attention", theme, 0.9);
  return (
    <group>
      <Line points={placed.axis} color={rule.color} lineWidth={1.4} transparent opacity={rule.opacity} toneMapped={false} />
      <Line points={placed.ceiling} color={top.color} lineWidth={1.4} transparent opacity={0.7} dashed dashSize={0.012} gapSize={0.008} toneMapped={false} />
      <Line points={placed.curve} color={line.color} lineWidth={2.4} transparent opacity={line.opacity} toneMapped={false} />
      {placed.marks.map((mark, at) => (
        <Line key={at} points={mark.points} color={(mark.saturated ? top : rule).color} lineWidth={mark.saturated ? 2.4 : 1.4}
              transparent opacity={mark.saturated ? 0.9 : rule.opacity} toneMapped={false} />
      ))}
    </group>
  );
}

/**
 * What to write over a rotor: what it is, and whether it is balanced.
 *
 * @param placed - The rotor, worked out by `placeRotor`.
 * @returns Labels for `Follow`. Whether it is balanced matters most; the position numbers give way first.
 */
export function rotorLabels(placed: PlacedRotor): Label[] {
  const out = placed.labels.map((one): Label => ({
    key: `rotor ${one.key}`, at: one.at, rank: one.key === "offset" ? 0 : 1,
    content: <span className={`rotor-said ${one.key}${one.key === "offset" && one.text !== "balanced" ? " out" : ""}`}>{one.text}</span>,
  }));
  return [...out, ...placed.holes.filter((one) => one.loaded || one.suggested).map((one, at): Label => ({
    key: `rotor hole ${at}`, at: one.at, rank: one.suggested ? 2 : 4,
    content: <span className={`rotor-hole${one.suggested ? " put" : ""}`}>{one.label}</span>,
  }))];
}

/**
 * A rotor seen from above, with what is in it. It goes inside a canvas.
 *
 * @param props - `placed` is the rotor, worked out by `placeRotor`; `theme` is the theme.
 */
export function Rotor({ placed, theme }: { placed: PlacedRotor; theme: Theme }) {
  const metal = paint("dim", theme, 0.8);
  const full = paint("held", theme, 1);
  const empty = paint("ink", theme, 0.4);
  const put = paint("good", theme, 1);
  const out = paint("attention", theme, 1);
  return (
    <group>
      <Line points={placed.rim} color={metal.color} lineWidth={1.8} transparent opacity={metal.opacity} toneMapped={false} />
      {placed.axis.map((one, at) => (
        <Line key={`axis ${at}`} points={one} color={metal.color} lineWidth={1.4} transparent opacity={metal.opacity} toneMapped={false} />
      ))}
      {placed.holes.map((hole, at) => {
        const tone = hole.loaded ? full : hole.suggested ? put : empty;
        return <Line key={at} points={hole.ring} color={tone.color} lineWidth={hole.loaded || hole.suggested ? 2.6 : 1.2}
                     transparent opacity={hole.loaded ? 1 : hole.suggested ? 0.9 : empty.opacity} toneMapped={false} />;
      })}
      {placed.pull !== null && (
        <Line points={placed.pull} color={out.color} lineWidth={3} transparent opacity={0.9} toneMapped={false} />
      )}
    </group>
  );
}
