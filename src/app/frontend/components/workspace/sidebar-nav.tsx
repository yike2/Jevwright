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
  toTestFileName,
  type DeleteTarget,
} from "@/lib/sidebar";
import { Button } from "@/components/ui/button";
import { CreateNameDialog } from "@/components/workspace/create-name-dialog";
import { ConfirmDeleteDialog } from "@/components/workspace/confirm-delete-dialog";
import { VariablesDialog } from "@/components/workspace/variables-dialog";
import { KeyRound, Pencil, Trash2 } from "lucide-react";

type WorkspaceSidebarProps = {
  email: string;
  tree: TreeResponse["items"];
  refreshTree: () => Promise<void>;
  onLogout: () => void;
  onNavigate?: () => void;
};

function statusClass(dot: ReturnType<typeof statusOf>): string {
  if (dot === "none") {
    return "bg-slate-500";
  }

  if (dot === "active") {
    return "bg-amber-400";
  }

  if (dot === "passed") {
    return "bg-emerald-400";
  }

  return "bg-red-400";
}

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
      router.replace("/");
      onNavigate?.();
    }

    try {
      await refreshTree();
    } catch {
      // Ignore refresh errors for completed delete actions.
    }
  };

  return (
    <>
      <nav aria-label="Projects" className="flex h-full flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-[0.15em] text-slate-300">Projects</h2>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="New project"
            onClick={() => setIsProjectDialogOpen(true)}
          >
            +
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
          {tree.map((project) => {
            const isProjectOpen = expandedProjects.has(project.id);

            return (
              <div key={project.id} className="space-y-2 rounded-lg border border-slate-800/80 bg-slate-900/70 p-2">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-auto flex-1 justify-start px-2 py-1.5 text-slate-100"
                    aria-expanded={isProjectOpen}
                    onClick={() => toggleProject(project.id)}
                  >
                    {project.name}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Rename project ${project.name}`}
                    onClick={() => setRenameTarget({ kind: "project", id: project.id, name: project.name })}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Delete project ${project.name}`}
                    onClick={() => setDeleteTarget({ kind: "project", id: project.id, name: project.name })}
                  >
                    <Trash2 />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Variables for ${project.name}`}
                    title={`Variables for ${project.name}`}
                    onClick={() => setVariablesProject({ id: project.id, name: project.name })}
                  >
                    <KeyRound />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={`New module in ${project.name}`}
                    onClick={() => setModuleProject({ id: project.id, name: project.name })}
                  >
                    +
                  </Button>
                </div>

                {isProjectOpen && (
                  <div className="space-y-2 pl-2">
                    {project.modules.map((module) => {
                      const isModuleOpen = expandedModules.has(module.id);

                      return (
                        <div key={module.id} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-auto flex-1 justify-start px-2 py-1.5 text-slate-200"
                              aria-expanded={isModuleOpen}
                              onClick={() => toggleModule(module.id)}
                            >
                              {module.name}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon-sm"
                              aria-label={`Rename module ${module.name}`}
                              onClick={() => setRenameTarget({ kind: "module", id: module.id, name: module.name })}
                            >
                              <Pencil />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon-sm"
                              aria-label={`Delete module ${module.name}`}
                              onClick={() => setDeleteTarget({ kind: "module", id: module.id, name: module.name })}
                            >
                              <Trash2 />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon-sm"
                              aria-label={`New test file in ${module.name}`}
                              onClick={() => setTestFileModule({ id: module.id, name: module.name })}
                            >
                              +
                            </Button>
                          </div>

                          {isModuleOpen && (
                            <div className="space-y-1 pl-2">
                              {module.testFiles.map((testFile) => {
                                const dot = statusOf(testFile.latestRun);
                                const isCurrent = currentFileId === testFile.id;

                                return (
                                  <div
                                    key={testFile.id}
                                    className="group flex items-center gap-2 rounded-md pr-2 hover:bg-muted/60"
                                  >
                                    <Link
                                      href={`/files/${testFile.id}`}
                                      className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-sm text-foreground"
                                      aria-current={isCurrent ? "page" : undefined}
                                      onClick={() => onNavigate?.()}
                                    >
                                      <span
                                        aria-hidden="true"
                                        data-status={dot}
                                        title={statusTitle(dot)}
                                        className={`mr-2 inline-block size-2 rounded-full ${statusClass(dot)}`}
                                      />
                                      <span>{testFile.name}</span>
                                    </Link>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon-sm"
                                      className="opacity-100 focus-visible:opacity-100 md:opacity-70 md:group-hover:opacity-100"
                                      aria-label={`Rename test file ${testFile.name}`}
                                      onClick={() =>
                                        setRenameTarget({ kind: "testFile", id: testFile.id, name: testFile.name })
                                      }
                                    >
                                      <Pencil />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon-sm"
                                      className="opacity-100 focus-visible:opacity-100 md:opacity-70 md:group-hover:opacity-100"
                                      aria-label={`Delete test file ${testFile.name}`}
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

        <div className="rounded-lg border border-slate-800/80 bg-slate-900/70 p-3">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-slate-100">
              {initials(email)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-[0.15em] text-slate-400">Account</p>
              <p className="truncate text-sm text-slate-100">Signed in as {email}</p>
            </div>
          </div>
          <Button type="button" variant="outline" className="mt-3 w-full" onClick={onLogout}>
            Log out
          </Button>
        </div>
      </nav>

      <CreateNameDialog
        open={isProjectDialogOpen}
        title="New project"
        onOpenChange={setIsProjectDialogOpen}
        onCreate={handleCreateProject}
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
        initialName={renameTarget?.name ?? ""}
        normalizeName={renameTarget?.kind === "testFile" ? toTestFileName : undefined}
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
