import { useState } from "react"
import { draftKey, useContextStore, type FocusTarget } from "@/stores/context-store"
import { CONTEXT_SETTINGS } from "@/lib/context-settings"
import { composeNote } from "@/lib/edge-badges"
import { saveNote, shortTargetLabel } from "@/hooks/use-context-notes"

/** The draft, picked edge badge and save of one component's note box. The
 * note box under the component and the side panel both use it, so they share
 * one draft — typing in one shows in the other. */
export function useTargetNote(target: FocusTarget) {
  const key = draftKey(target)
  const text = useContextStore((s) => s.drafts[key] ?? "")
  const picked = useContextStore((s) => (target.kind === "edge" ? (s.badges[key] ?? null) : null))
  const setDraft = useContextStore((s) => s.setDraft)
  const setBadge = useContextStore((s) => s.setBadge)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  const canSave = (text.trim().length > 0 || picked !== null) && !saving
  const tooLong = text.trim().length > CONTEXT_SETTINGS.noteMaxChars

  /** Resolves true when the note was saved (any overflow stays in the box). */
  async function save(): Promise<boolean> {
    if (!canSave) return false
    setSaving(true)
    // The badge becomes the start of the note: "Because: …" or just "Because".
    const result = await saveNote(composeNote(text, picked), [{ kind: target.kind, id: target.id }], shortTargetLabel(target))
    setSaving(false)
    if (!result.ok) {
      // The draft is kept; offer a retry (§8 "Failure").
      setFailed(true)
      return false
    }
    setFailed(false)
    setDraft(key, result.remainder)
    setBadge(key, null)
    return true
  }

  return {
    text,
    setText: (t: string) => setDraft(key, t),
    picked,
    setPicked: (b: string | null) => setBadge(key, b),
    saving,
    failed,
    canSave,
    tooLong,
    save,
  }
}
