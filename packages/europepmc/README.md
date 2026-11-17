# @biolibs/europepmc

Searching the literature, and reading an open-access paper as sections, tables and figures instead of
as JATS XML. Europe PMC indexes PubMed, PubMed Central, preprints, patents and theses together, needs
no key and no account, and will hand over the whole text of an open-access paper.

- **`searchArticles`** — the literature by keyword, saying plainly whether each result's full text can
  actually be read
- **`fullTextOf` and `readArticle`** — a paper, read out of its markup into sections with their
  headings, tables as rows, and figures as captions
- **`sectionsNamed`** — the methods, however this particular journal chose to name them
- **`referencesOf` and `citationsOf`** — what a paper cited, and who has cited it since
- **Two dependencies**, `@biolibs/core` for the error class and `@biolibs/seqio` for the XML parser

## What is verified

There is no Biopython counterpart, so there is no parity checklist and no reference implementation to
compare with. What there is instead:

| | |
|---|---|
| `test/europepmc.test.ts` | every tool, against a transport that answers instead of the network |
| | the awkward shapes of JATS, written out by hand rather than captured from one publisher |

Nothing in the tests reaches the internet. The JATS fixture is written by hand on purpose: a captured
file would check one publisher's habits, and what needs checking is the shape every publisher has in
common — sections inside sections, citation markers mid-sentence, a table where a paragraph would be.

## Install

```bash
npm install @biolibs/europepmc
```

## Searching

```ts
import { searchArticles } from "@biolibs/europepmc";

const found = await searchArticles('"kappa-casein" AND "Pichia pastoris"', { corpus: "open-access", abstracts: true });
found.matched;                                        // how many matched in all
found.results[0].title;                               // the full stop journals add is taken off
found.results.filter((one) => one.fullText);          // the ones there is a full text to read
```

The query takes plain words, phrases in quotes, and Europe PMC's fields: `TITLE:`, `ABSTRACT:`,
`AUTH:`, `JOURNAL:`, `PUB_YEAR:`, and `METHODS:`, which searches the methods sections of open papers
and is the one to reach for when looking for a technique rather than a subject.

**`openAccess` and `fullText` are not the same thing**, and the difference is the one that matters
before reading. The first is a licence. The second is whether the text is here. A paper can be open
access and not be in Europe PMC, and then there is the abstract and a link and nothing else.

## Reading a paper

This is what the package is for. Europe PMC will give you a paper's whole text, but it gives it as
JATS: a hundred and eighty kilobytes of markup in which the one paragraph anybody wants is three
levels down inside nested `<sec>` elements, wrapped in `<italic>`, and interrupted every other
sentence by an `<xref>` that renders as "[14]".

```ts
import { fullTextOf, readArticle, sectionsNamed } from "@biolibs/europepmc";

const paper = readArticle(await fullTextOf("PMC11767299"));
paper.title;                                 // "Recombinant Production of Bovine αS1-Casein in …"
paper.licence;                               // "https://creativecommons.org/licenses/by/4.0/"
paper.sections.map((one) => one.heading);    // "1. Introduction", "2. Materials and Methods", "2.1. …"

for (const part of sectionsNamed(paper, "methods")) console.log(part.heading, part.text);
// 2.4. Bioproduction of Recombinant Bovine αS1-Casein
// In shake flask cultivations, the pre-culture was prepared in LB medium (10 g/L tryptone, …) …

paper.tables[0];
// { label: "Table 1", caption: "Strains and plasmids.", headings: [...], rows: [[...], ...] }
```

Three decisions are made in the reading, rather than left to whoever reads it afterwards.

**A citation marker is not text.** An `<xref>` pointing at the reference list is dropped, along with
the brackets it leaves standing, so "as described before by Sambrook and Russell []" comes out as a
sentence. One pointing at a table or a figure is kept, because "as Table 2 shows" is part of what the
sentence says.

**A table is not a paragraph.** Tables and figures are lifted out of the running text and kept apart
with their labels and captions, since a table flattened into prose is unreadable — and a yield is as
often in a table as in a sentence.

**A section's words are its own.** The walk does not descend into the sections inside one, or every
paragraph would be counted again at every level above it. A heading with no paragraphs of its own
comes back with none.

## Finding the section somebody wants

```ts
sectionsNamed(paper, "methods");
// "2. Materials and Methods" and everything under it, down to the next heading at its level

sectionsNamed(paper, "yeast");
// any heading with that word in it: "4.2. Caseins Expressed in Yeast"
```

Papers do not agree about what to call anything. The methods are under "Materials and Methods",
"Methods and Materials", "Experimental Procedures" or just "Methods", with or without a number in
front, and the one thing they have in common is that no tool can rely on which. So the matching is
loose, the numbering is ignored, a heading that *is* one of the names beats one that merely contains
it, and the sections nested inside a match come with it — a yield under "2.4. Fermentation" belongs to
the methods even though its own heading does not say so.

## Following a paper back and forward

```ts
import { citationsOf, referencesOf } from "@biolibs/europepmc";

const back = await referencesOf("MED", "40723902");       // what it cited
const forward = await citationsOf("MED", "40723902");     // who has cited it since
```

A method is almost never described where you first meet it: a paper says it expressed the gene "as
described previously" and gives a number, and the number is the paper with the actual recipe. Going
the other way says whether anybody managed to repeat it.

## What is sent

```ts
import { settings } from "@biolibs/europepmc";

settings.tool = "my-software";              // what to call this software. Never a person's name
settings.email = null;                      // nothing goes unless somebody sets one on purpose
settings.transport = myTransport;           // swap the network out, which is how the tests run
```

Europe PMC asks a client to name itself so that heavy use can be traced to a program. That name is the
only thing this package says about who is asking. An address is sent only if somebody puts one in the
settings deliberately; it is never taken from a document, a file or a device.

## Testing

```bash
npm test                         # the whole workspace
npx vitest run packages/europepmc/test
```

## Things to know

- **Most papers are not open access.** `fullTextOf` answers 404 for those, and says so in those words
  rather than as a status code. There is the abstract from a search, and a link.
- **What a paper says is what one group reported.** It is not something anybody else has checked, and
  a method that worked for them may not work elsewhere.
- **A reply is capped.** `settings.mostCharacters` refuses one larger than it, so a pathological
  document cannot be read into memory whole.
- **A table with no `<thead>`** has its headings taken from its first row, which is what most
  publishers that omit it mean.
- **Preprints are in here too**, under `SRC:PPR`, and are often where a method appears first. They
  have not been reviewed, and `source` says so.
- **`matched` is usually far larger than what comes back.** Narrow the query rather than paging.

## License

MIT — see [LICENSE](LICENSE).
