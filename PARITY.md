# Biopython parity checklist

Generated from Biopython 1.88 by `reference/gen_checklist.py`. `[ ]` not started, `[~]` partial (scaffold only), `[x]` verified against Biopython output, `[-]` not applicable (inherited Python/`object`/`BaseException` boilerplate). Edit `reference/status.json`, then re-run the script.

**Progress: 919 / 1043 applicable items verified against Biopython.**



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
- [x] `format(self, format: str) -> str`
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

- [x] `convert(in_file, in_format, out_file, out_format, molecule_type=None)`
- [ ] `index(filename, format, alphabet=None, key_function=None)`
- [ ] `index_db(index_filename, filenames=None, format=None, alphabet=None, key_function=None)`
- [x] `parse(handle, format, alphabet=None)`
- [x] `read(handle, format, alphabet=None)`
- [x] `to_dict(sequences, key_function=None)`
- [x] `write(sequences: collections.abc.Iterable[Bio.SeqRecord.SeqRecord] | Bio.SeqRecord.SeqRecord, handle: IO[str] | os.PathLike | str | bytes, format: str) -> int`

### Parse formats

- [x] `parse: abi`
- [x] `parse: abi-trim`
- [x] `parse: ace`
- [ ] `parse: cif-atom`
- [ ] `parse: cif-seqres`
- [x] `parse: clustal`
- [x] `parse: embl`
- [x] `parse: embl-cds`
- [x] `parse: emboss`
- [x] `parse: fasta`
- [x] `parse: fasta-2line`
- [x] `parse: fasta-blast`
- [x] `parse: fasta-m10`
- [x] `parse: fasta-pearson`
- [x] `parse: fastq`
- [x] `parse: fastq-illumina`
- [x] `parse: fastq-sanger`
- [x] `parse: fastq-solexa`
- [x] `parse: gb`
- [x] `parse: gck`
- [x] `parse: genbank`
- [x] `parse: genbank-cds`
- [x] `parse: gfa1`
- [x] `parse: gfa2`
- [x] `parse: ig`
- [x] `parse: imgt`
- [x] `parse: maf`
- [x] `parse: mauve`
- [x] `parse: msf`
- [x] `parse: nexus`
- [x] `parse: nib`
- [ ] `parse: pdb-atom`
- [x] `parse: pdb-seqres`
- [x] `parse: phd`
- [x] `parse: phylip`
- [x] `parse: phylip-relaxed`
- [x] `parse: phylip-sequential`
- [x] `parse: pir`
- [x] `parse: qual`
- [~] `parse: seqxml`
- [x] `parse: sff`
- [x] `parse: sff-trim`
- [~] `parse: snapgene`
- [x] `parse: stockholm`
- [x] `parse: swiss`
- [x] `parse: tab`
- [x] `parse: twobit`
- [~] `parse: uniprot-xml`
- [x] `parse: xdna`

### Write formats

- [x] `write: clustal`
- [x] `write: embl`
- [x] `write: fasta`
- [x] `write: fasta-2line`
- [x] `write: fastq`
- [x] `write: fastq-illumina`
- [x] `write: fastq-sanger`
- [x] `write: fastq-solexa`
- [x] `write: gb`
- [x] `write: genbank`
- [x] `write: imgt`
- [x] `write: maf`
- [x] `write: mauve`
- [x] `write: nexus`
- [x] `write: nib`
- [x] `write: phd`
- [x] `write: phylip`
- [x] `write: phylip-relaxed`
- [x] `write: phylip-sequential`
- [x] `write: pir`
- [x] `write: qual`
- [x] `write: seqxml`
- [x] `write: sff`
- [x] `write: stockholm`
- [x] `write: tab`
- [x] `write: xdna`

## Bio.Align


### Bio.Align.MultipleSeqAlignment

- [x] `__add__(self, other)`
- [x] `__delitem__(self, index)`
- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [x] `__getitem__(self, index)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, records, alphabet=None, annotations=None, column_annotations=None)`
- [x] `__iter__(self)`
- [-] `__le__(self, value, /)`
- [x] `__len__(self)`
- [-] `__lt__(self, value, /)`
- [-] `__repr__(self)`
- [x] `__str__(self)`
- [ ] `alignment`
- [x] `append(self, record)`
- [x] `column_annotations`
- [x] `extend(self, records)`
- [x] `get_alignment_length(self)`
- [x] `sort(self, key=None, reverse=False)`
- [ ] `substitutions`

