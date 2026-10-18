import { useState, type ChangeEvent, type KeyboardEvent } from "react"
import { parseBareAt, parseShortcut, searchNodes, type NodeMatch } from "@/hooks/use-context-notes"

// Shared keyboard model for the two note inputs — the anchored composer and
// the canvas context bar — so the shortcuts (§5.3) behave identically in
// both (§8 "Shortcuts": same in the composer and the bar).
//   @n2 + space/Enter → onAimSeq      #text → list, ↑/↓ + Enter → onPickNode
//   /all + space      → onAll         Enter → onSave, Shift/Alt+Enter newline
//   Esc               → closes the # list first, then onEscape
//   Backspace in an empty box → onBackspaceEmpty (chip "back")
export function useNoteInput(opts: {
  text: string
  setText: (text: string) => void
  onAimSeq: (seq: number, rest: string) => boolean
  onPickNode: (match: NodeMatch, rest: string) => void
  onAll: (rest: string) => void
  onSave: () => void
  onEscape: () => void
  onBackspaceEmpty?: () => void
}) {
  const [caret, setCaret] = useState(0)
  const [hashIndex, setHashIndex] = useState(0)
  const [hashDismissedFor, setHashDismissedFor] = useState<string | null>(null)

  const shortcut = parseShortcut(opts.text, caret)
  const hashOpen = shortcut?.type === "hash" && hashDismissedFor !== opts.text
  const matches: NodeMatch[] = hashOpen && shortcut?.type === "hash" ? searchNodes(shortcut.query) : []

  function onChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value
    const pos = e.target.selectionStart ?? value.length
    setCaret(pos)
    setHashIndex(0)
    // Only act on the keystroke that completes a shortcut (the space right
    // after it) — so an unknown "@n9 " says so once, then stays plain text.
    const sc = parseShortcut(value, pos)
    const justTypedSpace = value[pos - 1] === " " && value.length > opts.text.length
    if (sc?.type === "at" && justTypedSpace && value.indexOf(" ") === pos - 1) {
      if (opts.onAimSeq(sc.seq, sc.rest)) return
    } else if (sc?.type === "all" && justTypedSpace && value.indexOf(" ") === pos - 1) {
      opts.onAll(sc.rest)
      return
    }
    opts.setText(value)
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (hashOpen && matches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setHashIndex((i) => Math.min(i + 1, matches.length - 1))
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setHashIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        const m = matches[Math.min(hashIndex, matches.length - 1)]
        if (m && shortcut?.type === "hash") opts.onPickNode(m, shortcut.rest)
        return
      }
    }
    if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      if (hashOpen) {
        // Esc closes the list and leaves the text as typed.
        setHashDismissedFor(opts.text)
        return
      }
      opts.onEscape()
      return
    }
    if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      const bare = parseBareAt(opts.text)
      if (bare !== null) {
        opts.onAimSeq(bare, "")
        return
      }
      opts.onSave()
      return
    }
    if (e.key === "Backspace" && opts.text === "" && opts.onBackspaceEmpty) {
      e.preventDefault()
      opts.onBackspaceEmpty()
    }
  }

  function onSelect(e: React.SyntheticEvent<HTMLTextAreaElement>) {
    setCaret(e.currentTarget.selectionStart ?? 0)
  }

  function pick(m: NodeMatch) {
    if (shortcut?.type === "hash") opts.onPickNode(m, shortcut.rest)
  }

  return { onChange, onKeyDown, onSelect, pick, hashOpen, matches, hashIndex }
}
