// Writes theme.css from the built package, so the file and themeCss() are the same text.
//   npx tsc -b packages/bionet-theme && node packages/bionet-theme/scripts/write-css.mjs
import { writeFileSync } from "node:fs";
import { themeCss } from "../dist/index.js";

writeFileSync(new URL("../theme.css", import.meta.url), themeCss());
console.log("wrote theme.css");
