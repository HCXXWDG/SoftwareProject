import { useCallback, useEffect, useRef, useState } from "react";
import { isRequestCancelled } from "../services/api";
import { fetchTrends } from "../services/commute";
import { fetchRouteHistory, type RouteQueryHistory } from "../services/history";
import type { TrendResult } from "../types";

export interface AsyncQueryState<T> {
  status: "idle" | "loading" | "success" | "empty" | "error";
  data: T | null;
  error: string | null;
  refreshing: boolean;
  refreshError: string | null;
}

function initialState<T>(): AsyncQueryState<T> {
  return { status: "idle", data: null, error: null, refreshing: false, refreshError: null };
}

function useAsyncQuery<T>(
  enabled: boolean,
  fetcher: (signal: AbortSignal) => Promise<T>,
  isEmpty: (data: T) => boolean,
  fallbackError: string,
) {
  const [state, setState] = useState<AsyncQueryState<T>>(initialState);
  const requestId = useRef(0);
  const currentController = useRef<AbortController | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const reload = useCallback(async (): Promise<boolean> => {
    if (!enabledRef.current) return false;
    const id = ++requestId.current;
    currentController.current?.abort();
    const controller = new AbortController();
    currentController.current = controller;
    setState((previous) => ({
      ...previous,
      status: previous.data === null ? "loading" : previous.status,
      error: null,
      refreshing: previous.data !== null,
      refreshError: null,
    }));
    try {
      const data = await fetcher(controller.signal);
      if (id !== requestId.current || controller.signal.aborted || !enabledRef.current) return false;
      setState({
        status: isEmpty(data) ? "empty" : "success",
        data,
        error: null,
        refreshing: false,
        refreshError: null,
      });
      return true;
    } catch (error) {
      if (id !== requestId.current || controller.signal.aborted || !enabledRef.current) return false;
      if (isRequestCancelled(error) || typeof error === "object" && error !== null
        && "name" in error && error.name === "AbortError") {
        setState((previous) => ({
          ...previous,
          status: previous.data === null ? "idle" : previous.status,
          refreshing: false,
        }));
        return false;
      }
      const message = error instanceof Error && error.message ? error.message : fallbackError;
      setState((previous) => previous.data === null
        ? { ...initialState<T>(), status: "error", error: message }
        : { ...previous, refreshing: false, refreshError: message });
      return false;
    } finally {
      if (id === requestId.current) currentController.current = null;
    }
  }, [fetcher, isEmpty, fallbackError]);

  useEffect(() => {
    if (enabled) void reload();
    else setState(initialState<T>());
    return () => {
      ++requestId.current;
      currentController.current?.abort();
      currentController.current = null;
    };
  }, [enabled, reload]);

  return { state, reload };
}

const isTrendEmpty = (result: TrendResult) => result.totalCommutes === 0;
const isHistoryEmpty = (result: RouteQueryHistory[]) => result.length === 0;

export interface TrendsHistoryOptions {
  days?: number;
  timezone?: string;
  historyLimit?: number;
}

/** Keep trend and history failures independent; refreshing never replaces useful old data. */
export function useTrendsHistory(enabled: boolean, options: TrendsHistoryOptions = {}) {
  const { days = 7, timezone = "Asia/Shanghai", historyLimit = 10 } = options;
  const loadTrends = useCallback((signal: AbortSignal) => fetchTrends(days, timezone, signal), [days, timezone]);
  const loadHistory = useCallback((signal: AbortSignal) => fetchRouteHistory(historyLimit, signal), [historyLimit]);
  const trends = useAsyncQuery(enabled, loadTrends, isTrendEmpty, "趋势数据加载失败");
  const history = useAsyncQuery(enabled, loadHistory, isHistoryEmpty, "查询历史加载失败");
  return {
    trends: trends.state,
    history: history.state,
    reloadTrends: trends.reload,
    reloadHistory: history.reload,
  };
}
