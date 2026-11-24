"""Profile one converged fit (default config) at an origin."""
import cProfile, pstats, sys
sys.path.insert(0, "/tmp/claude-1000/-home-pavan-Desktop-mks/6e1cc0fc-f52b-4777-9b57-6e118178c7b1/scratchpad/lab")
import lab
from celeris.models.structural import StructuralConfig, fit_structural
o = int(sys.argv[1])
ctx = lab.context(o)
pr = cProfile.Profile(); pr.enable()
f = fit_structural(lab.inputs(), ctx, StructuralConfig())
pr.disable()
print("iterations", len(f.trace))
pstats.Stats(pr).sort_stats("cumulative").print_stats(28)
