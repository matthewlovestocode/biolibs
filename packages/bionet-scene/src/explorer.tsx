"use client";

/**
 * A lab to walk around: the scene, with the way back, a search, and what was picked.
 *
 * It is given a lab and keeps only what is being looked at and what was typed. Everything drawn
 * comes from `sceneView`, so what is on screen is always the lab it was given.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { layoutFrom, search, type Layout, type RecordedLab, type Standing } from "@biolibs/bionet-space";
import { THEME_ATTRIBUTE, type Theme } from "@biolibs/bionet-theme";
import { useMotion, type Motion } from "./motion.js";
import { SKIN_SAYS, useSkins, type Skins } from "./skins.js";
import { needsArranging, placeToAdd, type NewPlace } from "./arranging.js";
import { LabBuilder } from "./builder.js";
import { poseAtInstrument, useInUse, type InUseHere } from "./in-use.js";
import { Molecule, moleculeLabels } from "./molecule.js";
import { LabScene, useSystemTheme, type Neighbour } from "./scene.js";
import { placeMolecule, type StageMolecule } from "./shapes.js";
import { focusOn, sceneView, type Focus } from "./view.js";

/** Something in the lab being worked: where it stands, and everything about its use. */
export type Using = InUseHere & {
  /** The place the instrument stands at. */
  place: string;
};

/**
 * The switch that turns the scene's motion off and on.
 *
 * @param props - `motion` is the setting; `onFlip` changes it.
 */
export function MotionSwitch({ motion, onFlip }: { motion: Motion; onFlip: () => void }) {
  return (
    <button type="button" className="motion" aria-pressed={motion === "on"} onClick={onFlip}
            title={motion === "on" ? "The view travels from one place to the next. Press to make it cut." : "The view cuts from one place to the next. Press to make it travel."}>
      Motion {motion}
    </button>
  );
}

/**
 * The switch that turns the skins on and off.
 *
 * It sits beside the motion switch because it is the same kind of setting: not about the lab, but
 * about how this window draws it, and so something an operator changes and leaves changed.
 *
 * @param props - `skins` is the setting; `onFlip` changes it.
 */
export function SkinSwitch({ skins, onFlip }: { skins: Skins; onFlip: () => void }) {
  return (
    <button type="button" className="motion skins" aria-pressed={skins === "on"} onClick={onFlip} title={SKIN_SAYS[skins]}>
      Skins {skins}
    </button>
  );
}

/**
 * A lab in three dimensions, with the controls to move around it.
 *
 * Press a freezer to look into it, a box to open it, a tube to pick it. The line at the top is the
 * way back. Typing a part's name lights up every box that holds one, and Return goes to the first.
 *
 * Given something in use, it draws that too, in the same scene: the machine working where it
 * stands, and everything its operator is picturing above it. There is no second scene to cut to, so
 * going from across the room to in front of a machine is one camera moving. While a tool is open the
 * room's own controls give way to the tool's, since the question has stopped being where to go.
 *
 * @param props - `layout` is the lab; `labName` is what to call it; `neighbours` are other labs to
 *   draw beside it; `theme` pins a theme, which otherwise follows the system; `focus` is where to
 *   start; `onNeighbour` is told when another lab is pressed; `onUse`, if given, puts a way to use
 *   an instrument beside it once it has been pressed, and is told which; `molecule`, if given, is asked for the construct in a tube
 *   that has been picked, and it is drawn over the tube as a map; `motion` pins whether the
 *   camera travels or cuts, which otherwise follows the system and the switch; `using` is an
 *   instrument in the lab being worked; `beside` is anything to put beside the scene, and `wide`
 *   gives it more of the window.
 *
 * @example
 * ```tsx
 * import "@biolibs/bionet-theme/theme.css";
 * import "@biolibs/bionet-scene/scene.css";
 * import { exampleLab } from "@biolibs/bionet-space";
 * import { LabExplorer } from "@biolibs/bionet-scene";
 *
 * <LabExplorer layout={exampleLab()} labName="The Wren Lab" />
 * ```
 */
