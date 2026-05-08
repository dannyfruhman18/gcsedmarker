import React from 'react'

const proofCapabilitiesVideoUrl = new URL('../../proof-capabilities.mp4', import.meta.url).href

export default function ProofVideoSection() {
  return (
    <section className="panel proof-video-panel">
      <div className="panel-header">
        <h2>Proof video</h2>
        <span className="muted">Short live-site capability clip</span>
      </div>
      <video
        className="proof-video"
        controls
        playsInline
        preload="metadata"
        src={proofCapabilitiesVideoUrl}
      >
        Your browser does not support embedded video.
      </video>
      <p className="muted">
        A short proof-of-capabilities clip is included here for the live site.
      </p>
    </section>
  )
}
