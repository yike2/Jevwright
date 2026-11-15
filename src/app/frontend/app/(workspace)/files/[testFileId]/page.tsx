"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ApiError, apiClient, type Diagnostic } from "@/lib/api";
import { formatDiagnostic, validationSummary } from "@/lib/editor";
import { useWorkspace } from "@/lib/workspace-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "cn";
import { CircleAlert, CircleCheck, FileCheck2, Play, Save, Upload } from "lucide-react";
import { RunList } from "@/components/workspace/run-list";
import { errorText } from "@/lib/format-error";

export default function TestFilePage() {
  const params = useParams<{ testFileId: string }>();
  const { tree, refreshTree } = useWorkspace();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const testFileId = params.testFileId;
  const [isLoading, setIsLoading] = useState(true);
  const [fileName, setFileName] = useState("");
  const [saved, setSaved] = useState("");
  const [draft, setDraft] = useState("");
  const [diagnostics, setDiagnostics] = useState<Diagnostic[] | null>(null);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [queuedRunId, setQueuedRunId] = useState<string | null>(null);
  const [runsReloadKey, setRunsReloadKey] = useState(0);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [loadErrorStatus, setLoadErrorStatus] = useState<number | null>(null);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const dirty = draft !== saved;
  const treeFileName = tree
    .flatMap((project) => project.modules)
    .flatMap((module) => module.testFiles)
    .find((testFile) => testFile.id === testFileId)?.name;
  const headingName = treeFileName ?? fileName;

  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    setFileName("");
    setSaved("");
    setDraft("");
    setDiagnostics(null);
    setRunMessage(null);
    setQueuedRunId(null);
    setAlertMessage(null);
    setLoadErrorStatus(null);
    setLoadErrorMessage(null);
    setIsValidating(false);
    setIsSaving(false);
    setIsRunning(false);

    const loadTestFile = async () => {
      try {
        const testFile = await apiClient.getTestFile(testFileId);

        if (cancelled) {
          return;
        }

        setFileName(testFile.name);
        setSaved(testFile.source ?? "");
        setDraft(testFile.source ?? "");
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (error instanceof ApiError) {
          if (error.status === 404) {
            setLoadErrorStatus(404);
            return;
          }

          setLoadErrorMessage(errorText(error));
          return;
        }

        setLoadErrorMessage(errorText(error));
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadTestFile();

    return () => {
      cancelled = true;
    };
  }, [testFileId]);

  const handleDraftChange = (value: string) => {
    setDraft(value);
    setDiagnostics(null);
    setRunMessage(null);
    setQueuedRunId(null);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      event.target.value = "";
      return;
    }

    const nextSource = await file.text();
    setDraft(nextSource);
    setDiagnostics(null);
    setRunMessage(null);
    setQueuedRunId(null);
    event.target.value = "";
  };

  const handleValidate = async () => {
    if (isValidating) {
      return;
    }

    setAlertMessage(null);
    setIsValidating(true);

    try {
      const response = await apiClient.validateSource(draft);
      setDiagnostics(response.diagnostics);
    } catch (error) {
      setAlertMessage(errorText(error));
    } finally {
      setIsValidating(false);
    }
  };

  const saveDraft = async (): Promise<boolean> => {
    setIsSaving(true);

    try {
      const response = await apiClient.updateTestFile(testFileId, draft);
      // The answer carries the saved source (backend.md 1.3); the draft is what was sent, if it ever does not.
      const savedSource = response.testFile.source ?? draft;
      setFileName(response.testFile.name);
      setSaved(savedSource);
      setDraft(savedSource);
      setDiagnostics(response.diagnostics);

      try {
        await refreshTree();
      } catch (error) {
        setAlertMessage(errorText(error));
      }

      return true;
    } catch (error) {
      setAlertMessage(errorText(error));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (isSaving || !dirty) {
      return;
    }

    setAlertMessage(null);
    void saveDraft();
  };

  const handleRun = async () => {
    if (isRunning) {
      return;
    }

    setAlertMessage(null);
    setRunMessage(null);
    setQueuedRunId(null);
    setIsRunning(true);

    try {
      if (dirty) {
        const didSave = await saveDraft();
        if (!didSave) {
          return;
        }
      }

      const run = await apiClient.startRun(testFileId);
      setRunMessage("Run queued.");
      setQueuedRunId(run.id);
      setRunsReloadKey((previous) => previous + 1);
      setDiagnostics(null);

      try {
        await refreshTree();
      } catch (error) {
        setAlertMessage(errorText(error));
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 422 && Array.isArray(error.details)) {
        setDiagnostics(error.details as Diagnostic[]);
        return;
      }

      setAlertMessage(errorText(error));
    } finally {
      setIsRunning(false);
    }
  };

  if (isLoading) {
    return (
      <section className="mx-auto max-w-5xl">
        <p className="text-muted-foreground">Loading…</p>
      </section>
    );
  }

  if (loadErrorStatus === 404) {
    return (
      <section className="mx-auto max-w-5xl">
        <p className="text-muted-foreground">Test file not found</p>
      </section>
    );
  }

  if (loadErrorMessage !== null) {
    return (
      <section className="mx-auto max-w-5xl">
        <p role="alert" className="text-destructive">
          {loadErrorMessage}
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="font-mono text-xl font-semibold">{headingName}</h1>
        {dirty && <Badge variant="warning">Unsaved changes</Badge>}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={handleUploadClick}>
            <Upload data-icon="inline-start" aria-hidden="true" />
            Upload file
          </Button>
          <Button type="button" variant="outline" onClick={handleValidate} disabled={isValidating}>
            <FileCheck2 data-icon="inline-start" aria-hidden="true" />
            Validate
          </Button>
          <Button type="button" variant="secondary" onClick={handleSave} disabled={!dirty || isSaving}>
            <Save data-icon="inline-start" aria-hidden="true" />
            Save
          </Button>
          <Button type="button" onClick={handleRun} disabled={isRunning}>
            <Play data-icon="inline-start" aria-hidden="true" />
            Run
          </Button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".yaml,.yml"
        onChange={(event) => {
          void handleUpload(event);
        }}
      />

      {alertMessage && (
        <p role="alert" className="text-destructive">
          {alertMessage}
        </p>
      )}

      {runMessage && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="status">{runMessage}</p>
          {queuedRunId && (
            <Link className="text-info underline underline-offset-4" href={`/runs/${queuedRunId}`}>
              View run
            </Link>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="test-file-yaml" className="text-muted-foreground">
          Test file YAML
        </Label>
        <textarea
          id="test-file-yaml"
          aria-label="Test file YAML"
          spellCheck={false}
          value={draft}
          onChange={(event) => handleDraftChange(event.target.value)}
          className="min-h-96 w-full rounded-lg border border-input bg-code px-3 py-2 font-mono text-[0.8125rem] leading-relaxed text-code-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {/* Empty until Validate, Save or a refused Run fills it; an edit clears it (frontend.md 1.7). */}
      <section
        aria-label="Validation"
        className={cn("space-y-2", diagnostics !== null && "rounded-xl bg-card p-3 ring-1 ring-foreground/10")}
      >
        {diagnostics !== null && (
          <>
            <p
              className={cn(
                "flex items-center gap-2 font-medium",
                diagnostics.length === 0 ? "text-success" : "text-destructive",
              )}
            >
              {diagnostics.length === 0 ? (
                <CircleCheck aria-hidden="true" className="size-4" />
              ) : (
                <CircleAlert aria-hidden="true" className="size-4" />
              )}
              {validationSummary(diagnostics)}
            </p>
            <ul className="space-y-1 font-mono text-[0.8125rem]">
              {diagnostics.map((diagnostic, index) => (
                <li key={`${diagnostic.code}-${diagnostic.line}-${index}`}>{formatDiagnostic(diagnostic)}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      <RunList testFileId={testFileId} reloadKey={runsReloadKey} />
    </section>
  );
}
