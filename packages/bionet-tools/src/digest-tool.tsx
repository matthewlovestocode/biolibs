"use client";

/**
 * A check digest from the freezer, with the gel it should give.
 *
 * Like the PCR tool it holds only what has been chosen. The pieces and the gel come from
 * `planDigest`, and recording is one thing asked of the lab.
 */
import { useMemo, useState } from "react";
import type { Band } from "@biolibs/gel";
import { GELS, LADDERS } from "@biolibs/gel";
import { useAct, useLab } from "@biolibs/bionet-react";
import { Glossed } from "@biolibs/glossary-react";
import { cutters, enzymeNamed } from "./digest.js";
import { digestRun, digestTubes } from "./run.js";

/**
 * A gel, drawn: a ladder in one lane and the digest in the next.
 *
 * @param props - `ladder` and `bands` are what `planDigest` gave; `name` is what the sample is called.
 */
export function Gel({ ladder, bands, name }: { ladder: readonly Band[]; bands: readonly Band[]; name: string }) {
  const [top, height] = [26, 250];
  const lane = (x: number, drawn: readonly Band[], tone: string, labelled: "left" | "right"): React.ReactNode => drawn.map((band, at) => {
    const y = top + 10 + band.position * (height - 24);
    return (
      <g key={`${x} ${at}`}>
        <rect x={x} y={y - 1.6} width={54} height={3.2} rx={1.2} fill={tone} opacity={0.3 + 0.7 * band.intensity} />
        <text x={labelled === "left" ? x - 6 : x + 60} y={y + 3.5} textAnchor={labelled === "left" ? "end" : "start"} className={labelled === "left" ? "mark" : "size"}>
          {band.sizes.length > 1 ? `${band.sizes.join(" + ")}` : band.size}{band.unresolved ? " *" : ""}
        </text>
      </g>
    );
  });
  return (
    <svg className="gel" viewBox="0 0 330 290" role="img" aria-label={`A gel: a ladder beside ${name}, cut into pieces of ${bands.flatMap((band) => band.sizes).join(", ")} base pairs`}>
      <rect x={52} y={top} width={176} height={height} rx={6} className="slab" />
      <text x={89} y={16} textAnchor="middle" className="lane">ladder</text>
      <text x={177} y={16} textAnchor="middle" className="lane">{name.length > 16 ? `${name.slice(0, 15)}…` : name}</text>
      <rect x={62} y={top + 4} width={54} height={4} className="well" />
      <rect x={150} y={top + 4} width={54} height={4} className="well" />
      {lane(62, ladder, "var(--bionet-dim)", "left")}
      {lane(150, bands, "var(--bionet-held)", "right")}
    </svg>
  );
}

/**
 * Cut a tube's molecule in silico, see the gel it should give, and record whether the real gel matched.
 *
 * Choose a tube and one or more enzymes. The enzymes usually on a shelf that cut it are offered,
 * the ones that cut fewest times first, and any other can be named. The pieces are listed and drawn
 * as a gel beside a ladder. Recording takes what was used from the tube and notes whether the gel
 * showed what was expected; nothing is made.
 *
 * @param props - `instrument` is the gel station it is run at, if the lab has one; `onDone` adds a
 *   way to leave.
 */
