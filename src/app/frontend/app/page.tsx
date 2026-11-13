"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiClient, type User } from "@/lib/api";
import { formatAuthError } from "@/lib/format-auth-error";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadCurrentUser = async () => {
      try {
        const currentUser = await apiClient.getCurrentUser();

        if (!isMounted) {
          return;
        }

        setUser(currentUser);
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

    void loadCurrentUser();

    return () => {
      isMounted = false;
    };
  }, []);

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

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-8 text-slate-100">
      <div className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-400">Jevwright</p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Workspace</h1>
        <p className="mt-4 text-slate-300">Signed in as {user?.email}</p>
        <Button type="button" variant="outline" className="mt-6 w-full" onClick={handleLogout}>
          Log out
        </Button>
      </div>
    </main>
  );
}
