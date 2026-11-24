"""Named structural configurations of the optimisation round."""
from dataclasses import replace
from celeris.models.structural import StructuralConfig

B = StructuralConfig()
CONV_MACRO = replace(B.macro, switch_margin=2.0, cap_iter=20, cap_line_search=True, cap_smooth=0.05)
CONV = replace(B, n_iter=40, tol=1e-6, ev_profile=True, holiday_profile=True, macro=CONV_MACRO)
V = {
    "base": B,
    "conv": CONV,
    "conv_plainev": replace(CONV, ev_profile=False, holiday_profile=False, n_iter=80),
}
V["conv_m5"] = replace(CONV, macro=replace(CONV_MACRO, switch_margin=5.0))
V["conv_m0.5"] = replace(CONV, macro=replace(CONV_MACRO, switch_margin=0.5))
V["conv_bma"] = CONV  # evalv.py patches the macro stage with lab/bma2.py (driver-set averaging) for names containing "bma"
