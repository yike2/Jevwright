"use client";

import { useState } from "react";
import type { Step } from "@/lib/api";
import { formatDuration, runFileUrl, stepStatusLabel } from "@/lib/runs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
            <li key={step.index} className="space-y-1 rounded-lg border border-border bg-background p-3 text-sm">
              <p className="text-foreground">Step {stepNumber}</p>
              <p className="text-muted-foreground">{step.action}</p>
              <p className="text-muted-foreground">line {step.line}</p>
              <p className="text-muted-foreground">{stepStatusLabel(step.status)}</p>
              {"durationMs" in step && <p className="text-muted-foreground">{formatDuration(step.durationMs)}</p>}
              {"locateMethod" in step && step.locateMethod && (
                <p className="text-muted-foreground">{step.locateMethod}</p>
              )}
              {"reason" in step && <p className="text-destructive">{step.reason}</p>}
              {src !== null && (
                <button
                  type="button"
                  className="block cursor-zoom-in rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  aria-label={`Open step ${stepNumber} screenshot full size`}
                  onClick={() => setOpenScreenshot({ stepNumber, src })}
                >
                  <img
                    alt={`Step ${stepNumber} screenshot`}
                    className="max-h-80 rounded-md border border-border"
                    src={src}
                  />
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
              className="max-w-none rounded-md border border-border"
              src={openScreenshot.src}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
