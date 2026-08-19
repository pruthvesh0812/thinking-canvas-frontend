"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Background,
  BackgroundVariant,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
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
import { backdropPaneStyle, gridDotColor } from "@/lib/canvas-backdrop"

import { BackdropSwitcher } from "./BackdropSwitcher"
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
  const { persistEdge, requestNodeDelete, persistNodeLayout } = useCanvasPersistence()
  const activePen = useCanvasUiStore((s) => s.activePen)
  const pendingDelete = useCanvasUiStore((s) => s.pendingDelete)
  const canvasBackdrop = useCanvasUiStore((s) => s.canvasBackdrop)
  const backdropColor = useCanvasUiStore((s) => s.backdropColor)
  const pairs = useGhostStore((s) => s.pairs)
  const viewedSession = useSessionStore((s) => s.viewedSession)
  const insightsMode = useSessionStore((s) => s.insightsMode)
  const isHistory = viewedSession !== null
  // History keeps its own deliberate "cooler paper" treatment regardless of
  // what's picked for the live canvas (CANVAS-RENDERING.md's past-vs-present
  // contrast is a different concern than this cosmetic preference) — so the
  // pane only gets an explicit background/pattern outside of history at all.
  const showCustomBackdrop = !isHistory
  const { fitView } = useReactFlow()
  // Nodes are a controlled prop (derived fresh from canvas-store every
  // render) — React Flow's own internal selection bookkeeping never sticks
  // unless we apply its "select" changes back in ourselves. Without this,
  // no node was ever actually `selected`, so the delete key (which only
  // acts on selected+deletable nodes) silently had nothing to delete.
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set())
  // Cmd/Ctrl held → the whole canvas enters marquee mode: node drag turns
  // off so a pointerdown that lands on a node falls through to the pane's
  // own selection-box gesture instead of starting a node drag. window
  // blur resets it because keyup never fires if the user Cmd-Tabs away
  // mid-hold.
  const [metaHeld, setMetaHeld] = useState(false)
  useEffect(() => {
    if (isHistory) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Meta" || e.key === "Control") setMetaHeld(true)
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "Meta" || e.key === "Control") setMetaHeld(false)
    }
    function onBlur() {
      setMetaHeld(false)
    }
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    window.addEventListener("blur", onBlur)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", onBlur)
    }
  }, [isHistory])

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
          height: n.height,
          onRevealPair: !isHistory && pair && !pair.revealed ? revealPair : undefined,
          dimmed: isHistory && n.data.sessionNumber < viewedSession,
          readOnly: isHistory,
        },
        // Draggable is controlled at the ReactFlow level (nodesDraggable
        // below) so Cmd/Ctrl held can disable it globally — that's how a
        // marquee drag starting on top of a node falls through to the
        // pane's selection instead of starting a node drag. Ghost nodes
        // still opt out explicitly (draggable: false is a per-node
        // override that always wins).
        // Delete is a human-only affordance (CANVAS-RENDERING.md) — an
        // accepted AI node keeps its permanent record, never deletable.
        deletable: !isHistory && n.data.owner === "human",
        selected: selectedNodeIds.has(n.id),
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
        // Ghosts are accept/reject only, never deletable (CANVAS-RENDERING.md).
        deletable: false,
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
          deletable: false,
          style: { width: GHOST_LAYOUT.question.width },
        })
      }
    }

    return [...humanNodes, ...ghostNodes]
  }, [visibleStoreNodes, pairs, revealPair, isHistory, viewedSession, selectedNodeIds])

  const edges = useMemo<Edge[]>(() => {
    const visibleIds = new Set(visibleStoreNodes.map((n) => n.id))
    const humanEdges: Edge[] = storeEdges
      // An edge whose other end doesn't exist yet would dangle in the past.
      .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        type: e.edgeType === "question" ? "questionEdge" : "logicalEdge",
        // Points at the target end — LogicalEdge/QuestionEdge already thread
        // markerEnd through to BaseEdge, this is what actually turns it on.
        markerEnd: { type: MarkerType.ArrowClosed, color: "#6A6154", width: 16, height: 16 },
        // Hover-to-delete is a live-canvas-only affordance, same rule as
        // node delete (CANVAS-RENDERING.md).
        data: { readOnly: isHistory },
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
        if (change.type === "position") {
          // Every frame updates the store for a smooth drag; the commit
          // (React Flow sends a final change with dragging=false) is the
          // one we persist — one layout write per drag, not per frame.
          if (change.position) updateNodePosition(change.id, change.position)
          if (change.dragging === false) persistNodeLayout(change.id)
        } else if (change.type === "remove") {
          // React Flow's own deleteKeyCode is disabled below — the guarded
          // confirm-then-undo flow lives in HumanNode instead. This branch
          // is now only a defensive fallback for a programmatic
          // deleteElements() call, none of which exist today.
          // requestNodeDelete no-ops for ghost/AI-owned ids on its own, but
          // the `deletable: false` set above keeps React Flow from ever
          // emitting this change for them in the first place.
          requestNodeDelete(change.id)
        } else if (change.type === "select") {
          setSelectedNodeIds((prev) => {
            const next = new Set(prev)
            if (change.selected) next.add(change.id)
            else next.delete(change.id)
            return next
          })
        }
      }
    },
    [updateNodePosition, persistNodeLayout, requestNodeDelete, isHistory],
  )

  const onConnect: OnConnect = useCallback(
    (connection) => {
      if (isHistory) return
      if (!connection.source || !connection.target) return
      // Both endpoints already exist on the canvas — this pass has no
      // "drag to empty space creates a child node" gesture yet, so
      // both_existing is always true here (CANVAS-RENDERING.md); revisit
      // once that gesture exists.
      persistEdge(
        connection.source,
        connection.target,
        activePen,
        connection.sourceHandle,
        connection.targetHandle,
      )
    },
    [persistEdge, activePen, isHistory],
  )

  return (
    <div
      className={`tc-scope flex h-screen w-full flex-col ${metaHeld && !isHistory ? "tc-marquee-mode" : ""}`}
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

      <div
        className="relative flex-1 overflow-hidden"
        style={showCustomBackdrop ? backdropPaneStyle(canvasBackdrop, backdropColor) : undefined}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onConnect={onConnect}
          nodesConnectable={!isHistory}
          elementsSelectable={!isHistory}
          // Group select (drag multiple nodes together):
          //   • plain drag on empty canvas — pans
          //   • Cmd/Ctrl + drag anywhere (including on top of a node) —
          //     draws a marquee; every node the box touches is selected
          //     (SelectionMode.Partial, so you don't have to fully
          //     enclose one).
          //   • Shift + click on a node — adds/removes just that node
          //     from the current selection.
          //   • plain drag on any one selected node — moves the whole
          //     group together (React Flow's built-in multi-drag).
          //     onNodesChange already applies a "position" change per
          //     node id and commits each via persistNodeLayout on drag
          //     end, so a group move persists exactly like a single-node
          //     move, one write per node in it.
          //
          // Implementation notes for "Cmd/Ctrl + drag":
          //   RF's own selectionKeyCode override doesn't beat panOnDrag
          //   for Meta/Control (works with Shift, not with modifier
          //   keys), so metaHeld drives the swap ourselves: while held,
          //   panOnDrag flips off and selectionOnDrag flips on. To make
          //   "even over a node" work, nodes stop absorbing pointerdown
          //   in marquee mode — nodesDraggable=false + a scoped
          //   pointer-events:none rule (globals.css .tc-marquee-mode)
          //   so the event lands on the pane; RF still selects nodes
          //   from their positions in its store, not from DOM hits.
          nodesDraggable={!isHistory && !metaHeld}
          panOnDrag={!isHistory && !metaHeld}
          selectionOnDrag={!isHistory && metaHeld}
          selectionKeyCode={null}
          multiSelectionKeyCode="Shift"
          selectionMode={SelectionMode.Partial}
          // Delete is guarded now (HumanNode's confirm popover) — React
          // Flow's own instant Backspace/Delete handling would bypass that,
          // so it's off; HumanNode listens for the key itself while selected.
          deleteKeyCode={null}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          minZoom={0.4}
          maxZoom={1.75}
          proOptions={{ hideAttribution: true }}
        >
          {showCustomBackdrop && canvasBackdrop === "grid" && (
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.6} color={gridDotColor(backdropColor)} />
          )}
        </ReactFlow>
        {!isHistory && <BackdropSwitcher />}
        {!isHistory && (
          <div className="pointer-events-none absolute inset-0">
            <DebounceIndicator phase={phase} remaining={remaining} paused={paused} togglePause={togglePause} processNow={processNow} />
          </div>
        )}
        {!isHistory && <PenRack />}
        {!isHistory && <OpenThreadsRail />}
        <SessionInsightsPanel />

        {/* Guarded-delete undo toast (Node Delete UI) — one slot; a second
            delete while this is showing just replaces the label, it never
            stacks. requestNodeDelete/undoNodeDelete own the actual timer. */}
        {!isHistory && pendingDelete && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center"
            style={{ zIndex: 30 }}
          >
            <div
              className="pointer-events-auto flex items-center gap-3.5 rounded-full px-4 py-2.5 text-[13px] shadow-lg"
              style={{ background: "var(--tc-ink)", color: "#f5f1e8" }}
            >
              <span>{pendingDelete.label} deleted</span>
              <button
                type="button"
                onClick={pendingDelete.undo}
                className="cursor-pointer border-none bg-transparent p-0 font-semibold underline decoration-1 underline-offset-2"
                style={{ color: "inherit" }}
              >
                Undo
              </button>
            </div>
          </div>
        )}
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
