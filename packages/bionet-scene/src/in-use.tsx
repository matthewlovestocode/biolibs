"use client";

/**
 * A machine in use, drawn: everything that appears around an instrument while somebody is working it.
 *
 * This is kept apart from the window that shows it because the same thing has to be drawn in two
 * places. On its own stage an instrument stands at the origin with nothing else in the room. In the
 * lab it stands on a bench, and what is being pictured above it — strands, a molecule, a gel, pieces
 * closing — has to appear in the room, at that bench, so that the view can go from the room to the
 * machine without cutting. Both of those draw what is worked out here, in the instrument's own
 * frame, and the lab puts that frame where the instrument stands.
 */
import { Line } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Meaning, Theme } from "@biolibs/bionet-theme";
import { Beam, Field, GelSlab, Joining, Molecule, Plate, Rotor, Scale, Trace, beamLabels, fieldLabels, gelLabels, joiningLabels, moleculeLabels, plateLabels, rotorLabels, scaleLabels, traceLabels } from "./molecule.js";
import type { Motion } from "./motion.js";
import { paint, type Label } from "./scene.js";
import { INSTRUMENT_SIZE } from "@biolibs/bionet-space";
import { MOLECULE_RADIUS, STAGE_VIEWS, STEP_SECONDS, lensFrame, lidOpen, measureLine, moleculeCentre, pairsOf, placeGel, placeJoining,
         placeBeam, placeField, placeMolecule, placePlate, placeRotor, placeScale, placeStrands, placeTrace, polymerasesOf, shapeOf, stagePose, stageViewName, type PlacedBeam, type PlacedField, type PlacedGel, type PlacedJoining,
         type PlacedMolecule, type PlacedStrand, type Rung, type StageGel, type StageJoining, type StageLens,
         type PlacedPlate, type PlacedRotor, type PlacedScale, type PlacedTrace, type StageBeam, type StageField, type StageMeasure, type StageMolecule, type StagePlate, type StageRotor, type StageScale, type StageTrace, type StageTube, type StageView, type StepSpeed } from "./shapes.js";

/** What colour each kind of strand is drawn in. */
const STRAND_TONE: Readonly<Record<StageTube["strands"][number]["kind"], Meaning>> = {
  template: "ink", primer: "yours", growing: "found", long: "theirs", product: "good",
};

export interface StageLine {
  /** What it says. */
  text: string;
  /** Whether it is the line the machine is on. */
  lit?: boolean;
}

/** What is going on at an instrument, as a host hands it over. */
export interface InUse {
  /** Which model of instrument, for its shape and its size. */
  model: string;
  /** Which of the five views is being looked at. */
  view: StageView;
  /** What its screen says. Its being lit at all is what having any lines means. */
  screen?: readonly StageLine[];
  /** The well the tube is in. */
  well?: { row: number; column: number };
  /** The strands in the tube. */
  tube?: StageTube;
  /** The real bases at one place on them, for any moment of the step. */
  lens?: (through: number) => StageLens | null;
  /** A molecule to picture: what a run made, or what is in the tube when no strands are drawn. */
  molecule?: StageMolecule;
  /** A gel that has been run. */
  gel?: StageGel;
  /** Pieces being joined. */
  joining?: StageJoining;
  /** Light going through a cuvette, for an instrument whose whole job is how much came out. */
  beam?: StageBeam;
  /** A reading set on a scale, with the ranges that matter marked on it. */
  scale?: StageScale;
  /** The field inside a cuvette, for the machine that puts DNA in by breaking cells open. */
  field?: StageField;
  /** A lane drawn as a profile along it, which is where an exposure that has burnt out shows. */
  trace?: StageTrace;
  /** A rotor seen from above, with what is in it and where that pulls. */
  rotor?: StageRotor;
  /** A plate seen from above, with what has come up on it. */
  plate?: StagePlate;
  /** Lengths marked off under the strands. */
  measures?: readonly StageMeasure[];
}

