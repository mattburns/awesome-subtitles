import { type RefObject } from 'react'
import type { Cue } from '../lib/subtitles/types'

interface Props {
  src: string
  videoRef: RefObject<HTMLVideoElement | null>
  activeCue?: Cue
  onLoadedMetadata: (duration: number) => void
  onTimeUpdate: (time: number) => void
}

export function VideoPlayer({
  src,
  videoRef,
  activeCue,
  onLoadedMetadata,
  onTimeUpdate,
}: Props) {
  return (
    <div className="player">
      <video
        ref={videoRef}
        src={src}
        controls
        className="player__video"
        onLoadedMetadata={(e) => onLoadedMetadata(e.currentTarget.duration)}
        onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
      />
      {activeCue?.text && (
        // Live preview of the current cue, styled like a burnt-in caption.
        <div className="player__caption">
          {activeCue.text.split('\n').map((line, i) => (
            <span key={i}>{line}</span>
          ))}
        </div>
      )}
    </div>
  )
}
