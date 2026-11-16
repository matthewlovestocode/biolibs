/**
 * Something that runs by itself when it is first looked at.
 *
 * A gel runs; pieces find each other and close. Both are the thing itself rather than an ornament
 * on it, so arriving at the view that shows one starts it, the way arriving at a bench with a gel
 * on it finds it running. Anybody who would rather see it still can drag the slider, which stops
 * it where they put it, and a machine told to keep motion down never starts it at all.
 */
import { useEffect, useRef, useState } from "react";

/** How long one of these takes to play out, in seconds. */
export const RUNS_FOR = 2.4;

/** Whether this machine has been asked to keep motion down. */
export function motionIsWanted(): boolean {
  try {
    return !globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
}

/**
 * A number from 0 to 100 that runs up by itself whenever `showing` becomes true.
 *
 * @param showing - Whether the view that shows it is the one being looked at.
 * @param from - What it is before it runs, and what it goes back to each time it starts.
 * @param seconds - How long it takes.
 * @returns How far it has got, a way to set it by hand, and whether it is running. Setting it by
 *   hand stops it there.
 */
export function useRunning(showing: boolean, from = 0, seconds = RUNS_FOR): [number, (to: number) => void, boolean] {
  const [at, setAt] = useState(100);
  const [running, setRunning] = useState(false);
  const frame = useRef<number | null>(null);
  const stop = (): void => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };

  useEffect(() => {
    if (!showing) return;
    if (!motionIsWanted()) { setAt(100); return; }
    setAt(from);
    setRunning(true);
    const started = performance.now();
    const tick = (now: number): void => {
      const through = Math.min(1, (now - started) / (seconds * 1000));
      setAt(from + (100 - from) * through);
      if (through >= 1) { frame.current = null; setRunning(false); return; }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => { stop(); setRunning(false); };
  }, [showing, from, seconds]);

  return [at, (to: number) => { stop(); setRunning(false); setAt(to); }, running];
}
