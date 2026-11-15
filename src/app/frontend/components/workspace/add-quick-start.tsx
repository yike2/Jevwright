"use client";

import { useState } from "react";
import { FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { errorText } from "@/lib/format-error";
import { cn } from "cn";

type AddQuickStartProps = {
  // Reloads the tree, so the sidebar and the overview show the new Project.
  onAdded: () => Promise<void>;
  variant?: "default" | "outline";
  className?: string;
};

/**
 * "Add the Quick Start project" (frontend.md 1.10): shown in the overview and the sidebar while no Project is named
 * Quick Start. An error, such as the 409 when one exists, shows under it.
 */
export function AddQuickStart({ onAdded, variant = "default", className }: AddQuickStartProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const add = async () => {
    if (isAdding) return;
    setErrorMessage(null);
    setIsAdding(true);
    try {
      await apiClient.addQuickStart();
      await onAdded();
    } catch (error) {
      setErrorMessage(errorText(error));
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Button type="button" variant={variant} onClick={() => void add()} disabled={isAdding}>
        <FolderPlus data-icon="inline-start" aria-hidden="true" />
        Add the Quick Start project
      </Button>
      {errorMessage && (
        <p role="alert" className="text-destructive">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
