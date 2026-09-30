---
name: midi-gear
description: Use when the user wants the OP-XY to work with other gear - an external synth, a MIDI keyboard or controller, a drum machine, a DAW, clock and sync, MIDI channels and CCs, the multi-out.
---

# The OP-XY with other gear

Veterans ask here, and they want precision: the exact page, the exact cable, the channel. Work out
their setup before you answer (which device, which connection: USB, or DIN MIDI or sync through the
multi-out), in one question if they did not say.

## What connects how

- **A synth with DIN MIDI:** the multi-out set to midi and a type A TRS-to-DIN cable
  ([howto.control-synth-midi]). **A synth with USB MIDI:** straight into the USB-C port; it appears
  under `com → M3`.
- **Playing a synth from the OP-XY:** the external MIDI track (`T3` in auxiliary mode) plays and
  sequences it; on its `M1` page `E1` sets the channel, `E2` and `E3` bank and program; `M2` and `M3`
  hold eight CC slots whose moves can be sequenced. Several synths: instrument tracks can run the midi
  engine too.
- **A MIDI keyboard or controller:** USB into the OP-XY; notes on the active channel play the selected
  track; the preset settings' mod tab (`shift + instrument`) routes mod wheel, aftertouch, bend and
  velocity; `com → M3` filters what each device sends ([howto.midi-keyboard]).
- **A drum machine with DIN sync:** the multi-out set to sync24 and a 3.5 mm-to-DIN-sync cable
  ([howto.sync-drum-machine]).
- **A computer or DAW:** USB; the OP-XY is also a USB audio interface ([howto.audio-interface]).

## Channels and clock

A track sends its sequenced notes over MIDI only once the project gives it a channel (`project →
M4`, the midi page; every track is off in a new project) and notes output is allowed in the MIDI
settings ([project.midi-channels]). Incoming notes on channel N reach track N. The unit sends start,
stop and clock only when clock is set to "both" in `com` → system settings → midi; the factory setting
"in" sends none.

## What this app can and cannot do for them

The key planner reaches the midi engine's channel, bank and CC slots on the replica, so you can show
every page and value; but the replica sends nothing to their other gear. On a connected OP-XY this app
can set tempo, mutes and the sound parameters MIDI reaches; the CC map is in [com.midi-cc-reference].
Everything else on the unit is theirs to press: give the exact keys.

Where the manual marks behaviour as unverified on OS 1.1.33, say so; veterans would rather know.
