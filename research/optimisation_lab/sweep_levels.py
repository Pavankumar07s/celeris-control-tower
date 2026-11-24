import sys
import numpy as np, pandas as pd
import lab, levels
pd.set_option("display.width", 220)

def by_cycle(windows):
    def f(ctx, fit):
        kind = ctx.state.cycles.series["cycle_kind"].to_numpy(dtype=object)
        out = np.full(len(kind), 24.0)
        for k, w in windows.items():
            out[kind == k] = w
        return out
    return f

def by_size(small_w, cut=25.0, big_w=24.0):
    def f(ctx, fit):
        lvl = np.nan_to_num(fit.level[: ctx.state.panel.n_series])
        return np.where(lvl < cut, small_w, big_w)
    return f

V = {
    "base": None,
    "default_repro": {},
    "tau12": {"tau": 12}, "tau18": {"tau": 18}, "tau24": {"tau": 24}, "tau36": {"tau": 36},
    "tau18_cap36": {"tau": 18, "tau_cap": 36}, "tau24_cap36": {"tau": 24, "tau_cap": 36}, "tau24_cap48": {"tau": 24, "tau_cap": 48},
    "QB36": {"class_window": by_cycle({"Q": 36, "B": 36})}, "QB48": {"class_window": by_cycle({"Q": 48, "B": 48})},
    "Q36": {"class_window": by_cycle({"Q": 36})}, "Q48": {"class_window": by_cycle({"Q": 48})},
    "QBT36": {"class_window": by_cycle({"Q": 36, "B": 36, "T": 36})},
    "small36": {"class_window": by_size(36)}, "small48": {"class_window": by_size(48)},
    "prec_nb": {"precision": (1.4, 0.065)}, "prec_nb2": {"precision": (1.0, 0.07)},
    "shrink1": {"shrink_k": 1.0}, "shrink3": {"shrink_k": 3.0},
    "size_g0.01": {"size_gamma": 0.01}, "size_g0.02": {"size_gamma": 0.02}, "size_g0.03": {"size_gamma": 0.03},
}
origins = tuple(int(x) for x in sys.argv[1:]) or lab.DECISION
df = levels.evaluate(origins, V)
df.to_csv(lab.LAB / ("sweep_levels_" + "_".join(map(str, origins)) + ".csv"), index=False)
print(levels.report(df).round(5).to_string())
