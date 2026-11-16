import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const src = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // An entry point other than the package's own has to be named before the package is.
      "@biolibs/bionet-client/sqlite": fileURLToPath(new URL("./packages/bionet-client/src/sqlite.ts", import.meta.url)),
      ...Object.fromEntries(
      ["core", "seq", "seqio", "align", "phylo", "seqtools", "seqfeature", "seqrecord", "nexus", "svdsuperimposer", "pdb", "restriction", "motifs", "gel", "seqmap", "pcr", "seqedit", "features", "cloning", "dseq", "seguid", "assembly", "dseqrecord", "entrez", "pdblist", "assembly2", "opencloning", "bionet", "bionet-theme", "bionet-peer", "bionet-client", "bionet-react", "bionet-panels", "bionet-space", "bionet-scene", "bionet-tools"].map((n) => [`@biolibs/${n}`, src(n)]),
      ),
    },
  },
  test: { include: ["packages/*/test/**/*.test.ts"] },
});
