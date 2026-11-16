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
import type { PlacedGel, PlacedJoining, PlacedMolecule } from "./shapes.js";

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
