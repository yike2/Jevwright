"use client";

import { useParams } from "next/navigation";
import { useWorkspace } from "@/lib/workspace-context";

function testFileNameById(tree: ReturnType<typeof useWorkspace>["tree"], testFileId: string): string | null {
  for (const project of tree) {
    for (const module of project.modules) {
      for (const testFile of module.testFiles) {
        if (testFile.id === testFileId) {
          return testFile.name;
        }
      }
    }
  }

  return null;
}

export default function TestFilePage() {
  const params = useParams<{ testFileId: string }>();
  const { tree } = useWorkspace();

  const testFileId = params.testFileId;
  const name = testFileNameById(tree, testFileId);

  if (name === null) {
    return (
      <section className="rounded-lg border border-slate-800 bg-slate-900/70 p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Test file not found</h1>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/70 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
      <p className="mt-3 text-slate-300">Editor coming in #81</p>
    </section>
  );
}
