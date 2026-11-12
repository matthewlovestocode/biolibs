/** `FeatureValueCleaner`: tidies feature qualifier values as they are read. */

import { AssertionError } from "@biolibs/core";

/**
 * Cleans qualifier values by key. Currently only `translation` is processed: whitespace inside the amino acid
 * string (from line wrapping) is removed.
 */
export class FeatureValueCleaner {
  /** Qualifier keys this cleaner processes. */
  private readonly toProcess: string[];

  /** @param toProcess - Keys to clean. Default `["translation"]`. */
  constructor(toProcess: string[] = ["translation"]) {
    this.toProcess = toProcess;
  }

  /** `FeatureValueCleaner(['translation'])`. */
  repr(): string {
    return `${this.constructor.name}([${this.toProcess.map((k) => `'${k}'`).join(", ")}])`;
  }

  /** The cleaned value for `keyName` (unchanged for keys that are not processed). */
  cleanValue(keyName: string, value: string): string {
    if (this.toProcess.includes(keyName)) {
      if (keyName !== "translation") throw new AssertionError(`No function to clean key: ${keyName}`);
      return value.split(/\s+/).filter(Boolean).join("");
    }
    return value;
  }
}
