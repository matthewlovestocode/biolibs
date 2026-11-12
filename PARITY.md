# Biopython parity checklist (Bio.Seq + Bio.SeqIO)

Generated from Biopython 1.88 by `reference/gen_checklist.py`. `[ ]` not started, `[~]` partial (scaffold only), `[x]` verified against Biopython output, `[-]` not applicable (inherited Python/`object`/`BaseException` boilerplate). Edit `reference/status.json`, then re-run the script.

**Progress: 416 / 498 applicable items verified against Biopython.**



## Bio.Seq

- [x] `back_transcribe(rna)`
- [x] `complement(sequence, inplace=False)`
- [x] `complement_rna(sequence, inplace=False)`
- [x] `reverse_complement(sequence, inplace=False)`
- [x] `reverse_complement_rna(sequence, inplace=False)`
- [x] `transcribe(dna)`
- [x] `translate(sequence, table='Standard', stop_symbol='*', to_stop=False, cds=False, gap=None)`

### Bio.Seq.SequenceDataAbstractBaseClass

- [x] `__add__(self, other)`
- [x] `__bytes__(self)`
- [x] `__contains__(self, item)`
- [x] `__eq__(self, other)`
- [x] `__ge__(self, other)`
- [x] `__getitem__(self, key)`
- [x] `__gt__(self, other)`
- [x] `__hash__(self)`
- [x] `__init__(self)`
- [x] `__le__(self, other)`
- [x] `__len__(self)`
- [x] `__lt__(self, other)`
- [x] `__mul__(self, other)`
- [x] `__radd__(self, other)`
- [-] `__repr__(self, /)`
- [-] `__str__(self, /)`
- [x] `count(self, sub, start=None, end=None)`
- [x] `decode(self, encoding='utf-8')`
- [x] `defined`
- [x] `defined_ranges`
- [x] `endswith(self, suffix, start=None, end=None)`
- [x] `find(self, sub, start=None, end=None)`
- [x] `index(self, sub, start=None, end=None)`
- [x] `islower(self)`
- [x] `isupper(self)`
- [x] `lower(self)`
- [x] `lstrip(self, chars=None)`
- [x] `removeprefix(self, prefix)`
- [x] `removesuffix(self, suffix)`
- [x] `replace(self, old, new)`
- [x] `rfind(self, sub, start=None, end=None)`
- [x] `rindex(self, sub, start=None, end=None)`
- [x] `rsplit(self, sep=None, maxsplit=-1)`
- [x] `rstrip(self, chars=None)`
- [x] `split(self, sep=None, maxsplit=-1)`
- [x] `startswith(self, prefix, start=None, end=None)`
- [x] `strip(self, chars=None)`
- [x] `translate(self, table, delete=b'')`
- [x] `upper(self)`

### Bio.Seq.Seq

