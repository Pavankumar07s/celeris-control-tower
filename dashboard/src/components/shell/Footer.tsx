// The provenance footer on every view: where the numbers come from and how fresh they are (data source,
// last actual month, forecast window, pipeline version, when the bundle was built).  Shared by the shell,
// so no view has to remember it.
import { useApp } from "../../app/context";
import { fileWrittenAt } from "../../data/load";
import { fmtInt, monthName } from "../../data/format";

const built = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function ViewFooter() {
  const { m } = useApp();
  const meta = m.meta;
  const written = fileWrittenAt("meta.json");
  const fcHash = meta.source_sha256.forecast?.slice(0, 8);
  const subHash = meta.source_sha256.submission?.slice(0, 8);
  return (
    <footer className="view-foot" aria-label="Data source and freshness">
      <dl>
        <div>
          <dt>Data as of</dt>
          <dd>
            Actuals to <b>{monthName(m.months[m.asOf])}</b>; forecast {monthName(m.months[m.w0])} – {monthName(m.months[m.nMonths - 1])}
          </dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            Pipeline bundle v{meta.bundle_version} written by <span className="mono">python -m celeris export</span> (celeris {meta.package_version}) from {fmtInt(meta.rows.history_cells)} history cells and {fmtInt(meta.rows.forecast_rows)} forecast rows
          </dd>
        </div>
        <div>
          <dt>Pipeline run</dt>
          <dd>
            {fcHash ? (
              <>
                forecast <span className="mono">{fcHash}</span>
                {subHash && (
                  <>
                    , submission <span className="mono">{subHash}</span>
                  </>
                )}
              </>
            ) : (
              "no source hashes in the bundle"
            )}
            {meta.provisional ? ", provisional inputs" : ", final inputs"}
          </dd>
        </div>
        {written && (
          <div>
            <dt>Built</dt>
            <dd>{built.format(written)}</dd>
          </div>
        )}
        <div>
          <dt>Licences</dt>
          <dd>
            {/* relative links: the site also works under a sub-path (GitHub Pages) */}
            <a href="licenses/NOTICE.md">third-party notices</a>; fonts under the SIL Open Font License: <a href="licenses/OFL-IBM-Plex.txt">IBM Plex</a>, <a href="licenses/OFL-Source-Serif-4.txt">Source Serif 4</a>
          </dd>
        </div>
      </dl>
    </footer>
  );
}
