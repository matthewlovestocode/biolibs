/** Where Biopython's `sys.stderr.write` warnings go. */

/** Receives text Biopython would write to standard error. */
export type StderrWriter = (text: string) => void;

let writer: StderrWriter = (text) => {
  const proc = (globalThis as { process?: { stderr?: { write(s: string): unknown } } }).process;
  if (proc?.stderr) proc.stderr.write(text);
  else console.error(text.replace(/\n$/, ""));
};

/**
 * Replace the function that receives the "warning: ... is not a standard amino acid" messages
 * (by default Node's `process.stderr`, else `console.error`). Returns the previous writer.
 */
export function setStderrWriter(fn: StderrWriter): StderrWriter {
  const old = writer;
  writer = fn;
  return old;
}

/** Write text the way Python's `sys.stderr.write` would. */
export function writeStderr(text: string): void {
  writer(text);
}
