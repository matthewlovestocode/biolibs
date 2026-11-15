## pydna.seqrecord


### pydna.seqrecord.SeqRecord

- [x] `__add__(self, other)`
- [x] `__bool__(self)`
- [x] `__eq__(self, other)`
- [x] `__format__(self, format)`
- [x] `__getitem__(self, index)`
- [x] `__gt__(self, other)`
- [-] `__hash__(self)`
- [x] `__init__(self, seq, id='id', name='name', description='description', dbxrefs=None, features=None, annotations=None, letter_annotations=None)`
- [x] `__lt__(self, other)`
- [x] `__ne__(self, other)`
- [x] `__repr__(self)`
- [x] `__str__(self)`
- [x] `accession(self)`
- [x] `add_colors_to_features_for_ape(self)`
- [x] `add_feature(self, x=None, y=None, seq=None, type_='misc', strand=1, *args, **kwargs)`
- [x] `cai(self, organism='sce')`
- [x] `comment(self, newcomment='')`
- [x] `copy(self)`
- [-] `datefunction()`
- [x] `definition(self)`
- [-] `dump(self, filename, protocol=None)`
- [x] `express(self, organism='sce')`
- [x] `extract_feature(self, n)`
- [x] `from_Bio_SeqRecord(clc, sr: Bio.SeqRecord.SeqRecord)`
- [x] `gc(self)`
- [x] `isorf(self, table=1)`
- [x] `lcs(self, other, *args, limit=25, **kwargs)`
- [x] `list_features(self)`
- [x] `locus(self)`
- [x] `rarecodons(self, organism='sce')`
- [x] `rc(self, *args, **kwargs)`
- [x] `reverse_complement(self, *args, **kwargs)`
- [x] `seguid(self)`
- [x] `sorted_features(self)`
- [x] `stamp(self, now=<function SeqRecord.datefunction at 0x10896e6c0>, tool='pydna', separator=' ', comment='')`
- [x] `startcodon(self, organism='sce')`
- [x] `stopcodon(self, organism='sce')`
- [x] `translate(self)`

### pydna.seqrecord.ProteinSeqRecord

- [x] `__format__(self, format)`
- [x] `cai(self, *args, **kwargs)`
- [x] `express(self, *args, **kwargs)`
- [x] `gc(self)`
- [x] `isorf(self, *args, **kwargs)`
- [x] `rarecodons(self, *args, **kwargs)`
- [x] `rc(self, *args, **kwargs)`
- [x] `reverse_complement(self, *args, **kwargs)`
- [x] `startcodon(self, *args, **kwargs)`
- [x] `stopcodon(self, *args, **kwargs)`
