import Link from 'next/link'

export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-8 py-16">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Your canvases</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          The canvas where a human thinks in nodes and edges.
        </p>
      </header>
      <div className="flex gap-3">
        <Link
          href="/canvas/new"
          className="inline-flex h-10 items-center rounded-md bg-black px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          New canvas
        </Link>
        <Link
          href="/canvas/test"
          className="inline-flex h-10 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Open /canvas/test
        </Link>
      </div>
      <p className="text-sm text-zinc-500">
        Dashboard list is scaffolding — canvas dashboard story wires the real list.
      </p>
    </main>
  )
}
