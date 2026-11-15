import Link from "next/link";
import { CircleAlert, GitBranch } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandMark } from "@/components/landing/brand-mark";
import { CopyCommand } from "@/components/landing/copy-command";
import { Flow } from "@/components/landing/flow";
import { RunReplay } from "@/components/landing/run-replay";
import { API_URL, DOCS_URL, REPO_URL, SiteHeader } from "@/components/landing/site-header";
import { StatusBadge } from "@/components/workspace/status-badge";
import { COMMAND, QUICK_START_MODULES, REPLAY_RUNS, RUN_RECEIPT, STATS, VALIDATE_RECEIPT } from "@/lib/landing";

const ARCHITECTURE_URL = "https://yike2.github.io/Jevwright/archify/jevwright-architecture/";
const SEQUENCE_URL = "https://yike2.github.io/Jevwright/archify/jevwright-sequence/";

const FIXES = [
  {
    problem: "A redesign renames classes and ids",
    before: "Selector-only steps fail until someone edits them.",
    after:
      'Steps that also have a target, such as "the green Login button", fall back to it. The report shows which method worked; the file stays as written.',
  },
  {
    problem: "Elements without stable test ids",
    before: "Third-party widgets and generated markup need long, fragile selectors.",
    after: "Describe the element in words with target, and Jev finds it on the page.",
  },
  {
    problem: "Checks that are hard to write as a selector",
    before: '"The cart lists two items with prices" becomes several brittle text checks.',
    after: "Write it as a statement. Playwright checks the selector first when there is one, and Jev judges the rest.",
  },
  {
    problem: "Tests written by an agent or a newcomer",
    before: "A typo shows up in the middle of a browser run.",
    after:
      "Validation lists every problem with its line before anything runs, and planning keys such as aiAct are refused.",
  },
];

const CHOICES = [
  ["A stable selector exists", "selector", "Fast, free and deterministic; Jev is never called."],
  ["No reliable selector, or the UI changes often", "target", "Jev finds the element from your words."],
  ["You want speed and resilience", "selector + target", "The selector goes first; Jev only when it matches nothing."],
  ["Exact text, URL or visibility", "assert with selector, text or url", "A Playwright check, fast and repeatable."],
  ["Meaning or layout in words", "assert with statement", "Jev judges the statement from a screenshot."],
];

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
  ["Which browsers does it run?", "Chromium, through Playwright, on the server and with the CLI."],
  [
    "Can a Run on the server test a site on my private network?",
    "No. Runs on the server reach public addresses only; local and private addresses are blocked. Run those tests with the CLI on your own machine.",
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
  const fallbackStep = REPLAY_RUNS[1]?.report.steps[3];

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
            <div className="max-w-xl">
              <CopyCommand command={COMMAND} />
            </div>
          </div>
        </section>

        <Section
          id="real-run"
          title="A real Run, not a screenshot"
          lead="Two Quick Start files ran on the Jevwright server against the Demo App; these are their reports and step screenshots, replayed. The second one called Jev."
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

        <Section id="fixes" index="02" title="What does it fix?" tinted>
          <div className="grid gap-4 md:grid-cols-2">
            {FIXES.map((fix) => (
              <Card key={fix.problem}>
                <CardHeader>
                  <h3 className="font-heading text-base font-semibold">{fix.problem}</h3>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p>
                    <span className="font-medium text-destructive">Before: </span>
                    <span className="text-muted-foreground">{fix.before}</span>
                  </p>
                  <p>
                    <span className="font-medium text-success">After: </span>
                    {fix.after}
                  </p>
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
          <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
            <table className="w-full min-w-[36rem] text-left">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    When
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Write
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Why
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y bg-card">
                {CHOICES.map(([when, write, why]) => (
                  <tr key={when}>
                    <td className="px-3 py-2">{when}</td>
                    <td className="px-3 py-2 font-mono text-[0.8125rem]">{write}</td>
                    <td className="px-3 py-2 text-muted-foreground">{why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section
          id="architecture"
          index="04"
          title="What runs where?"
          lead="One Core runs every test, whether it starts in the web app, the command line or the REST API."
          tinted
        >
          <figure className="space-y-3">
            <Flow
              label="How the parts fit together"
              nodes={[
                { title: "Web app, CLI, REST API", detail: "Where a Run starts" },
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
          lead="Real output of the command line, and the same states in the web app."
        >
          <ol className="grid gap-6 lg:grid-cols-3">
            <li className="min-w-0 space-y-3">
              <h3 className="font-heading text-base font-semibold">1. Validate</h3>
              <p className="text-muted-foreground">
                Every problem at once, each with its line, before a browser starts.
              </p>
              <Receipt label="validate output" text={VALIDATE_RECEIPT} />
              <p className="flex items-center gap-2 font-medium text-destructive">
                <CircleAlert aria-hidden="true" className="size-4" />7 validation errors
              </p>
            </li>
            <li className="min-w-0 space-y-3">
              <h3 className="font-heading text-base font-semibold">2. Run</h3>
              <p className="text-muted-foreground">Each step with its locate method and duration.</p>
              <Receipt label="run output" text={RUN_RECEIPT} />
              <StatusBadge status="passed" label="Passed" />
            </li>
            <li className="min-w-0 space-y-3">
              <h3 className="font-heading text-base font-semibold">3. Report</h3>
              <p className="text-muted-foreground">
                report.json, a Playwright trace and a screenshot per step. The step Jev located, from the report above:
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

        <Section id="start" title="Quick start">
          <Tabs defaultValue="web">
            <TabsList>
              <TabsTrigger value="web">Web</TabsTrigger>
              <TabsTrigger value="cli">CLI</TabsTrigger>
            </TabsList>
            <TabsContent value="web" className="pt-4">
              <div className="grid gap-6 lg:grid-cols-2">
                <ol className="space-y-3">
                  <li>
                    <span className="font-medium">1. Register.</span> Your account starts with a Quick Start project.
                  </li>
                  <li>
                    <span className="font-medium">2. Open a file</span> in the sidebar and read its first three lines:
                    what it does, what to expect, what to try.
                  </li>
                  <li>
                    <span className="font-medium">3. Click Run</span> and follow the steps live.
                  </li>
                </ol>
                <ul aria-label="Quick Start Modules" className="divide-y rounded-lg border">
                  {QUICK_START_MODULES.map((module) => (
                    <li key={module.name} className="px-3 py-2">
                      <p className="font-medium">{module.name}</p>
                      <p className="text-muted-foreground">{module.teaches}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </TabsContent>
            <TabsContent value="cli" className="pt-4">
              <ol className="space-y-4">
                <li className="space-y-2">
                  <p className="font-medium">1. Install, with Node.js 22 and pnpm</p>
                  <Receipt
                    label="install commands"
                    text={
                      "git clone https://github.com/yike2/Jevwright.git\ncd Jevwright\npnpm install\npnpm exec playwright install --with-deps chromium"
                    }
                  />
                </li>
                <li className="space-y-2">
                  <p className="font-medium">2. Check a file without a browser</p>
                  <Receipt label="validate command" text="pnpm jevwright validate tests/login.yaml" />
                </li>
                <li className="space-y-2">
                  <p className="font-medium">3. Run it; add --headed to watch the browser</p>
                  <Receipt label="run command" text="pnpm jevwright run tests/login.yaml" />
                </li>
              </ol>
            </TabsContent>
          </Tabs>
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
            <div className="w-full max-w-xl">
              <CopyCommand command={COMMAND} />
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/register" className={buttonVariants({ size: "lg" })}>
                Get started
              </Link>
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
