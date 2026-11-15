"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePanelRef, type PanelImperativeHandle } from "react-resizable-panels";
import { ApiError, apiClient, type Diagnostic, type Run } from "@/lib/api";
import { fileState, fileStateLabel, formatDiagnostic, hasNewDiagnostics, problemsSummary } from "@/lib/editor";
import { errorText } from "@/lib/format-error";
import { usePanelLayout } from "@/lib/panel-layout";
import { useMediaQuery } from "@/lib/use-media-query";
import { useRun } from "@/lib/use-run";
import { formatDuration, runErrorText, runStatusLabel, stepStatusLabel } from "@/lib/runs";
import { useWorkspace } from "@/lib/workspace-context";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { CodeEditor, type CodeEditorHandle } from "@/components/workspace/code-editor";
import { ConsolePanel } from "@/components/workspace/console-panel";
import { RunDetailsSheet } from "@/components/workspace/run-details-sheet";
import { RunList } from "@/components/workspace/run-list";
import { StatusBadge, StatusIcon } from "@/components/workspace/status-badge";
import { PanelRight, Play, Save } from "lucide-react";
import { cn } from "cn";

// The validation request waits until typing pauses (frontend.md 1.7).
const VALIDATE_DELAY_MS = 400;
// A collapsed console keeps its header; the whole console column collapses to nothing.
const CONSOLE_HEADER = "33px";

type Validated = { source: string; diagnostics: Diagnostic[] };

export default function TestFilePage() {
  const params = useParams<{ testFileId: string }>();
  const testFileId = params.testFileId;
  const [load, setLoad] = useState<
    { kind: "loading" } | { kind: "notFound" } | { kind: "error"; message: string } | { kind: "ready" }
  >({ kind: "loading" });
  const [fileName, setFileName] = useState("");
  const [saved, setSaved] = useState("");
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoad({ kind: "loading" });

    apiClient.getTestFile(testFileId).then(
      (testFile) => {
        if (cancelled) return;
        setFileName(testFile.name);
        setSaved(testFile.source ?? "");
        setDraft(testFile.source ?? "");
        setLoad({ kind: "ready" });
      },
      (error: unknown) => {
        if (cancelled) return;
        setLoad(
          error instanceof ApiError && error.status === 404
            ? { kind: "notFound" }
            : { kind: "error", message: errorText(error) },
        );
      },
    );

    return () => {
      cancelled = true;
    };
  }, [testFileId]);

  if (load.kind !== "ready") {
    return (
      <section className="p-4">
        {load.kind === "loading" && <p className="text-muted-foreground">Loading…</p>}
        {load.kind === "notFound" && <p className="text-muted-foreground">Test file not found</p>}
        {load.kind === "error" && (
          <p role="alert" className="text-destructive">
            {load.message}
          </p>
        )}
      </section>
    );
  }

  return (
    <Workbench
      key={testFileId}
      testFileId={testFileId}
      loadedName={fileName}
      saved={saved}
      draft={draft}
      onSaved={(name, source) => {
        setFileName(name);
        setSaved(source);
        setDraft(source);
      }}
      onDraftChange={setDraft}
    />
  );
}

type WorkbenchProps = {
  testFileId: string;
  loadedName: string;
  saved: string;
  draft: string;
  onSaved: (name: string, source: string) => void;
  onDraftChange: (source: string) => void;
};

