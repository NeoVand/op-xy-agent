---
id: howto.first-drum-beat
title: Recipe — program a first drum beat
aliases: [drum beat, four on the floor, program drums, first beat]
area: howto
order: 1
context:
  modes: [instrument]
summary: On drum track `T1`, place a kick on every beat, a snare on the backbeat and hi-hats in between, then turn one hi-hat step into a ratchet with the multiply step component.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: kit
    text: With `T1` selected in instrument mode, each of the 24 keys plays a different drum sound.
    source: https://teenage.engineering/guides/op-xy/get-started#4.1%20sequencing%20a%20drum%20beat
  - id: last-key
    text: The OP-XY remembers the key you pressed last, and pressing step keys places that sound.
    source: https://teenage.engineering/guides/op-xy/get-started#4.1%20sequencing%20a%20drum%20beat
  - id: sounds
    text: In the default kit the lowest F (`key F3`) is a kick, the G beside it a snare and a C# key a hi-hat.
    source: https://teenage.engineering/guides/op-xy/get-started#4.1%20sequencing%20a%20drum%20beat
  - id: one-sound
    text: Holding a drum key and tapping `record` shows only that sound's steps, so it can go on steps already used by another sound.
    source: https://teenage.engineering/guides/op-xy/get-started#4.1%20sequencing%20a%20drum%20beat
  - id: ratchet
    text: The multiply component on `natural 3` with value `accidental 3` splits a step into three quick hits; the screen confirms with “divide into 3 trigs”.
    source: https://teenage.engineering/guides/op-xy/get-started#4.1%20sequencing%20a%20drum%20beat
procedures:
  - id: kick
    goal: Put a kick on every beat
    steps:
      - keys: instrument → T1
      - keys: key F3 → step 1 → step 5 → step 9 → step 13
        note: select the kick, then place it on the four beats
      - keys: play → stop
        note: listen, then stop
    source: https://teenage.engineering/guides/op-xy/get-started#4.1%20sequencing%20a%20drum%20beat
  - id: snare
    goal: Add a backbeat snare
    steps:
      - keys: key G3 + record → + step 5 → + step 13
        note: keep the snare key held throughout; only its steps are shown
    source: https://teenage.engineering/guides/op-xy/get-started#4.1%20sequencing%20a%20drum%20beat
  - id: hats
    goal: Fill in hi-hats
    steps:
      - keys: key C#4 + record → + steps
        note: keep the key held and press every other step; TE only says “the C# key”
    source: https://teenage.engineering/guides/op-xy/get-started#4.1%20sequencing%20a%20drum%20beat
  - id: ratchet
    goal: Turn one hi-hat into a triple hit
    steps:
      - keys: shift + step 7 → + natural 3 → + accidental 3
        note: keep shift down; step 7 blinks, then multiply and its value are chosen
      - keys: play
    result: The seventh step plays three short hi-hat hits.
    source: https://teenage.engineering/guides/op-xy/get-started#4.1%20sequencing%20a%20drum%20beat
related: [sequencer.single-sound, sequencer.step-components, howto.first-bassline]
---

Choose a sound on the keyboard, then press the steps where it should play. The single-sound view
keeps kick, snare and hats out of each other's way, and one step component adds variation.
