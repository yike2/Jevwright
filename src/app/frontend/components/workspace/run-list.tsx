"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiClient, type Run } from "@/lib/api";
import { formatDuration, runStatusLabel } from "@/lib/runs";

type RunListProps = {
  testFileId: string;
  reloadKey: number;
};

export function RunList({ testFileId, reloadKey }: RunListProps) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadRuns = async () => {
      setErrorMessage(null);

      try {
        const response = await apiClient.listRuns(testFileId);

        if (cancelled) {
          return;
        }

        setRuns(response.items);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : "Internal server error");
      }
    };

    void loadRuns();

    return () => {
      cancelled = true;
    };
  }, [testFileId, reloadKey]);

  return (
    <section aria-label="Runs" className="space-y-2 rounded-lg border border-border bg-background p-4">
      {errorMessage && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      {!errorMessage && runs.length === 0 && <p className="text-sm text-muted-foreground">No runs yet</p>}

      {!errorMessage && runs.length > 0 && (
        <ul className="space-y-2">
          {runs.map((run) => (
            <li key={run.id} className="text-sm text-foreground">
              <Link className="underline underline-offset-4" href={`/runs/${run.id}`}>
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