/** Everything about a machine in use, worked out: where the camera goes, and what to draw. */
export interface PlacedInUse {
  /** How wide, tall and deep the instrument is, in metres. */
  size: [number, number, number];
  /** What it is made of, or `null` for a model drawn as a plain box. */
  shape: ReturnType<typeof shapeOf>;
  /** Where to look from, in the instrument's own frame, and how wide. */
  pose: ReturnType<typeof stagePose>;
  /** How far open its lid is, from 0 to 1. */
  open: number;
  /** The well the tube is in, carried through so a host can mark it. */
  well: { row: number; column: number } | undefined;
  /** The strands, placed. */
  strands: PlacedStrand[];
  /** The base pairs between them. */
  pairs: Rung[];
  /** Where each polymerase is. */
  polymerases: [number, number, number][];
  /** The real bases at this moment, if any are being read. */
  close: StageLens | null;
  /** The frame drawn round the stretch they are of. */
  frame: [number, number, number][] | null;
  /** A molecule pictured above it, if one is. */
  molecule: PlacedMolecule | null;
  /** A gel that has been run, if one has. */
  gel: PlacedGel | null;
  /** Pieces closing, if any are. */
  joining: PlacedJoining | null;
  /** Light going through a cuvette, if any is. */
  beam: PlacedBeam | null;
  /** A reading on a scale, if one is being shown. */
  scale: PlacedScale | null;
  /** The field inside a cuvette, if one is being shown. */
  field: PlacedField | null;
  /** A lane as a profile, if one is being shown. */
  trace: PlacedTrace | null;
  /** A rotor seen from above, if one is being shown. */
  rotor: PlacedRotor | null;
  /** A plate seen from above, if one is being shown. */
  plate: PlacedPlate | null;
  /** Lengths marked off, each with where to write it. */
  measures: { points: [number, number, number][]; at: [number, number, number]; label: string }[];
  /** What is written over it, at points in its own frame. */
  labels: Label[];
  /** Which kinds of strand are drawn, for a legend. */
  kinds: StageTube["strands"][number]["kind"][];
  /** Whether anything in the tube moves during this step. */
  moving: boolean;
  /** Whether the machine's screen is saying anything, which is the only reason to light it. */
  lit: boolean;
  /** The wavelength the beam is, in nanometres, for drawing it as the light it is. */
  nm: number;
}

/**
 * Work out everything that is drawn at an instrument in use.
 *
 * @param what - What is going on there.
 * @param through - How far through the step being played, from 0 to 1.
 * @returns Where to look from and what to draw, all in the instrument's own frame.
 */
