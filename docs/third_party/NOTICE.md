# Third-party components

This file lists the third-party components in this repository or in its built dashboard, with their licences. It does
not license the project's own code or documents.

## Fonts (redistributed)

The dashboard bundles three font families as WOFF2 files in `dashboard/src/assets/fonts/`. The build copies them, with
hashed names, to `dashboard/dist/assets/`. All three are licensed under the SIL Open Font License 1.1 (OFL), which
requires the copyright notice and the licence to accompany the font files.

| Font | Files | Version and notice embedded in the file | Licence text (upstream copyright notice) |
|---|---|---|---|
| IBM Plex Sans (variable) | `plex-sans-var.woff2` | 3.201; "Copyright 2019 IBM Corp. All rights reserved." | [`OFL-IBM-Plex.txt`](OFL-IBM-Plex.txt): "Copyright © 2017 IBM Corp. with Reserved Font Name "Plex"" |
| IBM Plex Mono Regular and Medium | `plex-mono-400.woff2`, `plex-mono-500.woff2` | 2.3; "Copyright 2017 IBM Corp. All rights reserved." | [`OFL-IBM-Plex.txt`](OFL-IBM-Plex.txt) |
| Source Serif 4 (roman, weights 400–700) | `source-serif-4-normal-400-700.woff2` | 4.004; "© 2014 - 2021 Adobe Systems Incorporated (http://www.adobe.com/), with Reserved Font Name ‘Source’." | [`OFL-Source-Serif-4.txt`](OFL-Source-Serif-4.txt): "Copyright 2014 - 2023 Adobe (http://www.adobe.com/), with Reserved Font Name ‘Source’. …" |

Upstream projects: <https://github.com/IBM/plex> and <https://github.com/adobe-fonts/source-serif>. The licence files
here are the upstream `LICENSE` files (fetched 25 Nov 2026), with line endings normalised.

## JavaScript libraries in the built dashboard (redistributed in `dashboard/dist/assets`)

Installed with npm and pinned in `dashboard/package-lock.json`. Their licence texts are in each package's `LICENSE`
file after `npm ci` (in `dashboard/node_modules/<package>/`).

| Package | Version | Licence | Copyright |
|---|---|---|---|
| Apache ECharts (`echarts`) | 6.1.0 | Apache-2.0 | Apache ECharts, Copyright 2017-2026 The Apache Software Foundation. This product includes software developed at The Apache Software Foundation (https://www.apache.org/). ECharts also contains code from d3 under the BSD-3-Clause licence (Copyright 2010-2016 Mike Bostock; `echarts/licenses/LICENSE-d3`). |
| ZRender (`zrender`, the ECharts renderer) | 6.1.0 | BSD-3-Clause | Copyright (c) 2017, Baidu Inc. |
| React (`react`), React DOM (`react-dom`), `scheduler` | 19.3.1, 19.3.1, 0.28.0 | MIT | Copyright (c) Meta Platforms, Inc. and affiliates. |
| `tslib` (a dependency of ECharts and ZRender) | 2.3.0 | 0BSD | Copyright (c) Microsoft Corporation. |

Build tools, not part of the built site: Vite 7.3.8 (MIT), TypeScript 5.9.3 (Apache-2.0), esbuild and Rollup with
their dependencies (full list in `dashboard/package-lock.json`).

## Python packages (installed from PyPI, not redistributed)

Declared in `pyproject.toml`; exact versions in `requirements.lock.txt`. pandas 3.1.1 (BSD-3-Clause), NumPy 2.5.5
(BSD-3-Clause and others), PyArrow 26.0.1 (Apache-2.0), SciPy 1.18.1 (BSD-3-Clause), statsmodels 0.15.0
(BSD-3-Clause), LightGBM 4.7.0 (MIT), statsforecast 2.0.1 (Apache-2.0), and pytest 9.2.0 (MIT) for the tests.

## References only (nothing copied into the repository)

- The dashboard design was checked against two public rule sets for dashboard and interface design: UI/UX Pro Max
  (<https://github.com/nextlevelbuilder/ui-ux-pro-max-skill>; no licence declared in the copy consulted) and
  dashboard-designer (a community rule set published under MIT). They are cited in `docs/design_system.md` and in
  `research/dashboard-*.md`, together with the other public design guides listed there. None of their files is in
  this repository.
- The hackathon brief (`docs/problem_statement.pdf`, transcribed in `docs/problem_statement.md`) and the jury criteria
  (`docs/evaluation_criteria.md`, from the portal) are the organisers' material. The provided dataset is not in the
  repository.
