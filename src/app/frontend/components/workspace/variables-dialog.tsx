"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { apiClient } from "@/lib/api";
import { isVariableName } from "@/lib/editor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type VariablesDialogProps = {
  open: boolean;
  projectId: string;
  onOpenChange: (open: boolean) => void;
};

export function VariablesDialog({ open, projectId, onOpenChange }: VariablesDialogProps) {
  const nameInputId = useId();
  const valueInputId = useId();
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [variableNames, setVariableNames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    setName("");
    setValue("");
    setErrorMessage(null);
    setVariableNames([]);
    setIsLoading(true);
    setIsSaving(false);
    setDeletingName(null);

    const loadNames = async () => {
      try {
        const response = await apiClient.listVariables(projectId);
        if (!cancelled) {
          setVariableNames(response.items);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Internal server error");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadNames();

    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  const reloadNames = async () => {
    setIsLoading(true);

    try {
      const response = await apiClient.listVariables(projectId);
      setVariableNames(response.items);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSaving || name.trim() === "" || value === "") {
      return;
    }

    setErrorMessage(null);

    const variableName = name.trim();

    if (!isVariableName(variableName)) {
      setErrorMessage("Name must match [A-Z_][A-Z0-9_]*");
      return;
    }

    setIsSaving(true);

    try {
      await apiClient.setVariable(projectId, variableName, value);
      await reloadNames();
      setName("");
      setValue("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Internal server error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (variableName: string) => {
    if (deletingName !== null) {
      return;
    }

    setErrorMessage(null);
    setDeletingName(variableName);

    try {
      await apiClient.deleteVariable(projectId, variableName);
      await reloadNames();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Internal server error");
    } finally {
      setDeletingName(null);
    }
  };

  const saveDisabled = name.trim() === "" || value === "" || isSaving;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Variables</DialogTitle>
        </DialogHeader>

        <form className="space-y-4" onSubmit={(event) => void handleSave(event)}>
          <div className="space-y-2">
            <Label htmlFor={nameInputId}>Name</Label>
            <Input id={nameInputId} value={name} onChange={(event) => setName(event.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor={valueInputId}>Value</Label>
            <Input id={valueInputId} type="password" value={value} onChange={(event) => setValue(event.target.value)} />
          </div>

          {errorMessage && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage}
            </p>
          )}

          <ul className="space-y-2">
            {!isLoading && variableNames.length === 0 && (
              <li className="text-sm text-muted-foreground">No variables yet</li>
            )}

            {variableNames.map((variableName) => (
              <li key={variableName} className="flex items-center justify-between gap-2 text-sm text-foreground">
                <span>{variableName}</span>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    void handleDelete(variableName);
                  }}
                  disabled={deletingName !== null}
                >
                  Delete {variableName}
                </Button>
              </li>
            ))}
          </ul>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving || deletingName !== null}
            >
              Close
            </Button>
            <Button type="submit" disabled={saveDisabled}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
