---
name: make-music
description: Use when the user wants something made or changed on the replica - a beat, a bassline, chords, a melody, a pattern, a variation, scenes, a song, a tempo or a feel.
---

# Making music on the replica

## What the sequencer holds

Each instrument track has up to 16 patterns of up to 4 bars (64 steps) and 120 notes. A scene says
which pattern every track plays (99 scenes); the song plays scenes in order (96 entries) and loops or
not. A scene lasts as long as its longest pattern. Plain play runs the song from its first scene.

Patterns always go to the replica, also when an OP-XY is connected, because the unit cannot receive
patterns over MIDI. When a device is connected, say so, and offer to send the project to it as a new
project (the device skill).

Tracks 1 and 2 are drum samplers in a new project. Their 24 keys follow the layout TE's kits share:
kicks 53–54, snares 55–56, rim 57, clap 58, tambourine 59, shaker 60, closed hats 61–62, open hat 63,
clave 64, low tom 65, ride 66, mid tom 67, crash 68, high tom 69, triangle 70, congas 71–72, cowbell 73,
guiro 74, metal 75, chi 76. Name drum sounds by what they are, never by note number. The other tracks
play pitched notes (C4 = 60); the new project's sounds suit a bass on 3, keys on 4, a lead on 5, a
pluck on 6, strings on 7 and a pad on 8.

## Carry out the whole request

Write the patterns first (patterns for different tracks can go out together in one answer), then the
scenes and the song when there is more than one part, then start playback. Write them short: notes
as one string, a word per note (step:note[:length[:velocity]], a chord joined by +), a progression
by name as chords ("1:Am7 17:Fmaj7 33:C/E", voiced smoothly near middle C; give notes instead only for
a voicing of your own), and drums as a grid, a line per sound as read_pattern shows them; to add or
change one sound of a beat, write its line alone with merge (the other sounds stay). An answer has an output limit, so send a few
patterns at a time, not a whole song. Give quiet parts their velocity (pads, strings and keys about
50–80); left out, every note plays at 100. A feel is part of the
request: lazy, swung or laid back is the tempo page's groove and its amount. Shuffle is the plain
swing, roll over a slow, lazy hip-hop drag; the amount (groove amount, right of centre to swing)
on the replica reads light at 25–35, lazy at 45–60 (near triplets at 65) and heavy past 75, and
listen measures the swing it hears (50 % straight, 67 % triplets). Set them with the key planner's
settings, groove then swing ({param: "groove", value: "shuffle"}, {param: "swing", value: 50}). On the
replica shuffle moves every second sixteenth (steps 2, 4, 6…), so hits on the eighths do not swing;
one track's own amount is the bar menu's groove (area bar). With no tempo given,
pick one that suits the style (house 120–126, techno 128–135, hip hop and boom bap 85–95, lo-fi
70–85, drum and bass 170–175); slow, ambient or a pad wants 60–80 (one chord a bar at 120 is not
slow). A new project's metronome clicks on every beat: when you start playback of a beat or song you made,
switch it off first (set_metronome) and say so in a few words; otherwise leave it alone (someone
learning or playing along keeps time by it).

Another meter is the project's time signature (the key planner sets "time signature") and a
pattern length its bars fill: a 3/4 bar is 12 steps (three beats of four), 6/8 is 12 (two beats of
six), 7/8 is 14, 5/4 is 20, so four bars of 3/4 are length 48. Readings then group the bars that way.

Musical words mean what a drummer or producer means: a fill fills its bar (sixteenths building in
velocity into the next downbeat, toms at the end if you like; write the groove's one-bar lines for
the whole pattern, then the fill's bar alone with bar, rather than counting a 64-mark line), four-on-the-floor is a kick on every
beat, a backbeat is the snare on 2 and 4, and a closed and an open hat do not share a step (a
drummer plays one or the other: a grid leaves the closed one out under the open one, so a steady
closed-hat line with open hats on top is fine). Velocity per step is a step component
([sequencer.component-velocity]), not a parameter lock.

A kit made from generated sounds can be put straight onto a drum track, so a beat written there
plays with it at once. A style's signature sound is part of the request too (trap's long, low 808
bass, a techno rumble, a house organ stab): the notes alone keep the track's preset, so shape its
sound for the style (the shape-a-sound skill) and say what you set. Trap hat rolls are faster than
a step: put the multiply component on the hat steps that roll (its digit is how many quick hits), with
their loudness rising or falling by step.

A part that varies as it plays (generative, evolving, never quite the same) takes step components
(random notes, skip trigger, multiply: [sequencer.step-component-reference]), patterns of different
lengths that drift against each other, and a slow random LFO.

Many edits at once (the whole song transposed, the hats of every pattern humanised, a variation of
each part) are one lab program, exact to the note and one change to undo; the lab skill has the
shapes. A pattern or two are clearer written directly.

## Say what you made

Describe what you made from what the write returned, not from what you meant: a drum pattern comes
back as a grid (a line per drum sound, x a hit, X an accent, a soft hit as its digit 1–5, four steps a beat), any
other pattern as a reading of its bars and chords, spelled in the key its notes suggest. Show a drum
grid as it came back, in a code block with one sentence on the feel, or say it in a sentence or two;
say a bassline, chords or a melody in a sentence from the reading, never as a grid you draw
yourself. Never walk through it hit by hit or list the notes back. When the reading shows a chord or
a note you did not mean (G7 where you wanted Gm7), fix the pattern before you answer.

Then a sentence or two on what they will hear (the groove, the key, which track plays what) and at
most one thing to try next, with keys you are sure of.

Every change can be undone from the app, which is worth one mention when you replace something the
user made.