export function DigestTool({ instrument = null, onDone }: { instrument?: { id: string; name: string } | null; onDone?: () => void }) {
  const lab = useLab()?.lab;
  const act = useAct();
  const [tube, setTube] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [other, setOther] = useState("");
  const [unknown, setUnknown] = useState<string | null>(null);
  const [used, setUsed] = useState("1");
  const [gel, setGel] = useState("1.0");
  const [ladder, setLadder] = useState("1kb");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  const tubes = useMemo(() => (lab === null || lab === undefined ? [] : digestTubes(lab)), [lab]);
  const part = tubes.find((one) => one.item === tube)?.part;
  const offered = useMemo(() => (part === undefined ? [] : cutters(part)), [part]);
  const run = useMemo(() => (lab === null || lab === undefined ? null : digestRun(lab, {
    tube, enzymes: chosen, gel, ladder, instrument: instrument?.id ?? null, note, ...(used.trim() === "" ? {} : { used: Number(used) }),
  })), [lab, tube, chosen, gel, ladder, instrument, note, used]);
  if (lab === null || lab === undefined || run === null) return null;

  const toggle = (name: string): void => { setChosen(chosen.includes(name) ? chosen.filter((one) => one !== name) : [...chosen, name]); setSaid(null); };
  const record = async (what: Record<string, unknown> | null, done: string): Promise<void> => {
    if (what === null) return;
    setBusy(true);
    const answer = await act("recordRun", what);
    setBusy(false);
    if (answer.ok) { setSaid(done); setNote(""); }
  };
  const here = lab.runs.filter((one) => one.kind === "digest" && (instrument === null || one.instrument === instrument.id)).slice(-5).reverse();
  const partName = (item: string | undefined): string => lab.parts.find((one) => one.checksum === lab.items.find((each) => each.item === item)?.part)?.name ?? "a tube";

  return (
    <div className="pcr digest">
      <section className="card">
        <div className="toolhead">
          <div>
            <h2>Digest and gel{instrument === null ? "" : ` · ${instrument.name}`}</h2>
            <p className="dim small"><Glossed text="A restriction enzyme cuts DNA wherever its site occurs, and gel electrophoresis sorts the pieces by size. Choose a tube and the enzymes to cut it with. The pieces are worked out from its sequence, and drawn as the gel they should give." /></p>
          </div>
          {onDone !== undefined && <button type="button" className="quiet" onClick={onDone}>Back to the lab</button>}
        </div>
        {tubes.length === 0 ? <p className="empty">There are no tubes to digest. Add a part and a tube of it on the Freezer tab.</p> : (
          <fieldset disabled={busy} className="choose">
            <div className="tube">
              <label>Tube
                <select value={tube} onChange={(event) => { setTube(event.target.value); setChosen([]); setSaid(null); }} aria-label="Tube">
                  <option value="">Choose a tube…</option>
                  {tubes.map((one) => <option key={one.item} value={one.item}>{one.label}</option>)}
                </select>
              </label>
              <label className="used">used<input type="number" min={0} step={1} value={used} onChange={(event) => setUsed(event.target.value)} aria-label="Amount used" /></label>
              {part !== undefined && <p className="dim small">{part.length} bp{part.circular ? " · circular" : " · linear"}</p>}
            </div>
            {part !== undefined && (
              <div>
                <p className="label">Enzymes{offered.length === 0 ? " · none of the usual ones cut this" : ""}</p>
                <div className="enzymes">
                  {offered.map((one) => (
                    <label key={one.name} className="check" title={`${one.site} · cuts ${one.positions.length === 1 ? "once" : `${one.positions.length} times`}`}>
                      <input type="checkbox" checked={chosen.includes(one.name)} onChange={() => toggle(one.name)} /> {one.name} <span className="dim small">×{one.positions.length}</span>
                    </label>
                  ))}
                  {chosen.filter((name) => !offered.some((one) => one.name === name)).map((name) => (
                    <label key={name} className="check"><input type="checkbox" checked onChange={() => toggle(name)} /> {name}</label>
                  ))}
                </div>
                <form className="row tight" onSubmit={(event) => {
                  event.preventDefault();
                  const name = enzymeNamed(other);
                  setUnknown(name === null && other.trim() !== "" ? other.trim() : null);
                  if (name !== null && !chosen.includes(name)) setChosen([...chosen, name]);
                  if (name !== null) setOther("");
                }}>
                  <input value={other} onChange={(event) => setOther(event.target.value)} placeholder="Another enzyme, by name" aria-label="Another enzyme" maxLength={40} spellCheck={false} />
                  <button type="submit" className="quiet">Add</button>
                </form>
                {unknown !== null && <p className="trouble small" role="status">There is no enzyme called {unknown} here.</p>}
              </div>
            )}
          </fieldset>
        )}
      </section>

      {run.plan !== null && chosen.length > 0 && (
        <section className="card">
          <h2>What it gives</h2>
          {run.plan.problem !== null ? <p className="trouble" role="status">{run.plan.problem}</p> : (
            <div className="result">
              <Gel ladder={run.plan.ladder} bands={run.plan.bands} name={part?.name ?? "digest"} />
              <div>
                <p><strong>{run.plan.fragments.length} {run.plan.fragments.length === 1 ? "piece" : "pieces"}</strong> <span className="dim">{run.plan.fragments.join(", ")} bp</span></p>
                <table>
                  <thead><tr><th>Enzyme</th><th>Site</th><th>Cuts after base</th></tr></thead>
                  <tbody>{run.plan.cutters.map((one) => <tr key={one.name}><td>{one.name}</td><td><code>{one.site}</code></td><td>{one.positions.length === 0 ? <span className="dim">does not cut</span> : one.positions.join(", ")}</td></tr>)}</tbody>
                </table>
                <div className="row tight">
                  <label>Gel<select value={gel} onChange={(event) => setGel(event.target.value)}>{GELS.map((one) => <option key={one.id} value={one.id}>{one.percent}% agarose</option>)}</select></label>
                  <label>Ladder<select value={ladder} onChange={(event) => setLadder(event.target.value)}>{LADDERS.map((one) => <option key={one.id} value={one.id}>{one.name}</option>)}</select></label>
                </div>
                {run.plan.bands.some((band) => band.unresolved) && <p className="dim small">* outside what this gel separates. Try another concentration.</p>}
                {run.plan.bands.some((band) => band.sizes.length > 1) && <p className="dim small">Pieces too close in size to tell apart run as one band.</p>}
              </div>
            </div>
          )}
          {run.plan.problem === null && (
            <fieldset disabled={busy} className="stack">
              <label>Note<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Anything worth remembering about this gel" maxLength={2000} /></label>
              <div className="row">
                <button type="button" onClick={() => void record(run.matched, "Recorded: the gel showed what was expected.")}>The gel matched</button>
                <button type="button" className="quiet" onClick={() => void record(run.differed, "Recorded: the gel did not show what was expected.")}>The gel did not match</button>
              </div>
            </fieldset>
          )}
          {said !== null && <p className="small" role="status">{said}</p>}
        </section>
      )}

      {here.length > 0 && (
        <section className="card">
          <h2>Recent digests{instrument === null ? "" : " here"}</h2>
          <table>
            <thead><tr><th>Tube</th><th>Enzymes</th><th>Expected</th><th>Gel</th><th>Note</th></tr></thead>
            <tbody>
              {here.map((one) => (
                <tr key={one.run}>
                  <td>{partName(one.inputs[0]?.item)}</td>
                  <td>{String(one.settings["enzymes"] ?? "").replace(/\+/g, " + ")}</td>
                  <td className="dim">{String(one.settings["expected"] ?? "")}</td>
                  <td>{one.outcome === "worked" ? "matched" : <span className="badge">did not match</span>}</td>
                  <td className="dim">{one.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
