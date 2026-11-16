/**
 * What a lab shows the world, and what it can see of another lab.
 *
 * These are for a lab's public page. They take what was fetched and checked as plain values and
 * draw it; none of them fetches, signs or holds state, so they can be drawn on a server.
 *
 * They also carry the wording. What a signature settles, and what it does not, has to be said the
 * same way on every lab's page — a page that words it itself will sooner or later claim more than
 * the checks support.
 */
import type { ReactNode } from "react";
import { settled, type FetchedInventory, type InventoryPart } from "@biolibs/bionet";
import type { SignatureCheck } from "@biolibs/opencloning";
import { Mark } from "@biolibs/bionet-react";

/**
 * The parts in one list whose checksums are not in another.
 *
 * @param mine - What this lab holds.
 * @param theirs - What the other lab holds.
 * @returns What they have that this lab does not. Names play no part: a part is its checksum.
 */
export function onlyTheirs(mine: readonly InventoryPart[], theirs: readonly InventoryPart[]): InventoryPart[] {
  const have = new Set(mine.map((part) => part.checksum));
  return theirs.filter((part) => !have.has(part.checksum));
}

/**
 * The parts two lists both hold, by checksum.
 *
 * @param mine - What this lab holds.
 * @param theirs - What the other lab holds.
 * @returns This lab's entries for the parts both have.
 */
export function heldByBoth(mine: readonly InventoryPart[], theirs: readonly InventoryPart[]): InventoryPart[] {
  const have = new Set(theirs.map((part) => part.checksum));
  return mine.filter((part) => have.has(part.checksum));
}

/**
 * The frame of a lab's public page: the mark, the lab's name, and a line about what it is.
 *
 * @param props - `name` and `note` are the lab's; `children` is the rest of the page.
 */
export function LabPage({ name, note, children }: { name: string; note?: string | null; children: ReactNode }) {
  return (
    <div className="bionet">
      <main className="page">
        <div className="title">
          <Mark size={40} />
          <h1>{name}</h1>
        </div>
        {note !== null && note !== undefined && <p className="dim">{note}</p>}
        <p className="small dim">
          This lab publishes what it holds at{" "}
          <a href="/.well-known/bionet.json"><code>/.well-known/bionet.json</code></a>, signed, so that a
          cloning plan can be acted on and not just read. Parts are named by checksum, because a name
          agrees with nothing.
        </p>
        {children}
      </main>
    </div>
  );
}

/** A table of parts: name, length, and whether each is on offer. `checksums` adds that column. */
export function PartsTable({ parts, checksums = false }: { parts: readonly InventoryPart[]; checksums?: boolean }) {
  return (
    <table>
      <thead><tr><th>Part</th><th>Length</th>{checksums && <th>Checksum</th>}<th>On offer</th></tr></thead>
      <tbody>
        {parts.map((part) => (
          <tr key={part.checksum}>
            <td>{part.name}{part.note !== null && <><br /><span className="dim small">{part.note}</span></>}</td>
            <td className="nowrap"><code>{part.length} bp{part.circular ? " ○" : ""}</code></td>
            {checksums && <td className="dim"><code>{part.checksum.slice(0, 22)}…</code></td>}
            <td className={part.available ? "good" : "bad"}>{part.available ? "yes" : "no"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * What this lab holds, and what the signature over that list settles.
 *
 * @param props - `parts` is the published list; `checks` is one check per signature over it;
 *   `origin` is the address this page is served from; `bound` is whether the list names that address.
 */
export function Held({ parts, checks, origin, bound }: {
  parts: readonly InventoryPart[]; checks: readonly SignatureCheck[]; origin: string; bound: boolean;
}) {
  const holds = checks.length > 0 && checks.every((check) => check.ok);
  return (
    <section>
      <h2>What we hold</h2>
      {parts.length === 0 ? <p className="dim">Nothing is listed at the moment.</p> : <PartsTable parts={parts} checksums />}
      <p className="small dim">
        {checks.length === 0 ? "This list is not signed, so it claims nothing about who published it." : (
          <>
            Signed by {checks.map((check) => <code key={check.public_key}>{check.fingerprint} </code>)}
            {holds ? "— the signature holds over this list as served." : "— the signature does not hold."}
          </>
        )}{" "}
        Bound to <code>{origin}</code>: {bound ? "yes" : "no"}.
      </p>
    </section>
  );
}

/** The caveat every reader is owed, in the same words everywhere. */
export function WhatASignatureSettles() {
  return (
    <p className="small dim">
      None of that says this lab is who it says it is. The address does that work, and only as far as
      whoever typed it already trusted it. What a signature settles is that this list has not changed
      since it was published, and that it was published by whoever holds that key.
    </p>
  );
}

/**
 * Another lab that answered, beside what this lab holds.
 *
 * @param props - `found` is what was fetched from the other lab and checked; `mine` is this lab's list.
 */
export function PeerAnswered({ found, mine }: { found: FetchedInventory; mine: readonly InventoryPart[] }) {
  const theirs = found.signed.inventory.parts;
  const only = onlyTheirs(mine, theirs);
  const both = heldByBoth(mine, theirs);
  return (
    <>
      <p>
        <strong>{found.signed.inventory.lab.name}</strong> answered at <code>{found.origin}</code> with{" "}
        {theirs.length} {theirs.length === 1 ? "part" : "parts"}.{" "}
        {settled(found)
          ? <span className="good">Its signature holds and it was served from the address it names.</span>
          : <span className="bad">Its signature or its address does not check out, so nothing below is settled.</span>}
      </p>
      <WhatASignatureSettles />
      <h3>What they have that we do not</h3>
      {only.length === 0 ? <p className="small">Nothing. Everything they list, we hold too.</p> : <PartsTable parts={only} />}
      <h3>What we both have</h3>
      {both.length === 0 ? <p className="small">Nothing in common, by checksum.</p> : (
        <p className="small">
          {both.map((part) => <code key={part.checksum}>{part.name} </code>)}
          — matched by checksum, so it does not matter what either of us calls them.
        </p>
      )}
      <p className="small dim">
        Fetched from that lab when this page was drawn, not copied. Nothing here fetches a part: finding
        out who has a plasmid is as far as software goes, and the rest is an email and a padded envelope.
      </p>
    </>
  );
}

/**
 * Another lab that did not answer.
 *
 * @param props - `address` is where it was asked for; `why` is what went wrong.
 */
export function PeerSilent({ address, why }: { address: string; why: string }) {
  return (
    <>
      <p>We point at <code>{address}</code> and it did not answer.</p>
      <p className="small dim">
        The reason given was: {why}. A lab that cannot be reached is not a lab that is lying — it may be
        down, or moved, or never have existed. All this page can honestly say is that the address did
        not answer when it was asked.
      </p>
    </>
  );
}
