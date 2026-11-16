/**
 * A device's store as one SQLite file, using the SQLite built into Node.
 *
 * This is its own entry point, `@biolibs/bionet-client/sqlite`, because it needs Node: importing the
 * rest of the package into a browser must not drag it in.
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { SignedEntry } from "@biolibs/bionet";
import type { LabStore } from "./store.js";

// Asked for at run time and not imported, because tools that bundle or transform code do not all
// know yet that `node:sqlite` is part of Node and has no name without its prefix.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

/**
 * Open, or make, a device's store in a folder.
 *
 * @param dir - The folder. The file is `lab.db` inside it.
 * @returns The store.
 */
export function sqliteStore(dir: string): LabStore {
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, "lab.db"));
  db.exec(`
    pragma journal_mode = wal;
    create table if not exists entries (id text primary key, author text not null, seq integer not null, json text not null);
    create index if not exists entries_by_log on entries (author, seq);
    create table if not exists settings (name text primary key, value text not null);
  `);
  const insert = db.prepare("insert or ignore into entries (id, author, seq, json) values (?, ?, ?, ?)");
  const put = db.prepare("insert into settings (name, value) values (?, ?) on conflict(name) do update set value = excluded.value");
  const get = db.prepare("select value from settings where name = ?");
  const forget = db.prepare("delete from settings where name = ?");
  const all = db.prepare("select json from entries order by author, seq");

  return {
    entries: () => all.all().map((row) => JSON.parse(String(row["json"])) as SignedEntry),
    add(entries) {
      db.exec("begin");
      try {
        for (const { id, signed } of entries) insert.run(id, signed.entry.author, signed.entry.seq, JSON.stringify(signed));
        db.exec("commit");
      } catch (cause) {
        db.exec("rollback");
        throw cause;
      }
    },
    setting(name) {
      const row = get.get(name);
      return row === undefined ? null : String(row["value"]);
    },
    set(name, value) {
      if (value === null) forget.run(name);
      else put.run(name, value);
    },
    close: () => db.close(),
  };
}
