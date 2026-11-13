## Bio.Restriction


### Bio.Restriction.FormattedSeq

- [x] `__eq__(self, other)`
- [ ] `__ge__(self, value, /)`
- [x] `__getitem__(self, i)`
- [ ] `__gt__(self, value, /)`
- [x] `__init__(self, seq, linear=True)`
- [ ] `__le__(self, value, /)`
- [x] `__len__(self)`
- [ ] `__lt__(self, value, /)`
- [x] `__repr__(self)`
- [ ] `__str__(self, /)`
- [x] `circularise(self)`
- [x] `finditer(self, pattern, size)`
- [x] `is_linear(self)`
- [x] `linearise(self)`
- [x] `to_circular(self)`
- [x] `to_linear(self)`

### Bio.Restriction.RestrictionType

- [x] `__add__(cls, other)`
- [x] `__eq__(cls, other)`
- [x] `__ge__(cls, other)`
- [x] `__gt__(cls, other)`
- [-] `__hash__(cls)`
- [x] `__init__(cls, name='', bases=(), dct=None)`
- [x] `__le__(cls, other)`
- [x] `__len__(cls)`
- [x] `__lt__(cls, other)`
- [x] `__mod__(cls, other)`
- [x] `__repr__(cls)`
- [x] `__str__(cls)`
- [-] `mro(self, /)`

### Bio.Restriction.AbstractCut

- [x] `__add__(cls, other)`
- [x] `__eq__(cls, other)`
- [x] `__ge__(cls, other)`
- [x] `__gt__(cls, other)`
- [-] `__hash__(cls)`
- [x] `__init__(cls, name='', bases=(), dct=None)`
- [x] `__le__(cls, other)`
- [x] `__len__(cls)`
- [x] `__lt__(cls, other)`
- [x] `__mod__(cls, other)`
- [x] `__repr__(cls)`
- [x] `__str__(cls)`
- [~] `all_suppliers()`
- [x] `equischizomers(batch=None)`
- [x] `frequency()`
- [x] `is_equischizomer(other)`
- [x] `is_isoschizomer(other)`
- [x] `is_neoschizomer(other)`
- [x] `isoschizomers(batch=None)`
- [-] `mro(self, /)`
- [x] `neoschizomers(batch=None)`
- [x] `search(dna, linear=True)`

### Bio.Restriction.NoCut

- [x] `__add__(cls, other)`
- [x] `__eq__(cls, other)`
- [x] `__ge__(cls, other)`
- [x] `__gt__(cls, other)`
- [-] `__hash__(cls)`
- [x] `__init__(cls, name='', bases=(), dct=None)`
- [x] `__le__(cls, other)`
- [x] `__len__(cls)`
- [x] `__lt__(cls, other)`
- [x] `__mod__(cls, other)`
- [x] `__repr__(cls)`
- [x] `__str__(cls)`
- [~] `all_suppliers()`
- [x] `characteristic()`
- [x] `cut_once()`
- [x] `cut_twice()`
- [x] `equischizomers(batch=None)`
- [x] `frequency()`
- [x] `is_equischizomer(other)`
- [x] `is_isoschizomer(other)`
- [x] `is_neoschizomer(other)`
- [x] `isoschizomers(batch=None)`
- [-] `mro(self, /)`
- [x] `neoschizomers(batch=None)`
- [x] `search(dna, linear=True)`

### Bio.Restriction.OneCut

- [x] `__add__(cls, other)`
- [x] `__eq__(cls, other)`
- [x] `__ge__(cls, other)`
- [x] `__gt__(cls, other)`
- [-] `__hash__(cls)`
- [x] `__init__(cls, name='', bases=(), dct=None)`
- [x] `__le__(cls, other)`
- [x] `__len__(cls)`
- [x] `__lt__(cls, other)`
- [x] `__mod__(cls, other)`
- [x] `__repr__(cls)`
- [x] `__str__(cls)`
- [~] `all_suppliers()`
- [x] `characteristic()`
- [x] `cut_once()`
- [x] `cut_twice()`
- [x] `equischizomers(batch=None)`
- [x] `frequency()`
- [x] `is_equischizomer(other)`
- [x] `is_isoschizomer(other)`
- [x] `is_neoschizomer(other)`
- [x] `isoschizomers(batch=None)`
- [-] `mro(self, /)`
- [x] `neoschizomers(batch=None)`
- [x] `search(dna, linear=True)`

