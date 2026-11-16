"use client";

/** Keeping this device's key somewhere else, and taking one up again on a new device. */
import { createContext, useContext, useState } from "react";
import { useAct, useLab } from "@biolibs/bionet-react";
import { Ask } from "./parts.js";

/**
 * How to hand the person a file to keep. A host that cannot use the browser's own way supplies one.
 * The default offers it as a download.
 */
export const SaveContext = createContext<(name: string, text: string) => Promise<void>>(async (name, text) => {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
});

/** Seal this device's key under a passphrase and hand it over as a file. */
export function BackUpKey() {
  const state = useLab();
  const act = useAct();
  const save = useContext(SaveContext);
  const [note, setNote] = useState<string | null>(null);
  if (state === null) return null;
  return (
    <section className="card">
      <h2>Back up this device's key</h2>
      <p className="dim small">
        Everything you sign is signed by a key that exists only on this computer. If the computer is lost, so is the key, and a lab with
        nobody else in it is lost with it. This writes the key to a file, sealed under a passphrase. Keep the file somewhere that is not
        this computer, and the passphrase somewhere that is not the file. Nothing here remembers the passphrase.
      </p>
      <Ask className="stack" onAsk={async (data) => {
        setNote(null);
        const [first, again] = [String(data.get("passphrase") ?? ""), String(data.get("again") ?? "")];
        if (first !== again) { setNote("Those two passphrases are not the same."); return { ok: false }; }
        const answer = await act("backUp", first);
        if (!answer.ok) return answer;
        await save(`bionet-key-${state.device.fingerprint}.json`, String(answer.result));
        setNote("Sealed and handed over. Open it only on a new device, before that device joins a lab.");
        return answer;
      }}>
        <label>Passphrase<input name="passphrase" type="password" required minLength={12} autoComplete="new-password" /></label>
        <label>And again<input name="again" type="password" required minLength={12} autoComplete="new-password" /></label>
        <button type="submit">Seal and save</button>
      </Ask>
      {note !== null && <p className="small" role="status">{note}</p>}
    </section>
  );
}

/** Take up a key from a backup, on a device that is not in a lab yet. */
export function RestoreKey() {
  const act = useAct();
  return (
    <details className="restore">
      <summary>Replacing a lost device? Restore its key</summary>
      <p className="dim small">Choose the backup file and give its passphrase. This device then signs as the lost one did. Do this before joining, and only if the old device is really gone: one key on two devices writes two histories the lab cannot tell apart.</p>
      <Ask className="stack" onAsk={async (data) => {
        const file = data.get("backup");
        const backup = file instanceof File ? await file.text() : "";
        return act("restore", { backup, passphrase: String(data.get("passphrase") ?? "") });
      }}>
        <label>Backup file<input name="backup" type="file" accept="application/json,.json" required /></label>
        <label>Passphrase<input name="passphrase" type="password" required autoComplete="off" /></label>
        <button type="submit" className="quiet">Restore key</button>
      </Ask>
    </details>
  );
}
