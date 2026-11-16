"use client";

/**
 * Arranging a lab by hand: drag what is in a place, turn it, say how big it is.
 *
 * It keeps only what is being tried. Where things stand is the lab's to say, so every move is handed
 * to `onStand` and the room is redrawn from what comes back.
 */
import { useEffect, useMemo, useState } from "react";
import { UNNAMED_ROOM, quarterTurned, standingAt, standingOf, standingUp, type Layout, type Standing } from "@biolibs/bionet-space";
import { THEME_ATTRIBUTE, type Theme } from "@biolibs/bionet-theme";
import { useMotion } from "./motion.js";
import { INSTRUMENTS, arranging, kindsFor, movableAt, placeToAdd, roomsOf, toSay, type NewPlace } from "./arranging.js";
import { LabScene, useSystemTheme, type Dragging } from "./scene.js";

/**
 * A lab to arrange.
 *
 * It starts in a room. Drag something to move it across the floor; it settles every 5 cm and stays
 * inside. Press it to turn it, change its size or its height off the floor, or to go inside it and
 * arrange what is there: the shelves of a freezer, which move up and down, the racks on a shelf,
 * the instruments on a bench. With nothing picked, the place being arranged can be given a size.
 *
 * @param props - `layout` is the lab; `onStand` is told each standing to say, or `null` to let a
 *   place stand where there is room again, and should resolve once the lab has been told; `onAdd`,
 *   if given, lets a place be added to the one being arranged, and `onRetire` lets one be retired;
 *   `labName` is what to call the lab; `theme` pins a theme; `onDone` adds a way out.
 *
 * @example
 * ```tsx
 * import { LabBuilder } from "@biolibs/bionet-scene";
 *
 * <LabBuilder layout={layout} onStand={(place, standing) => lab.standPlace({ place, standing })} />
 * ```
 */
