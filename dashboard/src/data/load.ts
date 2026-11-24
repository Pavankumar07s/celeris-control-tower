// Fetching bundle files: one cached promise per file, and a hook for lazily loaded files.
import { useEffect, useState } from "react";

const cache = new Map<string, Promise<unknown>>();

export function fetchJson<T>(name: string): Promise<T> {
  let p = cache.get(name);
  if (!p) {
    p = fetch(`./data/${name}`).then((r) => {
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
      return r.json();
    });
    p.catch(() => cache.delete(name));
    cache.set(name, p);
  }
  return p as Promise<T>;
}

export interface Resource<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/** Load a bundle file (or several) on demand; `null` names load nothing. */
export function useResource<T>(name: string | null): Resource<T> {
  const [state, setState] = useState<Resource<T>>({ data: null, error: null, loading: name !== null });
  useEffect(() => {
    if (name === null) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    let alive = true;
    setState((s) => ({ data: s.data, error: null, loading: true }));
    fetchJson<T>(name)
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e: Error) => alive && setState({ data: null, error: e.message, loading: false }));
    return () => {
      alive = false;
    };
  }, [name]);
  return state;
}

export function useResources<T extends unknown[]>(names: string[] | null): Resource<T> {
  const key = names ? names.join("|") : null;
  const [state, setState] = useState<Resource<T>>({ data: null, error: null, loading: key !== null });
  useEffect(() => {
    if (key === null) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    let alive = true;
    setState((s) => ({ data: s.data, error: null, loading: true }));
    Promise.all(key.split("|").map((n) => fetchJson<unknown>(n)))
      .then((data) => alive && setState({ data: data as T, error: null, loading: false }))
      .catch((e: Error) => alive && setState({ data: null, error: e.message, loading: false }));
    return () => {
      alive = false;
    };
  }, [key]);
  return state;
}