export function placeInUse(what: InUse, through: number): PlacedInUse {
  const { model, view, screen = [], tube, lens, molecule, gel, joining, beam, scale, field, trace, rotor, plate, measures = [] } = what;
  const shape = shapeOf(model);
  const size: [number, number, number] = [...(INSTRUMENT_SIZE[model] ?? [0.4, 0.3, 0.4])] as [number, number, number];
  // A molecule is pictured, not seen: where the DNA is thought about, in the tube if nothing else is
  // drawn there, and as the result.
  // Light going through the cuvette is what is in the tube for the one instrument that reads one,
  // and it takes that view from anything else that would have had it.
  const shining = view === "tube" && beam !== undefined;
  const pulsing = view === "tube" && field !== undefined;
  const profiled = view === "screen" && trace !== undefined;
  const spinning = view === "block" && rotor !== undefined;
  const plated = view === "tube" && plate !== undefined;
  const made = molecule !== undefined && (view === "result" || (view === "tube" && tube === undefined && !shining && !pulsing));
  // A gel is drawn wherever the machine is looking at one: as the result of running it, and, for
  // the machine whose whole job is looking at a gel, in the view that looks at it.
  const ran = gel !== undefined && (view === "result" || view === "block");
  const set = view === "result" && scale !== undefined;
  const fitting = view === "tube" && joining !== undefined && tube === undefined && !shining && !pulsing;
  const wide = made || ran || fitting || shining || set || pulsing || profiled || spinning || plated;
  const pose = stagePose(wide ? "result" : view, size, shape, wide);
  const centre = moleculeCentre(size);
  const placedMolecule = made ? placeMolecule(molecule, centre, pose.position, MOLECULE_RADIUS) : null;
  const placedGel = ran ? placeGel(gel, centre, pose.position, [MOLECULE_RADIUS * 2.3, MOLECULE_RADIUS * 2.1]) : null;
  const placedJoining = fitting ? placeJoining(joining, centre, pose.position, MOLECULE_RADIUS) : null;
  const placedBeam = shining ? placeBeam(beam, centre, pose.position, [MOLECULE_RADIUS * 2.8, MOLECULE_RADIUS * 1.9]) : null;
  // A scale and a molecule are both pictured, and both in the result view, so the scale is set below
  // the molecule rather than through it: the number and the thing it is about, one above the other.
  const under: [number, number, number] = [centre[0], centre[1] - (made ? MOLECULE_RADIUS * 1.7 : 0), centre[2]];
  const placedScale = set ? placeScale(scale, under, pose.position, [MOLECULE_RADIUS * 3, MOLECULE_RADIUS * 1.2]) : null;
  const placedField = pulsing ? placeField(field, centre, pose.position, [MOLECULE_RADIUS * 2.8, MOLECULE_RADIUS * 1.5]) : null;
  const placedTrace = profiled ? placeTrace(trace, centre, pose.position, [MOLECULE_RADIUS * 3.2, MOLECULE_RADIUS * 1.6]) : null;
  const placedRotor = spinning ? placeRotor(rotor, centre, pose.position, MOLECULE_RADIUS * 1.2) : null;
  const placedPlate = plated ? placePlate(plate, centre, pose.position, MOLECULE_RADIUS * 1.15) : null;
  const strands = tube === undefined || view !== "tube" ? [] : placeStrands(tube, size, through);
  const close = view === "tube" && tube !== undefined ? lens?.(through) ?? null : null;
  const marked = view === "tube" && tube !== undefined
    ? measures.map((one, at) => ({ ...measureLine(one, tube.length, size, at), label: one.label })) : [];

  const point = (at: readonly [number, number, number]): [number, number, number] => [at[0] * size[0], size[1] / 2 + at[1] * size[1], at[2] * size[2]];
  // From across the bench a screen is one line: the one the machine is on, or, for a machine that is
  // on but not running, its first. Reading only the lit line would leave a machine saying
  // "No programme" showing an empty lit box, which is the scene inventing a state the machine is not in.
  const nearLines = screen.filter((line) => line.lit === true).slice(0, 1);
  const oneLine = nearLines.length > 0 ? nearLines : screen.slice(0, 1);
  const shows = view === "screen" ? screen : oneLine;
  const labels: Label[] = [
    // The screen is read where it is on the machine, small from across the bench and large up close.
    ...(shape?.screen === undefined || shows.length === 0 || view === "tube" || view === "block" ? [] : [{
      key: "screen", at: point(shape.screen.at), rank: 0,
      content: (
        <div className={view === "screen" ? "lcd large" : "lcd"}>
          {shows.map((line, at) => (
            <div key={at} className={line.lit === true ? "lit" : undefined}>{line.text}</div>
          ))}
        </div>
      ),
    } satisfies Label]),
    ...strands.flatMap((one, at): Label[] => (one.presence >= 1 && Math.abs(one.end[0] - one.start[0]) > 0.02
      && (one.kind === "template" || one.kind === "long" || one.kind === "product") ? [
      { key: `five ${at}`, at: one.points === "right" ? one.start : one.end, rank: 2, content: <span className="end">5′</span> },
      { key: `three ${at}`, at: one.points === "right" ? one.end : one.start, rank: 2, content: <span className="end">3′</span> },
    ] : [])),
    ...(placedMolecule === null ? [] : moleculeLabels(placedMolecule)),
    ...(placedGel === null ? [] : gelLabels(placedGel)),
    ...(placedJoining === null ? [] : joiningLabels(placedJoining)),
    ...(placedBeam === null ? [] : beamLabels(placedBeam)),
    ...(placedScale === null ? [] : scaleLabels(placedScale)),
    ...(placedField === null ? [] : fieldLabels(placedField)),
    ...(placedTrace === null ? [] : traceLabels(placedTrace)),
    ...(placedRotor === null ? [] : rotorLabels(placedRotor)),
    ...(placedPlate === null ? [] : plateLabels(placedPlate)),
    ...marked.map((one, at): Label => ({ key: `measure ${at}`, at: one.at, rank: 1, content: <span className="measure">{one.label}</span> })),
  ];
  return {
    size, shape, pose, open: lidOpen(view), well: what.well, strands, pairs: pairsOf(strands), polymerases: polymerasesOf(strands),
    close, frame: close === null || tube === undefined ? null : lensFrame(close, tube.length, size),
    molecule: placedMolecule, gel: placedGel, joining: placedJoining, beam: placedBeam, scale: placedScale, field: placedField, trace: placedTrace, rotor: placedRotor, plate: placedPlate, measures: marked, labels,
    kinds: [...new Set(strands.map((one) => one.kind))], moving: view === "tube" && tube !== undefined && tube.strands.some((one) => one.moves !== undefined),
    // A machine with nothing chosen yet is sitting there dark. Lighting it regardless would be the
    // scene saying something the machine is not.
    lit: screen.length > 0,
    nm: beam?.nm ?? 0,
  };
}

