import type { SessionLearning } from "@/types"

// Screen 2 of the Session Complete modal is FRONTEND-COMPUTED — the backend
// never tells us what is unresolved (SESSION-FLOWS.md → the 3-screen modal).
// This module is the whole definition, kept pure so the rules stay testable
// and reviewable in one place.

// Shaped to the raw Supabase rows (`owner`/`edge_type`/`direction_marker` are
// plain `string` columns, not enums) so the query boundary needs no cast — the
// literal comparisons below do the narrowing.
export type ThreadGraphNode = {
  id: string
  session_id: string
  owner: string
  content: string | null
  direction_marker: string | null
}

export type ThreadGraphEdge = {
  id: string
  session_id: string
  from_node_id: string
  to_node_id: string
  edge_type: string
}

// The three kinds map 1:1 onto `session_learnings.type`, which is what a
// carried thread becomes when the user picks Carry Forward.
export type UnresolvedThread = {
  id: string
  type: SessionLearning["type"]
  node_id: string
  label: string // shown on the screen-2 card
  content: string // stored verbatim as the session_learnings row's content
}

const EXCERPT_LENGTH = 120

function excerpt(text: string): string {
  const flat = text.trim().replace(/\s+/g, " ")
  return flat.length > EXCERPT_LENGTH ? `${flat.slice(0, EXCERPT_LENGTH)}…` : flat
}

function groupBy(edges: ThreadGraphEdge[], key: "from_node_id" | "to_node_id") {
  const grouped = new Map<string, ThreadGraphEdge[]>()
  for (const edge of edges) {
    const bucket = grouped.get(edge[key])
    if (bucket) bucket.push(edge)
    else grouped.set(edge[key], [edge])
  }
  return grouped
}

/**
 * Everything left hanging in `sessionId`, computed from the canvas graph.
 *
 * Adjacency is read across the WHOLE canvas (a follow-up may be an older node)
 * while the items themselves are scoped to the session being closed — a thread
 * from three sessions ago was already offered when that session closed.
 */
export function computeUnresolvedThreads(
  nodes: ThreadGraphNode[],
  edges: ThreadGraphEdge[],
  sessionId: string,
): UnresolvedThread[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const outgoing = groupBy(edges, "from_node_id")
  const incoming = groupBy(edges, "to_node_id")
  const threads = new Map<string, UnresolvedThread>()

  // 1. Question edges never answered. "Unanswered" is precisely: the edge's
  //    TARGET has no outgoing edge, i.e. nothing was ever built from it.
  for (const edge of edges) {
    if (edge.edge_type !== "question" || edge.session_id !== sessionId) continue
    if ((outgoing.get(edge.to_node_id) ?? []).length > 0) continue

    const target = nodeById.get(edge.to_node_id)
    if (!target) continue

    const text = target.content?.trim()
    threads.set(`question:${target.id}`, {
      id: `question:${target.id}`,
      type: "question",
      node_id: target.id,
      label: text ? excerpt(text) : "An unanswered question",
      content: text ?? "An unanswered question was left open on the canvas",
    })
  }

  for (const node of nodes) {
    if (node.session_id !== sessionId) continue

    // 2. Human nodes with no content — a thought that was started and dropped.
    if (node.owner === "human" && !node.content?.trim()) {
      const parent = (incoming.get(node.id) ?? [])
        .map((edge) => nodeById.get(edge.from_node_id)?.content?.trim())
        .find((content): content is string => Boolean(content))

      threads.set(`empty_node:${node.id}`, {
        id: `empty_node:${node.id}`,
        type: "empty_node",
        node_id: node.id,
        label: parent ? `Empty node after "${excerpt(parent)}"` : "An empty node",
        content: parent
          ? `Unfinished thought following: ${excerpt(parent)}`
          : "An unfinished thought was left as an empty node",
      })
      continue
    }

    // 3. Accepted contradictions with no human follow-up — the AI pushed back
    //    and the human never answered. `direction_marker` is backend-written
    //    enrichment (CORE-CONCEPTS.md → data model), so a contradiction
    //    accepted seconds ago may still be NULL here and surface at the next
    //    Session Complete instead. That lateness is acceptable; inventing a
    //    client-side contradiction heuristic is not.
    if (node.owner !== "ai" || node.direction_marker !== "contradicts") continue

    const answered = (outgoing.get(node.id) ?? []).some(
      (edge) => nodeById.get(edge.to_node_id)?.owner === "human",
    )
    if (answered) continue

    const text = node.content?.trim()
    threads.set(`contradiction:${node.id}`, {
      id: `contradiction:${node.id}`,
      type: "contradiction",
      node_id: node.id,
      label: text ? excerpt(text) : "An unanswered contradiction",
      content: text ?? "A contradiction was raised and never followed up",
    })
  }

  return [...threads.values()]
}
