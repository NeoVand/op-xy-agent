---
id: hardware.te-boot
title: TE boot (bootloader menu)
aliases: [te boot, bootloader, boot menu, recovery menu, boot mode]
area: hardware
order: 60
context:
  screens: [te boot]
summary: The bootloader menu, reached by holding `com` while switching on. `T1` installs firmware, `T7` factory-resets and `T8` opens the system menu with the key test; switching off and on leaves.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: TE boot is the OP-XY's bootloader, the program that loads and starts its firmware.
    source: https://teenage.engineering/downloads/op-xy
  - id: jobs
    text: Firmware updates, factory resets and hardware tests all run from TE boot rather than from the normal OS.
    source: https://teenage.engineering/guides/op-xy/te-boot#te-boot
  - id: enter
    text: To reach it, switch the unit off, then keep `com` held while switching it back on.
    source: https://teenage.engineering/guides/op-xy/te-boot#te-boot
  - id: menu
    text: 'The TE boot screen offers three numbered choices, each picked with the track key of its number: firmware upload (1), factory reset (7) and the system menu (8).'
    source: https://teenage.engineering/guides/op-xy/te-boot#te-boot
  - id: exit
    text: Switching the unit off and on again leaves TE boot without changing anything.
    source: https://teenage.engineering/guides/op-xy/te-boot#exiting-te-boot
procedures:
  - id: enter
    goal: Start the OP-XY in TE boot
    steps:
      - keys: power
        note: switch off
      - keys: com + power
        note: hold com while switching back on
    result: The TE boot menu lists its three options.
    source: https://teenage.engineering/guides/op-xy/te-boot#te-boot
  - id: exit
    goal: Leave TE boot
    steps:
      - keys: power → power
        note: off, then on again
    source: https://teenage.engineering/guides/op-xy/te-boot#exiting-te-boot
related: [hardware.firmware-update, hardware.factory-reset, hardware.system-menu]
---

TE boot sits underneath the normal OS, so it is reachable even when the OS itself misbehaves.
Updating (`T1`) and resetting (`T7`) have their own units, and the system menu (`T8`) is for
checking faulty keys or recalibrating the volume knob.

Nothing in TE boot happens by accident: every action needs a track key, and a power cycle leaves.
This app never switches the unit into TE boot; you do it on the device.
