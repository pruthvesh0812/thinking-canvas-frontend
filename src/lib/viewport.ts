export interface PaneSize {
  width: number
  height: number
}

export interface FlowTransform {
  x: number
  y: number
  zoom: number
}

export interface FlowRect {
  x: number
  y: number
  width: number
  height: number
}

// Whether a node's flow-space rect overlaps the pane's own screen-space
// rect at all, after applying the pane's current pan/zoom transform
// (React Flow's `transform` store field: [x, y, zoom], the CSS
// translate+scale applied to the pane's contents). Partially visible counts
// as visible; only a rect entirely scrolled or zoomed away is "off-screen".
// Used to decide whether an intervention offer's anchor node is already
// showing its own halo on the live canvas, or needs a supplementary
// off-screen surface (InterventionOfferCard).
export function isRectInViewport(rect: FlowRect, pane: PaneSize, transform: FlowTransform): boolean {
  const screenLeft = rect.x * transform.zoom + transform.x
  const screenTop = rect.y * transform.zoom + transform.y
  const screenRight = screenLeft + rect.width * transform.zoom
  const screenBottom = screenTop + rect.height * transform.zoom
  return screenRight > 0 && screenLeft < pane.width && screenBottom > 0 && screenTop < pane.height
}
