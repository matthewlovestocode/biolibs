"use client";

/**
 * The scene: a list of things to draw, drawn.
 *
 * Everything worth deciding was decided in `view.ts`. This turns each place into the edges of a
 * box, each tube into a cylinder and each empty position into a ring, in the colours the theme
 * gives for what they mean, and moves the camera to where the view says to stand.
 *
 * In the dark theme the edges are drawn brighter than white and a bloom pass makes them glow. In
 * the light theme the same edges are drawn plainly on a pale ground: a glow needs something dark to
 * glow against.
 */
import { Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { BoxGeometry, Color, CylinderGeometry, EdgesGeometry, Object3D, Plane, QuadraticBezierCurve3, RingGeometry, Vector3,
         type Group, type InstancedMesh, type Mesh, type PerspectiveCamera } from "three";
import { colour, type Meaning, type Theme } from "@biolibs/bionet-theme";
import { InUseContent, atInstrument, type PlacedInUse } from "./in-use.js";
import { describeScene, pointOnScreen, reportScene } from "./inspect.js";
import { InstrumentShape } from "./instruments.js";
import type { Motion } from "./motion.js";
import { BLOOM_ABOVE, SKINS, fillAt, nearness, skinTone, staysClear, type Skins } from "./skins.js";
import { shapeFor } from "./shapes.js";
import { legible, type DrawnPlace, type DrawnSlot, type DrawnTube, type Focus, type SceneView, type Written } from "./view.js";

/** Another lab, drawn beside this one. */
export interface Neighbour {
  /** Something to tell it apart by, such as its address. */
  id: string;
  /** What it is called. */
  name: string;
  /** A line about it, such as how many parts it offers. */
  note?: string;
}

const BOX = new BoxGeometry(1, 1, 1);
const EDGES = new EdgesGeometry(BOX);
const TUBE = new CylinderGeometry(1, 1, 1, 24);
const RING = new RingGeometry(0.62, 1, 28).rotateX(-Math.PI / 2);

/**
 * The colour and opacity to draw something in.
 *
 * @param tone - What its colour means.
 * @param theme - Which theme is showing.
 * @param strength - How strongly to draw it, from 0 to 1.
 * @returns In the dark theme a colour that may be brighter than white, which is what the bloom
 *   picks up; in the light theme the plain colour, made fainter by opacity.
 */
export function paint(tone: Meaning, theme: Theme, strength: number): { color: Color; opacity: number } {
  const color = new Color(colour(tone, theme));
  return theme === "dark" ? { color: color.multiplyScalar(0.3 + strength * 2.3), opacity: 1 }
                          : { color, opacity: 0.22 + 0.78 * strength };
}

/**
 * Which theme the system is asking for.
 *
 * @returns `dark` or `light`, and again whenever the system changes its mind.
 */
export function useSystemTheme(): Theme {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const read = (): void => setTheme(query.matches ? "dark" : "light");
    read();
    query.addEventListener("change", read);
    return () => query.removeEventListener("change", read);
  }, []);
  return theme;
}

/** How big another lab is drawn, in metres. */
const NEIGHBOUR_SIZE: [number, number, number] = [1.8, 1.5, 1.8];

/** Something written over the scene, at a point in it. */
export interface Label {
  /** What tells it apart from the others. */
  key: string;
  /** The point it is written at. */
  at: [number, number, number];
  /** What is written. */
  content: ReactNode;
  /** How much it matters when two would sit on each other. Lower matters more. */
  rank: number;
}

/**
 * Keeps each label over its point as the camera moves.
 *
 * The labels are ordinary elements beside the canvas, drawn by the same React as everything else.
 * This only moves them: once a frame it works out where each point falls on screen.
 */
