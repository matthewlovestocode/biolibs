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