### Bio.Restriction.TwoCuts

- [x] `__add__(cls, other)`
- [x] `__eq__(cls, other)`
- [x] `__ge__(cls, other)`
- [x] `__gt__(cls, other)`
- [-] `__hash__(cls)`
- [x] `__init__(cls, name='', bases=(), dct=None)`
- [x] `__le__(cls, other)`
- [x] `__len__(cls)`
- [x] `__lt__(cls, other)`
- [x] `__mod__(cls, other)`
- [x] `__repr__(cls)`
- [x] `__str__(cls)`
- [~] `all_suppliers()`
- [x] `characteristic()`
- [x] `cut_once()`
- [x] `cut_twice()`
- [x] `equischizomers(batch=None)`
- [x] `frequency()`
- [x] `is_equischizomer(other)`
- [x] `is_isoschizomer(other)`
- [x] `is_neoschizomer(other)`
- [x] `isoschizomers(batch=None)`
- [-] `mro(self, /)`
- [x] `neoschizomers(batch=None)`
- [x] `search(dna, linear=True)`

### Bio.Restriction.Meth_Dep

- [x] `__add__(cls, other)`
- [x] `__eq__(cls, other)`
- [x] `__ge__(cls, other)`
- [x] `__gt__(cls, other)`
- [-] `__hash__(cls)`
- [x] `__init__(cls, name='', bases=(), dct=None)`
- [x] `__le__(cls, other)`
- [x] `__len__(cls)`
- [x] `__lt__(cls, other)`
- [x] `__mod__(cls, other)`
- [x] `__repr__(cls)`
- [x] `__str__(cls)`
- [~] `all_suppliers()`
- [x] `equischizomers(batch=None)`
- [x] `frequency()`
- [x] `is_equischizomer(other)`
- [x] `is_isoschizomer(other)`
- [x] `is_methylable()`
- [x] `is_neoschizomer(other)`
- [x] `isoschizomers(batch=None)`
- [-] `mro(self, /)`
- [x] `neoschizomers(batch=None)`
- [x] `search(dna, linear=True)`

### Bio.Restriction.Meth_Undep

- [x] `__add__(cls, other)`
- [x] `__eq__(cls, other)`
- [x] `__ge__(cls, other)`
- [x] `__gt__(cls, other)`
- [-] `__hash__(cls)`
- [x] `__init__(cls, name='', bases=(), dct=None)`
- [x] `__le__(cls, other)`
- [x] `__len__(cls)`
- [x] `__lt__(cls, other)`
- [x] `__mod__(cls, other)`
- [x] `__repr__(cls)`
- [x] `__str__(cls)`
- [~] `all_suppliers()`
- [x] `equischizomers(batch=None)`
- [x] `frequency()`
- [x] `is_equischizomer(other)`
- [x] `is_isoschizomer(other)`
- [x] `is_methylable()`
- [x] `is_neoschizomer(other)`
- [x] `isoschizomers(batch=None)`
- [-] `mro(self, /)`
- [x] `neoschizomers(batch=None)`
- [x] `search(dna, linear=True)`

### Bio.Restriction.Palindromic

- [x] `__add__(cls, other)`
- [x] `__eq__(cls, other)`
- [x] `__ge__(cls, other)`
- [x] `__gt__(cls, other)`
- [-] `__hash__(cls)`
- [x] `__init__(cls, name='', bases=(), dct=None)`
- [x] `__le__(cls, other)`
- [x] `__len__(cls)`
- [x] `__lt__(cls, other)`
- [x] `__mod__(cls, other)`
- [x] `__repr__(cls)`
- [x] `__str__(cls)`
- [~] `all_suppliers()`
- [x] `equischizomers(batch=None)`
- [x] `frequency()`
- [x] `is_equischizomer(other)`
- [x] `is_isoschizomer(other)`
- [x] `is_neoschizomer(other)`
- [x] `is_palindromic()`
- [x] `isoschizomers(batch=None)`
- [-] `mro(self, /)`
- [x] `neoschizomers(batch=None)`
- [x] `search(dna, linear=True)`

