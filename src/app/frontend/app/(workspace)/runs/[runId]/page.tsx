"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, apiClient, type LiveMessage } from "@/lib/api";
import {
  applyLiveMessage,
  formatDuration,
  liveUrl,
  runFileUrl,
  runErrorText,
  runStatusLabel,
  type LiveState,
} from "@/lib/runs";
import { useWorkspace } from "@/lib/workspace-context";
import { StepList } from "@/components/workspace/step-list";
import { errorText } from "@/lib/format-error";

export default function RunPage() {
  const params = useParams<{ runId: string }>();
  const { refreshTree } = useWorkspace();

  const runId = params.runId;
  const [isLoading, setIsLoading] = useState(true);
  const [loadErrorStatus, setLoadErrorStatus] = useState<number | null>(null);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [live, setLive] = useState<LiveState>({ run: null, steps: [] });
  // Live Progress messages carry no source, so the source the Run started with is kept from GET /runs/:id.
  const [source, setSource] = useState<string | null>(null);
  const [connect, setConnect] = useState(false);
  const [liveDisconnected, setLiveDisconnected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    setLoadErrorStatus(null);
    setLoadErrorMessage(null);
    setConnect(false);
    setLiveDisconnected(null);
    setLive({ run: null, steps: [] });
    setSource(null);

    const loadRun = async () => {
      try {
        const run = await apiClient.getRun(runId);

        if (cancelled) {
          return;
        }

        const isFinal = run.status === "passed" || run.status === "failed";
        setSource(run.source ?? null);
        setLive({
          run,
          steps: isFinal ? (run.report?.steps ?? []) : [],
        });
        setConnect(run.status === "queued" || run.status === "running");
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (error instanceof ApiError) {
          if (error.status === 404) {
            setLoadErrorStatus(404);
            return;
          }

          setLoadErrorMessage(errorText(error));
          return;
        }

        setLoadErrorMessage(errorText(error));
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadRun();

    return () => {
      cancelled = true;
    };
  }, [runId]);

  useEffect(() => {
    if (!connect) {
      return;
    }

    const token = apiClient.getToken() ?? "";
    const ws = new WebSocket(liveUrl(apiClient.getBaseUrl(), runId, token));
    let final = false;

    ws.onmessage = (event) => {
      let message: LiveMessage;

      try {
        message = JSON.parse(event.data) as LiveMessage;
      } catch {
        return;
      }

      setLive((previous) => applyLiveMessage(previous, message));

      const reachedFinal =
        message.type === "status" && (message.run.status === "passed" || message.run.status === "failed");

      if (!reachedFinal || final) {
        return;
      }

      final = true;

      void (async () => {
        try {
          const reloadedRun = await apiClient.getRun(runId);
          setLive({
            run: reloadedRun,
            steps: reloadedRun.report?.steps ?? [],
          });
        } catch {
          // Keep the latest live state if final reload fails.
        }

        try {
          await refreshTree();
        } catch {
          // Ignore refresh errors so the run page remains usable.
        }
      })();
    };

    ws.onclose = () => {
      if (!final) {
        setLiveDisconnected("Live progress disconnected");
      }
    };

    return () => {
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.close();
    };
  }, [runId, connect]);

  if (isLoading) {
    return (
      <section className="rounded-lg border border-border bg-background p-6">
        <p className="text-foreground">Loading…</p>
      </section>
    );
  }

  if (loadErrorStatus === 404) {
    return (
      <section className="rounded-lg border border-border bg-background p-6">
        <p className="text-foreground">Run not found</p>
      </section>
    );
  }

  if (loadErrorMessage !== null) {
    return (
      <section className="rounded-lg border border-border bg-background p-6">
        <p role="alert" className="text-destructive">
          {loadErrorMessage}
        </p>
      </section>
    );
  }

  const run = live.run;
  if (run === null) {
    return (
      <section className="rounded-lg border border-border bg-background p-6">
        <p className="text-foreground">Loading…</p>
      </section>
    );
  }

  const baseUrl = apiClient.getBaseUrl();
  const token = apiClient.getToken() ?? "";
  const isFinal = run.status === "passed" || run.status === "failed";
  const steps = run.report?.steps ?? live.steps;

  return (
    <section className="space-y-4 rounded-lg border border-border bg-background p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{run.fileName}</h1>
        <p className="text-sm text-muted-foreground">Status: {runStatusLabel(run.status)}</p>
        <p className="text-sm text-muted-foreground">{new Date(run.createdAt).toLocaleString()}</p>
        <p className="text-sm text-muted-foreground">{formatDuration(run.durationMs)}</p>

        {run.summary && (
          <p className="text-sm text-muted-foreground">
            {run.summary.passed}/{run.summary.total} passed
          </p>
        )}

        {run.error && <p className="text-sm text-destructive">{runErrorText(run.error)}</p>}

        <div className="flex flex-wrap items-center gap-3 text-sm">
          {run.testFileId !== null && (
            <Link className="text-foreground underline underline-offset-4" href={`/files/${run.testFileId}`}>
              Back to {run.fileName}
            </Link>
          )}

          {isFinal && run.report && (
            <a
              className="text-foreground underline underline-offset-4"
              href={runFileUrl(baseUrl, run.id, "report.json", token)}
            >
              Download report
            </a>
          )}

          {isFinal && run.report?.trace && (
            <a
              className="text-foreground underline underline-offset-4"
              href={runFileUrl(baseUrl, run.id, run.report.trace, token)}
            >
              Download trace
            </a>
          )}
        </div>
      </header>

      {liveDisconnected && (
        <p role="alert" className="text-sm text-destructive">
          {liveDisconnected}
        </p>
      )}

      {isFinal && steps.length === 0 ? (
        <p className="text-sm text-muted-foreground">No step results</p>
      ) : (
        <StepList runId={run.id} steps={steps} baseUrl={baseUrl} token={token} />
      )}

      {source !== null && (
        <details className="rounded-lg border border-border">
          <summary className="cursor-pointer px-3 py-2 text-sm text-foreground">Source when it ran</summary>
          <pre aria-label="Source when it ran" className="overflow-x-auto border-t border-border p-3 font-mono text-sm">
            {source}
          </pre>
        </details>
      )}
    </section>
  );
}
