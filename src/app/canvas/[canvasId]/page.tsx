import { Canvas } from '@/components/canvas/Canvas'

export default async function CanvasPage({
  params,
}: {
  params: Promise<{ canvasId: string }>
}) {
  const { canvasId } = await params
  return <Canvas canvasId={canvasId} />
}
