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
 *
 * Given a lab, it does not draw a space of its own at all: it hands the whole thing to `LabView`,
 * which draws the machine where it really stands with the room still around it. That is one
 * component drawing both, which is what lets the view go from across the room to in front of the
 * machine as a single move of a single camera.
 */
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useRef, type ReactNode } from "react";
import { colour, THEME_ATTRIBUTE, type Theme } from "@biolibs/bionet-theme";
import type { RecordedLab } from "@biolibs/bionet-space";
import { LabView, MotionSwitch, SkinSwitch } from "./explorer.js";
import { InstrumentShape } from "./instruments.js";
import { useMotion, type Motion } from "./motion.js";
import { useSkins, type Skins } from "./skins.js";
import { InUseContent, useInUse, type InUseHere } from "./in-use.js";
export type { StageLine } from "./in-use.js";
import { Follow, Rig, Skinned, paint, useSystemTheme } from "./scene.js";
import type { StageBeam, StageField, StageGel, StageJoining, StageLens, StageMeasure, StageMolecule, StagePlate, StageRotor, StageScale, StageTrace, StageTube, StageView } from "./shapes.js";
import type { StageLine } from "./in-use.js";

/** What a host hands over to have one instrument's use drawn, wherever it is drawn. */
interface StageProps {
  model: string;
  name: string;
  view: StageView;
  onView: (view: StageView) => void;
  screen?: readonly StageLine[];
  well?: { row: number; column: number };
  tube?: StageTube;
  lens?: (through: number) => StageLens | null;
  legend?: Partial<Record<StageTube["strands"][number]["kind"], string>>;
  molecule?: StageMolecule;
  gel?: StageGel;
  joining?: StageJoining;
  beam?: StageBeam;
  scale?: StageScale;
  field?: StageField;
  trace?: StageTrace;
  rotor?: StageRotor;
  plate?: StagePlate;
  measures?: readonly StageMeasure[];
  theme?: Theme;
  motion?: Motion;
  /** Whether what the machine is made of is drawn. Left out, it is the stage's own setting, which starts off. */
  skins?: Skins;
  seconds?: number;
  onPlayed?: () => void;
  children?: ReactNode;
}

/** Everything about the use, gathered up the way both hosts take it. */
const handedOver = (props: StageProps): InUseHere => ({
  model: props.model, name: props.name, view: props.view, onView: props.onView, screen: props.screen ?? [],
  ...(props.well === undefined ? {} : { well: props.well }),
  ...(props.tube === undefined ? {} : { tube: props.tube }),
  ...(props.lens === undefined ? {} : { lens: props.lens }),
  ...(props.legend === undefined ? {} : { legend: props.legend }),
  ...(props.molecule === undefined ? {} : { molecule: props.molecule }),
  ...(props.gel === undefined ? {} : { gel: props.gel }),
  ...(props.joining === undefined ? {} : { joining: props.joining }),
  ...(props.beam === undefined ? {} : { beam: props.beam }),
  ...(props.scale === undefined ? {} : { scale: props.scale }),
  ...(props.field === undefined ? {} : { field: props.field }),
  ...(props.trace === undefined ? {} : { trace: props.trace }),
  ...(props.rotor === undefined ? {} : { rotor: props.rotor }),
  ...(props.plate === undefined ? {} : { plate: props.plate }),
  measures: props.measures ?? [],
  ...(props.seconds === undefined ? {} : { seconds: props.seconds }),
  ...(props.onPlayed === undefined ? {} : { onPlayed: props.onPlayed }),
  ...(props.children === undefined ? {} : { panel: props.children }),
});

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
 *   instrument in the result view as a map of it; `children` is drawn beside the scene; `inLab`
 *   draws the machine where it stands in its lab instead of on a stage of its own.
 *
 * @example
 * ```tsx
 * import { InstrumentStage } from "@biolibs/bionet-scene";
 *
 * <InstrumentStage model="thermocycler" name="Thermocycler" view={view} onView={setView}
 *                  screen={[{ text: "Anneal  55 °C   0:30", lit: true }]} well={{ row: 0, column: 0 }} />
 * ```
 */
export function InstrumentStage({ inLab, ...props }: StageProps & {
  /**
   * Draw the machine where it really stands, in the lab's own scene, instead of on a stage of its
   * own. The room stays around it and the camera moves in rather than cutting, which is what makes
   * walking up to a machine and working it one thing instead of two.
   */
  inLab?: { lab: RecordedLab; labName?: string; place: string };
}) {
  if (inLab !== undefined) {
    return (
      <LabView lab={inLab.lab} name={inLab.labName ?? "Lab"} focus={{ place: inLab.place }}
               using={{ ...handedOver(props), place: inLab.place }}
               {...(props.theme === undefined ? {} : { theme: props.theme })}
               {...(props.motion === undefined ? {} : { motion: props.motion })} />
    );
  }
  return <OnItsOwnStage {...props} />;
}

/** The instrument on a floor of its own, with nothing else in the room. */
function OnItsOwnStage(props: StageProps) {
  const { theme, motion: pinned, children } = props;
  const system = useSystemTheme();
  const shown = theme ?? system;
  const [motion, flipMotion] = useMotion(pinned);
  const [skins, flipSkins] = useSkins(props.skins);
  const { placed, chrome } = useInUse(handedOver(props), motion);
  const layer = useRef<HTMLDivElement>(null);
  const rule = paint("rule", shown, 0.5);
  if (placed === null) return null;
  const { size, shape, pose, labels } = placed;

  return (
    <div className="bionet-scene stage-of" {...{ [THEME_ATTRIBUTE]: shown }}>
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
            ) : (
              // On a stage there is one machine and the camera is already at it, so it goes clear as
              // soon as somebody leans in and is solid when they stand back to see the whole of it.
              <Skinned size={Math.max(...size)} skin="plain" skins={skins} tone="yours" theme={shown} clear={false}>
                <InstrumentShape shape={shape} size={size} theme={shown} open={placed.open} well={placed.well} lit={placed.lit} motion={motion} name={props.name} />
              </Skinned>
            )}
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
      {chrome}
      <div className="settings">
        <MotionSwitch motion={motion} onFlip={flipMotion} />
        <SkinSwitch skins={skins} onFlip={flipSkins} />
      </div>
      {children !== undefined && <aside className="bench">{children}</aside>}
    </div>
  );
}
