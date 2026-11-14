## pydna.seq


### pydna.seq.Seq

- [ ] `cai(self, organism: str = 'sce') -> float`
- [ ] `express(self, organism: str = 'sce') -> pydna._pretty.PrettyTable`
- [x] `gc(self) -> float`
- [x] `orfs(self, minsize: int = 100) -> List[Tuple[int, int]]`
- [x] `orfs2(self, minsize: int = 30) -> List[str]`
- [x] `rarecodons(self, organism: str = 'sce') -> List[slice]`
- [x] `rc(self)`
- [x] `reverse_complement(self)`
- [x] `seguid(self) -> str`
- [x] `startcodon(self, organism: str = 'sce') -> float | None`
- [x] `stopcodon(self, organism: str = 'sce') -> float | None`
- [x] `transcribe(self) -> Bio.Seq.Seq`
- [x] `translate(self, table: [<class 'str'>, <class 'int'>] = 'Standard', stop_symbol: [<class 'str'>] = '*', to_stop: bool = False, cds: bool = False, gap: str = '-') -> Bio.Seq.Seq`

### pydna.seq.ProteinSeq

- [x] `__getitem__(self, key)`
- [x] `back_transcribe(self)`
- [x] `complement(self)`
- [x] `complement_rna(self)`
- [x] `instability_index(self) -> float`
- [x] `molecular_weight(self) -> float`
- [x] `pI(self) -> float`
- [x] `rc(self)`
- [x] `reverse_complement(self)`
- [x] `reverse_complement_rna(self)`
- [x] `seguid(self) -> str`
- [x] `transcribe(self)`
- [x] `translate(self)`
