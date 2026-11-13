## Bio.SeqUtils.MeltingTemp

- [x] `Tm_GC(seq, check=True, strict=True, valueset=7, userset=None, Na=50, K=0, Tris=0, Mg=0, dNTPs=0, saltcorr=0, mismatch=True)`
- [x] `Tm_NN(seq, check=True, strict=True, c_seq=None, shift=0, nn_table=None, tmm_table=None, imm_table=None, de_table=None, dnac1=25, dnac2=25, selfcomp=False, Na=50, K=0, Tris=0, Mg=0, dNTPs=0, saltcorr=5)`
- [x] `Tm_Wallace(seq, check=True, strict=True)`
- [x] `chem_correction(melting_temp, DMSO=0, fmd=0, DMSOfactor=0.75, fmdfactor=0.65, fmdmethod=1, GC=None)`
- [x] `make_table(oldtable=None, values=None)`
- [x] `salt_correction(Na=0, K=0, Tris=0, Mg=0, dNTPs=0, method=1, seq=None)`