/** The editor, its console column and its status bar (frontend.md 1.7). */
function Workbench({ testFileId, loadedName, saved, draft, onSaved, onDraftChange }: WorkbenchProps) {
  const { tree, refreshTree } = useWorkspace();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const editorRef = useRef<CodeEditorHandle | null>(null);

  const [validated, setValidated] = useState<Validated | null>(null);
  const [validateError, setValidateError] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [isSaving, setIsSaving] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [savedSinceRun, setSavedSinceRun] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [detailsRunId, setDetailsRunId] = useState<string | null>(null);

  const consolesRef = usePanelRef();
  const problemsRef = usePanelRef();
  const runRef = usePanelRef();
  const [open, setOpen] = useState({ consoles: true, problems: true, run: true });
  const outerLayout = usePanelLayout(isDesktop ? "editor" : "editor-narrow");
  const consoleLayout = usePanelLayout("consoles");

  const dirty = draft !== saved;
  const treeFile = tree
    .flatMap((project) => project.modules)
    .flatMap((module) => module.testFiles)
    .find((testFile) => testFile.id === testFileId);
  const headingName = treeFile?.name ?? loadedName;

  const live = useRun(runId, () => {
    setHistoryKey((previous) => previous + 1);
    refreshTree().catch((error: unknown) => setAlertMessage(errorText(error)));
  });
  const liveRun = live.kind === "ready" ? live.run : null;
  const runStatus = liveRun?.status ?? treeFile?.latestRun?.status ?? null;
  const state = fileState({ dirty, runStatus, savedSinceRun });
  const diagnostics = validated?.diagnostics ?? [];

  const expand = (panel: PanelImperativeHandle | null) => {
    if (panel?.isCollapsed()) panel.expand();
  };
  const toggle = (panel: PanelImperativeHandle | null) => {
    if (panel === null) return;
    if (panel.isCollapsed()) panel.expand();
    else panel.collapse();
  };
  const track = (key: keyof typeof open, panel: { current: PanelImperativeHandle | null }) => () => {
    const isOpen = panel.current !== null && !panel.current.isCollapsed();
    setOpen((previous) => (previous[key] === isOpen ? previous : { ...previous, [key]: isOpen }));
  };

  // Diagnostics as the user types: the latest answer for the source in the editor wins.
  const shownDiagnostics = useRef<Diagnostic[]>([]);
  const showDiagnostics = useCallback(
    (next: Validated) => {
      // A collapsed Problems console opens only for something new to report (frontend.md 1.7).
      if (hasNewDiagnostics(shownDiagnostics.current, next.diagnostics)) {
        expand(consolesRef.current);
        expand(problemsRef.current);
      }
      shownDiagnostics.current = next.diagnostics;
      setValidated(next);
    },
    [consolesRef, problemsRef],
  );

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      apiClient.validateSource(draft).then(
        (response) => {
          if (cancelled) return;
          setValidateError(null);
          showDiagnostics({ source: draft, diagnostics: response.diagnostics });
        },
        (error: unknown) => !cancelled && setValidateError(errorText(error)),
      );
    }, VALIDATE_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [draft, showDiagnostics]);

  const saveDraft = async (): Promise<boolean> => {
    setIsSaving(true);
    try {
      const response = await apiClient.updateTestFile(testFileId, draft);
      // The answer carries the saved source (backend.md 1.3); the draft is what was sent, if it ever does not.
      const source = response.testFile.source ?? draft;
      onSaved(response.testFile.name, source);
      setSavedSinceRun(true);
      showDiagnostics({ source, diagnostics: response.diagnostics });
      refreshTree().catch((error: unknown) => setAlertMessage(errorText(error)));
      return true;
    } catch (error) {
      setAlertMessage(errorText(error));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const save = async () => {
    if (isSaving || !dirty) return;
    setAlertMessage(null);
    await saveDraft();
  };

  const run = async () => {
    if (isStarting) return;
    setAlertMessage(null);
    setRunError(null);
    setIsStarting(true);
    // Run reports in the Run console, which opens for it and stays open (frontend.md 1.7).
    expand(consolesRef.current);
    expand(runRef.current);

    try {
      if (dirty && !(await saveDraft())) return;
      const started: Run = await apiClient.startRun(testFileId);
      setRunId(started.id);
      setSavedSinceRun(false);
      setHistoryKey((previous) => previous + 1);
      refreshTree().catch((error: unknown) => setAlertMessage(errorText(error)));
    } catch (error) {
      if (error instanceof ApiError && error.status === 422 && Array.isArray(error.details)) {
        showDiagnostics({ source: draft, diagnostics: error.details as Diagnostic[] });
        expand(problemsRef.current);
      }
      setRunError(errorText(error));
    } finally {
      setIsStarting(false);
    }
  };

  // Ctrl/Cmd+S saves and Ctrl/Cmd+Enter runs, wherever the focus is on the page; the capture phase runs before
  // the editor's own keymap, which would insert a blank line on Ctrl+Enter.
  const shortcuts = useRef({ save, run });
  shortcuts.current = { save, run };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key === "s" || event.key === "S") {
        event.preventDefault();
        event.stopPropagation();
        void shortcuts.current.save();
      } else if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        void shortcuts.current.run();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const consolesToggle = (className?: string) => (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={className}
      aria-label="Toggle consoles"
      aria-expanded={open.consoles}
      title={open.consoles ? "Hide consoles" : "Show consoles"}
      onClick={() => toggle(consolesRef.current)}
    >
      <PanelRight aria-hidden="true" />
    </Button>
  );

  const problems = (
    <ConsolePanel
      title="Problems"
      summary={problemsSummary(diagnostics)}
      expanded={open.problems}
      onToggle={() => toggle(problemsRef.current)}
    >
      {validateError && (
        <p role="alert" className="text-destructive">
          {validateError}
        </p>
      )}
      {diagnostics.length === 0 ? (
        <p className="text-muted-foreground">No problems</p>
      ) : (
        <ul className="space-y-0.5 font-mono text-[0.8125rem]">
          {diagnostics.map((diagnostic, index) => (
            <li key={`${diagnostic.code}-${diagnostic.line}-${index}`} className="flex items-start gap-2">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-start gap-2 rounded-sm px-1 py-0.5 text-left hover:bg-accent"
                onClick={() => editorRef.current?.goToLine(diagnostic.line)}
              >
                <StatusIcon status="failed" className="mt-0.5" />
                <span>{formatDiagnostic(diagnostic)}</span>
              </button>
              <span className="shrink-0 py-0.5 text-muted-foreground">{diagnostic.code}</span>
            </li>
          ))}
        </ul>
      )}
    </ConsolePanel>
  );

  const runConsole = (
    <ConsolePanel
      title="Run"
      summary={liveRun ? runStatusLabel(liveRun.status) : undefined}
      expanded={open.run}
      onToggle={() => toggle(runRef.current)}
    >
      <div className="space-y-3">
        {runError && (
          <p role="alert" className="text-destructive">
            {runError}
          </p>
        )}
        <div aria-live="polite" className="space-y-2 empty:hidden">
          {live.kind === "error" && <p className="text-destructive">{live.message}</p>}
          {liveRun && live.kind === "ready" && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={liveRun.status} label={runStatusLabel(liveRun.status)} />
                {liveRun.summary && (
                  <span>
                    {liveRun.summary.passed}/{liveRun.summary.total} passed
                  </span>
                )}
                <span className="text-muted-foreground">{formatDuration(liveRun.durationMs)}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={() => setDetailsRunId(liveRun.id)}
                >
                  Open run details
                </Button>
              </div>
              {liveRun.error && <p className="text-destructive">{runErrorText(liveRun.error)}</p>}
              {live.disconnected && <p className="text-destructive">Live progress disconnected</p>}
              <ol aria-label="Progress" className="space-y-0.5">
                {(liveRun.report?.steps ?? live.steps).map((step) => (
                  <li key={step.index} className="text-[0.8125rem]">
                    <div className="flex items-center gap-2">
                      <StatusIcon status={step.status} />
                      <span>Step {step.index + 1}</span>
                      <span className="font-mono">{step.action}</span>
                      <span className="text-muted-foreground">line {step.line}</span>
                      <span className="ml-auto text-muted-foreground">{stepStatusLabel(step.status)}</span>
                    </div>
                    {"reason" in step && <p className="pl-6 text-destructive">{step.reason}</p>}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
        <RunList testFileId={testFileId} reloadKey={historyKey} onOpen={setDetailsRunId} />
      </div>
    </ConsolePanel>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-code">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b bg-background px-3 py-1.5">
        <h1 className="min-w-0 truncate font-mono text-sm font-semibold" title={headingName}>
          {headingName}
        </h1>
        <span role="status" aria-label="File state">
          <StatusBadge status={state} label={fileStateLabel(state)} />
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void save()}
            disabled={!dirty || isSaving}
            title="Save (Ctrl+S)"
            aria-keyshortcuts="Control+S Meta+S"
          >
            <Save data-icon="inline-start" aria-hidden="true" />
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void run()}
            disabled={isStarting}
            title="Run (Ctrl+Enter)"
            aria-keyshortcuts="Control+Enter Meta+Enter"
          >
            <Play data-icon="inline-start" aria-hidden="true" />
            Run
          </Button>
          {consolesToggle()}
        </div>
      </header>

      {alertMessage && (
        <p role="alert" className="shrink-0 border-b bg-destructive/12 px-3 py-1 text-destructive">
          {alertMessage}
        </p>
      )}

      <ResizablePanelGroup
        id={isDesktop ? "editor" : "editor-narrow"}
        key={isDesktop ? "wide" : "narrow"}
        orientation={isDesktop ? "horizontal" : "vertical"}
        className="min-h-0 flex-1"
        defaultLayout={outerLayout.defaultLayout}
        onLayoutChanged={outerLayout.onLayoutChanged}
      >
        <ResizablePanel id="source" defaultSize="60%" minSize="25%">
          <CodeEditor
            ref={editorRef}
            label="Test file YAML"
            value={draft}
            onChange={onDraftChange}
            onCursorChange={setCursor}
            diagnostics={diagnostics}
            diagnosticsSource={validated?.source ?? ""}
          />
        </ResizablePanel>
        <ResizableHandle aria-label="Resize consoles" />
        <ResizablePanel
          id="consoles"
          panelRef={consolesRef}
          defaultSize="40%"
          minSize="220px"
          collapsible
          collapsedSize="0px"
          onResize={track("consoles", consolesRef)}
        >
          {/* A collapsed column is out of the tab order, as if it were closed. */}
          <div className="h-full" inert={!open.consoles}>
            <ResizablePanelGroup
              id="consoles"
              orientation="vertical"
              defaultLayout={consoleLayout.defaultLayout}
              onLayoutChanged={consoleLayout.onLayoutChanged}
            >
              <ResizablePanel
                id="problems"
                panelRef={problemsRef}
                defaultSize="50%"
                minSize="96px"
                collapsible
                collapsedSize={CONSOLE_HEADER}
                onResize={track("problems", problemsRef)}
              >
                {problems}
              </ResizablePanel>
              <ResizableHandle aria-label="Resize Problems and Run" />
              <ResizablePanel
                id="run"
                panelRef={runRef}
                defaultSize="50%"
                minSize="96px"
                collapsible
                collapsedSize={CONSOLE_HEADER}
                onResize={track("run", runRef)}
              >
                {runConsole}
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      <section
        aria-label="Status bar"
        className="flex h-7 shrink-0 items-center gap-3 border-t bg-background px-3 text-xs text-muted-foreground"
      >
        <span className="flex items-center gap-1 text-foreground">
          <StatusIcon status={state} className="size-3.5" />
          {fileStateLabel(state)}
        </span>
        <button
          type="button"
          className={cn("rounded-sm px-1 hover:bg-accent", diagnostics.length > 0 && "text-destructive")}
          onClick={() => {
            expand(consolesRef.current);
            expand(problemsRef.current);
          }}
        >
          {problemsSummary(diagnostics)}
        </button>
        {runStatus !== null && (
          <span className="flex items-center gap-1">
            <StatusIcon status={runStatus} className="size-3.5" />
            Last run: {runStatusLabel(runStatus)}
          </span>
        )}
        <span className="ml-auto">
          Ln {cursor.line}, Col {cursor.column}
        </span>
        {consolesToggle("size-6")}
      </section>

      <RunDetailsSheet runId={detailsRunId} onClose={() => setDetailsRunId(null)} />
    </div>
  );
}