## Bio.Align.AlignmentCounts


### Bio.Align.AlignmentCounts.AlignmentCounts

- [x] `aligned`
- [x] `deletions`
- [x] `extend_deletions`
- [x] `extend_gaps`
- [x] `extend_insertions`
- [x] `extend_internal_deletions`
- [x] `extend_internal_gaps`
- [x] `extend_internal_insertions`
- [x] `extend_left_deletions`
- [x] `extend_left_gaps`
- [x] `extend_left_insertions`
- [x] `extend_right_deletions`
- [x] `extend_right_gaps`
- [x] `extend_right_insertions`
- [x] `gap_score`
- [x] `gaps`
- [x] `identities`
- [x] `insertions`
- [x] `internal_deletions`
- [x] `internal_gaps`
- [x] `internal_insertions`
- [x] `left_deletions`
- [x] `left_gaps`
- [x] `left_insertions`
- [x] `mismatches`
- [x] `open_deletions`
- [x] `open_gaps`
- [x] `open_insertions`
- [x] `open_internal_deletions`
- [x] `open_internal_gaps`
- [x] `open_internal_insertions`
- [x] `open_left_deletions`
- [x] `open_left_gaps`
- [x] `open_left_insertions`
- [x] `open_right_deletions`
- [x] `open_right_gaps`
- [x] `open_right_insertions`
- [x] `positives`
- [x] `right_deletions`
- [x] `right_gaps`
- [x] `right_insertions`
- [x] `score`
- [x] `substitution_score`

## Bio.Align.Alignment


### Bio.Align.Alignment.Alignment

- [x] `__add__(self, other)`
- [x] `__eq__(self, other)`
- [x] `__ge__(self, other)`
- [x] `__getitem__(self, key)`
- [x] `__gt__(self, other)`
- [x] `__init__(self, sequences, coordinates=None)`
- [x] `__le__(self, other)`
- [x] `__len__(self)`
- [x] `__lt__(self, other)`
- [-] `__repr__(self)`
- [x] `__str__(self)`
- [x] `aligned`
- [x] `counts(self, scoring=None)`
- [~] `format(self, fmt='', *args, **kwargs)`
- [x] `frequencies`
- [x] `from_alignments_with_same_reference(alignments: list['Alignment'] | tuple['Alignment']) -> 'Alignment'`
- [x] `indices`
- [x] `inverse_indices`
- [x] `length`
- [x] `map(self, alignment)`
- [x] `mapall(self, alignments)`
- [x] `parse_printed_alignment(lines)`
- [x] `query`
- [x] `reverse_complement(self)`
- [x] `shape`
- [x] `sort(self, key=None, reverse=False)`
- [x] `substitutions`
- [x] `target`

## Bio.Align.PairwiseAligner


### Bio.Align.PairwiseAligner.PairwiseAligner

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, scoring=None, **kwargs)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [-] `__repr__(self, /)`
- [x] `__str__(self, /)`
- [x] `align(self, seqA, seqB, strand='+')`
- [x] `score(self, seqA, seqB, strand='+')`
- [ ] `warn_defaults_changed(self, /)`

### Bio.Align.PairwiseAligner.PairwiseAlignments

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [x] `__getitem__(self, index)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, seqA, seqB, score, paths)`
- [x] `__iter__(self)`
- [-] `__le__(self, value, /)`
- [x] `__len__(self)`
- [-] `__lt__(self, value, /)`
- [-] `__repr__(self)`
- [-] `__str__(self, /)`
- [x] `rewind(self)`

## Bio.Align.substitution_matrices

- [x] `load(name=None)`
- [x] `read(handle, dtype=<class 'float'>)`

### Bio.Align.substitution_matrices.Array