export function Follow({ labels, layer }: { labels: readonly Label[]; layer: RefObject<HTMLDivElement | null> }) {
  const point = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    const elements = layer.current?.children;
    if (elements === undefined) return;
    const written: (Written | null)[] = labels.map((label, index) => {
      const element = elements[index] as HTMLElement | undefined;
      if (element === undefined) return null;
      const depth = point.set(...label.at).distanceTo(camera.position);
      point.project(camera);
      // Past the far side of the camera a point still projects onto the screen, mirrored.
      if (point.z > 1 || point.z < -1) return null;
      // Among labels that matter equally, the nearer is kept.
      return { x: ((point.x + 1) / 2) * size.width, y: ((1 - point.y) / 2) * size.height,
               width: element.offsetWidth, height: element.offsetHeight, rank: label.rank + Math.min(depth, 999) / 1000 };
    });
    const present = written.filter((one): one is Written => one !== null);
    const shown = legible(present);
    let at = 0;
    written.forEach((one, index) => {
      const element = elements[index] as HTMLElement | undefined;
      if (element === undefined) return;
      const show = one !== null && shown[at++] === true;
      element.style.visibility = show ? "visible" : "hidden";
      if (one !== null) element.style.transform = `translate(${one.x}px, ${one.y}px) translate(-50%, -50%)`;
    });
  });
  return null;
}

/** A click that was really the end of a drag is not a click. */
const dragged = (event: ThreeEvent<MouseEvent>): boolean => event.delta > 4;

/**
 * Whether a press on this was meant for it.
 *
 * A freezer stands inside a room, so a press on the freezer passes through the room's wall first.
 * The press belongs to the smallest thing under the pointer, not the nearest.
 */
const meantFor = (event: ThreeEvent<MouseEvent>, volume: number): boolean =>
  !dragged(event) && event.intersections.every((hit) => {
    const other = (hit.object.userData as { volume?: number }).volume;
    return other === undefined || other >= volume;
  });

/** Letting places be dragged across the floor they stand on. */
export interface Dragging {
  /** Which places may be dragged. */
  ids: ReadonlySet<string>;
  /** Those of them that are dragged up and down, not across the floor. */
  upright?: ReadonlySet<string>;
  /**
   * Called as one is dragged, with where it would be: the centre of its base across and towards the
   * front, or for one that moves up and down, how high its base would be.
   */
  onMove: (id: string, to: { across: number; forward: number } | { up: number }) => void;
  /** Called when it is let go. */
  onEnd: (id: string) => void;
}

const FLOOR = new Plane(new Vector3(0, 1, 0), 0);
const WALL = new Plane();

/** Scratch, so that working out how near something is allocates nothing each frame. */
const SPOT = new Vector3();
const TONED = new Color();
const GROUND = new Color();

/**
 * Drive everything filled under a group from how near the camera is to it.
 *
 * It runs each frame and writes straight to the materials rather than through React, because this
 * changes as the camera moves and a render a frame would be a render a frame. A fill is found by
 * its `userData.skinned`, so an edge, a screen and a pick box are left alone.
 *
 * The whole of a machine clears together — the size and the place are the machine's and not the
 * piece's — because a lid that went clear before its body would be a machine coming apart rather
 * than one being looked into.
 *
 * @param group - What to drive, or a mesh on its own.
 * @param how - The size to measure nearness in, what it is made of, what the scene is set to, the
 *   colours to mix between, and whether this one stays clear whatever.
 */
export interface Skinning {
  /** How big the thing is, in metres: what nearness is measured against. */
  size: number;
  /** What it is made of, or `null` for something that is never filled, such as a room. */
  skin: string | null;
  /** What the scene is set to. */
  skins: Skins;
  /** The colours to draw it in. */
  tone: Meaning;
  theme: Theme;
  /** Whether it stays clear whatever the distance, because it is being worked or is being pointed at. */
  clear: boolean;
}

