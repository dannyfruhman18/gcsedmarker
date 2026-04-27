# Video Production Lead

Status: READY

## First task
Find the fastest free/open-source way to produce a short proof video for AppBuilder.

## GitHub research findings
1. Remotion — https://github.com/remotion-dev/remotion
   - Best fit for a polished proof video.
   - Open-source, React-based, programmatic video composition.
   - Good for generating a short branded sequence, UI flow, or animated demo from code.

2. FFmpeg for browser (ffmpeg.wasm) — https://github.com/ffmpegwasm/ffmpeg.wasm
   - Best browser-based free fallback.
   - Can stitch frames, add audio, and export MP4 in-browser.
   - Useful if the team wants a fully client-side proof asset.

3. Diffusion Studio Core — https://github.com/diffusionstudio/core
   - Browser-based video compositing engine powered by WebCodecs.
   - Good for assembling a short animated showcase quickly.

4. MoneyPrinterTurbo — https://github.com/harry0703/MoneyPrinterTurbo
   - Open-source pipeline for generating short videos with AI assistance.
   - Good if the team wants an AI-assisted short-form clip.

## Recommended free path
Use Remotion first for the final proof video.
If browser-only production is required, use ffmpeg.wasm or Diffusion Studio Core to assemble the clip.

## Suggested proof clip format
- 10 to 20 seconds
- Intro title: AppBuilder
- 2 to 3 UI shots or logo animation beats
- Final callout: built by the squad
