# ThinkingCanvas Web

Frontend for ThinkingCanvas — the canvas where a human thinks in nodes and
edges. Backend (`thinking-canvas-api`) lives in a separate repository.

See `CLAUDE.md` and `IMPLEMENTATION-ORDER.md` for the full agent playbook.

## Getting Started

```bash
npm install
cp .env.example .env.local   # fill in real values
npm run dev
```

Then open http://localhost:3000.

## Environment Variables

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (RLS is the boundary) |
| `NEXT_PUBLIC_API_URL` | Backend base URL, e.g. `http://localhost:3001` |

Never put service-role or Stripe secrets here — `NEXT_PUBLIC_*` ships to the
browser.

## Route Shells

- `/` — canvas dashboard
- `/canvas/new` — north star capture (write-once)
- `/canvas/[canvasId]` — the canvas (React Flow)
- `/login` — auth
- `/settings` — account + Stripe portal

## Smoke Test — Backend Health

With the backend running on `NEXT_PUBLIC_API_URL`:

```bash
curl "$NEXT_PUBLIC_API_URL/health"
```

The frontend never gates on this endpoint, but a green response confirms the
backend is reachable before any canvas work.

## Scripts

```bash
npm run dev     # Next.js dev server (localhost:3000)
npm run build   # Production build
npm run lint    # ESLint
```

## Stack

- Next.js App Router + React 19
- React Flow (`@xyflow/react`) for the canvas
- Zustand for client state
- Supabase (`@supabase/supabase-js` + `@supabase/ssr`) for auth + persistence
- Tailwind CSS
- Deployed to Vercel
