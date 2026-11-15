## pydna.opencloning_models

- [-] `get_id(obj: "'Primer' | 'Dseqrecord'") -> 'int'`
- [-] `id_mode(use_python_internal_id: 'bool' = True)`
- [x] `read_dseqrecord_from_text_file_sequence(seq: 'TextFileSequence') -> 'Dseqrecord'`

### pydna.opencloning_models.CloningStrategy

- [x] `primers`
- [x] `add_dseqrecord(self, dseqr: "'Dseqrecord'")`
- [x] `add_primer(self, primer: "'Primer'")`
- [x] `from_dseqrecords(cls, dseqrs: "list['Dseqrecord']", description: 'str' = '')`
- [x] `get_ids_of_sequences_that_are_inputs(self) -> 'list[int]'`
- [x] `get_ids_of_sequences_that_are_not_inputs(self) -> 'list[int]'`
- [-] `model_config`
- [x] `model_dump(self, *args, **kwargs)`
- [x] `model_dump_json(self, *args, **kwargs)`
- [x] `normalize(self) -> "'CloningStrategy'"`
- [x] `reassign_ids(self)`
- [x] `to_dseqrecords(self) -> "list['Dseqrecord']"`
- [x] `validate(self) -> 'None'`

### pydna.opencloning_models.Source

- [-] `TARGET_MODEL(*, id: int, type: Literal['Source'] = 'Source', output_name: str | None = None, database_id: int | None = None, input: list[opencloning_linkml.datamodel._models.SourceInput | opencloning_linkml.datamodel._models.AssemblyFragment] | None = <factory>) -> None`
- [x] `database_id`
- [x] `input`
- [x] `add_to_history_graph(self, history_graph: 'nx.DiGraph', seq: "'Dseqrecord'")`
- [ ] `figure(self, fig_type=None)`
- [x] `from_pydantic_model(cls, model: '_Source', sequences: "dict[int, 'Dseqrecord']", primers: "dict[int, 'Primer']") -> "'Source'"`
- [x] `history_string(self, seq: "'Dseqrecord'")`
- [-] `model_config`
- [x] `normalize(self, result: "'Dseqrecord'") -> "'Dseqrecord'"`
- [x] `serialize_input(self, input: 'list[Union[SourceInput, AssemblyFragment]]') -> 'list[_SourceInput | _AssemblyFragment]'`
- [x] `to_pydantic_model(self, seq_id: 'int')`
- [x] `to_unserialized_dict(self)`
- [x] `validate(self, result: "'Dseqrecord'") -> 'None'`

### pydna.opencloning_models.AssemblySource

- [-] `TARGET_MODEL(*, id: int, type: Literal['AssemblySource'] = 'AssemblySource', output_name: str | None = None, database_id: int | None = None, input: list[opencloning_linkml.datamodel._models.SourceInput | opencloning_linkml.datamodel._models.AssemblyFragment] | None = <factory>, circular: bool | None = None) -> None`
- [x] `circular`
- [x] `input`
- [ ] `figure(self, fig_type=None)`
- [x] `from_subfragment_representation(cls, assembly: 'SubFragmentRepresentationAssembly', fragments: "list['Dseqrecord']", is_circular: 'bool')`
- [-] `model_config`
- [x] `normalize(self, result: "'Dseqrecord'") -> "'Dseqrecord'"`
- [x] `validate(self, result: "'Dseqrecord'") -> 'None'`

### pydna.opencloning_models.TextFileSequence

- [x] `from_dseqrecord(cls, dseqr: "'Dseqrecord'")`
- [-] `model_config`

### pydna.opencloning_models.PrimerModel

- [x] `from_primer(cls, primer: "'Primer'")`
- [-] `model_config`

### pydna.opencloning_models.SourceInput

- [x] `sequence`
- [-] `model_config`
- [x] `to_pydantic_model(self) -> '_SourceInput'`

### pydna.opencloning_models.AssemblyFragment

- [x] `left_location`
- [x] `reverse_complemented`
- [x] `right_location`
- [x] `from_biopython_location(location: 'Location | None')`
- [-] `model_config`
- [x] `to_pydantic_model(self) -> '_AssemblyFragment'`

### pydna.opencloning_models.SequenceLocationStr

- [x] `field_validator(cls, v)`
- [x] `from_biopython_location(cls, location: 'Location')`
- [x] `from_start_and_end(cls, start: 'int', end: 'int', seq_len: 'int | None' = None, strand: 'int | None' = 1)`
- [ ] `get_ncbi_format_coordinates(self) -> 'str'`
- [x] `to_biopython_location(self) -> 'Location'`
