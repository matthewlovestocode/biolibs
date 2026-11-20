"use client";

/**
 * Counting cells at the microscope.
 *
 * It is the only machine on this bench that answers a question without measuring anything: you
 * look, and you count, and the number is as good as the counting was. The spectrophotometer
 * answers the same question by what scatters light, which is quicker and counts debris as cells.
 *
 * The two things the eyepiece cannot tell you are the two this is built round.
 *
 * It cannot tell you whether enough were counted. Cells land in a square at random, so the error in
 * a count of N is about √N: a fifth of the answer at twenty-five cells and a tenth at a hundred.
 * The usual mistake is one square, one glance, and a figure written to four places.
 *
 * And it cannot tell you whether they are alive. A dead cell looks like a live one until it is
 * stained, and the stain is mixed one part to one — a dilution that is forgotten about as often as
 * it is made, and which halves the answer when it is.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useAct, useLab } from "@biolibs/bionet-react";
import { Glossed } from "@biolibs/glossary-react";
import { CHAMBERS, ENOUGH, OBJECTIVES, PER_SQUARE, alive, counting, dilutionFor, howSure,
         perMillilitre, squareVolume, type Chamber } from "./microscope.js";
import { ShowWorking } from "./working.js";
import type { Working } from "./pcr-working.js";

/** The views of the microscope, by the names every instrument's stage uses. */
export type CountView = "machine" | "block" | "screen" | "tube" | "result";

/** What the scene is told to show. It is shaped to be spread onto `InstrumentStage`. */
export interface CountStage {
  model: "microscope";
  name: string;
  view: CountView;
  onView: (view: CountView) => void;
  screen: { text: string; lit?: boolean }[];
  /** How many were counted, against how many a square can be counted at. */
  scale?: { what: string; from: number; to: number; ticks: number[]; at: number; label: string;
            bands: { from: number; to: number; label: string; tone: "good" | "dim" | "attention" }[] };
}

const number = (text: string): number | undefined => {
  const value = Number(text.trim());
  return text.trim() !== "" && Number.isFinite(value) ? value : undefined;
};

/** A count of cells a millilitre, written the way it is said rather than in full. */
export const perMl = (value: number): string => {
  if (value <= 0) return "0";
  const power = Math.floor(Math.log10(value));
  if (power < 4) return `${Math.round(value).toLocaleString("en-US")}`;
  const front = value / 10 ** power;
  return `${front.toFixed(1)} × 10${`${power}`.replace(/\d/g, (one) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(one)]!)}`;
};

/**
 * How a count of cells became cells in a millilitre, which is a factor of ten thousand done in
 * somebody's head.
 *
 * @param counted - How many cells were counted.
 * @param squares - Over how many large squares.
 * @param dilution - How many times the sample was diluted.
 * @param chamber - The chamber.
 * @returns The working.
 *
 * @example
 * ```ts
 * import { CHAMBERS, countWorking } from "@biolibs/bionet-tools";
 *
 * countWorking(120, 4, 2, CHAMBERS[0]!).comes;    // "6.0 × 10⁵ /mL"
 * ```
 */
export function countWorking(counted: number, squares: number, dilution: number, chamber: Chamber): Working {
  const each = squares <= 0 ? 0 : counted / squares;
  const volume = squareVolume(chamber);
  return {
    of: "Cells in a millilitre", comes: `${perMl(perMillilitre(counted, squares, dilution, chamber))} /mL`, kind: "exact",
    steps: [
      `${counted} cells over ${squares} large square${squares === 1 ? "" : "s"} is ${each.toFixed(1)} a square.`,
      `A large square of the ${chamber.name} is ${chamber.square} mm across with the coverslip ${chamber.depth} mm above it, so the liquid over it is ${volume} mL.`,
      `${each.toFixed(1)} ÷ ${volume} = ${perMl(each / volume)} a millilitre, in the chamber.`,
      ...(dilution === 1 ? ["The sample went in neat, so that is the culture."]
        : [`It was diluted ${dilution}-fold going in, so the culture is ${dilution} × that: ${perMl(perMillilitre(counted, squares, dilution, chamber))}.`]),
    ],
  };
}

/**
 * How far out a count is, from the count alone.
 *
 * @param counted - How many cells were counted.
 * @returns The working.
 *
 * @example
 * ```ts
 * import { sureWorking } from "@biolibs/bionet-tools";
 *
 * sureWorking(100).comes;    // "10%"
 * ```
 */
