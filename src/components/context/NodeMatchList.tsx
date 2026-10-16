import type { NodeMatch } from "@/hooks/use-context-notes"

// The `#text` autocomplete rows — also reused as the "Move to" node picker in
// the context panel, so both read the same (§5.5 "Move opens the same node
// picker as the # shortcut"). Each row: sequence number, node text, note count.
export function NodeMatchList({
  matches,
  activeIndex,
  onPick,
  emptyText = "No node matches.",
  id,
}: {
  matches: NodeMatch[]
  activeIndex: number
  onPick: (match: NodeMatch) => void
  emptyText?: string
  id?: string
}) {
  return (
    <div
      id={id}
      role="listbox"
      aria-label="Matching nodes"
      className="overflow-hidden rounded-lg"
      style={{ background: "var(--tc-node)", border: "1px solid var(--tc-node-border)", boxShadow: "0 6px 18px rgba(43,38,34,.14)" }}
    >
      {matches.length === 0 ? (
        <div className="px-3 py-2 text-[12px]" style={{ color: "var(--tc-chrome)" }}>
          {emptyText}
        </div>
      ) : (
        matches.map((m, i) => (
          <button
            key={m.id}
            type="button"
            role="option"
            aria-selected={i === activeIndex}
            // mousedown, not click: keeps the textarea from blurring first.
            onMouseDown={(e) => {
              e.preventDefault()
              onPick(m)
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px]"
            style={{
              border: "none",
              background: i === activeIndex ? "var(--tc-focus-soft)" : "transparent",
              color: "var(--tc-ink)",
              cursor: "pointer",
            }}
          >
            <span className="flex-none font-semibold tabular-nums" style={{ color: "var(--tc-focus-ink)", minWidth: 26 }}>
              {m.seq ? `n${m.seq}` : "n?"}
            </span>
            <span className="min-w-0 flex-1 truncate">{m.text.trim() || "Untitled"}</span>
            <span className="flex-none text-[11px]" style={{ color: "var(--tc-chrome-quiet)" }}>
              {m.notes === 1 ? "1 note" : `${m.notes} notes`}
            </span>
          </button>
        ))
      )}
    </div>
  )
}