### Bio.Restriction.NonPalindromic

- [x] `__add__(cls, other)`
- [x] `__eq__(cls, other)`
- [x] `__ge__(cls, other)`
- [x] `__gt__(cls, other)`
- [-] `__hash__(cls)`
- [x] `__init__(cls, name='', bases=(), dct=None)`
- [x] `__le__(cls, other)`
- [x] `__len__(cls)`
- [x] `__lt__(cls, other)`
- [x] `__mod__(cls, other)`
- [x] `__repr__(cls)`
- [x] `__str__(cls)`
- [~] `all_suppliers()`
- [x] `equischizomers(batch=None)`
- [x] `frequency()`
- [x] `is_equischizomer(other)`
- [x] `is_isoschizomer(other)`
- [x] `is_neoschizomer(other)`
- [x] `is_palindromic()`
- [x] `isoschizomers(batch=None)`
- [-] `mro(self, /)`
- [x] `neoschizomers(batch=None)`
- [x] `search(dna, linear=True)`

### Bio.Restriction.Unknown

- [x] `__add__(cls, other)`
- [x] `__eq__(cls, other)`
- [x] `__ge__(cls, other)`
- [x] `__gt__(cls, other)`
- [-] `__hash__(cls)`
- [x] `__init__(cls, name='', bases=(), dct=None)`
- [x] `__le__(cls, other)`
- [x] `__len__(cls)`
- [x] `__lt__(cls, other)`
- [x] `__mod__(cls, other)`
- [x] `__repr__(cls)`
- [x] `__str__(cls)`
- [~] `all_suppliers()`
- [x] `catalyse(dna, linear=True)`
- [x] `catalyze(dna, linear=True)`
- [x] `compatible_end()`
- [x] `equischizomers(batch=None)`
- [x] `frequency()`
- [x] `is_3overhang()`
- [x] `is_5overhang()`
- [x] `is_blunt()`
- [x] `is_equischizomer(other)`
- [x] `is_isoschizomer(other)`
- [x] `is_neoschizomer(other)`
- [x] `isoschizomers(batch=None)`
- [-] `mro(self, /)`
- [x] `neoschizomers(batch=None)`
- [x] `overhang()`
- [x] `search(dna, linear=True)`

### Bio.Restriction.Blunt

- [x] `__add__(cls, other)`
- [x] `__eq__(cls, other)`
- [x] `__ge__(cls, other)`
- [x] `__gt__(cls, other)`
- [-] `__hash__(cls)`
- [x] `__init__(cls, name='', bases=(), dct=None)`
- [x] `__le__(cls, other)`
- [x] `__len__(cls)`
- [x] `__lt__(cls, other)`
- [x] `__mod__(cls, other)`
- [x] `__repr__(cls)`
- [x] `__str__(cls)`
- [~] `all_suppliers()`
- [x] `catalyse(dna, linear=True)`
- [x] `catalyze(dna, linear=True)`
- [x] `compatible_end(batch=None)`
- [x] `equischizomers(batch=None)`
- [x] `frequency()`
- [x] `is_3overhang()`
- [x] `is_5overhang()`
- [x] `is_blunt()`
- [x] `is_equischizomer(other)`
- [x] `is_isoschizomer(other)`
- [x] `is_neoschizomer(other)`
- [x] `isoschizomers(batch=None)`
- [-] `mro(self, /)`
- [x] `neoschizomers(batch=None)`
- [x] `overhang()`
- [x] `search(dna, linear=True)`

### Bio.Restriction.Ov5

