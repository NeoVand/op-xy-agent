---
id: com.midi-settings
title: MIDI settings
aliases:
  [
    midi setup,
    midi clock settings,
    clock in,
    clock out,
    midi echo,
    midi thru,
    active track channel,
    transport sync
  ]
area: com
order: 20
context:
  screens: [com, system settings]
summary: The midi section of the system settings sets, separately for clock, notes and everything else, whether the OP-XY listens, transmits or does both; it also picks the channel that always plays the selected track and switches echo on or off.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.0.15', '1.0.29', '1.1.15']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: location
    text: The MIDI options are one section of the system settings, reached with `com → M1`.
    source: https://teenage.engineering/guides/op-xy/com#system-settings
  - id: five-settings
    text: 'The section has five settings: clock, notes, other (every remaining message type), active track channel and midi echo.'
    source: https://teenage.engineering/guides/op-xy/com#system-settings
  - id: active-track
    text: Notes arriving on the active track channel play whichever track is currently selected.
    source: https://teenage.engineering/guides/op-xy/com#system-settings
  - id: stock-values
    text: 'On a unit with stock settings (OS 1.1.33) the section reads: clock in, notes both, other both, active track channel 1, midi echo off.'
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
  - id: directions
    text: Clock, notes and other each take a direction; in (receive only) and both (receive and send) are confirmed on OS 1.1.33.
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
  - id: more-directions
    text: Community tools also describe out (send only) and off for these three settings.
    source: docs/research/20-midi-control.md#91-settings-that-gate-midi
    confidence: community
  - id: clock-in-silent
    text: With clock set to in, pressing `play` or `stop` sends nothing — no start, no stop, no clock ticks.
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
  - id: clock-both-transport
    text: With clock set to both, every press of `play` sends a MIDI start (FA) — a press during playback sends another start — and `stop` sends a MIDI stop (FC). No continue (FB) or song position (F2) messages were seen.
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
  - id: clock-both-ticks
    text: With clock set to both, clock ticks (F8, 24 per quarter note) stream all the time, even while stopped.
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
  - id: transport-in
    text: With clock set to both, a start (FA) or stop (FC) from a computer starts or stops playback, and the unit sends the message back out.
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
  - id: follow-apps
    text: Software that follows the OP-XY's play state and tempo over USB, this app included, needs clock set to both.
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    confidence: derived
  - id: sysex-returns
    text: Even with midi echo off, a universal identity request (SysEx) sent to the unit came back on its output; what forwards it is not known yet.
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
  - id: echo-linked
    text: OS 1.0.15 fixed the echo setting being ignored for notes from linked tracks.
    source: https://teenage.engineering/downloads/op-xy#1.0.15
    firmware_min: '1.0.15'
  - id: transport-relay
    text: Start and stop received from one device are passed on to the other connected MIDI devices.
    source: https://teenage.engineering/downloads/op-xy#1.0.28
    firmware_min: '1.0.29'
  - id: monitor
    text: A monitor page in the same settings lists whatever MIDI arrives — channel, value, clock and SysEx — which tells a message that never arrived from one that arrived but was ignored.
    source: https://teenage.engineering/guides/op-xy/com#midi-monitor
    firmware_min: '1.1.15'
  - id: per-device
    text: Switches for what is sent to and received from each connected device live separately, under `com → M3` (devices).
    source: https://teenage.engineering/guides/op-xy/com#devices
procedures:
  - id: open
    goal: Open the MIDI settings
    steps:
      - keys: com → M1
        note: system settings
      - keys: turn E1
        note: choose the midi section
    source: https://teenage.engineering/guides/op-xy/com#system-settings
  - id: change
    goal: Change one MIDI setting
    preconditions: [the midi section is open]
    steps:
      - keys: turn E2
        note: pick the setting
      - keys: turn E3
        note: set its value (`turn E4` works too)
    source: https://teenage.engineering/guides/op-xy/com#system-settings
  - id: send-clock
    goal: Make the OP-XY send transport and clock over MIDI
    steps:
      - keys: com → M1
      - keys: turn E1
        note: midi section
      - keys: turn E2
        note: clock
      - keys: turn E3
        note: both
    result: '`play` and `stop` now send start and stop, and clock ticks run continuously.'
    source: docs/research/90-device-probe.md#2026-09-26--session-1-results-owner-present-scratch-project-os-1133
    verified_on: '1.1.33'
  - id: leave
    goal: Leave the system settings
    steps:
      - keys: M1
    result: Back on the com page.
    source: https://teenage.engineering/guides/op-xy/com#system-settings
parameters:
  - screen: system settings
    encoder: E1
    layer: base
    name: section
    note: system, keyboard, midi, clock, pitchbend, battery, monitor
    source: https://teenage.engineering/guides/op-xy/com#system-settings
  - screen: system settings
    encoder: E2
    layer: base
    name: setting
    note: the setting within the section
    source: https://teenage.engineering/guides/op-xy/com#system-settings
  - screen: system settings
    encoder: E3
    layer: base
    name: value
    source: https://teenage.engineering/guides/op-xy/com#system-settings
  - screen: system settings
    encoder: E4
    layer: base
    name: value
    note: same as E3
    source: https://teenage.engineering/guides/op-xy/com#system-settings
related: [com.midi-monitor, com.devices, com.midi-cc-reference, hardware.layout]
---

The midi section is where the OP-XY decides how it talks to other gear. Clock, notes and "other"
(every remaining message type, such as control changes) each get a direction, so the unit can, say,
take notes from a keyboard while ignoring its clock. The active track channel is a shortcut for playing
the OP-XY from a controller: whatever arrives on that channel plays the track you have selected.

Out of the box the unit only listens for clock (clock in), so it sends no start, stop or clock of
its own. Switching clock to both makes it a sync source: `play` and `stop` send start and stop, and
the tick stream runs continuously. This app suggests clock both during setup so it can follow the
unit's transport and tempo.

When a connection misbehaves, open the monitor page first: it shows whether a message reached the
OP-XY at all. Per-device switches live separately in `com → M3`.
