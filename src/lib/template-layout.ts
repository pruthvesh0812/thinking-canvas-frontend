// Layout algorithms for the template module. Each turns a backend
// TemplateResponse into positioned ghost nodes + edges. Pure functions — no
// store, no React — so they're trivial to reason about and test. The caller
// supplies an `origin` (viewport center for a fresh query, or just below the
// expanded node for an expansion) and an optional `parentId` (the committed
// node an expansion hangs from).

import {
  isHierarchy,
  type TemplateEdgeModel,
  type TemplateNodeModel,
  type TemplateResponse,
} from "./template-types"

export interface LaidOutTemplate {
  nodes: TemplateNodeModel[]
  edges: TemplateEdgeModel[]
  /** The root (hierarchy) or title (sequence) node id — what a parent edge
   * attaches to on an expansion. */
  rootId: string
}

// Hierarchy fan geometry (templates doc): children sit on an arc BELOW the
// root. Angles are measured from straight-down and spread symmetrically.
const HIERARCHY_RADIUS = 210
const HIERARCHY_HALF_SPAN_DEG = 60

// Sequence geometry: steps flow left→right with room for the transition label
// on each connecting arrow; the title node sits above step 1.
const SEQUENCE_STEP_SPACING = 230
const SEQUENCE_TITLE_OFFSET_Y = 130

const newId = () => crypto.randomUUID()

function hierarchyLayout(
  r: Extract<TemplateResponse, { shape: "hierarchy" }>,
  origin: { x: number; y: number },
  parentId: string | null,
): LaidOutTemplate {
  const rootId = newId()
  const root: TemplateNodeModel = {
    id: rootId,
    shape: "hierarchy",
    role: "root",
    label: r.root.label,
    detail: r.root.detail,
    isGhost: true,
    isDetailOpen: false,
    position: { ...origin },
    parentId,
    childIds: [],
  }

  const n = r.children.length
  const nodes: TemplateNodeModel[] = [root]
  const edges: TemplateEdgeModel[] = []

  r.children.forEach((child, i) => {
    // Evenly spaced across [-halfSpan, +halfSpan] from vertical; single child
    // sits straight below.
    const deg = n === 1 ? 0 : -HIERARCHY_HALF_SPAN_DEG + (i * (2 * HIERARCHY_HALF_SPAN_DEG)) / (n - 1)
    const rad = (deg * Math.PI) / 180
    const childId = newId()
    nodes.push({
      id: childId,
      shape: "hierarchy",
      role: "child",
      label: child.label,
      detail: child.detail,
      kind: child.kind,
      link: child.link,
      isGhost: true,
      isDetailOpen: false,
      position: {
        x: origin.x + HIERARCHY_RADIUS * Math.sin(rad),
        y: origin.y + HIERARCHY_RADIUS * Math.cos(rad),
      },
      parentId: rootId,
      childIds: [],
    })
    root.childIds.push(childId)
    edges.push({
      id: newId(),
      sourceId: rootId,
      targetId: childId,
      sourceHandle: "b",
      targetHandle: "t",
      label: child.link,
      isDirected: false, // hierarchy edges are associative, no arrowhead
      isGhost: true,
    })
  })

  return { nodes, edges, rootId }
}

function sequenceLayout(
  r: Extract<TemplateResponse, { shape: "sequence" }>,
  origin: { x: number; y: number },
  parentId: string | null,
): LaidOutTemplate {
  // origin is where step 1 lands; the title floats above it.
  const titleId = newId()
  const title: TemplateNodeModel = {
    id: titleId,
    shape: "sequence",
    role: "title",
    label: r.title,
    detail: r.detail,
    isGhost: true,
    isDetailOpen: false,
    position: { x: origin.x, y: origin.y - SEQUENCE_TITLE_OFFSET_Y },
    parentId,
    childIds: [],
  }

  const nodes: TemplateNodeModel[] = [title]
  const edges: TemplateEdgeModel[] = []
  const stepIds: string[] = []

  r.steps.forEach((step, i) => {
    const stepId = newId()
    stepIds.push(stepId)
    nodes.push({
      id: stepId,
      shape: "sequence",
      role: "step",
      label: step.label,
      detail: step.detail,
      order: i + 1,
      transition: step.transition,
      isGhost: true,
      isDetailOpen: false,
      position: { x: origin.x + i * SEQUENCE_STEP_SPACING, y: origin.y },
      parentId: titleId,
      childIds: [],
    })
    title.childIds.push(stepId)
  })

  // Title anchors the flow into step 1 (directed, unlabelled). Title sits
  // above step 1, so it drops from the title's bottom into step 1's top.
  if (stepIds.length) {
    edges.push({
      id: newId(),
      sourceId: titleId,
      targetId: stepIds[0],
      sourceHandle: "b",
      targetHandle: "t",
      label: "",
      isDirected: true,
      isGhost: true,
    })
  }
  // step i → step i+1 (left→right), carrying step i's transition label.
  for (let i = 0; i < stepIds.length - 1; i++) {
    edges.push({
      id: newId(),
      sourceId: stepIds[i],
      targetId: stepIds[i + 1],
      sourceHandle: "r",
      targetHandle: "l",
      label: r.steps[i].transition ?? "",
      isDirected: true,
      isGhost: true,
    })
  }

  return { nodes, edges, rootId: titleId }
}

/** Lay out a response at `origin`. `parentId` is the committed node an
 * expansion hangs from (null for a fresh query). */
export function layoutTemplate(
  r: TemplateResponse,
  origin: { x: number; y: number },
  parentId: string | null = null,
): LaidOutTemplate {
  return isHierarchy(r) ? hierarchyLayout(r, origin, parentId) : sequenceLayout(r, origin, parentId)
}