- [x] `__new__(cls, alphabet=None, dims=None, data=None, dtype=<class 'float'>)`
- [-] `__array_finalize__(self, obj)`
- [x] `__getitem__(self, key)`
- [x] `__setitem__(self, key, value)`
- [x] `__contains__(self, key)`
- [-] `__array_prepare__(self, out_arr, context=None)`
- [-] `__array_wrap__(self, out_arr, context=None)`
- [ ] `__array_ufunc__(self, ufunc, method, *inputs, **kwargs)`
- [-] `__reduce__(self)`
- [-] `__setstate__(self, state)`
- [x] `get(self, key, value=None)`
- [x] `items(self)`
- [x] `keys(self)`
- [x] `values(self)`
- [x] `update(self, E=None, **F)`
- [x] `select(self, alphabet)`
- [x] `__format__(self, fmt)`
- [x] `format(self, fmt='')`
- [x] `__str__(self)`
- [-] `__repr__(self)`

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

## Bio.SeqUtils.CheckSum

- [x] `crc32(seq)`
- [x] `crc64(s)`
- [x] `gcg(seq)`
- [x] `seguid(seq)`

## Bio.SeqUtils.lcc

- [x] `lcc_mult(seq, wsize)`
- [x] `lcc_simp(seq)`

## Bio.SeqUtils.IsoelectricPoint


### Bio.SeqUtils.IsoelectricPoint.IsoelectricPoint

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, protein_sequence, aa_content=None)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [-] `__repr__(self, /)`
- [-] `__str__(self, /)`
- [x] `charge_at_pH(self, pH)`
- [x] `pi(self, pH=7.775, min_=4.05, max_=12)`

## Bio.SeqUtils.ProtParam


### Bio.SeqUtils.ProtParam.ProteinAnalysis

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, prot_sequence, monoisotopic=False)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [-] `__repr__(self, /)`
- [-] `__str__(self, /)`
- [x] `aromaticity(self)`
- [x] `charge_at_pH(self, pH)`
- [x] `count_amino_acids(self)`
- [x] `flexibility(self)`
- [x] `gravy(self, scale='KyteDoolitle')`
- [x] `instability_index(self)`
- [x] `isoelectric_point(self)`
- [x] `molar_extinction_coefficient(self)`
- [x] `molecular_weight(self)`
- [x] `protein_scale(self, param_dict, window, edge=1.0)`
- [x] `secondary_structure_fraction(self)`

## Bio.SeqUtils.MeltingTemp

- [x] `Tm_GC(seq, check=True, strict=True, valueset=7, userset=None, Na=50, K=0, Tris=0, Mg=0, dNTPs=0, saltcorr=0, mismatch=True)`
- [x] `Tm_NN(seq, check=True, strict=True, c_seq=None, shift=0, nn_table=None, tmm_table=None, imm_table=None, de_table=None, dnac1=25, dnac2=25, selfcomp=False, Na=50, K=0, Tris=0, Mg=0, dNTPs=0, saltcorr=5)`
- [x] `Tm_Wallace(seq, check=True, strict=True)`
- [x] `chem_correction(melting_temp, DMSO=0, fmd=0, DMSOfactor=0.75, fmdfactor=0.65, fmdmethod=1, GC=None)`
- [x] `make_table(oldtable=None, values=None)`
- [x] `salt_correction(Na=0, K=0, Tris=0, Mg=0, dNTPs=0, method=1, seq=None)`

## Bio.Nexus.Nexus

- [x] `combine(matrices)`
- [x] `get_start_end(sequence, skiplist=('-', '?'))`
- [x] `quotestrip(word)`
- [x] `safename(name, mrbayes=False)`

### Bio.Nexus.Nexus.Nexus

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, input=None)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [-] `__repr__(self, /)`
- [-] `__str__(self, /)`
- [x] `add_sequence(self, name, sequence)`
- [x] `append_sets(self, exclude=(), delete=(), mrbayes=False, include_codons=True, codons_only=False)`
- [ ] `bootstrap(self, matrix=None, delete=(), exclude=())`
- [x] `constant(self, matrix=None, delete=(), exclude=())`
- [x] `crop_matrix(self, matrix=None, delete=(), exclude=())`
- [x] `cstatus(self, site, delete=(), narrow=True)`
- [ ] `export_fasta(self, filename=None, width=70)`
- [ ] `export_phylip(self, filename=None)`
- [x] `gaponly(self, include_missing=False)`
- [x] `insert_gap(self, pos, n=1, leftgreedy=False)`
- [x] `invert(self, charlist)`
- [x] `read(self, input)`
- [x] `terminal_gap_to_missing(self, missing=None, skip_n=True)`
- [x] `weighted_stepmatrix(self, name='your_name_here', exclude=(), delete=())`
- [x] `write_nexus_data(self, filename=None, matrix=None, exclude=(), delete=(), blocksize=None, interleave=False, interleave_by_partition=False, comment=None, omit_NEXUS=False, append_sets=True, mrbayes=False, codons_block=True)`
- [ ] `write_nexus_data_partitions(self, matrix=None, filename=None, blocksize=None, interleave=False, exclude=(), delete=(), charpartition=None, comment='', mrbayes=False)`