export function sureWorking(counted: number): Working {
  const error = howSure(counted);
  return {
    of: "How far out the figure is", comes: `${Math.round(error * 100)}%`, kind: "estimate",
    steps: [
      "Cells land in a square at random, so a count carries the error of a random count: about the square root of it.",
      `√${counted} is ${Math.sqrt(counted).toFixed(1)}, against ${counted} counted, which is ${Math.round(error * 100)}%.`,
      `Counting ${ENOUGH} brings that to about 10%, and counting 400 to about 5%.`,
      counted >= ENOUGH ? "This count is past that." : `This count is short of it: count more squares, not more carefully.`,
    ],
    rests: "It assumes the chamber filled evenly and nothing settled before it was looked at, which is why it is loaded from the edge and counted straight away.",
  };
}

/**
 * Counting cells, at the microscope they are counted on.
 *
 * @param options - `start` says what to open on; `instrument` is the microscope the lab has placed,
 *   if it has one; `onDone` adds a way to leave.
 * @returns `stage`, to spread onto `InstrumentStage` from `@biolibs/bionet-scene`, and `panel`, to put inside it.
 *
 * @example
 * ```tsx
 * import { useCountBench } from "@biolibs/bionet-tools";
 *
 * const bench = useCountBench({ instrument });
 * <InstrumentStage {...bench.stage}>{bench.panel}</InstrumentStage>
 * ```
 */
