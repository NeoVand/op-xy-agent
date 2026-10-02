---
id: hardware.firmware-update
title: Updating the OS
aliases: [firmware update, os update, update firmware, midi updater, update utility]
area: hardware
order: 62
context:
  screens: [te boot]
summary: TE offers two ways to install a new OS — its web updater over USB, or copying the firmware file onto the unit while it sits in TE boot. Back up first and never install 1.0.29.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.0.32']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: see-version
    text: The screen shows the installed OS version while the unit starts up.
    source: https://teenage.engineering/guides/op-xy/hardware-overview#power-on-charging
  - id: downloads
    text: TE's OP-XY downloads page (teenage.engineering/downloads/op-xy) lists every release with its notes and, except for the withdrawn 1.0.29, a firmware file; the newest is OS 1.1.33, the version this manual describes.
    source: https://teenage.engineering/downloads/op-xy
  - id: web-updater
    text: The easy route is TE's MIDI updater, a web page on that downloads page that updates the connected unit straight from the browser.
    source: https://teenage.engineering/downloads/op-xy
  - id: disk-route
    text: The manual route goes through TE boot, where `T1` makes the OP-XY show up on a computer as a removable disk.
    source: https://teenage.engineering/guides/op-xy/te-boot#firmware-update
  - id: copy-eject
    text: Copy the firmware file onto that disk and eject it; the update then runs by itself — let it finish and follow the screen.
    source: https://teenage.engineering/guides/op-xy/te-boot#firmware-update
  - id: avoid-1029
    text: Never install OS 1.0.29, which TE withdrew because it could corrupt files over 64 KB copied off the unit over MTP.
    source: https://teenage.engineering/downloads/op-xy#1.0.32
    firmware_min: '1.0.32'
  - id: backup
    text: Copy your projects, samples and presets to a computer before updating.
    source: https://teenage.engineering/guides/op-xy/how-to#how-to-back-up-your-projects
    confidence: derived
procedures:
  - id: disk-update
    goal: Install an OS file through TE boot
    preconditions:
      [the firmware file from TE's downloads page is on the computer, your work is backed up]
    steps:
      - keys: power
        note: switch off
      - keys: com + power
        note: hold com while switching on — TE boot appears
      - keys: T1
        note: connect the USB-C cable; the unit mounts as a disk
    result: Copy the file, eject the disk, and the update runs.
    source: https://teenage.engineering/guides/op-xy/te-boot#firmware-update
related: [hardware.te-boot, basics.firmware-versions, howto.back-up-projects]
---

Updating is always your action, done with TE's tools; this app shows which OS the unit runs but
never installs firmware or starts TE boot. Features tagged "since 1.1.x" in this manual need that
version or newer.
