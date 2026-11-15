"use client";

import { useId, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";

type ConsolePanelProps = {
  title: string;
  // Extra text after the title, such as the number of problems.
  summary?: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
};

/** One console of the editor's console column: a header that collapses and reopens it, and a body that scrolls. */
export function ConsolePanel({ title, summary, expanded, onToggle, children }: ConsolePanelProps) {
  const bodyId = useId();

  return (
    <section aria-label={title} className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex h-8 shrink-0 items-center border-b hover:bg-accent">
        <h2 className="min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={bodyId}
            className="flex h-8 w-full items-center gap-1 px-2 text-left text-xs font-semibold tracking-wide uppercase"
            onClick={onToggle}
          >
            <ChevronRight
              aria-hidden="true"
              className={cn("size-4 transition-transform motion-reduce:transition-none", expanded && "rotate-90")}
            />
            {title} console
          </button>
        </h2>
        {summary !== undefined && <span className="shrink-0 px-2 text-xs text-muted-foreground">{summary}</span>}
      </div>
      <div id={bodyId} hidden={!expanded} className="min-h-0 flex-1 overflow-auto p-2">
        {children}
      </div>
    </section>
  );
}
