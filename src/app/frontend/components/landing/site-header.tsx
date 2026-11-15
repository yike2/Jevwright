"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { WORKSPACE_HOME } from "@/lib/routes";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BrandMark } from "@/components/landing/brand-mark";

// Docs is the user guide (docs/guide-src/), built into GitHub Pages.
export const DOCS_URL = "https://yike2.github.io/Jevwright/guide/";
export const API_URL = "https://yike2.github.io/Jevwright/api/";
export const REPO_URL = "https://github.com/yike2/Jevwright";

/**
 * The top bar of the landing and auth pages: the logo (always to /), the docs links, the theme switch, and one button:
 * Sign in, or Open workspace for a visitor who has a token (frontend.md 1.14).
 */
export function SiteHeader({ showAuthLinks = true }: { showAuthLinks?: boolean }) {
  // The token lives in localStorage, so the server renders the visitor's links and the browser may swap them.
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => setSignedIn(apiClient.getToken() !== null), []);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/75">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          aria-label="Jevwright home"
          className="flex items-center gap-2 rounded-md font-heading text-base font-semibold"
        >
          <BrandMark />
          Jevwright
        </Link>
        <nav aria-label="Site" className="hidden items-center gap-1 md:flex">
          <a href={DOCS_URL} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Docs
          </a>
          <a href={API_URL} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            API reference
          </a>
          <a href={REPO_URL} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            GitHub
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          {showAuthLinks &&
            (signedIn ? (
              <Link href={WORKSPACE_HOME} className={buttonVariants()}>
                Open workspace
              </Link>
            ) : (
              // One page for both: /login, where the form switches between Log in and Register.
              <Link href="/login" className={buttonVariants()}>
                Sign in
              </Link>
            ))}
        </div>
      </div>
    </header>
  );
}
