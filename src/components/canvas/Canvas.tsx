"use client"

import { useCallback, useEffect, useMemo } from "react"
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeTypes,
  type OnConnect,
  type OnNodesChange,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { useCanvasStore } from "@/stores/canvas-store"
import { useCanvasUiStore } from "@/stores/canvas-ui-store"
import { useGhostStore } from "@/stores/ghost-store"
import { useSessionStore } from "@/stores/session-store"
import { useInterventionDemo } from "@/hooks/use-intervention-demo"
import { useCanvasPersistence } from "@/hooks/use-canvas-persistence"
import { MOCK_INTERVENTION } from "@/lib/mock-intervention-scenario"

import { HumanNode, type HumanFlowNode } from "./nodes/HumanNode"
import { GhostContextNode, type GhostContextFlowNode } from "../ghost/GhostContextNode"
import { GhostQuestionNode, type GhostQuestionFlowNode } from "../ghost/GhostQuestionNode"
import { LogicalEdge } from "./edges/LogicalEdge"
import { QuestionEdge } from "./edges/QuestionEdge"
import { GhostEdge, type GhostEdgeData } from "./edges/GhostEdge"

import { NorthStarHeader } from "./NorthStarHeader"
import { CanvasFooter } from "./CanvasFooter"
import { PenRack } from "./PenRack"
import { OpenThreadsRail } from "./OpenThreadsRail"
import { DebounceIndicator } from "./DebounceIndicator"
import { HistoryBar } from "./HistoryBar"
import { SessionInsightsPanel } from "../session/SessionInsightsPanel"

// Registered once, module scope — React Flow re-renders everything if these
// are recreated per render (CANVAS-RENDERING.md).
const nodeTypes: NodeTypes = {
  humanNode: HumanNode,
  ghostContext: GhostContextNode,
  ghostQuestion: GhostQuestionNode,
}

const edgeTypes: EdgeTypes = {
  logicalEdge: LogicalEdge,
  questionEdge: QuestionEdge,
  ghostEdge: GhostEdge,
}

// Fixed floating offset for the one seeded ghost pair — matches
// ThinkingCanvas.dc.html's demo layout. Real spawns will position ghosts
// relative to their trigger node once more than one scenario exists.
const GHOST_LAYOUT = {
  context: { x: 470, y: 552, width: 280 },
  question: { x: 850, y: 615, width: 250 },
}

