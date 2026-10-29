'use client';
import { useCallback, useEffect, useState, type SetStateAction } from 'react';
import { api } from './api-client';
import { useApp } from './app-context';
import type { Page } from './types';
export function useTask() {
  const { notify } = useApp();
  const [busy, setBusy] = useState(false);
  return {
    busy,
    task: async (action: () => Promise<void>) => {
      if (busy) return;
      setBusy(true);
      try {
        await action();
      } catch (error) {
        notify(error instanceof Error ? error.message : 'No se pudo completar la operación.');
      } finally {
        setBusy(false);
      }
    },
  };
}
export function useResource<T>(path: string | null, version = 0) {
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([path, version, retry]);
  const [result, setResult] = useState<{
    key: string;
    path: string | null;
    data: T | null;
    error: string;
  }>({ key: '', path: null, data: null, error: '' });
  const setData = useCallback((value: SetStateAction<T | null>) => {
    setResult((previous) => ({
      ...previous,
      data:
        typeof value === 'function'
          ? (value as (previous: T | null) => T | null)(previous.data)
          : value,
    }));
  }, []);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    api<T>(path)
      .then((data) => {
        if (alive) setResult({ key, path, data, error: '' });
      })
      .catch((error: Error) => {
        if (alive)
          setResult((previous) => ({
            key,
            path,
            data: previous.path === path ? previous.data : null,
            error: error.message,
          }));
      });
    return () => {
      alive = false;
    };
  }, [path, key]);
  return {
    data: path && result.path === path ? result.data : null,
    setData,
    loading: !!path && result.key !== key,
    error: path && result.key === key ? result.error : '',
    reload: () => setRetry((v) => v + 1),
  };
}

export function usePagination<T>(page: Page<T> | null) {
  type Pagination = { source: Page<T> | null; extra: T[]; cursor: string | null };
  const initial = (): Pagination => ({ source: page, extra: [], cursor: page?.nextCursor ?? null });
  const [pagination, setPagination] = useState<Pagination>(initial);
  const current = pagination.source === page ? pagination : initial();
  const update = (apply: (value: Pagination) => Pagination) =>
    setPagination((previous) => apply(previous.source === page ? previous : initial()));
  return {
    extra: current.extra,
    cursor: current.cursor,
    setExtra: (value: SetStateAction<T[]>) =>
      update((previous) => ({
        ...previous,
        extra: typeof value === 'function' ? value(previous.extra) : value,
      })),
    setCursor: (cursor: string | null) => update((previous) => ({ ...previous, cursor })),
  };
}
