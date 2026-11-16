# @biolibs/glossary

The words of molecular biology, said plainly. Sixty terms, from *cell* to *RMSD*, each in one sentence, one paragraph and a reason anybody needs to know it, with a record of which have been reviewed by a biologist.

```
npm install @biolibs/glossary
```

This package is the words. [`@biolibs/glossary-react`](../glossary-react) draws a picture for every one of them, and a term is not added here without a picture being added there.

## Looking a term up

```ts
import { findEntryByName, getEntry, splitByTerms } from "@biolibs/glossary";

getEntry("pcr")?.term;                    // "PCR"
getEntry("primer")?.definition;           // "A short single strand of DNA, usually 18 to 30 bases, that marks where copying should start."
findEntryByName("primers")?.slug;         // "primer"

splitByTerms("A primer binds.", new Set()).map((part) => part.slug ?? part.text);
// [ "A ", "primer", " binds." ]
```

`splitByTerms` finds the first mention of each term in a piece of text. It is given the set of terms already explained on the page and adds to it, so a term is explained once and not at every mention.

## Who has reviewed a term

The words and pictures were written by people building software. They may be wrong, and somebody who is learning cannot tell. So a term can carry a review: who checked the definition and the picture, in what capacity, and when.

```ts
import { REVIEWS, getEntry, reviewOf, reviewWords, termFingerprint } from "@biolibs/glossary";

const fingerprint = termFingerprint(getEntry("pcr")!, "<svg>…</svg>");   // twelve characters
reviewWords(reviewOf("pcr", fingerprint));                               // "Not yet reviewed by a biologist"
REVIEWS.length;                                                          // 0
```

A review is of exactly what was read. `termFingerprint` is made from a term's sentence, paragraph, reason and picture, and a review records the fingerprint it was given. If any of those change afterwards, the review is reported as being of an earlier version (`"earlier"`), never as covering what it did not see.

`REVIEWS` is empty. Nothing here has been signed off by anybody, and everything that shows a term says so until somebody does. To record a review, a biologist reads the term on the review sheet in `@biolibs/glossary-react`, which shows the fingerprint, and an entry is added to `src/review.ts`.

## License

MIT
