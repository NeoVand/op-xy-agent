---
id: sequencer.step-components
title: Step components
aliases: [components, step modifiers, step conditions, trig conditions, step effects, ratchets]
area: sequencer
order: 40
context:
  modes: [instrument, auxiliary]
summary: Per-step modifiers — repeats, ratchets, fixed velocity, pitch ramps, randomness, glides, bends, transposition, jumps and skip rules — added by holding `shift`, choosing a white key for the component and a black key for its value.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.1.3', '1.1.21', '1.1.32']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: what
    text: A step component changes how a step plays — repeating it, splitting it into rapid retriggers, bending, randomising or skipping it — while the recorded notes stay as they are.
    source: https://teenage.engineering/guides/op-xy/step-components#what-are-step-components
  - id: fourteen
    text: There are 14 components, one per white key; the icon printed on each natural names its component.
    source: https://teenage.engineering/guides/op-xy/step-components#adding-step-components-to-a-sequence
  - id: order
    text: 'From the left, the naturals are: 1 pulse, 2 pulse hold, 3 multiply, 4 velocity, 5 ramp up, 6 ramp down, 7 random, 8 portamento, 9 bend, 10 tonality, 11 jump, 12 skip parameter lock, 13 skip step component, 14 skip trigger.'
    source: https://teenage.engineering/guides/op-xy/step-components#step-components-ref-table
  - id: values
    text: The black keys then pick the component's value. Each component reads the ten digits its own way, and the screen spells out what the chosen digit does.
    source: https://teenage.engineering/guides/op-xy/step-components#adding-step-components-to-a-sequence
  - id: random-digit
    text: For ten of the 14 components, `accidental 0` (the last black key) picks a random amount, count or shape; ramp up, ramp down, random and tonality use it for their strongest setting instead.
    source: https://teenage.engineering/guides/op-xy/step-components#step-components-ref-table
  - id: dim-and-blink
    text: While `shift` is down, steps that hold notes turn dim to show they carry no component yet, and steps you select blink.
    source: https://teenage.engineering/guides/op-xy/step-components#adding-step-components-to-a-sequence
  - id: combine
    text: A single step can carry any combination of the 14 components at the same time.
    source: https://teenage.engineering/guides/op-xy/step-components#adding-step-components-to-a-sequence
  - id: remove
    text: To take a component off, select the same steps with `shift` held and press that component's white key again.
    source: https://teenage.engineering/guides/op-xy/step-components#adding-step-components-to-a-sequence
  - id: repeat-vs-multiply
    text: Pulse and pulse hold stretch time — the step repeats or holds for extra steps before the sequence moves on — whereas multiply fits several triggers inside the one step, the classic ratchet.
    source: https://teenage.engineering/guides/op-xy/step-components
  - id: duplicate-bar
    text: Duplicating a bar copies its notes together with their step components and locks.
    source: https://teenage.engineering/downloads/op-xy#1.1.3
    firmware_min: '1.1.3'
  - id: rotate
    text: Shifting a track's sequence with `Tn + [-]/[+]` carries the step components along with the notes.
    source: https://teenage.engineering/downloads/op-xy#1.1.21
    firmware_min: '1.1.21'
  - id: hold-step-fix
    text: Holding a step and changing its note no longer wipes the step's components; OS 1.1.32 fixed that.
    source: https://teenage.engineering/downloads/op-xy#1.1.32
    firmware_min: '1.1.32'
procedures:
  - id: add
    goal: Add a step component to one or more steps
    preconditions: [the track already has notes in its sequence]
    steps:
      - keys: shift + steps → + natural → + accidental
        note: keep shift down throughout — select the steps, choose the component, then its value
    result: Once `shift` is released, the chosen steps play with the component.
    source: https://teenage.engineering/guides/op-xy/step-components#adding-step-components-to-a-sequence
  - id: remove
    goal: Remove a step component
    steps:
      - keys: shift + steps → + natural
        note: select the same steps, then press the white key of the component to take off
    source: https://teenage.engineering/guides/op-xy/step-components#adding-step-components-to-a-sequence
related: [sequencer.parameter-locks, hardware.layout]
---

Step components are the OP-XY's answer to trig conditions and ratchets: small rules attached to a
step that change how it plays every time the pattern comes round. The keyboard becomes their control
surface while `shift` is held — the 14 white keys choose _which_ component, the 10 black keys choose
_how much_.

The components fall into a few families. Timing: pulse, pulse hold and multiply. Level: velocity.
Pitch: ramp up, ramp down, random, portamento, bend and tonality. Flow: jump moves the playhead to
another step. The three skip components thin things out, letting locks, components or the whole
trigger through only on some passes, which keeps long loops from sounding repetitive.

Because one step can stack several components, simple patterns grow into evolving ones quickly. The
value each digit selects is listed per component in the step-component reference.
