## Bio.Phylo.TreeConstruction


### Bio.Phylo.TreeConstruction.DistanceMatrix

- [x] `__delitem__(self, item)`
- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [x] `__getitem__(self, item)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, names, matrix=None)`
- [-] `__le__(self, value, /)`
- [x] `__len__(self)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self)`
- [x] `__setitem__(self, item, value)`
- [x] `__str__(self)`
- [x] `format_phylip(self, handle)`
- [x] `insert(self, name, value, index=None)`

### Bio.Phylo.TreeConstruction.DistanceCalculator

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, model='identity', skip_letters=None)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self, /)`
- [x] `__str__(self, /)`
- [x] `get_distance(self, msa)`

### Bio.Phylo.TreeConstruction.TreeConstructor

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, /, *args, **kwargs)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self, /)`
- [x] `__str__(self, /)`
- [x] `build_tree(self, msa)`

### Bio.Phylo.TreeConstruction.DistanceTreeConstructor

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, distance_calculator=None, method='nj')`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self, /)`
- [x] `__str__(self, /)`
- [x] `build_tree(self, msa)`
- [x] `nj(self, distance_matrix)`
- [x] `upgma(self, distance_matrix)`

### Bio.Phylo.TreeConstruction.Scorer

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, /, *args, **kwargs)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self, /)`
- [x] `__str__(self, /)`
- [x] `get_score(self, tree, alignment)`

### Bio.Phylo.TreeConstruction.TreeSearcher

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, /, *args, **kwargs)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self, /)`
- [x] `__str__(self, /)`
- [x] `search(self, starting_tree, alignment)`

### Bio.Phylo.TreeConstruction.NNITreeSearcher

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, scorer)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self, /)`
- [x] `__str__(self, /)`
- [x] `search(self, starting_tree, alignment)`

### Bio.Phylo.TreeConstruction.ParsimonyScorer

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, matrix=None)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self, /)`
- [x] `__str__(self, /)`
- [x] `get_score(self, tree, alignment)`

### Bio.Phylo.TreeConstruction.ParsimonyTreeConstructor

- [-] `__eq__(self, value, /)`
- [-] `__ge__(self, value, /)`
- [-] `__gt__(self, value, /)`
- [-] `__hash__(self, /)`
- [x] `__init__(self, searcher, starting_tree=None)`
- [-] `__le__(self, value, /)`
- [-] `__lt__(self, value, /)`
- [x] `__repr__(self, /)`
- [x] `__str__(self, /)`
- [x] `build_tree(self, alignment)`
