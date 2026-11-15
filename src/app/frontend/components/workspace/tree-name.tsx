"use client";

import { useRef, useState, type ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type TreeNameTooltipProps = {
  name: string;
  // The row's link or button, holding or being a `[data-tree-name]` element with the (possibly truncated) name.
  children: ReactElement<Record<string, unknown>>;
};

/**
 * Shows a tree row's full name in a tooltip on hover and on keyboard focus, but only while the name is cut off
 * with an ellipsis (frontend.md 1.6). The row's accessible name is its text, so it is always the full name.
 */
export function TreeNameTooltip({ name, children }: TreeNameTooltipProps) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);

  const isTruncated = () => {
    const trigger = triggerRef.current;
    const text = trigger?.matches("[data-tree-name]")
      ? trigger
      : trigger?.querySelector<HTMLElement>("[data-tree-name]");
    return text !== null && text !== undefined && text.scrollWidth > text.clientWidth;
  };

  return (
    <Tooltip open={open} onOpenChange={(next) => setOpen(next && isTruncated())}>
      <TooltipTrigger
        ref={(element: HTMLElement | null) => {
          triggerRef.current = element;
        }}
        render={children}
      />
      <TooltipContent side="right" align="start" className="max-w-md font-mono break-all">
        {name}
      </TooltipContent>
    </Tooltip>
  );
}
