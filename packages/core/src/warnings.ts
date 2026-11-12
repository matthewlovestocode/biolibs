/**
 * A small equivalent of Python's `warnings` module, for recoverable problems
 * (for example a partial codon during translation).
 */

/** One recorded warning, as raised by {@link warn}. */
export interface BioWarning {
  /** Warning class name, for example `"BiopythonWarning"`. */
  category: string;
  /** Warning text. */
  message: string;
}

/** Receives warnings. The default handler prints to `console.warn`. */
export type WarningHandler = (w: BioWarning) => void;

/** The active handler; swap it with {@link setWarningHandler} or use {@link captureWarnings}. */
let warningHandler: WarningHandler = (w) => console.warn(`${w.category}: ${w.message}`);

/**
 * Replace the global warning handler (Python's `warnings.showwarning`).
 *
 * @param handler - New handler.
 * @returns The previous handler, so callers can restore it.
 */
export function setWarningHandler(handler: WarningHandler): WarningHandler {
  const prev = warningHandler;
  warningHandler = handler;
  return prev;
}

/**
 * Emit a warning (Python's `warnings.warn`).
 *
 * @param message - Warning text.
 * @param category - Warning class name. Default `"BiopythonWarning"`.
 */
export function warn(message: string, category = "BiopythonWarning"): void {
  warningHandler({ category, message });
}

/**
 * Run `fn` and collect every warning it emits instead of printing them
 * (Python's `warnings.catch_warnings(record=True)`).
 *
 * @param fn - Function to run.
 * @returns The function's result (or thrown error) together with the warnings.
 */
export function captureWarnings<T>(fn: () => T): { result?: T; error?: unknown; warnings: BioWarning[] } {
  const warnings: BioWarning[] = [];
  const prev = setWarningHandler((w) => warnings.push(w));
  try {
    return { result: fn(), warnings };
  } catch (error) {
    return { error, warnings };
  } finally {
    setWarningHandler(prev);
  }
}
