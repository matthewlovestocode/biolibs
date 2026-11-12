/** Re-exports of the melting temperature API under Biopython's names. */
export { tmWallace, tmGC, makeTable, checkSeq, type ThermoTable } from "./melting-simple.js";
export { saltCorrection, chemCorrection } from "./melting-salt.js";
export { tmNN } from "./melting-nn.js";
export * as MeltingTempData from "./data/melting-temp-data.js";
