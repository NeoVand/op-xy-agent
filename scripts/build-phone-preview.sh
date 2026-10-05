#!/usr/bin/env bash
# Re-creates static/preview/ — what a phone shows instead of the app (PhoneNote): the README's
# screen recording (docs/images/demo.gif, 3.8 MB) as a looping H.264 MP4 a phone autoplays (~0.3 MB),
# and its first frame as the JPEG poster painted before the video plays. Re-run after the GIF
# changes. Needs ffmpeg.
set -euo pipefail
cd "$(dirname "$0")/.."
src=docs/images/demo.gif
out=static/preview
mkdir -p "$out"
# yuv420p and even sizes for every phone's decoder; faststart so it plays while it downloads
ffmpeg -v error -y -i "$src" -vf "scale=1280:-2:flags=lanczos,format=yuv420p" \
  -c:v libx264 -preset veryslow -crf 22 -tune animation -profile:v high \
  -movflags +faststart -an "$out/demo.mp4"
ffmpeg -v error -y -i "$src" -frames:v 1 -vf "scale=1280:-2:flags=lanczos" -q:v 3 "$out/demo.jpg"
ls -l "$out"
