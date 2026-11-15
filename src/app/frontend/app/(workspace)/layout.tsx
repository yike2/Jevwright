"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiClient, type TreeResponse, type User } from "@/lib/api";
import { formatError } from "@/lib/format-error";
import { hasActiveRun } from "@/lib/sidebar";
import { WorkspaceProvider } from "@/lib/workspace-context";
import { SidebarNav } from "@/components/workspace/sidebar-nav";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useMediaQuery } from "@/lib/use-media-query";
import { usePanelLayout } from "@/lib/panel-layout";

// While any file in the tree has a queued or running Run, the tree reloads so its status icon updates on any page.
const ACTIVE_TREE_POLL_MS = 1000;

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [messages, setMessages] = useState<string[]>([]);
  const [me, setMe] = useState<User | null>(null);
  const [tree, setTree] = useState<TreeResponse["items"]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const treeRequest = useRef(0);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const sidebarLayout = usePanelLayout("sidebar");

  const refreshTree = useCallback(async () => {
    const request = ++treeRequest.current;
    const nextTree = await apiClient.getTree();
    if (request === treeRequest.current) setTree(nextTree.items);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadWorkspace = async () => {
      try {
        const currentUser = await apiClient.getCurrentUser();
        const request = ++treeRequest.current;
        const nextTree = await apiClient.getTree();

        if (!isMounted) {
          return;
        }

        setMe(currentUser);
        if (request === treeRequest.current) setTree(nextTree.items);
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

  const active = hasActiveRun(tree);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      void refreshTree().catch(() => undefined);
    }, ACTIVE_TREE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, refreshTree]);

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

  const sidebar = (
    <SidebarNav
      email={me.email}
      tree={tree}
      refreshTree={refreshTree}
      onLogout={handleLogout}
      onNavigate={() => setIsSidebarOpen(false)}
    />
  );

  return (
    <WorkspaceProvider
      value={{
        me,
        tree,
        refreshTree,
      }}
    >
      <TooltipProvider delay={400}>
        {isDesktop ? (
          // The page fills the window; the sidebar and the page scroll on their own (frontend.md 1.6).
          <div className="h-dvh">
            <ResizablePanelGroup
              id="sidebar"
              orientation="horizontal"
              defaultLayout={sidebarLayout.defaultLayout}
              onLayoutChanged={sidebarLayout.onLayoutChanged}
            >
              <ResizablePanel
                id="sidebar-panel"
                defaultSize="320px"
                minSize="220px"
                maxSize="600px"
                groupResizeBehavior="preserve-pixel-size"
                className="h-full bg-sidebar text-sidebar-foreground"
              >
                {sidebar}
              </ResizablePanel>
              <ResizableHandle aria-label="Resize sidebar" />
              <ResizablePanel id="page" minSize="30%">
                <main className="h-full overflow-auto">{children}</main>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        ) : (
          <div className="flex h-dvh flex-col">
            <div className="flex shrink-0 items-center gap-2 border-b bg-sidebar p-2">
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
            {isSidebarOpen ? (
              <aside className="min-h-0 flex-1 bg-sidebar text-sidebar-foreground">{sidebar}</aside>
            ) : (
              <main className="min-h-0 flex-1 overflow-auto">{children}</main>
            )}
          </div>
        )}
      </TooltipProvider>
    </WorkspaceProvider>
  );
}
