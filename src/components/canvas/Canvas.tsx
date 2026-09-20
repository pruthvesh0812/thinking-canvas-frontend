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
  type Connection,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeTypes,
  type OnConnect,
  type OnNodesChange,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { useCanvasStore, type CanvasNode } from "@/stores/canvas-store"
import { useCanvasUiStore } from "@/stores/canvas-ui-store"
import { useGhostStore, hasQuestionGhost, type GhostPairState } from "@/stores/ghost-store"
import { useSessionStore } from "@/stores/session-store"
import { useInterventionDemo } from "@/hooks/use-intervention-demo"
import { useIntervention } from "@/hooks/use-intervention"
import { useInterventionTrigger } from "@/hooks/use-intervention-trigger"
import { useCanvasPersistence } from "@/hooks/use-canvas-persistence"
import { useGhostStream } from "@/hooks/use-ghost-stream"
import { MOCK_INTERVENTION } from "@/lib/mock-intervention-scenario"
import { backdropPaneStyle, gridDotColor } from "@/lib/canvas-backdrop"
import { GHOST_WIDTH, ghostPositions, ghostPositionsFromEdge, relateAnchorSourceHandle } from "@/lib/ghost-layout"

import { BackdropSwitcher } from "./BackdropSwitcher"
import { HumanNode, type HumanFlowNode } from "./nodes/HumanNode"
import { GhostContextNode, type GhostContextFlowNode } from "../ghost/GhostContextNode"
import { GhostQuestionNode, type GhostQuestionFlowNode } from "../ghost/GhostQuestionNode"
import { LogicalEdge } from "./edges/LogicalEdge"
import { QuestionEdge } from "./edges/QuestionEdge"
import { RelateEdge } from "./edges/RelateEdge"
import { GhostEdge, type GhostEdgeData } from "./edges/GhostEdge"

import { NorthStarHeader } from "./NorthStarHeader"
import { CanvasFooter } from "./CanvasFooter"
import { PenRack } from "./PenRack"
import { OpenThreadsRail } from "./OpenThreadsRail"
import { DebounceIndicator } from "./DebounceIndicator"
import { HistoryBar } from "./HistoryBar"
import { SessionInsightsPanel } from "../session/SessionInsightsPanel"
import { SessionCompleteModal } from "../session/SessionCompleteModal"

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
  relateEdge: RelateEdge,
  ghostEdge: GhostEdge,
}

// True when an edge between these two nodes would cross the set-aside
// boundary: a set-aside node may connect only to other set-aside nodes, and a
// live node only to live nodes. Both endpoints must share the same set-aside
// state; a mismatch is disallowed (isValidConnection + onConnect).
function crossesSetAsideBoundary(sourceId: string, targetId: string): boolean {
  const nodes = useCanvasStore.getState().nodes
  const isSetAside = (id: string) => !!nodes.find((n) => n.id === id)?.data.setAsideAt
  return isSetAside(sourceId) !== isSetAside(targetId)
}

// Resolves a pair's two real endpoint nodes when it was spawned by a
// `relate` edge — undefined for a node-triggered spawn, or (shouldn't
// happen) if an anchor id doesn't resolve to a node currently on the
// canvas. Shared by the nodes and edges memos below.
function relateEndpoints(pair: GhostPairState, nodesById: Map<string, CanvasNode>): [CanvasNode, CanvasNode] | undefined {
  if (!pair.triggerEdgeId) return undefined
  const [a, b] = pair.anchorNodeIds
  if (!a || !b) return undefined
  const nodeA = nodesById.get(a)
  const nodeB = nodesById.get(b)
  return nodeA && nodeB ? [nodeA, nodeB] : undefined
}