- [x] `__add__(self, other)`
- [x] `__bytes__(self)`
- [x] `__contains__(self, item)`
- [x] `__eq__(self, other)`
- [x] `__ge__(self, other)`
- [x] `__getitem__(self, index)`
- [x] `__gt__(self, other)`
- [x] `__hash__(self)`
- [x] `__imul__(self, other)`
- [x] `__init__(self, data: str | bytes | bytearray | Bio.Seq._SeqAbstractBaseClass | Bio.Seq.SequenceDataAbstractBaseClass | dict | None, length: int | None = None)`
- [x] `__iter__(self)`
- [x] `__le__(self, other)`
- [x] `__len__(self)`
- [x] `__lt__(self, other)`
- [x] `__mul__(self, other)`
- [x] `__radd__(self, other)`
- [x] `__repr__(self)`
- [x] `__rmul__(self, other)`
- [x] `__str__(self)`
- [x] `back_transcribe(self, inplace=False)`
- [x] `complement(self, inplace=False)`
- [x] `complement_rna(self, inplace=False)`
- [x] `count(self, sub, start=None, end=None)`
- [x] `count_overlap(self, sub, start=None, end=None)`
- [x] `defined`
- [x] `defined_ranges`
- [x] `endswith(self, suffix, start=None, end=None)`
- [x] `find(self, sub, start=None, end=None)`
- [x] `index(self, sub, start=None, end=None)`
- [x] `islower(self)`
- [x] `isupper(self)`
- [x] `join(self, other)`
- [x] `lower(self, inplace=False)`
- [x] `lstrip(self, chars=None, inplace=False)`
- [x] `removeprefix(self, prefix, inplace=False)`
- [x] `removesuffix(self, suffix, inplace=False)`
- [x] `replace(self, old, new, inplace=False)`
- [x] `reverse_complement(self, inplace=False)`
- [x] `reverse_complement_rna(self, inplace=False)`
- [x] `rfind(self, sub, start=None, end=None)`
- [x] `rindex(self, sub, start=None, end=None)`
- [x] `rsplit(self, sep=None, maxsplit=-1)`
- [x] `rstrip(self, chars=None, inplace=False)`
- [x] `search(self, subs)`
- [x] `split(self, sep=None, maxsplit=-1)`
- [x] `startswith(self, prefix, start=None, end=None)`
- [x] `strip(self, chars=None, inplace=False)`
- [x] `transcribe(self, inplace=False)`
- [x] `translate(self, table='Standard', stop_symbol='*', to_stop=False, cds=False, gap='-')`
- [x] `upper(self, inplace=False)`

### Bio.Seq.MutableSeq

- [x] `__add__(self, other)`
- [x] `__bytes__(self)`
- [x] `__contains__(self, item)`
- [x] `__delitem__(self, index)`
- [x] `__eq__(self, other)`
- [x] `__ge__(self, other)`
- [x] `__getitem__(self, index)`
- [x] `__gt__(self, other)`
- [x] `__imul__(self, other)`
- [x] `__init__(self, data)`
- [x] `__iter__(self)`
- [x] `__le__(self, other)`
- [x] `__len__(self)`
- [x] `__lt__(self, other)`
- [x] `__mul__(self, other)`
- [x] `__radd__(self, other)`
- [x] `__repr__(self)`
- [x] `__rmul__(self, other)`
- [x] `__setitem__(self, index, value)`
- [x] `__str__(self)`
- [x] `append(self, c)`
- [x] `back_transcribe(self, inplace=False)`
- [x] `complement(self, inplace=False)`
- [x] `complement_rna(self, inplace=False)`
- [x] `count(self, sub, start=None, end=None)`
- [x] `count_overlap(self, sub, start=None, end=None)`
- [x] `defined`
- [x] `defined_ranges`
- [x] `endswith(self, suffix, start=None, end=None)`
- [x] `extend(self, other)`
- [x] `find(self, sub, start=None, end=None)`
- [x] `index(self, sub, start=None, end=None)`
- [x] `insert(self, i, c)`
- [x] `islower(self)`
- [x] `isupper(self)`
- [x] `join(self, other)`
- [x] `lower(self, inplace=False)`
- [x] `lstrip(self, chars=None, inplace=False)`
- [x] `pop(self, i=-1)`
- [x] `remove(self, item)`
- [x] `removeprefix(self, prefix, inplace=False)`
- [x] `removesuffix(self, suffix, inplace=False)`
- [x] `replace(self, old, new, inplace=False)`
- [x] `reverse(self)`
- [x] `reverse_complement(self, inplace=False)`
- [x] `reverse_complement_rna(self, inplace=False)`
- [x] `rfind(self, sub, start=None, end=None)`
- [x] `rindex(self, sub, start=None, end=None)`
- [x] `rsplit(self, sep=None, maxsplit=-1)`
- [x] `rstrip(self, chars=None, inplace=False)`
- [x] `search(self, subs)`
- [x] `split(self, sep=None, maxsplit=-1)`
- [x] `startswith(self, prefix, start=None, end=None)`
- [x] `strip(self, chars=None, inplace=False)`
- [x] `transcribe(self, inplace=False)`
- [x] `translate(self, table='Standard', stop_symbol='*', to_stop=False, cds=False, gap='-')`
- [x] `upper(self, inplace=False)`

