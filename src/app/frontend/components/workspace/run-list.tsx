"use client";

import Link from "next/link";
import { useEffect, useState, type MouseEvent } from "react";
import { apiClient, type Run } from "@/lib/api";
import { formatDuration, runStatusLabel } from "@/lib/runs";
import { errorText } from "@/lib/format-error";
import { StatusIcon } from "@/components/workspace/status-badge";

type RunListProps = {
  testFileId: string;
  reloadKey: number;
  // Opens a Run's details in place; a click with a modifier key still opens the Run's own page.
  onOpen: (runId: string) => void;
};

/** A Test File's Run history, newest first (frontend.md 1.9). */
export function RunList({ testFileId, reloadKey, onOpen }: RunListProps) {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadRuns = async () => {
      setErrorMessage(null);

      try {
        const response = await apiClient.listRuns(testFileId);
        if (!cancelled) setRuns(response.items);
      } catch (error) {
        if (!cancelled) setErrorMessage(errorText(error));
      }
    };

    void loadRuns();

    return () => {
      cancelled = true;
    };
  }, [testFileId, reloadKey]);

  const open = (event: MouseEvent<HTMLAnchorElement>, runId: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    onOpen(runId);
  };

  return (
    <section aria-label="Runs" className="space-y-1">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">History</h3>
      {errorMessage && (
        <p role="alert" className="text-destructive">
          {errorMessage}
        </p>
      )}

      {!errorMessage && runs !== null && runs.length === 0 && <p className="text-muted-foreground">No runs yet</p>}

      {!errorMessage && runs !== null && runs.length > 0 && (
        <ul className="divide-y">
          {runs.map((run) => (
            <li key={run.id}>
              <Link
                className="flex items-center gap-2 rounded-sm px-1 py-1.5 hover:bg-accent"
                href={`/runs/${run.id}`}
                onClick={(event) => open(event, run.id)}
              >
                <StatusIcon status={run.status} />
                {runStatusLabel(run.status)} · {new Date(run.createdAt).toLocaleString()} ·{" "}
                {formatDuration(run.durationMs)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
