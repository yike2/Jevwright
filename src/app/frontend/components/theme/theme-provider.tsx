"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/** Light, Dark, or System (the default), stored per browser; the class on <html> picks the tokens. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
