/**
 * What is actually drawn, as a list.
 *
 * A scene of glowing edges is hard to argue with. When something in it looks wrong, the question is
 * always the same — *which object is that, how big is it and what colour* — and answering it by
 * changing a colour, building and looking again costs minutes and proves one thing at a time.
 *
 * This walks the scene and answers it directly: every drawn object, with the name it was given, its
 * colour as the theme would write it, where its middle is in the room and how big it is, in metres.
 * Nothing here draws or changes anything, and nothing is worked out until it is asked for.
 */
import { Box3, Vector3, type Camera, type Object3D } from "three";

/** One drawn object, as it ended up. */
export interface DrawnThing {
  /** The name it was given, or its type where it was given none. */
  name: string;
  /** What three.js calls it: `Mesh`, `LineSegments`, `InstancedMesh` and so on. */
  kind: string;
  /** The geometry it is drawn from, such as `PlaneGeometry`. */
  geometry: string | null;
  /** Its material's colour as `#rrggbb`, or `null` for a material with none. */
  colour: string | null;
  /** How solid it is drawn, from 0 to 1. */
  opacity: number;
  /**
   * Whether it hides what is behind it.
   *
   * A see-through thing can still be written into the depth buffer, and then it hides what is
   * behind it while looking as though it does not — which is the one way a skin can go wrong that
   * a colour and an opacity do not show.
   */
  hides: boolean;
  /** Where its middle is, in the room's own metres. */
  at: [number, number, number];
  /** How wide, tall and deep it is, in metres. */
  size: [number, number, number];
  /** Whether it and everything it hangs from are shown. */
  shown: boolean;
  /** How many of it, for one drawn many times over. */
  copies: number;
}

const round = (value: number): number => Math.round(value * 1000) / 1000;

/** Whether this object is drawn at all, rather than being a group or a camera. */
const drawn = (one: Object3D): boolean =>
  one.type === "Mesh" || one.type === "InstancedMesh" || one.type === "Line" || one.type === "LineSegments"
  || one.type === "LineLoop" || one.type === "Line2" || one.type === "Points" || one.type === "Sprite";

/** Whether this object and everything it hangs from are shown. */
const shownNow = (one: Object3D): boolean => {
  for (let at: Object3D | null = one; at !== null; at = at.parent) if (!at.visible) return false;
  return true;
};

/**
 * Every object drawn in a scene.
 *
 * @param scene - The scene, or any part of one.
 * @param only - Keep only the objects whose name or colour contains this, ignoring case.
 * @returns What is drawn, biggest first, so that whatever is covering something else is near the top.
 *
 * @example
 * ```ts
 * import { reportScene } from "@biolibs/bionet-scene";
 *
 * reportScene(scene, "f472b6");    // everything drawn in the "found" pink
 * ```
 */
export function reportScene(scene: Object3D, only?: string): DrawnThing[] {
  // Every size here is the size the thing ends up, which means the scales of everything it hangs
  // from. A renderer brings those up to date each frame; a scene nobody is drawing has not, so this
  // does it rather than quietly reporting the sizes things were written at.
  scene.updateMatrixWorld(true);
  const box = new Box3();
  const middle = new Vector3();
  const across = new Vector3();
  const things: DrawnThing[] = [];
  scene.traverse((one) => {
    if (!drawn(one)) return;
    const material = (one as unknown as { material?: { color?: { getHexString: () => string }; opacity?: number; transparent?: boolean; depthWrite?: boolean } }).material;
    const colour = material?.color === undefined ? null : `#${material.color.getHexString()}`;
    // An empty geometry gives an infinite box, which would say nothing; it is reported as nothing wide.
    box.setFromObject(one, true);
    const empty = box.isEmpty();
    if (!empty) { box.getCenter(middle); box.getSize(across); }
    things.push({
      name: one.name === "" ? one.type : one.name,
      kind: one.type,
      geometry: (one as unknown as { geometry?: { type?: string } }).geometry?.type ?? null,
      colour,
      opacity: material?.transparent === true ? (material.opacity ?? 1) : 1,
      hides: material?.depthWrite !== false,
      at: empty ? [0, 0, 0] : [round(middle.x), round(middle.y), round(middle.z)],
      size: empty ? [0, 0, 0] : [round(across.x), round(across.y), round(across.z)],
      shown: shownNow(one),
      copies: (one as unknown as { count?: number }).count ?? 1,
    });
  });
  const wanted = only === undefined ? null : only.toLowerCase();
  return things
    .filter((one) => wanted === null || one.name.toLowerCase().includes(wanted) || (one.colour ?? "").toLowerCase().includes(wanted))
    .sort((a, b) => b.size[0] * b.size[1] * b.size[2] - a.size[0] * a.size[1] * a.size[2]);
}

