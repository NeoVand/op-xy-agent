---
id: com.system-settings
title: System settings
aliases: [settings, system menu, preferences, brightness, power-off type, date and time, detune]
area: com
order: 10
context:
  screens: [system settings]
summary: 'Device-wide options behind `com → M1`, in sections: system (brightness, country, power-off), keyboard (velocity, detune), midi, clock, pitchbend calibration, battery and the MIDI monitor.'
status: outdated-in-guide
firmware:
  min: '1.0.9'
  changed_in: ['1.1.17']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: navigate
    text: In the system settings `E1` picks a section, `E2` a setting within it and `E3` (or `E4`) its value; `M1` goes back to the com page.
    source: https://teenage.engineering/guides/op-xy/com#system-settings
  - id: system
    text: The system section holds screen brightness, LED brightness, country and whether switching off happens at once or after a delay, which guards against powering down by accident mid-performance.
    source: https://teenage.engineering/guides/op-xy/com#system-settings
  - id: keyboard
    text: The keyboard section sets how the built-in keys respond to velocity and can detune them, by notes and by cents, for microtonal scales.
    source: https://teenage.engineering/guides/op-xy/com#system-settings
  - id: clock
    text: The clock section holds the date and time that the unit stamps on snapshots, autosaves and project versions.
    source: https://teenage.engineering/guides/op-xy/com#system-settings
  - id: pitchbend
    text: The pitchbend section calibrates the strip — `E2` sets the sensitivity of its left side, `E3` of its right side, and `M4` runs the calibration.
    source: https://teenage.engineering/guides/op-xy/com#system-settings
  - id: battery
    text: The battery section shows the charge level and the input current limit.
    source: https://teenage.engineering/guides/op-xy/com#system-settings
  - id: sample-preview
    text: OS 1.1.17 added a system setting for sample preview, which the guide does not list.
    source: https://teenage.engineering/downloads/op-xy#1.1.17
    firmware_min: '1.1.17'
procedures:
  - id: calibrate-pitchbend
    goal: Calibrate the pitchbend strip
    steps:
      - keys: com → M1
      - keys: turn E1
        note: pitchbend section
      - keys: turn E2/E3
        note: left and right sensitivity
      - keys: M4
        note: starts the calibration; follow the screen
    source: https://teenage.engineering/guides/op-xy/com#system-settings
related: [com.midi-settings, com.midi-monitor, howto.enable-velocity]
---

Most options here are set once: brightness, country, the date used to stamp files and how the unit
powers off. Two sections matter for playing — keyboard, where velocity is switched on and keys can
be detuned, and pitchbend, where you recalibrate the strip when bends feel lopsided. The midi and
monitor sections have units of their own.
