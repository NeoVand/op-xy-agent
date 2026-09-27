---
id: hardware.power-and-charging
title: Power, battery and charging
aliases: [power on, switch on, turn off, battery, charging, charge, battery life, usb power]
area: hardware
order: 10
summary: The power switch on the right side turns the unit on (up) and off (down); work is kept automatically. The battery charges over USB-C from 5 V USB power.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.0.36']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: switch
    text: The power switch sits on the right side; push it up to switch on and down to switch off.
    source: https://teenage.engineering/guides/op-xy/hardware-overview#power-on-charging
  - id: boot
    text: At start-up the screen shows the logo and the OS version, then the last selected track.
    source: https://teenage.engineering/guides/op-xy/hardware-overview#power-on-charging
  - id: nothing-lost
    text: Switching off loses nothing; the unit stores your work automatically and comes back exactly as you left it.
    source: https://teenage.engineering/guides/op-xy/hardware-overview#power-on-charging
  - id: power-off-type
    text: The system settings offer an instant or a delayed power-off; delayed guards against accidental switch-offs.
    source: https://teenage.engineering/guides/op-xy/com#system-settings
  - id: charge
    text: The battery charges over USB-C from a computer or USB charger; the level meter shows when it is full.
    source: https://teenage.engineering/guides/op-xy/hardware-overview#power-on-charging
  - id: five-volt
    text: Charge only from 5 V USB power; TE's warranty excludes damage caused by any other charging method.
    source: https://teenage.engineering/guides/op-xy
  - id: six-months
    text: Charge the battery at least every six months; a battery left unused for a long time may no longer charge.
    source: https://teenage.engineering/guides/op-xy
  - id: battery-page
    text: The battery page of the system settings shows the charge level and the input current limit.
    source: https://teenage.engineering/guides/op-xy/com#system-settings
procedures:
  - id: power-on
    goal: Switch the OP-XY on or off
    steps:
      - keys: power
        note: up is on, down is off
    source: https://teenage.engineering/guides/op-xy/hardware-overview#power-on-charging
  - id: check
    goal: Check the battery level
    steps:
      - keys: hold com
        note: read the level meter at the top right
    source: https://teenage.engineering/downloads/op-xy#1.0.36
    firmware_min: '1.0.36'
related: [hardware.specifications, hardware.safety-and-care, hardware.layout]
---

There is no need to save before switching off; the OP-XY writes your work as you go.