### Bio.Seq.UndefinedSequenceError

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [-] `__init__(self, /, *args, **kwargs)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [-] `__repr__(self, /)`
- [-] `__str__(self, /)`
- [-] `add_note(self, note, /)`
- [-] `with_traceback(self, tb, /)`

## Bio.SeqRecord


### Bio.SeqRecord.SeqRecord

- [x] `__add__(self, other: ForwardRef('SeqRecord') | ForwardRef('Seq') | ForwardRef('MutableSeq') | str) -> 'SeqRecord'`
- [x] `__bytes__(self) -> bytes`
- [x] `__contains__(self, char: str) -> bool`
- [x] `__eq__(self, other: object) -> NoReturn`
- [x] `__ge__(self, other: Any) -> NoReturn`
- [x] `__getitem__(self, index)`
- [x] `__gt__(self, other: Any) -> NoReturn`
- [x] `__init__(self, seq: ForwardRef('Seq') | ForwardRef('MutableSeq') | None, id: str | None = '<unknown id>', name: str = '<unknown name>', description: str = '<unknown description>', dbxrefs: list[str] | None = None, features: list['SeqFeature'] | None = None, annotations: dict[str, str | int] | None = None, letter_annotations: dict[str, collections.abc.Sequence[Any]] | None = None) -> None`
- [x] `__iter__(self) -> collections.abc.Iterator[str]`
- [x] `__le__(self, other: Any) -> NoReturn`
- [x] `__len__(self) -> int`
- [x] `__lt__(self, other: Any) -> NoReturn`
- [x] `__radd__(self, other: ForwardRef('Seq') | ForwardRef('MutableSeq') | str) -> 'SeqRecord'`
- [x] `__repr__(self) -> str`
- [x] `__str__(self) -> str`
- [x] `count(self, sub, start=None, end=None)`
- [~] `format(self, format: str) -> str`
- [x] `islower(self)`
- [x] `isupper(self)`
- [x] `letter_annotations`
- [x] `lower(self) -> 'SeqRecord'`
- [x] `reverse_complement(self, id: bool = False, name: bool = False, description: bool = False, features: bool = True, annotations: bool = False, letter_annotations: bool = True, dbxrefs: bool = False) -> 'SeqRecord'`
- [x] `seq`
- [x] `translate(self, table: str = 'Standard', stop_symbol: str = '*', to_stop: bool = False, cds: bool = False, gap: str | None = None, id: bool = False, name: bool = False, description: bool = False, features: bool = False, annotations: bool = False, letter_annotations: bool = False, dbxrefs: bool = False) -> 'SeqRecord'`
- [x] `upper(self) -> 'SeqRecord'`

## Bio.SeqFeature


### Bio.SeqFeature.SeqFeature

- [x] `__contains__(self, value)`
- [x] `__eq__(self, other)`
- [x] `__ge__(self, value, /)`
- [x] `__gt__(self, value, /)`
- [x] `__init__(self, location=None, type='', id='<unknown id>', qualifiers=None, sub_features=None)`
- [x] `__iter__(self)`
- [x] `__le__(self, value, /)`
- [x] `__len__(self)`
- [x] `__lt__(self, value, /)`
- [x] `__repr__(self)`
- [x] `__str__(self)`
- [x] `extract(self, parent_sequence, references=None)`
- [x] `translate(self, parent_sequence, table='Standard', start_offset=None, stop_symbol='*', to_stop=False, cds=None, gap=None)`

### Bio.SeqFeature.Location

- [x] `__eq__(self, value, /)`
- [x] `__ge__(self, value, /)`
- [x] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [-] `__init__(self, /, *args, **kwargs)`
- [x] `__le__(self, value, /)`
- [x] `__lt__(self, value, /)`
- [x] `__repr__(self)`
- [x] `__str__(self, /)`
- [x] `fromstring(text, length=None, circular=False, stranded=True)`

### Bio.SeqFeature.SimpleLocation

- [x] `__add__(self, other)`
- [x] `__contains__(self, value)`
- [x] `__eq__(self, other)`
- [x] `__ge__(self, value, /)`
- [x] `__gt__(self, value, /)`
- [x] `__init__(self, start, end, strand=None, ref=None, ref_db=None)`
- [x] `__iter__(self)`
- [x] `__le__(self, value, /)`
- [x] `__len__(self)`
- [x] `__lt__(self, value, /)`
- [x] `__radd__(self, other)`
- [x] `__repr__(self)`
- [x] `__str__(self)`
- [x] `end`
- [x] `extract(self, parent_sequence, references=None)`
- [x] `fromstring(text, length=None, circular=False)`
- [x] `parts`
- [x] `start`
- [x] `strand`

### Bio.SeqFeature.CompoundLocation

- [x] `__add__(self, other)`
- [x] `__contains__(self, value)`
- [x] `__eq__(self, other)`
- [x] `__ge__(self, value, /)`
- [x] `__gt__(self, value, /)`
- [x] `__init__(self, parts, operator='join')`
- [x] `__iter__(self)`
- [x] `__le__(self, value, /)`
- [x] `__len__(self)`
- [x] `__lt__(self, value, /)`
- [x] `__radd__(self, other)`
- [x] `__repr__(self)`
- [x] `__str__(self)`
- [x] `end`
- [x] `extract(self, parent_sequence, references=None)`
- [x] `fromstring(text, length=None, circular=False, stranded=True)`
- [x] `ref`
- [x] `ref_db`
- [x] `start`
- [x] `strand`

### Bio.SeqFeature.Position

- [x] `__eq__(self, value, /)`
- [x] `__ge__(self, value, /)`
- [x] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [-] `__init__(self, /, *args, **kwargs)`
- [x] `__le__(self, value, /)`
- [x] `__lt__(self, value, /)`
- [x] `__repr__(self)`
- [x] `__str__(self, /)`
- [x] `fromstring(text, offset=0)`

### Bio.SeqFeature.ExactPosition

- [x] `__add__(self, offset)`
- [x] `__eq__(self, value, /)`
- [x] `__ge__(self, value, /)`
- [x] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, /, *args, **kwargs)`
- [x] `__le__(self, value, /)`
- [x] `__lt__(self, value, /)`
- [-] `__mod__(self, value, /)`
- [-] `__mul__(self, value, /)`
- [x] `__radd__(self, value, /)`
- [x] `__repr__(self)`
- [-] `__rmul__(self, value, /)`
- [x] `__str__(self)`
- [-] `as_integer_ratio(self, /)`
- [-] `bit_count(self, /)`
- [-] `bit_length(self, /)`
- [-] `conjugate(self, /)`
- [-] `from_bytes(bytes, byteorder='big', *, signed=False)`
- [x] `fromstring(text, offset=0)`
- [-] `is_integer(self, /)`
- [-] `to_bytes(self, /, length=1, byteorder='big', *, signed=False)`

