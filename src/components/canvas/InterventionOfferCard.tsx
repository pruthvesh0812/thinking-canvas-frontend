import { useState } from "react"
import { useReactFlow } from "@xyflow/react"
import { useCanvasStore } from "@/stores/canvas-store"
import { useInterventionOfferSurface } from "@/hooks/use-intervention-offer-surface"

// The supplementary off-screen surface for an `offer` message — see
// use-intervention-offer-surface.ts for why this only ever renders when the
// offer's anchor node is scrolled out of view (the on-screen case is
// already covered by the ghost pair's own halo, which appeared earlier at
// `spawn`). Purely a "come look" pointer: clicking it pans to the anchor,
// same jumpTo pattern OpenThreadsRail uses. Dismissing it is local and
// ephemeral — it does NOT call POST /intervention/dismiss (that's the
// presentation-gate's own action, for waving off a still-*waiting* offer;
// by the time `offer` has arrived, generation is essentially done).
export function InterventionOfferCard() {
  const surface = useInterventionOfferSurface()
  const nodes = useCanvasStore((s) => s.nodes)
  const setHighlightedNode = useCanvasStore((s) => s.setHighlightedNode)
  const { setCenter } = useReactFlow()
  const [dismissedOfferId, setDismissedOfferId] = useState<string | null>(null)

  if (!surface || surface.inViewport) return null
  const { offer } = surface
  if (offer.id === dismissedOfferId) return null

  function jumpToAnchor() {
    const targetId = offer.anchor_node_ids[0]
    const node = targetId ? nodes.find((n) => n.id === targetId) : undefined
    if (node) {
      setCenter(node.position.x + node.width / 2, node.position.y + 40, { zoom: 1, duration: 500 })
      setHighlightedNode(node.id)
      setTimeout(() => setHighlightedNode(null), 1800)
    }
  }

  return (
    <div
      className="pointer-events-auto absolute left-4 top-4 z-[8] flex max-w-[280px] items-start gap-2 rounded-[10px] p-3"
      style={{ background: "var(--tc-panel)", border: "1px solid var(--tc-panel-border)", boxShadow: "0 2px 10px rgba(43,38,34,.08)" }}
    >
      <span
        className="mt-[3px] inline-block h-2 w-2 flex-none rounded-full"
        title={offer.directness === "direct" ? "direct" : "subtle"}
        style={{
          background: offer.directness === "direct" ? "var(--tc-amber)" : "transparent",
          border: offer.directness === "direct" ? "none" : "1.5px solid var(--tc-amber)",
        }}
      />
      <button type="button" onClick={jumpToAnchor} className="flex-1 text-left" style={{ border: "none", background: "none" }}>
        <div className="text-[12.5px] leading-[1.4]" style={{ color: "#4A4239" }}>
          {offer.headline ?? "Something's ready off-screen"}
        </div>
        <div className="mt-1 text-[11px]" style={{ color: "var(--tc-chrome-quiet)" }}>
          scrolled out of view — click to jump to it
        </div>
      </button>
      <button
        type="button"
        onClick={() => setDismissedOfferId(offer.id)}
        className="px-1 py-0.5 text-sm"
        style={{ border: "none", background: "none", color: "var(--tc-chrome-quiet)" }}
      >
        ×
      </button>
    </div>
  )
}
