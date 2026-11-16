# @biolibs/glossary-react

A picture for every term in [`@biolibs/glossary`](../glossary). A definition alone asks a reader to build the picture themselves, and some readers cannot, or should not have to. Here every term has one, and nothing shows a term's words without it.

```
npm install @biolibs/glossary-react @biolibs/glossary react react-dom
```

## A term in running text

```tsx
import "@biolibs/glossary-react/glossary.css";
import { Glossed, Term } from "@biolibs/glossary-react";

<p>Each <Term slug="primer">primer</Term> binds one strand.</p>
<p><Glossed text="PCR copies the stretch between two primers." /></p>
```

Hovering a `Term`, or moving to it with the keyboard, shows its picture, then its one-sentence definition, with the paragraph and the reason a press away, and whether a biologist has reviewed it. It is shown by the stylesheet and needs no script. `Glossed` does this for the first mention of each term in a piece of text.

## The pictures

```tsx
import { TermCard, TermDiagram, hasPicture } from "@biolibs/glossary-react";

<TermDiagram slug="gel-electrophoresis" />      // the picture, framed, with a caption
<TermDiagram slug="pcr" decorative />           // the bare drawing
<TermCard slug="sticky-end" full />             // picture, sentence, paragraph and reason
hasPicture("pcr");                              // true
```

They are SVG drawn in code. Wherever a picture shows something the engines can work out — a complement, where an enzyme cuts, where a band runs on a gel — it is worked out by them as it is drawn, so a picture cannot disagree with the code. Every picture says in words what it shows, for somebody who cannot see it, and bases are drawn as letters as well as colours.

A test fails if any term has no picture.

## The sheet a biologist reviews

```tsx
import { ReviewSheet } from "@biolibs/glossary-react";

<ReviewSheet />                   // every term
<ReviewSheet only="none" />       // only the ones nobody has reviewed
```

Every term with its picture and all its words, whether it has been reviewed as it stands, and the fingerprint of what is on screen. A review is recorded against that fingerprint, so it covers the words and the picture together, exactly as they were read.

## Colours

`glossary.css` takes its colours from the Bionet theme's variables where a page has them, and falls back to plain ones where it does not, so the pictures follow light and dark.

## License

MIT
