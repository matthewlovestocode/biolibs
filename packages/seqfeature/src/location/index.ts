/**
 * @packageDocumentation
 * Feature locations, a port of Biopython's `Location`, `SimpleLocation` and `CompoundLocation`.
 *
 * - `base.ts`: the abstract `Location` and shared types
 * - `simple.ts`, `compound.ts`: the two concrete kinds
 * - `patterns.ts`, `parse.ts`: GenBank/EMBL location-string parsing, installed as `Location.fromstring` and `SimpleLocation.fromstring` here
 * - `extract-util.ts`: helpers for taking sub-sequences
 */

import { Location } from "./base.js";
import { locationFromString, simpleLocationFromString } from "./parse.js";
import { SimpleLocation } from "./simple.js";

// Installed here because parsing needs the concrete classes, which in turn extend `Location`.
Location.fromstring = locationFromString;
SimpleLocation.fromstring = simpleLocationFromString;

export { Location, type ParentSequence, type References, type Strand } from "./base.js";
export { SimpleLocation, FeatureLocation } from "./simple.js";
export { CompoundLocation } from "./compound.js";
export { locationFromString, simpleLocationFromString } from "./parse.js";