## Bio.Nexus.Trees

- [x] `consensus(trees, threshold=0.5, outgroup=None)`

### Bio.Nexus.Trees.Tree

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, tree=None, weight=1.0, rooted=False, name='', data=<class 'Bio.Nexus.Trees.NodeData'>, values_are_support=False, max_support=1.0)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [-] `__repr__(self, /)`
- [x] `__str__(self)`
- [x] `add(self, node: 'Node', prev: int | None = None) -> int`
- [x] `all_ids(self) -> list[int]`
- [x] `branchlength2support(self)`
- [x] `collapse(self, id)`
- [x] `collapse_genera(self, space_equals_underscore=True)`
- [x] `common_ancestor(self, node1, node2)`
- [x] `convert_absolute_support(self, nrep)`
- [x] `count_terminals(self, node=None)`
- [ ] `display(self)`
- [x] `distance(self, node1, node2)`
- [x] `get_taxa(self, node_id=None)`
- [x] `get_terminals(self)`
- [x] `has_support(self, node=None)`
- [x] `is_bifurcating(self, node=None)`
- [x] `is_compatible(self, tree2, threshold, strict=True)`
- [x] `is_identical(self, tree2)`
- [x] `is_internal(self, node)`
- [x] `is_monophyletic(self, taxon_list)`
- [x] `is_parent_of(self, parent, grandchild)`
- [x] `is_preterminal(self, node)`
- [x] `is_terminal(self, node)`
- [x] `kill(self, id)`
- [x] `link(self, parent, child)`
- [x] `merge_with_support(self, bstrees=None, constree=None, threshold=0.5, outgroup=None)`
- [x] `node(self, node_id)`
- [x] `prune(self, taxon)`
- [ ] `randomize(self, ntax=None, taxon_list=None, branchlength=1.0, branchlength_sd=None, bifurcate=True)`
- [x] `root_with_outgroup(self, outgroup=None)`
- [x] `search_taxon(self, taxon)`
- [x] `set_subtree(self, node)`
- [x] `split(self, parent_id=None, n=2, branchlength=1.0)`
- [x] `sum_branchlength(self, root=None, node=None)`
- [x] `to_string(self, support_as_branchlengths=False, branchlengths_only=False, plain=True, plain_newick=False, ladderize=None, ignore_comments=True)`
- [x] `trace(self, start, finish)`
- [x] `unlink(self, id)`
- [x] `unroot(self)`

## Bio.Nexus.Nodes