export function useSkinned(group: RefObject<Object3D | null>, how: Skinning): void {
  const skin = how.skin === null ? null : SKINS[how.skin] ?? SKINS["plain"]!;
  TONED.set(colour(skinTone(skin, how.tone), how.theme));
  GROUND.set(colour("ground", how.theme));
  const toned = TONED.clone();
  const ground = GROUND.clone();
  useFrame((state) => {
    const it = group.current;
    if (it === null) return;
    // A piece with no skin, or a scene with skins off, is drawn as it was authored: each fill goes
    // back to the fraction it carries, so turning the setting off is a return and not an
    // approximation of one.
    const off = skin === null || how.skins === "off";
    const near = off ? 1 : nearness(it.getWorldPosition(SPOT).distanceTo(state.camera.position), how.size);
    it.traverse((one) => {
      if (one.userData["skinned"] !== true) return;
      const material = (one as unknown as { material?: { opacity: number; depthWrite: boolean; color: Color } }).material;
      if (material === undefined) return;
      const was = typeof one.userData["fill"] === "number" ? (one.userData["fill"] as number) : 0;
      const loud = typeof one.userData["loud"] === "number" ? (one.userData["loud"] as number) : 1;
      const drawn = fillAt(off ? null : skin, how.skins, how.clear ? 1 : near, was, loud);
      // The authored fills are fractions of a per cent and were written against the dark theme's
      // multiplier, so off keeps that multiplier and only a skin's own fill uses the flatter one.
      material.opacity = how.theme === "dark" ? drawn.fill : Math.min(1, drawn.fill * (off ? 1.6 : 1.15));
      material.depthWrite = drawn.hides;
      // Darkened as it fills: a solid thing is an object with a lit edge, not a glowing block, and
      // a glowing block is what the bloom pass would make of a solid fill in the theme's colours.
      material.color.copy(toned).lerp(ground, drawn.darkened * 0.82);
      one.visible = drawn.fill > 0.002;
    });
  });
}

/**
 * A group whose fills are driven by how near the camera is to it.
 *
 * It is the hook as a tag, for a host that draws one machine rather than a room of them.
 *
 * @param props - What to measure and colour by, and what to draw inside.
 */
export function Skinned({ children, ...how }: Skinning & { children?: ReactNode }) {
  const body = useRef<Group>(null);
  useSkinned(body, how);
  return <group ref={body}>{children}</group>;
}

