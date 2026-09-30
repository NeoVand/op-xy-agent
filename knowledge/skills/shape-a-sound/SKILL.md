---
name: shape-a-sound
description: Use when the user asks why a track sounds the way it does (dull, harsh, thin, dark) or wants a sound changed or designed from an idea, such as a plucky bass, a warm pad, or a bass that pumps with the kick.
---

# Shaping a sound

## Read it before you judge it

Read the track's sound first, so you speak from its real values rather than from what the preset's
name suggests. Then name the one setting that causes what they hear (a cutoff at 00 is why track 3
sounds dark in a new project) and the keys to change it (`T3 → M3`, then `turn E1`). One clear cause,
plainly stated, is a better answer than a survey of every value.

Say what a value does only when you know it. The filter, envelopes, LFO, sends and mix mean the same
on every track, and the manual explains them. An engine's own four values (a prism's shape or ratio,
a wavetable's position) differ by engine: describe one only when the manual says what it does. Leave
out what every track shares by default (the tape send at 99 is the normal path to the tape, not
signal taken away), and give no tips for states the reading does not show (the filter reads as on, so
"switch it on" is noise).

## Designing from an idea

Work out the parameters and their values first; the manual's how-to recipes list ones that were
tried ([howto.acid-bass], [howto.pluck], [howto.pad-swell], [howto.wobble], [howto.sidechain-duck]). Then set them in one go with the key planner's settings list, so the user can watch it
happen on the replica and the steps come back as keys. Put list picks first (engine or preset, filter
type, LFO type), and an engine or preset first of all, because loading one resets the sound. With an
OP-XY connected, the parameters MIDI reaches can be sent to it directly (the user approves each).

Afterwards say what each change does, so they learn the sound and not just the result, and give the
keys to make it on their own unit in order, from the plan's steps.

## The pump (the duck LFO)

The duck dips the track that should make room (usually the bass or a pad) whenever its source plays.
The source is a track or the metronome.

- Read the drum track's pattern before you pick the source, rather than assume what is on it. When
  the kick shares its track with the hats (every kit in a new project does), the drum track's audio
  ducks on every hat too. The metronome as source pumps on every beat instead, which is what a
  four-on-the-floor kick wants. With a kick on its own track, that track is the natural source.
- Hear a duck in the whole mix. Hearing tracks one at a time mutes the others, the source too, so
  the duck does not move there; that is no sign it does not work.
- On the replica a metronome duck pumps whether the click is on or off. Whether the unit does the
  same with its click off has not been checked; do not claim either way for the unit.
- A track has one LFO, so a duck replaces the LFO its sound had. In a new project only the bass on
  track 3 has its LFO free; the other presets use theirs for movement, so say what you replaced if you
  duck one of them.
- Amount 60–80 is a clear pump, 30–50 a gentle one. Keep the hold short; the release shapes how it
  swells back (a higher release value is a faster recovery).

## Presets and effects on the replica

On the replica only the new project's eight presets carry their real settings; other factory presets
load their engine's starting sound, so choosing one by name will not sound like it does on the unit.
A new project's FX I is a delay set to a dotted eighth and FX II a reverb, which makes the sends an
easy way to add an echo or a space to a part.

When the sound matters, listen to it after you change it (the listening skill), and adjust.
