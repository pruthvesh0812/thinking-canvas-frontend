// One-tap reasons offered on an edge's note box. A picked badge becomes the
// start of the saved note ("Because: …", or just "Because" when no text is
// added) — notes have no separate tag column in the contract, so the badge is
// plain text on purpose. The first three are the pm_handoff.md PM-8 wording.
export const EDGE_BADGES = ["Leads to", "Depends on", "Contradicts", "Because", "Example of"] as const

/** The note text a badge + free text save as. */
export function composeNote(text: string, badge: string | null): string {
  const body = text.trim()
  if (!badge) return body
  return body ? `${badge}: ${body}` : badge
}
