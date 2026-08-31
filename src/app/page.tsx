"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ensureAnonSession } from "@/lib/auth"
import { supabase } from "@/lib/supabase"
import { logger } from "@/lib/logger"
import { MOCK_CANVASES } from "@/lib/mock-canvases"

const USE_MOCK_PERSISTENCE = process.env.NEXT_PUBLIC_USE_MOCK_PERSISTENCE === "true"

// One shape the grid renders regardless of source — real rows from Supabase
// or the mock list behind the flag.
interface CanvasCard {
  id: string
  title: string
  originalIntent: string
  meta: string
}

type LoadState = "loading" | "ready" | "error"

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

// A shelf of notebooks, not a KPI dashboard — title is the only bold thing on
// each card; the north-star excerpt underneath borrows the canvas surface's
// quiet Caveat register; metadata stays smallest of all (design brief §2a).
export default function DashboardPage() {
  // Mock canvases are synchronous, so they seed initial state directly — no
  // effect (calling setState in an effect body triggers cascading renders).
  // The real path stays async and sets state from inside the fetch callback.
  const [canvases, setCanvases] = useState<CanvasCard[]>(() =>
    USE_MOCK_PERSISTENCE
      ? MOCK_CANVASES.map((c) => ({
          id: c.id,
          title: c.title,
          originalIntent: c.originalIntent,
          meta: c.sessionLabel,
        }))
      : [],
  )
  const [state, setState] = useState<LoadState>(USE_MOCK_PERSISTENCE ? "ready" : "loading")
  // Inline rename — id of the card currently in edit mode, plus its draft
  // text. Only one card edits at a time. menuOpenId tracks which card's "⋯"
  // menu (Rename) is open — also only ever one at a time.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState("")
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuOpenId) return
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpenId(null)
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [menuOpenId])

  function startEditingTitle(canvas: CanvasCard) {
    setTitleDraft(canvas.title)
    setEditingId(canvas.id)
    setMenuOpenId(null)
    requestAnimationFrame(() => titleInputRef.current?.select())
  }

  function commitTitle(canvas: CanvasCard) {
    setEditingId(null)
    const next = titleDraft.trim() || "Untitled"
    if (next === canvas.title) return
    setCanvases((cs) => cs.map((c) => (c.id === canvas.id ? { ...c, title: next } : c)))
    if (USE_MOCK_PERSISTENCE) {
      logger.debug("[dashboard] title changed (mock — no Supabase write)", { id: canvas.id, title: next })
      return
    }
    void supabase
      .from("canvases")
      .update({ title: next })
      .eq("id", canvas.id)
      .then(({ error }) => {
        if (error) logger.warn("[dashboard] title write failed", { id: canvas.id, title: next, error })
        else logger.info("[dashboard] title persisted", { id: canvas.id, title: next })
      })
  }

  useEffect(() => {
    if (USE_MOCK_PERSISTENCE) return

    let cancelled = false
    async function load() {
      // RLS scopes the select to the signed-in user's own canvases — no
      // explicit user_id filter needed, but a session must exist first or the
      // read comes back empty.
      await ensureAnonSession()
      const { data, error } = await supabase
        .from("canvases")
        .select("id, title, original_intent, created_at")
        .order("created_at", { ascending: false })

      if (cancelled) return
      if (error) {
        logger.error("[dashboard] failed to load canvases", { error })
        setState("error")
        return
      }
      setCanvases(
        (data ?? []).map((c) => ({
          id: c.id,
          title: c.title,
          originalIntent: c.original_intent,
          meta: formatDate(c.created_at),
        })),
      )
      setState("ready")
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="tc-scope min-h-screen" style={{ background: "var(--tc-surface)" }}>
      <div className="mx-auto w-full max-w-[1440px] px-14 py-11">
        <div className="mb-[52px] flex items-center justify-between">
          <span style={{ fontFamily: "var(--font-tc-hand)", fontSize: 24, color: "var(--tc-chrome-quiet)" }}>
            ThinkingCanvas
          </span>
          <div className="flex items-center gap-3.5">
            <span className="text-xs" style={{ color: "var(--tc-chrome-quiet)" }}>
              {state === "ready" ? `${canvases.length} canvases` : " "}
            </span>
            <div
              className="flex h-[30px] w-[30px] items-center justify-center rounded-full text-[11.5px] font-semibold"
              style={{ background: "#EFE8D9", border: "1px solid var(--tc-hairline-strong)", color: "#6B6257" }}
            >
              AL
            </div>
          </div>
        </div>

        {state === "error" ? (
          <div className="text-[13px]" style={{ color: "#B4472E" }}>
            Couldn&rsquo;t load your canvases. Refresh to try again.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-[22px]">
            <Link
              href="/canvas/new"
              className="flex min-h-[168px] flex-col items-center justify-center gap-2 rounded-xl p-[22px] transition-colors hover:border-black/35 hover:bg-[#F5F0E4] hover:text-[var(--tc-ink)]"
              style={{ border: "1px solid var(--tc-hairline-strong)", background: "var(--tc-panel)", color: "var(--tc-chrome)" }}
            >
              <span className="text-[26px] leading-none">+</span>
              <span className="text-[13px]">New canvas</span>
            </Link>

            {state === "ready" &&
              canvases.map((canvas) => (
                <Link
                  key={canvas.id}
                  href={`/canvas/${canvas.id}`}
                  className="group relative flex min-h-[168px] flex-col rounded-xl p-[20px_22px]"
                  style={{
                    background: "var(--tc-node)",
                    border: "1px solid var(--tc-node-border)",
                    boxShadow: "0 1px 2px rgba(43,38,34,.06)",
                  }}
                >
                  <div
                    className="absolute right-2.5 top-2.5 z-10"
                    ref={menuOpenId === canvas.id ? menuRef : undefined}
                    // Swallow every click in this whole area — the circle,
                    // the popover, its padding — so none of it reaches the
                    // card's <Link>. stopPropagation alone doesn't stop an
                    // anchor's default "follow href" navigation; only
                    // preventDefault does, so both are needed here.
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                  >
                    <button
                      type="button"
                      title="Canvas options"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setMenuOpenId((id) => (id === canvas.id ? null : canvas.id))
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-[17px] font-bold leading-none hover:bg-black/[.08]"
                      style={{ background: "rgba(43,38,34,.05)", border: "none", color: "var(--tc-chrome)" }}
                    >
                      ⋮
                    </button>
                    {menuOpenId === canvas.id && (
                      <div
                        className="absolute right-0 top-[34px] min-w-[120px] rounded-lg p-1"
                        style={{
                          background: "var(--tc-panel)",
                          border: "1px solid var(--tc-panel-border)",
                          boxShadow: "0 4px 14px rgba(43,38,34,.12)",
                        }}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            startEditingTitle(canvas)
                          }}
                          className="w-full rounded-md px-2.5 py-1.5 text-left text-[12.5px] hover:bg-black/[.045]"
                          style={{ background: "none", border: "none", color: "var(--tc-ink)" }}
                        >
                          Rename
                        </button>
                      </div>
                    )}
                  </div>
                  {editingId === canvas.id ? (
                    <input
                      ref={titleInputRef}
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      onBlur={() => commitTitle(canvas)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); commitTitle(canvas) }
                        if (e.key === "Escape") { e.preventDefault(); setEditingId(null) }
                      }}
                      // The card itself is the <Link> — stop the click/mousedown
                      // that focuses this input from also triggering navigation.
                      onClick={(e) => e.preventDefault()}
                      onMouseDown={(e) => e.stopPropagation()}
                      maxLength={120}
                      autoFocus
                      className="mb-2 w-[calc(100%-28px)] bg-transparent text-[15.5px] font-semibold outline-none"
                      style={{ color: "var(--tc-ink)", border: "none", borderBottom: "1px solid var(--tc-hairline-strong)" }}
                    />
                  ) : (
                    <div className="mb-2 pr-6 text-[15.5px] font-semibold" style={{ color: "var(--tc-ink)" }}>
                      {canvas.title}
                    </div>
                  )}
                  <div
                    className="flex-1 text-base leading-[1.35]"
                    style={{ fontFamily: "var(--font-tc-hand)", color: "#9C9284" }}
                  >
                    &ldquo;{canvas.originalIntent}&rdquo;
                  </div>
                  <div
                    className="mt-3.5 flex items-center justify-between text-[11px]"
                    style={{ color: "var(--tc-chrome-faint)" }}
                  >
                    <span>{canvas.meta}</span>
                  </div>
                </Link>
              ))}
          </div>
        )}
      </div>
    </main>
  )
}
