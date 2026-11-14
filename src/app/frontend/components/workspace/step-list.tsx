import type { Step } from "@/lib/api";
import { formatDuration, runFileUrl, stepStatusLabel } from "@/lib/runs";

type StepListProps = {
  runId: string;
  steps: Step[];
  baseUrl: string;
  token: string;
};

export function StepList({ runId, steps, baseUrl, token }: StepListProps) {
  return (
    <ol aria-label="Steps" className="space-y-3">
      {steps.map((step) => {
        const stepNumber = step.index + 1;

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
            {"screenshot" in step && step.screenshot && (
              <img
                alt={`Step ${stepNumber} screenshot`}
                className="max-h-80 rounded-md border border-border"
                src={runFileUrl(baseUrl, runId, step.screenshot, token)}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
