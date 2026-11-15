"use client";

import Link from "next/link";
import { useRun } from "@/lib/use-run";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { buttonVariants } from "@/components/ui/button";
import { RunReport } from "@/components/workspace/run-report";
import { ExternalLink } from "lucide-react";

type RunDetailsSheetProps = {
  // The Run to show; null closes the sheet.
  runId: string | null;
  onClose: () => void;
};

/**
 * A Run's full details in a sheet that slides in from the right over most of the page, so the page under it keeps
 * its state (frontend.md 1.9). Escape, the close button or a click on the uncovered part closes it.
 */
export function RunDetailsSheet({ runId, onClose }: RunDetailsSheetProps) {
  return (
    <Sheet open={runId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-hidden data-[side=right]:w-[min(100%,max(85vw,40rem))] data-[side=right]:sm:max-w-none"
      >
        {runId !== null && <RunDetails runId={runId} />}
      </SheetContent>
    </Sheet>
  );
}

function RunDetails({ runId }: { runId: string }) {
  const view = useRun(runId);
  const title = view.kind === "ready" ? view.run.fileName : "Run";

  return (
    <>
      <SheetHeader className="flex-row flex-wrap items-center gap-x-4 gap-y-2 border-b pr-12">
        <SheetTitle className="font-mono text-base font-semibold">{title}</SheetTitle>
        <SheetDescription className="sr-only">The Run&apos;s steps, screenshots, report and source</SheetDescription>
        <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={`/runs/${runId}`}>
          <ExternalLink data-icon="inline-start" aria-hidden="true" />
          Open full page
        </Link>
      </SheetHeader>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {view.kind === "loading" && <p className="text-muted-foreground">Loading…</p>}
        {view.kind === "notFound" && <p className="text-muted-foreground">Run not found</p>}
        {view.kind === "error" && (
          <p role="alert" className="text-destructive">
            {view.message}
          </p>
        )}
        {view.kind === "ready" && (
          <RunReport run={view.run} steps={view.steps} source={view.source} disconnected={view.disconnected} />
        )}
      </div>
    </>
  );
}
