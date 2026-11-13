"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { formatAuthError } from "@/lib/format-auth-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleModeChange = (nextMode: Mode) => {
    setMode(nextMode);
    setMessages([]);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setMessages([]);

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === "login") {
        await apiClient.login(email, password);
      } else {
        await apiClient.register(email, password);
      }

      router.replace("/");
    } catch (error) {
      setMessages(formatAuthError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-8 text-slate-100">
      <div className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <h1 className="text-2xl font-semibold tracking-tight">{mode === "login" ? "Log in" : "Register"}</h1>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={mode === "login" ? "default" : "outline"}
            onClick={() => handleModeChange("login")}
          >
            Log in
          </Button>
          <Button
            type="button"
            variant={mode === "register" ? "default" : "outline"}
            onClick={() => handleModeChange("register")}
          >
            Register
          </Button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className="w-full"
            />
          </div>

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Please wait…" : mode === "login" ? "Log in" : "Register"}
          </Button>
        </form>

        {messages.length > 0 && (
          <div role="alert" aria-live="polite" className="mt-4 space-y-1 text-sm text-red-400">
            {messages.map((message, index) => (
              <p key={`${message}-${index}`}>{message}</p>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