### Bio.SeqFeature.BeforePosition

- [x] `__add__(self, offset)`
- [x] `__eq__(self, value, /)`
- [x] `__ge__(self, value, /)`
- [x] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, /, *args, **kwargs)`
- [x] `__le__(self, value, /)`
- [x] `__lt__(self, value, /)`
- [-] `__mod__(self, value, /)`
- [-] `__mul__(self, value, /)`
- [x] `__radd__(self, value, /)`
- [x] `__repr__(self)`
- [-] `__rmul__(self, value, /)`
- [x] `__str__(self)`
- [-] `as_integer_ratio(self, /)`
- [-] `bit_count(self, /)`
- [-] `bit_length(self, /)`
- [-] `conjugate(self, /)`
- [-] `from_bytes(bytes, byteorder='big', *, signed=False)`
- [x] `fromstring(text, offset=0)`
- [-] `is_integer(self, /)`
- [-] `to_bytes(self, /, length=1, byteorder='big', *, signed=False)`

### Bio.SeqFeature.AfterPosition

- [x] `__add__(self, offset)`
- [x] `__eq__(self, value, /)`
- [x] `__ge__(self, value, /)`
- [x] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, /, *args, **kwargs)`
- [x] `__le__(self, value, /)`
- [x] `__lt__(self, value, /)`
- [-] `__mod__(self, value, /)`
- [-] `__mul__(self, value, /)`
- [x] `__radd__(self, value, /)`
- [x] `__repr__(self)`
- [-] `__rmul__(self, value, /)`
- [x] `__str__(self)`
- [-] `as_integer_ratio(self, /)`
- [-] `bit_count(self, /)`
- [-] `bit_length(self, /)`
- [-] `conjugate(self, /)`
- [-] `from_bytes(bytes, byteorder='big', *, signed=False)`
- [x] `fromstring(text, offset=0)`
- [-] `is_integer(self, /)`
- [-] `to_bytes(self, /, length=1, byteorder='big', *, signed=False)`

