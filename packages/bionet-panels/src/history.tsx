"use client";

/** The history: every signed change, and what became of it. */
import { useState } from "react";
import type { EntryView, LabView } from "@biolibs/bionet-client";
import { useLab } from "@biolibs/bionet-react";
import { slotName } from "@biolibs/bionet-space";

/**
 * What one change was, in words.
 *
 * @param entry - The change.
 * @param lab - The lab, to name the parts, tubes and people it refers to.
 * @returns A phrase that follows the name of whoever made it, like `used 2 µL of a tube of f1`.
 */
export function describeEntry(entry: Pick<EntryView, "op">, lab: Pick<LabView, "parts" | "items" | "roster"> & Partial<Pick<LabView, "places">>): string {
  const op = entry.op;
  const part = (checksum: unknown): string => lab.parts.find((one) => one.checksum === checksum)?.name ?? "a part";
  const tube = (id: unknown): string => {
    const item = lab.items.find((one) => one.item === id);
    return item === undefined ? "a tube" : `a tube of ${part(item.part)}`;
  };
  const unit = (id: unknown): string => lab.items.find((one) => one.item === id)?.unit ?? "";
  const who = (key: unknown): string => lab.roster.find((one) => one.key === key)?.person ?? "a device";
  const place = (id: unknown): string => lab.places?.find((one) => one.place === id)?.name ?? "a place";
  const tidy = (words: string): string => words.replace(/\s+/g, " ").trim();
  switch (op.type) {
    case "roster.found": return `founded ${String(op["name"])}`;
    case "roster.add": return `added ${String(op["person"])} as a ${String(op["role"])}`;
    case "roster.remove": return `removed ${who(op["key"])}`;
    case "roster.role": return `made ${who(op["key"])} a ${String(op["role"])}`;
    case "part.add": return `added the part ${String(op["name"])}`;
    case "part.annotate": return `marked ${Array.isArray(op["features"]) ? op["features"].length : 0} features on ${part(op["part"])}`;
    case "part.offer": return op["available"] === true ? `put ${part(op["part"])} on offer` : `took ${part(op["part"])} off offer`;
    case "item.add": return tidy(`added ${tube(op["item"])}, ${String(op["amount"])} ${String(op["unit"] ?? "")}`);
    case "item.adjust": return tidy(`${Number(op["by"]) < 0 ? "used" : "added"} ${Math.abs(Number(op["by"]))} ${unit(op["item"])} ${Number(op["by"]) < 0 ? "of" : "to"} ${tube(op["item"])}`);
    case "item.recount": return tidy(`counted ${String(op["amount"])} ${unit(op["item"])} in ${tube(op["item"])}`);
    case "item.retire": return `retired ${tube(op["item"])}`;
    case "place.add": return `added the ${String(op["kind"])} ${String(op["name"])}${op["parent"] === null ? "" : ` in ${place(op["parent"])}`}`;
    case "place.move": return op["parent"] === null ? `took ${place(op["place"])} out of where it was` : `moved ${place(op["place"])} into ${place(op["parent"])}`;
    case "place.stand": return op["standing"] === null ? `cleared where ${place(op["place"])} stands` : `said where ${place(op["place"])} stands`;
    case "place.retire": return `retired ${place(op["place"])}`;
    case "item.put": {
      const slot = op["slot"] as { row: number; column: number } | null;
      return op["place"] === null ? `took ${tube(op["item"])} out of where it was`
        : `put ${tube(op["item"])} in ${place(op["place"])}${slot === null ? "" : `, ${slotName(slot)}`}`;
    }
    case "run.record": {
      const made = Array.isArray(op["outputs"]) ? (op["outputs"] as { name?: unknown }[]) : [];
      const at = op["instrument"] === null ? "" : ` at ${place(op["instrument"])}`;
      if (op["kind"] === "digest") {
        const settings = (typeof op["settings"] === "object" && op["settings"] !== null ? op["settings"] : {}) as Record<string, unknown>;
        const cut = Array.isArray(op["inputs"]) ? tube((op["inputs"] as { item?: unknown }[])[0]?.item) : "a tube";
        const enzymes = typeof settings["enzymes"] === "string" ? ` with ${settings["enzymes"].replace(/\+/g, " and ")}` : "";
        return `digested ${cut}${enzymes}${at}: the gel ${op["outcome"] === "worked" ? "matched" : "did not match"}`;
      }
      const what = op["kind"] === "pcr" ? "a PCR" : `a ${String(op["kind"])} run`;
      return op["outcome"] === "worked" ? `ran ${what}${at}, which made ${made.map((one) => String(one.name)).join(" and ") || "nothing"}` : `ran ${what}${at}, which did not work`;
    }
    case "field.set": return `set ${String(op["field"])} to ${String(op["value"])}`;
    default: return `did something this version does not know (${op.type})`;
  }
}

/** Every change, newest first, with what became of each. Draws nothing until the lab has arrived. */
export function History({ first = 40 }: { first?: number }) {
  const lab = useLab()?.lab;
  const [all, setAll] = useState(false);
  if (lab === null || lab === undefined) return null;
  const newest = [...lab.entries].reverse();
  const shown = all ? newest : newest.slice(0, first);
  return (
    <section className="card">
      <h2>Everything that has happened</h2>
      <p className="dim small">Each line is one signed change. The time is what the signer's computer said, which is a claim; the order is worked out from what each person had seen.</p>
      {lab.overlaps.length > 0 && <p className="note">{lab.overlaps.length} {lab.overlaps.length === 1 ? "pair of changes was" : "pairs of changes were"} made without knowledge of each other. One of each stood; both are below.</p>}
      {lab.waiting > 0 && <p className="note">{lab.waiting} {lab.waiting === 1 ? "change is" : "changes are"} waiting on others that have not arrived yet.</p>}
      <table>
        <thead><tr><th>When</th><th>Who</th><th>What</th><th /></tr></thead>
        <tbody>
          {shown.map((entry) => (
            <tr key={entry.id} className={entry.status === "applied" ? undefined : "gone"}>
              <td className="dim nowrap">{new Date(entry.signedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</td>
              <td>{entry.signer ?? lab.roster.find((one) => one.key === entry.author)?.person ?? "unknown"}</td>
              <td>{describeEntry(entry, lab)}</td>
              <td>{entry.status !== "applied" && <span className="badge" title={entry.reason ?? ""}>{entry.status}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!all && newest.length > shown.length && <button type="button" className="quiet" onClick={() => setAll(true)}>Show all {newest.length}</button>}
    </section>
  );
}
