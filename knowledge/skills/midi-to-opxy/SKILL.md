---
name: midi-to-opxy
description: Use when the user attaches a MIDI file or wants a song they found put on the replica or their OP-XY - arranging it within the OP-XY's limits, deciding what goes where and what to leave out.
---

# From a MIDI file to an OP-XY song

A MIDI file from the internet is written for a general MIDI sound set, often with more parts than the
OP-XY has tracks, parts that change every bar, loose timing and one melody split across several
tracks. Putting it on the OP-XY is arranging, not copying: you decide what the song needs, and you
tell the user plainly what you gave up.

## What the import does for you

The importer reads the whole file itself, so never retype a file's notes. You choose which file
tracks go to which OP-XY tracks; it writes each track's parts as 4-bar patterns (identical bars share
one), a scene for every 4 bars, the song through them in order, and the tempo. It starts at the first
bar the chosen tracks play, lands GM drums on the kit layout, moves notes off the sixteenths onto
them, rests the tracks you left out, and switches the click off so the song plays clean. A part that
changes more often than 16 patterns hold plays the closest of its patterns in some blocks (chosen by
its notes and its harmony), and the result says how much of it still plays as written.

Preview a big file first. The preview writes nothing and reports each part's fate, so you can
change the mapping before anything is written. Then import, add your touches and start playback in
one answer, and write to the user once it plays.

## Choosing where the parts go

Map by what a track plays, as the attachment's summary describes it (its bars, whether it is a melody
line or chords, what it doubles, which melody lines take turns), not by its instrument name: a melody
line is the lead even when its program says pad or organ.

- The new project's sounds suit drums on 1 (2 is a second drum track; only drums go on 1 and 2), bass
  on 3, keys or piano on 4, the lead melody on 5, a pluck or guitar on 6, strings on 7 and a pad on 8.
- Melody lines that take turns are usually one melody split between a verse track and a chorus track:
  put them together on 5. Several file tracks can share an OP-XY track whenever they take turns, which
  frees a track for a part that would otherwise be lost.
- An accent part (a few notes here and there) can join the keys on 4 or the pad on 8, as long as the
  preview shows every note still plays.
- Leave out doubles (two tracks playing the same notes) first, and then only what still does not
  fit. When a part is left out for room, say that tracks 1 and 2 only take drums.

When the choice is close, preview both mappings and compare how much of each part plays as
written; import the better one.

## What to tell the user

A few short paragraphs, well under 1,200 characters, in plain prose rather than headings or lists:

1. What plays: the bars and the tempo, and how many scenes the song chains.
2. Where each part went, in one sentence ("drums on 1, bass on 3, the piano with the vibraphone
   accents on 4, the melody on 5, …"), saying they play on the tracks' own sounds, and what you left out
   and why.
3. What the ear will notice that the OP-XY could not carry, in one or two sentences and in the
   result's own terms (how much of a part plays as written; a part whose blocks differ only in loudness
   plays every note).
4. Your touch, if you added one, and what it does.
5. One next step that keeps the song's feel (the file sets its own timing, so no swing unless the song
   swings), and, when the user means to move it to their OP-XY, how: MTP mode (`com → M4`), then you send
   it as a new project.

Say only what the file and the results show about the parts, never how the original recording
sounds. If you did not listen, do not mention listening.

## Their own take ("a cool way")

Add one or two touches the OP-XY does well once the song plays, set on the replica so the keys come
back to the user:

- The bass ducking on every beat (the shape-a-sound skill has the details; the bass is the one track
  of a new project whose LFO is free).
- An echo on the melody through the lead's FX I send (a new project's FX I is a dotted-eighth delay).

The default sounds already suit those tracks. On the replica, other factory presets load only their
engine's starting sound, so do not promise a piano or an organ by picking a preset name.
