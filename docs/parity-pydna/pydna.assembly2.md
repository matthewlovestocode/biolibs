## pydna.assembly2

- [x] `annotate_primer_binding_sites(input_dseqr: pydna.dseqrecord.Dseqrecord, fragments: list[pydna.dseqrecord.Dseqrecord]) -> pydna.dseqrecord.Dseqrecord`
- [x] `assemble(fragments: list[pydna.dseqrecord.Dseqrecord], assembly: list[typing.Tuple[int, int, ForwardRef('Location | None'), ForwardRef('Location | None')]], is_insertion: bool = False) -> pydna.dseqrecord.Dseqrecord`
- [x] `assembly2str(assembly: list[typing.Tuple[int, int, ForwardRef('Location | None'), ForwardRef('Location | None')]]) -> str`
- [x] `assembly2str_tuple(assembly: list[typing.Tuple[int, int, ForwardRef('Location | None'), ForwardRef('Location | None')]]) -> str`
- [x] `assembly_has_mismatches(fragments: list[pydna.dseqrecord.Dseqrecord], assembly: list[typing.Tuple[int, int, ForwardRef('Location | None'), ForwardRef('Location | None')]]) -> bool`
- [x] `assembly_is_circular(assembly: list[typing.Tuple[int, int, ForwardRef('Location | None'), ForwardRef('Location | None')]], fragments: list[pydna.dseqrecord.Dseqrecord]) -> bool`
- [ ] `assembly_is_multi_site(asm: list[list[typing.Tuple[int, int, ForwardRef('Location | None'), ForwardRef('Location | None')]]]) -> bool`
- [x] `blunt_overlap(seqx: pydna.dseqrecord.Dseqrecord, seqy: pydna.dseqrecord.Dseqrecord, limit=None) -> list[typing.Tuple[int, int, int]]`
- [x] `circular_permutation_min_abs(lst: list) -> list`
- [x] `combine_algorithms(*algorithms: Callable[[ForwardRef('Dseqrecord'), ForwardRef('Dseqrecord'), int], list[Tuple[int, int, int]]]) -> Callable[[ForwardRef('Dseqrecord'), ForwardRef('Dseqrecord'), int], list[Tuple[int, int, int]]]`
- [x] `common_function_assembly_products(frags: list[pydna.dseqrecord.Dseqrecord], limit: int | None, algorithm: Callable, circular_only: bool, filter_results_function: Callable | None = None, only_adjacent_edges: bool = False) -> list[pydna.dseqrecord.Dseqrecord]`
- [ ] `common_function_excision_or_inversion_products(genome: pydna.dseqrecord.Dseqrecord, limit: int | None, algorithm: Callable) -> list[pydna.dseqrecord.Dseqrecord]`
- [ ] `common_function_integration_products(frags: list[pydna.dseqrecord.Dseqrecord], limit: int | None, algorithm: Callable) -> list[pydna.dseqrecord.Dseqrecord]`
- [ ] `common_handle_insertion_fragments(genome: pydna.dseqrecord.Dseqrecord, inserts: list[pydna.dseqrecord.Dseqrecord]) -> list[pydna.dseqrecord.Dseqrecord]`
- [x] `common_sub_strings(seqx: pydna.dseqrecord.Dseqrecord, seqy: pydna.dseqrecord.Dseqrecord, limit=25) -> list[typing.Tuple[int, int, int]]`
- [ ] `cre_lox_excision(genome: pydna.dseqrecord.Dseqrecord) -> list[pydna.dseqrecord.Dseqrecord]`
- [ ] `cre_lox_excision_or_inversion(genome: pydna.dseqrecord.Dseqrecord) -> list[pydna.dseqrecord.Dseqrecord]`
- [ ] `cre_lox_integration(genome: pydna.dseqrecord.Dseqrecord, inserts: list[pydna.dseqrecord.Dseqrecord]) -> list[pydna.dseqrecord.Dseqrecord]`
- [ ] `crispr_integration(genome: pydna.dseqrecord.Dseqrecord, inserts: list[pydna.dseqrecord.Dseqrecord], guides: list[pydna.primer.Primer], limit: int = 40) -> list[pydna.dseqrecord.Dseqrecord]`
- [x] `edge_representation2subfragment_representation(assembly: list[typing.Tuple[int, int, ForwardRef('Location | None'), ForwardRef('Location | None')]], is_circular: bool) -> list[typing.Tuple[int, ForwardRef('Location | None'), ForwardRef('Location | None')]]`
- [x] `ends_from_cutsite(cutsite: Tuple[Tuple[int, int], Bio.Restriction.Restriction.AbstractCut | None | pydna.crispr._cas], seq: pydna.dseq.Dseq) -> tuple[tuple[str, str], tuple[str, str]]`
- [x] `extract_subfragment(seq: pydna.dseqrecord.Dseqrecord, start_location: Bio.SeqFeature.Location | None, end_location: Bio.SeqFeature.Location | None) -> pydna.dseqrecord.Dseqrecord`
- [x] `filter_linear_subassemblies(linear_assemblies: list[list[typing.Tuple[int, int, ForwardRef('Location | None'), ForwardRef('Location | None')]]], circular_assemblies: list[list[typing.Tuple[int, int, ForwardRef('Location | None'), ForwardRef('Location | None')]]], fragments: list[pydna.dseqrecord.Dseqrecord]) -> list[list[typing.Tuple[int, int, ForwardRef('Location | None'), ForwardRef('Location | None')]]]`
- [x] `fusion_pcr_assembly(frags: list[pydna.dseqrecord.Dseqrecord], limit: int = 25, circular_only: bool = False) -> list[pydna.dseqrecord.Dseqrecord]`
- [ ] `gateway_assembly(frags: list[pydna.dseqrecord.Dseqrecord], reaction_type: Literal['BP', 'LR'], greedy: bool = False, circular_only: bool = False, multi_site_only: bool = False) -> list[pydna.dseqrecord.Dseqrecord]`
- [x] `gather_overlapping_locations(locs: list[Bio.SeqFeature.Location], fragment_length: int) -> list[tuple[Bio.SeqFeature.Location, ...]]`
- [x] `get_assembly_subfragments(fragments: list[pydna.dseqrecord.Dseqrecord], subfragment_representation: list[typing.Tuple[int, ForwardRef('Location | None'), ForwardRef('Location | None')]]) -> list[pydna.dseqrecord.Dseqrecord]`
- [x] `gibson_assembly(frags: list[pydna.dseqrecord.Dseqrecord], limit: int = 25, circular_only: bool = False) -> list[pydna.dseqrecord.Dseqrecord]`
- [x] `gibson_overlap(seqx: pydna.dseqrecord.Dseqrecord, seqy: pydna.dseqrecord.Dseqrecord, limit=25)`
- [x] `golden_gate_assembly(frags: list[pydna.dseqrecord.Dseqrecord], enzymes: list['AbstractCut'], allow_blunt: bool = True, circular_only: bool = False) -> list[pydna.dseqrecord.Dseqrecord]`
- [ ] `homologous_recombination_excision(genome: pydna.dseqrecord.Dseqrecord, limit: int = 40) -> list[pydna.dseqrecord.Dseqrecord]`
- [ ] `homologous_recombination_excision_or_inversion(genome: pydna.dseqrecord.Dseqrecord, limit: int = 40) -> list[pydna.dseqrecord.Dseqrecord]`
- [ ] `homologous_recombination_integration(genome: pydna.dseqrecord.Dseqrecord, inserts: list[pydna.dseqrecord.Dseqrecord], limit: int = 40) -> list[pydna.dseqrecord.Dseqrecord]`
- [x] `in_fusion_assembly(frags: list[pydna.dseqrecord.Dseqrecord], limit: int = 25, circular_only: bool = False) -> list[pydna.dseqrecord.Dseqrecord]`
- [x] `in_fusion_overlap(seqx: pydna.dseqrecord.Dseqrecord, seqy: pydna.dseqrecord.Dseqrecord, limit=25)`
- [x] `in_vivo_assembly(frags: list[pydna.dseqrecord.Dseqrecord], limit: int = 25, circular_only: bool = False) -> list[pydna.dseqrecord.Dseqrecord]`
- [x] `is_sublist(sublist: list, my_list: list, my_list_is_cyclic: bool = False) -> bool`
- [x] `ligation_assembly(frags: list[pydna.dseqrecord.Dseqrecord], allow_blunt: bool = False, allow_partial_overlap: bool = False, circular_only: bool = False) -> list[pydna.dseqrecord.Dseqrecord]`
- [x] `partially_digested_seqs_in_restriction_ligation_assembly(product: pydna.dseqrecord.Dseqrecord) -> list[pydna.dseqrecord.Dseqrecord]`
- [x] `pcr_assembly(template: pydna.dseqrecord.Dseqrecord, fwd_primer: pydna.primer.Primer, rvs_primer: pydna.primer.Primer, add_primer_features: bool = False, limit: int = 14, mismatches: int = 0) -> list[pydna.dseqrecord.Dseqrecord]`
- [x] `pcr_fusion_overlap(seqx: pydna.dseqrecord.Dseqrecord, seqy: pydna.dseqrecord.Dseqrecord, limit=25)`
- [x] `primer_template_overlap(seqx: pydna.dseqrecord.Dseqrecord | pydna.primer.Primer, seqy: pydna.dseqrecord.Dseqrecord | pydna.primer.Primer, limit=25, mismatches=0) -> list[typing.Tuple[int, int, int]]`
- [ ] `recombinase_assembly(frags: list[pydna.dseqrecord.Dseqrecord], recombinase: pydna.recombinase.Recombinase | pydna.recombinase.RecombinaseCollection, circular_only: bool = False) -> list[pydna.dseqrecord.Dseqrecord]`
- [ ] `recombinase_excision(genome: pydna.dseqrecord.Dseqrecord, recombinase: pydna.recombinase.Recombinase | pydna.recombinase.RecombinaseCollection) -> list[pydna.dseqrecord.Dseqrecord]`
- [ ] `recombinase_excision_or_inversion(genome: pydna.dseqrecord.Dseqrecord, recombinase: pydna.recombinase.Recombinase | pydna.recombinase.RecombinaseCollection) -> list[pydna.dseqrecord.Dseqrecord]`
- [ ] `recombinase_integration(genome: pydna.dseqrecord.Dseqrecord, inserts: list[pydna.dseqrecord.Dseqrecord], recombinase: pydna.recombinase.Recombinase | pydna.recombinase.RecombinaseCollection) -> list[pydna.dseqrecord.Dseqrecord]`
- [x] `remove_subassemblies(assemblies: list[list[typing.Tuple[int, int, ForwardRef('Location | None'), ForwardRef('Location | None')]]]) -> list[list[typing.Tuple[int, int, ForwardRef('Location | None'), ForwardRef('Location | None')]]]`
- [x] `restriction_ligation_assembly(frags: list[pydna.dseqrecord.Dseqrecord], enzymes: list['AbstractCut'], allow_blunt: bool = True, circular_only: bool = False) -> list[pydna.dseqrecord.Dseqrecord]`
- [x] `restriction_ligation_overlap(seqx: pydna.dseqrecord.Dseqrecord, seqy: pydna.dseqrecord.Dseqrecord, enzymes=<class 'Bio.Restriction.Restriction.RestrictionBatch'>, partial=False, allow_blunt=False) -> list[typing.Tuple[int, int, int]]`
- [x] `reverse_complement_assembly(assembly: list[typing.Tuple[int, int, ForwardRef('Location | None'), ForwardRef('Location | None')]], fragments: list[pydna.dseqrecord.Dseqrecord]) -> list[typing.Tuple[int, int, ForwardRef('Location | None'), ForwardRef('Location | None')]]`
- [x] `seqrecord2_uppercase_DNA_string(seqr: pydna.seqrecord.SeqRecord) -> str`
- [x] `sticky_end_sub_strings(seqx: pydna.dseqrecord.Dseqrecord, seqy: pydna.dseqrecord.Dseqrecord, limit: bool = False)`
- [x] `subfragment_representation2edge_representation(assembly: list[typing.Tuple[int, ForwardRef('Location | None'), ForwardRef('Location | None')]], is_circular: bool) -> list[typing.Tuple[int, int, ForwardRef('Location | None'), ForwardRef('Location | None')]]`
- [x] `terminal_overlap(seqx: pydna.dseqrecord.Dseqrecord, seqy: pydna.dseqrecord.Dseqrecord, limit=25, trim_ends: None | str = None)`
- [x] `zip_match_leftwards(seqx: pydna.seqrecord.SeqRecord, seqy: pydna.seqrecord.SeqRecord, match: Tuple[int, int, int]) -> Tuple[int, int, int]`
- [x] `zip_match_rightwards(seqx: pydna.dseqrecord.Dseqrecord, seqy: pydna.dseqrecord.Dseqrecord, match: Tuple[int, int, int]) -> Tuple[int, int, int]`

