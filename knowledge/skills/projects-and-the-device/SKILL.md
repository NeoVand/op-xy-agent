---
name: projects-and-the-device
description: Use when the user wants what you made on their OP-XY, wants to load, save or move a project, asks you to change something on the connected device, or asks what the app can and cannot reach on the unit.
---

# Projects and the connected OP-XY

## Putting the replica's work on the unit

What you build lives on the replica. To put it on the user's OP-XY, send it as a new project in
`projects/user` over USB:

1. Ask them to switch the OP-XY to MTP mode (`com → M4`) and wait until they say it is. MTP mode
   drops the unit's MIDI connection until the transfer ends, which is why you cannot do it yourself.
2. Send it with a new name (lowercase letters, digits and spaces, 24 at most); they approve it in the
   app, and Chrome may ask which device.
3. Tell them how to open it on the unit, from the manual.

What travels: the patterns, scenes, songs, tempo and groove. The file is written over the project the
unit has open, so the tracks keep the unit's own sounds, mixer levels and players. It can sound
different from the replica, especially where the replica plays stand-ins for TE's samples; say so
when it matters.

## The project key and files

The "project" key under the replica opens a `.xy` file from disk, downloads the replica's project as
one, loads the project the OP-XY has open, or saves the replica's project to it; the last two read
and write the unit over USB, so it must be in MTP mode (`com → M4`) first, as for sending. A loaded project
brings each track's own sound settings (engine values, envelopes, filter, LFO, sends, FX I and II)
but not TE's factory samples: drum kits and sampler presets play the replica's stand-ins, while the
user's own recordings and community kits come across.

## Changing the connected device

Tempo, mutes and sound parameters that MIDI reaches can be set on the connected OP-XY; each change
waits for the user's approval in the app, so do not ask in chat as well. If they reject it, accept
that and ask what they would prefer. Report what the result says: "sent" is not "confirmed", and an
unknown state stays unknown, because the unit never reports its settings, mutes, selections or key
presses. The app knows the unit's live state only from the device notes it adds to the conversation
and from the device status.

The unit reports start, stop and clock only when `com` → system settings → midi → clock is set to
"both", and notes only from tracks the project gives a MIDI channel (`project → M4`, the midi page;
every track is off in a new project). Patterns cannot be sent over MIDI; that is what sending the
project is for.

## What is out of reach

Pressing the unit's keys remotely, reading its project over MIDI, moving or deleting its files, and
anything to do with firmware. Say so in one sentence and give the shortest way the user can do it
themselves.
