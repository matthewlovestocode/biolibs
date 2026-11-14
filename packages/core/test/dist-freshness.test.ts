/**
 * Publishing gate: `dist/` must hold nothing whose source is gone.
 *
 * Every package publishes `files: ["dist"]`, and `tsc -b` only ever adds to that directory — it never
 * removes the output of a file that has since been deleted or renamed. Ten such orphans had accumulated
 * across the workspace, including a `core/dist/types.js` whose source went away several commits ago.
 * They would have gone into the tarballs as live, importable modules, and they skewed coverage reports by
 * appearing as files with no tests. This fails the build instead.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const packagesDir = new URL("../../", import.meta.url).pathname;

/**
 * Every `.js` under a directory, recursively.
 *
 * @param dir - Where to look.
 * @returns Absolute paths.
 */
function jsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? jsFiles(p) : p.endsWith(".js") ? [p] : [];
  });
}

describe("built output", () => {
  const packages = readdirSync(packagesDir).filter((name) =>
    existsSync(join(packagesDir, name, "package.json")));

  for (const pkg of packages) {
    const dist = join(packagesDir, pkg, "dist");
    // A package that has not been built yet has nothing to check; the build runs before the tests.
    const it_ = existsSync(dist) ? it : it.skip;
    it_(`@biolibs/${pkg} has no output left over from a deleted source`, () => {
      const orphans = jsFiles(dist)
        .filter((js) => !existsSync(`${js.replace("/dist/", "/src/").slice(0, -3)}.ts`))
        .map((js) => js.slice(packagesDir.length));
      expect(orphans, "delete these, or rebuild from a clean dist/").toEqual([]);
    });
  }
});
