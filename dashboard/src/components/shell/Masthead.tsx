// Masthead: where you are (view, section), the provisional status pill (only while meta.provisional),
// and the global lenses as quiet segmented controls: Units | USD, Orders as booked | Latent demand,
// the theme toggle and Copy link.
import { GROUPS, VIEWS, useApp } from "../../app/context";
import type { ThemeName } from "../../charts/theme";
import { Segmented } from "../controls";
import { LinkIcon, Moon, Sun, WarnTriangle } from "../icons";
import { Info, Popover, toast } from "../overlays";

export function Masthead({ themeName, onToggleTheme }: { themeName: ThemeName; onToggleTheme: () => void }) {
  const { m, view, measure, lens, setParam } = useApp();
  const def = VIEWS.find((v) => v.id === view) ?? VIEWS[0];
  const group = GROUPS.find((g) => g.id === def.group);
  const provisional = Object.entries(m.meta.sources).filter(([, s]) => s.provisional);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast("Link copied");
    } catch {
      toast("Copy failed: select the address bar instead");
    }
  };
  return (
    <header className="masthead">
      <div className="crumbs">
        <span className="view">{def.title}</span>
        <span className="sep" aria-hidden="true" />
        <span className="section">{group?.eyebrow}</span>
        <Info
          what={def.blurb}
          how={
            <>
              Every figure on this page is computed in the browser from the pipeline&rsquo;s data bundle for the filters below; headlines and titles are deterministic templates over those figures.
              <br />
              <b>Words used here.</b> <i>Orders as booked</i>: demand in the month the customer booked it. <i>Latent demand</i>: each order spread over the months it covers, so ordering-cycle zeros disappear. <i>Unconstrained demand</i>: shipments with stock-out losses added back. <i>Cycle-aware naive</i>: last year&rsquo;s demand placed on the customer&rsquo;s ordering cycle. <i>In-hindsight floor</i>: the error a forecast that knew each series&rsquo; level in hindsight would still make.
            </>
          }
          align="left"
          size="sm"
          label="About this view and its terms"
        />
        {m.meta.provisional && (
          <Popover
            trigger={
              <>
                <WarnTriangle size={12} /> Provisional forecast
              </>
            }
            triggerClassName="status-pill warn"
            align="left"
          >
            <p>
              <b>The forecast numbers are provisional.</b> These modelling inputs are stand-ins with the final file formats:
            </p>
            <ul>
              {provisional.map(([k]) => (
                <li key={k}>{k.replace(/_/g, " ")}</li>
              ))}
            </ul>
            <p>
              History, cleaning, anomalies and stock-outs are final. Re-run <code>python -m celeris export</code> when the model files land; nothing else changes.
            </p>
          </Popover>
        )}
      </div>
      <div className="mast-tools">
        <Segmented
          ariaLabel="Measure"
          value={measure}
          onChange={(v) => setParam({ m: v === "usd" ? "usd" : null })}
          options={[
            { value: "units", label: "Units", title: "Volumes in units" },
            { value: "usd", label: "USD", title: "Revenue in US dollars (history at invoice prices, forecast at forecast prices)" },
          ]}
        />
        <Segmented
          ariaLabel="Ordering-cycle lens"
          value={lens}
          onChange={(v) => setParam({ lens: v === "latent" ? "latent" : null })}
          options={[
            { value: "orders", label: "Orders as booked", title: "Orders in the months customers booked them (ordering-cycle zeros visible)" },
            { value: "latent", label: "Latent demand", title: "Each order spread over the months it covers (ordering cycles removed)" },
          ]}
        />
        <button type="button" className="icon-btn" onClick={onToggleTheme} aria-label={themeName === "dark" ? "Switch to the light theme" : "Switch to the dark theme"} title={themeName === "dark" ? "Light theme" : "Dark theme"}>
          {themeName === "dark" ? <Sun /> : <Moon />}
        </button>
        <button type="button" className="btn" onClick={copy} title="Copy a link to this view with its filters" aria-label="Copy link">
          <LinkIcon /> <span className="lbl-wide">Copy link</span>
        </button>
      </div>
    </header>
  );
}
