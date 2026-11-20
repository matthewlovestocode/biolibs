/**
 * The hooks and the mark, rendered to text.
 *
 * No browser is needed for what is checked here: that a component inside the provider is given the
 * lab, that asking for a change reaches the source and a refusal is kept for showing, and that the
 * mark is drawn from the theme's geometry in the theme's variables and not in fixed colours.
 */
import { Lab, memoryKeys, memoryStore, sourceOf, type Answer, type LabSource } from "@biolibs/bionet-client";
import { LabProvider, Logo, Mark, ThemeStyle, useAct, useLab, useTrouble } from "@biolibs/bionet-react";
import { LOGO, MARK, themeCss } from "@biolibs/bionet-theme";
import { createElement as h, useEffect } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

async function lab(): Promise<Lab> {
  const made = await new Lab({ store: memoryStore(), keys: memoryKeys() }).open();
  await made.setPerson("Ada");
  await made.found({ name: "The Wren Lab", furnish: false });
  return made;
}

describe("the hooks", () => {
  it("give a component the lab as it stands", async () => {
    const source = sourceOf(await lab());
    const Name = () => h("p", null, `${useLab()?.lab?.name} · ${useLab()?.device.person}`);
    expect(renderToStaticMarkup(h(LabProvider, { source, children: h(Name) }))).toBe("<p>The Wren Lab · Ada</p>");
  });

  it("show nothing yet for a lab that is still being opened", () => {
    const source: LabSource = { subscribe: () => () => {}, snapshot: () => null, act: async () => ({ ok: true, result: null }) };
    const Name = () => h("p", null, useLab() === null ? "opening" : "open");
    expect(renderToStaticMarkup(h(LabProvider, { source, children: h(Name) }))).toBe("<p>opening</p>");
  });

  it("say they need a provider", () => {
    expect(() => renderToStaticMarkup(h(() => h("p", null, String(useLab()))))).toThrow("This has to be inside a LabProvider.");
  });

  it("carry a change to the source and hand back its answer", async () => {
    const made = await lab();
    let act: ReturnType<typeof useAct> = async () => ({ ok: false, error: "never rendered" });
    const Grab = () => { act = useAct(); return null; };
    renderToStaticMarkup(h(LabProvider, { source: sourceOf(made), children: h(Grab) }));
    const refused: Answer = await act("addPart", { name: "bad", sequence: "not dna" });
    expect(refused).toMatchObject({ ok: false });
    expect(await act("addPart", { name: "f1", sequence: "GGATCACAGTCTACACTGCTCACTCC" })).toEqual({ ok: true, result: undefined });
    expect(made.snapshot().lab!.parts.map((part) => part.name)).toEqual(["f1"]);
  });

  it("start with no trouble to show", async () => {
    const Trouble = () => { const { trouble, dismiss } = useTrouble(); useEffect(dismiss, [dismiss]); return h("p", null, trouble ?? "none"); };
    expect(renderToStaticMarkup(h(LabProvider, { source: sourceOf(await lab()), children: h(Trouble) }))).toBe("<p>none</p>");
  });
});

describe("the mark and the logo", () => {
  it("draw the theme's geometry in the theme's variables", () => {
    const mark = renderToStaticMarkup(h(Mark, { size: 34 }));
    expect(mark).toContain(`viewBox="0 0 ${MARK.width} ${MARK.height}"`);
    expect(mark).toContain(`d="${MARK.yours}" stroke="var(--bionet-yours)"`);
    expect(mark).toContain(`d="${MARK.theirs}" stroke="var(--bionet-theirs)"`);
    expect(mark).toContain('height="34"');
    expect(mark).toContain('aria-label="Bionet"');
    expect(mark).not.toMatch(/#[0-9a-f]{6}/);

    const logo = renderToStaticMarkup(h(Logo, {}));
    expect(logo).toContain(`d="${LOGO.letters}" fill="var(--bionet-ink)"`);
    expect(logo).toContain(`d="${MARK.yours}"`);
    expect(logo).not.toMatch(/#[0-9a-f]{6}/);
  });

  it("can put the theme's variables on the page", () => {
    expect(renderToStaticMarkup(h(ThemeStyle))).toBe(`<style>${themeCss()}</style>`);
  });
});
