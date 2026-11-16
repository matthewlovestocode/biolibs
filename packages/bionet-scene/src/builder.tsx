"use client";

/**
 * Arranging a lab by hand: drag what stands in a room, turn it, say how big it is.
 *
 * It keeps only what is being tried. Where things stand is the lab's to say, so every move is handed
 * to `onStand` and the room is redrawn from what comes back.
 */
import { useEffect, useMemo, useState } from "react";
import { UNNAMED_ROOM, quarterTurned, standingAt, standingOf, type Layout, type Standing } from "@biolibs/bionet-space";
import { THEME_ATTRIBUTE, type Theme } from "@biolibs/bionet-theme";
import { arranging, roomsOf, toSay } from "./arranging.js";
import { LabScene, useSystemTheme, type Dragging } from "./scene.js";

/**
 * A room to arrange.
 *
 * Drag something to move it across the floor; it settles every 5 cm and stays inside the room. Press
 * it to turn it or change its size. With nothing picked, the room's own size can be set.
 *
 * @param props - `layout` is the lab; `onStand` is told each standing to say, or `null` to let a
 *   place stand where there is room again, and should resolve once the lab has been told;
 *   `labName` is what to call the lab; `theme` pins a theme; `onDone` adds a way out.
 *
 * @example
 * ```tsx
 * import { LabBuilder } from "@biolibs/bionet-scene";
 *
 * <LabBuilder layout={layout} onStand={(place, standing) => lab.standPlace({ place, standing })} />
 * ```
 */
export function LabBuilder({ layout, onStand, labName = "Lab", theme, onDone }: {
  layout: Layout; onStand: (place: string, standing: Standing | null) => Promise<unknown> | void; labName?: string; theme?: Theme; onDone?: () => void;
}) {
  const system = useSystemTheme();
  const shown = theme ?? system;
  const rooms = useMemo(() => roomsOf(layout), [layout]);
  const [chosen, setRoom] = useState<string | null>(null);
  const room = rooms.find((one) => one.id === chosen)?.id ?? rooms[0]?.id ?? null;
  const [picked, setPicked] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReadonlyMap<string, Standing>>(new Map());
  const [busy, setBusy] = useState(false);
  // What was tried has either been said or refused by the time the lab changes.
  useEffect(() => { setDraft(new Map()); }, [layout]);

  const now = useMemo(() => (room === null ? null : arranging(layout, room, draft, { labName })), [layout, room, draft, labName]);
  if (room === null || now === null) return <div className="bionet-scene empty" {...{ [THEME_ATTRIBUTE]: shown }}><p>Nothing to arrange yet.</p></div>;

  const say = async (place: string, standing: Standing | null): Promise<void> => {
    setBusy(true);
    try {
      // Pins are worked out from the lab as it is, not as it is being tried.
      const all = standing === null ? [{ place, standing }] : toSay(arranging(layout, room).arranged, place, standing);
      for (const one of all) await onStand(one.place, one.standing);
    } finally {
      setBusy(false);
      setDraft(new Map());
    }
  };
  const drag: Dragging = {
    ids: new Set(busy ? [] : now.movable),
    onMove: (id, to) => {
      const standing = standingAt(now.arranged, id, to);
      if (standing !== null) setDraft(new Map([[id, standing]]));
    },
    onEnd: (id) => { const standing = draft.get(id); if (standing !== undefined) void say(id, standing); },
  };

  const target = picked !== null && now.movable.includes(picked) ? picked : room;
  const standing = standingOf(now.arranged, target);
  const made = target === UNNAMED_ROOM;
  const named = now.layout.places.find((place) => place.id === target)?.name ?? labName;
  const stood = now.arranged.find((one) => one.place.id === target)?.placed === "by hand";

  return (
    <div className="bionet-scene" {...{ [THEME_ATTRIBUTE]: shown }}>
      <LabScene view={now.view} theme={shown} drag={drag}
                onFocus={(focus) => {
                  if (focus.place !== null && now.movable.includes(focus.place)) setPicked(focus.place);
                  else if (rooms.some((one) => one.id === focus.place)) { setRoom(focus.place); setPicked(null); }
                }} />
      <nav className="crumbs" aria-label="Rooms">
        <strong>Arranging</strong>
        {rooms.map((one) => (one.id === room ? <strong key={one.id}>{one.name}</strong>
          : <button key={one.id} type="button" onClick={() => { setRoom(one.id); setPicked(null); }}>{one.name}</button>))}
        {onDone !== undefined && <button type="button" className="done" onClick={onDone}>Done</button>}
      </nav>
      <p className="status">Drag something to move it · it settles every 5 cm · press it to turn or resize</p>
      {standing !== null && (
        <aside className="arrange" aria-live="polite">
          <div className="head">
            <strong>{named}</strong>
            {target !== room && <button type="button" className="plain" onClick={() => setPicked(null)}>the room</button>}
          </div>
          {made ? <p className="note">This room is made up for the drawing. Add a room among the lab's places to give it a size.</p> : (
            <form key={`${target} ${standing.size.join()}`} onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const size = (["wide", "tall", "deep"] as const).map((side) => Number(data.get(side))) as [number, number, number];
              if (size.every((side) => Number.isFinite(side) && side > 0)) void say(target, { ...standing, size });
            }}>
              <fieldset disabled={busy}>
                {(["wide", "tall", "deep"] as const).map((side, at) => (
                  <label key={side}>{side}<input name={side} type="number" min={0.01} max={1000} step={0.01} defaultValue={standing.size[at]} required /></label>
                ))}
                <span className="unit">m</span>
                <button type="submit">Set size</button>
              </fieldset>
            </form>
          )}
          {!made && (
            <div className="row">
              {target !== room && <button type="button" disabled={busy} onClick={() => void say(target, quarterTurned(standing))}>Turn a quarter</button>}
              {stood && <button type="button" disabled={busy} className="plain" onClick={() => void say(target, null)}>stand it where there is room</button>}
            </div>
          )}
          {now.problems.length > 0 && <ul className="problems">{now.problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>}
        </aside>
      )}
    </div>
  );
}
