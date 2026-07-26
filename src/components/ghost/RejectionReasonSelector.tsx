import { useGhostStore } from "@/stores/ghost-store"
import type { RejectionReason } from "@/types/mock-contract"

const REASONS: { value: RejectionReason; label: string }[] = [
  { value: "too_abstract", label: "Too abstract" },
  { value: "too_technical", label: "Too technical" },
  { value: "skip_for_now", label: "Skip for now" },
]

// A lightweight popover, never a modal — appears immediately after reject so
// the disappearance and the prompt read as one event. Rejection is signal,
// not failure: the reason feeds the backend's Rejection Insights loop
// (GHOST-STREAMING.md).
export function RejectionReasonSelector() {
  return (
    <div
      className="absolute left-0 top-full z-10 mt-2 w-[190px] rounded-[10px] p-[10px]"
      style={{
        background: "var(--tc-panel)",
        border: "1px solid var(--tc-panel-border)",
        boxShadow: "0 4px 14px rgba(43,38,34,.1)",
        animation: "tc-popfrombottom .32s cubic-bezier(.22,.85,.32,1) both",
        fontStyle: "normal",
      }}
    >
      <div className="mb-1.5 text-[11px]" style={{ color: "var(--tc-chrome-quiet)" }}>
        Why pass? — teaches it what to offer
      </div>
      <div className="flex flex-col gap-0.5">
        {REASONS.map((r) => (
          <button
            key={r.value}
            type="button"
            className="rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-black/5"
            style={{ color: "#5F574C", background: "none", border: "none" }}
            onClick={() => useGhostStore.getState().chooseRejectionReason(r.value)}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  )
}
