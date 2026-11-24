"""Profile one converged fit (default config) at an origin."""
# Paths are relative to the repository (research/optimisation_lab/lab2 -> lab.py one level up). CELERIS_OUTPUTS
# points at another outputs/ tree; CELERIS_LAB_SNAPSHOT at the first submission's outputs, kept with the lab's working
# files (not included in the repository).
import os as _os
from pathlib import Path as _Path
LAB2_DIR = _Path(__file__).resolve().parent
LAB_DIR = LAB2_DIR.parent
REPO = LAB_DIR.parents[1]
OUT = _os.environ.get("CELERIS_OUTPUTS", str(REPO / "outputs"))
SNAP = _os.environ.get("CELERIS_LAB_SNAPSHOT", str(REPO / "research" / "scratch" / "snap"))
import cProfile, pstats, sys
sys.path.insert(0, str(LAB_DIR))
import lab
from celeris.models.structural import StructuralConfig, fit_structural
o = int(sys.argv[1])
ctx = lab.context(o)
pr = cProfile.Profile(); pr.enable()
f = fit_structural(lab.inputs(), ctx, StructuralConfig())
pr.disable()
print("iterations", len(f.trace))
pstats.Stats(pr).sort_stats("cumulative").print_stats(28)
