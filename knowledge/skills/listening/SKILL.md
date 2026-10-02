---
name: listening
description: Use when the user asks how something sounds, after you shape a sound or build something with several parts, or when something in the mix seems off.
---

# Listening

Listening records a few seconds of what plays (the connected OP-XY over its USB audio, else the
replica in the browser) and measures it: loudness and peaks, tone against pink noise, stereo width,
tempo against the set tempo, timing and swing, where the kicks, snares and hats sit in the beat, a
key and rough chords, and flags such as clipping or a tempo that drifts. The transport must be
playing; if it is stopped, start it or ask the user to.

A song moves on from scene to scene while you listen, and play starts it from its first scene (often
an intro). To hear one part, listen with its scene: the replica renders that scene looping, offline,
so nothing has to play and the song, the transport and the mutes stay as they are. To hear a change
of part (does the fill lead in, does the chorus lift), the lab's listen takes song with an entry and a
bar: it renders the song on from there across the parts that follow and says how loud each one is,
and bar by bar within a part of 2 to 8 bars; listen with a scene (the listen tool's, no lab needed)
gives that scene's bars too, so a build or a fade is checked in one listen. A new project's
metronome clicks on every beat, and you hear it too: when the user does not want it, set_metronome
switches it off.

## When it is worth it

Listen when the sound itself is the question: after you shape a sound, after you build something
with several parts, when the user asks how it sounds, or when something seems off. For a single part
you wrote note by note, the notes are what you wrote, so there is nothing to learn from hearing it.
To find which track clashes, crowds a band or drags, hear the tracks one at a time: on the replica,
listen with tracks (and a scene) renders each alone without touching a mute; on a connected OP-XY,
listen_tracks mutes the others live (the user approves it, and every mute is put back afterwards).

The tone bands against pink noise are the whole take's balance, not each sound's: a heavy low end
(an 808, a sub bass) makes the highs read low even when the hats are bright. To judge one sound's
own tone, hear its track alone (listen with tracks).

## Two parts in each other's way

When the user says two parts fight (the kick and the bass, the pad and the chords), listen before
you change anything: each alone and the scene together tells you whether it is their notes on the
same steps, a long tail ringing into the other's hits (the amp release), their levels, or the same
band. Fix what you heard, then listen again and say what moved.

## One sound too loud or too quiet

A track's level (area mix, "level") moves everything on it. One sound of a drum track alone has two
ways: its hits' velocities (write_pattern's digits, which keep the accents' shape), or its key's
sample gain (the key planner's "gain" with key the sound, −30 to +20 dB: every hit alike, and it is
the sound's own level on the unit too). Say which you changed and that the other stays.

## Saying what you heard

In a sentence, in a musician's words (the kick sits on the beat, the bass crowds the pad), against
what the user asked for. Numbers such as LUFS or a spectral centroid only when they ask. Then revise
and listen again; stop when it matches, or after a couple of rounds. Measurements are not taste:
judge them against the request and the genre.

Some readings come from how the analysis hears rather than from what plays (a half-time tempo, a key
the chords do not support). They are quirks of the measurement, not news, so leave them out, and
never explain them with music theory: when the heard key is not the key you wrote, the result says
so; go by what you wrote. If you did not listen, say nothing about listening, and when the user
asks how something sounds, listen first.
