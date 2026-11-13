## Bio.SeqUtils

- [x] `GC123(seq)`
- [x] `GC_skew(seq, window=100)`
- [x] `gc_fraction(seq, ambiguous='remove')`
- [x] `molecular_weight(seq, seq_type='DNA', double_stranded=False, circular=False, monoisotopic=False)`
- [x] `nt_search(seq, subseq)`
- [x] `seq1(seq, custom_map=None, undef_code='X')`
- [x] `seq3(seq, custom_map=None, undef_code='Xaa')`
- [x] `six_frame_translations(seq, genetic_code=1)`
- [-] `xGC_skew(seq, window=1000, zoom=100, r=300, px=100, py=100)`

### Bio.SeqUtils.CodonAdaptationIndex

- [-] `__contains__(self, key, /)`
- [-] `__delitem__(self, key, /)`
- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__getitem__(self, key, /)`
- [-] `__gt__(self, value, /)`
- [x] `__init__(self, sequences, table=NCBICodonTableDNA(id=1, names=['Standard', 'SGC0'], ...))`
- [-] `__iter__(self, /)`
- [-] `__le__(self, value, /)`
- [-] `__len__(self, /)`
- [-] `__lt__(self, value, /)`
- [-] `__repr__(self, /)`
- [-] `__setitem__(self, key, value, /)`
- [x] `__str__(self)`
- [x] `calculate(self, sequence)`
- [-] `clear(self, /)`
- [-] `copy(self, /)`
- [-] `fromkeys(iterable, value=None, /)`
- [-] `get(self, key, default=None, /)`
- [-] `items(self, /)`
- [-] `keys(self, /)`
- [x] `optimize(self, sequence, seq_type='DNA', strict=True)`
- [-] `pop?`
- [-] `popitem(self, /)`
- [-] `setdefault(self, key, default=None, /)`
- [-] `update?`
- [-] `values(self, /)`
