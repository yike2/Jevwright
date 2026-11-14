"use client";

import Link from "next/link";
import { overviewGroups } from "@/lib/overview";
import { statusOf, statusTitle } from "@/lib/sidebar";
import { useWorkspace } from "@/lib/workspace-context";

export default function WorkspaceHomePage() {
  const { tree } = useWorkspace();
  const groups = overviewGroups({ items: tree });

  return (
    <section aria-label="Test files" className="rounded-lg border border-border bg-background p-6">
      {groups.length === 0 ? (
        <p className="text-muted-foreground">No test files yet</p>
      ) : (
        <div className="space-y-6">
          {groups.map((project) => (
            <section key={project.id} className="space-y-3">
              <h2 className="text-xl font-semibold text-foreground">{project.name}</h2>

              <div className="space-y-4">
                {project.modules.map((module) => (
                  <section key={module.id} className="space-y-2">
                    <h3 className="text-base font-medium text-foreground">{module.name}</h3>

                    <ul className="space-y-2">
                      {module.testFiles.map((testFile) => {
                        const status = statusOf(testFile.latestRun);

                        return (
                          <li
                            key={testFile.id}
                            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                          >
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <Link
                                href={`/files/${testFile.id}`}
                                className="text-foreground underline underline-offset-4"
                              >
                                {testFile.name}
                              </Link>
                              <span className="text-muted-foreground">{statusTitle(status)}</span>
                              {testFile.latestRun && (
                                <span className="text-muted-foreground">
                                  {new Date(testFile.latestRun.createdAt).toLocaleString()}
                                </span>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
