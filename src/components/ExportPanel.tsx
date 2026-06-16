import { useState } from 'react'
import { getFFmpeg } from '../lib/ffmpeg/service'
import { serializeSrt } from '../lib/subtitles/srt'
import type { Cue } from '../lib/subtitles/types'

interface Props {
  file: File
  cues: Cue[]
  disabled: boolean
}

function downloadBlob(data: Uint8Array, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function outputName(input: string): string {
  const base = input.replace(/\.[^.]+$/, '')
  return `${base}-subbed.mp4`
}

export function ExportPanel({ file, cues, disabled }: Props) {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)

  const run = async () => {
    setBusy(true)
    setProgress(0)
    try {
      const ffmpeg = getFFmpeg()
      await ffmpeg.load()
      const srt = serializeSrt(cues)
      const name = outputName(file.name)
      const data = await ffmpeg.exportWithSoftSubs(file, srt, name, (p) =>
        setProgress(Math.min(1, Math.max(0, p))),
      )
      downloadBlob(data, name, 'video/mp4')
    } catch (err) {
      alert(`Export failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
      setProgress(0)
    }
  }

  return (
    <div className="export">
      <h3 className="export__title">Export</h3>
      <div className="export__buttons">
        <button type="button" disabled={disabled || busy} onClick={run}>
          Toggleable subs
        </button>
      </div>
      {busy && (
        <div className="export__status">
          <progress value={progress} max={1} />
          <span>Muxing soft subtitles… {Math.round(progress * 100)}%</span>
        </div>
      )}
      <p className="export__hint">
        Adds the subtitles as a soft track that players can toggle on or off. Fast — the
        video is stream-copied, not re-encoded.
      </p>
    </div>
  )
}
