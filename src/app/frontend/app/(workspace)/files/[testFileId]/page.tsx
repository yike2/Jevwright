"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ApiError, apiClient, type Diagnostic } from "@/lib/api";
import { formatDiagnostic, validationSummary } from "@/lib/editor";
import { useWorkspace } from "@/lib/workspace-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RunList } from "@/components/workspace/run-list";

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

          setLoadErrorMessage(error.message);
          return;
        }

        setLoadErrorMessage(error instanceof Error ? error.message : "Internal server error");
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
      setAlertMessage(error instanceof Error ? error.message : "Internal server error");
    } finally {
      setIsValidating(false);
    }
  };

  const saveDraft = async (): Promise<boolean> => {
    setIsSaving(true);

    try {
      const response = await apiClient.updateTestFile(testFileId, draft);
      setFileName(response.testFile.name);
      setSaved(response.testFile.source ?? "");
      setDraft(response.testFile.source ?? "");
      setDiagnostics(response.diagnostics);

      try {
        await refreshTree();
      } catch (error) {
        setAlertMessage(error instanceof Error ? error.message : "Internal server error");
      }

      return true;
    } catch (error) {
      setAlertMessage(error instanceof Error ? error.message : "Internal server error");
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
        setAlertMessage(error instanceof Error ? error.message : "Internal server error");
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 422 && Array.isArray(error.details)) {
        setDiagnostics(error.details as Diagnostic[]);
        return;
      }

      setAlertMessage(error instanceof Error ? error.message : "Internal server error");
    } finally {
      setIsRunning(false);
    }
  };

  if (isLoading) {
    return (
      <section className="rounded-lg border border-border bg-background p-6">
        <p className="text-foreground">Loading…</p>
      </section>
    );
  }

  if (loadErrorStatus === 404) {
    return (
      <section className="rounded-lg border border-border bg-background p-6">
        <p className="text-foreground">Test file not found</p>
      </section>
    );
  }

  if (loadErrorMessage !== null) {
    return (
      <section className="rounded-lg border border-border bg-background p-6">
        <p role="alert">{loadErrorMessage}</p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-background p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{headingName}</h1>
        {dirty && <p className="text-sm text-muted-foreground">Unsaved changes</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={handleUploadClick}>
          Upload file
        </Button>
        <Button type="button" variant="outline" onClick={handleValidate} disabled={isValidating}>
          Validate
        </Button>
        <Button type="button" onClick={handleSave} disabled={!dirty || isSaving}>
          Save
        </Button>
        <Button type="button" onClick={handleRun} disabled={isRunning}>
          Run
        </Button>
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
        <p role="alert" className="text-sm text-destructive">
          {alertMessage}
        </p>
      )}

      {runMessage && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="status">{runMessage}</p>
          {queuedRunId && (
            <Link className="text-sm text-foreground underline underline-offset-4" href={`/runs/${queuedRunId}`}>
              View run
            </Link>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="test-file-yaml">Test file YAML</Label>
        <textarea
          id="test-file-yaml"
          aria-label="Test file YAML"
          value={draft}
          onChange={(event) => handleDraftChange(event.target.value)}
          className="min-h-80 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      <section aria-label="Validation" className="space-y-2 rounded-lg border border-border bg-background p-4">
        {diagnostics !== null && (
          <>
            <p className="text-sm text-foreground">{validationSummary(diagnostics)}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
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
