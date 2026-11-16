"use client";

/** The small pieces the panels are made of. */
import { createContext, useContext, useState, type FormEvent, type ReactNode } from "react";
import type { LabSnapshot, PeerView } from "@biolibs/bionet-client";
import { useTrouble } from "@biolibs/bionet-react";

/** How to put words on the clipboard. A host that cannot use the browser's own way supplies one. */
export const CopyContext = createContext<(words: string) => Promise<void>>((words) => navigator.clipboard.writeText(words));

/** A form that asks for one thing and clears itself if it worked. */
export function Ask({ onAsk, children, className }: { onAsk: (data: FormData) => Promise<{ ok: boolean }>; children: ReactNode; className?: string }) {
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    const { ok } = await onAsk(new FormData(form));
    setBusy(false);
    if (ok) form.reset();
  };
  return <form className={className} onSubmit={submit} aria-busy={busy}><fieldset disabled={busy}>{children}</fieldset></form>;
}

/** A button that copies some words and says that it did. */
export function Copy({ words, label = "Copy" }: { words: string; label?: string }) {
  const copy = useContext(CopyContext);
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="quiet" onClick={() => { void copy(words).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}>
      {done ? "Copied" : label}
    </button>
  );
}

/** The last change that was refused, with a way to put it away. Draws nothing when there is none. */
export function Trouble() {
  const { trouble, dismiss } = useTrouble();
  if (trouble === null) return null;
  return <p role="alert" className="trouble">{trouble}<button type="button" className="plain" onClick={dismiss}>dismiss</button></p>;
}

/**
 * How the connection to the lab's peer is going, in the words a person would want.
 *
 * @param peer - The connection.
 * @returns One line.
 */
export function syncWords(peer: PeerView): string {
  const waiting = peer.pending === 0 ? "" : ` · ${peer.pending} ${peer.pending === 1 ? "change" : "changes"} to send`;
  if (peer.url === null) return "No peer set · working on this device only";
  switch (peer.status) {
    case "synced": return "In step with the lab";
    case "syncing": return "Syncing…";
    case "connecting": return `Reaching the lab's peer…${waiting}`;
    case "waiting": return "Waiting to be let in";
    default: return `Offline${waiting}`;
  }
}

/** A dot and a line saying how the connection to the lab's peer is going. */
export function SyncStatus({ peer }: { peer: PeerView }) {
  return (
    <div className="sync" title={peer.problem ?? peer.url ?? ""}>
      <span className={`dot ${peer.url === null ? "offline" : peer.status}`} />
      <span>{syncWords(peer)}</span>
    </div>
  );
}

/** This device's key, to be sent to a keeper. */
export function DeviceKey({ device }: { device: LabSnapshot["device"] }) {
  return (
    <div className="keybox">
      <div><span className="label">This device's key</span><Copy words={device.key} label="Copy key" /></div>
      <code className="wrap">{device.key}</code>
      <p className="dim small">Fingerprint <code>{device.fingerprint}</code>. It is safe to send: it lets a lab recognise this device, and nothing else.</p>
    </div>
  );
}
