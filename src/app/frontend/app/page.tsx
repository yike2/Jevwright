import Link from "next/link";
import { CircleAlert, GitBranch } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BrandMark } from "@/components/landing/brand-mark";
import { Flow } from "@/components/landing/flow";
import { RunReplay } from "@/components/landing/run-replay";
import { API_URL, DOCS_URL, REPO_URL, SiteHeader } from "@/components/landing/site-header";
import { StartButton } from "@/components/landing/start-button";
import { StatusBadge } from "@/components/workspace/status-badge";
import {
  CHOICES,
  DEBUG_RECEIPT,
  DEMO_APP_URL,
  FIXES,
  OUTPUT_RECEIPT,
  QUICK_START_FILES,
  QUICK_START_FOLDERS,
  REPLAY_RUNS,
  STATS,
} from "@/lib/landing";

const ARCHITECTURE_URL = "https://yike2.github.io/Jevwright/archify/jevwright-architecture/";
const SEQUENCE_URL = "https://yike2.github.io/Jevwright/archify/jevwright-sequence/";
const QUICK_START_GUIDE_URL = `${DOCS_URL}guide/quick-start.html`;

const FAQ = [
  [
    "Is it an LLM test planner?",
    "No. No model plans or drives the test. Keys such as ai and aiAct are refused when the file is validated (E005).",
  ],
  [
    "Does it fix my tests for me?",
    "No. A test file is never rewritten or self-healed. A fallback from a stale selector to its target is recorded in the report, and the file stays as you wrote it.",
  ],
  [
    "Can a step leave out how to find its element?",
    "No. Every element step needs a selector, a target, or both; validation reports a step with neither (E008).",
  ],
  [
    "What does Jev cost?",
    "Each Jev call takes a few seconds and a little money through OpenRouter, and its answers can vary from Run to Run. That is why Playwright always goes first, why a locating answer below 0.7 confidence counts as no answer, and why a statement holds only when Jev rates it 0.8 or higher.",
  ],
  ["Which browsers does it run?", "Chromium, through Playwright, on the Jevwright server."],
  [
    "Can a Run test a site on my private network?",
    "No. Runs on the server reach public addresses only; localhost and private addresses are blocked. Put the app, or a preview of it, on a public domain, and start signed in with a cookie or a token when it has a sign-in.",
  ],
];

function Eyebrow({ index }: { index: string }) {
  return <p className="font-mono text-xs text-muted-foreground">{index}</p>;
}

