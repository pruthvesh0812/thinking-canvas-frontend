import Link from "next/link"
import { MOCK_CANVASES } from "@/lib/mock-canvases"

// A shelf of notebooks, not a KPI dashboard — title is the only bold thing on
// each card; the north-star excerpt underneath borrows the canvas surface's
// quiet Caveat register; metadata stays smallest of all (design brief §2a).
// canvas-dashboard hasn't landed against the real backend yet — MOCK_CANVASES
// stands in for "load every canvas the user owns."
export default function DashboardPage() {
  return (
    <main className="tc-scope min-h-screen" style={{ background: "var(--tc-surface)" }}>
      <div className="mx-auto w-full max-w-[1440px] px-14 py-11">
        <div className="mb-[52px] flex items-center justify-between">
          <span style={{ fontFamily: "var(--font-tc-hand)", fontSize: 24, color: "var(--tc-chrome-quiet)" }}>
            ThinkingCanvas
          </span>
          <div className="flex items-center gap-3.5">
            <span className="text-xs" style={{ color: "var(--tc-chrome-quiet)" }}>
              {MOCK_CANVASES.length} canvases
            </span>
            <div
              className="flex h-[30px] w-[30px] items-center justify-center rounded-full text-[11.5px] font-semibold"
              style={{ background: "#EFE8D9", border: "1px solid var(--tc-hairline-strong)", color: "#6B6257" }}
            >
              AL
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-[22px]">
          <Link
            href="/canvas/new"
            className="flex min-h-[168px] flex-col items-center justify-center gap-2 rounded-xl p-[22px] transition-colors hover:border-black/35 hover:bg-[#F5F0E4] hover:text-[var(--tc-ink)]"
            style={{ border: "1px solid var(--tc-hairline-strong)", background: "var(--tc-panel)", color: "var(--tc-chrome)" }}
          >
            <span className="text-[26px] leading-none">+</span>
            <span className="text-[13px]">New canvas</span>
          </Link>

          {MOCK_CANVASES.map((canvas) => (
            <Link
              key={canvas.id}
              href={`/canvas/${canvas.id}`}
              className="flex min-h-[168px] flex-col rounded-xl p-[20px_22px]"
              style={{
                background: "var(--tc-node)",
                border: "1px solid var(--tc-node-border)",
                boxShadow: "0 1px 2px rgba(43,38,34,.06)",
              }}
            >
              <div className="mb-2 text-[15.5px] font-semibold" style={{ color: "var(--tc-ink)" }}>
                {canvas.title}
              </div>
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
                <span>{canvas.sessionLabel}</span>
                <span>{canvas.nodeCount} nodes</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
