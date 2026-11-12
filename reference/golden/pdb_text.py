"""Random PDB (and PQR) file text shared by the Bio.PDB golden generators."""

ATOMS = [(" N  ", "N"), (" CA ", "C"), (" C  ", "C"), (" O  ", "O"), (" CB ", "C"), (" SG ", "S"), ("ZN  ", "ZN"), ("HG21", "H"), ("1HB ", "H"), (" OD1", "O"), (" O5'", "O"), ("FE  ", "FE"), ("CL  ", "CL")]
RESN = ["ALA", "GLY", "SER", "LEU", "MET", "CYS", "HOH", "ZN", "NAG", "HEM", "A", "DT"]
HET = {"HOH", "ZN", "NAG", "HEM"}

def pdb_line(rec, serial, fullname, alt, resname, chain, seq, icode, xyz, occ, b, segid, elem, pqr):
    head = "%-6s%5d %s%s%3s %s%4d%s   %8.3f%8.3f%8.3f" % (rec, serial, fullname, alt, resname, chain, seq, icode, *xyz)
    if pqr: return head + "%8.4f%8.4f" % (occ, b) + "\n"
    return head + "%6.2f%6.2f      %-4s%2s\n" % (occ, b, segid, elem)

def gen_pdb(rnd, pqr=False):
    lines = []
    nmodels = rnd.choice([1, 1, 1, 2, 3])
    for m in range(nmodels):
        if nmodels > 1 or rnd.random() < 0.1: lines.append("MODEL     %4d\n" % (m + 1))
        serial = 1
        for chain in rnd.sample(["A", "B", "C", "H", " ", "1"], rnd.randint(1, 3)):
            seq = rnd.choice([1, 1, 5, 9990, -3])
            for _ in range(rnd.randint(1, 4)):
                resname = rnd.choice(RESN)
                rec = "HETATM" if resname in HET else "ATOM"
                icode = rnd.choice([" ", " ", " ", "A"])
                alts = [" "] if rnd.random() < 0.8 else [" ", "A", "B"]
                for fullname, elem in rnd.sample(ATOMS, rnd.randint(1, 5)):
                    for alt in (alts if rnd.random() < 0.3 else alts[:1]):
                        xyz = [rnd.uniform(-90, 90) for _ in range(3)]
                        if rnd.random() < 0.05: xyz[0] = rnd.choice([0.0005, 0.0625, -0.0005, 1234.5675])
                        occ = rnd.choice([1.0, 0.5, 0.33, 0.0])
                        b = rnd.choice([rnd.uniform(0, 99), rnd.uniform(0, 99), 999.99, 0.0, 12.5]) if not pqr else rnd.uniform(0.5, 2.5)
                        occ_or_charge = occ if not pqr else rnd.uniform(-1, 1)
                        lines.append(pdb_line(rec, serial, fullname, alt, resname, chain, seq, icode, xyz, occ_or_charge, b,
                                              rnd.choice(["    ", "SEG1", "S"]), elem if rnd.random() > 0.05 else rnd.choice(["", "XX", "X", "Q", "zn", "Fe"]), pqr))
                        serial += 1
                seq += rnd.choice([1, 1, 2])
        if nmodels > 1 or lines[0].startswith("MODEL"): lines.append("ENDMDL\n")
    if rnd.random() < 0.3: lines.append("END\n")
    return "".join(lines)