function Section({
  id,
  index,
  title,
  lead,
  children,
  tinted = false,
}: {
  id: string;
  index?: string;
  title: string;
  lead?: string;
  children: React.ReactNode;
  tinted?: boolean;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={tinted ? "border-b bg-card" : "border-b"}>
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-16 sm:px-6">
        <div className="max-w-2xl space-y-3">
          {index && <Eyebrow index={index} />}
          <h2 id={`${id}-heading`} className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            {title}
          </h2>
          {lead && <p className="text-base text-muted-foreground">{lead}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

function Code({ label, text }: { label: string; text: string }) {
  return (
    <pre
      aria-label={label}
      className="overflow-x-auto rounded-lg border bg-code p-3 font-mono text-xs leading-relaxed text-code-foreground"
    >
      <code>{text}</code>
    </pre>
  );
}

function Receipt({ label, text }: { label: string; text: string }) {
  return (
    <pre
      aria-label={label}
      className="overflow-x-auto rounded-lg border bg-code p-3 font-mono text-xs leading-relaxed text-code-foreground"
    >
      {text}
    </pre>
  );
}

/** The product page at / (frontend.md 1.14): a server component apart from the header, the replay and the copy button. */
export default function LandingPage() {
  const fallbackStep = REPLAY_RUNS[0]?.report.steps[3];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="border-b">
          <div className="mx-auto max-w-6xl space-y-8 px-4 py-16 sm:px-6 lg:py-24">
            <h1 className="max-w-4xl font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Web tests as plain YAML steps.{" "}
              <span className="text-muted-foreground">
                Playwright runs them, and Jev helps{" "}
                <em className="text-info not-italic">only where a selector is not enough</em>.
              </span>
            </h1>
            <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
              Each step is one action with a selector, a plain-language target, or both. Playwright clicks, types and
              checks; Jev, a small and fast model, is asked one short question only when a step needs it.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/register" className={buttonVariants({ size: "lg" })}>
                Get started
              </Link>
              <a href="#real-run" className={buttonVariants({ size: "lg", variant: "outline" })}>
                See a real Run
              </a>
            </div>
          </div>
        </section>

        <Section
          id="real-run"
          title="A real Run, not a screenshot"
          lead="Two Quick Start files ran on the Jevwright server against the Demo App; these are their reports and step screenshots, replayed. The first one called Jev, and only the steps where Jev did the work are marked: AI locate when Jev found the element, AI assert when Jev judged a statement."
          tinted
        >
          <RunReplay runs={REPLAY_RUNS} />
          <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {STATS.map((stat) => (
              <div key={stat.label} className="flex flex-col gap-1 border-l-2 border-info pl-3">
                <dt className="text-muted-foreground">{stat.label}</dt>
                <dd className="order-first font-heading text-3xl font-semibold">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section
          id="locate"
          index="01"
          title="How does Jev find an element?"
          lead="Playwright always goes first. Jev is asked only when a step has no selector, or its selector matches nothing, and only to point at one element."
        >
          <div className="space-y-6">
            <figure className="space-y-2">
              <figcaption className="font-medium">A selector that matches: no Jev call</figcaption>
              <Flow
                label="Locating with a selector that matches"
                nodes={[
                  { title: "selector", detail: '[data-test="login-button"]' },
                  { title: "Playwright finds it", detail: "Visible within the timeout" },
                  { title: "The action runs", detail: 'Recorded as "selector"', tone: "success" },
                ]}
              />
            </figure>
            <figure className="space-y-2">
              <figcaption className="font-medium">Only a target, or a selector that matches nothing</figcaption>
              <Flow
                label="Locating by description"
                nodes={[
                  { title: "target", detail: '"Green Login button below the password field"' },
                  {
                    title: "Visual Locate",
                    detail: "Jev gets a screenshot and returns a box and its confidence",
                    tone: "info",
                  },
                  {
                    title: "DOM Locate, if unsure",
                    detail: "Jev picks one element from a short list, or none",
                    tone: "info",
                  },
                  { title: "Playwright acts on it", detail: 'Recorded as "visual" or "dom"', tone: "success" },
                ]}
              />
            </figure>
            <p className="max-w-3xl text-muted-foreground">
              An answer below 0.7 confidence counts as no answer. When every method fails, the step fails with its
              reason and screenshot; the test file is never changed.
            </p>
          </div>
        </Section>

        <Section
          id="fixes"
          index="02"
          title="What does it fix?"
          lead="The same step in Playwright and in Jevwright, side by side."
          tinted
        >
          <div className="space-y-6">
            {FIXES.map((fix) => (
              <Card key={fix.problem}>
                <CardHeader>
                  <h3 className="font-heading text-base font-semibold">{fix.problem}</h3>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-4 md:grid-cols-2">
                    <figure className="min-w-0 space-y-1">
                      <figcaption className="text-xs font-medium text-muted-foreground">Playwright</figcaption>
                      <Code label={`${fix.problem}: Playwright`} text={fix.playwright} />
                    </figure>
                    <figure className="min-w-0 space-y-1">
                      <figcaption className="text-xs font-medium text-muted-foreground">Jevwright</figcaption>
                      <Code label={`${fix.problem}: Jevwright`} text={fix.jevwright} />
                    </figure>
                  </div>
                  <p className="text-muted-foreground">{fix.note}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>

        <Section
          id="choose"
          index="03"
          title="Which should I write?"
          lead="Jev calls cost a little time and money, and their answers can vary, so use them where a selector cannot do the job."
        >
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {CHOICES.map((choice) => (
              <li
                key={choice.write}
                className="flex min-w-0 flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
              >
                <p className="font-medium">{choice.when}</p>
                <p>
                  <span className="text-muted-foreground">Write </span>
                  <span className="font-mono text-[0.8125rem]">{choice.write}</span>
                </p>
                <p className="text-muted-foreground">{choice.why}</p>
                <div className="mt-auto">
                  <Code label={`Example: ${choice.write}`} text={choice.yaml} />
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          id="architecture"
          index="04"
          title="What runs where?"
          lead="One Core runs every test you start in the web workspace, on the Jevwright server."
          tinted
        >
          <figure className="space-y-3">
            <Flow
              label="How the parts fit together"
              nodes={[
                { title: "Web workspace", detail: "Where you write and run tests" },
                {
                  title: "Core",
                  detail: "Validates the file, runs the steps, locates, asserts, writes the report",
                  tone: "info",
                },
                { title: "Playwright and Chromium", detail: "Every action and check" },
                { title: "Jev through OpenRouter", detail: "Only to locate or judge" },
              ]}
            />
            <figcaption className="text-muted-foreground">
              The full interactive diagrams:{" "}
              <a className="text-info underline underline-offset-4" href={ARCHITECTURE_URL}>
                architecture
              </a>{" "}
              and{" "}
              <a className="text-info underline underline-offset-4" href={SEQUENCE_URL}>
                run sequence
              </a>
              .
            </figcaption>
          </figure>
          <p className="max-w-3xl text-muted-foreground">
            Unlike runners where a language model plans the test, there is no planning loop: the steps are yours, Jev
            answers at most one small question for a step and only when it needs one, and a Run whose selectors match
            does the same thing every time.
          </p>
        </Section>

        <Section
          id="checked"
          title="Checked before it runs"
          lead="Real output of the web workspace for two Quick Start files."
        >
          <ol className="grid gap-x-6 gap-y-3 lg:grid-cols-3 lg:grid-rows-[auto_auto_1fr_auto]">
            {/* Each step spans the parent's four rows (subgrid), so headings, texts, code and states line up. */}
            <li className="grid min-w-0 gap-3 lg:row-span-4 lg:grid-rows-subgrid">
              <h3 className="font-heading text-base font-semibold">1. Validate</h3>
              <p className="text-muted-foreground">
                Every problem at once, each with its line, in the Debug console as you type and save, before a browser
                starts.
              </p>
              <Receipt label="Debug console" text={DEBUG_RECEIPT} />
              <p className="flex items-center gap-2 font-medium text-destructive">
                <CircleAlert aria-hidden="true" className="size-4" />7 problems
              </p>
            </li>
            <li className="grid min-w-0 gap-3 lg:row-span-4 lg:grid-rows-subgrid">
              <h3 className="font-heading text-base font-semibold">2. Run</h3>
              <p className="text-muted-foreground">Each step live in the Output console, with its line and status.</p>
              <Receipt label="Output console" text={OUTPUT_RECEIPT} />
              <StatusBadge status="passed" label="Passed" />
            </li>
            <li className="grid min-w-0 gap-3 lg:row-span-4 lg:grid-rows-subgrid">
              <h3 className="font-heading text-base font-semibold">3. Report</h3>
              <p className="text-muted-foreground">
                A downloadable report.json, a Playwright trace and a screenshot per step. The step Jev located, from the
                report above:
              </p>
              <Receipt label="report step" text={JSON.stringify(fallbackStep, null, 2)} />
              <StatusBadge status="passed" label="Passed" />
            </li>
          </ol>
        </Section>

        <Section
          id="themes"
          title="Light and dark"
          lead="The workspace follows your system setting, or the theme you pick."
          tinted
        >
          <div className="grid gap-4 md:grid-cols-2">
            {(["light", "dark"] as const).map((theme) => (
              <figure key={theme} className="space-y-2">
                <img
                  src={`/landing/workspace-${theme}.webp`}
                  alt={`The workspace in the ${theme} theme: the Quick Start project in the sidebar and a test file with its validation errors`}
                  width={1280}
                  height={800}
                  loading="lazy"
                  className="h-auto w-full rounded-lg border"
                />
                <figcaption className="text-xs text-muted-foreground">
                  {theme === "light" ? "Light" : "Dark"}
                </figcaption>
              </figure>
            ))}
          </div>
        </Section>

        <Section
          id="start"
          title="Quick start"
          lead="Try every feature on the Demo App, a small online shop we host, in the web workspace."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <ol className="space-y-3">
                <li>
                  <span className="font-medium">1. Register.</span> Your account starts with a Quick Start project,
                  whose <code className="font-mono text-[0.8125rem]">BASE</code> Variable is already the Demo App,{" "}
                  <span className="font-mono text-[0.8125rem] break-all">{DEMO_APP_URL}</span>. Its test users, such as{" "}
                  <code className="font-mono text-[0.8125rem]">standard_user</code>, sign in with the password{" "}
                  <code className="font-mono text-[0.8125rem]">secret_sauce</code>.
                </li>
                <li>
                  <span className="font-medium">2. Open a file</span> in the sidebar and read its first three lines:
                  what it does, what to expect, what to try.
                </li>
                <li>
                  <span className="font-medium">3. Click Run</span> and follow the steps live, then open the report.
                </li>
              </ol>
              <StartButton />
              <p className="text-muted-foreground">
                To test your own app, it must be on a public domain our server can reach, not localhost or a private
                network, and a page behind a sign-in needs a cookie, a header or a storage entry with a session.{" "}
                <a className="text-info underline underline-offset-4" href={QUICK_START_GUIDE_URL}>
                  Read the Quick start guide
                </a>
                .
              </p>
            </div>
            <div className="space-y-4">
              <ul aria-label="Quick Start files" className="divide-y rounded-lg border">
                {QUICK_START_FILES.map((file) => (
                  <li key={file.file} className="px-3 py-2">
                    <p className="font-medium">{file.feature}</p>
                    <p className="font-mono text-[0.8125rem] break-all text-muted-foreground">{file.file}</p>
                  </li>
                ))}
              </ul>
              <ul aria-label="Quick Start folders" className="divide-y rounded-lg border">
                {QUICK_START_FOLDERS.map((folder) => (
                  <li key={folder.name} className="px-3 py-2">
                    <p className="font-medium">{folder.name}</p>
                    <p className="text-muted-foreground">{folder.teaches}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        <Section id="limits" title="What it is, and what it is not" tinted>
          <dl className="grid gap-x-8 gap-y-6 md:grid-cols-2">
            {FAQ.map(([question, answer]) => (
              <div key={question} className="space-y-1">
                <dt className="font-heading font-semibold">{question}</dt>
                <dd className="text-muted-foreground">{answer}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <section aria-labelledby="cta-heading">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6">
            <h2 id="cta-heading" className="font-heading text-2xl font-semibold tracking-tight">
              Write the steps. Playwright runs them.
            </h2>
            <div className="flex flex-wrap gap-3">
              <Link href="/register" className={buttonVariants({ size: "lg" })}>
                Get started
              </Link>
              <a href={DOCS_URL} className={buttonVariants({ size: "lg", variant: "outline" })}>
                Read the guide
              </a>
              <a href={REPO_URL} className={buttonVariants({ size: "lg", variant: "outline" })}>
                <GitBranch data-icon="inline-start" aria-hidden="true" />
                GitHub
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-muted-foreground sm:px-6">
          <span className="flex items-center gap-2 font-medium text-foreground">
            <BrandMark />
            Jevwright
          </span>
          <a className="underline-offset-4 hover:underline" href={DOCS_URL}>
            Docs
          </a>
          <a className="underline-offset-4 hover:underline" href={API_URL}>
            API reference
          </a>
          <a className="underline-offset-4 hover:underline" href={ARCHITECTURE_URL}>
            Architecture
          </a>
          <a className="underline-offset-4 hover:underline" href={REPO_URL}>
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