/**
 * What is drawn around an instrument in use. It goes inside a canvas, in the instrument's own frame.
 *
 * @param props - `placed` is from `placeInUse`; `theme` is the theme to paint it in.
 */
export function InUseContent({ placed, theme }: { placed: PlacedInUse; theme: Theme }) {
  return (
    <>
      {placed.strands.map((one, at) => {
        if (one.presence <= 0 || Math.abs(one.end[0] - one.start[0]) < 1e-6) return null;
        const tone = paint(STRAND_TONE[one.kind], theme, one.kind === "template" ? 0.45 : 0.9);
        tone.opacity *= one.presence;
        const [from, to] = one.points === "right" ? [one.start, one.end] : [one.end, one.start];
        // A barb at the 3′ end, so the way a strand is copied can be read off it.
        const back = from[0] < to[0] ? -0.012 : 0.012;
        return (
          <group key={at}>
            <Line points={[one.start, one.end]} color={tone.color} transparent opacity={tone.opacity} toneMapped={false}
                  lineWidth={one.kind === "primer" ? 5 : one.kind === "template" ? 2 : 3.2} />
            <Line points={[[to[0] + back, to[1] + 0.008, to[2]], to, [to[0] + back, to[1] - 0.008, to[2]]]} color={tone.color}
                  lineWidth={2} transparent opacity={tone.opacity} toneMapped={false} />
          </group>
        );
      })}
      {placed.pairs.length > 0 && (
        <Line segments points={placed.pairs.flatMap((one): [number, number, number][] => [[one.x, one.top, 0], [one.x, one.bottom, 0]])}
              vertexColors={placed.pairs.flatMap((one): [number, number, number][] => {
                const tone = paint("dim", theme, 0.2 + 0.5 * one.presence).color;
                return [[tone.r, tone.g, tone.b], [tone.r, tone.g, tone.b]];
              })}
              lineWidth={1.4} transparent opacity={theme === "dark" ? 0.9 : 0.7} toneMapped={false} />
      )}
      {placed.frame !== null && (
        <Line points={placed.frame} color={paint("found", theme, 0.8).color} lineWidth={1.5} dashed dashSize={0.006} gapSize={0.004} toneMapped={false} />
      )}
      {placed.polymerases.map((at, index) => (
        <mesh key={index} position={at}>
          <sphereGeometry args={[0.009, 16, 12]} />
          <meshBasicMaterial color={paint("found", theme, 1).color} toneMapped={false} />
        </mesh>
      ))}
      {placed.molecule !== null && <Molecule placed={placed.molecule} theme={theme} />}
      {placed.gel !== null && <GelSlab placed={placed.gel} theme={theme} />}
      {placed.joining !== null && <Joining placed={placed.joining} theme={theme} />}
      {placed.beam !== null && <Beam placed={placed.beam} nm={placed.nm} theme={theme} />}
      {placed.scale !== null && <Scale placed={placed.scale} theme={theme} />}
      {placed.field !== null && <Field placed={placed.field} theme={theme} />}
      {placed.trace !== null && <Trace placed={placed.trace} theme={theme} />}
      {placed.rotor !== null && <Rotor placed={placed.rotor} theme={theme} />}
      {placed.plate !== null && <Plate placed={placed.plate} theme={theme} />}
      {placed.measures.map((one, at) => (
        <Line key={at} points={one.points} color={paint("ink", theme, 0.6).color} lineWidth={1.5} transparent opacity={0.8} toneMapped={false} />
      ))}
    </>
  );
}

