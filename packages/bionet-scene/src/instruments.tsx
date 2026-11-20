"use client";

/**
 * An instrument, drawn to look like the thing a person walks up to.
 *
 * It is drawn from a `Shape`: its body, a lid that turns about its hinge, a screen that is lit, and
 * the wells of its block. It is in the same edges and colours as everything else in the scene.
 */
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, CylinderGeometry, EdgesGeometry, Object3D, PlaneGeometry, RingGeometry, type Group, type InstancedMesh } from "three";
import { colour, type Meaning, type Theme } from "@biolibs/bionet-theme";
import type { Motion } from "./motion.js";
import { paint } from "./scene.js";
import { roundScale, type Part, type Shape } from "./shapes.js";

const BOX = new BoxGeometry(1, 1, 1);
const EDGES = new EdgesGeometry(BOX);
const WELL = new RingGeometry(0.55, 1, 20).rotateX(-Math.PI / 2);
/** The four sides of a screen, drawn round its face. */
const SCREEN_EDGE = new EdgesGeometry(new PlaneGeometry(1, 1));
/** A piece drawn round: twelve sides, which in edges reads as a drum rather than a circle. */
const ROUND = new CylinderGeometry(0.5, 0.5, 1, 12);
const ROUND_EDGES = new EdgesGeometry(ROUND);
/** A round piece lying on its side faces its ends along x or z instead of up. */
const LYING: Readonly<Record<"x" | "y" | "z", [number, number, number]>> = { x: [0, 0, Math.PI / 2], y: [0, 0, 0], z: [Math.PI / 2, 0, 0] };

/**
 * One piece of an instrument.
 *
 * `order` is where it comes in the shape, and it is what settles which of two surfaces at the same
 * depth is drawn in front. Shapes are written big first and detail after — a case, then the panel
 * set into its face — and a panel written exactly on the face it is set into is the natural way to
 * write it. Without this, those two surfaces are a coin toss the renderer makes again each frame.
 */
function PartBox({ part, tone, strength, theme, fill, name, within, order, picked }: { part: Part; tone: Meaning; strength: number; theme: Theme; fill: number; name: string; within: readonly [number, number, number]; order: number; picked: boolean }) {
  // A quiet piece is quiet until the thing it belongs to is the one being looked at, and then it is
  // as loud as the rest: somebody looking at a bench may well be looking at how it stands.
  const loud = picked ? 1 : part.loud ?? 1;
  const edge = paint(tone, theme, strength * loud);
  const round = part.round === true;
  // A cylinder is modelled standing up, so lying one along x or z is a quarter turn. Its scale is
  // worked out rather than taken from its size, because the instrument it is in is scaled unevenly
  // after it is turned, and a circle of fractions is an ellipse of metres.
  const turn = round ? LYING[part.along ?? "y"] : LYING.y;
  const scale: [number, number, number] = round ? roundScale(part, within) : part.size;
  return (
    <group position={part.at} rotation={turn} scale={scale}>
      <lineSegments name={`${name} edges`} geometry={round ? ROUND_EDGES : EDGES}>
        <lineBasicMaterial color={edge.color} transparent opacity={edge.opacity} toneMapped={false}
                           polygonOffset polygonOffsetFactor={-order} polygonOffsetUnits={-order} />
      </lineSegments>
      {fill > 0 && (
        // Tagged as skinned, with the fill it has when skins are off, so that the skins setting can
        // drive it from how near the camera is and put this exact fill back when it is turned off.
        <mesh name={name} geometry={round ? ROUND : BOX} userData={{ skinned: true, fill, loud, ...(part.skin === undefined ? {} : { skin: part.skin }) }}>
          <meshBasicMaterial color={colour(tone, theme)} transparent opacity={theme === "dark" ? fill : fill * 1.6} depthWrite={false} toneMapped={false}
                             polygonOffset polygonOffsetFactor={-order} polygonOffsetUnits={-order} />
        </mesh>
      )}
    </group>
  );
}

/**
 * An instrument's shape, filling a box of a given size centred on the origin.
 *
 * @param props - `shape` is what it is made of; `size` is how wide, tall and deep it is, in metres;
 *   `tone` and `strength` colour it; `open` is how far its lid is open, from 0 to 1; `well` marks
 *   one position of its block as taken; `lit` lights its screen; `motion` says whether the lid
 *   swings or jumps.
 */
