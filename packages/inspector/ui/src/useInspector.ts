import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { GraphResult, RunEvent, RunMeta, Selection } from "./types";

/** A seq into the run's events, or "now": past the end, reading the live disk. */
export type At = number | "now";

export async function call<T>(name: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`/api/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `${name} failed (${res.status})`);
  return body;
}

export interface ApiResult<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
}

export interface Inspector {
  graph: GraphResult | null;
  runs: RunMeta[];
  runId: string | null;
  setRunId(id: string): void;
  meta: RunMeta | null;
  events: RunEvent[];
  at: At;
  /** `at` as a number: "now" becomes the last event's seq. */
  atSeq: number;
  setAt(at: At): void;
  selection: Selection | null;
  select(selection: Selection | null): void;
  openFile: string | null;
  setOpenFile(path: string | null): void;
  connected: boolean;
  error: string | null;
  /**
   * Cached fetch keyed by name and params. Pass null params to skip. Safe to call
   * during render: the load is started once per key and the component re-renders
   * when it lands.
   */
  api<T>(name: string, params: Record<string, unknown> | null): ApiResult<T>;
}

type Entry = { data?: unknown; error?: string };

export function useInspector(): Inspector {
  const [graph, setGraph] = useState<GraphResult | null>(null);
  const [runs, setRuns] = useState<RunMeta[]>([]);
  const [runId, setRunIdState] = useState<string | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [meta, setMeta] = useState<RunMeta | null>(null);
  const [at, setAtState] = useState<At>("now");
  const [selection, select] = useState<Selection | null>(null);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, bump] = useState(0);

  const cache = useRef(new Map<string, Entry>());
  const inflight = useRef(new Set<string>());
  const followLive = useRef(true);
  const runIdRef = useRef<string | null>(null);

  const clearCache = useCallback(() => {
    cache.current = new Map();
    inflight.current = new Set();
    bump((n) => n + 1);
  }, []);

  const loadGraph = useCallback(async (refresh = false) => {
    try {
      setGraph(await call<GraphResult>("graph", refresh ? { refresh: true } : {}));
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const loadRun = useCallback(async (id: string) => {
    try {
      const run = await call<{ meta: RunMeta; events: RunEvent[] }>("run", { id });
      if (runIdRef.current !== id) return;
      setMeta(run.meta);
      setEvents(run.events);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const refreshRuns = useCallback(async (): Promise<RunMeta[]> => {
    try {
      const list = await call<RunMeta[]>("runs");
      setRuns(list);
      return list;
    } catch (err) {
      setError((err as Error).message);
      return [];
    }
  }, []);

  const switchRun = useCallback(
    (id: string) => {
      runIdRef.current = id;
      setRunIdState(id);
      setAtState("now");
      setEvents([]);
      clearCache();
      void loadRun(id);
    },
    [loadRun, clearCache],
  );

  const setRunId = useCallback(
    (id: string) => {
      followLive.current = false;
      switchRun(id);
    },
    [switchRun],
  );

  useEffect(() => {
    void (async () => {
      await loadGraph();
      const list = await refreshRuns();
      if (list[0]) switchRun(list[0].id);
    })();
  }, [loadGraph, refreshRuns, switchRun]);

  // Websocket: `graph` after a program edit, `event` for each appended run event.
  useEffect(() => {
    let socket: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const open = (): void => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${proto}://${location.host}/ws`);
      socket.onopen = () => setConnected(true);
      socket.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(open, 1500);
      };
      socket.onmessage = (msg) => {
        const m = JSON.parse(String(msg.data)) as { type: string; runId?: string; event?: RunEvent };
        if (m.type === "graph") {
          clearCache();
          void loadGraph();
        } else if (m.type === "event" && m.event && m.runId) {
          const { event, runId: eventRun } = m;
          void (async () => {
            if (eventRun !== runIdRef.current) {
              // A new run started: follow it unless the user went looking at another.
              const list = await refreshRuns();
              if (followLive.current && list.some((r) => r.id === eventRun)) switchRun(eventRun);
              return;
            }
            setEvents((prev) => (prev.some((e) => e.seq === event.seq) ? prev : [...prev, event]));
            if (event.kind === "run:done" || event.kind === "run:failed") {
              void refreshRuns();
              void loadRun(eventRun);
              void loadGraph(true);
            }
          })();
        }
      };
    };
    open();
    return () => {
      closed = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, [loadGraph, loadRun, refreshRuns, switchRun, clearCache]);

  const setAt = useCallback((next: At) => {
    followLive.current = next === "now";
    setAtState(next);
  }, []);

  const api = useCallback(function api<T>(
    name: string,
    params: Record<string, unknown> | null,
  ): ApiResult<T> {
    if (!params) return { data: undefined, error: null, loading: false };
    const key = `${name}:${JSON.stringify(params)}`;
    const entry = cache.current.get(key);
    if (entry) return { data: entry.data as T | undefined, error: entry.error ?? null, loading: false };
    if (!inflight.current.has(key)) {
      inflight.current.add(key);
      const generation = cache.current;
      const pending = inflight.current;
      call<T>(name, params).then(
        (data) => {
          if (generation === cache.current && pending.delete(key)) {
            cache.current.set(key, { data });
            bump((n) => n + 1);
          }
        },
        (err: Error) => {
          if (generation === cache.current && pending.delete(key)) {
            cache.current.set(key, { error: err.message });
            bump((n) => n + 1);
          }
        },
      );
    }
    return { data: undefined, error: null, loading: true };
  }, []);

  const atSeq = at === "now" ? Math.max(0, events.length - 1) : Math.min(at, Math.max(0, events.length - 1));

  return useMemo(
    () => ({
      graph, runs, runId, setRunId, meta, events, at, atSeq, setAt, selection, select,
      openFile, setOpenFile, connected, error, api,
    }),
    // `version` is part of the identity so consumers re-render when a fetch lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph, runs, runId, setRunId, meta, events, at, atSeq, setAt, selection, openFile, connected, error, api, version],
  );
}

export const InspectorContext = createContext<Inspector | null>(null);

export function useInspectorContext(): Inspector {
  const value = useContext(InspectorContext);
  if (!value) throw new Error("useInspectorContext outside <InspectorContext.Provider>");
  return value;
}
