"use client";

/** The people: who is in the lab, and letting somebody in. */
import { useAct, useLab } from "@biolibs/bionet-react";
import { BackUpKey, BackUpLab } from "./backup.js";
import { Ask, Copy } from "./parts.js";

/** The roster, and for a keeper the way to add somebody. Draws nothing until the lab has arrived. */
export function People() {
  const state = useLab();
  const act = useAct();
  const lab = state?.lab;
  if (state === null || lab === null || lab === undefined) return null;
  return (
    <>
      <section className="card">
        <h2>Who is in the lab</h2>
        <table>
          <thead><tr><th>Person</th><th>Role</th><th>Device</th><th /></tr></thead>
          <tbody>
            {lab.roster.map((one) => (
              <tr key={one.key} className={one.removed === null ? undefined : "gone"}>
                <td>{one.person}{one.you && <span className="badge calm">this device</span>}</td>
                <td>{one.removed !== null ? "removed" : one.founder ? "keeper · founder" : one.role}</td>
                <td><code>{one.fingerprint}</code></td>
                <td>{one.removed !== null && <span className="dim small">log kept up to entry {one.removed.cutoff + 1}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="dim small">A device is known by its key. One person with two computers appears twice, once for each.</p>
      </section>
      {lab.keeper ? (
        <section className="card">
          <h2>Add somebody</h2>
          <p className="dim small">Ask them for their device's key, add it here, and send them the invitation. Their app fills in once this change has reached the lab's peer.</p>
          <Ask onAsk={(data) => act("addMember", { key: String(data.get("key") ?? ""), person: String(data.get("person") ?? ""), role: String(data.get("role") ?? "member") })} className="stack">
            <label>Their device's key<input name="key" placeholder="43 letters and digits" required spellCheck={false} /></label>
            <label>Their name<input name="person" required maxLength={200} /></label>
            <label>As<select name="role"><option value="member">a member, who can change the freezer</option><option value="keeper">a keeper, who can also change who is in the lab</option></select></label>
            <button type="submit">Add to the lab</button>
          </Ask>
          {state.peer.invite !== null ? (
            <div className="keybox">
              <div><span className="label">Invitation to send them</span><Copy words={state.peer.invite} label="Copy invitation" /></div>
              <code className="wrap">{state.peer.invite}</code>
            </div>
          ) : <p className="dim small">Set the lab's web peer under Sharing to have an invitation to send.</p>}
        </section>
      ) : <p className="dim small">Only a keeper can change who is in the lab.</p>}
      <BackUpKey />
      <BackUpLab />
    </>
  );
}
