## Bio.Data.CodonTable

- [x] `list_ambiguous_codons(codons, ambiguous_nucleotide_values)`
- [x] `list_possible_proteins(codon, forward_table, ambiguous_nucleotide_values)`
- [x] `make_back_table(table, default_stop_codon)`
- [x] `register_ncbi_table(name, alt_name, id, table, start_codons, stop_codons)`

### Bio.Data.CodonTable.CodonTable

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, nucleotide_alphabet: str | None = None, protein_alphabet: str | None = None, forward_table: dict[str, str] = {}, back_table: dict[str, str] = {}, start_codons: list[str] = [], stop_codons: list[str] = []) -> None`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [-] `__repr__(self, /)`
- [x] `__str__(self)`

### Bio.Data.CodonTable.NCBICodonTable

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, id, names, table, start_codons, stop_codons)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self)`
- [x] `__str__(self)`

### Genetic code tables (NCBI ids)

- [x] `table 1`
- [x] `table 2`
- [x] `table 3`
- [x] `table 4`
- [x] `table 5`
- [x] `table 6`
- [x] `table 9`
- [x] `table 10`
- [x] `table 11`
- [x] `table 12`
- [x] `table 13`
- [x] `table 14`
- [x] `table 15`
- [x] `table 16`
- [x] `table 21`
- [x] `table 22`
- [x] `table 23`
- [x] `table 24`
- [x] `table 25`
- [x] `table 26`
- [x] `table 27`
- [x] `table 28`
- [x] `table 29`
- [x] `table 30`
- [x] `table 31`
- [x] `table 32`
- [x] `table 33`