function CanvasInner() {
  const storeNodes = useCanvasStore((s) => s.nodes)
  const storeEdges = useCanvasStore((s) => s.edges)
  const updateNodePosition = useCanvasStore((s) => s.updateNodePosition)
  const { persistEdge } = useCanvasPersistence()
  const activePen = useCanvasUiStore((s) => s.activePen)
  const pairs = useGhostStore((s) => s.pairs)
  const viewedSession = useSessionStore((s) => s.viewedSession)
  const insightsMode = useSessionStore((s) => s.insightsMode)
  const isHistory = viewedSession !== null
  const { fitView } = useReactFlow()

  const { phase, remaining, paused, trigger, reset, togglePause, processNow, revealPair } = useInterventionDemo()
  // The seeded demo scenario anchors to a specific node id — only offer it
  // on canvases that actually have that node (a freshly created canvas
  // starts empty, per north-star capture's resetToEmpty()).
  const hasInterventionScenario =
    !isHistory && storeNodes.some((n) => n.id === MOCK_INTERVENTION.trigger_node_id)

  // Honest time-travel: the viewed session at full presence, everything
  // earlier dimmed as context, everything later absent — it didn't exist
  // yet, and showing it would misrepresent the trail (design brief).
  const visibleStoreNodes = useMemo(
    () => (isHistory ? storeNodes.filter((n) => n.data.sessionNumber <= viewedSession) : storeNodes),
    [storeNodes, isHistory, viewedSession],
  )

  // Selecting a past session shows the whole canvas as it stood then — so
  // frame what survived, reserving the docked panel's width on the right so
  // no node ends up hidden behind it.
  useEffect(() => {
    if (!isHistory || insightsMode === "full") return
    const timer = setTimeout(
      () => void fitView({ padding: { top: "12%", bottom: "12%", left: "8%", right: "420px" }, duration: 450 }),
      60,
    )
    return () => clearTimeout(timer)
  }, [isHistory, viewedSession, insightsMode, fitView])

  const nodes = useMemo<Node[]>(() => {
    const humanNodes: HumanFlowNode[] = visibleStoreNodes.map((n) => {
      const pair = pairs[n.id]
      return {
        id: n.id,
        type: "humanNode",
        position: n.position,
        data: {
          ...n.data,
          width: n.width,
          onRevealPair: !isHistory && pair && !pair.revealed ? revealPair : undefined,
          dimmed: isHistory && n.data.sessionNumber < viewedSession,
          readOnly: isHistory,
        },
        draggable: !isHistory,
      }
    })

    // No ghost interaction in the past — the historical view carries none of
    // the live canvas's affordances.
    if (isHistory) return humanNodes

    const ghostNodes: (GhostContextFlowNode | GhostQuestionFlowNode)[] = []
    for (const [triggerNodeId, pair] of Object.entries(pairs)) {
      ghostNodes.push({
        id: pair.descriptor.context_node.ghost_id,
        type: "ghostContext",
        position: { x: GHOST_LAYOUT.context.x, y: GHOST_LAYOUT.context.y },
        data: { triggerNodeId },
        draggable: false,
        // Not draggable, but must stay selectable — React Flow sets
        // pointer-events:none on a node wrapper unless it's selectable,
        // draggable, or a global onNode* handler is registered, which would
        // otherwise block hover/click on the ghost's own accept/reject UI.
        selectable: true,
        style: { width: GHOST_LAYOUT.context.width },
      })
      if (pair.question) {
        ghostNodes.push({
          id: pair.question.ghostId,
          type: "ghostQuestion",
          position: { x: GHOST_LAYOUT.question.x, y: GHOST_LAYOUT.question.y },
          data: { triggerNodeId },
          draggable: false,
          selectable: true,
          style: { width: GHOST_LAYOUT.question.width },
        })
      }
    }

    return [...humanNodes, ...ghostNodes]
  }, [visibleStoreNodes, pairs, revealPair, isHistory, viewedSession])

  const edges = useMemo<Edge[]>(() => {
    const visibleIds = new Set(visibleStoreNodes.map((n) => n.id))
    const humanEdges: Edge[] = storeEdges
      // An edge whose other end doesn't exist yet would dangle in the past.
      .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: e.edgeType === "question" ? "questionEdge" : "logicalEdge",
      }))

    if (isHistory) return humanEdges

    const ghostEdges: Edge<GhostEdgeData>[] = []
    for (const [triggerNodeId, pair] of Object.entries(pairs)) {
      ghostEdges.push({
        id: `ge-${triggerNodeId}-${pair.descriptor.context_node.ghost_id}`,
        source: triggerNodeId,
        target: pair.descriptor.context_node.ghost_id,
        type: "ghostEdge",
        data: { pairKey: triggerNodeId, slot: "context" },
      })
      if (pair.question) {
        ghostEdges.push({
          id: `ge-${pair.descriptor.context_node.ghost_id}-${pair.question.ghostId}`,
          source: pair.descriptor.context_node.ghost_id,
          target: pair.question.ghostId,
          type: "ghostEdge",
          data: { pairKey: triggerNodeId, slot: "question" },
        })
      }
    }

    return [...humanEdges, ...ghostEdges]
  }, [storeEdges, pairs, visibleStoreNodes, isHistory])

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      if (isHistory) return
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          updateNodePosition(change.id, change.position)
        }
      }
    },
    [updateNodePosition, isHistory],
  )

  const onConnect: OnConnect = useCallback(
    (connection) => {
      if (isHistory) return
      // Both endpoints already exist on the canvas — this pass has no
      // "drag to empty space creates a child node" gesture yet, so
      // both_existing is always true here (CANVAS-RENDERING.md); revisit
      // once that gesture exists.
      persistEdge(connection.source, connection.target, activePen)
    },
    [persistEdge, activePen, isHistory],
  )

  return (
    <div
      className="tc-scope flex h-screen w-full flex-col"
      style={{
        // The past sits on a slightly cooler paper than the live canvas —
        // felt, not announced.
        background: isHistory ? "var(--tc-surface-quiet)" : "var(--tc-surface)",
        transition: "background-color .4s ease",
      }}
    >
      <HistoryBar />
      <NorthStarHeader />

      {hasInterventionScenario && (
        <div className="flex items-center gap-2.5 px-5 py-2" style={{ borderBottom: "1px solid var(--tc-hairline)" }}>
          <button
            type="button"
            onClick={trigger}
            disabled={phase !== "idle"}
            className="rounded-full px-[15px] py-1.5 text-xs font-semibold"
            style={{ border: "none", background: "var(--tc-ink)", color: "#F5F1E8", opacity: phase === "idle" ? 1 : 0.5 }}
          >
            ▶ Run the intervention
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-full px-[13px] py-1 text-xs"
            style={{ background: "none", border: "1px solid rgba(43,38,34,.25)", color: "#6B6257" }}
          >
            Reset
          </button>
          <span className="text-[11.5px]" style={{ color: "var(--tc-chrome)" }}>
            {phase === "idle" && "Plays on the node “Onboarding ends on day 7.”"}
            {phase === "shimmer" && "Something was noticed — the one-shot scan shimmer."}
            {phase === "waiting" && "The AI asks permission: pause it, pull it forward with “now,” or keep working."}
            {phase === "generating" && "Composing — nothing appears on the canvas until you ask."}
          </span>
        </div>
      )}

      <div className="relative flex-1 overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onConnect={onConnect}
          nodesConnectable={!isHistory}
          elementsSelectable={!isHistory}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          minZoom={0.4}
          maxZoom={1.75}
          proOptions={{ hideAttribution: true }}
        />
        {!isHistory && (
          <div className="pointer-events-none absolute inset-0">
            <DebounceIndicator phase={phase} remaining={remaining} paused={paused} togglePause={togglePause} processNow={processNow} />
          </div>
        )}
        {!isHistory && <PenRack />}
        {!isHistory && <OpenThreadsRail />}
        <SessionInsightsPanel />
      </div>

      {!isHistory && <CanvasFooter />}
    </div>
  )
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  )
}
