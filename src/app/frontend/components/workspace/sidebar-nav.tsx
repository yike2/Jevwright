"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  type DeleteTarget,
} from "@/lib/sidebar";
import { Button } from "@/components/ui/button";
import { nameProblem, testFileNameProblem } from "@/lib/validation";
import { CreateNameDialog } from "@/components/workspace/create-name-dialog";
import { ConfirmDeleteDialog } from "@/components/workspace/confirm-delete-dialog";
import { VariablesDialog } from "@/components/workspace/variables-dialog";
import { ChevronRight, KeyRound, LogOut, Pencil, Plus, Trash2 } from "lucide-react";
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

type RenameTarget = {
  kind: "project" | "module" | "testFile";
  id: string;
  name: string;
};

type DeleteTargetWithName = DeleteTarget & {
  name: string;
};

export function SidebarNav({ email, tree, refreshTree, onLogout, onNavigate }: WorkspaceSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();

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

  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [moduleProject, setModuleProject] = useState<{ id: string; name: string } | null>(null);
  const [testFileModule, setTestFileModule] = useState<{ id: string; name: string } | null>(null);
  const [variablesProject, setVariablesProject] = useState<{ id: string; name: string } | null>(null);
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTargetWithName | null>(null);

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
      setExpandedProjects((previous) => {
        const next = new Set(previous);
        for (const id of newProjectIds) {
          next.add(id);
        }
        return next;
      });
    }

    if (newModuleIds.length > 0) {
      setExpandedModules((previous) => {
        const next = new Set(previous);
        for (const id of newModuleIds) {
          next.add(id);
        }
        return next;
      });
    }
  }, [tree]);

  const currentFileId = pathname?.startsWith("/files/") ? pathname.slice("/files/".length) : null;

  const toggleProject = (projectId: string) => {
    setExpandedProjects((previous) => {
      const next = new Set(previous);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const toggleModule = (moduleId: string) => {
    setExpandedModules((previous) => {
      const next = new Set(previous);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  };

  const handleCreateProject = async (name: string) => {
    await apiClient.createProject(name);
    await refreshTree();
  };

  const handleCreateModule = async (name: string) => {
    if (moduleProject === null) {
      return;
    }

    await apiClient.createModule(moduleProject.id, name);
    await refreshTree();
  };

  const handleCreateTestFile = async (name: string) => {
    if (testFileModule === null) {
      return;
    }

    const fileName = toTestFileName(name);
    const source = starterSource(fileName);
    const created = await apiClient.createTestFile(testFileModule.id, fileName, source);

    await refreshTree();
    router.push(`/files/${created.testFile.id}`);
    onNavigate?.();
  };

  const handleRename = async (name: string) => {
    if (renameTarget === null) {
      return;
    }

    if (renameTarget.kind === "project") {
      await apiClient.renameProject(renameTarget.id, name);
    } else if (renameTarget.kind === "module") {
      await apiClient.renameModule(renameTarget.id, name);
    } else {
      await apiClient.renameTestFile(renameTarget.id, name);
    }

    try {
      await refreshTree();
    } catch {
      // Ignore refresh errors for completed rename actions.
    }
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

    const shouldNavigateToHome = deletesTestFile({ items: tree }, deleteTarget, currentFileId);
    if (shouldNavigateToHome) {
      router.replace(WORKSPACE_HOME);
      onNavigate?.();
    }

    try {
      await refreshTree();
    } catch {
      // Ignore refresh errors for completed delete actions.
    }
  };

  // Row actions stay in the accessibility tree; with a mouse they show on hover or focus, on touch always.
  const rowAction =
    "pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100 pointer-fine:group-focus-within/row:opacity-100";

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
              onClick={() => setIsProjectDialogOpen(true)}
            >
              <Plus aria-hidden="true" />
            </Button>
          </div>

          <div className="min-h-0 flex-1 space-y-1 overflow-auto px-2 pb-3">
            {tree.map((project) => {
              const isProjectOpen = expandedProjects.has(project.id);

              return (
                <div key={project.id}>
                  <div className="group/row flex h-8 items-center gap-0.5 rounded-md hover:bg-accent">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="min-w-0 flex-1 justify-start gap-1 px-1 font-semibold hover:bg-transparent aria-expanded:bg-transparent"
                      aria-expanded={isProjectOpen}
                      onClick={() => toggleProject(project.id)}
                    >
                      <ChevronRight
                        aria-hidden="true"
                        className={cn(
                          "transition-transform motion-reduce:transition-none",
                          isProjectOpen && "rotate-90",
                        )}
                      />
                      <span className="truncate">{project.name}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className={rowAction}
                      aria-label={`Rename project ${project.name}`}
                      title="Rename"
                      onClick={() => setRenameTarget({ kind: "project", id: project.id, name: project.name })}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className={rowAction}
                      aria-label={`Delete project ${project.name}`}
                      title="Delete"
                      onClick={() => setDeleteTarget({ kind: "project", id: project.id, name: project.name })}
                    >
                      <Trash2 />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Variables for ${project.name}`}
                      title={`Variables for ${project.name}`}
                      onClick={() => setVariablesProject({ id: project.id, name: project.name })}
                    >
                      <KeyRound />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`New module in ${project.name}`}
                      title="New module"
                      onClick={() => setModuleProject({ id: project.id, name: project.name })}
                    >
                      <Plus />
                    </Button>
                  </div>

                  {isProjectOpen && (
                    <div className="ml-3 border-l border-sidebar-border pl-1">
                      {project.modules.map((module) => {
                        const isModuleOpen = expandedModules.has(module.id);

                        return (
                          <div key={module.id}>
                            <div className="group/row flex h-8 items-center gap-0.5 rounded-md hover:bg-accent">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="min-w-0 flex-1 justify-start gap-1 px-1 hover:bg-transparent aria-expanded:bg-transparent"
                                aria-expanded={isModuleOpen}
                                onClick={() => toggleModule(module.id)}
                              >
                                <ChevronRight
                                  aria-hidden="true"
                                  className={cn(
                                    "transition-transform motion-reduce:transition-none",
                                    isModuleOpen && "rotate-90",
                                  )}
                                />
                                <span className="truncate">{module.name}</span>
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                className={rowAction}
                                aria-label={`Rename module ${module.name}`}
                                title="Rename"
                                onClick={() => setRenameTarget({ kind: "module", id: module.id, name: module.name })}
                              >
                                <Pencil />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                className={rowAction}
                                aria-label={`Delete module ${module.name}`}
                                title="Delete"
                                onClick={() => setDeleteTarget({ kind: "module", id: module.id, name: module.name })}
                              >
                                <Trash2 />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`New test file in ${module.name}`}
                                title="New test file"
                                onClick={() => setTestFileModule({ id: module.id, name: module.name })}
                              >
                                <Plus />
                              </Button>
                            </div>

                            {isModuleOpen && (
                              <div className="ml-3 border-l border-sidebar-border pl-1">
                                {module.testFiles.map((testFile) => {
                                  const dot = statusOf(testFile.latestRun);
                                  const isCurrent = currentFileId === testFile.id;

                                  return (
                                    <div
                                      key={testFile.id}
                                      className={cn(
                                        "group/row flex h-7 items-center gap-0.5 rounded-md hover:bg-accent",
                                        isCurrent && "bg-sidebar-accent hover:bg-sidebar-accent",
                                      )}
                                    >
                                      <Link
                                        href={`/files/${testFile.id}`}
                                        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 font-mono text-[0.8125rem]"
                                        aria-current={isCurrent ? "page" : undefined}
                                        onClick={() => onNavigate?.()}
                                      >
                                        <span aria-hidden="true" data-status={dot} title={statusTitle(dot)}>
                                          <StatusIcon status={dot} />
                                        </span>
                                        <span className="truncate">{testFile.name}</span>
                                      </Link>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-xs"
                                        className={rowAction}
                                        aria-label={`Rename test file ${testFile.name}`}
                                        title="Rename"
                                        onClick={() =>
                                          setRenameTarget({ kind: "testFile", id: testFile.id, name: testFile.name })
                                        }
                                      >
                                        <Pencil />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-xs"
                                        className={rowAction}
                                        aria-label={`Delete test file ${testFile.name}`}
                                        title="Delete"
                                        onClick={() =>
                                          setDeleteTarget({ kind: "testFile", id: testFile.id, name: testFile.name })
                                        }
                                      >
                                        <Trash2 />
                                      </Button>
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
            <div className="flex items-center justify-between gap-2">
              <ThemeToggle />
              <Button type="button" variant="outline" size="sm" onClick={onLogout}>
                <LogOut data-icon="inline-start" aria-hidden="true" />
                Log out
              </Button>
            </div>
          </div>
        </nav>
      </div>

      <CreateNameDialog
        open={isProjectDialogOpen}
        title="New project"
        onOpenChange={setIsProjectDialogOpen}
        onCreate={handleCreateProject}
        validate={nameProblem}
      />

      <CreateNameDialog
        open={moduleProject !== null}
        title="New module"
        onOpenChange={(open) => {
          if (!open) {
            setModuleProject(null);
          }
        }}
        onCreate={handleCreateModule}
        validate={nameProblem}
      />

      <CreateNameDialog
        open={testFileModule !== null}
        title="New test file"
        onOpenChange={(open) => {
          if (!open) {
            setTestFileModule(null);
          }
        }}
        onCreate={handleCreateTestFile}
        validate={testFileNameProblem}
        suffix=".yaml"
      />

      <CreateNameDialog
        key={renameTarget ? `${renameTarget.kind}-${renameTarget.id}` : "rename-none"}
        open={renameTarget !== null}
        title={
          renameTarget?.kind === "project"
            ? "Rename project"
            : renameTarget?.kind === "module"
              ? "Rename module"
              : "Rename test file"
        }
        submitLabel="Save"
        initialName={
          renameTarget?.kind === "testFile" ? testFileBaseName(renameTarget.name) : (renameTarget?.name ?? "")
        }
        normalizeName={renameTarget?.kind === "testFile" ? toTestFileName : undefined}
        validate={renameTarget?.kind === "testFile" ? testFileNameProblem : nameProblem}
        suffix={renameTarget?.kind === "testFile" ? ".yaml" : undefined}
        disableUnchangedSubmit
        onOpenChange={(open) => {
          if (!open) {
            setRenameTarget(null);
          }
        }}
        onCreate={handleRename}
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

      <VariablesDialog
        open={variablesProject !== null}
        projectId={variablesProject?.id ?? ""}
        onOpenChange={(open) => {
          if (!open) {
            setVariablesProject(null);
          }
        }}
      />
    </>
  );
}