function PlaceBox({ place, theme, onPick, drag, inUse, skins = "off" }: { place: DrawnPlace; theme: Theme; onPick: (id: string) => void; drag?: Dragging | undefined;
  skins?: Skins;
  /** For the one machine being worked: how far its lid is open, which well is taken, whether its screen is lit. */
  inUse?: { open?: number; well?: { row: number; column: number }; lit?: boolean } | undefined }) {
  const controls = useThree((state) => state.controls) as unknown as { enabled: boolean } | null;
  const held = useRef<{ dx: number; dy: number; dz: number; moved: boolean } | null>(null);
  const draggable = drag?.ids.has(place.id) === true;
  const upright = drag?.upright?.has(place.id) === true;
  const bottom = place.center[1] - place.size[1] / 2;
  /** Where the pointer is on the surface a place is dragged over. */
  const under = (event: ThreeEvent<PointerEvent>): Vector3 | null => {
    if (upright) {
      // A wall through the place, facing the camera, so that it follows the pointer up and down.
      const facing = new Vector3(event.camera.position.x - place.center[0], 0, event.camera.position.z - place.center[2]);
      if (facing.lengthSq() === 0) facing.set(0, 0, 1);
      WALL.setFromNormalAndCoplanarPoint(facing.normalize(), new Vector3(...place.center));
      return event.ray.intersectPlane(WALL, new Vector3());
    }
    // The floor the place stands on, so that it follows the pointer and not the camera's depth.
    FLOOR.constant = -bottom;
    return event.ray.intersectPlane(FLOOR, new Vector3());
  };
  const edge = paint(place.tone, theme, place.strength);
  const face = colour(place.tone, theme);
  const shape = shapeFor(place);
  // A shape is drawn at the instrument's own size and then turned, so a quarter turn is undone here.
  const own: [number, number, number] = place.turn === 90 || place.turn === 270 ? [place.size[2], place.size[1], place.size[0]] : place.size;
  const volume = place.size[0] * place.size[1] * place.size[2];
  const body = useRef<Group>(null);
  // Measured against how big the thing itself is, so that a freezer is solid from further off than
  // a box on a shelf is, and both clear when somebody is at them.
  useSkinned(body, {
    size: Math.max(...place.size), skin: place.skin, skins, tone: place.tone, theme,
    clear: staysClear({ tone: place.tone, inUse: inUse !== undefined, opened: place.opened }),
  });
  return (
    <group position={place.center} ref={body}>
      {shape === null ? (
        <lineSegments scale={place.size} geometry={EDGES}>
          <lineBasicMaterial color={edge.color} transparent opacity={edge.opacity} toneMapped={false} />
        </lineSegments>
      ) : (
        <group rotation={[0, -(place.turn * Math.PI) / 180, 0]}>
          <InstrumentShape shape={shape} size={own} theme={theme} tone={place.tone} strength={place.strength} name={place.name} picked={place.picked}
                           {...(inUse === undefined ? {} : inUse)} />
        </group>
      )}
      {(place.focusable || place.fill > 0) && (
        <mesh scale={place.size} geometry={BOX}
              // A shaped place has its own parts to skin, so skinning this box too would wrap a
              // machine in a solid cube. Here it is only the box you press, and stays clear.
              userData={{ ...(place.focusable ? { volume } : {}), ...(shape === null && place.skin !== null ? { skinned: true, fill: place.fill } : {}) }}
              onPointerDown={!draggable ? undefined : (event) => {
                const at = under(event);
                if (at === null || event.button !== 0) return;
                event.stopPropagation();
                (event.target as Element).setPointerCapture(event.pointerId);
                held.current = { dx: at.x - place.center[0], dy: at.y - bottom, dz: at.z - place.center[2], moved: false };
                if (controls !== null) controls.enabled = false;
              }}
              onPointerMove={!draggable ? undefined : (event) => {
                const at = held.current === null ? null : under(event);
                if (held.current === null || at === null) return;
                held.current.moved = true;
                drag!.onMove(place.id, upright ? { up: at.y - held.current.dy } : { across: at.x - held.current.dx, forward: at.z - held.current.dz });
              }}
              onPointerUp={!draggable ? undefined : (event) => {
                if (held.current === null) return;
                (event.target as Element).releasePointerCapture(event.pointerId);
                const moved = held.current.moved;
                held.current = null;
                if (controls !== null) controls.enabled = true;
                if (moved) drag!.onEnd(place.id);
              }}
              onClick={place.focusable ? (event) => { if (meantFor(event, volume)) onPick(place.id); } : undefined}
              onPointerOver={place.focusable ? (event) => { event.stopPropagation(); document.body.style.cursor = "pointer"; } : undefined}
              onPointerOut={place.focusable ? () => { document.body.style.cursor = ""; } : undefined}>
          {/* A thing that is drawn from a shape is already drawn: this box is only what you press,
              so it is not tinted. Tinting it put a faint cube round every bench and every machine —
              the thing itself drawn once properly and once again as a crate around it. A box of
              tubes has no shape of its own, so there the tint is the box, and how full it is. */}
          <meshBasicMaterial color={face} transparent depthWrite={false} toneMapped={false}
                             opacity={shape !== null ? 0 : theme === "dark" ? place.fill : place.fill * 1.6} />
        </mesh>
      )}
    </group>
  );
}

/**
 * The tubes of a box: a quiet body with a bright rim.
 *
 * A box of solid glowing cylinders reads as one bright slab. Only the rims glow, so each tube stays
 * its own.
 */
function Tubes({ tubes, theme, onPick }: { tubes: DrawnTube[]; theme: Theme; onPick: (tube: DrawnTube) => void }) {
  const bodies = useRef<InstancedMesh>(null);
  const rims = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const body = bodies.current;
    const rim = rims.current;
    if (body === null || rim === null) return;
    const at = new Object3D();
    tubes.forEach((tube, index) => {
      const tone = tube.selected ? "ink" : tube.tone;
      at.position.set(...tube.center);
      at.scale.set(tube.radius, tube.height, tube.radius);
      at.updateMatrix();
      body.setMatrixAt(index, at.matrix);
      body.setColorAt(index, theme === "dark" ? new Color(colour(tone, theme)).multiplyScalar(tube.selected ? 0.8 : 0.34) : new Color(colour(tone, theme)));
      at.position.set(tube.center[0], tube.center[1] + tube.height / 2 + 0.0004, tube.center[2]);
      at.scale.set(tube.radius, 1, tube.radius);
      at.updateMatrix();
      rim.setMatrixAt(index, at.matrix);
      rim.setColorAt(index, theme === "dark" ? paint(tone, theme, tube.selected ? 1 : 0.6).color : new Color(colour("surface", theme)));
    });
    for (const mesh of [body, rim]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [tubes, theme]);
  if (tubes.length === 0) return null;
  return (
    <>
      <instancedMesh ref={bodies} key={`body-${tubes.length}`} args={[TUBE, undefined, tubes.length]} userData={{ volume: 0 }}
                     onClick={(event) => { if (dragged(event) || event.instanceId === undefined) return; event.stopPropagation(); onPick(tubes[event.instanceId]!); }}
                     onPointerOver={() => { document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = ""; }}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={rims} key={`rim-${tubes.length}`} args={[RING, undefined, tubes.length]}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </>
  );
}

