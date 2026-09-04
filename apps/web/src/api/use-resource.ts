import { useCallback, useEffect, useState, type DependencyList } from 'react';

export interface ResourceState<T> {
  data?: T;
  error?: unknown;
  loading: boolean;
  reload: () => void;
}

export function useResource<T>(loader: () => Promise<T>, dependencies: DependencyList): ResourceState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    loader().then(
      (value) => {
        if (!active) return;
        setData(value);
        setLoading(false);
      },
      (reason: unknown) => {
        if (!active) return;
        setError(reason);
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
    // The caller owns the dependency list, like useEffect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, revision]);

  return { data, error, loading, reload };
}
