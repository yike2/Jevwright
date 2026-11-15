"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { formatError } from "@/lib/format-error";
import { emailProblem, passwordProblem } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { WORKSPACE_HOME } from "@/lib/routes";
import { SiteHeader } from "@/components/landing/site-header";

export type AuthMode = "login" | "register";

/** The two-mode Log in / Register form of /login and /register (frontend.md 1.5). */
export function AuthForm({ initialMode }: { initialMode: AuthMode }) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [fieldProblems, setFieldProblems] = useState<{ email: string | null; password: string | null }>({
    email: null,
    password: null,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleModeChange = (nextMode: AuthMode) => {
    setMode(nextMode);
    setMessages([]);
    setFieldProblems({ email: null, password: null });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setMessages([]);

    if (isSubmitting) {
      return;
    }

    // Logging in only needs a password; the length rule is for choosing one.
    const problems = {
      email: emailProblem(email.trim()),
      password: mode === "register" ? passwordProblem(password) : password === "" ? "Enter your password." : null,
    };
    setFieldProblems(problems);
    if (problems.email !== null || problems.password !== null) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === "login") {
        await apiClient.login(email.trim(), password);
      } else {
        await apiClient.register(email.trim(), password);
      }

      router.replace(WORKSPACE_HOME);
    } catch (error) {
      setMessages(formatError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader showAuthLinks={false} />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              {mode === "login" ? "Log in" : "Register"}
            </h1>
            <p className="text-muted-foreground">
              {mode === "login"
                ? "Open your workspace of test files and Runs."
                : "New accounts start with a Quick Start project of example tests."}
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              <Button
                type="button"
                variant={mode === "login" ? "default" : "ghost"}
                aria-pressed={mode === "login"}
                onClick={() => handleModeChange("login")}
              >
                Log in
              </Button>
              <Button
                type="button"
                variant={mode === "register" ? "default" : "ghost"}
                aria-pressed={mode === "register"}
                onClick={() => handleModeChange("register")}
              >
                Register
              </Button>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  aria-invalid={fieldProblems.email !== null}
                  aria-describedby={fieldProblems.email !== null ? "email-problem" : undefined}
                />
                {fieldProblems.email !== null && (
                  <p id="email-problem" role="alert" className="text-destructive">
                    {fieldProblems.email}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === "register" ? "At least 8 characters" : "••••••••"}
                  aria-invalid={fieldProblems.password !== null}
                  aria-describedby={fieldProblems.password !== null ? "password-problem" : undefined}
                />
                {fieldProblems.password !== null && (
                  <p id="password-problem" role="alert" className="text-destructive">
                    {fieldProblems.password}
                  </p>
                )}
              </div>

              <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
                {isSubmitting ? "Please wait…" : mode === "login" ? "Log in" : "Register"}
              </Button>
            </form>

            {messages.length > 0 && (
              <div role="alert" aria-live="polite" className="space-y-1 text-destructive">
                {messages.map((message, index) => (
                  <p key={`${message}-${index}`}>{message}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
