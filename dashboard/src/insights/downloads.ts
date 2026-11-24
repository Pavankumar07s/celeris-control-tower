// Data download: the in-browser checksum check (Web Crypto SHA-256 of every bundle file against meta.json)
// and the templates that write the view's sentences.
import { useEffect, useState } from "react";
import { fmtInt, fmtBytes } from "../data/format";
import { cap, countWord, plural, renderFirst, type Template } from "./headlines";

export type Check = "pending" | "ok" | "bad" | "na";

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

/** Re-hash every bundle file (three at a time) and compare with the manifest.  `run` restarts the check. */
export function useChecksums(files: { path: string; sha256: string }[], run: number): { state: Record<string, Check>; supported: boolean } {
  const supported = typeof window !== "undefined" && !!window.crypto?.subtle && window.isSecureContext;
  const [state, setState] = useState<Record<string, Check>>(() => Object.fromEntries(files.map((f) => [f.path, supported ? "pending" : "na"])));
  useEffect(() => {
    if (!supported) return undefined;
    let alive = true;
    setState(Object.fromEntries(files.map((f) => [f.path, "pending" as Check])));
    const queue = [...files];
    const worker = async () => {
      for (let f = queue.shift(); f && alive; f = queue.shift()) {
        let result: Check = "bad";
        try {
          const r = await fetch(`./data/${f.path}`);
          if (r.ok) result = hex(await window.crypto.subtle.digest("SHA-256", await r.arrayBuffer())) === f.sha256.toLowerCase() ? "ok" : "bad";
        } catch {
          result = "bad";
        }
        const path = f.path;
        if (alive) setState((s) => ({ ...s, [path]: result }));
      }
    };
    void Promise.all([worker(), worker(), worker()]);
    return () => {
      alive = false;
    };
  }, [files, run, supported]);
  return { state, supported };
}

export interface DownloadFacts {
  hash: string | null;
  n: number;
  bytes: number;
  ok: number;
  bad: number;
  pending: number;
  supported: boolean;
  outputs: number;
  inputs: number;
  finalInputs: number;
  version: string;
}

const count = (n: number, capital = false) => (n <= 10 ? countWord(n, capital) : fmtInt(n));

const HEADLINES: Template<DownloadFacts>[] = [
  {
    id: "downloads.mismatch",
    when: (f) => f.bad > 0,
    text: (f) => `${count(f.bad, true)} of ${fmtInt(f.n)} bundle files no longer ${f.bad === 1 ? "matches its" : "match their"} checksum`,
    fallback: () => "",
  },
  {
    id: "downloads.traces",
    when: (f) => f.hash !== null,
    text: (f) => `Every number here traces to pipeline run ${f.hash}`,
    fallback: () => "The data bundle, its checksums and extracts of your selection",
  },
];
export const downloadHeadline = (f: DownloadFacts): string => renderFirst(HEADLINES, f).text;

export const DOWNLOAD_TEMPLATES = {
  /** "The app reads 23 files, 22.96 MB, written by celeris 0.1.0 from 16 fingerprinted pipeline outputs and 8
   *   final modelling inputs. Every checksum was re-computed in this browser and matches. ..." */
  standfirst: {
    id: "downloads.standfirst",
    when: (f) => f.n > 0,
    text: (f) => {
      const inputs = `${count(f.inputs)} ${f.finalInputs === f.inputs ? "final " : ""}modelling ${plural(f.inputs, "input")}`;
      const check = !f.supported
        ? "This browser cannot re-hash them here (Web Crypto needs https or localhost), so the hashes are listed for you to check."
        : f.pending > 0
          ? `This browser is re-hashing them now: ${fmtInt(f.n - f.pending)} of ${fmtInt(f.n)} done.`
          : f.bad > 0
            ? `**${cap(count(f.bad))}** failed the check: re-run the export before trusting the screen.`
            : "**Every checksum** was re-computed in this browser and matches.";
      return `The app reads **${fmtInt(f.n)} files, ${fmtBytes(f.bytes)}**, written by celeris ${f.version} from ${count(f.outputs)} fingerprinted pipeline outputs and ${inputs}. ${check} Extracts below are built from the same arrays every view draws.`;
    },
    fallback: () => "The bundle lists no files: run python -m celeris export, then reload.",
  },
} satisfies Record<string, Template<DownloadFacts>>;
