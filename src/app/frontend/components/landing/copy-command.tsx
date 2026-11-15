"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/** A shell command in a code box with a copy button; the result is announced politely. */
export function CopyCommand({ command }: { command: string }) {
  const [message, setMessage] = useState("");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setMessage("Copied");
    } catch {
      setMessage("Cannot copy here; select the command instead.");
    }
  };

  return (
    <div className="flex max-w-full items-center gap-2 rounded-lg border bg-code py-1 pr-1 pl-3 font-mono text-[0.8125rem] text-code-foreground">
      <span aria-hidden="true" className="text-muted-foreground select-none">
        $
      </span>
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap">{command}</code>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Copy command"
        title="Copy command"
        onClick={copy}
      >
        {message === "Copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </Button>
      <span role="status" className="sr-only">
        {message}
      </span>
    </div>
  );
}
