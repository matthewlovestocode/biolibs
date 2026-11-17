"use client";

/**
 * Laying a construct out piece by piece, and watching the reading frame as you do it.
 *
 * The assembly desk is about the molecules: which pieces go round the ring and what primers make
 * them fit. This is about the protein, and it is the other half of the same afternoon's work. A
 * ring can be built perfectly, sequence exactly as designed, and give the wrong protein, because
 * what was joined does not read as one chain — and nothing at the bench will say so.
 *
 * So the frame is the thing the panel is built around: every junction says whether it survived, and
 * a piece that is not a whole number of codons is named along with what it does to everything after
 * it. It is a desk, not a machine. What it hands a scene is the construct drawn over the tube of
 * its first piece.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAct, useLab } from "@biolibs/bionet-react";
import { Glossed } from "@biolibs/glossary-react";
import { ROLES, designFusion, fusionWorking, type Fusion, type Role } from "./fusion.js";
import { SequenceMap } from "./map.js";
import { moleculeOf, type DrawnMolecule } from "./sequence-file.js";
import { ShowWorking } from "./working.js";

/** What a host is handed to draw beside the panel. */
export interface FusionDesk {
  /** The tube of the first piece, to look at, if the lab has one that has been put somewhere. */
  focus: { place: string; item: string } | null;
  /** The construct as a molecule, with each piece marked on it. `null` until there is one. */
  molecule: DrawnMolecule | null;
  /** The construct as it stands, or `null`. */
  made: Fusion | null;
}

/** What each role is called, and a word on what it is for. */
const SAYS: Readonly<Record<Role, string>> = {
  promoter: "turns the gene on; not part of the protein",
  signal: "sends the protein out; cut off on the way, and only works at the very start",
  coding: "the protein itself",
  tag: "for pulling it out or spotting it; part of the protein",
  linker: "a few residues between two pieces; part of the protein",
  terminator: "stops the reading; not part of the protein",
  other: "something else",
};

const count = (value: number): string => value.toLocaleString("en-US");

/**
 * Putting a construct together from the lab's own parts, with the frame checked as it is built.
 *
 * @param options - `start` says what to open on, for a tour or a link.
 * @returns `panel`, the tool itself, and `desk`, what a scene beside it should look at.
 *
 * @example
 * ```tsx
 * import { useFusionBench } from "@biolibs/bionet-tools";
 *
 * const bench = useFusionBench();
 * <LabView lab={lab} wide beside={bench.panel} {...(bench.desk.focus === null ? {} : { focus: bench.desk.focus })} />
 * ```
 */
