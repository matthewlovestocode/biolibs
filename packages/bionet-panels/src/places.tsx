"use client";

/** The places: where things are kept, which is inside which, and putting a tube somewhere. */
import type { ItemState, PlaceState } from "@biolibs/bionet";
import { useAct, useLab } from "@biolibs/bionet-react";
import { slotFrom, slotName } from "@biolibs/bionet-space";
import { Ask } from "./parts.js";

/** The kinds of place offered when adding one. Any other kind a lab's log holds is shown as it is. */
export const PLACE_KINDS = ["room", "freezer", "fridge", "shelf", "rack", "box", "bench", "instrument"] as const;

/**
 * Where a place is, said the way a person would: every place it is inside, then itself.
 *
 * @param places - The lab's places.
 * @param id - The place.
 * @returns Something like `Main lab › −80 › Shelf 2 › Box 7`, or `""` if the lab has no such place.
 */
export function placePath(places: readonly Pick<PlaceState, "place" | "name" | "parent">[], id: string): string {
  const names: string[] = [];
  const passed = new Set<string>();
  for (let at: string | null = id; at !== null && !passed.has(at);) {
    const one = places.find((each) => each.place === at);
    if (one === undefined) break;
    passed.add(at);
    names.unshift(one.name);
    at = one.parent;
  }
  return names.join(" › ");
}

/**
 * Where an item is, in words.
 *
 * @param item - The item.
 * @param places - The lab's places.
 * @returns Something like `−80 › Box 7 · C4`, or `nowhere recorded`.
 */
export function whereWords(item: Pick<ItemState, "where">, places: readonly Pick<PlaceState, "place" | "name" | "parent">[]): string {
  if (item.where === null) return "nowhere recorded";
  const path = placePath(places, item.where.place) || "a place the lab no longer has";
  return item.where.slot === null ? path : `${path} · ${slotName(item.where.slot)}`;
}

/**
 * The places in the order a tree is read: each one followed by what is inside it.
 *
 * @param places - The lab's places.
 * @returns Each place still in use, with how deep it is.
 */
export function placeTree(places: readonly PlaceState[]): { place: PlaceState; depth: number }[] {
  const out: { place: PlaceState; depth: number }[] = [];
  const walk = (parent: string | null, depth: number): void => {
    for (const place of places) {
      if (place.parent !== parent || place.retired) continue;
      out.push({ place, depth });
      walk(place.place, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Every place as a tree, what needs looking at, and a form to add a place. Draws nothing until the lab has arrived. */
export function Places() {
  const lab = useLab()?.lab;
  const act = useAct();
  if (lab === null || lab === undefined) return null;
  const tree = placeTree(lab.places);
  const live = lab.items.filter((item) => !item.retired);
  const holding = (id: string): number => live.filter((item) => item.where?.place === id).length;
  return (
    <>
      {lab.crowded.length > 0 && (
        <section className="card">
          <h2>Somebody needs to look</h2>
          <p className="dim small">The lab has more than one tube recorded in each of these positions. Two people put them there without knowing of each other. Move whichever is not really there.</p>
          <ul className="plainlist">
            {lab.crowded.map((one) => (
              <li key={`${one.place} ${one.slot.row} ${one.slot.column}`} className="flagged">
                <strong>{placePath(lab.places, one.place)} · {slotName(one.slot)}</strong> <span className="badge">{one.items.length} tubes</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="card">
        <h2>Where things are kept</h2>
        {tree.length === 0 ? <p className="empty">No places yet. Add the first below: a freezer, then the boxes in it.</p> : (
          <table>
            <thead><tr><th>Place</th><th>Kind</th><th>Positions</th><th>Tubes here</th><th /></tr></thead>
            <tbody>
              {tree.map(({ place, depth }) => (
                <tr key={place.place} className={place.adrift ? "flagged" : undefined}>
                  <td style={{ paddingLeft: `${0.6 + depth * 1.2}rem` }}>
                    {place.name}
                    {place.adrift && <span className="badge" title="Two people each moved this place and another into one another. Move one of them to settle it.">needs moving</span>}
                  </td>
                  <td className="dim">{place.kind}</td>
                  <td className="dim">{place.grid === null ? "" : `${place.grid.rows} × ${place.grid.columns}`}</td>
                  <td>{holding(place.place) || ""}</td>
                  <td><button type="button" className="plain" onClick={() => void act("retirePlace", { place: place.place })}>retire</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="card">
        <h2>Add a place</h2>
        <p className="dim small">A place is anything something is kept in or on. Only a box has positions; give it rows and columns and its tubes can be found by letter and number.</p>
        <Ask className="stack" onAsk={(data) => {
          const rows = Number(data.get("rows") ?? "");
          const columns = Number(data.get("columns") ?? "");
          const parent = String(data.get("parent") ?? "");
          return act("addPlace", { kind: String(data.get("kind") ?? ""), name: String(data.get("name") ?? ""), parent: parent === "" ? null : parent,
                                   grid: rows > 0 && columns > 0 ? { rows, columns } : null });
        }}>
          <label>Kind<select name="kind" defaultValue="box">{PLACE_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select></label>
          <label>Name<input name="name" placeholder="Box 7" required maxLength={200} /></label>
          <label>Inside
            <select name="parent" defaultValue="">
              <option value="">nothing</option>
              {tree.map(({ place, depth }) => <option key={place.place} value={place.place}>{"  ".repeat(depth)}{place.name}</option>)}
            </select>
          </label>
          <div className="row tight">
            <input name="rows" type="number" min={1} max={100} step={1} placeholder="Rows" aria-label="Rows" className="num" />
            <input name="columns" type="number" min={1} max={100} step={1} placeholder="Columns" aria-label="Columns" className="num" />
            <span className="dim small">for a box</span>
          </div>
          <button type="submit">Add place</button>
        </Ask>
      </section>
    </>
  );
}

/**
 * Where one tube is, and a way to put it somewhere.
 *
 * @param props - `item` is the tube.
 */
export function PutItem({ item }: { item: ItemState }) {
  const lab = useLab()?.lab;
  const act = useAct();
  if (lab === null || lab === undefined) return null;
  const tree = placeTree(lab.places);
  return (
    <div className="where">
      <span className={item.where === null ? "dim small" : "small"}>{whereWords(item, lab.places)}</span>
      {tree.length > 0 && (
        <Ask className="row tight" onAsk={async (data) => {
          const place = String(data.get("place") ?? "");
          const written = String(data.get("slot") ?? "").trim();
          const slot = written === "" ? null : slotFrom(written);
          // A position that is not written like one is sent as it is not: the lab refuses it and says why.
          return act("putItem", { item: item.item, place: place === "" ? null : place, slot: written !== "" && slot === null ? { row: -1, column: -1 } : slot });
        }}>
          <select name="place" defaultValue={item.where?.place ?? ""} aria-label="Place">
            <option value="">nowhere</option>
            {tree.map(({ place, depth }) => <option key={place.place} value={place.place}>{"  ".repeat(depth)}{place.name}</option>)}
          </select>
          <input name="slot" placeholder="A1" aria-label="Position" className="num" maxLength={5} />
          <button type="submit" className="quiet">Put</button>
        </Ask>
      )}
    </div>
  );
}
