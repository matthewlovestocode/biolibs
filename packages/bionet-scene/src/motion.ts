"use client";

/**
 * Whether the scene moves.
 *
 * Moving between views helps some people keep their place and makes others unwell or simply slows
 * them down. So motion is a setting: with it off, every change of view is a cut, and nothing in the
 * scene moves by itself. It starts as the system's own "reduce motion" setting says, and can be
 * changed.
 */
import { useEffect, useState } from "react";

/** Whether the scene moves between views, or cuts. */
export type Motion = "on" | "off";

/**
 * The motion setting, and a way to change it.
 *
 * @param pinned - A setting to use whatever the system or the person says.
 * @returns The setting, and a function that flips it.
 */
export function useMotion(pinned?: Motion): [Motion, () => void] {
  const [chosen, setChosen] = useState<Motion | null>(null);
  const [system, setSystem] = useState<Motion>("on");
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = (): void => setSystem(query.matches ? "off" : "on");
    read();
    query.addEventListener("change", read);
    return () => query.removeEventListener("change", read);
  }, []);
  const motion = pinned ?? chosen ?? system;
  return [motion, () => setChosen(motion === "on" ? "off" : "on")];
}
