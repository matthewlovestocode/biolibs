"use client";

/**
 * A lab to walk around: the scene, with the way back, a search, and what was picked.
 *
 * It is given a lab and keeps only what is being looked at and what was typed. Everything drawn
 * comes from `sceneView`, so what is on screen is always the lab it was given.
 */
import { useMemo, useState } from "react";
import { layoutFrom, search, type Layout, type RecordedLab, type Standing } from "@biolibs/bionet-space";
import { THEME_ATTRIBUTE, type Theme } from "@biolibs/bionet-theme";
import { useMotion, type Motion } from "./motion.js";
import { needsArranging, placeToAdd, type NewPlace } from "./arranging.js";
import { LabBuilder } from "./builder.js";
import { LabScene, useSystemTheme, type Neighbour } from "./scene.js";
import { focusOn, sceneView, type Focus } from "./view.js";

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
 * A lab in three dimensions, with the controls to move around it.
 *
 * Press a freezer to look into it, a box to open it, a tube to pick it. The line at the top is the
 * way back. Typing a part's name lights up every box that holds one, and Return goes to the first.
 *
 * @param props - `layout` is the lab; `labName` is what to call it; `neighbours` are other labs to
 *   draw beside it; `theme` pins a theme, which otherwise follows the system; `focus` is where to
 *   start; `onNeighbour` is told when another lab is pressed; `onUse`, if given, puts a way to use
 *   an instrument beside it once it has been pressed, and is told which; `motion` pins whether the
 *   camera travels or cuts, which otherwise follows the system and the switch.
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
export function LabExplorer({ layout, labName = "Lab", neighbours, theme, focus: start, onNeighbour, onUse, motion: pinned }: {
  layout: Layout; labName?: string; neighbours?: readonly Neighbour[]; theme?: Theme; focus?: Focus; onNeighbour?: (id: string) => void;
  onUse?: (place: string) => void; motion?: Motion;
}) {
  const [motion, flipMotion] = useMotion(pinned);
  const system = useSystemTheme();
  const shown = theme ?? system;
  const [focus, setFocus] = useState<Focus>(start ?? { place: null });
  const [words, setWords] = useState("");
  const found = useMemo(() => search(layout, words), [layout, words]);
  const matches = useMemo(() => new Set(found.map((one) => one.item)), [found]);
  const wrong = useMemo(() => needsArranging(layout), [layout]);
  const view = useMemo(() => sceneView(layout, focus, { matches, labName, attention: wrong.attention }), [layout, focus, matches, labName, wrong]);
  const picked = view.tubes.find((tube) => tube.selected);
  const instrument = layout.places.find((place) => place.id === focus.place && place.kind === "instrument");
  const where = view.crumbs.at(-1)!;

  return (
    <div className="bionet-scene" {...{ [THEME_ATTRIBUTE]: shown }}>
      <LabScene view={view} theme={shown} motion={motion} onFocus={setFocus} {...(neighbours === undefined ? {} : { neighbours })}
                {...(onNeighbour === undefined ? {} : { onNeighbour })} />
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
      <MotionSwitch motion={motion} onFlip={flipMotion} />
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
 *   let places be added and retired while arranging; `onUse` is told when an instrument is to be used.
 *
 * @example
 * ```tsx
 * import { LabView } from "@biolibs/bionet-scene";
 *
 * // `lab` is the lab as a window is given it: the `lab` of a client's snapshot fits as it is.
 * <LabView lab={lab} name={lab.name ?? "Lab"} />
 * ```
 */
export function LabView({ lab, name = "Lab", theme, neighbours, onStand, onAdd, onRetire, onUse }: {
  lab: RecordedLab; name?: string; theme?: Theme; neighbours?: readonly Neighbour[];
  onStand?: (place: string, standing: Standing | null) => Promise<unknown> | void;
  onAdd?: (place: NewPlace) => Promise<unknown> | void; onRetire?: (place: string) => Promise<unknown> | void;
  onUse?: (place: string) => void;
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
      <LabExplorer layout={layout} labName={name} {...pinned} {...(neighbours === undefined ? {} : { neighbours })} {...(onUse === undefined ? {} : { onUse })} />
      {onStand !== undefined && <button type="button" className="bionet-arrange" onClick={() => setArranging(true)}>Arrange</button>}
    </div>
  );
}
