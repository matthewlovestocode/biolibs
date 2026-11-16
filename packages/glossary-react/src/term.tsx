/**
 * A term, with its picture always beside its words.
 *
 * A definition alone asks the reader to build the picture themselves, and some readers cannot, or
 * should not have to. So nothing here shows a term's words without its picture: the tooltip leads
 * with it, and the sheet a biologist reviews shows the two together, since they are signed off
 * together.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CATEGORIES, GLOSSARY, REVIEWS, getEntry, reviewOf, reviewWords, splitByTerms, termFingerprint,
         type GlossaryEntry, type Review, type ReviewState } from "@biolibs/glossary";
import { TermDiagram } from "./diagrams.js";

/**
 * A term's picture as the text a reader's browser is given.
 *
 * @param slug - The term.
 * @returns The SVG, or `""` if the term has no picture.
 */
export function pictureOf(slug: string): string {
  return renderToStaticMarkup(<TermDiagram slug={slug} decorative />);
}

/**
 * Whether a term has a picture.
 *
 * @param slug - The term.
 * @returns `true` if one is drawn for it.
 */
export function hasPicture(slug: string): boolean {
  return pictureOf(slug).startsWith("<svg");
}

/**
 * Where a term stands: its fingerprint as it is drawn and worded now, and who has reviewed it.
 *
 * @param entry - The term.
 * @param reviews - The reviews to look in.
 * @returns The fingerprint a reviewer would be signing, and whether anybody has.
 */
export function standingOf(entry: GlossaryEntry, reviews: readonly Review[] = REVIEWS): { fingerprint: string; review: ReviewState } {
  const fingerprint = termFingerprint(entry, pictureOf(entry.slug));
  return { fingerprint, review: reviewOf(entry.slug, fingerprint, reviews) };
}

/** The line under a term saying whether a biologist has reviewed it. */
function Reviewed({ entry, reviews }: { entry: GlossaryEntry; reviews?: readonly Review[] | undefined }) {
  const { review } = standingOf(entry, reviews);
  return <p className={`glossary-review ${review.state}`}>{reviewWords(review)}</p>;
}

/**
 * A term's picture and its words, together.
 *
 * @param props - `slug` is the term; `full` adds the paragraph and the reason as well as the
 *   sentence; `reviews` are the reviews to show, the package's own unless given.
 */
export function TermCard({ slug, full = false, reviews }: { slug: string; full?: boolean; reviews?: readonly Review[] }) {
  const entry = getEntry(slug);
  if (entry === undefined) return null;
  return (
    <div className="glossary glossary-card">
      <TermDiagram slug={slug} decorative />
      <p className="glossary-name">{entry.term}</p>
      <p className="glossary-definition">{entry.definition}</p>
      {full && <p className="glossary-detail">{entry.detail}</p>}
      {full && <p className="glossary-why"><strong>Why it matters.</strong> {entry.why}</p>}
      <Reviewed entry={entry} reviews={reviews} />
    </div>
  );
}

/**
 * A word in running text that says what it means when asked.
 *
 * Hovering it, or moving to it with the keyboard, shows the term's picture and its one-sentence
 * definition, with the rest a press away. It needs no script: it is shown by the stylesheet.
 *
 * @param props - `slug` is the term; `children` is the word as written, the term's own name if not
 *   given; `reviews` are the reviews to show.
 *
 * @example
 * ```tsx
 * import "@biolibs/glossary-react/glossary.css";
 * import { Term } from "@biolibs/glossary-react";
 *
 * <p>Each <Term slug="primer">primer</Term> binds one strand.</p>
 * ```
 */
export function Term({ slug, children, reviews }: { slug: string; children?: ReactNode; reviews?: readonly Review[] }) {
  const entry = getEntry(slug);
  if (entry === undefined) return <>{children}</>;
  return (
    <span className="glossary glossary-term" tabIndex={0}>
      <span className="glossary-word">{children ?? entry.term}</span>
      <span className="glossary-tip" role="tooltip">
        <TermDiagram slug={slug} decorative />
        <span className="glossary-name">{entry.term}</span>
        <span className="glossary-definition">{entry.definition}</span>
        <details>
          <summary>More</summary>
          <span className="glossary-detail">{entry.detail}</span>
          <span className="glossary-why"><strong>Why it matters.</strong> {entry.why}</span>
        </details>
        <Reviewed entry={entry} reviews={reviews} />
      </span>
    </span>
  );
}

/**
 * Some text, with the first mention of each term in it made into a `Term`.
 *
 * @param props - `text` is plain text; `seen` holds the terms already explained on the page, and is
 *   added to, so a term is explained once and not at every mention; `skip` is phrases to leave alone.
 */
export function Glossed({ text, seen = new Set<string>(), skip }: { text: string; seen?: Set<string>; skip?: ReadonlySet<string> }) {
  return <>{splitByTerms(text, seen, skip).map((part, at) => (part.slug === undefined ? part.text : <Term key={at} slug={part.slug}>{part.text}</Term>))}</>;
}

/**
 * Every term with its picture and all its words, for a biologist to read and put their name to.
 *
 * Each term shows whether it has been reviewed as it stands, and the fingerprint of what is on
 * screen. A review is recorded against that fingerprint, so it covers exactly what was read: if the
 * words or the picture change later, the review is shown as being of an earlier version.
 *
 * @param props - `reviews` are the reviews to show, the package's own unless given; `only` limits
 *   the sheet to terms in one state, such as those nobody has reviewed.
 */
export function ReviewSheet({ reviews = REVIEWS, only }: { reviews?: readonly Review[]; only?: ReviewState["state"] }) {
  const all = GLOSSARY.map((entry) => ({ entry, ...standingOf(entry, reviews) }));
  const count = (state: ReviewState["state"]): number => all.filter((one) => one.review.state === state).length;
  return (
    <div className="glossary glossary-sheet">
      <p className="glossary-tally">
        {GLOSSARY.length} terms · {count("current")} reviewed as they stand · {count("earlier")} changed since review · {count("none")} not yet reviewed
      </p>
      {CATEGORIES.map((category) => {
        const terms = all.filter((one) => one.entry.category === category.id && (only === undefined || one.review.state === only));
        if (terms.length === 0) return null;
        return (
          <section key={category.id}>
            <h2>{category.title}</h2>
            <p className="glossary-blurb">{category.blurb}</p>
            {terms.map(({ entry, fingerprint, review }) => (
              <article key={entry.slug} id={`term-${entry.slug}`}>
                <TermDiagram slug={entry.slug} />
                <div>
                  <h3>{entry.term}</h3>
                  <p className="glossary-definition">{entry.definition}</p>
                  <p className="glossary-detail">{entry.detail}</p>
                  <p className="glossary-why"><strong>Why it matters.</strong> {entry.why}</p>
                  <p className={`glossary-review ${review.state}`}>{reviewWords(review)}</p>
                  <p className="glossary-print">To sign this off as it stands: <code>{entry.slug}</code> · <code>{fingerprint}</code></p>
                </div>
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}