### Bio.SeqFeature.UncertainPosition

- [x] `__add__(self, offset)`
- [x] `__eq__(self, value, /)`
- [x] `__ge__(self, value, /)`
- [x] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, /, *args, **kwargs)`
- [x] `__le__(self, value, /)`
- [x] `__lt__(self, value, /)`
- [-] `__mod__(self, value, /)`
- [-] `__mul__(self, value, /)`
- [x] `__radd__(self, value, /)`
- [x] `__repr__(self)`
- [-] `__rmul__(self, value, /)`
- [x] `__str__(self)`
- [-] `as_integer_ratio(self, /)`
- [-] `bit_count(self, /)`
- [-] `bit_length(self, /)`
- [-] `conjugate(self, /)`
- [-] `from_bytes(bytes, byteorder='big', *, signed=False)`
- [x] `fromstring(text, offset=0)`
- [-] `is_integer(self, /)`
- [-] `to_bytes(self, /, length=1, byteorder='big', *, signed=False)`

### Bio.SeqFeature.WithinPosition

- [x] `__add__(self, offset)`
- [x] `__eq__(self, value, /)`
- [x] `__ge__(self, value, /)`
- [x] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, /, *args, **kwargs)`
- [x] `__le__(self, value, /)`
- [x] `__lt__(self, value, /)`
- [-] `__mod__(self, value, /)`
- [-] `__mul__(self, value, /)`
- [x] `__radd__(self, value, /)`
- [x] `__repr__(self)`
- [-] `__rmul__(self, value, /)`
- [x] `__str__(self)`
- [-] `as_integer_ratio(self, /)`
- [-] `bit_count(self, /)`
- [-] `bit_length(self, /)`
- [-] `conjugate(self, /)`
- [-] `from_bytes(bytes, byteorder='big', *, signed=False)`
- [x] `fromstring(text, offset=0)`
- [-] `is_integer(self, /)`
- [-] `to_bytes(self, /, length=1, byteorder='big', *, signed=False)`

### Bio.SeqFeature.BetweenPosition

