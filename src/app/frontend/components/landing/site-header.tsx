"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { WORKSPACE_HOME } from "@/lib/routes";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BrandMark } from "@/components/landing/brand-mark";

/**
 * The top bar of the landing and auth pages: the product name, the theme switch, and Log in / Register, or Open
 * workspace for a visitor who has a token (frontend.md 1.14).
 */
export function SiteHeader({ showAuthLinks = true }: { showAuthLinks?: boolean }) {
  // The token lives in localStorage, so the server renders the visitor's links and the browser may swap them.
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => setSignedIn(apiClient.getToken() !== null), []);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/75">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 rounded-md font-heading text-base font-semibold">
          <BrandMark />
          Jevwright
        </Link>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          {showAuthLinks &&
            (signedIn ? (
              <Link href={WORKSPACE_HOME} className={buttonVariants()}>
                Open workspace
              </Link>
            ) : (
              <>
                <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
                  Log in
                </Link>
                <Link href="/register" className={buttonVariants()}>
                  Register
                </Link>
              </>
            ))}
        </div>
      </div>
    </header>
  );
}
