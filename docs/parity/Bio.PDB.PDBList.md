## Bio.PDB.PDBList


### Bio.PDB.PDBList.PDBList

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, server='https://files.wwpdb.org', pdb=None, obsolete_pdb=None, verbose=True)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [-] `__repr__(self, /)`
- [-] `__str__(self, /)`
- [-] `download_all_assemblies(self, listfile: str | None = None, file_format: str | None = None, max_num_threads: int | None = None)`
- [-] `download_entire_pdb(self, listfile: str | None = None, file_format: str | None = None, max_num_threads: int | None = None)`
- [-] `download_obsolete_entries(self, listfile: str | None = None, file_format: str | None = None, max_num_threads: int | None = None)`
- [-] `download_pdb_files(self, pdb_codes: list[str], obsolete: bool = False, pdir: str | None = None, file_format: str | None = None, overwrite: bool = False, max_num_threads: int | None = None)`
- [x] `get_all_assemblies(self, file_format: str = '') -> list[tuple[str, str]]`
- [x] `get_all_entries(self)`
- [x] `get_all_obsolete(self)`
- [x] `get_recent_changes(self)`
- [x] `get_seqres_file(self, savefile='pdb_seqres.txt')`
- [x] `get_status_list(url)`
- [x] `retrieve_assembly_file(self, pdb_code, assembly_num, pdir=None, file_format=None, overwrite=False)`
- [x] `retrieve_pdb_file(self, pdb_code, obsolete=False, pdir=None, file_format=None, overwrite=False)`
- [-] `update_pdb(self, file_format=None, with_assemblies=False)`
