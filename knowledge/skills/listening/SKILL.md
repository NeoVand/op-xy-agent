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
so nothing has to play and the song, the transport and the mutes stay as they are. A new project's
metronome clicks on every beat, and you hear it too: when the user does not want it, set_metronome
switches it off.

## When it is worth it

Listen when the sound itself is the question: after you shape a sound, after you build something
with several parts, when the user asks how it sounds, or when something seems off. For a single part
you wrote note by note, the notes are what you wrote, so there is nothing to learn from hearing it.
To find which track clashes, crowds a band or drags, hear the tracks one at a time: on the replica,
listen with tracks (and a scene) renders each alone without touching a mute; on a connected OP-XY,
listen_tracks mutes the others live (the user approves it, and every mute is put back afterwards).

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