export function LabBuilder({ layout, onStand, onAdd, onRetire, labName = "Lab", theme, onDone }: {
  layout: Layout; onStand: (place: string, standing: Standing | null) => Promise<unknown> | void;
  onAdd?: (place: NewPlace) => Promise<unknown> | void; onRetire?: (place: string) => Promise<unknown> | void;
  labName?: string; theme?: Theme; onDone?: () => void;
}) {
  const system = useSystemTheme();
  const shown = theme ?? system;
  const [motion] = useMotion();
  const rooms = useMemo(() => roomsOf(layout), [layout]);
  const [chosen, setInside] = useState<string | null>(null);
  // What is being arranged: the place chosen if the lab still has it, or else the first room.
  const inside = layout.places.find((place) => place.id === chosen)?.id ?? rooms[0]?.id ?? null;
  const [picked, setPicked] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReadonlyMap<string, Standing>>(new Map());
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [retiring, setRetiring] = useState<string | null>(null);
  // What was tried has either been said or refused by the time the lab changes.
  useEffect(() => { setDraft(new Map()); }, [layout]);

  const now = useMemo(() => (inside === null ? null : arranging(layout, inside, draft, { labName })), [layout, inside, draft, labName]);
  if (inside === null || now === null) return <div className="bionet-scene empty" {...{ [THEME_ATTRIBUTE]: shown }}><p>Nothing to arrange yet.</p></div>;

  const go = (id: string): void => { setInside(id); setPicked(null); };
  const say = async (place: string, standing: Standing | null): Promise<void> => {
    setBusy(true);
    try {
      // Pins are worked out from the lab as it is, not as it is being tried.
      const all = standing === null ? [{ place, standing }] : toSay(arranging(layout, inside).arranged, place, standing);
      for (const one of all) await onStand(one.place, one.standing);
    } finally {
      setBusy(false);
      setDraft(new Map());
    }
  };
  const drag: Dragging = {
    ids: new Set(busy ? [] : now.movable),
    upright: new Set(now.upright),
    onMove: (id, to) => {
      const standing = "up" in to ? standingUp(now.arranged, id, to.up) : standingAt(now.arranged, id, [to.across, to.forward]);
      if (standing !== null) setDraft(new Map([[id, standing]]));
    },
    onEnd: (id) => { const standing = draft.get(id); if (standing !== undefined) void say(id, standing); },
  };

  const target = picked !== null && now.movable.includes(picked) ? picked : inside;
  const standing = standingOf(now.arranged, target);
  const made = target === UNNAMED_ROOM;
  const named = now.layout.places.find((place) => place.id === target)?.name ?? labName;
  const stood = now.arranged.find((one) => one.place.id === target)?.placed === "by hand";
  const holds = now.layout.places.some((place) => place.parent === target);
  const kinds = kindsFor(now.layout.places.find((place) => place.id === inside)?.kind ?? null);
  const kind = adding !== null && kinds.includes(adding) ? adding : kinds[0];
  const working = async (work: () => Promise<unknown> | void): Promise<void> => {
    setBusy(true);
    try { await work(); } finally { setBusy(false); }
  };
  const sides = target === inside ? (["wide", "tall", "deep"] as const) : (["wide", "tall", "deep", "up"] as const);

  return (
    <div className="bionet-scene" {...{ [THEME_ATTRIBUTE]: shown }}>
      <LabScene view={now.view} theme={shown} drag={drag} motion={motion}
                onFocus={(focus) => {
                  const meant = focus.place === null ? null : movableAt(now, focus.place);
                  if (meant !== null) setPicked(meant);
                  else if (rooms.some((one) => one.id === focus.place)) go(focus.place!);
                }} />
      <nav className="crumbs" aria-label="What is being arranged">
        <strong>Arranging</strong>
        {now.path.length <= 1
          ? rooms.map((one) => (one.id === inside ? <strong key={one.id}>{one.name}</strong> : <button key={one.id} type="button" onClick={() => go(one.id)}>{one.name}</button>))
          : now.path.map((one, at) => (
            <span key={one.id}>
              {at > 0 && <span className="sep" aria-hidden="true">›</span>}
              {one.id === inside ? <strong>{one.name}</strong> : <button type="button" onClick={() => go(one.id)}>{one.name}</button>}
            </span>
          ))}
        {onDone !== undefined && <button type="button" className="done" onClick={onDone}>Done</button>}
      </nav>
      <p className="status">
        {now.movable.length === 0 ? "Nothing is kept in here yet"
          : `Drag something to move it${now.upright.length > 0 ? " · shelves move up and down" : ""} · it settles every 5 cm · press it for more`}
      </p>
      {standing !== null && (
        <aside className="arrange" aria-live="polite">
          <div className="head">
            <strong>{named}</strong>
            {target !== inside && <button type="button" className="plain" onClick={() => setPicked(null)}>{now.path.at(-1)?.name ?? "back"}</button>}
          </div>
          {made ? <p className="note">This room is made up for the drawing. Add a room among the lab's places to give it a size.</p> : (
            <form key={`${target} ${standing.size.join()} ${standing.position[1]}`} onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const size = (["wide", "tall", "deep"] as const).map((side) => Number(data.get(side))) as [number, number, number];
              const up = data.has("up") ? Number(data.get("up")) : standing.position[1];
              if (size.every((side) => Number.isFinite(side) && side > 0) && Number.isFinite(up)) {
                void say(target, { ...standing, size, position: [standing.position[0], up, standing.position[2]] });
              }
            }}>
              <fieldset disabled={busy} className={sides.length === 4 ? "four" : undefined}>
                {sides.map((side, at) => (
                  <label key={side} title={side === "up" ? "How far its base is above the floor of what it is in" : undefined}>{side}
                    <input name={side} type="number" min={side === "up" ? 0 : 0.01} max={1000} step={0.01} required
                           defaultValue={side === "up" ? standing.position[1] : standing.size[at]} />
                  </label>
                ))}
                <span className="unit">m</span>
                <button type="submit">Set</button>
              </fieldset>
            </form>
          )}
          {!made && (
            <div className="row">
              {target !== inside && <button type="button" disabled={busy} onClick={() => void say(target, quarterTurned(standing))}>Turn a quarter</button>}
              {target !== inside && holds && <button type="button" onClick={() => go(target)}>Arrange inside</button>}
              {stood && <button type="button" disabled={busy} className="plain" onClick={() => void say(target, null)}>stand it where there is room</button>}
            </div>
          )}
          {onRetire !== undefined && target !== inside && (retiring === target ? (
            <div className="row">
              <span className="note">Retire {named}{holds ? " and everything in it" : ""}?</span>
              <button type="button" disabled={busy} onClick={() => void working(async () => { await onRetire(target); setRetiring(null); setPicked(null); })}>Retire</button>
              <button type="button" className="plain" onClick={() => setRetiring(null)}>keep it</button>
            </div>
          ) : <button type="button" className="plain" onClick={() => setRetiring(target)}>retire it</button>)}
          {onAdd !== undefined && target === inside && kind !== undefined && (
            <form className="add" key={`${inside} ${now.movable.length}`} onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const [rows, columns] = [Number(data.get("rows")), Number(data.get("columns"))];
              void working(() => onAdd(placeToAdd(now.layout, inside, kind, {
                name: String(data.get("name") ?? ""),
                ...(rows > 0 && columns > 0 ? { grid: { rows, columns } } : {}),
                ...(data.get("model") === null ? {} : { model: String(data.get("model")) }),
              })));
            }}>
              <strong>Add to {now.path.at(-1)?.name ?? named}</strong>
              <fieldset disabled={busy}>
                <label className="wide">kind
                  <select value={kind} onChange={(event) => setAdding(event.target.value)}>{kinds.map((one) => <option key={one} value={one}>{one}</option>)}</select>
                </label>
                {kind === "instrument" && (
                  <label className="wide">which<select name="model">{INSTRUMENTS.map((one) => <option key={one} value={one}>{one.replace(/-/g, " ")}</option>)}</select></label>
                )}
                {kind === "box" && (
                  <>
                    <label>rows<input name="rows" type="number" min={1} max={100} step={1} defaultValue={9} required /></label>
                    <label>columns<input name="columns" type="number" min={1} max={100} step={1} defaultValue={9} required /></label>
                  </>
                )}
                <label className="wide">name<input name="name" maxLength={200} placeholder={placeToAdd(now.layout, inside, kind).name} /></label>
                <button type="submit">Add {kind}</button>
              </fieldset>
            </form>
          )}
          {now.problems.length > 0 && <ul className="problems">{now.problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>}
        </aside>
      )}
    </div>
  );
}
