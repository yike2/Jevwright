"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { WORKSPACE_HOME } from "@/lib/routes";
import { buttonVariants } from "@/components/ui/button";

/**
 * Quick start's button (frontend.md 1.14): Open workspace for a visitor whose browser holds a token, otherwise
 * Register, which creates the Quick Start project. Like the header, it checks the token after mount.
 */
export function StartButton() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => setSignedIn(apiClient.getToken() !== null), []);

  return signedIn ? (
    <Link href={WORKSPACE_HOME} className={buttonVariants({ size: "lg" })}>
      Open workspace
    </Link>
  ) : (
    <Link href="/register" className={buttonVariants({ size: "lg" })}>
      Register
    </Link>
  );
}
