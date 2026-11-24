// View-local helpers of Data download: a truncated SHA-256 with a copy button and the checksum state.
import { toast } from "../../components/overlays";
import { CheckCircle, CopyIcon, CrossCircle, PendingIcon } from "../../components/icons";
import "./g3.css";

/** A truncated SHA-256 in mono with a copy button (the full hash goes to the clipboard). */
export function HashCell({ hash, n = 12, what }: { hash: string; n?: number; what: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(hash);
      toast(`SHA-256 of ${what} copied`);
    } catch {
      toast("This browser blocked the clipboard: select the hash in the CSV instead");
    }
  };
  return (
    <span className="g3-hash">
      <code title={hash}>{hash.slice(0, n)}</code>
      <button type="button" className="g3-copy" aria-label={`Copy the full SHA-256 of ${what}`} title="Copy the full SHA-256" onClick={() => void copy()}>
        <CopyIcon size={13} />
      </button>
    </span>
  );
}

/** Verification state with an icon and a word (status colour never alone). */
export function CheckMark({ state }: { state: "ok" | "bad" | "pending" | "na" }) {
  if (state === "ok")
    return (
      <span className="g3-check ok">
        <CheckCircle size={12} /> Match
      </span>
    );
  if (state === "bad")
    return (
      <span className="g3-check bad">
        <CrossCircle size={12} /> Mismatch
      </span>
    );
  if (state === "na") return <span className="g3-check">Not checked</span>;
  return (
    <span className="g3-check">
      <PendingIcon size={12} /> Checking
    </span>
  );
}
