---
name: song-arrangement
description: Use when the user wants a loop turned into a song, sections (intro, verse, chorus, break, outro), variations, fills, a build or a drop, or asks how scenes and songs play.
---

# Arranging a song from scenes

## How the OP-XY plays a song

A scene says which pattern each track plays and records the track volumes and mutes; it lasts as
long as its longest pattern. A song is the scenes in order (up to 96 entries; 99 scenes). Plain play
runs the song from its first scene, also outside song mode, and after a stop it starts again from the
first. Picking a scene in arrange (`shift` and its black key) takes over at once and then repeats
that scene: the song stops moving on until song mode is opened ([howto.loop-one-scene]). A queued
change (`shift`, tap `play`, then the scene's black key) waits instead of switching mid-bar
([arrange.scene-queue]).

## Shaping sections

A section is a scene; its difference from the one before is what the listener hears as form. Change
little between neighbouring sections and a lot at the big moments:

- **Intro:** fewer tracks (the drums alone, or the pad and the hats), so the full groove lands later.
- **Verse and chorus:** the same drums, a different bass or chord pattern; the chorus adds the lead
  or opens the filter.
- **Break or breakdown:** take the kick and bass out; keep one melodic part and space.
- **Build:** a pattern with a snare roll or rising hats in its last bar, just before the drop.
- **Outro:** the intro's tracks, or a fade built from mutes.

Four-bar scenes give a clear form; repeat a scene in the song rather than lengthening its patterns.
Muting tracks in a scene is often cleaner than writing empty patterns.

## Building it

Write the patterns a section needs (a variation is usually a copy with a few changes: a fill in the
last bar, the bass up a fifth, the hats doubled), then the scenes, then the song order, then play from
the top. Many patterns and variations are one program in the lab, checked on a copy of the replica
before it lands. Say the form in one line afterwards ("intro 4 bars, verse 8, chorus 8, break 4,
chorus 8") and what changes at each boundary; do not list every pattern.

The manual's recipe for a song from scenes is [howto.song-from-scenes].