/**
 * The same, as lines to read.
 *
 * @param things - What `reportScene` gave.
 * @returns One line each: the name, the colour, where it is and how big, in millimetres.
 *
 * @example
 * ```ts
 * import { describeScene, reportScene } from "@biolibs/bionet-scene";
 *
 * console.log(describeScene(reportScene(scene)).join("\n"));
 * // thermocycler screen   #f472b6  at 0,0.96,-1.74  175×9×64 mm
 * ```
 */
export function describeScene(things: readonly DrawnThing[]): string[] {
  const mm = (size: readonly [number, number, number]): string => size.map((one) => Math.round(one * 1000)).join("×");
  return things.map((one) =>
    `${one.name}${one.copies > 1 ? ` ×${one.copies}` : ""}  ${one.colour ?? "—"}`
    + `${one.opacity < 1 ? ` @${one.opacity.toFixed(2)}${one.hides ? " solid" : ""}` : ""}${one.shown ? "" : "  (hidden)"}`
    + `  at ${one.at.join(",")}  ${mm(one.size)} mm`);
}

/**
 * Where something drawn in a scene is on screen.
 *
 * Everything in this scene is pressed: an instrument to work it, a box to look in, a tube to pick
 * it up. A script driving the app can read a button out of the page, but a machine on a bench is
 * not in the page, so without this there is no way to press one except by guessing at pixels.
 *
 * @param scene - The scene.
 * @param camera - The camera it is drawn with.
 * @param canvas - Where the canvas is on the page and how big it is, as `getBoundingClientRect` gives it.
 * @param name - Part of the name of the thing wanted, ignoring case. The biggest match is used, so
 *   naming an instrument finds the instrument rather than a screw on it.
 * @returns Where to press, in the page's own pixels, or `null` for a name nothing has or a thing behind the camera.
 *
 * @example
 * ```ts
 * import { pointOnScreen } from "@biolibs/bionet-scene";
 *
 * pointOnScreen(scene, camera, canvas.getBoundingClientRect(), "Thermocycler");   // [812, 907]
 * ```
 */
export function pointOnScreen(scene: Object3D, camera: Camera, canvas: { left: number; top: number; width: number; height: number },
                              name: string): [number, number] | null {
  scene.updateMatrixWorld(true);
  const wanted = name.toLowerCase();
  const box = new Box3();
  const middle = new Vector3();
  const size = new Vector3();
  let found: Vector3 | null = null;
  let biggest = -1;
  scene.traverse((one) => {
    if (!one.name.toLowerCase().includes(wanted) || !shownNow(one)) return;
    box.setFromObject(one, true);
    if (box.isEmpty()) return;
    box.getSize(size);
    const volume = size.x * size.y * size.z;
    if (volume <= biggest) return;
    biggest = volume;
    found = box.getCenter(middle).clone();
  });
  if (found === null) return null;
  const at = (found as Vector3).clone().project(camera);
  if (at.z > 1) return null;
  return [
    Math.round(canvas.left + ((at.x + 1) / 2) * canvas.width),
    Math.round(canvas.top + ((1 - at.y) / 2) * canvas.height),
  ];
}
