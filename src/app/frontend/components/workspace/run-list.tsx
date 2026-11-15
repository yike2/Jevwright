"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiClient, type Run } from "@/lib/api";
import { formatDuration, runStatusLabel } from "@/lib/runs";
import { errorText } from "@/lib/format-error";
import { StatusIcon } from "@/components/workspace/status-badge";

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

        setErrorMessage(errorText(error));
      }
    };

    void loadRuns();

    return () => {
      cancelled = true;
    };
  }, [testFileId, reloadKey]);

  return (
    <section aria-label="Runs" className="space-y-2 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
      <h2 className="font-heading font-semibold">Runs</h2>
      {errorMessage && (
        <p role="alert" className="text-destructive">
          {errorMessage}
        </p>
      )}

      {!errorMessage && runs.length === 0 && <p className="text-muted-foreground">No runs yet</p>}

      {!errorMessage && runs.length > 0 && (
        <ul className="divide-y">
          {runs.map((run) => (
            <li key={run.id} className="py-1.5">
              <Link
                className="inline-flex items-center gap-2 rounded-sm underline-offset-4 hover:underline"
                href={`/runs/${run.id}`}
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
