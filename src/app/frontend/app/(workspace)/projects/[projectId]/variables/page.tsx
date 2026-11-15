"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { apiClient, type VariableListResponse } from "@/lib/api";
import { errorText } from "@/lib/format-error";
import { variableNameProblem, variableValueProblem } from "@/lib/validation";
import { useWorkspace } from "@/lib/workspace-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Trash2 } from "lucide-react";

type Variable = VariableListResponse["items"][number];

// A value is hidden behind the same mask whatever its length, so the mask tells nothing about it.
const MASK = "****";

/** Project Variables as a page in the editor area (frontend.md 1.8). */
export default function VariablesPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const { tree } = useWorkspace();
  const projectName = tree.find((project) => project.id === projectId)?.name;

  const nameInputId = useId();
  const valueInputId = useId();
  const [variables, setVariables] = useState<Variable[] | null>(null);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const response = await apiClient.listVariables(projectId);
    setVariables(response.items);
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    setVariables(null);
    setShown(new Set());
    setErrorMessage(null);
    apiClient.listVariables(projectId).then(
      (response) => !cancelled && setVariables(response.items),
      (error: unknown) => !cancelled && setErrorMessage(errorText(error)),
    );
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const toggleShown = (variableName: string) => {
    setShown((previous) => {
      const next = new Set(previous);
      if (next.has(variableName)) {
        next.delete(variableName);
      } else {
        next.add(variableName);
      }
      return next;
    });
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const variableName = name.trim();
    if (isSaving || variableName === "" || value === "") return;

    const problem = variableNameProblem(variableName) ?? variableValueProblem(value);
    setErrorMessage(problem);
    if (problem !== null) return;

    setIsSaving(true);
    try {
      await apiClient.setVariable(projectId, variableName, value);
      await reload();
      setName("");
      setValue("");
    } catch (error) {
      setErrorMessage(errorText(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (variableName: string) => {
    if (deletingName !== null) return;
    setErrorMessage(null);
    setDeletingName(variableName);
    try {
      await apiClient.deleteVariable(projectId, variableName);
      await reload();
    } catch (error) {
      setErrorMessage(errorText(error));
    } finally {
      setDeletingName(null);
    }
  };

  return (
    <section aria-labelledby="variables-heading" className="max-w-3xl space-y-6 p-4">
      <header className="space-y-1">
        <h1 id="variables-heading" className="font-heading text-xl font-semibold">
          Variables
        </h1>
        {projectName && <p className="text-muted-foreground">{projectName}</p>}
        <p className="text-muted-foreground">
          Every Run of this project&apos;s test files can use these as <code className="font-mono">{"{{NAME}}"}</code>.
        </p>
      </header>

      {errorMessage && (
        <p role="alert" className="text-destructive">
          {errorMessage}
        </p>
      )}

      <div className="rounded-xl bg-card ring-1 ring-foreground/10">
        {variables === null && !errorMessage && <p className="p-3 text-muted-foreground">Loading…</p>}
        {variables !== null && variables.length === 0 && <p className="p-3 text-muted-foreground">No variables yet</p>}
        {variables !== null && variables.length > 0 && (
          <ul aria-label="Variables" className="divide-y">
            {variables.map((variable) => {
              const isShown = shown.has(variable.name);
              return (
                <li key={variable.name} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-48 shrink-0 truncate font-mono text-[0.8125rem]" title={variable.name}>
                    {variable.name}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[0.8125rem] text-muted-foreground">
                    {isShown ? variable.value : MASK}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Show value of ${variable.name}`}
                    aria-pressed={isShown}
                    title={isShown ? "Hide value" : "Show value"}
                    onClick={() => toggleShown(variable.name)}
                  >
                    {isShown ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => void handleDelete(variable.name)}
                    disabled={deletingName !== null}
                  >
                    <Trash2 data-icon="inline-start" aria-hidden="true" />
                    Delete {variable.name}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <form
        aria-label="Add or replace a variable"
        className="space-y-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
        onSubmit={(event) => void handleSave(event)}
      >
        <h2 className="font-heading font-semibold">Add or replace a variable</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={nameInputId}>Name</Label>
            <Input
              id={nameInputId}
              className="font-mono"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={valueInputId}>Value</Label>
            <Input id={valueInputId} type="password" value={value} onChange={(event) => setValue(event.target.value)} />
          </div>
        </div>
        <p className="text-muted-foreground">Saving a name that exists replaces its value.</p>
        <Button type="submit" disabled={name.trim() === "" || value === "" || isSaving}>
          Save
        </Button>
      </form>
    </section>
  );
}
