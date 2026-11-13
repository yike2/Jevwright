import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-950 p-8 text-slate-100">
      <div className="space-y-3 text-center">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-400">Jevwright</p>
        <h1 className="text-4xl font-semibold tracking-tight">Workspace dashboard</h1>
        <p className="max-w-xl text-slate-300">Placeholder landing page for the Jevwright frontend scaffold.</p>
      </div>
      <Link
        href="/login"
        className="rounded-md bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-400"
      >
        Go to login
      </Link>
    </main>
  );
}