/**
 * The moment of the step being looked at, and how it plays.
 *
 * A step plays out over a few seconds, slowly enough to follow: strands part, primers land, copies
 * grow. It can be paused, slowed, and dragged to any moment. With motion off it does not play by
 * itself and shows the step finished, and a host running one step into the next is told after a
 * moment's hold, so the run still goes through as a series of cuts.
 *
 * @param options - `moving` is whether anything moves in this step; `scene` changes when the step
 *   does; `motion` is the setting; `seconds` pins how long a step takes; `onPlayed` is told when one finishes.
 * @returns How far through, a way to set it, whether it is playing, and the speed.
 */
export function useStagePlay({ moving, scene, motion, seconds, onPlayed }: {
  moving: boolean; scene: string; motion: Motion; seconds?: number | undefined; onPlayed?: (() => void) | undefined;
}): { through: number; setThrough: (to: number) => void; playing: boolean; setPlaying: (to: boolean) => void; speed: StepSpeed; setSpeed: (to: StepSpeed) => void } {
  const [through, setThrough] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<StepSpeed>("usual");
  const played = useRef(onPlayed);
  played.current = onPlayed;
  const reached = useRef(1);
  reached.current = through;

  useEffect(() => {
    setThrough(motion === "on" && moving ? 0 : 1);
    setPlaying(motion === "on" && moving);
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

  return { through, setThrough, playing, setPlaying, speed, setSpeed };
}

/**
 * A point in an instrument's own frame, put where that instrument stands in a room.
 *
 * @param at - The point, in the instrument's frame.
 * @param where - Where the instrument's base sits.
 * @param turn - Which way it faces, in degrees.
 * @returns The point, in the room.
 */
export function atInstrument(at: readonly [number, number, number], where: readonly [number, number, number], turn = 0): [number, number, number] {
  const angle = (-turn * Math.PI) / 180;
  const [sin, cos] = [Math.sin(angle), Math.cos(angle)];
  return [where[0] + at[0] * cos + at[2] * sin, where[1] + at[1], where[2] - at[0] * sin + at[2] * cos];
}

/**
 * Where to look from for a machine that is standing in a room rather than on its own.
 *
 * It is the same view of the same machine, said in the room's coordinates, so going from across the
 * room to in front of it is one move of one camera rather than a cut between two scenes.
 *
 * @param placed - The machine in use.
 * @param under - Where its base sits in the room.
 * @param turn - Which way it faces, in degrees.
 * @returns The pose and the field of view.
 */
export function poseAtInstrument(placed: PlacedInUse, under: readonly [number, number, number], turn = 0): { pose: { target: [number, number, number]; position: [number, number, number] }; fov: number } {
  return {
    pose: { target: atInstrument(placed.pose.target, under, turn), position: atInstrument(placed.pose.position, under, turn) },
    fov: placed.pose.fov,
  };
}

/**
 * An instrument in use, as a host hands it over: what is going on at it, and the rest of what a
 * person working it needs around the scene.
 *
 * It is one bundle because both hosts take the same one. A machine on its own stage and the same
 * machine standing on a bench in its lab are handed exactly this, and differ only in where it is
 * drawn.
 */
export interface InUseHere extends InUse {
  /** What the lab calls it. */
  name: string;
  /** Told when another of its views is asked for. */
  onView: (view: StageView) => void;
  /** What each kind of strand drawn in the tube is, for the legend. */
  legend?: Partial<Record<StageTube["strands"][number]["kind"], string>>;
  /** How long the step showing takes to play, in place of the speed chosen in the scene. */
  seconds?: number;
  /** Told each time a step finishes playing, which is how a host runs one step into the next. */
  onPlayed?: () => void;
  /** The tool itself, to put beside the scene. */
  panel?: ReactNode;
}

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

/**
 * An instrument in use, worked out: what to draw in the scene, and what to put over it.
 *
 * Both hosts call this and neither works any of it out for itself, so the same machine in the same
 * state is the same picture whether it is on a stage of its own or standing on its bench in the lab.
 * It takes `null` for nothing in use, so a host that may or may not have a tool open can still call
 * it once, every time, and keep one scene.
 *
 * @param what - The instrument in use, or `null` if none is.
 * @param motion - Whether the scene moves, which decides whether a step plays or is shown finished.
 * @returns What to draw, in the instrument's own frame, and the views, bases, legend and playback
 *   that belong over it.
 */
export function useInUse(what: InUseHere | null, motion: Motion): { placed: PlacedInUse | null; chrome: ReactNode } {
  const tube = what?.tube;
  const moving = what !== null && what.view === "tube" && tube !== undefined && tube.strands.some((one) => one.moves !== undefined);
  const scene = useMemo(() => JSON.stringify(tube?.strands ?? []), [tube]);
  const { through, setThrough, playing, setPlaying, speed, setSpeed } =
    useStagePlay({ moving, scene, motion, seconds: what?.seconds, onPlayed: what?.onPlayed });
  const placed = useMemo(() => (what === null ? null : placeInUse(what, through)), [what, through]);
  if (what === null || placed === null) return { placed: null, chrome: null };
  const chrome = (
    <>
      <nav className="crumbs views" aria-label={`Views of ${what.name}`}>
        <strong>{what.name}</strong>
        {STAGE_VIEWS.map((one) => (
          <button key={one} type="button" aria-pressed={one === what.view} className={one === what.view ? "on" : undefined}
                  onClick={() => what.onView(one)}>{stageViewName(what.model, one)}</button>
        ))}
      </nav>
      {placed.close !== null && <BaseLens lens={placed.close} />}
      {what.view === "tube" && placed.kinds.length > 0 && (
        <ul className="legend" aria-label="What the lines are">
          {placed.kinds.map((kind) => <li key={kind}><span className={`swatch tone-${STRAND_TONE[kind]}`} />{what.legend?.[kind] ?? kind}</li>)}
        </ul>
      )}
      {placed.moving && (
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
          {motion === "on" && what.seconds === undefined && (["slow", "usual", "fast"] as const).map((one) => (
            <button key={one} type="button" aria-pressed={one === speed} onClick={() => setSpeed(one)}>{one === "usual" ? "Normal" : one === "slow" ? "Slow" : "Fast"}</button>
          ))}
        </div>
      )}
    </>
  );
  return { placed, chrome };
}
