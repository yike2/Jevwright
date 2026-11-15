"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, apiClient, type LiveMessage, type Run, type Step } from "./api.js";
import { errorText } from "./format-error.js";
import { applyLiveMessage, isFinalLiveMessage, isFinalStatus, liveUrl, type LiveState } from "./runs.js";

/** A Run as the pages show it: loading, missing, failed to load, or loaded with its steps. */
export type RunView =
  | { kind: "loading" }
  | { kind: "notFound" }
  | { kind: "error"; message: string }
  | { kind: "ready"; run: Run; steps: Step[]; source: string | null; disconnected: boolean };

/**
 * Loads a Run and, while it is queued or running, follows its Live Progress (frontend.md 1.9). `onFinal` is called
 * once when a followed Run reaches `passed` or `failed`, after the Run is reloaded for its Report.
 */
export function useRun(runId: string | null, onFinal?: (run: Run) => void): RunView {
  const [view, setView] = useState<RunView>({ kind: "loading" });
  const [connectId, setConnectId] = useState<string | null>(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    let cancelled = false;
    setView({ kind: "loading" });
    setConnectId(null);
    if (runId === null) return;

    const load = async () => {
      try {
        const run = await apiClient.getRun(runId);
        if (cancelled) return;
        const final = isFinalStatus(run.status);
        // Live Progress messages carry no source, so the source the Run started with is kept from GET /runs/:id.
        setView({
          kind: "ready",
          run,
          steps: final ? (run.report?.steps ?? []) : [],
          source: run.source ?? null,
          disconnected: false,
        });
        setConnectId(final ? null : runId);
        // A fast Run may already be final when its first GET /runs/:id returns, before the socket opens.
        if (final) onFinalRef.current?.(run);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 404) {
          setView({ kind: "notFound" });
          return;
        }
        setView({ kind: "error", message: errorText(error) });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  useEffect(() => {
    if (runId === null || connectId !== runId) return;

    const ws = new WebSocket(liveUrl(apiClient.getBaseUrl(), runId, apiClient.getToken() ?? ""));
    let final = false;

    const update = (next: (state: LiveState) => LiveState) => {
      setView((previous) => {
        if (previous.kind !== "ready") return previous;
        const live = next({ run: previous.run, steps: previous.steps });
        return live.run === null ? previous : { ...previous, run: live.run, steps: live.steps };
      });
    };

    ws.onmessage = (event) => {
      let message: LiveMessage;
      try {
        message = JSON.parse(String(event.data)) as LiveMessage;
      } catch {
        return;
      }

      update((state) => applyLiveMessage(state, message));
      // A Run that finished while the socket was opening sends a final snapshot and closes at once.
      if (final || !isFinalLiveMessage(message)) return;
      final = true;

      void (async () => {
        let run: Run = message.run;
        try {
          const reloaded = await apiClient.getRun(runId);
          run = reloaded;
          update(() => ({ run: reloaded, steps: reloaded.report?.steps ?? [] }));
        } catch {
          // Keep the latest live state if the final reload fails.
        }
        onFinalRef.current?.(run);
      })();
    };

    ws.onclose = () => {
      if (final) return;
      setView((previous) => (previous.kind === "ready" ? { ...previous, disconnected: true } : previous));
    };

    return () => {
      ws.onmessage = null;
      ws.onclose = null;
      ws.close();
    };
  }, [runId, connectId]);

  return view;
}
