import Link from "next/link";
import { Activity, FileCode2, History, ScanSearch, Terminal, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BrandMark } from "@/components/landing/brand-mark";
import { SiteHeader } from "@/components/landing/site-header";
import { FEATURES, SAMPLE_TEST } from "@/lib/landing";

// One icon per feature of FEATURES, in the same order.
const FEATURE_ICONS: LucideIcon[] = [FileCode2, ScanSearch, Activity, History, Terminal];

const STEPS = [
  { title: "Write", text: "Describe the test as steps in a .yaml file, or start from the Quick Start project." },
  { title: "Validate", text: "Every problem is listed at once, with its line, before anything runs." },
  { title: "Run", text: "Follow the Run live, then keep its report, screenshots and trace." },
];

/** The product page at / (frontend.md 1.14): a server component, apart from the header's sign-in state. */
export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="border-b">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:py-24">
            <div className="space-y-6">
              <Badge variant="info">Playwright runs it. Jev helps only where needed.</Badge>
              <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                Web tests in plain YAML
              </h1>
              <p className="max-w-xl text-base text-muted-foreground sm:text-lg">
                Jevwright runs declarative test files with Playwright and calls Jev, a small and fast model, only to
                find an element or judge a check. Everything else is plain browser automation, so tests stay fast, cheap
                and repeatable.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/register" className={buttonVariants({ size: "lg" })}>
                  Get started
                </Link>
                <a href="#sample" className={buttonVariants({ size: "lg", variant: "outline" })}>
                  See a test file
                </a>
              </div>
            </div>

            <figure id="sample" className="scroll-mt-20 overflow-hidden rounded-xl border bg-card shadow-sm">
              <figcaption className="flex items-center gap-2 border-b bg-muted px-4 py-2 font-mono text-xs text-muted-foreground">
                <FileCode2 aria-hidden="true" className="size-4" />
                sign-in.yaml
              </figcaption>
              <pre className="overflow-x-auto bg-code p-4 font-mono text-[0.8125rem] leading-relaxed text-code-foreground">
                <code>{SAMPLE_TEST}</code>
              </pre>
            </figure>
          </div>
        </section>

        <section aria-labelledby="features-heading" className="border-b bg-card">
          <div className="mx-auto max-w-6xl space-y-10 px-4 py-16 sm:px-6">
            <div className="max-w-2xl space-y-3">
              <h2 id="features-heading" className="font-heading text-3xl font-semibold tracking-tight">
                Everything a test needs, nothing it does not
              </h2>
              <p className="text-base text-muted-foreground">
                The model is never asked to plan your test. It only answers two small questions, so a Run costs a
                fraction of an agent that drives the browser step by step.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature, index) => {
                const Icon = FEATURE_ICONS[index] ?? FileCode2;
                return (
                  <Card key={feature.title}>
                    <CardHeader className="gap-3">
                      <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Icon aria-hidden="true" className="size-5" />
                      </span>
                      <h3 className="font-heading text-base font-semibold">{feature.title}</h3>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">{feature.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <section aria-labelledby="how-heading" className="border-b">
          <div className="mx-auto max-w-6xl space-y-10 px-4 py-16 sm:px-6">
            <h2 id="how-heading" className="font-heading text-3xl font-semibold tracking-tight">
              From file to report in three steps
            </h2>
            <ol className="grid gap-6 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-4">
                  <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-sm font-medium text-primary-foreground"
                  >
                    {index + 1}
                  </span>
                  <div className="space-y-1">
                    <h3 className="font-heading text-base font-semibold">{step.title}</h3>
                    <p className="text-muted-foreground">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="bg-card">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <h2 className="font-heading text-2xl font-semibold tracking-tight">Run your first test in a minute</h2>
              <p className="text-base text-muted-foreground">
                Every new account gets a Quick Start project of passing, failing and invalid examples.
              </p>
            </div>
            <Link href="/register" className={buttonVariants({ size: "lg" })}>
              Create an account
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-muted-foreground sm:px-6">
          <span className="flex items-center gap-2 font-medium text-foreground">
            <BrandMark />
            Jevwright
          </span>
          <a className="underline-offset-4 hover:underline" href="https://yike2.github.io/Jevwright/api/">
            API reference
          </a>
          <a className="underline-offset-4 hover:underline" href="https://github.com/yike2/Jevwright">
            Source on GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
