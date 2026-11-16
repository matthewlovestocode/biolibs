"use client";

/**
 * A lab to walk around: the scene, with the way back, a search, and what was picked.
 *
 * It is given a lab and keeps only what is being looked at and what was typed. Everything drawn
 * comes from `sceneView`, so what is on screen is always the lab it was given.
 */
import { useMemo, useState } from "react";
import { layoutFrom, search, type Layout, type RecordedLab } from "@biolibs/bionet-space";
import { THEME_ATTRIBUTE, type Theme } from "@biolibs/bionet-theme";
import { LabScene, useSystemTheme, type Neighbour } from "./scene.js";
import { focusOn, sceneView, type Focus } from "./view.js";

/**
 * A lab in three dimensions, with the controls to move around it.
 *
 * Press a freezer to look into it, a box to open it, a tube to pick it. The line at the top is the
 * way back. Typing a part's name lights up every box that holds one, and Return goes to the first.
 *
 * @param props - `layout` is the lab; `labName` is what to call it; `neighbours` are other labs to
 *   draw beside it; `theme` pins a theme, which otherwise follows the system; `focus` is where to
 *   start; `onNeighbour` is told when another lab is pressed.
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
export function LabExplorer({ layout, labName = "Lab", neighbours, theme, focus: start, onNeighbour }: {
  layout: Layout; labName?: string; neighbours?: readonly Neighbour[]; theme?: Theme; focus?: Focus; onNeighbour?: (id: string) => void;
}) {
  const system = useSystemTheme();
  const shown = theme ?? system;
  const [focus, setFocus] = useState<Focus>(start ?? { place: null });
  const [words, setWords] = useState("");
  const found = useMemo(() => search(layout, words), [layout, words]);
  const matches = useMemo(() => new Set(found.map((one) => one.item)), [found]);
  const view = useMemo(() => sceneView(layout, focus, { matches, labName }), [layout, focus, matches, labName]);
  const picked = view.tubes.find((tube) => tube.selected);
  const where = view.crumbs.at(-1)!;

  return (
    <div className="bionet-scene" {...{ [THEME_ATTRIBUTE]: shown }}>
      <LabScene view={view} theme={shown} onFocus={setFocus} {...(neighbours === undefined ? {} : { neighbours })}
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
      <p className="status">
        {view.holding.toLocaleString("en-US")} {view.holding === 1 ? "tube" : "tubes"} in {where.name}
        {view.level !== "box" && <span className="hint"> · press something to look into it</span>}
      </p>
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
 *   a theme; `neighbours` are other labs to draw beside it.
 *
 * @example
 * ```tsx
 * import { useLab } from "@biolibs/bionet-react";
 * import { LabView } from "@biolibs/bionet-scene";
 *
 * const lab = useLab()?.lab;
 * lab && <LabView lab={lab} name={lab.name ?? "Lab"} />
 * ```
 */
export function LabView({ lab, name = "Lab", theme, neighbours }: { lab: RecordedLab; name?: string; theme?: Theme; neighbours?: readonly Neighbour[] }) {
  const layout = useMemo(() => layoutFrom(lab, { room: name }), [lab.places, lab.items, lab.parts, name]);
  if (layout.places.length === 0) {
    return (
      <div className="bionet-scene empty" {...(theme === undefined ? {} : { [THEME_ATTRIBUTE]: theme })}>
        <p>Nothing to draw yet. Add a place — a freezer, then the boxes in it — and it appears here.</p>
      </div>
    );
  }
  return <LabExplorer layout={layout} labName={name} {...(theme === undefined ? {} : { theme })} {...(neighbours === undefined ? {} : { neighbours })} />;
}
