#!/bin/zsh
# The camera for screen profiling (docs/research/59-screen-profiling.md): Terminal.app runs this, so
# macOS can ask for camera access (the agent's own shell cannot). It writes the camera's latest
# frame to research/device/captures/cam/live.jpg ten times a second until the window is closed;
# research/device/screencap.py reads it. Read-only: nothing is sent to the OP-XY.
#
#   open -a Terminal research/device/camera.command            # the iPhone (Continuity Camera)
#   CAMERA="Desk View" open -a Terminal research/device/camera.command
cd "${0:A:h}/../.." || exit 1
mkdir -p research/device/captures/cam
want="${CAMERA:-iPhone Camera}"
list=$(ffmpeg -hide_banner -f avfoundation -list_devices true -i "" 2>&1)
index=$(print -r -- "$list" | sed -n 's/.*\[\([0-9]*\)\] \(.*\)$/\1|\2/p' | grep -F -- "$want" | grep -v -F "Desk View" | head -1 | cut -d'|' -f1)
[[ "$want" == *"Desk View"* ]] && index=$(print -r -- "$list" | sed -n 's/.*\[\([0-9]*\)\] \(.*\)$/\1|\2/p' | grep -F -- "$want" | head -1 | cut -d'|' -f1)
if [[ -z "$index" ]]; then
	print -r -- "$list"
	print "no camera matching '$want' (set CAMERA=...)"
	read -r
	exit 1
fi
print "camera $index ($want) → research/device/captures/cam/live.jpg (close this window to stop)"
exec ffmpeg -hide_banner -loglevel warning -f avfoundation -framerate 30 -video_size 1920x1440 \
	-pixel_format nv12 -i "$index:none" -vf fps=10 -q:v 2 -update 1 -atomic_writing 1 -y \
	research/device/captures/cam/live.jpg
