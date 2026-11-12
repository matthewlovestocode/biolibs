/** Exceptions raised while building and writing structures (`Bio.PDB.PDBExceptions`). */

import { BioError } from "@biolibs/core";

/** Base class of the PDB exceptions. */
export class PDBException extends BioError {
  /** @param message - Description. */
  constructor(message: string) {
    super(message);
    this.name = "PDBException";
  }
}

/** A problem while building a structure from a file (duplicate ids, bad coordinates, ...). */
export class PDBConstructionException extends BioError {
  /** @param message - Description. */
  constructor(message: string) {
    super(message);
    this.name = "PDBConstructionException";
  }
}

/** A problem while writing a structure. */
export class PDBIOException extends BioError {
  /** @param message - Description. */
  constructor(message: string) {
    super(message);
    this.name = "PDBIOException";
  }
}

/** Category name of the warnings the structure builder and parsers emit. */
export const PDB_CONSTRUCTION_WARNING = "PDBConstructionWarning";
/** Category name of the warnings the structure writers emit. */
export const PDB_IO_WARNING = "PDBIOWarning";
