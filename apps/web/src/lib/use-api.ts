"use client";

import { useCallback, useEffect, useState, type DependencyList } from "react";

export interface ApiState<T> {
  data: T | undefined;
  error: Error | null;
  /** True while a request is in flight (also on reload, while old data stays visible). */
  loading: boolean;
  reload: () => void;
  setData: (data: T) => void;
}

/**
 * Loads data in the browser and tracks loading and error state.
 * The request is aborted when the deps change or the component unmounts,
 * so a slow old response can never overwrite a newer one.
 */
export function useApi<T>(fetcher: (signal: AbortSignal) => Promise<T>, deps: DependencyList): ApiState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetcher(controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return;
        setData(result);
        setLoading(false);
      },
      (failure: unknown) => {
        if (controller.signal.aborted) return;
        setError(failure instanceof Error ? failure : new Error(String(failure)));
        setLoading(false);
      },
    );
    return () => controller.abort();
    // The caller lists what the fetcher depends on, like useEffect itself.
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const set = useCallback((next: T) => setData(next), []);

  return { data, error, loading, reload, setData: set };
}
