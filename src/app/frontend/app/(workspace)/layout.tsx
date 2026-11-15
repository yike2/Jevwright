"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiClient, type TreeResponse, type User } from "@/lib/api";
import { formatError } from "@/lib/format-error";
import { cn } from "cn";
import { WorkspaceProvider } from "@/lib/workspace-context";
import { SidebarNav } from "@/components/workspace/sidebar-nav";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";

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

        setMessages(formatError(error));
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
      <main className="flex min-h-screen items-center justify-center p-8">
        <p className="text-muted-foreground">Loading…</p>
      </main>
    );
  }

  if (messages.length > 0) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <div className="w-full max-w-md rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          <div className="space-y-2 text-destructive" role="alert" aria-live="polite">
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
      <main className="flex min-h-screen items-center justify-center p-8">
        <p className="text-muted-foreground">Loading…</p>
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
      <div className="min-h-screen">
        <div className="flex items-center gap-2 border-b bg-sidebar p-2 md:hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Open sidebar"
            aria-expanded={isSidebarOpen}
            onClick={() => setIsSidebarOpen((previous) => !previous)}
          >
            <Menu aria-hidden="true" />
          </Button>
          <span className="font-heading font-semibold">Jevwright</span>
        </div>

        <div className="flex min-h-[calc(100vh-49px)] md:min-h-screen">
          <aside
            className={cn(
              "w-full shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:block md:h-screen md:w-80",
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

          <main className={cn("min-w-0 flex-1 p-4 sm:p-6", isSidebarOpen ? "hidden md:block" : "block")}>
            {children}
          </main>
        </div>
      </div>
    </WorkspaceProvider>
  );
}