export function useCountBench({ instrument = null, onDone, start }: {
  instrument?: { id: string; name: string } | null; onDone?: () => void;
  /** What to show: the view, and what has been counted so far. */
  start?: { view?: CountView; squares?: readonly number[]; dilution?: number };
} = {}): { stage: CountStage; panel: ReactNode } {
  const lab = useLab()?.lab;
  const act = useAct();
  const [view, setView] = useState<CountView>(start?.view ?? "machine");
  const [chamberName, setChamberName] = useState(CHAMBERS[0]!.name);
  const [squares, setSquares] = useState<string[]>(["", "", "", ""]);
  const [dilution, setDilution] = useState(start?.dilution === undefined ? "2" : `${start.dilution}`);
  const [stained, setStained] = useState(true);
  const [blue, setBlue] = useState("");
  const [guess, setGuess] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [told, setTold] = useState<string | null>(null);

  useEffect(() => {
    if (start?.squares === undefined) return;
    setSquares([...start.squares.map((one) => `${one}`), "", "", ""].slice(0, 4));
  }, [start?.squares?.join(",")]);

  const chamber = CHAMBERS.find((one) => one.name === chamberName) ?? CHAMBERS[0]!;
  const counts = squares.map((one) => number(one)).filter((one): one is number => one !== undefined && one >= 0);
  const counted = counts.reduce((all, one) => all + one, 0);
  const used = counts.length;
  const times = number(dilution) ?? 1;
  const said = counting(counted, used, times, chamber);
  const dead = number(blue) ?? 0;
  const living = alive(Math.max(0, counted - dead), dead);
  const theGuess = number(guess);

  const top = Math.max(ENOUGH * 2, counted * 1.2);
  const stage: CountStage = {
    model: "microscope", name: instrument?.name ?? "Microscope", view, onView: setView,
    screen: [
      { text: used === 0 ? "—" : `${perMl(said.perMl)} /mL`, lit: true },
      { text: used === 0 ? "no squares counted" : `${counted} cells · ${used} square${used === 1 ? "" : "s"}` },
      ...(used > 0 && !said.enough ? [{ text: `±${Math.round(said.error * 100)}%`, lit: true }] : []),
    ],
    scale: {
      what: "how many cells were counted, against how many it takes to mean it",
      from: 0, to: top, ticks: [0, ENOUGH, top], at: counted, label: `${counted} counted`,
      bands: [
        { from: ENOUGH, to: top, label: "enough to mean it", tone: "good" },
        { from: 0, to: ENOUGH, label: "mostly chance", tone: "attention" },
      ],
    },
  };

  const record = async (): Promise<void> => {
    if (lab === null || lab === undefined) return;
    setBusy(true);
    const answer = await act("recordRun", {
      // A count uses nothing up and makes nothing: it is a reading of a culture at a moment, and
      // what matters later is how it was arrived at, not only what it came to.
      kind: "count", instrument: instrument?.id ?? null, inputs: [], outputs: [],
      outcome: said.enough && said.loaded !== "too many" ? "worked" : "failed",
      settings: {
        chamber: chamber.name.slice(0, 200), counted: `${counted}`, squares: `${used}`,
        per_square: said.perSquare.toFixed(1), dilution: `${times}`,
        per_ml: said.perMl.toPrecision(3), error: `${Math.round(said.error * 100)}%`,
        ...(stained && living.counted > 0 ? { alive: `${Math.round(living.fraction * 100)}%`, blue: `${dead}` } : {}),
      },
      note: note.trim() === "" ? null : note.trim(),
    });
    setBusy(false);
    setTold(answer.ok ? "Recorded." : answer.error);
  };

  if (lab === null || lab === undefined) return { stage, panel: null };

  const panel = (
    <div className="pcr count">
      <section className="card">
        <div className="toolhead">
          <h2>Count{instrument === null ? "" : ` · ${instrument.name}`}</h2>
          {onDone !== undefined && <button type="button" className="quiet" onClick={onDone}>Back to the lab</button>}
        </div>
        <fieldset disabled={busy} className="stack">
          <label>The chamber
            <select value={chamberName} onChange={(event) => setChamberName(event.target.value)} aria-label="The chamber">
              {CHAMBERS.map((one) => <option key={one.name} value={one.name}>{one.name} · {one.depth} mm deep</option>)}
            </select>
          </label>
          <label>Diluted how many times going in
            <input type="number" min={1} step={1} value={dilution} onChange={(event) => setDilution(event.target.value)}
                   placeholder="2" aria-label="Dilution going in" />
          </label>
        </fieldset>
        {used > 0 && (
          <p className="small" role="status">
            <strong>{perMl(said.perMl)} cells /mL</strong>
            <span className="dim"> · {counted} counted over {used} square{used === 1 ? "" : "s"}, ±{Math.round(said.error * 100)}%</span>
          </p>
        )}
      </section>

      {view === "machine" && (
        <section className="card">
          <h2>At the microscope</h2>
          <p className="small"><Glossed text="A haemocytometer is a slide with a grid etched into it and the coverslip held a tenth of a millimetre above it, so the liquid over each square is a known volume." /></p>
          <p className="dim small">Two things the eyepiece cannot tell you. Whether enough cells were counted for the figure to mean anything — cells land at random, so a count carries the error of a random count. And whether they are alive, since a dead cell looks like a live one until it is stained.</p>
          <p className="voice">Before anything</p>
          <p className="small">Load the chamber from the edge and let it draw itself in under the coverslip. A chamber that is pushed full is a chamber of unknown depth, and the depth is the whole measurement. Count straight away, before anything settles.</p>
          <p className="voice">Which lens</p>
          <ul className="plainlist small">
            {OBJECTIVES.map((one) => <li key={one.times}>×{one.times} — {one.what}</li>)}
          </ul>
        </section>
      )}

      {view === "block" && (
        <section className="card">
          <h2>The grid</h2>
          <p className="voice">What was in each large square</p>
          <fieldset disabled={busy} className="programme">
            {/* The name goes before the box: after it, each square's number sat under the next
                square's box and the four of them read as a column of mislabelled counts. */}
            {squares.map((one, at) => (
              <label key={at}>Square {at + 1}
                <input type="number" min={0} step={1} value={one} aria-label={`Square ${at + 1}`}
                       onChange={(event) => setSquares((was) => was.map((old, where) => (where === at ? event.target.value : old)))} />
              </label>
            ))}
          </fieldset>
          <p className="small">A large square is {chamber.square} mm across and the coverslip sits {chamber.depth} mm above it, so each holds {squareVolume(chamber)} mL. Count the cells on two of the four edges and not the other two, or every cell on a line is counted twice.</p>
          {used > 0 && <p className={said.loaded === "about right" ? "small good" : "trouble"} role="status">{said.says}</p>}
          <p className="voice">If it is too crowded to count</p>
          <fieldset disabled={busy} className="stack">
            <label>What you think the culture is, in cells a millilitre
              <input type="number" min={0} step={1e6} value={guess} onChange={(event) => setGuess(event.target.value)}
                     placeholder="100000000" aria-label="What you think the culture is" />
            </label>
          </fieldset>
          {theGuess !== undefined && theGuess > 0 && (
            <p className="small">Dilute it {dilutionFor(theGuess, chamber)}-fold and a square holds about {Math.round((theGuess / dilutionFor(theGuess, chamber)) * squareVolume(chamber))} cells, which is in the {PER_SQUARE.fewest}–{PER_SQUARE.most} a square that can be counted honestly.</p>
          )}
        </section>
      )}

      {view === "screen" && (
        <section className="card">
          <h2>What it comes to</h2>
          {used === 0 ? <p className="small dim">Nothing counted yet. The grid is where the counting goes.</p> : (
            <>
              <p className="small"><strong>{perMl(said.perMl)} cells /mL</strong></p>
              <p className="voice">The working</p>
              <ShowWorking working={countWorking(counted, used, times, chamber)} />
              <ShowWorking working={sureWorking(counted)} />
            </>
          )}
        </section>
      )}

      {view === "tube" && (
        <section className="card">
          <h2>In the drop</h2>
          <p className="voice">Which of them are alive</p>
          <fieldset disabled={busy} className="stack">
            <label className="check small">
              <input type="checkbox" checked={stained} onChange={(event) => setStained(event.target.checked)} /> Stained with trypan blue
            </label>
            {stained && (
              <label>How many of them were blue
                <input type="number" min={0} step={1} value={blue} onChange={(event) => setBlue(event.target.value)}
                       placeholder="0" aria-label="How many were blue" />
              </label>
            )}
          </fieldset>
          {stained ? (
            <>
              <p className="small">Trypan blue goes into cells whose membranes have failed, so the blue ones are the dead ones. It is mixed one part to one, which is why the dilution going in is 2 and not 1 — and that factor is forgotten about as often as it is made.</p>
              {living.counted > 0 && (
                <p className={living.enough ? "small good" : "trouble"} role="status">
                  {Math.round(living.fraction * 100)}% alive, from {living.counted} cells.
                  {living.enough ? "" : ` That is under ${ENOUGH}, so the percentage is as rough as the count.`}
                </p>
              )}
              <p className="dim small">The stain is toxic to what it has not killed yet: count within a few minutes, or the number that are alive falls while you watch it.</p>
            </>
          ) : (
            <p className="small">Unstained, the count is every cell that is there, alive or not. For a culture going into an induction that is usually what is wanted; for one being used to seed another, it is not.</p>
          )}
        </section>
      )}

      {view === "result" && (
        <section className="card">
          <h2>What the culture is</h2>
          {used === 0 ? <p className="small dim">Nothing counted yet.</p> : (
            <>
              <ul className="plainlist small">
                <li><strong>{perMl(said.perMl)} cells /mL</strong>{times === 1 ? "" : `, after a ${times}-fold dilution`}</li>
                <li>{counted} cells over {used} large square{used === 1 ? "" : "s"} · {said.perSquare.toFixed(1)} a square</li>
                <li className={said.enough ? "" : "warn"}>±{Math.round(said.error * 100)}%{said.enough ? "" : ` · under ${ENOUGH} cells`}</li>
                {stained && living.counted > 0 && <li>{Math.round(living.fraction * 100)}% alive</li>}
                <li>{chamber.name}</li>
              </ul>
              <p className="dim small">A count makes nothing and uses nothing up: it is what the culture was at the moment somebody looked. What is kept is how it was arrived at, so that a figure which turns out wrong can be read back rather than argued about.</p>
            </>
          )}
          <fieldset disabled={busy} className="stack">
            <label>Note<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Which culture, how long it had been growing" maxLength={2000} /></label>
            <div className="row">
              <button type="button" onClick={() => void record()} disabled={used === 0}>Record the count</button>
            </div>
          </fieldset>
          {told !== null && <p className="small" role="status">{told}</p>}
        </section>
      )}
    </div>
  );
  return { stage, panel };
}

/**
 * The microscope on its own, for a lab that has not drawn its room.
 *
 * @param props - `instrument` is the microscope the lab has placed, if it has one; `onDone` adds a way to leave.
 */
export function CountTool(props: Parameters<typeof useCountBench>[0]) {
  const bench = useCountBench(props);
  const names: [CountView, string][] = [["machine", "The microscope"], ["block", "The grid"], ["screen", "What it comes to"],
                                        ["tube", "In the drop"], ["result", "What the culture is"]];
  return (
    <div className="pcr">
      <div className="row tight pick" role="tablist" aria-label={`Views of ${bench.stage.name}`}>
        {names.map(([one, text]) => (
          <button key={one} type="button" role="tab" aria-selected={one === bench.stage.view} className={one === bench.stage.view ? "" : "quiet"}
                  onClick={() => bench.stage.onView(one)}>{text}</button>
        ))}
      </div>
      {bench.panel}
    </div>
  );
}
