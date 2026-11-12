# @biolibs/seqtools

Practical wet-lab sequence utilities, covering parts of Biopython's `Bio.SeqUtils` and `Bio.Restriction`. Depends on `@biolibs/seq`.

## Composition

### `gcContent(seq): number`
Fraction of G, C and S bases in `[0, 1]`, case-insensitive. Returns `0` for an empty string. The denominator is the full sequence length, so ambiguity codes lower the result.

### `gcSkew(seq): number`
`(G − C) / (G + C)`, or `0` if there are no G or C.

## Melting temperature

### `meltingTemp(seq): number`
Basic Tm estimate in °C for a DNA oligo:
- under 14 nt: Wallace rule, `2·(A+T) + 4·(G+C)`;
- 14 nt or longer: `64.9 + 41·(G+C − 16.4) / N`.

Throws `BioError` for an empty sequence. This is a rough estimate: it ignores salt, concentration and nearest-neighbour effects, so use it for screening, not final primer design.

## Restriction enzymes

### `ENZYMES: Record<string, RestrictionEnzyme>`
Built-in enzymes: EcoRI, BamHI, HindIII, NotI, XhoI, NdeI, SalI, PstI, SmaI, KpnI, XbaI, SacI, EcoRV.

```ts
interface RestrictionEnzyme {
  name: string;
  site: string; // recognition sequence, IUPAC codes allowed
  cut: number;  // top-strand cut offset from the start of the site
}
```

You can pass your own object of this shape anywhere an enzyme name is accepted:

```ts
const MyEnzyme = { name: "MyI", site: "GANNTC", cut: 1 };
```

### `findSites(dna, enzyme): number[]`
0-based start positions of recognition sites, sorted, including overlapping matches. Non-palindromic sites are also searched on the reverse strand (reported as the start of the matching site on the forward coordinates). `enzyme` is a name from `ENZYMES` or a `RestrictionEnzyme`. Throws `BioError` for unknown names.

### `digest(dna, enzymes): string[]`
Digest a **linear** molecule with one or more enzymes and return the fragments in order. Cuts are made on the top strand only (overhangs are not modelled).

```ts
const dna = "AAAGAATTCCCCGGATCCTTT";
findSites(dna, "EcoRI");               // [3]
digest(dna, ["EcoRI", "BamHI"]);       // ["AAAG", "AATTCCCCG", "GATCCTTT"]
```

## Not yet supported

Circular digestion, overhang/sticky-end modelling, type IIS enzymes with remote cut sites (cut offsets beyond the site are accepted but untested), the full REBASE enzyme database, nearest-neighbour Tm, primer design.
