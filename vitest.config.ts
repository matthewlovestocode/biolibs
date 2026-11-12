import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const src = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: Object.fromEntries(
      ["core", "seq", "seqio", "align", "phylo", "seqtools", "seqfeature", "seqrecord", "nexus"].map((n) => [`@biolibs/${n}`, src(n)]),
    ),
  },
  test: { include: ["packages/*/test/**/*.test.ts"] },
});
