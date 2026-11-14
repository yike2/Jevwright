"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiClient, type TreeResponse, type User } from "@/lib/api";
import { formatAuthError } from "@/lib/format-auth-error";
import { cn } from "cn";
import { WorkspaceProvider } from "@/lib/workspace-context";
import { SidebarNav } from "@/components/workspace/sidebar-nav";
import { Button } from "@/components/ui/button";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [messages, setMessages] = useState<string[]>([]);
  const [me, setMe] = useState<User | null>(null);
  const [tree, setTree] = useState<TreeResponse["items"]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadWorkspace = async () => {
      try {
        const currentUser = await apiClient.getCurrentUser();
        const nextTree = await apiClient.getTree();

        if (!isMounted) {
          return;
        }

        setMe(currentUser);
        setTree(nextTree.items);
        setIsLoading(false);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (error instanceof ApiError && error.status === 401) {
          return;
        }

        setMessages(formatAuthError(error));
        setIsLoading(false);
      }
    };

    void loadWorkspace();

    return () => {
      isMounted = false;
    };
  }, []);

  const refreshTree = async () => {
    const nextTree = await apiClient.getTree();
    setTree(nextTree.items);
  };

  const handleLogout = () => {
    apiClient.clearToken();
    router.replace("/login");
  };

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-8 text-slate-100">
        <p className="text-lg">Loading…</p>
      </main>
    );
  }

  if (messages.length > 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-8 text-slate-100">
        <div className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 p-8 shadow-xl">
          <div className="space-y-2 text-sm text-red-400" role="alert" aria-live="polite">
            {messages.map((message, index) => (
              <p key={`${message}-${index}`}>{message}</p>
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (me === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-8 text-slate-100">
        <p className="text-lg">Loading…</p>
      </main>
    );
  }

  return (
    <WorkspaceProvider
      value={{
        me,
        tree,
        refreshTree,
      }}
    >
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="border-b border-slate-800 p-3 md:hidden">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Open sidebar"
            aria-expanded={isSidebarOpen}
            onClick={() => setIsSidebarOpen((previous) => !previous)}
          >
            ☰
          </Button>
        </div>

        <div className="flex min-h-[calc(100vh-57px)] md:min-h-screen">
          <aside
            className={cn(
              "w-full max-w-xs shrink-0 border-r border-slate-800 bg-slate-950 md:block md:w-80 md:max-w-none",
              isSidebarOpen ? "block" : "hidden",
            )}
          >
            <SidebarNav
              email={me.email}
              tree={tree}
              refreshTree={refreshTree}
              onLogout={handleLogout}
              onNavigate={() => setIsSidebarOpen(false)}
            />
          </aside>

          <main className={cn("min-w-0 flex-1 p-6", isSidebarOpen ? "hidden md:block" : "block")}>{children}</main>
        </div>
      </div>
    </WorkspaceProvider>
  );
}
