---
id: com.midi-cc-reference
title: MIDI CC reference
aliases: [midi cc, cc list, cc chart, cc table, midi implementation, control change, remote control]
area: com
order: 70
summary: The CCs TE documents — track volume, mute and pan, tempo, groove, scenes, project and master EQ — plus what we measured on OS 1.1.33, including play, stop and track-select CCs that TE's table leaves out.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.1.0']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: premapped
    text: Most controls answer MIDI CCs out of the box; TE's reference table lists only the main ones, every one taking values 0–127.
    source: https://teenage.engineering/guides/op-xy/midi-references
  - id: per-track
    text: 'On channels 1–16, one per track: CC7 volume, CC9 mute, CC10 pan, and CC46, which TE labels only "track parameters".'
    source: https://teenage.engineering/guides/op-xy/midi-references
  - id: global
    text: 'On any channel: CC80 tempo, CC81 groove, CC82 scene (switching at a delay), CC83 previous scene, CC84 next scene, CC85 scene (switching at once) and CC86 project.'
    source: https://teenage.engineering/guides/op-xy/midi-references
  - id: eq
    text: CC90 drives the master EQ on channels 1–4.
    source: https://teenage.engineering/guides/op-xy/midi-references
  - id: eq-bands
    text: Community tests map CC90 channel 1 to the low band, 2 to mid and 3 to high; reports on channel 4 (blend) disagree.
    source: docs/research/20-midi-control.md#31-global-ccs
    confidence: community-verified
  - id: delayed-scene
    text: The delayed scene switch (CC82) was added in OS 1.1.0.
    source: https://teenage.engineering/downloads/op-xy#1.1.0
    firmware_min: '1.1.0'
  - id: tempo-scale
    text: CC80 sets the tempo to twice the value in BPM within 40–220 — 60 gives 120 BPM, values up to 20 give 40 and values from 110 give 220.
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
  - id: mute-values
    text: CC9 mutes the track at any value from 1 to 127 and unmutes it at 0; it sets a state and does not toggle.
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
  - id: play-stop
    text: Missing from TE's table but working, CC104 at 127 starts playback and CC105 at 127 stops it.
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
  - id: track-select
    text: CC102 on channel 1 selects a track counting from zero, so value 2 selects track 3.
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
  - id: no-remote-keys
    text: The remote key-press CCs (CC106/CC107) that community tools used on older firmware have no effect on OS 1.1.33.
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
  - id: channels
    text: By default channel N addresses track N — 1–8 the instrument tracks, 9–16 the auxiliary tracks from brain to FX II.
    source: docs/research/20-midi-control.md#21-the-16-tracks-and-their-default-channels
    confidence: community-verified
  - id: knobs-silent
    text: Outside controller mode, turning encoders sends no CCs, so other gear cannot read the OP-XY's knob positions.
    source: docs/research/20-midi-control.md#81-normal-operation
    confidence: community-verified
related: [com.midi-track-ccs, com.midi-settings, com.controller-mode, howto.midi-keyboard]
---

TE's table covers the mixer and song-level controls; the encoders of each track's pages follow the
pattern in the track CC unit. Most CCs change the open project, which the unit saves by itself.
Remote key presses do not work on current firmware, so screens cannot be navigated over MIDI.