export function LabExplorer({ layout, labName = "Lab", neighbours, theme, focus: start, onNeighbour, onUse, molecule, motion: pinned, skins: pinnedSkins, using, beside, wide }: {
  layout: Layout; labName?: string; neighbours?: readonly Neighbour[]; theme?: Theme; focus?: Focus; onNeighbour?: (id: string) => void;
  onUse?: (place: string) => void; molecule?: (item: string) => StageMolecule | null; motion?: Motion;
  /** Whether what things are made of is drawn. Left out, it is the window's own setting, which starts off. */
  skins?: Skins;
  /** One of the lab's instruments being worked, drawn where it stands. */
  using?: Using;
  /** Something to put beside the scene: a tool's own panel, or the tool itself. */
  beside?: ReactNode;
  /** Whether what is beside the scene should have more of the window than a bench usually does. */
  wide?: boolean;
}) {
  const [motion, flipMotion] = useMotion(pinned);
  const [skins, flipSkins] = useSkins(pinnedSkins);
  const system = useSystemTheme();
  const shown = theme ?? system;
  const [focus, setFocus] = useState<Focus>(start ?? { place: null });
  // A host that drives the view says where to look by changing `focus`. Following it rather than
  // being mounted afresh at the new place is what makes the camera travel there instead of jumping.
  const asked = start === undefined ? null : `${start.place ?? ""} ${start.item ?? ""}`;
  useEffect(() => { if (start !== undefined) setFocus(start); }, [asked]);
  const [words, setWords] = useState("");
  const found = useMemo(() => search(layout, words), [layout, words]);
  const matches = useMemo(() => new Set(found.map((one) => one.item)), [found]);
  const wrong = useMemo(() => needsArranging(layout), [layout]);
  const room = useMemo(() => sceneView(layout, focus, { matches, labName, attention: wrong.attention }), [layout, focus, matches, labName, wrong]);
  // Whatever is in use is worked out here, once, whether or not anything is: the same call every
  // time is what keeps one scene across opening and closing a tool.
  const { placed, chrome } = useInUse(using ?? null, motion);
  const worked = using === undefined ? null : room.places.find((place) => place.id === using.place) ?? null;
  // Working a machine is looked at from where a person at it would be. That is the machine's own
  // view of itself, said in the room's coordinates, so the room keeps its camera and simply moves it.
  const view = useMemo(() => {
    if (placed === null || worked === null) return room;
    const under: [number, number, number] = [worked.center[0], worked.center[1] - worked.size[1] / 2, worked.center[2]];
    const looking = poseAtInstrument(placed, under, worked.turn);
    return { ...room, pose: looking.pose, fov: looking.fov };
  }, [room, placed, worked]);
  const picked = view.tubes.find((tube) => tube.selected);
  // The tube picked, as the construct in it: drawn between the tube and whoever is looking.
  const drawn = useMemo(() => {
    const what = picked === undefined ? null : molecule?.(picked.item) ?? null;
    if (picked === undefined || what === null) return null;
    const from = view.pose.position;
    const away = Math.hypot(from[0] - picked.center[0], from[1] - picked.center[1], from[2] - picked.center[2]) || 1;
    const radius = Math.max(picked.radius * 3.2, 0.02);
    const out = picked.height + radius * 0.4;
    const centre: [number, number, number] = [0, 1, 2].map((axis) => picked.center[axis]! + ((from[axis]! - picked.center[axis]!) / away) * out) as [number, number, number];
    return placeMolecule(what, centre, from, radius);
  }, [picked, molecule, view.pose]);
  const instrument = layout.places.find((place) => place.id === focus.place && place.kind === "instrument");
  const where = view.crumbs.at(-1)!;
  const working = placed !== null && using !== undefined;
  const aside = using?.panel ?? beside;
  const has = aside !== undefined && aside !== null && aside !== false;

  return (
    <div className={`bionet-scene${has ? " stage-of" : ""}${has && wide === true ? " widebench" : ""}`} {...{ [THEME_ATTRIBUTE]: shown }}>
      <LabScene view={view} theme={shown} motion={motion} skins={skins} onFocus={setFocus} {...(neighbours === undefined ? {} : { neighbours })}
                {...(onNeighbour === undefined ? {} : { onNeighbour })} {...(drawn === null ? {} : { more: moleculeLabels(drawn, false) })}
                {...(working ? { using: { place: using!.place, placed: placed! } } : {})}>
        {drawn !== null && <Molecule placed={drawn} theme={shown} />}
      </LabScene>
      {/* With a machine open, its own views are the way about, and the way back is the tool's. */}
      {working ? chrome : (
        <>
          <nav className="crumbs" aria-label="Where you are">
            {view.crumbs.map((crumb, at) => (
              <span key={crumb.id ?? "lab"}>
                {at > 0 && <span className="sep" aria-hidden="true">›</span>}
                {at === view.crumbs.length - 1 ? <strong>{crumb.name}</strong>
                  : <button type="button" onClick={() => setFocus({ place: crumb.id })}>{crumb.name}</button>}
              </span>
            ))}
          </nav>
          <form className="search" role="search" onSubmit={(event) => {
            event.preventDefault();
            const first = found[0];
            if (first !== undefined) setFocus(focusOn(layout, first.item) ?? focus);
          }}>
            <input value={words} onChange={(event) => setWords(event.target.value)} placeholder="Find a part" aria-label="Find a part" spellCheck={false} />
            {words.trim() !== "" && <span className="count">{found.length === 0 ? "none" : `${found.length} found`}</span>}
          </form>
          <p className="status">
            {view.holding.toLocaleString("en-US")} {view.holding === 1 ? "tube" : "tubes"} in {where.name}
            {view.level !== "box" && <span className="hint"> · press something to look into it</span>}
            {wrong.problems.length > 0 && <span className="wrong" title={wrong.problems.join("\n")}> · {wrong.problems.length === 1 ? wrong.problems[0] : `${wrong.problems.length} things need arranging`}</span>}
          </p>
          {onUse !== undefined && instrument !== undefined && (
            <aside className="use">
              <strong>{instrument.name}</strong>
              <button type="button" onClick={() => onUse(instrument.id)}>Use it</button>
            </aside>
          )}
          {picked !== undefined && (
            <aside className="picked" aria-live="polite">
              <strong>{picked.name}</strong>
              <span>{picked.amount}</span>
              <span>position {picked.position} · {where.name}</span>
            </aside>
          )}
        </>
      )}
      <div className="settings">
        <MotionSwitch motion={motion} onFlip={flipMotion} />
        <SkinSwitch skins={skins} onFlip={flipSkins} />
      </div>
      {has && <aside className="bench">{aside}</aside>}
    </div>
  );
}

