"use client"

import { useEffect } from "react"
import { useNodes, useViewport } from "@xyflow/react"
import { useCanvasStore } from "@/stores/canvas-store"
import { useContextStore } from "@/stores/context-store"
import { computeRoomOffsets } from "@/lib/make-room"
import { edgeCardOffset, handleAnchor } from "@/components/canvas/edges/bend-path"

// A node's note box is attached to its bottom edge (no gap, no pointer); an
// edge's card hangs off a pointer.
const GAP_BELOW_NODE = 0
const EDGE_POINTER = 7
const ROOM_GAP_PX = 12

// Renders nothing — computes which components the open composer would cover
// and publishes display-only offsets (context-store.roomOffsets) that
// Canvas.tsx adds to those nodes' rendered positions. Base positions come
// from canvas-store (never the displaced ones React Flow is showing), so the
// result can't feed back into itself. Sizes come from React Flow's
// measurements. The focused component and an edge's two endpoints never move.
export function MakeRoom({ disabled }: { disabled: boolean }) {
  const composer = useContextStore((s) => s.composer)
  const size = useContextStore((s) => s.composerSize)
  const setRoomOffsets = useContextStore((s) => s.setRoomOffsets)
  const storeNodes = useCanvasStore((s) => s.nodes)
  const storeEdges = useCanvasStore((s) => s.edges)
  const rfNodes = useNodes()
  const { zoom } = useViewport()

  useEffect(() => {
    const current = useContextStore.getState().roomOffsets
    const publish = (next: Record<string, number>) => {
      const a = Object.keys(current)
      const b = Object.keys(next)
      if (a.length === b.length && b.every((k) => Math.abs((current[k] ?? 0) - next[k]) < 0.5)) return
      setRoomOffsets(next)
    }
    if (disabled || !composer || !size) return publish({})

    const measured = new Map(rfNodes.map((n) => [n.id, n.measured]))
    const rectOf = (id: string) => {
      const n = storeNodes.find((x) => x.id === id)
      const m = measured.get(id)
      if (!n || !m?.width || !m.height) return null
      return { id, x: n.position.x, y: n.position.y, width: m.width, height: m.height }
    }

    let anchor: { x: number; y: number } | null = null
    const fixed = new Set<string>()
    if (composer.target.kind === "node") {
      const r = rectOf(composer.target.id)
      if (r) anchor = { x: r.x + r.width / 2, y: r.y + r.height + GAP_BELOW_NODE }
      fixed.add(composer.target.id)
    } else {
      const edge = storeEdges.find((e) => e.id === composer.target.id)
      const a = edge && rectOf(edge.source)
      const b = edge && rectOf(edge.target)
      if (edge && a && b) {
        const from = handleAnchor(a, edge.sourceHandle)
        const to = handleAnchor(b, edge.targetHandle)
        const gap = edgeCardOffset(from, to)
        anchor = edge.bend
          ? { x: edge.bend.x, y: edge.bend.y + gap }
          : { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 + gap }
        fixed.add(edge.source)
        fixed.add(edge.target)
      }
    }
    if (!anchor) return publish({})

    const width = size.width / zoom
    const blocker = { x: anchor.x - width / 2, y: anchor.y, width, height: (size.height + (composer.target.kind === "edge" ? EDGE_POINTER : 0)) / zoom }
    const candidates = storeNodes
      .filter((n) => !fixed.has(n.id))
      .map((n) => rectOf(n.id))
      .filter((r): r is NonNullable<typeof r> => r !== null)
    publish(computeRoomOffsets(blocker, candidates, ROOM_GAP_PX / zoom))
  }, [disabled, composer, size, storeNodes, storeEdges, rfNodes, zoom, setRoomOffsets])

  return null
}