function EmptySlots({ slots, theme }: { slots: DrawnSlot[]; theme: Theme }) {
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (instanced === null) return;
    const at = new Object3D();
    slots.forEach((slot, index) => {
      at.position.set(slot.center[0], slot.center[1] + 0.0005, slot.center[2]);
      at.scale.set(slot.radius, 1, slot.radius);
      at.updateMatrix();
      instanced.setMatrixAt(index, at.matrix);
    });
    instanced.instanceMatrix.needsUpdate = true;
    instanced.computeBoundingSphere();
  }, [slots]);
  if (slots.length === 0) return null;
  const ring = paint("dim", theme, 0.35);
  return (
    <instancedMesh ref={mesh} key={slots.length} args={[RING, undefined, slots.length]}>
      <meshBasicMaterial color={ring.color} transparent opacity={theme === "dark" ? 0.7 : 0.5} toneMapped={false} />
    </instancedMesh>
  );
}

/** Another lab: a quiet outline beside this one, and a line to it that something travels along. */
function NeighbourLab({ neighbour, from, to, theme, onPick }: {
  neighbour: Neighbour; from: [number, number, number]; to: [number, number, number]; theme: Theme; onPick?: (id: string) => void;
}) {
  const pulse = useRef<Mesh>(null);
  const curve = useMemo(() => new QuadraticBezierCurve3(new Vector3(...from), new Vector3((from[0] + to[0]) / 2, from[1] + 1.6, (from[2] + to[2]) / 2), new Vector3(...to)), [from, to]);
  const points = useMemo(() => curve.getPoints(40), [curve]);
  useFrame(({ clock }) => { pulse.current?.position.copy(curve.getPoint((clock.elapsedTime * 0.22) % 1)); });
  const edge = paint("theirs", theme, 0.7);
  const size = NEIGHBOUR_SIZE;
  return (
    <>
      <group position={[to[0] + size[0] / 2, size[1] / 2, to[2]]}>
        <lineSegments scale={size} geometry={EDGES}>
          <lineBasicMaterial color={edge.color} transparent opacity={edge.opacity} toneMapped={false} />
        </lineSegments>
        <mesh scale={size} geometry={BOX} onClick={onPick === undefined ? undefined : (event) => { if (dragged(event)) return; event.stopPropagation(); onPick(neighbour.id); }}>
          <meshBasicMaterial color={colour("theirs", theme)} transparent opacity={0.03} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
      <Line points={points} color={paint("theirs", theme, 0.5).color} lineWidth={1.2} transparent opacity={theme === "dark" ? 0.9 : 0.6} toneMapped={false} />
      <mesh ref={pulse}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshBasicMaterial color={paint("yours", theme, 1).color} toneMapped={false} />
      </mesh>
    </>
  );
}

/**
 * Moves the camera to where a view says to stand, then leaves it to the person.
 *
 * @param props - `view` is where to stand and through what lens; `motion` says whether to travel
 *   there or cut.
 */
/**
 * A way to ask the scene what it is drawing, from outside it.
 *
 * Put inside the canvas, it leaves `bionetScene` on the window: calling it walks the scene and
 * answers with every drawn object — its name, its colour, where it is and how big — and calling it
 * with a word keeps only the objects whose name or colour contains it. Nothing is worked out until
 * it is called, so this costs nothing to leave in. It is how a scene is argued with: "what is that
 * pink rectangle" is one call rather than a changed colour and another build.
 */
