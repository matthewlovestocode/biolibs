## pydna.utils

- [x] `create_location(start: int, end: int, lim: int, strand: int | None = None) -> Bio.SeqFeature.Location`
- [x] `cuts_overlap(left_cut, right_cut, seq_len)`
- [x] `cutsite_to_location(cutsite: Tuple[Tuple[int, int], Bio.Restriction.Restriction.AbstractCut | None | pydna.crispr._cas] | None, seq_len: int) -> Bio.SeqFeature.Location | None`
- [x] `deduplicate(iterable, hashable=True)`
- [x] `flatten(*args) -> List`
- [x] `identifier_from_string(s: str) -> str`
- [x] `limit_iterator(iterator, limit)`
- [x] `location_boundaries(loc: Bio.SeqFeature.SimpleLocation | Bio.SeqFeature.CompoundLocation)`
- [x] `location_overlap(loc1: Bio.SeqFeature.SimpleLocation | Bio.SeqFeature.CompoundLocation, loc2: Bio.SeqFeature.SimpleLocation | Bio.SeqFeature.CompoundLocation, seq_len) -> pydna.utils.LocationOverlap`
- [x] `locations_overlap(loc1: Bio.SeqFeature.SimpleLocation | Bio.SeqFeature.CompoundLocation, loc2: Bio.SeqFeature.SimpleLocation | Bio.SeqFeature.CompoundLocation, seq_len) -> bool`
- [x] `shift_feature(feature, shift, lim)`
- [x] `shift_location(original_location, shift, lim)`
- [x] `sum_is_sticky(three_prime_end: tuple[str, str], five_prime_end: tuple[str, str], partial: bool = False) -> int`
