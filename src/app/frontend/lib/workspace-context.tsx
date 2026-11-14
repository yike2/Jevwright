"use client";

import { createContext, useContext } from "react";
import type { TreeResponse, User } from "./api.js";

export type WorkspaceContextValue = {
  me: User;
  tree: TreeResponse["items"];
  refreshTree: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ value, children }: { value: WorkspaceContextValue; children: React.ReactNode }) {
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (context === null) {
    throw new Error("useWorkspace must be used inside WorkspaceProvider");
  }

  return context;
}
