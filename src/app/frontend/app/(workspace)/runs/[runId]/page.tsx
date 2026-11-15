"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";
import { useRun } from "@/lib/use-run";
import { RunReport } from "@/components/workspace/run-report";
import { ArrowLeft } from "lucide-react";

export default function RunPage() {
  const params = useParams<{ runId: string }>();
  const { refreshTree } = useWorkspace();
  const view = useRun(params.runId, () => {
    // The sidebar's status icons follow the finished Run; a failed refresh leaves the page usable.
    refreshTree().catch(() => undefined);
  });

  return (
    <section className="space-y-4 p-4">
      {view.kind === "loading" && <p className="text-muted-foreground">Loading…</p>}
      {view.kind === "notFound" && <p className="text-muted-foreground">Run not found</p>}
      {view.kind === "error" && (
        <p role="alert" className="text-destructive">
          {view.message}
        </p>
      )}
      {view.kind === "ready" && (
        <>
          <header className="space-y-3">
            {view.run.testFileId !== null && (
              <Link
                className="inline-flex items-center gap-1 rounded-sm text-info underline-offset-4 hover:underline"
                href={`/files/${view.run.testFileId}`}
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
                Back to {view.run.fileName}
              </Link>
            )}
            <h1 className="font-mono text-xl font-semibold">{view.run.fileName}</h1>
          </header>
          <RunReport run={view.run} steps={view.steps} source={view.source} disconnected={view.disconnected} />
        </>
      )}
    </section>
  );
}
