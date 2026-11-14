## pydna.alphabet

- [ ] `anneal_strands(strand_a: str, strand_b: str) -> bool`
- [x] `dsbreaks(datastring: str) -> list[str]`
- [x] `get_parts(datastring: str) -> pydna.alphabet.DseqParts`
- [ ] `regex_ds_melt_factory(length: int, circular: bool) -> re.Pattern`
- [ ] `regex_ss_melt_factory(length: int) -> re.Pattern`
- [x] `representation_tuple(datastring: str = '', length_limit_for_repr: int = 30, chunk: int = 4)`

### pydna.alphabet.DseqParts

- [x] `middle`
- [x] `single_crick`
- [x] `single_watson`
- [x] `sticky_left3`
- [x] `sticky_left5`
- [x] `sticky_right3`
- [x] `sticky_right5`
- [ ] `__eq__(self, other)`
- [ ] `__getitem__(self, index: int) -> str`
- [ ] `__hash__`
- [ ] `__init__(self, sticky_left5: str, sticky_left3: str, middle: str, sticky_right3: str, sticky_right5: str, single_watson: str, single_crick: str) -> None`
- [ ] `__iter__(self)`
- [ ] `__repr__(self)`

### pydna.alphabet: the dscode encoding

- [x] `un_ambiguous_ds_dna (4 pairs)`
- [x] `ds_rna (2 pairs)`
- [x] `ambiguous_ds_dna (11 pairs)`
- [x] `single_stranded_dna_rna (10 pairs)`
- [x] `loops_dna_rna (10 pairs)`
- [x] `mismatched_dna_rna (18 pairs)`
- [x] `gap (1 pairs)`
