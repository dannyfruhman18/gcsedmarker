import React, { useEffect, useState } from 'react'

const proofCapabilitiesVideoUrl = '/proof.mp4'

export default function ProofVideoSection() {
  const [videoError, setVideoError] = useState(false)
  const [videoLoading, setVideoLoading] = useState(true)

  useEffect(() => {
    setVideoError(false)
    setVideoLoading(true)
  }, [])

  return (
    <section className="panel proof-video-panel">
      <div className="panel-header">
        <h2>Proof video</h2>
        <span className="muted">Short live-site capability clip</span>
      </div>
      {videoLoading && !videoError ? (
        <p className="muted" aria-live="polite">
          Loading proof video...
        </p>
      ) : null}
      {videoError ? (
        <p className="error" role="alert" aria-live="assertive">
          The proof video failed to load. You can still use the app without it.
        </p>
      ) : null}
      <video
        className="proof-video"
        controls
        playsInline
        preload="metadata"
        src={proofCapabilitiesVideoUrl}
        onLoadStart={() => {
          setVideoError(false)
          setVideoLoading(true)
        }}
        onLoadedData={() => setVideoLoading(false)}
        onCanPlay={() => setVideoLoading(false)}
        onError={() => {
          setVideoLoading(false)
          setVideoError(true)
        }}
      >
        Your browser does not support embedded video.
      </video>
      <p className="muted">
        {videoError
          ? 'The proof video could not be loaded from /proof.mp4.'
          : 'A short proof-of-capabilities clip is included here for the live site.'}
      </p>
    </section>
  )
}
