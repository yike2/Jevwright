import "./globals.css";
import type { Metadata } from "next";
import localFont from "next/font/local";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme/theme-provider";

// Self-hosted (fonts/, from IBM's @ibm/plex-* packages, OFL) so the build never downloads fonts.
const plexSans = localFont({
  src: [
    { path: "./fonts/IBMPlexSans-Regular-Latin1.woff2", weight: "400", style: "normal" },
    { path: "./fonts/IBMPlexSans-Medium-Latin1.woff2", weight: "500", style: "normal" },
    { path: "./fonts/IBMPlexSans-SemiBold-Latin1.woff2", weight: "600", style: "normal" },
    { path: "./fonts/IBMPlexSans-Bold-Latin1.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-plex-sans",
});
const plexMono = localFont({
  src: [
    { path: "./fonts/IBMPlexMono-Regular-Latin1.woff2", weight: "400", style: "normal" },
    { path: "./fonts/IBMPlexMono-Medium-Latin1.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "Jevwright",
  description: "Web tests in plain YAML, run by Playwright, with a fast model only where a selector is not enough.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // next-themes sets the theme class on <html> before React hydrates, so the server's HTML cannot match it.
  return (
    <html lang="en" className={cn(plexSans.variable, plexMono.variable)} suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
