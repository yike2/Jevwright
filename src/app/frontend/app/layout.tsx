import "./globals.css";
import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme/theme-provider";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
});
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });

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