function Inspectable() {
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const canvas = useThree((state) => state.gl.domElement);
  useEffect(() => {
    const window_ = globalThis as unknown as { bionetScene?: unknown; bionetScenePoint?: unknown };
    window_.bionetScene = (only?: string) => describeScene(reportScene(scene, only));
    window_.bionetScenePoint = (name: string) => pointOnScreen(scene, camera, canvas.getBoundingClientRect(), name);
    return () => { delete window_.bionetScene; delete window_.bionetScenePoint; };
  }, [scene, camera, canvas]);
  return null;
}

export function Rig({ view, motion = "on" }: { view: Pick<SceneView, "pose" | "fov">; motion?: Motion }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as unknown as { target: Vector3; update: () => void } | null;
  const lens = camera as PerspectiveCamera;
  const left = useRef(0);
  const first = useRef(true);
  // Keyed on the numbers, so a view rebuilt with the same pose does not send the camera back.
  const position = useMemo(() => new Vector3(...view.pose.position), [view.pose.position.join()]);
  const target = useMemo(() => new Vector3(...view.pose.target), [view.pose.target.join()]);
  useEffect(() => { left.current = 1.6; }, [position, target, view.fov]);
  useFrame((_, delta) => {
    if (controls === null || left.current <= 0) return;
    if (first.current || motion === "off") {
      // The first look is not a journey, and with motion off no look is: start where the view says to stand.
      first.current = false;
      camera.position.copy(position);
      controls.target.copy(target);
      lens.fov = view.fov;
      left.current = 0;
    } else {
      left.current -= delta;
      const step = 1 - Math.exp(-delta * 5.5);
      camera.position.lerp(position, step);
      controls.target.lerp(target, step);
      // The lens changes with the distance, so the thing looked at stays the same size on the way.
      lens.fov = left.current <= 0 ? view.fov : lens.fov + (view.fov - lens.fov) * step;
    }
    lens.updateProjectionMatrix();
    controls.update();
  });
  return null;
}

/**
 * A lab, drawn.
 *
 * It holds no state about the lab and decides nothing about it: it is given a view from
 * `sceneView` and reports what was pressed.
 *
 * @param props - `view` is what to draw; `theme` picks the colours; `onFocus` is told which place or
 *   tube was pressed; `neighbours` are other labs to draw beside this one, and `onNeighbour` is told
 *   when one is pressed; `drag` lets some places be dragged across the floor; `motion` says whether
 *   the camera travels between views or cuts; `skins` says whether what things are made of is drawn.
 */
