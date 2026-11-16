"use client";

/**
 * One instrument, in use.
 *
 * It is a space of its own, away from the lab: the instrument on the floor, looked at from the
 * views a person at it has. Three are of what the machine shows — the machine, its block with the
 * lid up, its screen. Two are of what its operator has to picture — what is in the tube, and what
 * comes out. The views are buttons, so any of them is one press away, and with motion off each is a
 * cut.
 *
 * It decides nothing about the instrument's use. What is on the screen, which well is taken and
 * what is in the tube are handed in as plain data, and whatever the host wants beside the scene is
 * its children.
 */
import { Line, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { INSTRUMENT_SIZE } from "@biolibs/bionet-space";
import { THEME_ATTRIBUTE, colour, type Meaning, type Theme } from "@biolibs/bionet-theme";
import { MotionSwitch } from "./explorer.js";
import { InstrumentShape } from "./instruments.js";
import { useMotion, type Motion } from "./motion.js";
import { InUseContent, placeInUse, poseAtInstrument, useStagePlay, type StageLine } from "./in-use.js";
export type { StageLine } from "./in-use.js";
import { LabScene, Follow, Rig, paint, useSystemTheme, type Label } from "./scene.js";
import { sceneView } from "./view.js";
import { layoutFrom, type RecordedLab } from "@biolibs/bionet-space";
import { stageViewName, type StageGel, type StageJoining, type StageMeasure, type StageMolecule } from "./shapes.js";
import { STAGE_VIEWS, STAGE_VIEW_NAMES, STEP_SECONDS, lensFrame, lidOpen, pairsOf, placeStrands, polymerasesOf, shapeOf, stagePose, type StageLens,
         type StageTube, type StageView, type StepSpeed } from "./shapes.js";

/** What each kind of strand's colour means. */
const STRAND_TONE: Readonly<Record<StageTube["strands"][number]["kind"], Meaning>> = {
  template: "ink", primer: "yours", growing: "found", long: "theirs", product: "held",
};

/** One line of the instrument's screen. */

/**
 * An instrument in use, with the views of it as buttons.
 *
 * @param props - `model` is which instrument, and `name` what the lab calls it; `view` is the view
 *   showing and `onView` is told when another is asked for; `screen` is what its screen says;
 *   `well` is the position of its block that is taken; `tube` is what is in the tube, for the view
 *   that looks into it, and `lens` gives the real bases at one place on those strands for any moment
 *   of the step; `legend` names the kinds of strand drawn there; `theme` and `motion` pin
 *   what otherwise follows the system; `seconds` sets how long a step in the tube takes to play, in
 *   place of the speed chosen in the scene, and `onPlayed` is told each time one finishes playing,
 *   which is how a host runs one step into the next; `measures` are lengths to mark off under the
 *   strands in the tube, each from one base to another; `joining` is pieces being joined, drawn
 *   in the tube view where there are no strands to draw; `gel` is a gel that has been run, drawn above the
 *   instrument in the result view; `molecule` is what was made, drawn above the
 *   instrument in the result view as a map of it; `children` is drawn beside the scene.
 *
 * @example
 * ```tsx
 * import { InstrumentStage } from "@biolibs/bionet-scene";
 *
 * <InstrumentStage model="thermocycler" name="Thermocycler" view={view} onView={setView}
 *                  screen={[{ text: "Anneal  55 °C   0:30", lit: true }]} well={{ row: 0, column: 0 }} />
 * ```
 */
/**
 * The real bases at one place on the strands, written out.
 *
 * Two rows of letters, each base over the one it pairs with, with a mark between the ones that are
 * paired. Bases are letters as well as colours, so colour is never the only cue.
 *
 * @param props - `lens` is the bases and which are paired.
 */
export function BaseLens({ lens }: { lens: StageLens }) {
  const row = (strand: StageLens["upper"], ends: [string, string]): ReactNode => (
    <div className="strand">
      <span className="end">{ends[0]}</span>
      {strand.cells.map((cell, at) => (
        <span key={at} className={`base ${cell.base === "" ? "none" : `base-${cell.base.toLowerCase()}`} ${cell.state}${lens.polymerase === at ? " next" : ""}`}>{cell.base === "" ? "·" : cell.base}</span>
      ))}
      <span className="end">{ends[1]}</span>
      <span className="what">{strand.label}</span>
    </div>
  );
  const paired = lens.joined.filter(Boolean).length;
  return (
    <div className="lens" role="img"
         aria-label={`Bases ${lens.from + 1} to ${lens.to} of the template. ${lens.upper.label}: ${lens.upper.cells.map((cell) => cell.base || "-").join("")}. ${lens.lower.label}: ${lens.lower.cells.map((cell) => cell.base || "-").join("")}. ${paired} of ${lens.joined.length} places are paired.`}>
      {row(lens.upper, ["5′", "3′"])}
      <div className="strand pairs" aria-hidden="true">
        <span className="end" />
        {lens.joined.map((joined, at) => <span key={at} className={joined ? "base pair" : "base"}>{joined ? "|" : ""}</span>)}
        <span className="end" />
        <span className="what">{lens.beyond > 0 ? `${lens.beyond.toLocaleString("en-US")} more to copy` : `bases ${(lens.from + 1).toLocaleString("en-US")}–${lens.to.toLocaleString("en-US")}`}</span>
      </div>
      {row(lens.lower, ["3′", "5′"])}
    </div>
  );
}

export function InstrumentStage({ model, name, view, onView, screen = [], well, tube, lens, legend, molecule, gel, joining, measures = [], theme, motion: pinned, seconds, onPlayed, children, inLab }: {
  model: string; name: string; view: StageView; onView: (view: StageView) => void; screen?: readonly StageLine[];
  well?: { row: number; column: number }; tube?: StageTube; lens?: (through: number) => StageLens | null;
  legend?: Partial<Record<StageTube["strands"][number]["kind"], string>>;
  molecule?: StageMolecule; gel?: StageGel; joining?: StageJoining; measures?: readonly StageMeasure[]; theme?: Theme; motion?: Motion; seconds?: number; onPlayed?: () => void; children?: ReactNode;
  /**
   * Draw the machine where it really stands, in the lab's own scene, instead of on a stage of its
   * own. The room stays around it and the camera moves in rather than cutting, which is what makes
   * walking up to a machine and working it one thing instead of two.
   */
  inLab?: { lab: RecordedLab; labName?: string; place: string };
}) {
  const system = useSystemTheme();
  const shown = theme ?? system;
  const [motion, flipMotion] = useMotion(pinned);
  const moving = view === "tube" && tube !== undefined && tube.strands.some((one) => one.moves !== undefined);
  const scene = useMemo(() => JSON.stringify(tube?.strands ?? []), [tube]);
  const { through, setThrough, playing, setPlaying, speed, setSpeed } = useStagePlay({ moving, scene, motion, seconds, onPlayed });
  // What is drawn here is worked out the same way the lab works it out, so that a machine on its own
  // and the same machine standing on a bench are one picture seen from two distances.
  const placed = useMemo(() => placeInUse({ model, view, screen, well, tube, lens, molecule, gel, joining, measures }, through),
                         [model, view, screen, well, tube, lens, molecule, gel, joining, measures, through]);
  const { size, shape, pose, close, kinds } = placed;
  const layer = useRef<HTMLDivElement>(null);
  const rule = paint("rule", shown, 0.5);

  const labels = placed.labels;

  // In the lab: the same machine, drawn where it stands, with the room still around it.
  const inRoom = useMemo(() => {
    if (inLab === undefined) return null;
    const seen = sceneView(layoutFrom(inLab.lab, { room: inLab.labName ?? "Lab" }), { place: inLab.place }, { labName: inLab.labName ?? "Lab" });
    const stood = seen.places.find((one) => one.id === inLab.place);
    if (stood === undefined) return null;
    const under: [number, number, number] = [stood.center[0], stood.center[1] - stood.size[1] / 2, stood.center[2]];
    const looking = poseAtInstrument(placed, under, stood.turn);
    return { ...seen, pose: looking.pose, fov: looking.fov };
  }, [inLab, placed]);

  return (
    <div className="bionet-scene stage-of" {...{ [THEME_ATTRIBUTE]: shown }}>
      {inRoom !== null && inLab !== undefined ? (
        // The lab brings its own canvas and its own pins, so this one steps out of the way.
        <LabScene view={inRoom} theme={shown} motion={motion} onFocus={() => undefined} using={{ place: inLab.place, placed }} />
      ) : (
      <div className="stage">
        <Canvas camera={{ fov: pose.fov, near: 0.01, far: 100, position: pose.position }} dpr={[1, 2]} gl={{ antialias: true }}>
          <color attach="background" args={[colour("ground", shown)]} />
          <gridHelper args={[12, 48, rule.color, rule.color]} position={[0, -0.001, 0]}>
            <lineBasicMaterial attach="material" color={rule.color} transparent opacity={shown === "dark" ? 0.45 : 0.7} toneMapped={false} />
          </gridHelper>
          <group position={[0, size[1] / 2, 0]}>
            {shape === null ? (
              <lineSegments scale={size}>
                <boxGeometry args={[1, 1, 1]} />
                <lineBasicMaterial color={paint("yours", shown, 1).color} toneMapped={false} />
              </lineSegments>
            ) : <InstrumentShape shape={shape} size={size} theme={shown} open={placed.open} well={well} lit={screen.length > 0} motion={motion} />}
          </group>
          <InUseContent placed={placed} theme={shown} />
          <Follow labels={labels} layer={layer} />
          <OrbitControls makeDefault enableDamping={motion === "on"} dampingFactor={0.12} maxPolarAngle={Math.PI / 2 - 0.03} minDistance={0.15} maxDistance={8} />
          <Rig view={{ pose, fov: pose.fov }} motion={motion} />
        </Canvas>
        <div className="pins" ref={layer}>
          {labels.map((label) => <div key={label.key} className="pin">{label.content}</div>)}
        </div>
      </div>
      )}
      <nav className="crumbs views" aria-label={`Views of ${name}`}>
        <strong>{name}</strong>
        {STAGE_VIEWS.map((one) => (
          <button key={one} type="button" aria-pressed={one === view} className={one === view ? "on" : undefined} onClick={() => onView(one)}>{stageViewName(model, one)}</button>
        ))}
      </nav>
      {close !== null && <BaseLens lens={close} />}
      {view === "tube" && kinds.length > 0 && (
        <ul className="legend" aria-label="What the lines are">
          {kinds.map((kind) => <li key={kind}><span className={`swatch tone-${STRAND_TONE[kind]}`} />{legend?.[kind] ?? kind}</li>)}
        </ul>
      )}
      {moving && (
        <div className="playback" role="group" aria-label="This step, played out">
          {motion === "on" ? (
            <button type="button" onClick={() => { if (through >= 1) setThrough(0); setPlaying(through >= 1 ? true : !playing); }}>
              {playing ? "Pause" : through >= 1 ? "Play again" : "Play"}
            </button>
          ) : (
            <>
              <button type="button" aria-pressed={through <= 0} onClick={() => setThrough(0)}>Before</button>
              <button type="button" aria-pressed={through >= 1} onClick={() => setThrough(1)}>After</button>
            </>
          )}
          <input type="range" min={0} max={1000} step={1} value={Math.round(through * 1000)} aria-label="How far through the step"
                 onChange={(event) => { setPlaying(false); setThrough(Number(event.target.value) / 1000); }} />
          {motion === "on" && seconds === undefined && (["slow", "usual", "fast"] as const).map((one) => (
            <button key={one} type="button" aria-pressed={one === speed} onClick={() => setSpeed(one)}>{one === "usual" ? "Normal" : one === "slow" ? "Slow" : "Fast"}</button>
          ))}
        </div>
      )}
      <MotionSwitch motion={motion} onFlip={flipMotion} />
      {children !== undefined && <aside className="bench">{children}</aside>}
    </div>
  );
}
