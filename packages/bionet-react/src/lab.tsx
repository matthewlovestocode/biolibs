/**
 * A lab, for React.
 *
 * `LabProvider` is given a source — a lab in this process, or a bridge to one in another — and
 * everything inside it can ask for the lab as it stands and ask for changes. Nothing here draws
 * anything or has an opinion about how a lab should look.
 *
 * The one piece of state it keeps is the last refusal. When a change is turned down, the reason is
 * worth showing wherever the app shows such things, not only beside the button that was pressed, so
 * it is held here for any component to read and dismiss.
 */
import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Action, Answer, LabSnapshot, LabSource } from "@biolibs/bionet-client";

/** What the provider shares. */
interface LabContext {
  source: LabSource;
  trouble: string | null;
  setTrouble: (trouble: string | null) => void;
}

const Context = createContext<LabContext | null>(null);

const inside = (): LabContext => {
  const context = useContext(Context);
  if (context === null) throw new Error("This has to be inside a LabProvider.");
  return context;
};

/**
 * Give everything inside it a lab.
 *
 * @param props - `source` is the lab, as `sourceOf(lab)` or a bridge to one elsewhere.
 *
 * @example
 * ```tsx
 * import { sourceOf } from "@biolibs/bionet-client";
 * import { LabProvider, useLab } from "@biolibs/bionet-react";
 *
 * <LabProvider source={sourceOf(lab)}>
 *   <Freezer />
 * </LabProvider>
 * ```
 */
export function LabProvider({ source, children }: { source: LabSource; children: ReactNode }) {
  const [trouble, setTrouble] = useState<string | null>(null);
  const value = useMemo(() => ({ source, trouble, setTrouble }), [source, trouble]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/**
 * The lab as it stands. The component is drawn again whenever the lab changes.
 *
 * @returns Everything there is to draw, or `null` while the lab is still being opened.
 */
export function useLab(): LabSnapshot | null {
  const { source } = inside();
  return useSyncExternalStore(source.subscribe, source.snapshot, source.snapshot);
}

/**
 * Ask for a change.
 *
 * @returns A function that asks for one thing and resolves to whether it was done. If it was not,
 *   the reason is kept for `useTrouble` to show.
 */
export function useAct(): (action: Action, payload?: unknown) => Promise<Answer> {
  const { source, setTrouble } = inside();
  return useCallback(async (action, payload) => {
    const answer = await source.act(action, payload);
    setTrouble(answer.ok ? null : answer.error);
    return answer;
  }, [source, setTrouble]);
}

/**
 * The last change that was refused.
 *
 * @returns Why it was refused, said for a person, or `null`; and a way to put it away.
 */
export function useTrouble(): { trouble: string | null; dismiss: () => void } {
  const { trouble, setTrouble } = inside();
  const dismiss = useCallback(() => setTrouble(null), [setTrouble]);
  return { trouble, dismiss };
}
