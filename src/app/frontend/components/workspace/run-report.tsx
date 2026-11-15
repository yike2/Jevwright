"use client";

import type { Run, Step } from "@/lib/api";
import { apiClient } from "@/lib/api";
import { formatDuration, isFinalStatus, runErrorText, runFileUrl, runStatusLabel } from "@/lib/runs";
import { StepList } from "@/components/workspace/step-list";
import { StatusIcon } from "@/components/workspace/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Download } from "lucide-react";

type RunReportProps = {
  run: Run;
  steps: Step[];
  source: string | null;
  disconnected: boolean;
};

/** A Run's details below its heading: status, times, downloads, steps and the source it ran (frontend.md 1.9). */
export function RunReport({ run, steps: liveSteps, source, disconnected }: RunReportProps) {
  const baseUrl = apiClient.getBaseUrl();
  const token = apiClient.getToken() ?? "";
  const isFinal = isFinalStatus(run.status);
  const steps = run.report?.steps ?? liveSteps;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
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
      </div>

      {disconnected && (
        <p role="alert" className="text-destructive">
          Live progress disconnected
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
    </div>
  );
}
