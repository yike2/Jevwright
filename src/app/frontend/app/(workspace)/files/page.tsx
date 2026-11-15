"use client";

import Link from "next/link";
import { useState } from "react";
import { FolderPlus } from "lucide-react";
import { apiClient } from "@/lib/api";
import { errorText } from "@/lib/format-error";
import { overviewGroups } from "@/lib/overview";
import { statusOf, statusTitle } from "@/lib/sidebar";
import { useWorkspace } from "@/lib/workspace-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/workspace/status-badge";

/** The files overview at /files (frontend.md 1.10). */
export default function FilesOverviewPage() {
  const { tree, refreshTree } = useWorkspace();
  const groups = overviewGroups({ items: tree });
  const [isAdding, setIsAdding] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleAddQuickStart = async () => {
    if (isAdding) {
      return;
    }

    setErrorMessage(null);
    setIsAdding(true);

    try {
      await apiClient.addQuickStart();
      await refreshTree();
    } catch (error) {
      setErrorMessage(errorText(error));
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <section aria-label="Test files" className="mx-auto max-w-4xl space-y-6">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">Test files</h1>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-4 py-4">
            <div className="space-y-1">
              <p className="font-medium">No test files yet</p>
              <p className="text-muted-foreground">
                Create a project in the sidebar, or add the Quick Start project: example test files that pass, fail, do
                not validate, or use Jev, with the Variables they need.
              </p>
            </div>
            <Button type="button" onClick={() => void handleAddQuickStart()} disabled={isAdding}>
              <FolderPlus data-icon="inline-start" aria-hidden="true" />
              Add the Quick Start project
            </Button>
            {errorMessage && (
              <p role="alert" className="text-destructive">
                {errorMessage}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        groups.map((project) => (
          <section key={project.id} className="space-y-3">
            <h2 className="font-heading text-lg font-semibold">{project.name}</h2>

            {project.modules.map((module) => (
              <Card key={module.id} size="sm" className="gap-2">
                <h3 className="px-3 font-medium text-muted-foreground">{module.name}</h3>
                <ul className="divide-y">
                  {module.testFiles.map((testFile) => {
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
        ))
      )}
    </section>
  );
}
