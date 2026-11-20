"use client";

/**
 * A gel read at the imager: the picture that came out, and what can be got from it.
 *
 * Every other tool on this bench runs forwards — the sequences say what a gel should show, and the
 * gel station draws it. This one runs backwards from the photograph, which is the only direction
 * that can tell you whether what was in the tube was what was thought to be in it. The arithmetic
 * is the gel station's own, inverted: where a band landed, into the size that landed there, read
 * against the ladder that ran beside it on the same gel.
 *
 * The picture itself hides three things, and the views are arranged round them. The exposure, which
 * decides what is in the picture at all and which a photograph cannot show, so the lane is drawn as
 * a profile where a band at the top of what the camera records is a peak with its top cut off. A
 * band's brightness, which is the mass in it and not the number of molecules, so an insert beside
 * its vector looks faint when it is not. And a size read past the end of the ladder, which is
 * arithmetic carried on rather than anything measured.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAct, useLab } from "@biolibs/bionet-react";
import { GELS, LADDERS, gelById, ladderBands, ladderById } from "@biolibs/gel";
import { Glossed } from "@biolibs/glossary-react";
import { COMPRESSED, SATURATED, exposure, laneAgainst, readLane, whyFainter, type Measured } from "./imager.js";
import { imagerWorking } from "./imager-working.js";
import { ShowWorking } from "./working.js";

/** The views of the gel imager, by the names every instrument's stage uses. */
export type ImagerView = "machine" | "block" | "screen" | "tube" | "result";

/** What the scene is told to show. It is shaped to be spread onto `InstrumentStage`. */
export interface ImagerStage {
  model: "gel-imager";
  name: string;
  view: ImagerView;
  onView: (view: ImagerView) => void;
  screen: { text: string; lit?: boolean }[];
  /** The gel as it was photographed: the ladder beside the lane that was read. */
  gel?: { lanes: { name: string; tone: "dim" | "ink" | "good" | "attention"; bands: { position: number; intensity: number; label: string }[] }[] };
  /** The lane as a profile along it, for the view where the exposure shows. */
  trace?: { what: string; along: number[]; ceiling: number; marks: { at: number; label: string; saturated: boolean }[] };
}

const count = (value: number): string => value.toLocaleString("en-US");
const number = (text: string): number | undefined => {
  const value = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(value) ? value : undefined;
};
/** Sizes typed as a list, in any of the ways a person writes one. */
const sizesIn = (text: string): number[] =>
  text.split(/[,\s]+/).map((one) => Number(one.replace(/[^\d.]/g, ""))).filter((one) => Number.isFinite(one) && one > 0);

/** A band as it is typed in: how far down the lane, and how bright, both as percentages. */
interface Typed { down: string; bright: string }

/**
 * A profile along the lane, from the bands measured on it.
 *
 * It is what the camera recorded and not what was there, which is why it is cut off at the ceiling:
 * a band at the top of what a camera can record comes out of it flat, and a band well past the top
 * comes out of it flat at the same height. That is the whole of what this picture is for, and
 * drawing the true peak instead would be drawing something nobody has.
 */
function profile(bands: readonly Measured[], points = 96): number[] {
  return Array.from({ length: points }, (_, index) => {
    const along = index / (points - 1);
    // A band is a narrow bump round where it ran, which is what a lane's profile looks like.
    const there = bands.reduce((high, band) => high + band.brightness * Math.exp(-(((along - band.position) / 0.022) ** 2)), 0);
    return Math.min(SATURATED, there);
  });
}

/**
 * A gel being read, at the imager it was photographed on.
 *
 * @param options - `start` says what to open on; `instrument` is the imager the lab has placed, if
 *   it has one; `onDone` adds a way to leave.
 * @returns `stage`, to spread onto `InstrumentStage` from `@biolibs/bionet-scene`, and `panel`, to put inside it.
 *
 * @example
 * ```tsx
 * import { useImagerBench } from "@biolibs/bionet-tools";
 *
 * const bench = useImagerBench({ instrument });
 * <InstrumentStage {...bench.stage}>{bench.panel}</InstrumentStage>
 * ```
 */
