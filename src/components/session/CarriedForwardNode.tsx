"use client"

import type { NodeProps } from "@xyflow/react"
import type { CarriedItem } from "@/stores/session-store"

export type CarriedForwardNodeData = {
  content: string
  type: CarriedItem["type"]
  origin: CarriedItem["origin"]
}

const TYPE_LABEL: Record<CarriedItem["type"], string> = {
  question: "Unanswered question",
  contradiction: "Unanswered contradiction",
  empty_node: "Unfinished thought",
}

/**
 * A thread the last session handed over, pre-loaded into this one.
 *
 * Not a ghost — nothing here is an AI suggestion, so the ghost visual contract
 * (40-50% opacity, dashed border) deliberately does NOT apply. It is the
 * human's own loose end, marked so it reads as carried rather than fresh.
 *
 * No handles: a carried item is still a `session_learnings` row, not a `nodes`
 * row, so there is nothing to connect an edge to. It becomes a real node when
 * the human picks it up — which is canvas-core's write path, not this story's.
 */
export function CarriedForwardNode({ data }: NodeProps) {
  const { content, type, origin } = data as CarriedForwardNodeData

  return (
    <div
      className={
        origin === "resolve_now"
          ? "w-56 rounded-md border border-amber-400 border-l-4 bg-white p-3 text-sm shadow-sm dark:bg-zinc-900"
          : "w-56 rounded-md border border-zinc-300 border-l-4 border-l-zinc-400 bg-white p-3 text-sm shadow-sm dark:border-zinc-700 dark:border-l-zinc-500 dark:bg-zinc-900"
      }
    >
      <p
        className={
          origin === "resolve_now"
            ? "text-[10px] font-medium uppercase tracking-widest text-amber-600 dark:text-amber-400"
            : "text-[10px] font-medium uppercase tracking-widest text-zinc-400"
        }
      >
        {origin === "resolve_now" ? "Resolve now" : "Carried from last session"}
      </p>
      <p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-400">
        {TYPE_LABEL[type]}
      </p>
      <p className="mt-2 text-zinc-900 dark:text-zinc-100">{content}</p>
    </div>
  )
}
