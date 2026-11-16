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
import { Follow, Rig, paint, useSystemTheme, type Label } from "./scene.js";
import { STAGE_VIEWS, STAGE_VIEW_NAMES, STEP_SECONDS, lensFrame, lidOpen, pairsOf, placeStrands, polymerasesOf, shapeOf, stagePose, type StageLens,
         type StageTube, type StageView, type StepSpeed } from "./shapes.js";

/** What each kind of strand's colour means. */
const STRAND_TONE: Readonly<Record<StageTube["strands"][number]["kind"], Meaning>> = {
  template: "ink", primer: "yours", growing: "found", long: "theirs", product: "held",
};

/** One line of the instrument's screen. */
export interface StageLine {
  /** What it says. */
  text: string;
  /** Whether it is the line the machine is on. */
  lit?: boolean;
}

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
 *   which is how a host runs one step into the next; `children` is drawn beside the scene.
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

export function InstrumentStage({ model, name, view, onView, screen = [], well, tube, lens, legend, theme, motion: pinned, seconds, onPlayed, children }: {
  model: string; name: string; view: StageView; onView: (view: StageView) => void; screen?: readonly StageLine[];
  well?: { row: number; column: number }; tube?: StageTube; lens?: (through: number) => StageLens | null;
  legend?: Partial<Record<StageTube["strands"][number]["kind"], string>>;
  theme?: Theme; motion?: Motion; seconds?: number; onPlayed?: () => void; children?: ReactNode;
}) {
  const system = useSystemTheme();
  const shown = theme ?? system;
  const [motion, flipMotion] = useMotion(pinned);
  const shape = shapeOf(model);
  const size = useMemo((): [number, number, number] => [...(INSTRUMENT_SIZE[model] ?? [0.4, 0.3, 0.4])] as [number, number, number], [model]);
  const pose = useMemo(() => stagePose(view, size, shape), [view, size, shape]);
  // What is in the tube plays out over a few seconds, slowly enough to follow: strands part, primers
  // land, copies grow. It can be paused, slowed, and dragged to any moment. With motion off it does
  // not play by itself, and shows the step finished until somebody drags it.
  const [through, setThrough] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<StepSpeed>("usual");
  const played = useRef(onPlayed);
  played.current = onPlayed;
  const reached = useRef(1);
  reached.current = through;
  const moving = view === "tube" && tube !== undefined && tube.strands.some((one) => one.moves !== undefined);
  const scene = useMemo(() => JSON.stringify(tube?.strands ?? []), [tube]);
  useEffect(() => {
    setThrough(motion === "on" && moving ? 0 : 1);
    setPlaying(motion === "on" && moving);
    // With motion off a step does not play, so a host running one step into the next is told after
    // a moment's hold: the run still goes through, as a series of cuts.
    if (motion === "on" || !moving) return;
    const held = setTimeout(() => played.current?.(), 700);
    return () => clearTimeout(held);
  }, [scene, moving, motion]);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now: number) {
      const passed = (now - last) / 1000;
      last = now;
      // Kept beside the state, so that the end of the step is known here and now, not at the next draw.
      const next = Math.min(1, reached.current + passed / (seconds ?? STEP_SECONDS[speed]));
      reached.current = next;
      setThrough(next);
      if (next >= 1) { setPlaying(false); played.current?.(); return; }
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, seconds]);
  const strands = useMemo(() => (tube === undefined || view !== "tube" ? [] : placeStrands(tube, size, through)), [tube, view, size, through]);
  const close = useMemo(() => (view === "tube" && tube !== undefined ? lens?.(through) ?? null : null), [view, tube, lens, through]);
  const pairs = useMemo(() => pairsOf(strands), [strands]);
  const polymerases = useMemo(() => polymerasesOf(strands), [strands]);
  const layer = useRef<HTMLDivElement>(null);
  const rule = paint("rule", shown, 0.5);

  const point = (at: readonly [number, number, number]): [number, number, number] => [at[0] * size[0], size[1] / 2 + at[1] * size[1], at[2] * size[2]];
  const labels: Label[] = [
    // The screen is read where it is on the machine, small from across the bench and large up close.
    ...(shape?.screen === undefined || screen.length === 0 || view === "tube" || view === "block" ? [] : [{
      key: "screen", at: point(shape.screen.at), rank: 0,
      content: (
        <div className={view === "screen" ? "lcd large" : "lcd"}>
          {(view === "screen" ? screen : screen.filter((line) => line.lit === true).slice(0, 1)).map((line, at) => (
            <div key={at} className={line.lit === true ? "lit" : undefined}>{line.text}</div>
          ))}
        </div>
      ),
    }]),
    ...strands.flatMap((one, at): Label[] => (one.presence >= 1 && Math.abs(one.end[0] - one.start[0]) > 0.02 && (one.kind === "template" || one.kind === "long" || one.kind === "product") ? [
      { key: `five ${at}`, at: one.points === "right" ? one.start : one.end, rank: 2, content: <span className="end">5′</span> },
      { key: `three ${at}`, at: one.points === "right" ? one.end : one.start, rank: 2, content: <span className="end">3′</span> },
    ] : [])),
  ];
  const kinds = [...new Set(strands.map((one) => one.kind))];

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
            ) : <InstrumentShape shape={shape} size={size} theme={shown} open={lidOpen(view)} well={well} lit={screen.length > 0} motion={motion} />}
          </group>
          {strands.map((one, at) => {
            if (one.presence <= 0 || Math.abs(one.end[0] - one.start[0]) < 1e-6) return null;
            const tone = paint(STRAND_TONE[one.kind], shown, one.kind === "template" ? 0.45 : 0.9);
            tone.opacity *= one.presence;
            const [from, to] = one.points === "right" ? [one.start, one.end] : [one.end, one.start];
            // A barb at the 3′ end, so the way a strand is copied can be read off it.
            const back = from[0] < to[0] ? -0.012 : 0.012;
            return (
              <group key={at}>
                <Line points={[one.start, one.end]} color={tone.color} lineWidth={one.kind === "primer" ? 5 : one.kind === "template" ? 2 : 3.2} transparent opacity={tone.opacity} toneMapped={false} />
                <Line points={[[to[0] + back, to[1] + 0.008, to[2]], to, [to[0] + back, to[1] - 0.008, to[2]]]} color={tone.color} lineWidth={2} transparent opacity={tone.opacity} toneMapped={false} />
              </group>
            );
          })}
          {pairs.length > 0 && (
            <Line segments points={pairs.flatMap((one): [number, number, number][] => [[one.x, one.top, 0], [one.x, one.bottom, 0]])}
                  vertexColors={pairs.flatMap((one): [number, number, number][] => { const tone = paint("dim", shown, 0.2 + 0.5 * one.presence).color; return [[tone.r, tone.g, tone.b], [tone.r, tone.g, tone.b]]; })}
                  lineWidth={1.4} transparent opacity={shown === "dark" ? 0.9 : 0.7} toneMapped={false} />
          )}
          {close !== null && tube !== undefined && (
            <Line points={lensFrame(close, tube.length, size)} color={paint("found", shown, 0.8).color} lineWidth={1.5} dashed dashSize={0.006} gapSize={0.004} toneMapped={false} />
          )}
          {polymerases.map((at, index) => (
            <mesh key={index} position={at}>
              <sphereGeometry args={[0.009, 16, 12]} />
              <meshBasicMaterial color={paint("found", shown, 1).color} toneMapped={false} />
            </mesh>
          ))}
          <Follow labels={labels} layer={layer} />
          <OrbitControls makeDefault enableDamping={motion === "on"} dampingFactor={0.12} maxPolarAngle={Math.PI / 2 - 0.03} minDistance={0.15} maxDistance={8} />
          <Rig view={{ pose, fov: pose.fov }} motion={motion} />
        </Canvas>
        <div className="pins" ref={layer}>
          {labels.map((label) => <div key={label.key} className="pin">{label.content}</div>)}
        </div>
      </div>
      <nav className="crumbs views" aria-label={`Views of ${name}`}>
        <strong>{name}</strong>
        {STAGE_VIEWS.map((one) => (
          <button key={one} type="button" aria-pressed={one === view} className={one === view ? "on" : undefined} onClick={() => onView(one)}>{STAGE_VIEW_NAMES[one]}</button>
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