export function useImagerBench({ instrument = null, onDone, start }: {
  instrument?: { id: string; name: string } | null; onDone?: () => void;
  /** What to show: the view, the gel and ladder, and what was expected of the lane. */
  start?: { view?: ImagerView; gel?: string; ladder?: string; expected?: readonly number[] };
} = {}): { stage: ImagerStage; panel: ReactNode } {
  const lab = useLab()?.lab;
  const act = useAct();
  const [view, setView] = useState<ImagerView>(start?.view ?? "machine");
  const [gelId, setGelId] = useState(start?.gel ?? "1.0");
  const [ladderId, setLadderId] = useState(start?.ladder ?? "1kb");
  const [expected, setExpected] = useState((start?.expected ?? []).join(", "));
  const [bands, setBands] = useState<Typed[]>([{ down: "", bright: "" }]);
  const [exposed, setExposed] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  useEffect(() => {
    if (start === undefined) return;
    if (start.view !== undefined) setView(start.view);
    if (start.gel !== undefined) setGelId(start.gel);
    if (start.ladder !== undefined) setLadderId(start.ladder);
    if (start.expected !== undefined) setExpected(start.expected.join(", "));
  }, [start?.view, start?.gel, start?.ladder, start?.expected?.join(",")]);

  const gel = gelById(gelId);
  const rungs = useMemo(() => ladderBands(ladderById(ladderId).sizes, gel), [ladderId, gelId]);
  const measured: Measured[] = bands.flatMap((one) => {
    const down = number(one.down);
    const bright = number(one.bright);
    return down === undefined ? [] : [{ position: Math.min(1, Math.max(0, down / 100)), brightness: Math.min(1, Math.max(0, (bright ?? 60) / 100)) }];
  });
  const read = useMemo(() => readLane(measured, rungs), [bands, rungs]);
  const how = exposure(measured);
  const wanted = sizesIn(expected);
  const compared = wanted.length === 0 ? null : laneAgainst(read, wanted);
  // The last run the lab recorded that said what to expect, offered rather than imposed.
  const lastExpected = useMemo(() => {
    const runs = lab?.runs ?? [];
    for (const one of [...runs].reverse()) {
      const says = one.settings["expected"];
      if (typeof says === "string" && sizesIn(says).length > 0) return { run: one, sizes: sizesIn(says), kind: one.kind };
    }
    return null;
  }, [lab?.runs]);

  const stage: ImagerStage = {
    model: "gel-imager", name: instrument?.name ?? "Gel imager", view, onView: setView,
    screen: measured.length === 0
      ? [{ text: `${gel.percent}% agarose` }, { text: "No bands marked" }]
      : [{ text: `${gel.percent}% · ${ladderById(ladderId).name}`, lit: true },
         { text: `${measured.length} band${measured.length === 1 ? "" : "s"} marked` },
         ...(exposed.trim() === "" ? [] : [{ text: `${exposed.trim()} s` }]),
         ...(how.saturated > 0 ? [{ text: `${how.saturated} at the ceiling`, lit: true }] : [])],
    ...(measured.length === 0 ? {} : {
      gel: {
        lanes: [
          { name: ladderById(ladderId).name, tone: "dim" as const,
            bands: rungs.map((one) => ({ position: one.position, intensity: 0.5, label: count(one.size) })) },
          { name: "the lane", tone: "ink" as const,
            bands: read.map((one) => ({ position: one.position, intensity: one.brightness, label: one.size > 0 ? `${count(one.size)} bp` : "?" })) },
        ],
      },
      trace: {
        what: "the lane, along it", along: profile(measured), ceiling: SATURATED,
        marks: read.map((one) => ({ at: one.position, label: one.size > 0 ? count(one.size) : "?", saturated: one.saturated })),
      },
    }),
  };

  const record = async (): Promise<void> => {
    if (lab === null || lab === undefined || read.length === 0) return;
    setBusy(true);
    const answer = await act("recordRun", {
      kind: "imaging", instrument: instrument?.id ?? null, inputs: [], outputs: [],
      outcome: compared === null || (compared.missing.length === 0 && compared.extra.length === 0) ? "worked" : "failed",
      settings: {
        gel: gel.id, ladder: ladderId,
        read: read.map((one) => count(one.size)).join(",").slice(0, 200),
        ...(wanted.length === 0 ? {} : { expected: wanted.join(",").slice(0, 200) }),
        ...(exposed.trim() === "" ? {} : { seconds: exposed.trim().slice(0, 20) }),
        ...(how.saturated === 0 ? {} : { saturated: `${how.saturated}` }),
      },
      note: note.trim() === "" ? null : note.trim(),
    });
    setBusy(false);
    setSaid(answer.ok ? "Recorded: what the gel showed, and what was expected of it." : answer.error);
  };

  if (lab === null || lab === undefined) return { stage, panel: null };

  const setBand = (at: number, part: keyof Typed, value: string): void =>
    setBands((was) => was.map((one, index) => (index === at ? { ...one, [part]: value } : one)));

  const panel = (
    <div className="pcr imager">
      <section className="card">
        <div className="toolhead">
          <h2>Read a gel{instrument === null ? "" : ` · ${instrument.name}`}</h2>
          {onDone !== undefined && <button type="button" className="quiet" onClick={onDone}>Back to the lab</button>}
        </div>
        <fieldset disabled={busy} className="row tight">
          <label>Agarose
            <select value={gelId} onChange={(event) => setGelId(event.target.value)} aria-label="Agarose">
              {GELS.map((one) => <option key={one.id} value={one.id}>{one.percent}%</option>)}
            </select>
          </label>
          <label>Ladder
            <select value={ladderId} onChange={(event) => setLadderId(event.target.value)} aria-label="Ladder">
              {LADDERS.map((one) => <option key={one.id} value={one.id}>{one.name}</option>)}
            </select>
          </label>
          <label>Exposure<input value={exposed} onChange={(event) => setExposed(event.target.value)} placeholder="0.5" /> s</label>
        </fieldset>
        <p className="label">Where each band is, down the lane</p>
        <fieldset disabled={busy} className="stack">
          {bands.map((one, at) => (
            <div key={at} className="row tight">
              <label>Down<input type="number" min={0} max={100} step="any" value={one.down} onChange={(event) => setBand(at, "down", event.target.value)} placeholder="40" /> %</label>
              <label>Bright<input type="number" min={0} max={100} step="any" value={one.bright} onChange={(event) => setBand(at, "bright", event.target.value)} placeholder="60" /> %</label>
              {bands.length > 1 && <button type="button" className="quiet" onClick={() => setBands((was) => was.filter((_, index) => index !== at))}>Take it out</button>}
            </div>
          ))}
          <div className="row">
            <button type="button" className="quiet" onClick={() => setBands((was) => [...was, { down: "", bright: "" }])}>Another band</button>
          </div>
        </fieldset>
        {how.says !== "" && <p className={how.ok ? "small good" : "trouble"} role="status">{how.says}</p>}
      </section>

      {view === "machine" && (
        <section className="card">
          <h2>At the machine</h2>
          <p className="small"><Glossed text="A gel imager is a dark hood over a light that makes the stain in the DNA fluoresce, with a camera looking down into it." /></p>
          <p className="dim small">What comes out is a picture. The sizes in it are not measured by anything: they are read off the ladder that ran beside the sample, by finding the two markers a band sits between. The first three views are what the machine gives you; the last two are what you make of it.</p>
          <p className="voice">Worth knowing</p>
          <p className="small">If the gel is going to be cut up and a band purified out of it, every second under short-wave ultraviolet nicks the DNA in it. Long-wave or blue light, and the shortest look that will do.</p>
        </section>
      )}

      {view === "block" && (
        <section className="card">
          <h2>The gel on the light</h2>
          <p className="voice">The machine</p>
          <p className="small">The gel lies on the light with the ladder beside the lane. Both are drawn above from what has been marked: the ladder where a {gel.percent}% gel puts it, the lane where you said the bands are.</p>
          <p className="voice">What is read off it</p>
          {read.length === 0 ? <p className="dim small">Mark a band above and it appears here.</p> : (
            <ul className="plainlist small">
              {read.map((one, at) => (
                <li key={at}>
                  {one.size > 0 ? `${count(one.size)} bp` : "no ladder to read it against"}
                  {one.between.length === 2 && <span className="dim"> · between {count(one.between[0]!)} and {count(one.between[1]!)}</span>}
                  {one.extrapolated && <span className="warn"> · past the end of the ladder</span>}
                  {one.compressed && <span className="warn"> · up where the gel has stopped separating</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {view === "screen" && (
        <section className="card">
          <h2>The exposure</h2>
          <p className="voice">What the picture does not show</p>
          <p className="small">A photograph shows a band as bright or not bright. It cannot show that a band has run into the top of what the camera records, because a band at the top and a band well past it look the same. Drawn as a profile along the lane they do not: one is a peak, the other is a peak with its top cut off, and the line across says where the cut is.</p>
          {how.saturated > 0
            ? <p className="trouble" role="status">{how.says}</p>
            : <p className="small good">{how.says}</p>}
          <p className="voice">The trap</p>
          <p className="small">A longer exposure makes a better-looking picture: brighter bands, more contrast, the faint one finally visible. It is also the picture in which nothing can be compared with anything. Take both, and read sizes off the long one and amounts off the short one.</p>
        </section>
      )}

      {view === "tube" && (
        <section className="card">
          <h2>What the bands hold</h2>
          {read.length === 0 ? <p className="dim small">Mark some bands above.</p> : (
            <>
              <p className="voice">What is in them</p>
              <p className="small">The stain binds along the DNA, so a band's brightness is the mass in it. Two bands of equal brightness hold equal mass, which means the shorter one holds more molecules — in proportion to how much shorter it is.</p>
              <ul className="plainlist small">
                {read.map((one, at) => (
                  <li key={at}>
                    {one.size > 0 ? `${count(one.size)} bp` : "?"} · <strong>{one.share === null ? "—" : `${Math.round(one.share * 100)}%`}</strong> <span className="dim">of the molecules in the lane</span>
                    {one.saturated && <span className="warn"> · at the ceiling, so this is a floor</span>}
                  </li>
                ))}
              </ul>
              {read.length > 1 && (() => {
                const sorted = [...read].sort((a, b) => b.brightness - a.brightness);
                const said = whyFainter(sorted[sorted.length - 1]!, sorted[0]!);
                return said === null ? null : <p className="small">{said}</p>;
              })()}
            </>
          )}
        </section>
      )}

      {view === "result" && (
        <section className="card">
          <h2>Against what was expected</h2>
          <fieldset disabled={busy} className="stack">
            <label>Expected, in bp<input value={expected} onChange={(event) => setExpected(event.target.value)} placeholder="2806, 2206" maxLength={200} /></label>
          </fieldset>
          {lastExpected !== null && expected.trim() === "" && (
            <p className="small">The last {lastExpected.kind} recorded here expected {lastExpected.sizes.map((one) => count(one)).join(" and ")} bp.{" "}
              <button type="button" className="quiet" onClick={() => setExpected(lastExpected.sizes.join(", "))}>Use those</button></p>
          )}
          {compared === null ? <p className="dim small">Say what was expected and this says whether the gel shows it.</p> : (
            <>
              <p className="voice">What the gel says</p>
              <ul className="checks">
                {compared.says.map((one) => <li key={one} className={/Every band expected/.test(one) ? "fine" : "warn"}>{one}</li>)}
              </ul>
              <ul className="plainlist small">
                {compared.expected.map((one) => (
                  <li key={one.size}>{count(one.size)} bp expected · {one.seen === null ? <span className="warn">nothing ran there</span> : `read as ${count(one.seen.size)} bp`}</li>
                ))}
              </ul>
            </>
          )}
          {read.length > 0 && (
            <>
              <p className="voice">The working</p>
              {imagerWorking(read).map((working, at) => <ShowWorking key={`${working.of} ${at}`} working={working} />)}
            </>
          )}
          <fieldset disabled={busy} className="stack">
            <label>Note<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Anything worth remembering" maxLength={2000} /></label>
            <div className="row">
              <button type="button" disabled={read.length === 0} onClick={() => void record()}>Record what it showed</button>
            </div>
          </fieldset>
          {said !== null && <p className="small" role="status">{said}</p>}
        </section>
      )}
    </div>
  );
  return { stage, panel };
}

/**
 * Reading a gel on its own, for a lab that has not drawn its room.
 *
 * @param props - `instrument` is the imager the lab has placed, if it has one; `onDone` adds a way to leave.
 */
export function ImagerTool(props: Parameters<typeof useImagerBench>[0]) {
  const bench = useImagerBench(props);
  const names: [ImagerView, string][] = [["machine", "The machine"], ["block", "The gel on the light"], ["screen", "The exposure"],
                                         ["tube", "What the bands hold"], ["result", "Against what was expected"]];
  return (
    <div className="pcr">
      <div className="row tight pick" role="tablist" aria-label={`Views of ${bench.stage.name}`}>
        {names.map(([one, said]) => (
          <button key={one} type="button" role="tab" aria-selected={one === bench.stage.view} className={one === bench.stage.view ? "" : "quiet"}
                  onClick={() => bench.stage.onView(one)}>{said}</button>
        ))}
      </div>
      {bench.panel}
    </div>
  );
}
