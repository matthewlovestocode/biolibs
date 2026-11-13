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
