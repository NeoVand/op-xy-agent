---
id: hardware.system-menu
title: Function test and pot calibration (system menu)
aliases:
  [system menu, function test, key test, button test, pot calibration, recalibrate, potentiometer]
area: hardware
order: 65
context:
  screens: [te boot]
summary: TE boot's option 8 opens the system menu, with a function test for the keys and a reset of the volume pot calibration.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: open
    text: '`T8` in TE boot opens the system menu, which starts with the function test.'
    source: https://teenage.engineering/guides/op-xy/te-boot#function-test
  - id: red-keys
    text: In the function test, a key that still shows red after you have pressed it points to a fault; contact TE support.
    source: https://teenage.engineering/guides/op-xy/te-boot#function-test
  - id: pot-reset
    text: In the system menu, `M2` or `T2` selects reset volume pot calibration; afterwards the unit returns to TE boot.
    source: https://teenage.engineering/guides/op-xy/te-boot#reset-volume-potentiometer
  - id: pot-curve
    text: OS 1.0.9 improved the response curve of the volume pot.
    source: https://teenage.engineering/downloads/op-xy#1.0.9
procedures:
  - id: test
    goal: Run the key function test
    preconditions: [the unit is switched off]
    steps:
      - keys: com + power
        note: opens TE boot
      - keys: T8
        note: then follow the on-screen instructions
    source: https://teenage.engineering/guides/op-xy/te-boot#function-test
  - id: pot
    goal: Reset the volume pot calibration
    preconditions: [the unit is switched off]
    steps:
      - keys: com + power
      - keys: T8
      - keys: M2/T2
        note: reset volume pot calibration
    result: The calibration is reset and TE boot is shown again.
    source: https://teenage.engineering/guides/op-xy/te-boot#reset-volume-potentiometer
related: [hardware.te-boot, hardware.layout]
---

Both tools are for hardware doubts: the function test checks the keys, and the calibration reset is
for a volume control whose range seems wrong.
