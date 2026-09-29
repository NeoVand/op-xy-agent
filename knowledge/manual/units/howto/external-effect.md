---
id: howto.external-effect
title: Recipe — loop an external effect pedal
aliases: [external effects, effects pedal, send return, fx loop, aux send]
area: howto
order: 24
context:
  modes: [auxiliary]
summary: Send audio out of the multi-out (set to audio) into the effect, bring the effect back into the audio input, and use the external audio track (`T5` in auxiliary mode) to pick the tracks that go out and balance the return.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: cables
    text: With the multi-out set to audio, one cable runs from it to the effect's input (adapt 3.5 mm to 6.35 mm for pedals) and a second from the effect's output to the OP-XY's audio input.
    source: https://teenage.engineering/guides/op-xy/how-to#send-audio-to-and-from-an-external-effect
  - id: input
    text: On the external audio track's `M1` page, `turn E1` to the audio input (the jack icon) and `click E1` to switch it on.
    source: https://teenage.engineering/guides/op-xy/how-to#send-audio-to-and-from-an-external-effect
  - id: routing
    text: The external audio track's `M2` page sends instrument tracks to the aux output — turn an encoder per track, click to swap between tracks 1–4 and 5–8.
    source: https://teenage.engineering/guides/op-xy/how-to#send-audio-to-and-from-an-external-effect
  - id: track-send
    text: A single track can also be sent from instrument mode with its aux send, `shift + turn E1` on its `M3` page.
    source: https://teenage.engineering/guides/op-xy/how-to#send-audio-to-and-from-an-external-effect
  - id: balance
    text: Drive (`E2`), level (`E3`) and mix (`E4`) on the external audio track's `M1` balance the returning signal; drive only affects analog inputs.
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-audio
procedures:
  - id: setup
    goal: Route tracks through an external effect and back
    preconditions: [nothing is plugged into the multi-out yet]
    steps:
      - keys: com → turn E3
        note: audio; then connect both cables
      - keys: auxiliary → T5 → M1 → turn E1
        note: the audio input
      - keys: click E1
        note: switches the input on
      - keys: M2 → turn E1…E4
        note: send tracks to the aux output
      - keys: M1 → turn E2/E3/E4
        note: balance the return
    source: https://teenage.engineering/guides/op-xy/how-to#send-audio-to-and-from-an-external-effect
related: [com.multi-out, instrument.track-sends, auxiliary.overview]
---

The multi-out is the send, the audio input the return, and the external audio track the control room
in between: its routing decides what goes out, independently of each track's level in the main mix.
