---
id: hardware.factory-reset
title: Factory reset
aliases: [reset to factory, factory default, wipe the unit, erase everything, restore defaults]
area: hardware
order: 64
context:
  screens: [te boot]
summary: '`T7` in TE boot erases every user setting and all user content and rebuilds the original file structure. There is no undo: copy everything you want to keep to a computer first.'
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: A factory reset wipes all user settings and user content, recreates the original folder structure and returns the unit to its factory state.
    source: https://teenage.engineering/guides/op-xy/te-boot#factory-reset
  - id: no-undo
    text: Anything not copied off the unit beforehand — projects, your own samples, saved presets — cannot be recovered after a reset.
    source: https://teenage.engineering/guides/op-xy/te-boot#factory-reset
  - id: backup
    text: TE advises backing up first and points to its project backup recipe.
    source: https://teenage.engineering/guides/op-xy/te-boot#factory-reset
  - id: how
    text: The reset starts from TE boot with `T7`; the screen then guides you through it.
    source: https://teenage.engineering/guides/op-xy/te-boot#factory-reset
procedures:
  - id: reset
    goal: Return the OP-XY to its factory state
    preconditions: [everything you want to keep is copied to a computer]
    steps:
      - keys: power
        note: switch off
      - keys: com + power
        note: hold com while switching on to reach TE boot
      - keys: T7
        note: factory reset; follow the on-screen instructions
    result: User settings and content are gone and the factory file structure is back.
    source: https://teenage.engineering/guides/op-xy/te-boot#factory-reset
related: [hardware.te-boot, howto.back-up-projects, com.mtp]
---

Treat a reset as a last resort, for instance before passing the unit on. Copy the whole drive over
MTP first: the reset also removes the samples and presets you added. This app never triggers a
reset.
