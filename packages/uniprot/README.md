# @biolibs/uniprot

What is known about a protein, read into positions people count. UniProt needs no key and no account.

- **`lookUpProtein` and `readProtein`** — one entry: its mature chain, every residue modified after
  it is made, where it varies, and its named parts
- **`onTheChain`** — a position on the entry turned into the same residue counted on the mature chain
- **`searchProteins`** — finding an entry, and whether a curator has been over it
- **Two dependencies**, `@biolibs/core` for the error class and `@biolibs/seqio` for the XML reader

## Why this exists when `@biolibs/seqio` already reads UniProt

It does, faithfully, into Biopython's shapes: a `SeqRecord` whose feature locations are half-open and
counted from zero, and whose sequence is whatever the entry holds. That is the right thing for a port
to do. It is the wrong thing to hand a lab, for two reasons that both cost real work to get wrong.

**An entry's sequence is usually the precursor.** It is the protein as it comes off the ribosome,
signal peptide and all. What a lab collects is the chain that is left after the cell has cut that off.
They are different lengths and so different masses, and a tool that quietly used the precursor sends
somebody looking for a band a kilodalton or two too high.

**Positions are counted twice.** UniProt counts every residue of the entry; a lab holding the mature
protein counts from the first residue it actually has. For bovine β-casein those differ by fifteen.
Both numbers look perfectly reasonable, which is what makes confusing them so easy.

## What is verified

There is no Biopython counterpart to this layer, so there is no parity checklist. What there is:

| | |
|---|---|
| `test/uniprot.test.ts` | every function, against a transport that answers instead of the network |
| | an entry written by hand, small enough to read, with the awkward parts in it |

Nothing in the tests reaches the internet.

## Install

```bash
npm install @biolibs/uniprot
```

## Reading an entry

```ts
import { lookUpProtein, onTheChain, readProtein } from "@biolibs/uniprot";

const casein = readProtein(await lookUpProtein("P02666"));

casein.name;                 // "Beta-casein"
casein.gene;                 // "CSN2"
casein.reviewed;             // true — a curator has been over it
casein.length;               // 224, the precursor
casein.chain?.length;        // 209, what a lab ends up holding
casein.signal;               // { from: 1, to: 15 }

casein.modifications.map((one) => [one.at, one.what]);
// [[30, "Phosphoserine"], [32, "Phosphoserine"], [33, "Phosphoserine"], [34, "Phosphoserine"], [50, "Phosphoserine; in variant A1, …"]]

casein.modifications.map((one) => onTheChain(casein, one.at));
// [15, 17, 18, 19, 35] — the same residues, counted on what the lab holds
```

Everything is counted from 1 with both ends included, as everything else in these packages is.

## Reviewed and unreviewed are not the same thing

`reviewed` is the first field to look at and the easiest to skip past.

```ts
const found = await searchProteins("casein AND organism_id:9913", { reviewedOnly: true });
found.results.map((one) => [one.accession, one.gene, one.reviewed]);
// [["P02666", "CSN2", true], ["P02663", "CSN1S2", true], ["P02662", "CSN1S1", true], ["P02668", "CSN3", true]]
```

A Swiss-Prot entry's modified residues were read out of papers by a person. A TrEMBL entry's were
inferred by machine from similarity to something else. Both arrive in the same fields and read the
same way, and treating the second as the first is the quietest way to be confidently wrong about a
protein.

## What is sent

```ts
import { settings } from "@biolibs/uniprot";

settings.tool = "my-software";       // what to call this software. Never a person's name
settings.email = null;               // nothing goes unless somebody sets one on purpose
settings.transport = myTransport;    // swap the network out, which is how the tests run
```

The software's name is the only thing this package says about who is asking. An address is sent only
if somebody puts one in the settings deliberately; it is never taken from a document, a file or a
device.

## Testing

```bash
npm test                      # the whole workspace
npx vitest run packages/uniprot/test
```

## Things to know

- **`mass` is the precursor's**, as UniProt gives it. For the mature chain, weigh `chain.sequence`
  with `ProteinAnalysis` in [`@biolibs/seqtools`](../seqtools).
- **`onTheChain` returns `null`** for a residue inside the signal peptide, because that residue is on
  nothing the lab holds. It is not an error, and it is not position zero.
- **An entry with no features** is normal for an unreviewed one. Recording no modifications usually
  means nobody has looked, not that there are none.
- **Accessions get merged.** A 404 may mean the entry was folded into another; the error says so, and
  `searchProteins` finds the one that stands.
- **Variants matter more than they look.** For β-casein the sequence variants are the A1/A2
  distinction, which is a real difference between milks and worth choosing deliberately.

## License

MIT — see [LICENSE](LICENSE).