### Bio.Nexus.Nodes.Chain

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self) -> None`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [-] `__repr__(self, /)`
- [-] `__str__(self, /)`
- [x] `add(self, node: 'Node', prev: int | None = None) -> int`
- [x] `all_ids(self) -> list[int]`
- [x] `collapse(self, id)`
- [x] `is_parent_of(self, parent, grandchild)`
- [x] `kill(self, id)`
- [x] `link(self, parent, child)`
- [x] `trace(self, start, finish)`
- [x] `unlink(self, id)`

### Bio.Nexus.Nodes.Node

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, data=None)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [-] `__repr__(self, /)`
- [-] `__str__(self, /)`
- [x] `add_succ(self, id)`
- [-] `get_data(self)`
- [x] `get_id(self)`
- [x] `get_prev(self)`
- [x] `get_succ(self)`
- [x] `remove_succ(self, id)`
- [-] `set_data(self, data)`
- [x] `set_id(self, id)`
- [x] `set_prev(self, id)`
- [x] `set_succ(self, new_succ)`

## Bio.Nexus.StandardData


### Bio.Nexus.StandardData.StandardData

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [x] `__getitem__(self, arg)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, data)`
- [x] `__iter__(self)`
- [-] `__le__(self, value, /)`
- [x] `__len__(self)`
- [-] `__lt__(self, value, /)`
- [-] `__repr__(self, /)`
- [x] `__str__(self)`
- [x] `raw(self)`

## Bio.PDB.Entity


### Bio.PDB.Entity.Entity

- [x] `__contains__(self, id)`
- [ ] `__delitem__(self, id)`
- [x] `__eq__(self, other)`
- [x] `__ge__(self, other)`
- [x] `__getitem__(self, id)`
- [x] `__gt__(self, other)`
- [-] `__hash__(self)`
- [x] `__init__(self, id)`
- [x] `__iter__(self)`
- [x] `__le__(self, other)`
- [x] `__len__(self)`
- [x] `__lt__(self, other)`
- [x] `__repr__(self, /)`
- [-] `__str__(self, /)`
- [x] `add(self, entity: ~_Child)`
- [ ] `center_of_mass(self, geometric=False)`
- [x] `copy(self)`
- [x] `detach_child(self, id)`
- [x] `detach_parent(self)`
- [x] `get_full_id(self)`
- [x] `get_id(self)`
- [ ] `get_iterator(self)`
- [ ] `get_level(self)`
- [x] `get_list(self)`
- [x] `get_parent(self)`
- [x] `has_id(self, id)`
- [x] `id`
- [x] `insert(self, pos: int, entity: ~_Child)`
- [x] `set_parent(self, entity: ~_Parent)`
- [x] `strictly_equals(self: ~_Self, other: ~_Self, compare_coordinates: bool = False) -> bool`
- [ ] `transform(self, rot, tran)`

### Bio.PDB.Entity.DisorderedEntityWrapper

- [ ] `__contains__(self, id)`
- [ ] `__eq__(self, value, /)`
- [ ] `__ge__(self, other)`
- [ ] `__getitem__(self, id)`
- [ ] `__gt__(self, other)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, id)`
- [x] `__iter__(self)`
- [ ] `__le__(self, other)`
- [x] `__len__(self)`
- [ ] `__lt__(self, other)`
- [x] `__repr__(self, /)`
- [ ] `__setitem__(self, id, child)`
- [-] `__str__(self, /)`
- [x] `copy(self)`
- [ ] `detach_parent(self)`
- [x] `disordered_add(self, child)`
- [ ] `disordered_get(self, id=None)`
- [ ] `disordered_get_id_list(self)`
- [x] `disordered_get_list(self)`
- [ ] `disordered_has_id(self, id)`
- [ ] `disordered_remove(self, child)`
- [ ] `disordered_select(self, id)`
- [x] `get_id(self)`
- [x] `get_parent(self)`
- [x] `is_disordered(self)`
- [x] `set_parent(self, parent)`
- [x] `strictly_equals(self, other: 'DisorderedEntityWrapper', compare_coordinates: bool = False) -> bool`

## Bio.PDB.Atom


### Bio.PDB.Atom.Atom

- [x] `__eq__(self, other)`
- [x] `__ge__(self, other)`
- [x] `__gt__(self, other)`
- [-] `__hash__(self)`
- [x] `__init__(self, name: str, coord: numpy.ndarray, bfactor: float | None, occupancy: float | None, altloc: str, fullname: str, serial_number, element: str | None = None, pqr_charge: float | None = None, radius: float | None = None)`
- [x] `__le__(self, other)`
- [x] `__lt__(self, other)`
- [x] `__repr__(self)`
- [-] `__str__(self, /)`
- [x] `copy(self)`
- [x] `detach_parent(self)`
- [x] `flag_disorder(self)`
- [x] `get_altloc(self) -> str`
- [x] `get_anisou(self) -> numpy.ndarray | None`
- [x] `get_bfactor(self) -> float | None`
- [x] `get_charge(self) -> float | None`
- [x] `get_coord(self) -> numpy.ndarray`
- [x] `get_full_id(self)`
- [x] `get_fullname(self) -> str`
- [x] `get_id(self) -> str`
- [ ] `get_level(self) -> str`
- [x] `get_name(self) -> str`
- [x] `get_occupancy(self) -> float | None`
- [x] `get_parent(self) -> Bio.PDB.Residue.Residue | None`
- [x] `get_radius(self) -> float | None`
- [x] `get_serial_number(self)`
- [x] `get_sigatm(self) -> numpy.ndarray | None`
- [x] `get_siguij(self) -> numpy.ndarray | None`
- [ ] `get_vector(self) -> Bio.PDB.vectors.Vector`
- [x] `is_disordered(self) -> int`
- [ ] `set_altloc(self, altloc: str)`
- [x] `set_anisou(self, anisou_array: numpy.ndarray | None)`
- [ ] `set_bfactor(self, bfactor: float | None)`
- [ ] `set_charge(self, pqr_charge: float | None)`
- [ ] `set_coord(self, coord: numpy.ndarray)`
- [ ] `set_occupancy(self, occupancy: float | None)`
- [x] `set_parent(self, parent)`
- [ ] `set_radius(self, radius: float | None)`
- [ ] `set_serial_number(self, n)`
- [x] `set_sigatm(self, sigatm_array: numpy.ndarray | None)`
- [x] `set_siguij(self, siguij_array: numpy.ndarray | None)`
- [x] `strictly_equals(self: ~_AtomT, other: ~_AtomT, compare_coordinates: bool = False) -> bool`
- [ ] `transform(self, rot: numpy.ndarray, tran: numpy.ndarray)`

### Bio.PDB.Atom.DisorderedAtom

- [ ] `__contains__(self, id)`
- [ ] `__eq__(self, value, /)`
- [ ] `__ge__(self, other)`
- [ ] `__getitem__(self, id)`
- [ ] `__gt__(self, other)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, id: str)`
- [x] `__iter__(self)`
- [ ] `__le__(self, other)`
- [ ] `__len__(self)`
- [ ] `__lt__(self, other)`
- [x] `__repr__(self)`
- [ ] `__setitem__(self, id, child)`
- [-] `__str__(self, /)`
- [ ] `center_of_mass(self)`
- [x] `copy(self)`
- [ ] `detach_parent(self)`
- [x] `disordered_add(self, atom)`
- [ ] `disordered_get(self, id=None)`
- [ ] `disordered_get_id_list(self)`
- [x] `disordered_get_list(self) -> list[Bio.PDB.Atom.Atom]`
- [ ] `disordered_has_id(self, id)`
- [ ] `disordered_remove(self, altloc: str)`
- [ ] `disordered_select(self, id)`
- [x] `get_id(self)`
- [x] `get_parent(self)`
- [x] `is_disordered(self)`
- [x] `set_parent(self, parent)`
- [x] `strictly_equals(self, other: 'DisorderedEntityWrapper', compare_coordinates: bool = False) -> bool`
- [ ] `transform(self, rot: numpy.ndarray, tran: numpy.ndarray)`

## Bio.PDB.Residue


### Bio.PDB.Residue.Residue

- [x] `__contains__(self, id)`
- [ ] `__delitem__(self, id)`
- [x] `__eq__(self, other)`
- [x] `__ge__(self, other)`
- [x] `__getitem__(self, id)`
- [x] `__gt__(self, other)`
- [-] `__hash__(self)`
- [x] `__init__(self, id, resname, segid)`
- [x] `__iter__(self)`
- [x] `__le__(self, other)`
- [x] `__len__(self)`
- [x] `__lt__(self, other)`
- [x] `__repr__(self)`
- [-] `__str__(self, /)`
- [x] `add(self, atom)`
- [ ] `center_of_mass(self, geometric=False)`
- [x] `copy(self)`
- [x] `detach_child(self, id)`
- [x] `detach_parent(self)`
- [x] `flag_disordered(self)`
- [x] `get_atoms(self)`
- [x] `get_full_id(self)`
- [x] `get_id(self)`
- [ ] `get_iterator(self)`
- [ ] `get_level(self)`
- [x] `get_list(self)`
- [x] `get_parent(self)`
- [x] `get_resname(self)`
- [x] `get_segid(self)`
- [x] `get_unpacked_list(self)`
- [x] `has_id(self, id)`
- [x] `id`
- [x] `insert(self, pos: int, entity: ~_Child)`
- [x] `is_disordered(self)`
- [x] `set_parent(self, entity: ~_Parent)`
- [x] `strictly_equals(self: ~_ResidueT, other: ~_ResidueT, compare_coordinates: bool = False) -> bool`
- [ ] `transform(self, rot, tran)`

### Bio.PDB.Residue.DisorderedResidue

- [ ] `__contains__(self, id)`
- [ ] `__eq__(self, value, /)`
- [ ] `__ge__(self, other)`
- [ ] `__getitem__(self, id)`
- [ ] `__gt__(self, other)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, id)`
- [x] `__iter__(self)`
- [ ] `__le__(self, other)`
- [ ] `__len__(self)`
- [ ] `__lt__(self, other)`
- [x] `__repr__(self)`
- [ ] `__setitem__(self, id, child)`
- [-] `__str__(self, /)`
- [x] `add(self, atom)`
- [x] `copy(self)`
- [ ] `detach_parent(self)`
- [x] `disordered_add(self, residue)`
- [ ] `disordered_get(self, id=None)`
- [ ] `disordered_get_id_list(self)`
- [x] `disordered_get_list(self)`
- [ ] `disordered_has_id(self, id)`
- [ ] `disordered_remove(self, resname)`
- [ ] `disordered_select(self, id)`
- [x] `get_id(self)`
- [x] `get_parent(self)`
- [x] `is_disordered(self)`
- [x] `set_parent(self, parent)`
- [x] `sort(self)`
- [x] `strictly_equals(self, other: 'DisorderedEntityWrapper', compare_coordinates: bool = False) -> bool`

## Bio.PDB.Chain


### Bio.PDB.Chain.Chain

- [x] `__contains__(self, id)`
- [ ] `__delitem__(self, id)`
- [x] `__eq__(self, other)`
- [x] `__ge__(self, other)`
- [x] `__getitem__(self, id)`
- [x] `__gt__(self, other)`
- [-] `__hash__(self)`
- [x] `__init__(self, id)`
- [x] `__iter__(self)`
- [x] `__le__(self, other)`
- [x] `__len__(self)`
- [x] `__lt__(self, other)`
- [x] `__repr__(self)`
- [-] `__str__(self, /)`
- [x] `add(self, entity: ~_Child)`
- [ ] `atom_to_internal_coordinates(self, verbose: bool = False) -> None`
- [ ] `center_of_mass(self, geometric=False)`
- [x] `copy(self)`
- [x] `detach_child(self, id)`
- [x] `detach_parent(self)`
- [x] `get_atoms(self)`
- [x] `get_full_id(self)`
- [x] `get_id(self)`
- [ ] `get_iterator(self)`
- [ ] `get_level(self)`
- [x] `get_list(self)`
- [x] `get_parent(self)`
- [ ] `get_residues(self)`
- [x] `get_unpacked_list(self)`
- [x] `has_id(self, id)`
- [x] `id`
- [x] `insert(self, pos: int, entity: ~_Child)`
- [ ] `internal_to_atom_coordinates(self, verbose: bool = False, start: int | None = None, fin: int | None = None)`
- [x] `set_parent(self, entity: ~_Parent)`
- [x] `strictly_equals(self: ~_Self, other: ~_Self, compare_coordinates: bool = False) -> bool`
- [ ] `transform(self, rot, tran)`

## Bio.PDB.Model


### Bio.PDB.Model.Model

- [x] `__contains__(self, id)`
- [ ] `__delitem__(self, id)`
- [x] `__eq__(self, other)`
- [x] `__ge__(self, other)`
- [x] `__getitem__(self, id)`
- [x] `__gt__(self, other)`
- [-] `__hash__(self)`
- [x] `__init__(self, id, serial_num=None)`
- [x] `__iter__(self)`
- [x] `__le__(self, other)`
- [x] `__len__(self)`
- [x] `__lt__(self, other)`
- [x] `__repr__(self)`
- [-] `__str__(self, /)`
- [x] `add(self, entity: ~_Child)`
- [ ] `atom_to_internal_coordinates(self, verbose: bool = False) -> None`
- [ ] `center_of_mass(self, geometric=False)`
- [x] `copy(self)`
- [x] `detach_child(self, id)`
- [x] `detach_parent(self)`
- [x] `get_atoms(self)`
- [ ] `get_chains(self)`
- [x] `get_full_id(self)`
- [x] `get_id(self)`
- [ ] `get_iterator(self)`
- [ ] `get_level(self)`
- [x] `get_list(self)`
- [x] `get_parent(self)`
- [ ] `get_residues(self)`
- [x] `has_id(self, id)`
- [x] `id`
- [x] `insert(self, pos: int, entity: ~_Child)`
- [ ] `internal_to_atom_coordinates(self, verbose: bool = False) -> None`
- [x] `set_parent(self, entity: ~_Parent)`
- [x] `strictly_equals(self: ~_Self, other: ~_Self, compare_coordinates: bool = False) -> bool`
- [ ] `transform(self, rot, tran)`

## Bio.PDB.Structure


### Bio.PDB.Structure.Structure

- [x] `__contains__(self, id)`
- [ ] `__delitem__(self, id)`
- [x] `__eq__(self, other)`
- [x] `__ge__(self, other)`
- [x] `__getitem__(self, id)`
- [x] `__gt__(self, other)`
- [-] `__hash__(self)`
- [x] `__init__(self, id)`
- [x] `__iter__(self)`
- [x] `__le__(self, other)`
- [x] `__len__(self)`
- [x] `__lt__(self, other)`
- [x] `__repr__(self)`
- [-] `__str__(self, /)`
- [x] `add(self, entity: ~_Child)`
- [ ] `atom_to_internal_coordinates(self, verbose: bool = False) -> None`
- [ ] `center_of_mass(self, geometric=False)`
- [x] `copy(self)`
- [x] `detach_child(self, id)`
- [x] `detach_parent(self)`
- [x] `get_atoms(self)`
- [ ] `get_chains(self)`
- [x] `get_full_id(self)`
- [x] `get_id(self)`
- [ ] `get_iterator(self)`
- [ ] `get_level(self)`
- [x] `get_list(self)`
- [ ] `get_models(self)`
- [x] `get_parent(self)`
- [ ] `get_residues(self)`
- [x] `has_id(self, id)`
- [x] `id`
- [x] `insert(self, pos: int, entity: ~_Child)`
- [ ] `internal_to_atom_coordinates(self, verbose: bool = False) -> None`
- [x] `set_parent(self, entity: ~_Parent)`
- [x] `strictly_equals(self: ~_Self, other: ~_Self, compare_coordinates: bool = False) -> bool`
- [ ] `transform(self, rot, tran)`

## Bio.PDB.StructureBuilder


### Bio.PDB.StructureBuilder.StructureBuilder

- [ ] `__eq__(self, value, /)`
- [ ] `__ge__(self, value, /)`
- [ ] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self)`
- [ ] `__le__(self, value, /)`
- [ ] `__lt__(self, value, /)`
- [ ] `__repr__(self, /)`
- [-] `__str__(self, /)`
- [x] `get_structure(self)`
- [x] `init_atom(self, name: str, coord: numpy.ndarray, b_factor: float | None, occupancy: float | None, altloc: str, fullname: str, serial_number=None, element: str | None = None, pqr_charge: float | None = None, radius: float | None = None, is_pqr: bool = False)`
- [x] `init_chain(self, chain_id: str)`
- [x] `init_model(self, model_id: int, serial_num: int | None = None)`
- [x] `init_residue(self, resname: str, field: str, resseq: int, icode: str)`
- [x] `init_seg(self, segid: str)`
- [x] `init_structure(self, structure_id: str)`
- [x] `set_anisou(self, anisou_array)`
- [x] `set_header(self, header)`
- [x] `set_line_counter(self, line_counter: int)`
- [x] `set_sigatm(self, sigatm_array)`
- [x] `set_siguij(self, siguij_array)`
- [x] `set_symmetry(self, spacegroup, cell)`

## Bio.PDB.PDBParser


### Bio.PDB.PDBParser.PDBParser

- [ ] `__eq__(self, value, /)`
- [ ] `__ge__(self, value, /)`
- [ ] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, PERMISSIVE=True, get_header=False, structure_builder=None, QUIET=False, is_pqr=False)`
- [ ] `__le__(self, value, /)`
- [ ] `__lt__(self, value, /)`
- [ ] `__repr__(self, /)`
- [-] `__str__(self, /)`
- [x] `get_header(self)`
- [x] `get_structure(self, id, file)`
- [x] `get_trailer(self)`

## Bio.PDB.parse_pdb_header

- [x] `parse_pdb_header(infile)`
