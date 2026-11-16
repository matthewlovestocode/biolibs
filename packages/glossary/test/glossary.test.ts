/**
 * The glossary's words, and the record of who has reviewed them.
 *
 * The terms are checked for what a reader would trip over: a term that points at one that does not
 * exist, two terms claiming one phrase, a term with nothing said about it. The reviews are checked
 * for the one promise they make: a review covers exactly what was read, and nothing changed since.
 */
import { CATEGORIES, GLOSSARY, REVIEWS, findEntryByName, getEntry, reviewOf, reviewWords, splitByTerms, termFingerprint,
         type Review } from "@biolibs/glossary";
import { describe, expect, it } from "vitest";

describe("the terms", () => {
  it("each have a slug of their own, a group, and something said under every heading", () => {
    const slugs = GLOSSARY.map((entry) => entry.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(GLOSSARY.length).toBeGreaterThanOrEqual(60);
    const groups = new Set(CATEGORIES.map((one) => one.id));
    for (const entry of GLOSSARY) {
      expect(entry.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(groups.has(entry.category)).toBe(true);
      for (const said of [entry.term, entry.definition, entry.detail, entry.why]) expect(said.trim().length).toBeGreaterThan(2);
      expect(entry.definition.length).toBeLessThan(260);        // one sentence, for a tooltip
    }
    for (const group of CATEGORIES) expect(GLOSSARY.some((entry) => entry.category === group.id)).toBe(true);
  });

  it("point only at terms that exist, and no two claim the same phrase", () => {
    const slugs = new Set(GLOSSARY.map((entry) => entry.slug));
    const phrases = new Map<string, string>();
    for (const entry of GLOSSARY) {
      for (const related of entry.related) expect([entry.slug, related, slugs.has(related)]).toEqual([entry.slug, related, true]);
      for (const phrase of entry.match) {
        expect([phrase, phrases.get(phrase.toLowerCase())]).toEqual([phrase, undefined]);
        phrases.set(phrase.toLowerCase(), entry.slug);
      }
    }
  });

  it("are found by slug, by name, and in running text once each", () => {
    expect(getEntry("pcr")?.term).toBe("PCR");
    expect(getEntry("no-such-term")).toBeUndefined();
    expect(findEntryByName("primers")?.slug).toBe("primer");
    expect(findEntryByName("no such thing")).toBeUndefined();
    const seen = new Set<string>();
    const parts = splitByTerms("A primer binds, and then another primer binds the other strand.", seen);
    expect(parts.filter((part) => part.slug === "primer")).toHaveLength(1);
    expect(parts.map((part) => part.text).join("")).toBe("A primer binds, and then another primer binds the other strand.");
    expect(seen.has("primer")).toBe(true);
    expect(splitByTerms("A primer.", new Set(), new Set(["primer"])).some((part) => part.slug !== undefined)).toBe(false);
  });
});

describe("a review", () => {
  const entry = getEntry("pcr")!;
  const picture = "<svg>a picture</svg>";
  const print = termFingerprint(entry, picture);
  const review: Review = { slug: "pcr", by: "Dr Example", as: "molecular biologist", on: "2026-11-16", of: print };

  it("is of a fingerprint that changes if the words or the picture do, and not otherwise", () => {
    expect(print).toMatch(/^[0-9a-f]{12}$/);
    expect(termFingerprint(entry, picture)).toBe(print);
    expect(termFingerprint({ ...entry, definition: `${entry.definition} ` }, picture)).not.toBe(print);
    expect(termFingerprint({ ...entry, detail: "something else" }, picture)).not.toBe(print);
    expect(termFingerprint({ ...entry, why: "something else" }, picture)).not.toBe(print);
    expect(termFingerprint(entry, "<svg>another picture</svg>")).not.toBe(print);
    // What a term links to is not what a biologist signs.
    expect(termFingerprint({ ...entry, related: [], match: [] } as typeof entry, picture)).toBe(print);
  });

  it("covers the term as it was read, and says so when the term has changed since", () => {
    expect(reviewOf("pcr", print, [review])).toMatchObject({ state: "current", current: [review], earlier: [] });
    expect(reviewWords(reviewOf("pcr", print, [review]))).toBe("Reviewed by Dr Example, molecular biologist (2026-11-16)");
    const changed = termFingerprint({ ...entry, definition: "A different sentence." }, picture);
    expect(reviewOf("pcr", changed, [review])).toMatchObject({ state: "earlier", current: [], earlier: [review] });
    expect(reviewWords(reviewOf("pcr", changed, [review]))).toBe("Changed since it was reviewed by Dr Example, molecular biologist (2026-11-16)");
    expect(reviewOf("primer", print, [review]).state).toBe("none");
    expect(reviewWords(reviewOf("primer", print, [review]))).toBe("Not yet reviewed by a biologist");
    const second: Review = { ...review, by: "Dr Other", as: "geneticist" };
    expect(reviewWords(reviewOf("pcr", print, [review, second]))).toBe("Reviewed by Dr Example, molecular biologist (2026-11-16); Dr Other, geneticist (2026-11-16)");
  });

  it("is only ever recorded for a term that exists, by somebody named, on a day", () => {
    const slugs = new Set(GLOSSARY.map((one) => one.slug));
    for (const one of REVIEWS) {
      expect(slugs.has(one.slug)).toBe(true);
      expect(one.by.trim().length).toBeGreaterThan(2);
      expect(one.as.trim().length).toBeGreaterThan(2);
      expect(one.on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(one.of).toMatch(/^[0-9a-f]{12}$/);
    }
  });
});