- [x] `__add__(self, offset)`
- [x] `__eq__(self, value, /)`
- [x] `__ge__(self, value, /)`
- [x] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, /, *args, **kwargs)`
- [x] `__le__(self, value, /)`
- [x] `__lt__(self, value, /)`
- [-] `__mod__(self, value, /)`
- [-] `__mul__(self, value, /)`
- [x] `__radd__(self, value, /)`
- [x] `__repr__(self)`
- [-] `__rmul__(self, value, /)`
- [x] `__str__(self)`
- [-] `as_integer_ratio(self, /)`
- [-] `bit_count(self, /)`
- [-] `bit_length(self, /)`
- [-] `conjugate(self, /)`
- [-] `from_bytes(bytes, byteorder='big', *, signed=False)`
- [x] `fromstring(text, offset=0)`
- [-] `is_integer(self, /)`
- [-] `to_bytes(self, /, length=1, byteorder='big', *, signed=False)`

### Bio.SeqFeature.OneOfPosition

- [x] `__add__(self, offset)`
- [x] `__eq__(self, value, /)`
- [x] `__ge__(self, value, /)`
- [x] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, /, *args, **kwargs)`
- [x] `__le__(self, value, /)`
- [x] `__lt__(self, value, /)`
- [-] `__mod__(self, value, /)`
- [-] `__mul__(self, value, /)`
- [x] `__radd__(self, value, /)`
- [x] `__repr__(self)`
- [-] `__rmul__(self, value, /)`
- [x] `__str__(self)`
- [-] `as_integer_ratio(self, /)`
- [-] `bit_count(self, /)`
- [-] `bit_length(self, /)`
- [-] `conjugate(self, /)`
- [-] `from_bytes(bytes, byteorder='big', *, signed=False)`
- [x] `fromstring(text, offset=0)`
- [-] `is_integer(self, /)`
- [-] `to_bytes(self, /, length=1, byteorder='big', *, signed=False)`

### Bio.SeqFeature.UnknownPosition

- [x] `__add__(self, offset)`
- [x] `__eq__(self, value, /)`
- [x] `__ge__(self, value, /)`
- [x] `__gt__(self, value, /)`
- [-] `__hash__(self)`
- [x] `__init__(self, /, *args, **kwargs)`
- [x] `__le__(self, value, /)`
- [x] `__lt__(self, value, /)`
- [x] `__repr__(self)`
- [x] `__str__(self, /)`
- [x] `fromstring(text, offset=0)`

### Bio.SeqFeature.Reference

- [x] `__eq__(self, other)`
- [x] `__ge__(self, value, /)`
- [x] `__gt__(self, value, /)`
- [x] `__init__(self)`
- [x] `__le__(self, value, /)`
- [x] `__lt__(self, value, /)`
- [x] `__repr__(self)`
- [x] `__str__(self)`

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

## Bio.Data.IUPACData (constants)

- [x] `ambiguous_dna_complement`
- [x] `ambiguous_dna_letters`
- [x] `ambiguous_dna_values`
- [x] `ambiguous_dna_weight_ranges`
- [x] `ambiguous_rna_complement`
- [x] `ambiguous_rna_letters`
- [x] `ambiguous_rna_values`
- [x] `ambiguous_rna_weight_ranges`
- [x] `atom_weights`
- [x] `avg_ambiguous_dna_weights`
- [x] `avg_ambiguous_rna_weights`
- [x] `avg_extended_protein_weights`
- [x] `extended_dna_letters`
- [x] `extended_protein_letters`
- [x] `extended_protein_values`
- [x] `extended_protein_weight_ranges`
- [x] `monoisotopic_protein_weights`
- [x] `monoisotopic_unambiguous_dna_weights`
- [x] `monoisotopic_unambiguous_rna_weights`
- [x] `protein_letters`
- [x] `protein_letters_1to3`
- [x] `protein_letters_1to3_extended`
- [x] `protein_letters_3to1`
- [x] `protein_letters_3to1_extended`
- [x] `protein_weight_ranges`
- [x] `protein_weights`
- [x] `unambiguous_dna_letters`
- [x] `unambiguous_dna_weight_ranges`
- [x] `unambiguous_dna_weights`
- [x] `unambiguous_rna_letters`
- [x] `unambiguous_rna_weight_ranges`
- [x] `unambiguous_rna_weights`

## Bio.SeqIO

