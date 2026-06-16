import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CueEditor } from './components/CueEditor'
import { ExportPanel } from './components/ExportPanel'
import { FileDropzone } from './components/FileDropzone'
import { Timeline } from './components/Timeline'
import { VideoPlayer } from './components/VideoPlayer'
import { generateSubtitles, type PipelineStatus } from './lib/pipeline'
import {
  type Cue,
  type SubtitleTrack,
  addCueAt,
  clampTimes,
  cueAt,
  normalizeCues,
  parseSubtitles,
  uid,
} from './lib/subtitles'

export default function App() {
  const [file, setFile] = useState<File | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [tracks, setTracks] = useState<SubtitleTrack[]>([])
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null)
  const [selectedCueId, setSelectedCueId] = useState<string>()
  const [status, setStatus] = useState<PipelineStatus>({ stage: 'idle', message: '' })

  const videoRef = useRef<HTMLVideoElement>(null)
  const generatedFor = useRef<string | null>(null)

  const activeTrack = useMemo(
    () => tracks.find((t) => t.id === activeTrackId) ?? tracks[0],
    [tracks, activeTrackId],
  )
  const cues = activeTrack?.cues ?? []
  const activeCue = useMemo(() => cueAt(cues, currentTime), [cues, currentTime])

  const handleFile = useCallback(
    (next: File) => {
      if (src) URL.revokeObjectURL(src)
      setFile(next)
      setSrc(URL.createObjectURL(next))
      setTracks([])
      setActiveTrackId(null)
      setSelectedCueId(undefined)
      setDuration(0)
      setCurrentTime(0)
      setStatus({ stage: 'idle', message: '' })
    },
    [src],
  )

  // Auto-run the generation pipeline once a file is loaded.
  useEffect(() => {
    if (!file || !src) return
    if (generatedFor.current === src) return
    generatedFor.current = src

    let cancelled = false
    ;(async () => {
      try {
        const result = await generateSubtitles(file, (s) => {
          if (!cancelled) setStatus(s)
        })
        if (cancelled) return
        setTracks(result)
        setActiveTrackId(result[0]?.id ?? null)
      } catch (err) {
        if (!cancelled) {
          setStatus({
            stage: 'error',
            message: err instanceof Error ? err.message : String(err),
          })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [file, src])

  const seek = useCallback((time: number) => {
    if (videoRef.current) videoRef.current.currentTime = time
    setCurrentTime(time)
  }, [])

  const mutateActiveCues = useCallback(
    (fn: (cues: Cue[]) => Cue[]) => {
      setTracks((prev) =>
        prev.map((t) => (t.id === activeTrack?.id ? { ...t, cues: fn(t.cues) } : t)),
      )
    },
    [activeTrack?.id],
  )

  const updateCue = useCallback(
    (id: string, patch: Partial<Cue>) => {
      // Time changes are clamped so cues can't overlap; text is a plain set.
      if ('start' in patch || 'end' in patch) {
        mutateActiveCues((cs) => clampTimes(cs, id, patch, duration))
      } else {
        mutateActiveCues((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)))
      }
    },
    [mutateActiveCues, duration],
  )

  const deleteCue = useCallback(
    (id: string) => mutateActiveCues((cs) => cs.filter((c) => c.id !== id)),
    [mutateActiveCues],
  )

  const addCue = useCallback(() => {
    const { cues: next, id } = addCueAt(cues, currentTime, duration)
    mutateActiveCues(() => next)
    setSelectedCueId(id)
  }, [cues, currentTime, duration, mutateActiveCues])

  const importSubtitles = useCallback(
    async (f: File) => {
      const text = await f.text()
      const track: SubtitleTrack = {
        id: uid('track'),
        label: `Imported (${f.name})`,
        origin: 'imported',
        cues: normalizeCues(parseSubtitles(f.name, text)),
      }
      setTracks((prev) => [...prev, track])
      setActiveTrackId(track.id)
    },
    [],
  )

  const busy =
    status.stage !== 'idle' && status.stage !== 'done' && status.stage !== 'error'

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">awesome-subtitles</h1>
        <p className="app__tagline">Generate, edit &amp; burn subtitles — all in your browser.</p>
      </header>

      {!src ? (
        <FileDropzone onFile={handleFile} />
      ) : (
        <main className="app__main">
          <VideoPlayer
            src={src}
            videoRef={videoRef}
            activeCue={activeCue}
            onLoadedMetadata={setDuration}
            onTimeUpdate={setCurrentTime}
          />

          <StatusBar status={status} tracks={tracks} />

          <Timeline
            duration={duration}
            currentTime={currentTime}
            cues={cues}
            selectedId={selectedCueId}
            onSeek={seek}
            onSelect={setSelectedCueId}
            onAdjust={updateCue}
          />

          <div className="app__columns">
            <CueEditor
              cues={cues}
              currentTime={currentTime}
              selectedId={selectedCueId}
              onSeek={seek}
              onSelect={setSelectedCueId}
              onChange={updateCue}
              onDelete={deleteCue}
              onAdd={addCue}
            />

            <aside className="app__sidebar">
              <TrackPicker
                tracks={tracks}
                activeId={activeTrack?.id}
                onPick={setActiveTrackId}
                onImport={importSubtitles}
              />
              {file && (
                <ExportPanel file={file} cues={cues} disabled={busy || cues.length === 0} />
              )}
              <button
                type="button"
                className="app__reset"
                onClick={() => {
                  if (src) URL.revokeObjectURL(src)
                  setSrc(null)
                  setFile(null)
                }}
              >
                Open another video
              </button>
            </aside>
          </div>
        </main>
      )}
    </div>
  )
}

function StatusBar({ status, tracks }: { status: PipelineStatus; tracks: SubtitleTrack[] }) {
  if (status.stage === 'idle') return null
  if (status.stage === 'done' && tracks.length > 0) {
    return <div className="status status--done">{status.message}</div>
  }
  return (
    <div className={`status status--${status.stage}`}>
      <span>{status.message}</span>
      {status.progress != null && <progress value={status.progress} max={1} />}
    </div>
  )
}

function TrackPicker({
  tracks,
  activeId,
  onPick,
  onImport,
}: {
  tracks: SubtitleTrack[]
  activeId?: string
  onPick: (id: string) => void
  onImport: (file: File) => void
}) {
  return (
    <div className="tracks">
      <h3 className="tracks__title">Tracks</h3>
      {tracks.length === 0 && <p className="tracks__empty">No tracks yet.</p>}
      <ul className="tracks__list">
        {tracks.map((t) => (
          <li key={t.id}>
            <label>
              <input
                type="radio"
                name="track"
                checked={t.id === activeId}
                onChange={() => onPick(t.id)}
              />
              {t.label} · {t.cues.length} cues
            </label>
          </li>
        ))}
      </ul>
      <label className="tracks__import">
        Import .srt / .vtt
        <input
          type="file"
          accept=".srt,.vtt"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onImport(f)
          }}
        />
      </label>
    </div>
  )
}
