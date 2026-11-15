"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, RotateCcw } from "lucide-react";
import { cn } from "cn";
import { replayBadge, type ReplayRun } from "@/lib/landing";
import { formatDuration, stepStatusLabel } from "@/lib/runs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusIcon } from "@/components/workspace/status-badge";

const STEP_MS = 650;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The real Runs of REPLAY_RUNS, one tab each, opening on the first (frontend.md 1.14). */
export function RunReplay({ runs }: { runs: ReplayRun[] }) {
  return (
    <section aria-label="Run replay" className="rounded-xl bg-card p-3 ring-1 ring-foreground/10 sm:p-4">
      <Tabs defaultValue={runs[0]?.file}>
        <TabsList className="h-auto max-w-full flex-wrap">
          {runs.map((run) => (
            <TabsTrigger key={run.file} value={run.file} className="font-mono text-xs">
              {run.file}
            </TabsTrigger>
          ))}
        </TabsList>
        {runs.map((run) => (
          <TabsContent key={run.file} value={run.file}>
            <Replay run={run} />
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

/** One Run's steps ticking through to their real results; reduced motion shows them all at once. */
function Replay({ run }: { run: ReplayRun }) {
  const steps = run.report.steps;
  const rootRef = useRef<HTMLDivElement | null>(null);
  // How many steps have finished in the replay; the next one shows as running.
  const [done, setDone] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  // Start once the replay scrolls into view, so the one animated moment of the page is seen.
  useEffect(() => {
    if (prefersReducedMotion()) {
      setDone(steps.length);
      return;
    }
    const root = rootRef.current;
    if (root === null || typeof IntersectionObserver === "undefined") {
      setPlaying(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setPlaying(true);
        observer.disconnect();
      }
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [steps.length]);

  useEffect(() => {
    if (!playing) return;
    if (done >= steps.length) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setDone((previous) => previous + 1), STEP_MS);
    return () => clearTimeout(timer);
  }, [playing, done, steps.length]);

  const replay = () => {
    setSelected(null);
    setDone(0);
    setPlaying(true);
  };
  const showAll = () => {
    setPlaying(false);
    setDone(steps.length);
  };

  const shown = selected ?? (done > 0 ? done - 1 : null);
  const shownStep = shown === null ? undefined : steps[shown];
  const finished = done >= steps.length;

  return (
    <div ref={rootRef} className="grid gap-4 pt-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="min-w-0 space-y-3">
        <p className="text-muted-foreground">{run.note}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={replay}>
            <RotateCcw data-icon="inline-start" aria-hidden="true" />
            Replay
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={showAll} disabled={finished}>
            <Eye data-icon="inline-start" aria-hidden="true" />
            Show all steps
          </Button>
          <p aria-live="polite" className="ml-auto text-xs text-muted-foreground">
            {finished
              ? `Passed, ${run.report.summary?.passed ?? steps.length}/${steps.length} steps in ${formatDuration(run.report.durationMs)}`
              : `Step ${done + 1} of ${steps.length}`}
          </p>
        </div>
        <ol aria-label="Replay steps" className="divide-y rounded-lg border">
          {steps.map((step, index) => {
            const status = index < done ? step.status : index === done && playing ? "running" : "pending";
            const badge = replayBadge(run, step);
            return (
              <li key={step.index}>
                <button
                  type="button"
                  disabled={index >= done}
                  aria-pressed={shown === index}
                  onClick={() => setSelected(index)}
                  className={cn(
                    "flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left disabled:cursor-default",
                    shown === index && "bg-sidebar-accent",
                  )}
                >
                  <StatusIcon status={status} />
                  <span className="font-medium">Step {index + 1}</span>
                  <span className="font-mono text-[0.8125rem]">{step.action}</span>
                  <span className="text-muted-foreground">line {step.line}</span>
                  <span className={status === "pending" ? "text-muted-foreground" : undefined}>
                    {stepStatusLabel(status)}
                  </span>
                  {index < done && badge && <Badge variant="info">{badge}</Badge>}
                  {index < done && "durationMs" in step && (
                    <span className="ml-auto text-xs text-muted-foreground">{formatDuration(step.durationMs)}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <figure className="min-w-0 space-y-2">
        {shownStep ? (
          <img
            src={`${run.assets}/step-${shownStep.index}.webp`}
            alt={`Step ${shownStep.index + 1} screenshot`}
            width={800}
            height={450}
            className="h-auto w-full rounded-lg border bg-white"
          />
        ) : (
          <div className="flex aspect-video items-center justify-center rounded-lg border bg-muted text-muted-foreground">
            Screenshots appear as the steps run
          </div>
        )}
        <figcaption className="text-xs text-muted-foreground">
          {shownStep
            ? `The page after step ${shownStep.index + 1}, ${shownStep.action}, as the Run saved it.`
            : "Every step saves a screenshot."}
        </figcaption>
      </figure>
    </div>
  );
}
