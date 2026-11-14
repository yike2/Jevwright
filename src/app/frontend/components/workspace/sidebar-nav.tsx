"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiClient, type TreeResponse } from "@/lib/api";
import { initials, starterSource, statusOf, toTestFileName } from "@/lib/sidebar";
import { Button } from "@/components/ui/button";
import { CreateNameDialog } from "@/components/workspace/create-name-dialog";

type WorkspaceSidebarProps = {
  email: string;
  tree: TreeResponse["items"];
  refreshTree: () => Promise<void>;
  onLogout: () => void;
  onNavigate?: () => void;
};

function statusTitle(dot: ReturnType<typeof statusOf>): string {
  if (dot === "none") {
    return "Never run";
  }

  if (dot === "active") {
    return "Running";
  }

  if (dot === "passed") {
    return "Passed";
  }

  return "Failed";
}

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
                                  <Link
                                    key={testFile.id}
                                    href={`/files/${testFile.id}`}
                                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-200 hover:bg-slate-800/70"
                                    aria-current={isCurrent ? "page" : undefined}
                                    onClick={() => onNavigate?.()}
                                  >
                                    <span
                                      aria-hidden="true"
                                      data-status={dot}
                                      title={statusTitle(dot)}
                                      className={`inline-block size-2 rounded-full ${statusClass(dot)}`}
                                    />
                                    <span>{testFile.name}</span>
                                  </Link>
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
    </>
  );
}