- [~] `convert(in_file, in_format, out_file, out_format, molecule_type=None)`
- [ ] `index(filename, format, alphabet=None, key_function=None)`
- [ ] `index_db(index_filename, filenames=None, format=None, alphabet=None, key_function=None)`
- [x] `parse(handle, format, alphabet=None)`
- [x] `read(handle, format, alphabet=None)`
- [x] `to_dict(sequences, key_function=None)`
- [x] `write(sequences: collections.abc.Iterable[Bio.SeqRecord.SeqRecord] | Bio.SeqRecord.SeqRecord, handle: IO[str] | os.PathLike | str | bytes, format: str) -> int`

### Parse formats

- [ ] `parse: abi`
- [ ] `parse: abi-trim`
- [ ] `parse: ace`
- [ ] `parse: cif-atom`
- [ ] `parse: cif-seqres`
- [ ] `parse: clustal`
- [ ] `parse: embl`
- [ ] `parse: embl-cds`
- [ ] `parse: emboss`
- [x] `parse: fasta`
- [x] `parse: fasta-2line`
- [x] `parse: fasta-blast`
- [ ] `parse: fasta-m10`
- [x] `parse: fasta-pearson`
- [ ] `parse: fastq`
- [ ] `parse: fastq-illumina`
- [ ] `parse: fastq-sanger`
- [ ] `parse: fastq-solexa`
- [ ] `parse: gb`
- [ ] `parse: gck`
- [ ] `parse: genbank`
- [ ] `parse: genbank-cds`
- [ ] `parse: gfa1`
- [ ] `parse: gfa2`
- [ ] `parse: ig`
- [ ] `parse: imgt`
- [ ] `parse: maf`
- [ ] `parse: mauve`
- [ ] `parse: msf`
- [ ] `parse: nexus`
- [ ] `parse: nib`
- [ ] `parse: pdb-atom`
- [ ] `parse: pdb-seqres`
- [ ] `parse: phd`
- [ ] `parse: phylip`
- [ ] `parse: phylip-relaxed`
- [ ] `parse: phylip-sequential`
- [ ] `parse: pir`
- [ ] `parse: qual`
- [ ] `parse: seqxml`
- [ ] `parse: sff`
- [ ] `parse: sff-trim`
- [ ] `parse: snapgene`
- [ ] `parse: stockholm`
- [ ] `parse: swiss`
- [ ] `parse: tab`
- [ ] `parse: twobit`
- [ ] `parse: uniprot-xml`
- [ ] `parse: xdna`

### Write formats

- [ ] `write: clustal`
- [ ] `write: embl`
- [x] `write: fasta`
- [x] `write: fasta-2line`
- [ ] `write: fastq`
- [ ] `write: fastq-illumina`
- [ ] `write: fastq-sanger`
- [ ] `write: fastq-solexa`
- [ ] `write: gb`
- [ ] `write: genbank`
- [ ] `write: imgt`
- [ ] `write: maf`
- [ ] `write: mauve`
- [ ] `write: nexus`
- [ ] `write: nib`
- [ ] `write: phd`
- [ ] `write: phylip`
- [ ] `write: phylip-relaxed`
- [ ] `write: phylip-sequential`
- [ ] `write: pir`
- [ ] `write: qual`
- [ ] `write: seqxml`
- [ ] `write: sff`
- [ ] `write: stockholm`
- [ ] `write: tab`
- [ ] `write: xdna`

## Bio.SeqUtils

- [ ] `GC123(seq)`
- [~] `GC_skew(seq, window=100)`
- [~] `gc_fraction(seq, ambiguous='remove')`
- [ ] `molecular_weight(seq, seq_type='DNA', double_stranded=False, circular=False, monoisotopic=False)`
- [ ] `nt_search(seq, subseq)`
- [ ] `seq1(seq, custom_map=None, undef_code='X')`
- [ ] `seq3(seq, custom_map=None, undef_code='Xaa')`
- [ ] `six_frame_translations(seq, genetic_code=1)`
- [ ] `xGC_skew(seq, window=1000, zoom=100, r=300, px=100, py=100)`
