/** Exception classes of Biopython's `Bio.Nexus`. */

/** Mirrors `Bio.Nexus.Nexus.NexusError`: the NEXUS data is malformed or unsupported. */
export class NexusError extends Error {
  /** @param message - What was wrong. */
  constructor(message: string) {
    super(message);
    this.name = "NexusError";
  }
}

/** Mirrors `Bio.Nexus.Trees.TreeError`: a tree description or operation is invalid. */
export class TreeError extends Error {
  /** @param message - What was wrong. */
  constructor(message: string) {
    super(message);
    this.name = "TreeError";
  }
}

/** Mirrors `Bio.Nexus.Nodes.ChainException`. */
export class ChainException extends Error {
  /** @param message - What was wrong. */
  constructor(message: string) {
    super(message);
    this.name = "ChainException";
  }
}

/** Mirrors `Bio.Nexus.Nodes.NodeException`. */
export class NodeException extends Error {
  /** @param message - What was wrong. */
  constructor(message: string) {
    super(message);
    this.name = "NodeException";
  }
}

/** Python's `StopIteration`, which escapes from a few places in the NEXUS parser when the input ends early. */
export class StopIteration extends Error {
  constructor() {
    super("");
    this.name = "StopIteration";
  }
}

/**
 * Python's `AttributeError`. Biopython's parser turns any `AttributeError` raised while running a command into
 * "Unknown command", so the places where Python would raise one throw this class.
 */
export class PyAttributeError extends Error {
  /** @param message - Python's wording. */
  constructor(message: string) {
    super(message);
    this.name = "AttributeError";
  }
}