### pydna.assembly2.Assembly

- [x] `__init__(self, frags: list[pydna.dseqrecord.Dseqrecord], limit: int = 25, algorithm: Callable[[ForwardRef('Dseqrecord'), ForwardRef('Dseqrecord'), int], list[Tuple[int, int, int]]] = <function common_sub_strings at 0x1094f1dd0>, use_fragment_order: bool = True, use_all_fragments: bool = False)`
- [x] `__repr__(self)`
- [x] `add_edges_from_match(self, match: Tuple[int, int, int], u: int, v: int, first: pydna.dseqrecord.Dseqrecord, secnd: pydna.dseqrecord.Dseqrecord)`
- [x] `assemble_circular(self, only_adjacent_edges: bool = False, max_assemblies: int = 50) -> list[pydna.dseqrecord.Dseqrecord]`
- [x] `assemble_insertion(self, only_adjacent_edges: bool = False) -> list[pydna.dseqrecord.Dseqrecord]`
- [x] `assemble_linear(self, only_adjacent_edges: bool = False, max_assemblies: int = 50) -> list[pydna.dseqrecord.Dseqrecord]`
- [x] `assembly_is_valid(cls, fragments: list[pydna.dseqrecord.Dseqrecord | pydna.primer.Primer], assembly: list[typing.Tuple[int, int, ForwardRef('Location | None'), ForwardRef('Location | None')]], is_circular: bool, use_all_fragments: bool, is_insertion: bool = False) -> bool`
- [x] `assembly_uses_only_adjacent_edges(self, assembly, is_circular: bool) -> bool`
- [x] `format_assembly_edge(self, graph_edge: tuple[int, int, str]) -> Tuple[int, int, ForwardRef('Location | None'), ForwardRef('Location | None')]`
- [x] `format_insertion_assembly(self, assembly: list[typing.Tuple[int, int, ForwardRef('Location | None'), ForwardRef('Location | None')]]) -> list[Tuple[int, int, ForwardRef('Location | None'), ForwardRef('Location | None')]] | None`
- [x] `format_insertion_assembly_edge_case(self, assembly: list[typing.Tuple[int, int, ForwardRef('Location | None'), ForwardRef('Location | None')]]) -> list[typing.Tuple[int, int, ForwardRef('Location | None'), ForwardRef('Location | None')]]`
- [x] `get_circular_assemblies(self, only_adjacent_edges: bool = False, max_assemblies: int = 50) -> list[list[typing.Tuple[int, int, ForwardRef('Location | None'), ForwardRef('Location | None')]]]`
- [x] `get_insertion_assemblies(self, only_adjacent_edges: bool = False, max_assemblies: int = 50) -> list[list[typing.Tuple[int, int, ForwardRef('Location | None'), ForwardRef('Location | None')]]]`
- [x] `get_linear_assemblies(self, only_adjacent_edges: bool = False, max_assemblies: int = 50) -> list[list[typing.Tuple[int, int, ForwardRef('Location | None'), ForwardRef('Location | None')]]]`
- [x] `get_locations_on_fragments(self) -> dict[int, dict[str, list[Bio.SeqFeature.Location]]]`
- [x] `get_possible_assembly_number(self, paths: list[list[int]]) -> int`
- [x] `get_unique_linear_paths(self, G_with_begin_end: networkx.classes.multidigraph.MultiDiGraph, max_paths=10000) -> list[list[int]]`
- [x] `node_path2assembly_list(self, cycle: list[int], circular: bool) -> list[list[typing.Tuple[int, int, ForwardRef('Location | None'), ForwardRef('Location | None')]]]`

