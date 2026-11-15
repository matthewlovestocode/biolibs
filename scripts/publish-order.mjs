/**
 * Prints the workspace packages in an order where every package's @biolibs dependencies come first.
 *
 * The order is derived from the manifests rather than written down, so adding a package or changing a
 * dependency cannot leave a stale list behind. It also checks that each manifest declares exactly what
 * its built output imports: a package that reaches for an undeclared sibling works inside the workspace,
 * where everything is hoisted, and fails for the first person who installs it on its own.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const dir = join(root, "packages");

/** Every @biolibs/* specifier appearing in a built file. */
function referenced(packageDir) {
  const found = new Set();
  const walk = (p) => {
    for (const entry of readdirSync(p, { withFileTypes: true })) {
      const full = join(p, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".js") || entry.name.endsWith(".d.ts")) {
        for (const m of readFileSync(full, "utf8").matchAll(/["'](@biolibs\/[a-z]+)["']/g)) found.add(m[1]);
      }
    }
  };
  const dist = join(packageDir, "dist");
  if (existsSync(dist)) walk(dist);
  return found;
}

const deps = new Map();
for (const name of readdirSync(dir).sort()) {
  const manifest = join(dir, name, "package.json");
  if (!existsSync(manifest)) continue;
  const m = JSON.parse(readFileSync(manifest, "utf8"));
  const declared = new Set(Object.keys(m.dependencies ?? {}).filter((d) => d.startsWith("@biolibs/")));
  const used = referenced(join(dir, name));
  used.delete(m.name);

  // Only complain when the build is present; an unbuilt tree cannot be checked this way.
  if (used.size > 0) {
    const missing = [...used].filter((d) => !declared.has(d));
    const unused = [...declared].filter((d) => !used.has(d));
    if (missing.length) throw new Error(`${m.name} uses ${missing.join(", ")} without declaring it`);
    if (unused.length) throw new Error(`${m.name} declares ${unused.join(", ")} but never uses it`);
  }
  deps.set(m.name, [...declared]);
}

const order = [];
const placed = new Set();
while (placed.size < deps.size) {
  const ready = [...deps].filter(([n, ds]) => !placed.has(n) && ds.every((d) => placed.has(d)))
    .map(([n]) => n).sort();
  if (ready.length === 0) {
    const stuck = [...deps.keys()].filter((n) => !placed.has(n));
    throw new Error(`dependency cycle among ${stuck.join(", ")}`);
  }
  for (const n of ready) { order.push(n); placed.add(n); }
}
console.log(order.join("\n"));
