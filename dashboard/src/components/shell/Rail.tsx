// The rail (a black band): a table of contents in reading order with the colour key (chalk / ink = actuals,
// orange = forecast),
// section markers in the colour grammar, the live exception count and the provenance footer.
import { useState } from "react";
import { GROUPS, VIEWS, useApp } from "../../app/context";
import { useResource } from "../../data/load";
import { monthName } from "../../data/format";
import type { ExceptionFile } from "../../data/types";
import { exceptionRowsIn } from "../../insights/briefing";
import { hrefFor } from "../../state/url";
import { CheckCircle, CrossCircle, Glyph, Menu } from "../icons";

export function Rail() {
  const { m, view, params, filters, selfCheck } = useApp();
  const exc = useResource<ExceptionFile>("exceptions.json");
  const [open, setOpen] = useState(false);
  const keep = new URLSearchParams();
  for (const k of ["fam", "sku", "reg", "ch", "cust", "m", "lens"]) {
    const v = params.get(k);
    if (v) keep.set(k, v);
  }
  const nExc = exc.data ? exceptionRowsIn(m, filters, exc.data).length : null;
  const y = (i: number) => m.months[i].slice(2, 4);
  const spans: Record<string, string | undefined> = {
    past: `${m.months[0].slice(0, 4)}–${y(m.asOf)}`,
    future: `${m.months[m.asOf].slice(0, 4)}–${y(m.nMonths - 1)}`,
  };
  const ok = selfCheck.passed === selfCheck.total;
  return (
    <nav className={`rail ${open ? "open" : ""}`} aria-label="Views">
      <a className="brand" href={hrefFor("overview", keep)} aria-label="Celeris planning control tower: executive overview">
        <span className="word">
          <Glyph size={18} />
          Celeris
        </span>
        <span className="sub">Planning control tower</span>
      </a>
      <button type="button" className="btn rail-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Menu size={14} /> Views
      </button>
      <dl className="colour-key" aria-label="Colour key and time span">
        <dt>
          <i className="mark past" aria-hidden="true" /> Actuals
        </dt>
        <dd>
          {monthName(m.months[0])} – {monthName(m.months[m.asOf])}
        </dd>
        <dt>
          <i className="mark future" aria-hidden="true" /> Forecast
        </dt>
        <dd>
          {monthName(m.months[m.w0])} – {monthName(m.months[m.nMonths - 1])}
        </dd>
      </dl>
      <div className="toc">
        {GROUPS.map((g) => (
          <div key={g.id} className="toc-sec">
            <h3>
              <i className={`mark ${g.mark}`} aria-hidden="true" />
              {g.title}
              {spans[g.id] && <small>{spans[g.id]}</small>}
            </h3>
            {VIEWS.filter((v) => v.group === g.id).map((v) => (
              <a key={v.id} href={hrefFor(v.id, keep)} aria-current={v.id === view ? "page" : undefined} onClick={() => setOpen(false)}>
                {v.short ?? v.title}
                {v.id === "exceptions" && nExc !== null && (
                  <span className="count-badge" title={`${nExc} exceptions in the current selection`}>
                    {nExc.toLocaleString("en-US")}
                  </span>
                )}
              </a>
            ))}
          </div>
        ))}
      </div>
      <div className="rail-foot">
        <span className="ok" title={`Worst relative difference ${selfCheck.worst.toExponential(1)}`}>
          {ok ? <CheckCircle size={12} /> : <CrossCircle size={12} />}
          Quantile engine: {selfCheck.passed} of {selfCheck.total} checks match the pipeline
        </span>
        <span>
          Bundle v{m.meta.bundle_version}, celeris {m.meta.package_version}
          <br />
          Every figure is computed from the pipeline outputs
        </span>
      </div>
    </nav>
  );
}
