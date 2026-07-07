import { CanvasShell } from './canvas-shell'

export default async function CanvasPage({
  params,
}: {
  params: Promise<{ canvasId: string }>
}) {
  const { canvasId } = await params
  return <CanvasShell canvasId={canvasId} />
}