export function InstrumentShape({ shape, size, theme, tone = "yours", strength = 1, open = 0, well, lit = false, motion = "on", name = "instrument", picked = false }: {
  shape: Shape; size: readonly [number, number, number]; theme: Theme; tone?: Meaning; strength?: number; open?: number;
  /** Whether this is the thing being looked at, which brings its quiet pieces up to full. */
  picked?: boolean;
  well?: { row: number; column: number } | undefined; lit?: boolean; motion?: Motion;
  /** What the lab calls it, so that each part of it says whose it is in a scene report. */
  name?: string;
}) {
  const lid = useRef<Group>(null);
  const wells = useRef<InstancedMesh>(null);
  const turned = useRef(open);
  useFrame((_, delta) => {
    if (lid.current === null || shape.lid === undefined) return;
    turned.current = motion === "off" ? open : turned.current + (open - turned.current) * (1 - Math.exp(-delta * 6));
    lid.current.rotation.x = -turned.current * (shape.lid.opens * Math.PI) / 180;
  });
  const block = shape.block;
  const count = block === undefined ? 0 : block.rows * block.columns;
  // A well's radius, in the instrument's own fractions, corrected for the instrument not being a cube.
  const radius = block === undefined ? 0 : Math.min((block.size[0] * size[0]) / block.columns, (block.size[1] * size[2]) / block.rows) * 0.36;
  const wellAt = useMemo(() => (row: number, column: number): [number, number, number] => (block === undefined ? [0, 0, 0] : [
    block.at[0] + ((column + 0.5) / block.columns - 0.5) * block.size[0], block.at[1] + 0.004, block.at[2] + ((row + 0.5) / block.rows - 0.5) * block.size[1],
  ]), [block]);
  useLayoutEffect(() => {
    const mesh = wells.current;
    if (mesh === null || block === undefined) return;
    const at = new Object3D();
    for (let row = 0; row < block.rows; row++) {
      for (let column = 0; column < block.columns; column++) {
        at.position.set(...wellAt(row, column));
        at.scale.set(radius / size[0], 1, radius / size[2]);
        at.updateMatrix();
        mesh.setMatrixAt(row * block.columns + column, at.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [block, radius, size, wellAt]);
  const ring = paint("dim", theme, 0.5);
  const screen = shape.screen;
  // Six tenths of a millimetre, said as a fraction of how deep this instrument is, because parts
  // are written as fractions and scaled by the whole.
  const proud = size[2] > 0 ? 0.0006 / size[2] : 0;
  // In front of every piece, since it is set into whichever of them it is on.
  const ahead = shape.body.length + (shape.lid?.parts.length ?? 0) + 1;
  const glass = paint(lit ? "found" : "dim", theme, lit ? 0.95 : 0.3);
  return (
    <group scale={[size[0], size[1], size[2]]}>
      {shape.body.map((part, at) => <PartBox key={at} order={at} picked={picked} name={`${name} body ${at + 1}`} part={part} tone={tone} strength={strength} theme={theme} fill={0.04} within={size} />)}
      {block !== undefined && (
        <>
          <instancedMesh name={`${name} wells`} ref={wells} key={count} args={[WELL, undefined, count]}>
            <meshBasicMaterial color={ring.color} transparent opacity={theme === "dark" ? 0.8 : 0.6} toneMapped={false} />
          </instancedMesh>
          {well !== undefined && well.row < block.rows && well.column < block.columns && (
            <mesh name={`${name} tube in the block`} position={wellAt(well.row, well.column)} scale={[(radius * 0.9) / size[0], 0.05, (radius * 0.9) / size[2]]}>
              <cylinderGeometry args={[1, 1, 1, 20]} />
              <meshBasicMaterial color={paint("held", theme, 1).color} toneMapped={false} />
            </mesh>
          )}
        </>
      )}
      {shape.lid !== undefined && (
        <group position={shape.lid.hinge}>
          <group ref={lid}>
            {shape.lid.parts.map((part, at) => (
              <PartBox key={at} order={shape.body.length + at} picked={picked} name={`${name} lid ${at + 1}`} tone={tone} strength={strength} theme={theme} fill={0.03} within={size}
                       part={{ ...part, at: [part.at[0] - shape.lid!.hinge[0], part.at[1] - shape.lid!.hinge[1], part.at[2] - shape.lid!.hinge[2]] }} />
            ))}
          </group>
        </group>
      )}
      {screen !== undefined && (
        // A screen is glass with light behind it, not a painted rectangle: a dark face, and a lit
        // border when the machine is saying something. Filling the face in the lit colour instead
        // would make the brightest, most solid thing in a scene of thin edges the one thing in it
        // that carries no reading.
        <group position={screen.at} rotation={[-(screen.leans * Math.PI) / 180, 0, 0]}>
          {/* A screen is set in the face it is on, so every shape writes it at that face exactly.
              Two surfaces at one depth is a coin toss the renderer makes again each frame, which is
              a flicker across the room and nothing at all close up. So it is stood a fraction of a
              millimetre proud of the face, and told to win the depth test besides: the offset alone
              runs out of depth precision at a distance, which is where the flicker was. */}
          <group position={[0, 0, proud]}>
            <mesh name={`${name} screen`}>
              <planeGeometry args={[screen.size[0], screen.size[1]]} />
              <meshBasicMaterial color={colour("field", theme)} transparent opacity={lit ? 0.92 : 0.6} toneMapped={false} side={2} depthWrite={false}
                                 polygonOffset polygonOffsetFactor={-ahead} polygonOffsetUnits={-ahead} />
            </mesh>
            <lineSegments name={`${name} screen edge`} geometry={SCREEN_EDGE} scale={[screen.size[0], screen.size[1], 1]}>
              <lineBasicMaterial color={glass.color} opacity={glass.opacity} transparent toneMapped={false}
                                 polygonOffset polygonOffsetFactor={-ahead} polygonOffsetUnits={-ahead} />
            </lineSegments>
          </group>
        </group>
      )}
    </group>
  );
}
