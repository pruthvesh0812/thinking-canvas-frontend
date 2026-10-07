"use client"

import { useCallback, useMemo } from "react"
import {
  Background,
  BackgroundVariant,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeTypes,
  type OnNodesChange,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { logger } from "@/lib/logger"
import { expandTemplate } from "@/lib/template-api"
import { useTemplateStore } from "@/stores/template-store"
import { TemplateNode, type TemplateFlowData } from "./nodes/TemplateNode"
import { HierarchyEdge } from "./edges/HierarchyEdge"
import { SequenceEdge } from "./edges/SequenceEdge"
import { TemplateChatInput } from "./TemplateChatInput"

// Registered once at module scope — rebuilding these per render forces React
// Flow to remount every node/edge (CANVAS-RENDERING.md).
const nodeTypes: NodeTypes = { templateNode: TemplateNode }
const edgeTypes: EdgeTypes = { hierarchyEdge: HierarchyEdge, sequenceEdge: SequenceEdge }

function TemplateCanvasInner() {
  const { screenToFlowPosition } = useReactFlow()

  const storeNodes = useTemplateStore((s) => s.nodes)
  const storeEdges = useTemplateStore((s) => s.edges)
  const isLoading = useTemplateStore((s) => s.isLoading)
  const loadingNodeId = useTemplateStore((s) => s.loadingNodeId)
  const lastBatchIds = useTemplateStore((s) => s.lastBatchIds)
  const announcement = useTemplateStore((s) => s.announcement)

  const startQueryLoad = useTemplateStore((s) => s.startQueryLoad)
  const startExpandLoad = useTemplateStore((s) => s.startExpandLoad)
  const failLoad = useTemplateStore((s) => s.failLoad)
  const addTemplate = useTemplateStore((s) => s.addTemplate)
  const updateNodePosition = useTemplateStore((s) => s.updateNodePosition)
  const acceptAll = useTemplateStore((s) => s.acceptAll)
  const dismissAll = useTemplateStore((s) => s.dismissAll)

  // Flow-space center of the current viewport — where a fresh query lands.
  // Reads the live `.react-flow` pane rect at call time (an event handler,
  // never during render), so no component ref is threaded into node data.
  const viewportCenter = useCallback(() => {
    const el = typeof document !== "undefined" ? document.querySelector(".react-flow") : null
    const rect = el?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
  }, [screenToFlowPosition])

  const onExpand = useCallback(
    async (nodeId: string) => {
      const node = useTemplateStore.getState().nodes[nodeId]
      if (!node) return
      // Context: this node's own label + detail, plus its siblings' labels
      // (templates doc, Expand action / backend API contract).
      const all = useTemplateStore.getState().nodes
      const siblingLabels = node.parentId
        ? Object.values(all)
            .filter((n) => n.parentId === node.parentId && n.id !== node.id)
            .map((n) => n.label)
        : []
      startExpandLoad(nodeId)
      try {
        const res = await expandTemplate({ context: { label: node.label, detail: node.detail, siblingLabels } })
        addTemplate(res, viewportCenter(), nodeId)
      } catch (err) {
        logger.error("[template] expand failed", { nodeId, err: String(err) })
        failLoad()
      }
    },
    [addTemplate, startExpandLoad, failLoad, viewportCenter],
  )

  const onQuery = useCallback(
    async (query: string) => {
      startQueryLoad()
      try {
        const res = await expandTemplate({ query })
        addTemplate(res, viewportCenter(), null)
      } catch (err) {
        logger.error("[template] query failed", { err: String(err) })
        failLoad()
      }
    },
    [addTemplate, startQueryLoad, failLoad, viewportCenter],
  )

  const nodes = useMemo<Node<TemplateFlowData>[]>(
    () =>
      Object.values(storeNodes).map((n) => ({
        id: n.id,
        type: "templateNode",
        position: n.position,
        // Ghosts are provisional — not draggable until accepted (templates doc).
        draggable: !n.isGhost,
        data: { ...n, isExpanding: loadingNodeId === n.id, onExpand },
      })),
    [storeNodes, loadingNodeId, onExpand],
  )

  const edges = useMemo<Edge[]>(
    () =>
      storeEdges.map((e) => ({
        id: e.id,
        source: e.sourceId,
        target: e.targetId,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        type: e.isDirected ? "sequenceEdge" : "hierarchyEdge",
        markerEnd: e.isDirected
          ? { type: MarkerType.ArrowClosed, color: "#6A6154", width: 16, height: 16 }
          : undefined,
        data: { label: e.label, isGhost: e.isGhost },
      })),
    [storeEdges],
  )

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      for (const change of changes) {
        if (change.type === "position" && change.position) updateNodePosition(change.id, change.position)
      }
    },
    [updateNodePosition],
  )

  // The batch toolbar shows only while a fresh expansion is wholly un-acted-on —
  // every node in the batch still present and still a ghost (templates doc).
  const showBatch =
    lastBatchIds.length > 0 && lastBatchIds.every((id) => storeNodes[id]?.isGhost)

  const isEmpty = Object.keys(storeNodes).length === 0 && !isLoading
  const queryLoading = isLoading && loadingNodeId === null

  return (
    <div className="tc-scope flex h-screen w-full flex-col" style={{ background: "var(--tc-surface)" }}>
      {/* Lightweight header — this is a standalone test surface, deliberately
          separate from the main canvas chrome. */}
      <div
        className="flex items-center justify-between px-5 py-2.5"
        style={{ borderBottom: "1px solid var(--tc-hairline)" }}
      >
        <span className="text-[13px] font-semibold" style={{ color: "var(--tc-ink)" }}>
          Canvas Templates
          <span className="ml-2 font-normal" style={{ color: "var(--tc-chrome-quiet)" }}>
            experimental
          </span>
        </span>
        <span className="text-[11.5px]" style={{ color: "var(--tc-chrome)" }}>
          Ask below — the answer renders as a structure
        </span>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          nodesConnectable={false}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          minZoom={0.4}
          maxZoom={1.75}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.6} color="rgba(43,38,34,.08)" />
        </ReactFlow>

        {/* Batch toolbar — floating top-center while a fresh expansion is
            pending action. Accept all / Dismiss all for the whole set. */}
        {showBatch && (
          <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
            <div
              className="pointer-events-auto flex items-center gap-2 rounded-full px-3 py-1.5"
              style={{ background: "var(--tc-node)", border: "1px solid var(--tc-node-border)", boxShadow: "0 4px 14px rgba(43,38,34,.12)" }}
            >
              <span className="pl-1 text-[12px]" style={{ color: "var(--tc-chrome)" }}>
                {lastBatchIds.length} suggested
              </span>
              <button
                type="button"
                onClick={() => acceptAll(lastBatchIds)}
                className="rounded-full px-3 py-1 text-[12px] font-semibold hover:brightness-95"
                style={{ border: "none", background: "var(--tc-ink)", color: "#f5f1e8", cursor: "pointer" }}
              >
                Accept all
              </button>
              <button
                type="button"
                onClick={() => dismissAll(lastBatchIds)}
                className="rounded-full px-3 py-1 text-[12px] hover:bg-black/[.04]"
                style={{ border: "1px solid var(--tc-hairline-strong)", background: "transparent", color: "#6b6257", cursor: "pointer" }}
              >
                Dismiss all
              </button>
            </div>
          </div>
        )}

        {/* Fresh-query loading — a pulsing placeholder at viewport center. An
            expansion instead pulses the requesting node's own border. */}
        {queryLoading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className="rounded-[10px] px-4 py-3 text-[13px]"
              style={{
                border: "2px dashed var(--tc-node-border)",
                color: "var(--tc-chrome)",
                background: "var(--tc-node)",
                animation: "tc-qpulse var(--tc-motion-shimmer) ease-in-out infinite",
              }}
            >
              Thinking…
            </div>
          </div>
        )}

        {/* Empty state. */}
        {isEmpty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="text-center" style={{ color: "var(--tc-chrome-quiet)" }}>
              <div className="text-[15px]" style={{ fontFamily: "var(--font-tc-hand)" }}>
                Ask a question to begin
              </div>
              <div className="mt-1 text-[12px]">It renders as a hierarchy or a sequence you can accept onto the canvas.</div>
            </div>
          </div>
        )}

        {/* Screen-reader announcement for newly added nodes (templates doc,
            Accessibility). */}
        <div className="sr-only" role="status" aria-live="polite">
          {announcement}
        </div>

        <TemplateChatInput onSubmit={onQuery} disabled={isLoading} />
      </div>
    </div>
  )
}

export function TemplateCanvas() {
  return (
    <ReactFlowProvider>
      <TemplateCanvasInner />
    </ReactFlowProvider>
  )
}