export function useFusionBench({ start }: {
  /** What to show: the pieces in order, each with what it is for. Followed whenever it changes. */
  start?: { pieces?: readonly { part: string; as: Role }[]; name?: string };
} = {}): { panel: ReactNode; desk: FusionDesk } {
  const lab = useLab()?.lab;
  const act = useAct();
  const [pieces, setPieces] = useState<{ part: string; as: Role }[]>([...(start?.pieces ?? [])]);
  const [name, setName] = useState(start?.name ?? "");
  const [adding, setAdding] = useState("");
  const [role, setRole] = useState<Role>("coding");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  const asked = JSON.stringify(start ?? null);
  useEffect(() => {
    if (start === undefined) return;
    if (start.pieces !== undefined) setPieces([...start.pieces]);
    if (start.name !== undefined) setName(start.name);
  }, [asked]);

  // Only DNA: a fusion is built out of DNA, and a protein the lab holds is not a piece of one.
  const offered = useMemo(() => (lab?.parts ?? []).filter((one) => one.kind !== "protein"), [lab?.parts]);
  const made = useMemo(() => (lab === null || lab === undefined || pieces.length === 0 ? null
    : designFusion(lab, { pieces, ...(name.trim() === "" ? {} : { name }) })), [lab, pieces, name]);
  const good = made !== null && made.problem === null ? made : null;
  const working = useMemo(() => (good === null ? [] : fusionWorking(good)), [good]);

  const first = pieces[0] === undefined ? undefined : (lab?.items ?? []).find((one) => one.part === pieces[0]!.part && !one.retired && one.where !== null);
  const desk: FusionDesk = {
    focus: first?.where == null ? null : { place: first.where.place, item: first.item },
    molecule: good === null ? null : { ...moleculeOf({ name: good.name, length: good.sequence.length, circular: false, features: good.features }), name: good.name },
    made: good,
  };

  const partName = (checksum: string): string => lab?.parts.find((one) => one.checksum === checksum)?.name ?? "a part";
  const move = (at: number, by: number): void => {
    const to = at + by;
    if (to < 0 || to >= pieces.length) return;
    const next = [...pieces];
    [next[at], next[to]] = [next[to]!, next[at]!];
    setPieces(next);
    setSaid(null);
  };
  const keep = async (): Promise<void> => {
    if (good === null) return;
    setBusy(true);
    const answer = await act("addPart", { name: good.name, sequence: good.sequence, features: good.features });
    setBusy(false);
    setSaid(answer.ok ? `Kept as ${good.name}. There is no tube of it: it has to be built.` : answer.error);
  };

  const panel = lab === null || lab === undefined ? null : (
    <div className="bionet fusion">
      <section className="card">
        <h2>Put a construct together</h2>
        <p className="small"><Glossed text="A signal peptide is the first stretch of a protein the cell means to let out, and is cut off on the way." /></p>
        <p className="dim small">
          The pieces in the order they go along the construct. What matters here is not whether they join — that is the assembly desk —
          but whether what they make reads as one protein. A piece that is not a whole number of codons shifts everything after it, and
          a construct with the frame out by one base builds perfectly, sequences exactly as designed, and makes the wrong protein.
        </p>
        {offered.length === 0 ? <p className="empty">The lab has no DNA to build from.</p> : (
          <fieldset disabled={busy} className="stack">
            <ol className="pieces">
              {pieces.map((piece, at) => (
                <li key={`${piece.part} ${at}`}>
                  <span className="what"><strong>{partName(piece.part)}</strong> <span className="dim small">· {piece.as} — {SAYS[piece.as]}</span></span>
                  <span className="row tight">
                    <button type="button" className="plain" onClick={() => move(at, -1)} aria-label="Move it earlier" disabled={at === 0}>↑</button>
                    <button type="button" className="plain" onClick={() => move(at, 1)} aria-label="Move it later" disabled={at === pieces.length - 1}>↓</button>
                    <button type="button" className="plain" onClick={() => { setPieces(pieces.filter((_, each) => each !== at)); setSaid(null); }}>take out</button>
                  </span>
                </li>
              ))}
            </ol>
            <form className="row tight" onSubmit={(event) => {
              event.preventDefault();
              if (adding === "") return;
              setPieces([...pieces, { part: adding, as: role }]);
              setAdding(""); setSaid(null);
            }}>
              <select value={adding} onChange={(event) => setAdding(event.target.value)} aria-label="A piece to add">
                <option value="">Add a piece…</option>
                {offered.map((one) => <option key={one.checksum} value={one.checksum}>{one.name} · {count(one.length)} bp</option>)}
              </select>
              <select value={role} onChange={(event) => setRole(event.target.value as Role)} aria-label="What it is for">
                {ROLES.map((one) => <option key={one} value={one}>{one}</option>)}
              </select>
              <button type="submit" disabled={adding === ""}>Add</button>
            </form>
            <label>Call it<input value={name} onChange={(event) => setName(event.target.value)} maxLength={200} placeholder={good?.name ?? "a name for the construct"} /></label>
          </fieldset>
        )}
        {made !== null && made.problem !== null && <p className="trouble" role="status">{made.problem}</p>}
      </section>

      {good !== null && (
        <>
          <section className="card">
            <h2>The frame</h2>
            {good.junctions.length === 0 ? <p className="dim small">There is only one translated piece, so there is no junction inside the protein.</p> : (
              <ul className="checks">
                {good.junctions.map((one) => (
                  <li key={`${one.after} ${one.at}`} className={one.inFrame ? "look" : "stop"}>
                    {one.says} <code className="because">base {count(one.at)}</code>
                  </li>
                ))}
              </ul>
            )}
            <p className="voice">Checks</p>
            {good.checks.length === 0 ? <p className="small good">Nothing about this construct looks wrong.</p> : (
              <ul className="checks">
                {good.checks.map((one) => <li key={one.says} className={one.weight}>{one.says} <code className="because">{one.because}</code></li>)}
              </ul>
            )}
          </section>

          <section className="card">
            <h2>What it makes</h2>
            <SequenceMap name={good.name} length={good.sequence.length} circular={false} features={good.features}
                         {...(good.coding === null ? {} : { spans: [{ start: good.coding.from - 1, end: good.coding.to, label: "read", strand: 0 as const }] })} />
            <p className="small"><strong>{count(good.protein.length)} amino acids</strong>{good.mature === null ? "" : <span className="dim"> · {count(good.mature.length)} once the signal peptide is cut off</span>}</p>
            <p className="small"><code className="seq">{good.protein.slice(0, 120)}{good.protein.length > 120 ? "…" : ""}</code></p>
            <fieldset disabled={busy} className="row">
              <button type="button" onClick={() => void keep()}>Keep it as a part</button>
              <span className="dim small">No tube: it still has to be built. The assembly desk designs the primers for that.</span>
            </fieldset>
            {said !== null && <p className="small" role="status">{said}</p>}
          </section>

          <section className="card">
            <h2>The working</h2>
            {working.map((one) => <ShowWorking key={one.of} working={one} />)}
          </section>
        </>
      )}
    </div>
  );
  return { panel, desk };
}

/**
 * The construct desk on its own, for a lab that has not drawn its room.
 *
 * @param props - `start` says what to open on.
 */
export function FusionTool(props: Parameters<typeof useFusionBench>[0]) {
  return <>{useFusionBench(props).panel}</>;
}
