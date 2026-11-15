"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";
import { apiClient, type TreeResponse } from "@/lib/api";
import {
  confirmDeleteText,
  deletesTestFile,
  initials,
  starterSource,
  statusOf,
  statusTitle,
  testFileBaseName,
  toTestFileName,
  uploadedTestFileName,
  type DeleteTarget,
  type DeleteTargetKind,
} from "@/lib/sidebar";
import { errorText } from "@/lib/format-error";
import { Button, buttonVariants } from "@/components/ui/button";
import { nameProblem, testFileNameProblem } from "@/lib/validation";
import { ConfirmDeleteDialog } from "@/components/workspace/confirm-delete-dialog";
import { InlineNameInput } from "@/components/workspace/inline-name-input";
import { TreeNameTooltip } from "@/components/workspace/tree-name";
import { ChevronRight, KeyRound, LogOut, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { cn } from "cn";
import { WORKSPACE_HOME } from "@/lib/routes";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BrandMark } from "@/components/landing/brand-mark";
import { StatusIcon } from "@/components/workspace/status-badge";

type WorkspaceSidebarProps = {
  email: string;
  tree: TreeResponse["items"];
  refreshTree: () => Promise<void>;
  onLogout: () => void;
  onNavigate?: () => void;
};

// The one row being named in place: an existing row being renamed, or a new row under its parent.
type Editing =
  | { mode: "rename"; kind: DeleteTargetKind; id: string; name: string }
  | { mode: "create"; kind: "project" }
  | { mode: "create"; kind: "module" | "testFile"; parentId: string };

type DeleteTargetWithName = DeleteTarget & { name: string };

const KIND_WORDS: Record<DeleteTargetKind, string> = { project: "project", module: "module", testFile: "test file" };

