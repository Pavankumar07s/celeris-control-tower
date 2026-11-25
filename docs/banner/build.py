"""Builds docs/banner/banner.html from the pipeline's real series; render with headless Chrome (see render.sh)."""
import json, pathlib
here = pathlib.Path(__file__).parent
d = json.loads((here / "series.json").read_text())
H, F, P10, P90 = d["hist"], d["f"], d["p10"], d["p90"]
n = len(H) + len(F)
W, Ht, X0, Y0 = 640, 290, 16, 20          # chart box inside its SVG
lo, hi = 40000, 175000
x = lambda i: X0 + i * (W - 2 * X0) / (n - 1)
y = lambda v: Y0 + (hi - v) * (Ht - 2 * Y0) / (hi - lo)
hist = " ".join(f"{x(i):.1f},{y(v):.1f}" for i, v in enumerate(H))
k = len(H) - 1
fc = " ".join(f"{x(k + i):.1f},{y(v):.1f}" for i, v in enumerate([H[-1]] + F))
band = " ".join(f"{x(k + 1 + i):.1f},{y(v):.1f}" for i, v in enumerate(P90)) + " " + \
       " ".join(f"{x(k + 1 + i):.1f},{y(v):.1f}" for i, v in reversed(list(enumerate(P10))))
xn = x(k)
covid = min(range(len(H)), key=lambda i: H[i])
years = "".join(
    f'<text x="{x(i):.1f}" y="{Ht + 6}" class="yr">{d["hd"][i][:4] if i < len(H) else d["fd"][i - len(H)][:4]}</text>'
    for i in range(0, n, 12))
svg = f"""
<svg viewBox="0 0 {W} {Ht + 16}" width="{W}" height="{Ht + 16}" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="win" x1="0" x2="1"><stop offset="0" stop-color="#ff6a13" stop-opacity=".16"/><stop offset="1" stop-color="#ff6a13" stop-opacity=".05"/></linearGradient></defs>
  <rect x="{xn:.1f}" y="{Y0 - 8}" width="{W - X0 - xn + 4:.1f}" height="{Ht - 2 * Y0 + 16}" fill="url(#win)"/>
  <line x1="{xn:.1f}" x2="{xn:.1f}" y1="{Y0 - 8}" y2="{Ht - Y0 + 8}" stroke="#f2ede3" stroke-width="1.2"/>
  <polygon points="{band}" fill="#ff6a13" fill-opacity=".30"/>
  <polyline points="{hist}" fill="none" stroke="#f2ede3" stroke-width="2.2" stroke-linejoin="round"/>
  <polyline points="{fc}" fill="none" stroke="#ff6a13" stroke-width="2.8" stroke-linejoin="round"/>
  <circle cx="{x(covid):.1f}" cy="{y(H[covid]):.1f}" r="3.5" fill="#0a0a0a" stroke="#f2ede3" stroke-width="1.5"/>
  <text x="{x(covid) + 9:.1f}" y="{y(H[covid]) + 4:.1f}" class="ann">COVID-19 low</text>
  <text x="{xn - 8:.1f}" y="{Y0 + 4}" class="lab" text-anchor="end">ACTUALS 2019–2026</text>
  <text x="{xn + 8:.1f}" y="{Y0 + 4}" class="lab or">FORECAST</text>
  <text x="{W - X0 + 2:.1f}" y="{y(min(P10)) + 22:.1f}" class="end" text-anchor="end">P10–P90 RANGE</text>
  {years}
</svg>"""
html = (here / "template.html").read_text().replace("{{CHART}}", svg)
(here / "banner.html").write_text(html)
print("ok")
