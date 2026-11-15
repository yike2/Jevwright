"use client";

import { useState } from "react";
import type { Step } from "@/lib/api";
import { formatDuration, runFileUrl, stepStatusLabel } from "@/lib/runs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { StatusIcon } from "@/components/workspace/status-badge";

type StepListProps = {
  runId: string;
  steps: Step[];
  baseUrl: string;
  token: string;
};

type OpenScreenshot = { stepNumber: number; src: string };

export function StepList({ runId, steps, baseUrl, token }: StepListProps) {
  const [openScreenshot, setOpenScreenshot] = useState<OpenScreenshot | null>(null);

  return (
    <>
      <ol aria-label="Steps" className="space-y-3">
        {steps.map((step) => {
          const stepNumber = step.index + 1;
          const src =
            "screenshot" in step && step.screenshot ? runFileUrl(baseUrl, runId, step.screenshot, token) : null;

          return (
            <li key={step.index} className="space-y-2 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="flex items-center gap-2 font-medium">
                  <StatusIcon status={step.status} />
                  Step {stepNumber}
                </p>
                <p className="font-mono text-[0.8125rem]">{step.action}</p>
                <p className="text-muted-foreground">line {step.line}</p>
                <p className="text-muted-foreground">{stepStatusLabel(step.status)}</p>
                {"durationMs" in step && <p className="text-muted-foreground">{formatDuration(step.durationMs)}</p>}
                {"locateMethod" in step && step.locateMethod && <Badge variant="muted">{step.locateMethod}</Badge>}
              </div>
              {"reason" in step && <p className="text-destructive">{step.reason}</p>}
              {src !== null && (
                <button
                  type="button"
                  className="block cursor-zoom-in rounded-md"
                  aria-label={`Open step ${stepNumber} screenshot full size`}
                  onClick={() => setOpenScreenshot({ stepNumber, src })}
                >
                  <img alt={`Step ${stepNumber} screenshot`} className="max-h-80 rounded-md border" src={src} />
                </button>
              )}
            </li>
          );
        })}
      </ol>

      <Dialog open={openScreenshot !== null} onOpenChange={(open) => !open && setOpenScreenshot(null)}>
        <DialogContent className="max-h-[95vh] w-auto max-w-[95vw] overflow-auto sm:max-w-[95vw]">
          <DialogHeader>
            <DialogTitle>Step {openScreenshot?.stepNumber} screenshot</DialogTitle>
          </DialogHeader>
          {openScreenshot !== null && (
            <img
              alt={`Step ${openScreenshot.stepNumber} screenshot, full size`}
              className="max-w-none rounded-md border"
              src={openScreenshot.src}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
