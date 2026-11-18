"use client";

/**
 * The tubes nobody has read yet.
 *
 * A part is known by the checksum of its sequence, so a tube of something nobody has sequenced
 * cannot be a tube of a part. Until there was a specimen it could not be anything, which left a
 * real freezer — full of plasmids somebody was given years ago, labels worn off — with no way into
 * the lab at all.
 *
 * So this panel is deliberately not a place to guess. What goes on the tube is what somebody would
 * write on it, never a claim about what is inside; nothing here matches a specimen to a part by
 * name or by size; and the only thing that resolves one is somebody saying what a read came back
 * as. Once they do, the same tube keeps its place and how much is left, because the tube never
 * changed — only what is known about it did.
 */
import { useAct, useLab } from "@biolibs/bionet-react";
import { amountOf } from "./freezer.js";
import { Ask } from "./parts.js";
import { PutItem } from "./places.js";

/**
 * Every specimen, the tubes of each, and the way to say what one turned out to be. Draws nothing
 * until the lab has arrived.
 */
export function Specimens() {
  const state = useLab();
  const act = useAct();
  const lab = state?.lab;
  if (state === null || lab === null || lab === undefined) return null;
  const partName = (checksum: string): string =>
    lab.parts.find((one) => one.checksum === checksum)?.name ?? "a part the lab no longer lists";
  const unknown = lab.specimens.filter((one) => one.is === null);

  return (
    <>
      {lab.specimens.length === 0 ? (
        <p className="empty">
          No unidentified tubes. A specimen is something the lab physically has and cannot yet name:
          the plasmid from the back of the freezer, the gift with the label worn off. Hold it here
          and it can be counted, put somewhere and used, and it stays unnamed until a read says what
          it is.
        </p>
      ) : lab.specimens.map((specimen) => {
        const tubes = lab.items.filter((one) => one.specimen === specimen.specimen && !one.retired);
        return (
          <section className="card" key={specimen.specimen}>
            <div className="toolhead">
              <h2>{specimen.name}</h2>
              <span className="dim small">{specimen.is === null ? "not identified" : "identified"}</span>
            </div>
            {specimen.note !== null && <p className="small why">{specimen.note}</p>}
            {specimen.is === null
              ? <p className="small">Nobody has said what this is. It can be held, counted and used; it cannot stand in for a molecule a plan asks for, and it will not travel in a method.</p>
              : <p className="small">A read said this is <strong>{partName(specimen.is)}</strong>. The tubes below are the same tubes, in the same places, with the same amounts left &#8212; what changed is what is known about them.</p>}
            {tubes.length === 0 ? <p className="dim small">No tubes of it. Add one below.</p> : (
              <table>
                <thead><tr><th>Tube</th><th>How much</th><th>Where</th><th /></tr></thead>
                <tbody>
                  {tubes.map((one) => (
                    <tr key={one.item}>
                      <td><code>{one.item.slice(0, 8)}</code>{one.needsRecount && <span className="badge">needs counting</span>}</td>
                      <td>{amountOf(one)}</td>
                      <td><PutItem item={one} /></td>
                      <td><button type="button" className="plain" onClick={() => void act("retire", { item: one.item })}>retire</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <Ask onAsk={(data) => act("addItem", { specimen: specimen.specimen, amount: Number(String(data.get("amount") ?? "")), unit: String(data.get("unit") ?? "") })} className="row">
              <label>Add a tube<input name="amount" type="number" min={0} step={1} defaultValue={30} required aria-label="How much" /></label>
              <label>of<input name="unit" defaultValue="µL" maxLength={20} aria-label="Unit" /></label>
              <button type="submit">Add</button>
            </Ask>
            {specimen.is === null && lab.parts.length > 0 && (
              <Ask onAsk={(data) => act("identifySpecimen", { specimen: specimen.specimen, part: String(data.get("part") ?? "") })} className="row">
                <label>A read says it is
                  <select name="part" required aria-label="What it turned out to be">
                    <option value="">choose what came back…</option>
                    {lab.parts.map((one) => <option key={one.checksum} value={one.checksum}>{one.name}</option>)}
                  </select>
                </label>
                <button type="submit">That is what it is</button>
              </Ask>
            )}
            {specimen.is === null && lab.parts.length === 0 && (
              <p className="dim small">Once the read is in as a part, it can be named here.</p>
            )}
          </section>
        );
      })}

      <section className="card">
        <h2>Hold a tube you cannot name</h2>
        <p className="dim small">
          What to write is what you would write on the tube, not what you think is in it. A guess
          recorded here would be read later as a fact, and the whole point of a specimen is that
          nothing claims to know.
        </p>
        <Ask onAsk={(data) => act("addSpecimen", {
          name: String(data.get("name") ?? ""),
          note: String(data.get("note") ?? "") === "" ? null : String(data.get("note")),
        })} className="stack">
          <label>On the tube<input name="name" required maxLength={200} placeholder="pET, back of the −80, no date" /></label>
          <label>Where it came from<input name="note" maxLength={2000} placeholder="in the box Ed handed over" /></label>
          <button type="submit">Hold it</button>
        </Ask>
      </section>

      {unknown.length > 0 && (
        <p className="dim small">
          {unknown.length === 1 ? "One tube is" : `${unknown.length} tubes are`} being held without a
          name. Sequencing {unknown.length === 1 ? "it" : "them"} is what turns {unknown.length === 1 ? "it" : "them"} into
          something a plan can use.
        </p>
      )}
    </>
  );
}
