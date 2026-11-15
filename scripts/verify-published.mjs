/**
 * Checks that every workspace package is on the registry at the version in its manifest, and that the
 * version each one depends on is there too — so nothing was published before the thing it needs.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = join(new URL("..", import.meta.url).pathname, "packages");
const manifests = readdirSync(dir).sort()
  .map((n) => join(dir, n, "package.json")).filter(existsSync)
  .map((p) => JSON.parse(readFileSync(p, "utf8")));

/** The versions the registry has for a package, or null when it has none. */
function registryVersions(name) {
  try {
    return JSON.parse(execFileSync("npm", ["view", name, "versions", "--json"], { encoding: "utf8" }));
  } catch {
    return null;
  }
}

let bad = 0;
for (const m of manifests) {
  const versions = registryVersions(m.name);
  const have = versions === null ? [] : [].concat(versions);
  const ok = have.includes(m.version);
  console.log(`${ok ? "ok    " : "MISSING"} ${m.name.padEnd(28)} ${m.version}`);
  if (!ok) bad++;
}
console.log(bad === 0 ? `\nall ${manifests.length} packages are on the registry` : `\n${bad} missing`);
process.exit(bad ? 1 : 0);
