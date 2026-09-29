---
id: basics.firmware-versions
title: Firmware versions and this manual
aliases: [os version, firmware version, which version, changelog, updates, guide version, errata]
area: basics
order: 90
summary: TE's guide describes OS 1.1.15, while this manual targets OS 1.1.33; facts that changed later carry the release that changed them. How to see which OS your unit runs.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.1.33']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: guide
    text: TE's online guide is labelled v1.1.15 and describes OS 1.1.15.
    source: https://teenage.engineering/guides/op-xy
  - id: latest
    text: The newest release is OS 1.1.33 (2 September 2026); the releases after the guide are 1.1.17, 1.1.18, 1.1.21, 1.1.25, 1.1.32 and 1.1.33.
    source: https://teenage.engineering/downloads/op-xy#1.1.33
    firmware_min: '1.1.33'
  - id: owner
    text: This manual was checked on a unit running OS 1.1.33, hardware revision 2.
    source: docs/research/90-device-probe.md#2026-09-26--te-sysex-protocol-read-only-te_sysex_probepy
    verified_on: '1.1.33'
  - id: boot-screen
    text: The installed OS version appears on screen, with the logo, every time the unit starts.
    source: https://teenage.engineering/guides/op-xy/hardware-overview#power-on-charging
  - id: over-midi
    text: Over USB MIDI the unit reports its OS version when asked with TE's own SysEx greeting; the standard MIDI identity request leaves the version blank.
    source: docs/research/90-device-probe.md#2026-09-26--te-sysex-protocol-read-only-te_sysex_probepy
    verified_on: '1.1.33'
related: [hardware.firmware-update, hardware.te-boot]
---

OS 1.1.17 to 1.1.33 added features and fixes that TE's guide does not mention yet. When an answer
depends on the version, check the boot screen first; this manual assumes 1.1.33.
