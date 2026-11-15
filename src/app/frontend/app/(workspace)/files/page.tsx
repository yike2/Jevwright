"use client";

import Link from "next/link";
import { overviewGroups } from "@/lib/overview";
import { hasQuickStart, statusOf, statusTitle } from "@/lib/sidebar";
import { useWorkspace } from "@/lib/workspace-context";
import { Card, CardContent } from "@/components/ui/card";
import { AddQuickStart } from "@/components/workspace/add-quick-start";
import { StatusBadge } from "@/components/workspace/status-badge";

/** The files overview at /files (frontend.md 1.10). */
export default function FilesOverviewPage() {
  const { tree, refreshTree } = useWorkspace();
  const projects = overviewGroups({ items: tree });

  return (
    <section aria-label="Test files" className="space-y-6 p-4">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">Test files</h1>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-4 py-4">
            <div className="space-y-1">
              <p className="font-medium">No test files yet</p>
              <p className="text-muted-foreground">
                Create a project in the sidebar, drop .yaml files or folders from your computer onto it, or add the
                Quick Start project: example test files that pass, fail, do not validate, or use Jev, with the Variables
                they need.
              </p>
            </div>
            {!hasQuickStart(tree) && <AddQuickStart onAdded={refreshTree} />}
          </CardContent>
        </Card>
      ) : (
        <>
          {!hasQuickStart(tree) && (
            <Card size="sm">
              <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <p className="min-w-0 flex-1 text-muted-foreground">
                  The Quick Start project has example test files that pass, fail, do not validate, or use Jev.
                </p>
                <AddQuickStart onAdded={refreshTree} variant="outline" />
              </CardContent>
            </Card>
          )}
          {projects.map((project) => (
            <section key={project.id} aria-labelledby={`project-${project.id}`} className="space-y-3">
              <h2 id={`project-${project.id}`} className="font-heading text-lg font-semibold">
                {project.name}
              </h2>

              {project.groups.map((group) => (
                <Card key={group.id} size="sm" className="gap-2">
                  {group.path !== "" && (
                    <h3 className="px-3 font-mono font-medium text-muted-foreground">{group.path}</h3>
                  )}
                  <ul aria-label={group.path === "" ? `In ${project.name}` : `In ${group.path}`} className="divide-y">
                    {group.testFiles.map((testFile) => {
                      const status = statusOf(testFile.latestRun);

                      return (
                        <li key={testFile.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                          <Link
                            href={`/files/${testFile.id}`}
                            className="rounded-sm font-mono text-[0.8125rem] text-info underline-offset-4 hover:underline"
                          >
                            {testFile.name}
                          </Link>
                          <StatusBadge status={status} label={statusTitle(status)} />
                          {testFile.latestRun && (
                            <span className="text-xs text-muted-foreground">
                              {new Date(testFile.latestRun.createdAt).toLocaleString()}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              ))}
            </section>
          ))}
        </>
      )}
    </section>
  );
}
