"use client";

/**
 * An instrument, drawn to look like the thing a person walks up to.
 *
 * It is drawn from a `Shape`: its body, a lid that turns about its hinge, a screen that is lit, and
 * the wells of its block. It is in the same edges and colours as everything else in the scene.
 */
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, EdgesGeometry, Object3D, RingGeometry, type Group, type InstancedMesh } from "three";
import { colour, type Meaning, type Theme } from "@biolibs/bionet-theme";
import type { Motion } from "./motion.js";
import { paint } from "./scene.js";
import type { Part, Shape } from "./shapes.js";

const BOX = new BoxGeometry(1, 1, 1);
const EDGES = new EdgesGeometry(BOX);
const WELL = new RingGeometry(0.55, 1, 20).rotateX(-Math.PI / 2);

function PartBox({ part, tone, strength, theme, fill }: { part: Part; tone: Meaning; strength: number; theme: Theme; fill: number }) {
  const edge = paint(tone, theme, strength);
  return (
    <group position={part.at} scale={part.size}>
      <lineSegments geometry={EDGES}>
        <lineBasicMaterial color={edge.color} transparent opacity={edge.opacity} toneMapped={false} />
      </lineSegments>
      {fill > 0 && (
        <mesh geometry={BOX}>
          <meshBasicMaterial color={colour(tone, theme)} transparent opacity={theme === "dark" ? fill : fill * 1.6} depthWrite={false} toneMapped={false} />
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
export function InstrumentShape({ shape, size, theme, tone = "yours", strength = 1, open = 0, well, lit = false, motion = "on" }: {
  shape: Shape; size: readonly [number, number, number]; theme: Theme; tone?: Meaning; strength?: number; open?: number;
  well?: { row: number; column: number } | undefined; lit?: boolean; motion?: Motion;
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
  return (
    <group scale={[size[0], size[1], size[2]]}>
      {shape.body.map((part, at) => <PartBox key={at} part={part} tone={tone} strength={strength} theme={theme} fill={0.04} />)}
      {block !== undefined && (
        <>
          <instancedMesh ref={wells} key={count} args={[WELL, undefined, count]}>
            <meshBasicMaterial color={ring.color} transparent opacity={theme === "dark" ? 0.8 : 0.6} toneMapped={false} />
          </instancedMesh>
          {well !== undefined && well.row < block.rows && well.column < block.columns && (
            <mesh position={wellAt(well.row, well.column)} scale={[(radius * 0.9) / size[0], 0.05, (radius * 0.9) / size[2]]}>
              <cylinderGeometry args={[1, 1, 1, 20]} />
              <meshBasicMaterial color={paint("held", theme, 1).color} toneMapped={false} />
            </mesh>
          )}
        </>
      )}
      {shape.lid !== undefined && (
        <group position={shape.lid.hinge}>
          <group ref={lid}>
            <PartBox tone={tone} strength={strength} theme={theme} fill={0.03}
                     part={{ at: [shape.lid.part.at[0] - shape.lid.hinge[0], shape.lid.part.at[1] - shape.lid.hinge[1], shape.lid.part.at[2] - shape.lid.hinge[2]], size: shape.lid.part.size }} />
          </group>
        </group>
      )}
      {screen !== undefined && (
        <mesh position={screen.at} rotation={[-(screen.leans * Math.PI) / 180, 0, 0]}>
          <planeGeometry args={[screen.size[0], screen.size[1]]} />
          <meshBasicMaterial color={paint(lit ? "found" : "dim", theme, lit ? 0.75 : 0.3).color} transparent opacity={lit ? 0.9 : 0.5} toneMapped={false} side={2} />
        </mesh>
      )}
    </group>
  );
}