/**
 * A lab's own record of itself, drawn.
 *
 * It takes the lab as plain data — what `@biolibs/bionet-client` gives a window fits as it is — so
 * it can be put in a desktop window or on a web page alike. Until the lab has said where anything
 * is kept there is nothing to draw, and it says so.
 *
 * @param props - `lab` is the lab's places, items and parts; `name` is what to call it; `theme` pins
 *   a theme; `neighbours` are other labs to draw beside it; `onStand`, if given, adds a way to
 *   arrange the lab by hand, and is told each standing to say; `onAdd` and `onRetire`, if given,
 *   let places be added and retired while arranging; `onUse` is told when an instrument is to be used;
 *   `molecule` is asked for the construct in a picked tube, to draw it;
 *   `focus` is where to look, for a host driving the view; `using` is one of the lab's instruments
 *   being worked, drawn where it stands; `beside` is anything to put beside the scene, and `wide`
 *   gives it more of the window.
 *
 * @example
 * ```tsx
 * import { LabView } from "@biolibs/bionet-scene";
 *
 * // `lab` is the lab as a window is given it: the `lab` of a client's snapshot fits as it is.
 * <LabView lab={lab} name={lab.name ?? "Lab"} />
 * ```
 */
export function LabView({ lab, name = "Lab", theme, motion, skins, neighbours, onStand, onAdd, onRetire, onUse, molecule, focus, using, beside, wide }: {
  lab: RecordedLab; name?: string; theme?: Theme; motion?: Motion; skins?: Skins; neighbours?: readonly Neighbour[];
  onStand?: (place: string, standing: Standing | null) => Promise<unknown> | void;
  onAdd?: (place: NewPlace) => Promise<unknown> | void; onRetire?: (place: string) => Promise<unknown> | void;
  onUse?: (place: string) => void; molecule?: (item: string) => StageMolecule | null;
  /** Where to look, for a host that is driving the view, such as a tour. */
  focus?: Focus;
  /** One of the lab's instruments being worked, drawn where it stands. */
  using?: Using;
  /** Something to put beside the scene. */
  beside?: ReactNode;
  /** Whether what is beside the scene should have more of the window than a bench usually does. */
  wide?: boolean;
}) {
  const layout = useMemo(() => layoutFrom(lab, { room: name }), [lab.places, lab.items, lab.parts, name]);
  const [arranging, setArranging] = useState(false);
  if (layout.places.length === 0) {
    return (
      <div className="bionet-scene empty" {...(theme === undefined ? {} : { [THEME_ATTRIBUTE]: theme })}>
        <div>
          <p>Nothing to draw yet. A lab is drawn from the places its members add: a room, a freezer in it, the boxes in that.</p>
          {onAdd !== undefined && (
            <button type="button" onClick={() => { void onAdd(placeToAdd(layout, null, "room", { name: "Main lab" })); setArranging(true); }}>Add the first room</button>
          )}
        </div>
      </div>
    );
  }
  const pinned = theme === undefined ? {} : { theme };
  if (arranging && onStand !== undefined) {
    return <LabBuilder layout={layout} labName={name} onStand={onStand} onDone={() => setArranging(false)} {...pinned}
                       {...(onAdd === undefined ? {} : { onAdd })} {...(onRetire === undefined ? {} : { onRetire })} />;
  }
  return (
    <div className="bionet-view">
      <LabExplorer layout={layout} labName={name} {...pinned} {...(motion === undefined ? {} : { motion })} {...(skins === undefined ? {} : { skins })} {...(neighbours === undefined ? {} : { neighbours })} {...(onUse === undefined ? {} : { onUse })} {...(molecule === undefined ? {} : { molecule })}
                   {...(focus === undefined ? {} : { focus })} {...(using === undefined ? {} : { using })} {...(beside === undefined ? {} : { beside })} {...(wide === undefined ? {} : { wide })} />
      {onStand !== undefined && <button type="button" className="bionet-arrange" onClick={() => setArranging(true)}>Arrange</button>}
    </div>
  );
}