- [x] `__add__(cls, other)`
- [x] `__eq__(cls, other)`
- [x] `__ge__(cls, other)`
- [x] `__gt__(cls, other)`
- [-] `__hash__(cls)`
- [x] `__init__(cls, name='', bases=(), dct=None)`
- [x] `__le__(cls, other)`
- [x] `__len__(cls)`
- [x] `__lt__(cls, other)`
- [x] `__mod__(cls, other)`
- [x] `__repr__(cls)`
- [x] `__str__(cls)`
- [~] `all_suppliers()`
- [x] `catalyse(dna, linear=True)`
- [x] `catalyze(dna, linear=True)`
- [x] `compatible_end(batch=None)`
- [x] `equischizomers(batch=None)`
- [x] `frequency()`
- [x] `is_3overhang()`
- [x] `is_5overhang()`
- [x] `is_blunt()`
- [x] `is_equischizomer(other)`
- [x] `is_isoschizomer(other)`
- [x] `is_neoschizomer(other)`
- [x] `isoschizomers(batch=None)`
- [-] `mro(self, /)`
- [x] `neoschizomers(batch=None)`
- [x] `overhang()`
- [x] `search(dna, linear=True)`

### Bio.Restriction.Ov3

- [x] `__add__(cls, other)`
- [x] `__eq__(cls, other)`
- [x] `__ge__(cls, other)`
- [x] `__gt__(cls, other)`
- [-] `__hash__(cls)`
- [x] `__init__(cls, name='', bases=(), dct=None)`
- [x] `__le__(cls, other)`
- [x] `__len__(cls)`
- [x] `__lt__(cls, other)`
- [x] `__mod__(cls, other)`
- [x] `__repr__(cls)`
- [x] `__str__(cls)`
- [~] `all_suppliers()`
- [x] `catalyse(dna, linear=True)`
- [x] `catalyze(dna, linear=True)`
- [x] `compatible_end(batch=None)`
- [x] `equischizomers(batch=None)`
- [x] `frequency()`
- [x] `is_3overhang()`
- [x] `is_5overhang()`
- [x] `is_blunt()`
- [x] `is_equischizomer(other)`
- [x] `is_isoschizomer(other)`
- [x] `is_neoschizomer(other)`
- [x] `isoschizomers(batch=None)`
- [-] `mro(self, /)`
- [x] `neoschizomers(batch=None)`
- [x] `overhang()`
- [x] `search(dna, linear=True)`

### Bio.Restriction.Defined

- [x] `__add__(cls, other)`
- [x] `__eq__(cls, other)`
- [x] `__ge__(cls, other)`
- [x] `__gt__(cls, other)`
- [-] `__hash__(cls)`
- [x] `__init__(cls, name='', bases=(), dct=None)`
- [x] `__le__(cls, other)`
- [x] `__len__(cls)`
- [x] `__lt__(cls, other)`
- [x] `__mod__(cls, other)`
- [x] `__repr__(cls)`
- [x] `__str__(cls)`
- [~] `all_suppliers()`
- [x] `elucidate()`
- [x] `equischizomers(batch=None)`
- [x] `frequency()`
- [x] `is_ambiguous()`
- [x] `is_defined()`
- [x] `is_equischizomer(other)`
- [x] `is_isoschizomer(other)`
- [x] `is_neoschizomer(other)`
- [x] `is_unknown()`
- [x] `isoschizomers(batch=None)`
- [-] `mro(self, /)`
- [x] `neoschizomers(batch=None)`
- [x] `search(dna, linear=True)`

### Bio.Restriction.Ambiguous

- [x] `__add__(cls, other)`
- [x] `__eq__(cls, other)`
- [x] `__ge__(cls, other)`
- [x] `__gt__(cls, other)`
- [-] `__hash__(cls)`
- [x] `__init__(cls, name='', bases=(), dct=None)`
- [x] `__le__(cls, other)`
- [x] `__len__(cls)`
- [x] `__lt__(cls, other)`
- [x] `__mod__(cls, other)`
- [x] `__repr__(cls)`
- [x] `__str__(cls)`
- [~] `all_suppliers()`
- [x] `elucidate()`
- [x] `equischizomers(batch=None)`
- [x] `frequency()`
- [x] `is_ambiguous()`
- [x] `is_defined()`
- [x] `is_equischizomer(other)`
- [x] `is_isoschizomer(other)`
- [x] `is_neoschizomer(other)`
- [x] `is_unknown()`
- [x] `isoschizomers(batch=None)`
- [-] `mro(self, /)`
- [x] `neoschizomers(batch=None)`
- [x] `search(dna, linear=True)`

### Bio.Restriction.NotDefined

