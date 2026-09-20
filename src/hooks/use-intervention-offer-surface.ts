import { useStore } from "@xyflow/react"
import { useCanvasStore } from "@/stores/canvas-store"
import { useInterventionStore, type InterventionOfferState } from "@/stores/intervention-store"
import { isRectInViewport } from "@/lib/viewport"

// Approximate fallback for a node's rendered height when it hasn't been
// manually resized (CanvasNode.height is undefined = "auto-fit content") —
// same floor HumanNode.tsx uses for its own resize handle (MIN_NODE_HEIGHT_PX).
const FALLBACK_NODE_HEIGHT = 90

export interface InterventionOfferSurface {
  offer: InterventionOfferState["offer"]
  inViewport: boolean
}

// The `offer` SSE message (directness/headline) is the show signal, but by
// the time it arrives `spawn` has already made the ghost pair glow its
// anchor node via ghost-store's existing halo (GHOST-STREAMING.md's message
// order: spawn → chunk* → node_type → offer → done). So this hook's only
// job is deciding whether that halo is actually visible right now: if every
// anchor node is off-screen, InterventionOfferCard says so with a
// supplementary card; if any anchor is in view, the halo already speaks for
// itself and no extra surface is needed.
export function useInterventionOfferSurface(): InterventionOfferSurface | null {
  // At most one offer is ever in the "shown" phase at a time in practice
  // (same one-offer-at-a-time assumption use-intervention.ts makes); the
  // most recently created wins defensively if that's ever violated.
  const shownOffer = useInterventionStore((s) => {
    const shown = Object.values(s.offers).filter((o) => o.phase === "shown")
    if (shown.length === 0) return undefined
    return shown.reduce((a, b) => (b.offer.created_at > a.offer.created_at ? b : a))
  })
  const nodes = useCanvasStore((s) => s.nodes)
  const paneWidth = useStore((s) => s.width)
  const paneHeight = useStore((s) => s.height)
  const transform = useStore((s) => s.transform)

  if (!shownOffer) return null

  const anchorNodes = shownOffer.offer.anchor_node_ids
    .map((id) => nodes.find((n) => n.id === id))
    .filter((n): n is (typeof nodes)[number] => !!n)

  // No anchor node found on the live canvas (deleted, or a stale offer for a
  // node this viewer never hydrated) — nothing to show a card FOR.
  if (anchorNodes.length === 0) return null

  const inViewport = anchorNodes.some((node) =>
    isRectInViewport(
      { x: node.position.x, y: node.position.y, width: node.width, height: node.height ?? FALLBACK_NODE_HEIGHT },
      { width: paneWidth, height: paneHeight },
      { x: transform[0], y: transform[1], zoom: transform[2] },
    ),
  )

  return { offer: shownOffer.offer, inViewport }
}
