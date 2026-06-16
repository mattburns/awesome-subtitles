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
}

const TICK_COUNT = 10

export function Timeline({
  duration,
  currentTime,
  cues,
  selectedId,
  onSeek,
  onSelect,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null)

  const pct = (t: number) => (duration > 0 ? (t / duration) * 100 : 0)

  const seekFromPointer = (e: PointerEvent) => {
    const el = trackRef.current
    if (!el || duration <= 0) return
    const rect = el.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    onSeek(ratio * duration)
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
          if (e.buttons === 1) seekFromPointer(e)
        }}
      >
        {cues.map((cue) => (
          <button
            key={cue.id}
            type="button"
            className={`timeline__cue${cue.id === selectedId ? ' timeline__cue--selected' : ''}`}
            style={{ left: `${pct(cue.start)}%`, width: `${Math.max(0.5, pct(cue.end - cue.start))}%` }}
            title={cue.text}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              onSelect(cue.id)
              onSeek(cue.start)
            }}
          >
            <span className="timeline__cue-text">{cue.text}</span>
          </button>
        ))}

        <div className="timeline__playhead" style={{ left: `${pct(currentTime)}%` }} />
      </div>
    </div>
  )
}