- [x] `__add__(cls, other)`
- [x] `__eq__(cls, other)`
- [x] `__ge__(cls, other)`
- [x] `__gt__(cls, other)`
- [-] `__hash__(cls)`
- [x] `__init__(cls, name='', bases=(), dct=None)`
- [x] `__le__(cls, other)`
- [x] `__len__(cls)`
- [x] `__lt__(cls, other)`
- [x] `__mod__(cls, other)`
- [x] `__repr__(cls)`
- [x] `__str__(cls)`
- [~] `all_suppliers()`
- [x] `elucidate()`
- [x] `equischizomers(batch=None)`
- [x] `frequency()`
- [x] `is_ambiguous()`
- [x] `is_defined()`
- [x] `is_equischizomer(other)`
- [x] `is_isoschizomer(other)`
- [x] `is_neoschizomer(other)`
- [x] `is_unknown()`
- [x] `isoschizomers(batch=None)`
- [-] `mro(self, /)`
- [x] `neoschizomers(batch=None)`
- [x] `search(dna, linear=True)`

### Bio.Restriction.Commercially_available

- [x] `__add__(cls, other)`
- [x] `__eq__(cls, other)`
- [x] `__ge__(cls, other)`
- [x] `__gt__(cls, other)`
- [-] `__hash__(cls)`
- [x] `__init__(cls, name='', bases=(), dct=None)`
- [x] `__le__(cls, other)`
- [x] `__len__(cls)`
- [x] `__lt__(cls, other)`
- [x] `__mod__(cls, other)`
- [x] `__repr__(cls)`
- [x] `__str__(cls)`
- [~] `all_suppliers()`
- [x] `buffers(supplier)`
- [x] `equischizomers(batch=None)`
- [x] `frequency()`
- [x] `is_comm()`
- [x] `is_equischizomer(other)`
- [x] `is_isoschizomer(other)`
- [x] `is_neoschizomer(other)`
- [x] `isoschizomers(batch=None)`
- [-] `mro(self, /)`
- [x] `neoschizomers(batch=None)`
- [x] `search(dna, linear=True)`
- [x] `supplier_list()`
- [~] `suppliers()`

### Bio.Restriction.Not_available

- [x] `__add__(cls, other)`
- [x] `__eq__(cls, other)`
- [x] `__ge__(cls, other)`
- [x] `__gt__(cls, other)`
- [-] `__hash__(cls)`
- [x] `__init__(cls, name='', bases=(), dct=None)`
- [x] `__le__(cls, other)`
- [x] `__len__(cls)`
- [x] `__lt__(cls, other)`
- [x] `__mod__(cls, other)`
- [x] `__repr__(cls)`
- [x] `__str__(cls)`
- [~] `all_suppliers()`
- [x] `buffers(supplier)`
- [x] `equischizomers(batch=None)`
- [x] `frequency()`
- [x] `is_comm()`
- [x] `is_equischizomer(other)`
- [x] `is_isoschizomer(other)`
- [x] `is_neoschizomer(other)`
- [x] `isoschizomers(batch=None)`
- [-] `mro(self, /)`
- [x] `neoschizomers(batch=None)`
- [x] `search(dna, linear=True)`
- [x] `supplier_list()`
- [~] `suppliers()`

### Bio.Restriction.RestrictionBatch

- [x] `__add__(self, other)`
- [x] `__contains__(self, other)`
- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [x] `__iadd__(self, other)`
- [x] `__init__(self, first=(), suppliers=())`
- [-] `__iter__(self, /)`
- [-] `__le__(self, value, /)`
- [-] `__len__(self, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self)`
- [x] `__str__(self)`
- [x] `add(self, other)`
- [x] `add_nocheck(self, other)`
- [x] `add_supplier(self, letter)`
- [x] `as_string(self)`
- [-] `clear(self, /)`
- [-] `copy(self, /)`
- [x] `current_suppliers(self)`
- [-] `difference(self, /, *others)`
- [-] `difference_update(self, /, *others)`
- [-] `discard(self, object, /)`
- [x] `elements(self)`
- [x] `format(self, y)`
- [x] `get(self, enzyme, add=False)`
- [-] `intersection(self, /, *others)`
- [-] `intersection_update(self, /, *others)`
- [x] `is_restriction(self, y)`
- [-] `isdisjoint(self, other, /)`
- [-] `issubset(self, other, /)`
- [-] `issuperset(self, other, /)`
- [x] `lambdasplit(self, func)`
- [-] `pop(self, /)`
- [x] `remove(self, other)`
- [x] `search(self, dna, linear=True)`
- [~] `show_codes()`
- [x] `split(self, *classes, **bool)`
- [~] `suppl_codes()`
- [-] `symmetric_difference(self, other, /)`
- [-] `symmetric_difference_update(self, other, /)`
- [-] `union(self, /, *others)`
- [-] `update(self, /, *others)`

