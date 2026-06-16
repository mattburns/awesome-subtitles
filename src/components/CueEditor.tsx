import type { Cue } from '../lib/subtitles/types'
import { formatTimestamp, parseTimestamp } from '../lib/subtitles/time'

interface Props {
  cues: Cue[]
  currentTime: number
  selectedId?: string
  onSeek: (time: number) => void
  onSelect: (id: string) => void
  onChange: (id: string, patch: Partial<Cue>) => void
  onDelete: (id: string) => void
  onAdd: () => void
}

export function CueEditor({
  cues,
  currentTime,
  selectedId,
  onSeek,
  onSelect,
  onChange,
  onDelete,
  onAdd,
}: Props) {
  const updateTime = (id: string, field: 'start' | 'end', raw: string) => {
    try {
      onChange(id, { [field]: parseTimestamp(raw) })
    } catch {
      // Ignore partial/invalid input; the field keeps the last valid value.
    }
  }

  return (
    <div className="editor">
      <div className="editor__toolbar">
        <span className="editor__count">{cues.length} cues</span>
        <button type="button" onClick={onAdd}>
          + Add cue at playhead
        </button>
      </div>

      <ol className="editor__list">
        {cues.map((cue) => {
          const active = currentTime >= cue.start && currentTime < cue.end
          const selected = cue.id === selectedId
          return (
            <li
              key={cue.id}
              className={`cue${active ? ' cue--active' : ''}${selected ? ' cue--selected' : ''}`}
              onClick={() => onSelect(cue.id)}
            >
              <div className="cue__times">
                <input
                  className="cue__time"
                  defaultValue={formatTimestamp(cue.start, false)}
                  onBlur={(e) => updateTime(cue.id, 'start', e.target.value)}
                />
                <button type="button" className="cue__seek" onClick={() => onSeek(cue.start)}>
                  ▶
                </button>
                <input
                  className="cue__time"
                  defaultValue={formatTimestamp(cue.end, false)}
                  onBlur={(e) => updateTime(cue.id, 'end', e.target.value)}
                />
              </div>
              <textarea
                className="cue__text"
                value={cue.text}
                rows={2}
                onChange={(e) => onChange(cue.id, { text: e.target.value })}
              />
              <button type="button" className="cue__delete" onClick={() => onDelete(cue.id)}>
                ✕
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
