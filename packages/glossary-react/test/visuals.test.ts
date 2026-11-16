/**
 * Every term has a picture, and its words are never shown without it.
 *
 * This is the rule the package exists to keep, so it is a test: a term added to the glossary with
 * no picture drawn for it fails here. The rest checks that a review is of what is on screen.
 */
import { GLOSSARY, REVIEWS, getEntry, type Review } from "@biolibs/glossary";
import { Glossed, ReviewSheet, Term, TermCard, TermDiagram, hasPicture, pictureOf, standingOf } from "@biolibs/glossary-react";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

describe("every term", () => {
  it("has a picture, drawn the same way each time, that says in words what it shows", () => {
    for (const entry of GLOSSARY) {
      expect([entry.slug, hasPicture(entry.slug)]).toEqual([entry.slug, true]);
      expect(pictureOf(entry.slug)).toBe(pictureOf(entry.slug));
      // In full, a picture is a figure that describes itself to somebody who cannot see it.
      const figure = renderToStaticMarkup(h(TermDiagram, { slug: entry.slug }));
      expect([entry.slug, /<svg[^>]*role="img"[^>]*aria-label="[^"]{20,}"/.test(figure)]).toEqual([entry.slug, true]);
      expect(figure).toContain("<figcaption>");
    }
    expect(hasPicture("no-such-term")).toBe(false);
    expect(pictureOf("no-such-term")).toBe("");
  });

  it("is never shown as words alone: the tooltip and the card both lead with the picture", () => {
    for (const slug of ["pcr", "primer", "sticky-end", "gel-electrophoresis", "cell"]) {
      const entry = getEntry(slug)!;
      const tip = renderToStaticMarkup(h(Term, { slug }, "the word"));
      expect(tip.indexOf("<svg")).toBeGreaterThan(-1);
      expect(tip.indexOf("<svg")).toBeLessThan(tip.indexOf(entry.definition.slice(0, 20)));
      expect(tip).toContain('role="tooltip"');
      expect(tip).toContain(">the word<");
      expect(tip).toContain("Not yet reviewed by a biologist");
      const card = renderToStaticMarkup(h(TermCard, { slug, full: true }));
      expect(card.indexOf("<svg")).toBeLessThan(card.indexOf(entry.definition.slice(0, 20)));
      expect(card).toContain("Why it matters.");
    }
    expect(renderToStaticMarkup(h(Term, { slug: "primer" }))).toContain(">Primer<");
    expect(renderToStaticMarkup(h(Term, { slug: "no-such-term" }, "plain"))).toBe("plain");
    expect(renderToStaticMarkup(h(TermCard, { slug: "no-such-term" }))).toBe("");
  });

  it("is explained once in a piece of text, at its first mention", () => {
    const text = renderToStaticMarkup(h(Glossed, { text: "A primer binds, then another primer." }));
    expect(text.match(/role="tooltip"/g)).toHaveLength(1);
    expect(text.startsWith("A <span")).toBe(true);
    expect(text.endsWith("then another primer.")).toBe(true);
  });
});

describe("the sheet a biologist reviews", () => {
  it("shows every term with its picture, all its words, and the fingerprint of what is on screen", () => {
    const sheet = renderToStaticMarkup(h(ReviewSheet));
    expect(sheet).toContain(`${GLOSSARY.length} terms · ${REVIEWS.length === 0 ? 0 : ""}`);
    for (const entry of GLOSSARY) {
      expect(sheet).toContain(`id="term-${entry.slug}"`);
      expect(sheet).toContain(`<code>${standingOf(entry).fingerprint}</code>`);
    }
    expect(sheet.match(/<figure/g)).toHaveLength(GLOSSARY.length);
  });

  it("says a term is reviewed only while it is exactly what was read", () => {
    const entry = getEntry("pcr")!;
    const now = standingOf(entry).fingerprint;
    const read: Review = { slug: "pcr", by: "Dr Example", as: "molecular biologist", on: "2026-11-16", of: now };
    expect(standingOf(entry, [read]).review.state).toBe("current");
    expect(standingOf({ ...entry, definition: "A different sentence." }, [read]).review.state).toBe("earlier");
    expect(standingOf(entry, [{ ...read, of: "000000000000" }]).review.state).toBe("earlier");

    const sheet = renderToStaticMarkup(h(ReviewSheet, { reviews: [read] }));
    expect(sheet).toContain("1 reviewed as they stand");
    expect(sheet).toContain("Reviewed by Dr Example, molecular biologist (2026-11-16)");
    expect(sheet).toContain(`${GLOSSARY.length - 1} not yet reviewed`);
    const only = renderToStaticMarkup(h(ReviewSheet, { reviews: [read], only: "current" }));
    expect(only.match(/<article/g)).toHaveLength(1);
    expect(renderToStaticMarkup(h(Term, { slug: "pcr", reviews: [read] }))).toContain("Reviewed by Dr Example");
  });

  it("has no review on record that is not of a term as it stands or as it once stood", () => {
    for (const one of REVIEWS) expect(["current", "earlier"]).toContain(standingOf(getEntry(one.slug)!).review.state);
  });
});