### Bio.Restriction.Analysis

- [~] `__add__(self, other)`
- [~] `__contains__(self, other)`
- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [~] `__iadd__(self, other)`
- [~] `__init__(self, restrictionbatch=RestrictionBatch([]), sequence=Seq(''), linear=True)`
- [-] `__iter__(self, /)`
- [-] `__le__(self, value, /)`
- [-] `__len__(self, /)`
- [-] `__lt__(self, value, /)`
- [~] `__repr__(self)`
- [~] `__str__(self)`
- [~] `add(self, other)`
- [~] `add_nocheck(self, other)`
- [~] `add_supplier(self, letter)`
- [~] `as_string(self)`
- [x] `between(self, start, end, dct=None)`
- [x] `blunt(self, dct=None)`
- [x] `change(self, **what)`
- [-] `clear(self, /)`
- [-] `copy(self, /)`
- [~] `current_suppliers(self)`
- [x] `defined(self, dct=None)`
- [-] `difference(self, /, *others)`
- [-] `difference_update(self, /, *others)`
- [-] `discard(self, object, /)`
- [x] `do_not_cut(self, start, end, dct=None)`
- [~] `elements(self)`
- [~] `format(self, y)`
- [x] `format_output(self, dct=None, title='', s1='')`
- [x] `full(self, linear=True)`
- [~] `get(self, enzyme, add=False)`
- [-] `intersection(self, /, *others)`
- [-] `intersection_update(self, /, *others)`
- [~] `is_restriction(self, y)`
- [-] `isdisjoint(self, other, /)`
- [-] `issubset(self, other, /)`
- [-] `issuperset(self, other, /)`
- [~] `lambdasplit(self, func)`
- [x] `make_format(self, cut=(), title='', nc=(), s1='')`
- [x] `only_between(self, start, end, dct=None)`
- [x] `only_outside(self, start, end, dct=None)`
- [x] `outside(self, start, end, dct=None)`
- [x] `overhang3(self, dct=None)`
- [x] `overhang5(self, dct=None)`
- [-] `pop(self, /)`
- [x] `print_as(self, what='list')`
- [~] `print_that(self, dct=None, title='', s1='')`
- [~] `remove(self, other)`
- [~] `search(self, dna, linear=True)`
- [~] `show_codes()`
- [x] `show_only_between(self, start, end, dct=None)`
- [~] `split(self, *classes, **bool)`
- [~] `suppl_codes()`
- [-] `symmetric_difference(self, other, /)`
- [-] `symmetric_difference_update(self, other, /)`
- [-] `union(self, /, *others)`
- [-] `update(self, /, *others)`
- [x] `with_N_sites(self, N, dct=None)`
- [x] `with_name(self, names, dct=None)`
- [x] `with_number_list(self, list, dct=None)`
- [x] `with_site_size(self, site_size, dct=None)`
- [x] `with_sites(self, dct=None)`
- [x] `without_site(self, dct=None)`

### Bio.Restriction.PrintFormat

- [ ] `__eq__(self, value, /)`
- [ ] `__ge__(self, value, /)`
- [ ] `__gt__(self, value, /)`
- [ ] `__hash__(self, /)`
- [-] `__init__(self, /, *args, **kwargs)`
- [ ] `__le__(self, value, /)`
- [ ] `__lt__(self, value, /)`
- [-] `__repr__(self, /)`
- [ ] `__str__(self, /)`
- [x] `format_output(self, dct, title='', s1='')`
- [x] `make_format(self, cut=(), title='', nc=(), s1='')`
- [x] `print_as(self, what='list')`
- [~] `print_that(self, dct, title='', s1='')`
