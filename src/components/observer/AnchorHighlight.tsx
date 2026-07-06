'use client'

import { useObserverStore } from '@/stores/observer-store'

// A visual halo on an existing canvas node that the Observer picked as an
// anchor. Rendered as an absolutely-positioned overlay in the Session Complete
// canvas view — hover reveals the structure attached to it.
type Props = {
  anchorId: string
  onHover(): void
  onLeave(): void
}

export function AnchorHighlight({ anchorId, onHover, onLeave }: Props) {
  const isHovered = useObserverStore((s) => s.hoveredAnchorId === anchorId)
  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className={
        'rounded-full ring-4 transition ' +
        (isHovered ? 'ring-indigo-400' : 'ring-indigo-200 dark:ring-indigo-800')
      }
    />
  )
}