function CanvasInner() {
  const storeNodes = useCanvasStore((s) => s.nodes)
  const storeEdges = useCanvasStore((s) => s.edges)
  const updateNodePosition = useCanvasStore((s) => s.updateNodePosition)
  const { persistEdge, requestNodeDelete, requestNodesDelete, persistNodeLayout, setAsideNode, deleteRelateLegs } =
    useCanvasPersistence()
  const activePen = useCanvasUiStore((s) => s.activePen)
  const pendingDelete = useCanvasUiStore((s) => s.pendingDelete)
  const canvasBackdrop = useCanvasUiStore((s) => s.canvasBackdrop)
  const backdropColor = useCanvasUiStore((s) => s.backdropColor)
  const showSetAside = useCanvasUiStore((s) => s.showSetAside)
  const relateLegPrompt = useCanvasUiStore((s) => s.relateLegPrompt)
  const setRelateLegPrompt = useCanvasUiStore((s) => s.setRelateLegPrompt)
  const pairs = useGhostStore((s) => s.pairs)
  const sessionId = useSessionStore((s) => s.sessionId)
  // The one SSE connection for the whole active session — opened here (once
  // sessionId is known) and held open for CanvasInner's lifetime; it is
  // never reconnected per ghost (GHOST-STREAMING.md).
  useGhostStream(sessionId)
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

  // Group delete (2+ nodes selected): a single shared confirm, not one
  // popover per selected node — HumanNode's own Backspace handling is
  // gated to fire only when it's the SOLE selected node (data.soloSelected
  // below), so this is the only path once 2+ are selected. Holds the
  // snapshotted target ids, not just a boolean, so the confirm/delete
  // acts on exactly the selection that was live when Backspace was
  // pressed even if the live selection changes before Delete is clicked.
  const [groupDeleteConfirm, setGroupDeleteConfirm] = useState<string[] | null>(null)
  useEffect(() => {
    if (isHistory) return
    if (selectedNodeIds.size < 2 && groupDeleteConfirm === null) return
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      if (selectedNodeIds.size >= 2 && (e.key === "Backspace" || e.key === "Delete")) {
        e.preventDefault()
        setGroupDeleteConfirm([...selectedNodeIds])
      } else if (e.key === "Escape") {
        setGroupDeleteConfirm(null)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [isHistory, selectedNodeIds, groupDeleteConfirm])

  const demo = useInterventionDemo()
  // The real, backend-driven presentation gate: use-intervention-trigger.ts
  // watches for settled node commits and calls POST /intervention/trigger;
  // use-intervention.ts turns the resulting waiting/offer/withdraw SSE
  // traffic (intervention-store) into the same phase/timer shape the demo
  // hook produces, but backed by real POST /intervention/process|dismiss
  // calls instead of local setTimeouts.
  const intervention = useIntervention()
  useInterventionTrigger(!isHistory)
  // The seeded demo scenario anchors to a specific node id — only offer it
  // on canvases that actually have that node (a freshly created canvas
  // starts empty, per north-star capture's resetToEmpty()).
  const hasInterventionScenario =
    !isHistory && storeNodes.some((n) => n.id === MOCK_INTERVENTION.trigger_node_id)
  // The demo (manual QA button below) and the real hook can't actually
  // collide — the demo drives ghost-store directly and never touches
  // intervention-store — but DebounceIndicator is a single shared overlay,
  // so only one phase machine can drive it at a time. The demo commandeers
  // it for as long as it's actively running; otherwise the real,
  // backend-driven gate owns it.
  const usingDemoIndicator = demo.phase !== "idle"
  const indicatorPhase = usingDemoIndicator ? demo.phase : intervention.phase
  const indicatorRemaining = usingDemoIndicator ? demo.remaining : intervention.remaining
  const indicatorPaused = usingDemoIndicator ? demo.paused : intervention.paused
  const indicatorTogglePause = usingDemoIndicator ? demo.togglePause : intervention.togglePause
  const indicatorProcessNow = usingDemoIndicator ? demo.processNow : intervention.processNow

  // Honest time-travel: the viewed session at full presence, everything
  // earlier dimmed as context, everything later absent — it didn't exist
  // yet, and showing it would misrepresent the trail (design brief).
  // Set-aside (soft-archived) AI nodes are hidden on the LIVE canvas until
  // the "show set aside" toggle is on. History deliberately ignores set-aside
  // entirely — a past session shows what stood then, with no imprint of a
  // later set-aside (the node renders normally in history).
  const visibleStoreNodes = useMemo(
    () =>
      isHistory
        ? storeNodes.filter((n) => n.data.sessionNumber <= viewedSession)
        : storeNodes.filter((n) => showSetAside || !n.data.setAsideAt),
    [storeNodes, isHistory, viewedSession, showSetAside],
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
      return {
        id: n.id,
        type: "humanNode",
        position: n.position,
        data: {
          ...n.data,
          width: n.width,
          height: n.height,
          dimmed: isHistory && n.data.sessionNumber < viewedSession,
          readOnly: isHistory,
          soloSelected: selectedNodeIds.size === 1 && selectedNodeIds.has(n.id),
          // Styling/affordance flag — a node reads as "set aside" only on the
          // live canvas (it's here at all in that case because the toggle is
          // on). In history it renders normally, so this stays false there.
          setAside: !isHistory && !!n.data.setAsideAt,
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

    const nodesById = new Map(visibleStoreNodes.map((n) => [n.id, n]))
    const ghostNodes: (GhostContextFlowNode | GhostQuestionFlowNode)[] = []
    for (const [triggerNodeId, pair] of Object.entries(pairs)) {
      // A `relate`-triggered Articulator pair hangs below the midpoint of its
      // edge's two endpoints, not next to a single trigger node. Its diamond
      // stays on the still-visible relate edge (RelateEdge) — no separate
      // anchor node — and the ghost's drop-lines (edges memo below) run from
      // BOTH endpoints straight to the ghost card.
      const endpoints = relateEndpoints(pair, nodesById)
      const pos = endpoints ? ghostPositionsFromEdge(endpoints) : ghostPositions(nodesById.get(triggerNodeId))
      ghostNodes.push({
        id: pair.descriptor.context_node.ghost_id,
        type: "ghostContext",
        position: pos.context,
        data: { triggerNodeId },
        draggable: false,
        // Not draggable, but must stay selectable — React Flow sets
        // pointer-events:none on a node wrapper unless it's selectable,
        // draggable, or a global onNode* handler is registered, which would
        // otherwise block hover/click on the ghost's own accept/reject UI.
        selectable: true,
        // Ghosts are accept/reject only, never deletable (CANVAS-RENDERING.md).
        deletable: false,
        style: { width: GHOST_WIDTH.context },
      })
      if (hasQuestionGhost(pair)) {
        ghostNodes.push({
          id: pair.descriptor.question_node!.ghost_id,
          type: "ghostQuestion",
          position: pos.question,
          data: { triggerNodeId },
          draggable: false,
          selectable: true,
          deletable: false,
          style: { width: GHOST_WIDTH.question },
        })
      }
    }

    return [...humanNodes, ...ghostNodes]
  }, [visibleStoreNodes, pairs, isHistory, viewedSession, selectedNodeIds])

  const edges = useMemo<Edge[]>(() => {
    const visibleIds = new Set(visibleStoreNodes.map((n) => n.id))
    // The relate edge (and its diamond) stays visible through the "forming"
    // window — from the draw until the articulation node actually appears with
    // content — then disappears once the first chunk lands (or the pair is
    // done). So the hide keys on the ghost having started streaming, not merely
    // on the pair existing at spawn (when only the empty frame is up). The edge
    // is only hidden here, not removed: on accept it's replaced by the two
    // legs, on reject it's removed for good (use-canvas-persistence.ts).
    const anchoredEdgeIds = isHistory
      ? new Set<string>()
      : new Set(
          Object.values(pairs)
            .filter((p) => p.triggerEdgeId && (p.contextText !== "" || p.streamed))
            .map((p) => p.triggerEdgeId as string),
        )
    // Any edge touching a set-aside node (visible only while the toggle is on)
    // reads muted too — it belongs to a note the AI is ignoring, so it
    // shouldn't sit at full strength among the live edges. Covers both an edge
    // from a live node into a set-aside one and an edge between two set-aside
    // nodes. Never in history (set-aside has no imprint there).
    const setAsideIds = new Set(visibleStoreNodes.filter((n) => n.data.setAsideAt).map((n) => n.id))
    const humanEdges: Edge[] = storeEdges
      // An edge whose other end doesn't exist yet would dangle in the past.
      .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target) && !anchoredEdgeIds.has(e.id))
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        type: e.edgeType === "question" ? "questionEdge" : e.edgeType === "relate" ? "relateEdge" : "logicalEdge",
        // Points at the target end — LogicalEdge/QuestionEdge already thread
        // markerEnd through to BaseEdge, this is what actually turns it on.
        markerEnd: { type: MarkerType.ArrowClosed, color: "#6A6154", width: 16, height: 16 },
        // Fades the whole edge group (path + arrow) via CSS while keeping it
        // clickable — see .tc-edge-muted in globals.css.
        className: !isHistory && (setAsideIds.has(e.source) || setAsideIds.has(e.target)) ? "tc-edge-muted" : undefined,
        // Hover-to-delete is a live-canvas-only affordance, same rule as
        // node delete (CANVAS-RENDERING.md).
        data: { readOnly: isHistory },
      }))

    if (isHistory) return humanEdges

    const nodesById = new Map(visibleStoreNodes.map((n) => [n.id, n]))
    const ghostEdges: Edge<GhostEdgeData>[] = []
    for (const [triggerNodeId, pair] of Object.entries(pairs)) {
      // A `relate`-triggered pair hangs from BOTH endpoints, not one — the
      // rest-state edge already runs node→diamond→node, and once a ghost
      // spawns each endpoint gets its own drop-line straight to the ghost
      // card (the midpoint anchor node stays purely decorative, marking
      // where the two lines used to converge). A node-triggered spawn keeps
      // the single line from its one trigger node.
      const endpoints = relateEndpoints(pair, nodesById)
      if (endpoints) {
        const [a, b] = endpoints
        // Same side each anchor's now-hidden relate edge left from — the
        // replacement reads as a swap, not a relayout (ghost-layout.ts).
        const originalEdge = pair.triggerEdgeId ? storeEdges.find((e) => e.id === pair.triggerEdgeId) : undefined
        ghostEdges.push(
          {
            id: `ge-${a.id}-${pair.descriptor.context_node.ghost_id}`,
            source: a.id,
            sourceHandle: relateAnchorSourceHandle(a.id, originalEdge),
            target: pair.descriptor.context_node.ghost_id,
            type: "ghostEdge",
            data: { pairKey: triggerNodeId, slot: "context" },
          },
          {
            id: `ge-${b.id}-${pair.descriptor.context_node.ghost_id}`,
            source: b.id,
            sourceHandle: relateAnchorSourceHandle(b.id, originalEdge),
            target: pair.descriptor.context_node.ghost_id,
            type: "ghostEdge",
            data: { pairKey: triggerNodeId, slot: "context" },
          },
        )
      } else {
        ghostEdges.push({
          id: `ge-${triggerNodeId}-${pair.descriptor.context_node.ghost_id}`,
          source: triggerNodeId,
          target: pair.descriptor.context_node.ghost_id,
          type: "ghostEdge",
          data: { pairKey: triggerNodeId, slot: "context" },
        })
      }
      if (hasQuestionGhost(pair)) {
        ghostEdges.push({
          id: `ge-${pair.descriptor.context_node.ghost_id}-${pair.descriptor.question_node!.ghost_id}`,
          source: pair.descriptor.context_node.ghost_id,
          target: pair.descriptor.question_node!.ghost_id,
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
      // No edge may cross the set-aside boundary: a set-aside node connects
      // only to other set-aside nodes, a live node only to live nodes. Both
      // endpoints must share the same set-aside state (same rule as
      // isValidConnection below; this is the backstop should a connect fire).
      if (crossesSetAsideBoundary(connection.source, connection.target)) return
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

  // Live validity during the drag — React Flow marks the target invalid and
  // won't fire onConnect for a connection that crosses the set-aside boundary
  // (non-set-aside ↔ set-aside). Set-aside↔set-aside and live↔live are allowed.
  const isValidConnection = useCallback((c: Connection | Edge) => {
    if (!c.source || !c.target) return false
    return !crossesSetAsideBoundary(c.source, c.target)
  }, [])

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
            onClick={demo.trigger}
            disabled={demo.phase !== "idle"}
            className="rounded-full px-[15px] py-1.5 text-xs font-semibold"
            style={{ border: "none", background: "var(--tc-ink)", color: "#F5F1E8", opacity: demo.phase === "idle" ? 1 : 0.5 }}
          >
            ▶ Run the intervention
          </button>
          <button
            type="button"
            onClick={demo.reset}
            className="rounded-full px-[13px] py-1 text-xs"
            style={{ background: "none", border: "1px solid rgba(43,38,34,.25)", color: "#6B6257" }}
          >
            Reset
          </button>
          <span className="text-[11.5px]" style={{ color: "var(--tc-chrome)" }}>
            {demo.phase === "idle" && "Plays on the node “Onboarding ends on day 7.”"}
            {demo.phase === "shimmer" && "Something was noticed — the one-shot scan shimmer."}
            {demo.phase === "waiting" && "The AI asks permission: pause it, pull it forward with “now,” or keep working."}
            {demo.phase === "generating" && "Composing — nothing appears on the canvas until you ask."}
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
          isValidConnection={isValidConnection}
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
        {/* The set-aside show/hide toggle lives in CanvasFooter (a canvas-level
            control), not floating over the pane. */}
        {!isHistory && (
          <div className="pointer-events-none absolute inset-0">
            <DebounceIndicator
              phase={indicatorPhase}
              remaining={indicatorRemaining}
              paused={indicatorPaused}
              togglePause={indicatorTogglePause}
              processNow={indicatorProcessNow}
            />
          </div>
        )}
        {!isHistory && <PenRack />}
        {!isHistory && <OpenThreadsRail />}
        <SessionInsightsPanel />

        {/* Group delete confirm (2+ nodes selected, Backspace/Delete) — one
            shared card instead of one per-node popover per selected node.
            Sits above the undo toast (z-index) for the rare case a
            previous single/group delete's undo toast is still showing
            when this opens; the two are otherwise mutually exclusive in
            time since confirming here immediately replaces this with
            that same toast. */}
        {!isHistory && groupDeleteConfirm && (
          <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center" style={{ zIndex: 31 }}>
            <div
              className="pointer-events-auto rounded-[10px] p-3.5"
              style={{
                width: 280,
                background: "var(--tc-node)",
                border: "1px solid var(--tc-node-border)",
                boxShadow: "0 8px 24px rgba(43,38,34,.18)",
              }}
            >
              <div className="mb-1 text-[13px] font-semibold" style={{ color: "var(--tc-ink)" }}>
                Delete {groupDeleteConfirm.length} nodes?
              </div>
              <div className="mb-3 text-[11.5px] leading-[1.5]" style={{ color: "var(--tc-chrome)" }}>
                You can undo for a few seconds after.
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setGroupDeleteConfirm(null)}
                  className="rounded-[7px] px-3 py-1.5 text-[12.5px] hover:bg-black/[.04]"
                  style={{
                    border: "1px solid var(--tc-hairline-strong)",
                    background: "transparent",
                    color: "#6b6257",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    requestNodesDelete(groupDeleteConfirm)
                    setGroupDeleteConfirm(null)
                  }}
                  className="rounded-[7px] px-3 py-1.5 text-[12.5px] font-semibold hover:bg-[#8f3925]"
                  style={{ border: "none", background: "#a8422e", color: "#fff", cursor: "pointer" }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Relate-leg delete prompt — a relate articulation's two legs + its
            AI note are one unit, so deleting a single leg offers the two
            coherent outcomes instead of silently half-connecting the note:
            drop both legs (note stays, unlinked) or set the whole note aside
            (reversible). Raised by requestEdgeDelete via detectRelateArticulation. */}
        {!isHistory &&
          relateLegPrompt &&
          (() => {
            // Offer "Set the note aside" only when the note isn't already set
            // aside — for an already-set-aside articulation (its legs are only
            // reachable at all with the toggle on) that option is a no-op, so
            // the prompt drops to just Drop-both-links + Cancel.
            const alreadySetAside = storeNodes.some((n) => n.id === relateLegPrompt.aiNodeId && !!n.data.setAsideAt)
            return (
              <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center" style={{ zIndex: 31 }}>
                <div
                  className="pointer-events-auto rounded-[10px] p-3.5"
                  style={{
                    width: 320,
                    background: "var(--tc-node)",
                    border: "1px solid var(--tc-node-border)",
                    boxShadow: "0 8px 24px rgba(43,38,34,.18)",
                  }}
                >
                  <div className="mb-1 text-[13px] font-semibold" style={{ color: "var(--tc-ink)" }}>
                    Remove this connection?
                  </div>
                  <div className="mb-3 text-[11.5px] leading-[1.5]" style={{ color: "var(--tc-chrome)" }}>
                    {alreadySetAside
                      ? "This AI note ties two ideas together, so it hangs from both. Drop both links and the note stays set aside, now unlinked."
                      : "This AI note ties two ideas together, so it hangs from both. Drop both links and the note stays on the canvas, now unlinked — or set the whole note aside (it leaves the canvas and the AI stops using it; you can restore it anytime)."}
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => deleteRelateLegs(relateLegPrompt.legEdgeIds)}
                      className="rounded-[7px] px-3 py-1.5 text-[12.5px] font-semibold hover:bg-[#8f3925]"
                      style={{ border: "none", background: "#a8422e", color: "#fff", cursor: "pointer" }}
                    >
                      Drop both links
                    </button>
                    {!alreadySetAside && (
                      <button
                        type="button"
                        onClick={() => {
                          setAsideNode(relateLegPrompt.aiNodeId)
                          setRelateLegPrompt(null)
                        }}
                        className="rounded-[7px] px-3 py-1.5 text-[12.5px] font-semibold hover:bg-black/80"
                        style={{ border: "none", background: "var(--tc-ink)", color: "#f5f1e8", cursor: "pointer" }}
                      >
                        Set the note aside
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setRelateLegPrompt(null)}
                      className="rounded-[7px] px-3 py-1.5 text-[12.5px] hover:bg-black/[.04]"
                      style={{ border: "1px solid var(--tc-hairline-strong)", background: "transparent", color: "#6b6257", cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )
          })()}

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
      {!isHistory && <SessionCompleteModal />}
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
