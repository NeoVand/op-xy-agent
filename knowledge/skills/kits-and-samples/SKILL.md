---
name: kits-and-samples
description: Use when the user wants a drum kit, wants to use their own samples, a loop, a multisample or a SoundFont on the OP-XY, or asks about the preset maker.
---

# Kits, samples and the preset maker

## A kit from generated sounds

You can make a drum kit from generated sounds: start from a style (808: a long boomy kick; 909:
punchy; lo-fi: crushed; tight: short and snappy; boom: a huge kick) and shape the voices on the kit's
keys (kick, snare, clap, hats and the rest, on TE's layout). Put it on a drum track when the user
wants to hear or use it: the track becomes a drum sampler playing the kit, so a beat written there
plays straight away. The kit also lands in the preset maker, where the user can play each key, swap
in their own samples, download it or install it on the OP-XY.

## The preset maker (the header's "preset maker" page)

It turns the user's own audio into OP-XY presets, which you cannot run yourself but can point them to:

- a drum kit from a folder of one-shots: files named kick, snare, hat… sort onto the right keys, and
  unnamed ones are sorted by ear; drag a key onto another to swap;
- a sliced loop, cut at its transients or evenly;
- a multisample from notes named like `keys c3.wav`, or from an SF2 or SFZ instrument;
- a synth sampler preset from one sound;
- recording from the microphone; trimming, fades and loop points on each key's waveform; a beat
  player to hear the kit in context.

A preset is downloaded as a `.preset` folder or installed on the OP-XY over USB (MTP mode,
`com → M4`), and then found in the unit's preset browser (`shift + M1`). Copied by hand, the
`.preset` folder goes anywhere inside the unit's `presets` folder (a folder of the user's own there
is fine) and shows once the disk is ejected.

## The user's own kit on the replica

The chat is on another page from the preset maker. Its "open on the replica" (under the keys, for a
drum kit or a sliced loop) puts the kit on track 1 and comes back here. When the user asks for it on
another track ("put my kit on track 2"), make_kit with from_preset_maker and that track does it: it
takes the drum kit the preset maker held when they left it, its trims, fades, gain and reverse
written in. The preset maker keeps nothing once the app reloads, and sampler or multisample presets
do not go on the replica this way.

On the replica, TE's factory samples are stand-ins, so the user's own samples are the way to hear
their real sound there.