export function LabScene({ view, theme, onFocus, neighbours = [], onNeighbour, drag, motion = "on", skins = "off", more = [], using, children }: {
  view: SceneView; theme: Theme; onFocus: (focus: Focus) => void; neighbours?: readonly Neighbour[]; onNeighbour?: (id: string) => void;
  drag?: Dragging; motion?: Motion; skins?: Skins; more?: readonly Label[]; children?: ReactNode;
  /**
   * One machine in the room being worked, and everything pictured around it.
   *
   * It is drawn in that machine's own frame and put where the machine stands, so the room and the
   * machine are one scene: the view can go from across the room to in front of it without cutting.
   */
  using?: { place: string; placed: PlacedInUse };
}) {
  const rooms = view.places.filter((place) => place.kind === "room");
  const right = Math.max(0, ...rooms.map((room) => room.center[0] + room.size[0] / 2));
  const middle = rooms.length === 0 ? 0 : rooms.reduce((sum, room) => sum + room.center[2], 0) / rooms.length;
  const rule = paint("rule", theme, 0.5);
  const beside = neighbours.map((neighbour, index) => ({
    neighbour,
    from: [right, 1.2, middle + index * 0.4] as [number, number, number],
    to: [right + 1.2, 0.8, middle + (index - (neighbours.length - 1) / 2) * 2.6] as [number, number, number],
  }));
  const worked = using === undefined ? null : view.places.find((place) => place.id === using.place) ?? null;
  // The instrument's own frame has its base at the origin; in the room its base is under its middle.
  const under = worked === null ? null : [worked.center[0], worked.center[1] - worked.size[1] / 2, worked.center[2]] as [number, number, number];
  const picked = view.tubes.find((tube) => tube.selected);
  const labels: Label[] = [
    ...view.places.filter((place) => place.labelled).map((place): Label => ({
      key: place.id,
      // A room is named at a back corner, out of the way of what stands in it.
      at: place.kind === "room" ? [place.center[0] - place.size[0] / 2, place.center[1] + place.size[1] / 2, place.center[2] - place.size[2] / 2]
                                : [place.center[0], place.center[1] + place.size[1] / 2, place.center[2]],
      content: <span className={`tag tone-${place.tone}`}>{place.name}</span>,
      rank: place.tone === "attention" || place.tone === "found" ? 1 : place.kind === "room" ? 4 : place.kind === "instrument" ? 3 : 2,
    })),
    ...beside.map(({ neighbour, to }): Label => ({
      key: `lab ${neighbour.id}`, at: [to[0] + NEIGHBOUR_SIZE[0] / 2, NEIGHBOUR_SIZE[1], to[2]],
      content: <span className="tag tone-theirs">{neighbour.name}{neighbour.note !== undefined && <small>{neighbour.note}</small>}</span>,
      rank: 2,
    })),
    ...(picked === undefined ? [] : [{
      key: `tube ${picked.item}`, at: [picked.center[0], picked.center[1] + picked.height, picked.center[2]] as [number, number, number],
      content: <span className="tag tone-ink raised">{picked.name} · {picked.position}</span>,
      rank: 0,
    }]),
    ...(using === undefined || under === null || worked === null ? []
      : using.placed.labels.map((label): Label => ({ ...label, key: `in use ${label.key}`, at: atInstrument(label.at, under, worked.turn) }))),
    ...more,
  ];
  const layer = useRef<HTMLDivElement>(null);
  return (
    <div className="stage">
    <Canvas camera={{ fov: view.fov, near: 0.01, far: 400, position: view.pose.position }} dpr={[1, 2]} gl={{ antialias: true }}>
      <color attach="background" args={[colour("ground", theme)]} />
      <gridHelper args={[60, 60, rule.color, rule.color]} position={[0, -0.002, 0]}>
        <lineBasicMaterial attach="material" color={rule.color} transparent opacity={theme === "dark" ? 0.5 : 0.7} toneMapped={false} />
      </gridHelper>
      {view.places.map((place) => (
        <PlaceBox key={place.id} place={place} theme={theme} onPick={(id) => onFocus({ place: id })} drag={drag} skins={skins}
                  {...(using === undefined || place.id !== using.place ? {} : { inUse: { open: using.placed.open, lit: using.placed.lit, ...(using.placed.well === undefined ? {} : { well: using.placed.well }) } })} />
      ))}
      {using !== undefined && under !== null && worked !== null && (
        <group position={under}>
          <group rotation={[0, -(worked.turn * Math.PI) / 180, 0]}>
            <InUseContent placed={using.placed} theme={theme} />
          </group>
        </group>
      )}
      <EmptySlots slots={view.empty} theme={theme} />
      <Tubes tubes={view.tubes} theme={theme} onPick={(tube) => onFocus({ place: tube.place, item: tube.item })} />
      {beside.map(({ neighbour, from, to }) => (
        <NeighbourLab key={neighbour.id} neighbour={neighbour} theme={theme} onPick={onNeighbour} from={from} to={to} />
      ))}
      {children}
      <Follow labels={labels} layer={layer} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.12} maxPolarAngle={Math.PI / 2 - 0.03} minDistance={0.08} maxDistance={60} />
      <Rig view={view} motion={motion} />
      <Inspectable />
      {theme === "dark" && (
        <EffectComposer>
          <Bloom mipmapBlur intensity={0.85} luminanceThreshold={BLOOM_ABOVE} luminanceSmoothing={0.3} />
        </EffectComposer>
      )}
    </Canvas>
    <div className="pins" ref={layer}>
      {labels.map((label) => <div key={label.key} className="pin">{label.content}</div>)}
    </div>
    </div>
  );
}