export function SidebarNav({ email, tree, refreshTree, onLogout, onNavigate }: WorkspaceSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadModuleId = useRef<string | null>(null);

  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    () => new Set(tree.map((project) => project.id)),
  );
  const [expandedModules, setExpandedModules] = useState<Set<string>>(
    () => new Set(tree.flatMap((project) => project.modules.map((module) => module.id))),
  );

  const seenProjectIds = useRef<Set<string>>(new Set(tree.map((project) => project.id)));
  const seenModuleIds = useRef<Set<string>>(
    new Set(tree.flatMap((project) => project.modules.map((module) => module.id))),
  );

  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTargetWithName | null>(null);
  const [uploadError, setUploadError] = useState<{ moduleId: string; message: string } | null>(null);

  useEffect(() => {
    const newProjectIds: string[] = [];
    const newModuleIds: string[] = [];

    for (const project of tree) {
      if (!seenProjectIds.current.has(project.id)) {
        seenProjectIds.current.add(project.id);
        newProjectIds.push(project.id);
      }

      for (const module of project.modules) {
        if (!seenModuleIds.current.has(module.id)) {
          seenModuleIds.current.add(module.id);
          newModuleIds.push(module.id);
        }
      }
    }

    if (newProjectIds.length > 0) {
      setExpandedProjects((previous) => new Set([...previous, ...newProjectIds]));
    }

    if (newModuleIds.length > 0) {
      setExpandedModules((previous) => new Set([...previous, ...newModuleIds]));
    }
  }, [tree]);

  const currentFileId = pathname?.startsWith("/files/") ? pathname.slice("/files/".length) : null;
  const currentProjectId = /^\/projects\/([^/]+)\/variables$/.exec(pathname ?? "")?.[1] ?? null;

  const toggle = (setter: typeof setExpandedProjects, id: string, open?: boolean) => {
    setter((previous) => {
      const next = new Set(previous);
      if (open ?? !next.has(id)) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const startCreate = (next: Editing) => {
    if (next.mode === "create" && next.kind === "module") toggle(setExpandedProjects, next.parentId, true);
    if (next.mode === "create" && next.kind === "testFile") toggle(setExpandedModules, next.parentId, true);
    setEditing(next);
  };

  // F2 renames the focused row, as in a file manager.
  const renameOnF2 = (target: Extract<Editing, { mode: "rename" }>) => (event: KeyboardEvent) => {
    if (event.key === "F2") {
      event.preventDefault();
      setEditing(target);
    }
  };

  const refreshQuietly = async () => {
    try {
      await refreshTree();
    } catch {
      // The change is done; the tree catches up on its next refresh.
    }
  };

  const handleCreate = async (target: Extract<Editing, { mode: "create" }>, name: string) => {
    if (target.kind === "project") {
      await apiClient.createProject(name);
      setEditing(null);
      await refreshQuietly();
      return;
    }
    if (target.kind === "module") {
      await apiClient.createModule(target.parentId, name);
      setEditing(null);
      await refreshQuietly();
      return;
    }

    const fileName = toTestFileName(name);
    const created = await apiClient.createTestFile(target.parentId, fileName, starterSource(fileName));
    setEditing(null);
    await refreshQuietly();
    router.push(`/files/${created.testFile.id}`);
    onNavigate?.();
  };

  const handleRename = async (target: Extract<Editing, { mode: "rename" }>, name: string) => {
    if (target.kind === "project") {
      await apiClient.renameProject(target.id, name);
    } else if (target.kind === "module") {
      await apiClient.renameModule(target.id, name);
    } else {
      await apiClient.renameTestFile(target.id, toTestFileName(name));
    }
    setEditing(null);
    await refreshQuietly();
  };

  const handleDelete = async () => {
    if (deleteTarget === null) {
      return;
    }

    if (deleteTarget.kind === "project") {
      await apiClient.deleteProject(deleteTarget.id);
    } else if (deleteTarget.kind === "module") {
      await apiClient.deleteModule(deleteTarget.id);
    } else {
      await apiClient.deleteTestFile(deleteTarget.id);
    }

    const leavesCurrentPage =
      deletesTestFile({ items: tree }, deleteTarget, currentFileId) ||
      (deleteTarget.kind === "project" && deleteTarget.id === currentProjectId);
    if (leavesCurrentPage) {
      router.replace(WORKSPACE_HOME);
      onNavigate?.();
    }

    await refreshQuietly();
  };

  const startUpload = (moduleId: string) => {
    uploadModuleId.current = moduleId;
    setUploadError(null);
    fileInputRef.current?.click();
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const moduleId = uploadModuleId.current;
    event.target.value = "";
    if (!file || moduleId === null) return;

    const name = uploadedTestFileName(file.name);
    const problem = testFileNameProblem(testFileBaseName(name));
    if (problem !== null) {
      setUploadError({ moduleId, message: `${file.name}: ${problem}` });
      return;
    }

    try {
      const created = await apiClient.createTestFile(moduleId, name, await file.text());
      toggle(setExpandedModules, moduleId, true);
      await refreshQuietly();
      router.push(`/files/${created.testFile.id}`);
      onNavigate?.();
    } catch (error) {
      setUploadError({ moduleId, message: `${file.name}: ${errorText(error)}` });
    }
  };

  const renaming = (kind: DeleteTargetKind, id: string) =>
    editing?.mode === "rename" && editing.kind === kind && editing.id === id ? editing : null;

  const newRow = (kind: "project" | "module" | "testFile", parentId?: string) => {
    if (editing?.mode !== "create" || editing.kind !== kind) return null;
    if (editing.kind !== "project" && editing.parentId !== parentId) return null;
    const target = editing;
    return (
      <div className="flex h-8 items-center rounded-md px-1">
        <InlineNameInput
          initialName=""
          validate={kind === "testFile" ? testFileNameProblem : nameProblem}
          suffix={kind === "testFile" ? ".yaml" : undefined}
          onSubmit={(name) => handleCreate(target, name)}
          onCancel={() => setEditing(null)}
        />
      </div>
    );
  };

  const renameInput = (target: Extract<Editing, { mode: "rename" }>) => (
    <InlineNameInput
      initialName={target.kind === "testFile" ? testFileBaseName(target.name) : target.name}
      validate={target.kind === "testFile" ? testFileNameProblem : nameProblem}
      suffix={target.kind === "testFile" ? ".yaml" : undefined}
      onSubmit={(name) => handleRename(target, name)}
      onCancel={() => setEditing(null)}
      className="px-1"
    />
  );

  // Row actions stay in the accessibility tree; with a mouse they show on hover or focus, on touch always.
  const rowAction =
    "pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 pointer-fine:group-focus-within/row:opacity-100";

  const rowButtons = (kind: DeleteTargetKind, id: string, name: string, extra?: ReactNode) => (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className={rowAction}
        aria-label={`Rename ${KIND_WORDS[kind]} ${name}`}
        title="Rename (F2)"
        onClick={() => setEditing({ mode: "rename", kind, id, name })}
      >
        <Pencil />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className={rowAction}
        aria-label={`Delete ${KIND_WORDS[kind]} ${name}`}
        title="Delete"
        onClick={() => setDeleteTarget({ kind, id, name })}
      >
        <Trash2 />
      </Button>
      {extra}
    </>
  );

  return (
    <>
      <div className="flex h-full flex-col">
        {/* The brand sits outside the "Projects" navigation, whose links are only the tree's Test Files. */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-sidebar-border px-3">
          <Link
            href="/"
            aria-label="Jevwright home"
            className="flex items-center gap-2 rounded-md font-heading font-semibold"
            onClick={() => onNavigate?.()}
          >
            <BrandMark />
            Jevwright
          </Link>
        </div>
        <nav aria-label="Projects" className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-3 pt-3 pb-1">
            <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Projects</h2>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="New project"
              title="New project"
              onClick={() => startCreate({ mode: "create", kind: "project" })}
            >
              <Plus aria-hidden="true" />
            </Button>
          </div>

          <div className="min-h-0 flex-1 space-y-1 overflow-auto px-2 pb-3">
            {newRow("project")}
            {tree.map((project) => {
              const isProjectOpen = expandedProjects.has(project.id);
              const projectRename = renaming("project", project.id);
              const projectTarget = { mode: "rename", kind: "project", id: project.id, name: project.name } as const;

              return (
                <div key={project.id}>
                  <div className="group/row flex min-h-8 items-center gap-0.5 rounded-md hover:bg-accent">
                    {projectRename ? (
                      renameInput(projectRename)
                    ) : (
                      <TreeNameTooltip name={project.name}>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="min-w-0 flex-1 justify-start gap-1 px-1 font-semibold hover:bg-transparent aria-expanded:bg-transparent"
                          aria-expanded={isProjectOpen}
                          onClick={() => toggle(setExpandedProjects, project.id)}
                          onKeyDown={renameOnF2(projectTarget)}
                        >
                          <ChevronRight
                            aria-hidden="true"
                            className={cn(
                              "transition-transform motion-reduce:transition-none",
                              isProjectOpen && "rotate-90",
                            )}
                          />
                          <span data-tree-name className="truncate">
                            {project.name}
                          </span>
                        </Button>
                      </TreeNameTooltip>
                    )}
                    {rowButtons(
                      "project",
                      project.id,
                      project.name,
                      <>
                        <Link
                          href={`/projects/${project.id}/variables`}
                          aria-label={`Variables for ${project.name}`}
                          title={`Variables for ${project.name}`}
                          aria-current={currentProjectId === project.id ? "page" : undefined}
                          className={buttonVariants({ variant: "ghost", size: "icon-xs" })}
                          onClick={() => onNavigate?.()}
                        >
                          <KeyRound aria-hidden="true" />
                        </Link>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`New module in ${project.name}`}
                          title="New module"
                          onClick={() => startCreate({ mode: "create", kind: "module", parentId: project.id })}
                        >
                          <Plus />
                        </Button>
                      </>,
                    )}
                  </div>

                  {isProjectOpen && (
                    <div className="ml-3 border-l border-sidebar-border pl-1">
                      {newRow("module", project.id)}
                      {project.modules.map((module) => {
                        const isModuleOpen = expandedModules.has(module.id);
                        const moduleRename = renaming("module", module.id);
                        const moduleTarget = {
                          mode: "rename",
                          kind: "module",
                          id: module.id,
                          name: module.name,
                        } as const;

                        return (
                          <div key={module.id}>
                            <div className="group/row flex min-h-8 items-center gap-0.5 rounded-md hover:bg-accent">
                              {moduleRename ? (
                                renameInput(moduleRename)
                              ) : (
                                <TreeNameTooltip name={module.name}>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="min-w-0 flex-1 justify-start gap-1 px-1 hover:bg-transparent aria-expanded:bg-transparent"
                                    aria-expanded={isModuleOpen}
                                    onClick={() => toggle(setExpandedModules, module.id)}
                                    onKeyDown={renameOnF2(moduleTarget)}
                                  >
                                    <ChevronRight
                                      aria-hidden="true"
                                      className={cn(
                                        "transition-transform motion-reduce:transition-none",
                                        isModuleOpen && "rotate-90",
                                      )}
                                    />
                                    <span data-tree-name className="truncate">
                                      {module.name}
                                    </span>
                                  </Button>
                                </TreeNameTooltip>
                              )}
                              {rowButtons(
                                "module",
                                module.id,
                                module.name,
                                <>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    className={rowAction}
                                    aria-label={`Upload file to ${module.name}`}
                                    title="Upload file"
                                    onClick={() => startUpload(module.id)}
                                  >
                                    <Upload />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    aria-label={`New test file in ${module.name}`}
                                    title="New test file"
                                    onClick={() =>
                                      startCreate({ mode: "create", kind: "testFile", parentId: module.id })
                                    }
                                  >
                                    <Plus />
                                  </Button>
                                </>,
                              )}
                            </div>
                            {uploadError?.moduleId === module.id && (
                              <p role="alert" className="ml-4 px-1 py-0.5 text-xs text-destructive">
                                {uploadError.message}
                              </p>
                            )}

                            {isModuleOpen && (
                              <div className="ml-3 border-l border-sidebar-border pl-1">
                                {newRow("testFile", module.id)}
                                {module.testFiles.map((testFile) => {
                                  const dot = statusOf(testFile.latestRun);
                                  const isCurrent = currentFileId === testFile.id;
                                  const fileRename = renaming("testFile", testFile.id);
                                  const fileTarget = {
                                    mode: "rename",
                                    kind: "testFile",
                                    id: testFile.id,
                                    name: testFile.name,
                                  } as const;

                                  return (
                                    <div
                                      key={testFile.id}
                                      className={cn(
                                        "group/row flex min-h-7 items-center gap-0.5 rounded-md hover:bg-accent",
                                        isCurrent && "bg-sidebar-accent hover:bg-sidebar-accent",
                                      )}
                                    >
                                      {fileRename ? (
                                        renameInput(fileRename)
                                      ) : (
                                        <TreeNameTooltip name={testFile.name}>
                                          <Link
                                            href={`/files/${testFile.id}`}
                                            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 font-mono text-[0.8125rem]"
                                            aria-current={isCurrent ? "page" : undefined}
                                            onClick={() => onNavigate?.()}
                                            onKeyDown={renameOnF2(fileTarget)}
                                          >
                                            <span aria-hidden="true" data-status={dot} title={statusTitle(dot)}>
                                              <StatusIcon status={dot} />
                                            </span>
                                            <span data-tree-name className="truncate">
                                              {testFile.name}
                                            </span>
                                          </Link>
                                        </TreeNameTooltip>
                                      )}
                                      {rowButtons("testFile", testFile.id, testFile.name)}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="space-y-3 border-t border-sidebar-border p-3">
            <div className="flex items-center gap-3">
              <div
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
              >
                {initials(email)}
              </div>
              <p className="min-w-0 flex-1 truncate">Signed in as {email}</p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <ThemeToggle />
              <Button type="button" variant="outline" size="sm" onClick={onLogout}>
                <LogOut data-icon="inline-start" aria-hidden="true" />
                Log out
              </Button>
            </div>
          </div>
        </nav>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".yaml,.yml"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          void handleUpload(event);
        }}
      />

      <ConfirmDeleteDialog
        key={deleteTarget ? `${deleteTarget.kind}-${deleteTarget.id}` : "delete-none"}
        open={deleteTarget !== null}
        title={
          deleteTarget?.kind === "project"
            ? "Delete project"
            : deleteTarget?.kind === "module"
              ? "Delete module"
              : "Delete test file"
        }
        message={deleteTarget ? confirmDeleteText(deleteTarget.kind, deleteTarget.name) : ""}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        onDelete={handleDelete}
      />
    </>
  );
}