### pydna.assembly2.PCRAssembly

- [x] `__init__(self, frags: list[pydna.dseqrecord.Dseqrecord | pydna.primer.Primer], limit=25, mismatches=0)`
- [x] `assemble_linear(self, only_adjacent_edges: bool = False, max_assemblies: int = 50) -> list[pydna.dseqrecord.Dseqrecord]`
- [x] `get_circular_assemblies(self, only_adjacent_edges: bool = False)`
- [x] `get_insertion_assemblies(self, only_adjacent_edges: bool = False)`
- [x] `get_linear_assemblies(self, only_adjacent_edges: bool = False, max_assemblies: int = 50) -> list[list[typing.Tuple[int, int, ForwardRef('Location | None'), ForwardRef('Location | None')]]]`

### pydna.assembly2.SingleFragmentAssembly

- [x] `__init__(self, frags: list[pydna.dseqrecord.Dseqrecord], limit=25, algorithm=<function common_sub_strings at 0x1094f1dd0>)`
- [x] `assemble_inversion(self, max_assemblies: int = 50) -> list[pydna.dseqrecord.Dseqrecord]`
- [x] `get_circular_assemblies(self, only_adjacent_edges: bool = False, max_assemblies: int = 50) -> list[list[typing.Tuple[int, int, ForwardRef('Location | None'), ForwardRef('Location | None')]]]`
- [x] `get_insertion_assemblies(self, only_adjacent_edges: bool = False, max_assemblies: int = 50) -> list[list[typing.Tuple[int, int, ForwardRef('Location | None'), ForwardRef('Location | None')]]]`
- [x] `get_inversion_assemblies(self, max_assemblies: int = 50) -> list[list[typing.Tuple[int, int, ForwardRef('Location | None'), ForwardRef('Location | None')]]]`
- [x] `get_linear_assemblies(self)`
