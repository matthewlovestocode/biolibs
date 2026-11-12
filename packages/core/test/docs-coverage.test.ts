import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Documentation gate: every top-level exported declaration in every package
 * (generated data files included) must have a TSDoc comment. Overload
 * signatures that share a name with the previous export are covered by the
 * first one's comment.
 */
const packagesDir = new URL("../../", import.meta.url).pathname;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === "node_modules" || name === "dist" || name === "test") return [];
    return statSync(p).isDirectory() ? sourceFiles(p) : p.endsWith(".ts") ? [p] : [];
  });
}

const EXPORT = /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(const|let|function\*?|class|interface|type|enum)\s+(\w+)/;

function undocumented(file: string): string[] {
  const lines = readFileSync(file, "utf8").split("\n");
  const missing: string[] = [];
  let previousName = "";
  lines.forEach((line, i) => {
    const m = EXPORT.exec(line);
    if (!m) return;
    const name = m[2]!;
    let j = i - 1;
    while (j >= 0 && lines[j]!.trim() === "") j--;
    const documented = j >= 0 && lines[j]!.trim().endsWith("*/");
    if (!documented && name !== previousName) missing.push(`${file.replace(packagesDir, "")}:${i + 1} ${m[1]} ${name}`);
    previousName = name;
  });
  return missing;
}

describe("documentation coverage", () => {
  for (const pkg of readdirSync(packagesDir).filter((d) => statSync(join(packagesDir, d)).isDirectory())) {
    const src = join(packagesDir, pkg, "src");
    it(`every export in @biolibs/${pkg} has a doc comment`, () => {
      const files = sourceFiles(src);
      expect(files.length).toBeGreaterThan(0);
      expect(files.flatMap(undocumented)).toEqual([]);
    });
  }
});
