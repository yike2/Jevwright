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
import { StatusIcon } from "@/components/workspace/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { ArrowLeft, Download } from "lucide-react";
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
      <section className="mx-auto max-w-5xl">
        <p className="text-muted-foreground">Loading…</p>
      </section>
    );
  }

  if (loadErrorStatus === 404) {
    return (
      <section className="mx-auto max-w-5xl">
        <p className="text-muted-foreground">Run not found</p>
      </section>
    );
  }

  if (loadErrorMessage !== null) {
    return (
      <section className="mx-auto max-w-5xl">
        <p role="alert" className="text-destructive">
          {loadErrorMessage}
        </p>
      </section>
    );
  }

  const run = live.run;
  if (run === null) {
    return (
      <section className="mx-auto max-w-5xl">
        <p className="text-muted-foreground">Loading…</p>
      </section>
    );
  }

  const baseUrl = apiClient.getBaseUrl();
  const token = apiClient.getToken() ?? "";
  const isFinal = run.status === "passed" || run.status === "failed";
  const steps = run.report?.steps ?? live.steps;

  return (
    <section className="mx-auto max-w-5xl space-y-4">
      <header className="space-y-3">
        {run.testFileId !== null && (
          <Link
            className="inline-flex items-center gap-1 rounded-sm text-info underline-offset-4 hover:underline"
            href={`/files/${run.testFileId}`}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to {run.fileName}
          </Link>
        )}
        <h1 className="font-mono text-xl font-semibold">{run.fileName}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <StatusIcon status={run.status} />
            Status: {runStatusLabel(run.status)}
          </p>
          <p>{new Date(run.createdAt).toLocaleString()}</p>
          <p>{formatDuration(run.durationMs)}</p>
          {run.summary && (
            <p>
              {run.summary.passed}/{run.summary.total} passed
            </p>
          )}
        </div>

        {run.error && <p className="text-destructive">{runErrorText(run.error)}</p>}

        {isFinal && run.report && (
          <div className="flex flex-wrap items-center gap-2">
            <a
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href={runFileUrl(baseUrl, run.id, "report.json", token)}
            >
              <Download data-icon="inline-start" aria-hidden="true" />
              Download report
            </a>
            {run.report.trace && (
              <a
                className={buttonVariants({ variant: "outline", size: "sm" })}
                href={runFileUrl(baseUrl, run.id, run.report.trace, token)}
              >
                <Download data-icon="inline-start" aria-hidden="true" />
                Download trace
              </a>
            )}
          </div>
        )}
      </header>

      {liveDisconnected && (
        <p role="alert" className="text-destructive">
          {liveDisconnected}
        </p>
      )}

      <div aria-live="polite">
        {isFinal && steps.length === 0 ? (
          <p className="text-muted-foreground">No step results</p>
        ) : (
          <StepList runId={run.id} steps={steps} baseUrl={baseUrl} token={token} />
        )}
      </div>

      {source !== null && (
        <details className="rounded-xl bg-card ring-1 ring-foreground/10">
          <summary className="cursor-pointer rounded-xl px-3 py-2 font-medium">Source when it ran</summary>
          <pre
            aria-label="Source when it ran"
            className="overflow-x-auto rounded-b-xl border-t bg-code p-3 font-mono text-[0.8125rem] text-code-foreground"
          >
            {source}
          </pre>
        </details>
      )}
    </section>
  );
}
