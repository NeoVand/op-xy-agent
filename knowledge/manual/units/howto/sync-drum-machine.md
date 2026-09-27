---
id: howto.sync-drum-machine
title: Recipe — sync a vintage drum machine
aliases: [din sync, sync24, vintage drum machine, clock a drum machine, 808 sync]
area: howto
order: 22
summary: Set the multi-out to sync24 and run a 3.5 mm-to-DIN-sync cable into the drum machine's sync input; `play` then sends clock, start, stop and reset.
status: current
firmware:
  min: '1.0.9'
  changed_in: []
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: why
    text: Older drum machines usually take DIN sync on their sync socket rather than modern MIDI clock.
    source: https://teenage.engineering/guides/op-xy/how-to#sync-a-vintage-drum-machine
  - id: mode
    text: Set the multi-out to sync24 so it sends that kind of sync signal.
    source: https://teenage.engineering/guides/op-xy/how-to#sync-a-vintage-drum-machine
  - id: cable
    text: The connection needs a cable with a 3.5 mm plug for the multi-out and a DIN plug for the drum machine's sync input.
    source: https://teenage.engineering/guides/op-xy/how-to#sync-a-vintage-drum-machine
  - id: signals
    text: With `play`, clock, start, stop and reset all travel down the cable, so the drum machine follows the OP-XY.
    source: https://teenage.engineering/guides/op-xy/how-to#sync-a-vintage-drum-machine
procedures:
  - id: sync
    goal: Clock a DIN-sync drum machine from the OP-XY
    preconditions: [the sync cable is not yet plugged into the multi-out]
    steps:
      - keys: com → turn E3
        note: sync24
      - keys: play
        note: after connecting the cable; the drum machine starts with the OP-XY
    source: https://teenage.engineering/guides/op-xy/how-to#sync-a-vintage-drum-machine
related: [com.multi-out, howto.sync-pocket-operator]
---

The OP-XY is the master here: it sets the tempo and the drum machine follows, starting and stopping
with the OP-XY's transport. Set the jack's mode before plugging in, since it cannot change with a
cable in place.
