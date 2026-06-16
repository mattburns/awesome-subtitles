import { type PointerEvent, useRef } from 'react'
import type { Cue } from '../lib/subtitles/types'
import { formatClock } from '../lib/subtitles/time'

interface Props {
  duration: number
  currentTime: number
  cues: Cue[]
  selectedId?: string
  onSeek: (time: number) => void
  onSelect: (id: string) => void
  /** Adjust a cue edge (called repeatedly while dragging a handle). */
  onAdjust: (id: string, patch: { start?: number; end?: number }) => void
}

const TICK_COUNT = 10

export function Timeline({
  duration,
  currentTime,
  cues,
  selectedId,
  onSeek,
  onSelect,
  onAdjust,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: string; edge: 'start' | 'end' } | null>(null)

  const pct = (t: number) => (duration > 0 ? (t / duration) * 100 : 0)

  const timeFromClientX = (clientX: number): number => {
    const el = trackRef.current
    if (!el || duration <= 0) return 0
    const rect = el.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return ratio * duration
  }

  const seekFromPointer = (e: PointerEvent) => {
    if (duration <= 0) return
    onSeek(timeFromClientX(e.clientX))
  }

  // --- cue-edge drag handles ---
  const startDrag = (e: PointerEvent, id: string, edge: 'start' | 'end') => {
    e.stopPropagation()
    e.preventDefault()
    drag.current = { id, edge }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const moveDrag = (e: PointerEvent) => {
    if (!drag.current) return
    onAdjust(drag.current.id, { [drag.current.edge]: timeFromClientX(e.clientX) })
  }
  const endDrag = (e: PointerEvent) => {
    if (!drag.current) return
    drag.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // pointer already released
    }
  }

  return (
    <div className="timeline">
      <div className="timeline__ruler">
        {Array.from({ length: TICK_COUNT + 1 }, (_, i) => (
          <span key={i} className="timeline__tick" style={{ left: `${(i / TICK_COUNT) * 100}%` }}>
            {formatClock((i / TICK_COUNT) * duration)}
          </span>
        ))}
      </div>

      <div
        ref={trackRef}
        className="timeline__track"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          seekFromPointer(e)
        }}
        onPointerMove={(e) => {
          if (!drag.current && e.buttons === 1) seekFromPointer(e)
        }}
      >
        {cues.map((cue) => (
          <div
            key={cue.id}
            className={`timeline__cue${cue.id === selectedId ? ' timeline__cue--selected' : ''}`}
            style={{ left: `${pct(cue.start)}%`, width: `${Math.max(0.5, pct(cue.end - cue.start))}%` }}
            title={cue.text}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              onSelect(cue.id)
              onSeek(cue.start)
            }}
          >
            <span
              className="timeline__handle timeline__handle--start"
              title="Drag to set start"
              onPointerDown={(e) => startDrag(e, cue.id, 'start')}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onClick={(e) => e.stopPropagation()}
            />
            <span className="timeline__cue-text">{cue.text}</span>
            <span
              className="timeline__handle timeline__handle--end"
              title="Drag to set end"
              onPointerDown={(e) => startDrag(e, cue.id, 'end')}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        ))}

        <div className="timeline__playhead" style={{ left: `${pct(currentTime)}%` }} />
      </div>
    </div>
  )
}
