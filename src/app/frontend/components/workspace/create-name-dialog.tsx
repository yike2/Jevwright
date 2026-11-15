"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorText } from "@/lib/format-error";

type CreateNameDialogProps = {
  open: boolean;
  title: "New project" | "New module" | "New test file" | "Rename project" | "Rename module" | "Rename test file";
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string) => Promise<void>;
  normalizeName?: (name: string) => string;
  // What is wrong with the typed name, shown under the input as the user types.
  validate: (name: string) => string | null;
  // A fixed suffix shown after the input, like a file manager's extension.
  suffix?: ".yaml";
  submitLabel?: "Create" | "Save";
  initialName?: string;
  disableUnchangedSubmit?: boolean;
};

export function CreateNameDialog({
  open,
  title,
  onOpenChange,
  onCreate,
  normalizeName,
  validate,
  suffix,
  submitLabel = "Create",
  initialName = "",
  disableUnchangedSubmit = false,
}: CreateNameDialogProps) {
  const inputId = useId();
  const problemId = useId();
  const [name, setName] = useState(initialName);
  // The empty name of a new dialog is not an error until the user types or submits.
  const [touched, setTouched] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = () => {
    setName(initialName);
    setTouched(false);
    setErrorMessage(null);
    setIsSubmitting(false);
  };

  useEffect(() => {
    if (open) {
      setName(initialName);
      setTouched(false);
      setErrorMessage(null);
      setIsSubmitting(false);
    }
  }, [open, initialName]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      reset();
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setTouched(true);
    if (validate(name) !== null) {
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    const nextName = normalizeName ? normalizeName(name) : name;

    try {
      await onCreate(nextName);
      reset();
      onOpenChange(false);
    } catch (error) {
      setErrorMessage(errorText(error));
      setIsSubmitting(false);
    }
  };

  const problem = validate(name);
  const shownProblem = touched ? problem : null;
  const normalizedName = normalizeName ? normalizeName(name) : name;
  const normalizedInitialName = normalizeName ? normalizeName(initialName) : initialName;
  const disableForRenameRules =
    disableUnchangedSubmit && (normalizedName.length === 0 || normalizedName === normalizedInitialName);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor={inputId}>Name</Label>
            <div className="flex items-center gap-2">
              <Input
                id={inputId}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setTouched(true);
                }}
                aria-invalid={shownProblem !== null}
                aria-describedby={shownProblem !== null ? problemId : undefined}
              />
              {suffix && (
                <span className="font-mono text-sm text-muted-foreground" aria-hidden="true">
                  {suffix}
                </span>
              )}
            </div>
            {shownProblem !== null && (
              <p id={problemId} role="alert" className="text-sm text-destructive">
                {shownProblem}
              </p>
            )}
          </div>

          {errorMessage && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || disableForRenameRules}>
              {isSubmitting ? "Please wait…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
