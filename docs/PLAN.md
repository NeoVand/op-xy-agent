# OP-XY Agent — Plan

> Living roadmap. North star: [`VISION.md`](VISION.md). What we know: [`research/INDEX.md`](research/INDEX.md).
> Decisions: [`DECISIONS.md`](DECISIONS.md). Questions for the owner: [`QUESTIONS.md`](QUESTIONS.md).
> Update the **Status** block whenever a milestone moves.

## Status (2026-10-01)

- **Now: Agent v2** (`docs/AGENT-V2.md`, D12; where each phase stands is at the end of it). Built
  in the night of 2026-09-30 and on main: a prose core prompt with 14 skills and a router; the
  replica's changes grounding every answer, with undo per turn from the chat; patterns read back as
  a musician reads them; the lab (the model's JavaScript on forks of the replica, one undo for what
  it commits); memory; demonstrations put back once seen; listening that hears a pump. New evals:
  episodes with simulated users (9/12 → 11/12), the honesty check, the manual verifier (its five
  manual errors fixed). Regression suites hold (evals/agent/RESULTS.md). The video waits for it.
- **The UI round (2026-09-30, the owner's picks), on main:** what the keys play read as a chord or
  scale under the replica; the change glow (an answer's changes breathe on the keys that lead to
  them); the display large over the device (a click on its screen); quick replies under the last
  answer; downloads (the song as WAV or MIDI, a pattern as MIDI); eight recorded conversations to
  watch without a key; pattern cards in the chat to hear and edit; takes from the lab to audition
  and keep; the now-playing strip (tempo, bar, song, track meters that mute); the ⌘K command
  palette. Next there: an undo for a kept take, change marks on encoders, the song WAV from ⌘K.
- **The agent's own report (2026-10-01), from a trap beat it struggled with:** the lab runs on the
  published site (its worker gets the Svelte compiler; an e2e guard); `listen` hears one scene
  looping (`scene`, rendered offline, `tracks` each alone, no mutes touched), and the lab's scene
  listening no longer starts the song; `set_metronome`, and on/off in the planner (a click of E4);
  write_pattern's short forms (a note string, a drum grid, a pattern velocity); sound changes read
  from an idle copy, never from the screen where it stands; playback the user started is marked.
- **The probe (2026-10-01):** `evals/agent/probe.mjs` talks to the agent on the built site (headless
  Chromium, the key swapped in Node), presses replica keys as a user does, and ends with the owner's
  debrief question. Its first rounds fixed grounding (whether the replica plays, and from where),
  device-only approvals, section-by-section listening, a key-heard-versus-written note, readable
  results, screen values the pages draw, and a walkthrough that guides any key sequence key by key.
- **Probe round two (2026-10-02), 16 scenarios (`evals/agent/probe-scenarios.json`), each step
  followed by "what confused you?":** write_pattern keeps an arranged project's scenes (it rewrote
  the current one) and transposes in place; the agent sees what the user changed between turns;
  `take_back` undoes an earlier answer; `transport` plays one scene from its top; scenes say their
  bars and the song its length; scenes change track by track, pattern 0 rests a track; a ducked
  track heard alone keeps its source playing unheard, so its take pumps; LFO speeds reach the
  synced range ("sync 16", "1 bar"); drum marks are absolute (X 115+, o 75 and under); a pattern's
  key counts the other parts and the scale; calls after a change in one batch wait for it (a status
  read ran mid-animation); player, scene and pattern-switch changes are named.
- **Probe round three (2026-10-02), 17 new scenarios (`probe-scenarios-3.json`; a `follow` step
  presses what a walkthrough lights):** the round-two fixes held. New: `keep_take` (a take named
  in words), the planner reaches the project settings (time signature), write_pattern's `bar`,
  grids by the pattern's length, later change lists give only what is new, the walkthrough's
  progress reaches the agent, a whole-mix listen points a duck to a per-track listen, tremolo and
  synced LFO speed read as their pages are, minor keys spell their leading note.
- **Probe round four (2026-10-02), 16 scenarios (`probe-scenarios-4.json`):** the round-three
  fixes held (takes picked in words, one bar of a progression, the time signature, the tremolo).
  New: readings in the project's meter, step components in write_pattern and read_pattern, chords
  named over another track's bass, a key to spell a pattern in, the walkthrough card's value and
  turn direction, the Now line's song entry and bar, rests named in the scene on screen.
- **Probe round five (2026-10-02), 16 scenarios (`probe-scenarios-5.json`: typos, German, a
  compound request, contradictions, a device problem, famous chords, an open question):** the
  song moving on reads as a scene change, not as user edits; recording counts only when armed;
  grids take velocity digits 1–9 (ghost notes); the planner enters a maestro chord (by octaves
  onto the keyboard) and plans save and save as; a grid line of rests is noted; a pattern switch
  names its scene; readings give the progression as degrees ("I V vi IV in C major"). The manual
  now says what arms each sampler page and how external MIDI gear is sequenced.
- **Probe round six (2026-10-02), 16 scenarios (`probe-scenarios-6.json`: Persian, the user's
  own presses, relative tweaks, a wrong premise, an undo chain, a vibe brief, a half-time chorus):**
  soft drum hits read back as their digit; a grid leaves a closed hat out under an open one; a
  line shorter than a bar that repeats is noted; filter pages read all four values; the maestro
  chord reads as its notes and the planner documents chord, save and save as; demos say where
  they started; the Now line names the tracks sounding and a running take (also between turns);
  `take_back` steps back like an undo ("undo again" is answer 1 again); chords are named on their
  bass when it can be the root (C6, not Am7/C) and common extended chords are named; listening
  does not flag loose timing without drums.
- **Probe round seven (2026-10-02), 17 scenarios (`probe-scenarios-7.json`: a score image, ABC,
  guitar tab, Spanish, a firmware question, a 2-minute song, a sound copy, a parameter-lock lesson,
  tempo limits, swing on the hats alone):** chords by name in write_pattern (`chords`: "1:Am7
  17:Fmaj7", voiced near middle C with smooth voice leading, `core/music/voicing.ts`); the planner
  locks one step's value (`step`: the step held while the encoder turns, walked through by the
  music mark, which now carries locks) and copies a sound ("sound from"); a walkthrough warns when
  a lone step press would take a note off; demos give each combo's screen; lab results that change
  scenes give the arrangement; play says when the click is on; a chord over another track's bass
  says what its own notes make; the manual gives TE's downloads address.
- **Probe round eight (2026-10-02), 16 scenarios (`probe-scenarios-8.json`: a taste remembered,
  Korean, the user's own tempo turn, "too happy" over three turns, a WAV export, a connection
  problem, 30 seconds of music, 7/8 phrygian with double time, too many notes, two hat patterns
  by ear, a voice to record):** a lock step's screen reads with the step held (the walkthrough's
  turn hint has a target) and `readings` take the values after the last label; patterns read
  back their locks and change lists name them ("step 7 cutoff locked at 60"); a miscounted grid
  line is refused, not noted; scenes count bars in the project's meter (four bars of 7/8, not
  3.5); a pattern at another track scale says how long it lasts; chords by name take `voicing:
root` and list their symbols; list pages read in full for the agent; a sound copy names what
  it replaced; device_status says why nothing is connected; the app skill knows the song .wav and
  .mid downloads and that the replica records no audio, and is routed for questions too.
- **Probe round nine (2026-10-02), 16 scenarios (`probe-scenarios-9.json`: "sounds terrible",
  "more cowbell", undo after the user's own edits, a language switch, the brain in D minor, "what's
  on each track", "don't touch the drums", hats fading in, the arpeggiator, a fill every 4th bar, a
  cowbell from scratch, an emoji beat):** the lock lesson now works end to end; write_pattern
  `merge` writes only the grid lines given and `repeat` fills a pattern from a phrase; take_back
  says what it kept (the user's edits) and leaves playback; the brain, a kit and a new sound read
  as one line each in change lists; the beat grid uses the set tempo when the heard one is its half
  or double (swing no longer reads loose); status names each track's preset; the device note says
  why nothing is connected; plan-only results say NOT SET; grids take marks only.
- **Probe round ten (2026-10-02), 14 scenarios (`probe-scenarios-10.json`: a build-up and drop, a
  louder chorus, a bass muted in one scene, call and response, sharps in a flat key, the two
  envelopes, a kit from the preset maker, a quiz, a long build, plus re-runs):** a scene keeps its
  own mix (write_arrangement `mix`: levels and mutes per scene, undone with it); the lab sets
  parameter locks (`set` with `step`) and hears a song across a change of part (`listen` with
  `song: {entry, bar}`, each part's loudness listed); the song WAV no longer plays a scene's
  opening again under the next one (the offline render's `notes` cut); patterns in 7/8 default to
  whole bars of the meter; readings name the chord each bar of a single line outlines and say how
  they spell the sharps given; the planner reads a shift layer's value with shift held; make_kit
  puts the user's own preset-maker kit on any track; `read_sound` lists each filter value once and
  says when the envelope opens a closed filter; the grounding names what earlier changes were about
  and says when built parts were never heard; the manual gained where copied presets go, prism's
  shape and detune, and what scale 1/2 does.
- **Probe round eleven (2026-10-02), 16 scenarios (`probe-scenarios-11.json`: a verse and chorus
  with their own mix, a fill checked by ear across the change, sharps in E♭, a 7/8 groove, a kit
  the preset maker never had, "from the next room", a waltz, five minutes of teaching, faster at
  the same tempo, a numbered list, a chord chart, swing in half a song, a breakdown, a guitarist, a
  hummed tune, humanised hats):** the agent heard a fill into a chorus with the new song listening,
  found clipping at the join and fixed it. Fixes: listen summaries give the time of a hot peak and
  of the clipping; scenes list every track's level once they differ, and a track resting on its
  empty pattern 1; the level scale is described (74 is unity, 60 about −4 dB); a groove that moves
  few or none of a pattern's notes is said when it is set (plan_steps, the lab's `set`), not only on
  a write; a time-signature change says the patterns keep their steps; write_pattern names the
  meter, says when a whole closed-hat line falls under open hats, says loud digits read back as x,
  takes `stay` (a pattern for a later part, the track left on its own) and leaves a merged closed hat
  out under a kept open hat; string methods written into JSON inputs are worked out; "plays pattern
  1 again, not 2" replaces a bare undone line; the not-heard note no longer prompts "I haven't
  listened"; the play result says to switch the click off under music made; parts put on tracks
  route to make-music; the manual gained prism's ratio and stereo.
- **Probe round twelve (2026-10-02), 16 scenarios (`probe-scenarios-12.json`, no failed calls:
  re-checks of stay, the unheard note, the groove reach, a drop heard against its build and merged
  sixteenth hats, plus a sidechained bass, a copied and varied pattern, a loud snare, early Daft
  Punk, scenes played live, an external synth, a song's seconds, chords up an octave, a boomier
  kick, play with nothing written, a tempo question):** agents used stay and the groove warning and
  stopped adding listening disclaimers. Fixes: write_pattern takes `copy` (start from another
  pattern, alone or with one bar anew) and `groove` (a pattern's own groove, so one part swings
  without selecting it in arrange; undone with the write); a groove set is confirmed with what it
  moves; song sections in listen give their swing; a part written before the scenes is read
  against the other tracks' patterns of its number; the value LFO's parameter takes names
  (cutoff, attack…) and its destination is described; plan_steps' show says it sets and stays
  (how-to questions take a demo or guide); make_kit says voices alone remake only their keys; the
  grid's description says a closed hat under an open one is left out.
- **Probe round thirteen (2026-10-02), 16 scenarios (`probe-scenarios-13.json`: a fill every
  fourth bar, swing on the chorus alone, a wobbling pad, a snappier snare, a tempo lesson followed
  by hand, a change of mind, a remembered dislike of reverb, "will it sound the same", "track 3
  louder", 3 against 4, arpeggiated chords, MIDI for Ableton, a long spec in one message, a kit
  layout question, a generative melody, a kick and bass clash):** the chorus swung through its
  pattern's groove, the lesson worked end to end, the reverb taste was kept. Fixes: grid names find
  a made kit's sounds by what they are ("kick 1" → "808 kick"); a remade voice keeps its key's name
  on a file of its own, and kit changes are compared by file; digits 6–8 read back as written (a
  write's own velocity as x); chords given by name read back by those names (Em7/G, not G6);
  outlines only for three- or four-note bars; the grounding says when the tempo is not the one the
  user's message names; `.replace("•", ".")` in a JSON input is worked out; the LFO page reading
  names its parameter; the prompt says not to mention not listening; the skill arpeggiates with the
  player and lays out a fill every fourth bar.
- **Probe round fourteen (2026-10-02), 16 scenarios (`probe-scenarios-14.json`: a bassline refined
  over four turns, a melody given as note names, saving on the device and in the app, a lesson to
  add a bar followed by hand, "you deleted my beat", hats panned left, a delay on the snare alone,
  "more 80s", the tempo doubled at the same speed, a fade-out, a bass that follows chords, the
  user's own key presses explained, the song order shuffled, three bassline options, the drums out
  for one bar, the pattern limits):** most worked; the debriefs found what results left unsaid.
  Fixes: read_sound and the change lists give a drum key's own settings ("C#4 closed hat 1: pan 0 →
  -70"); a lock on a drum step that reaches more sounds than one says so (plan_steps, the lab), and
  equal locks group by value; the user's changes before their first message reach it ("Since the
  chat opened"); a pitched pattern reads back in write_pattern's own notes form instead of a JSON
  object a note (a 64-note bassline five times shorter, and editable as it stands); `scale` or
  `groove` alone keep the notes, the change list names a scale or groove change, and a scaled
  pattern says its seconds; a page change gives what moved, then the page ("fx II 00 → 45 (now …)");
  scenes in the change list differ by their levels and mutes (a fade's four scenes read alike);
  "pattern 1 is still on the track" when a write moves a track on; make_kit says the old grid names
  still find its sounds; the step length is in the write description; the skills: a send is the
  whole track's (one sound alone on T2), "play this" means write and play, fades from stepped
  scene levels, one bar changed by a copy; the prompt: say which reading of a two-way request you
  took.
- **Probe round fifteen (2026-10-02), 16 scenarios (`probe-scenarios-15.json`: re-checks of
  round fourteen (hats panned, a delay on the snare alone, the user's own turns before the first
  message, half time, "play this", a fade) and new ones: a key change for the last chorus, robotic
  hats humanized, chords made offbeat stabs, a waltz, a counter-melody, an old radio, a beat copied
  to T2 and varied, the brain explained, two answers undone, recording live):** the user's changes
  before the first message, the scene levels of a fade and the lock reach all worked. Fixes:
  **write_pattern kept nothing of a pattern it started from but the notes** — a bar written alone,
  a transpose, a merge or a scale took every lock with them and flattened a live take's timing,
  and a pattern card tap did the same to locks and step components; now notes keep their offset
  (`VirtualNote.offset`, read back as `offGrid`), writes that start from a pattern keep its
  locks (`stepLocks` / `PatternWrite.locks`) except on a bar written anew, and a rewrite that
  drops locks says so. Also: write_pattern `copy_track` (a copy from another track of its kind);
  the key planner finds drum keys as the grid does ("open hat" → "open hat 1"; `soundKeyOf`
  shared); a drum track's touched-key M1 page is no change; page changes say what stayed
  ("; unchanged: …") and FX pages say what moved ("FX I delay: dry 99 → 00"); scene lines put the
  mix after a semicolon; the lab's writePattern takes `stay`, `groove` and offsets, and run_lab
  gives readPattern's shape; inverted chords point to voicing root; play_notes says it was heard
  and written nowhere; a demo says how the transport ended (`transportAtEnd`); note lists, sends,
  delays and pans route to their skills; the skills: one-bar fade steps need one-bar patterns; the
  manual: quantisation most likely acts as notes play (derived), the old pattern count reworded.
- **Probe round sixteen (2026-10-02), 16 scenarios (`probe-scenarios-16.json`: re-checks of
  round fifteen (a lock kept through a bar rewrite, a beat copied to T2, the open hat panned, reverb
  on the clap, "play this", a fade in one-bar steps) and new ones: tracks muted by hand, a beat that
  adds a sound a bar, a boomy bass, triplet hats, the song's length, a louder chorus, swing on the
  hats alone, an arp of another track's chords, a melody from CABBAGE, a beginner):** the kept
  lock, copy_track, "play this" and the user's mutes all worked. Fixes: **a merge of rest lines
  alone (to take one sound out) wiped the whole pattern** — it now takes those sounds out and
  keeps the rest, and says so; a line of rests may be any length, and a miscounted line run
  together says to space it in fours; write_pattern `copy_bar` (one bar of a pattern as a pattern
  of its own, for fades and fills); the drum key page's shift layer reads direction, pan, fade and
  gain; pitched notes added or removed are named in the change list ("(B1, D2)"); the user's
  changes are said to be theirs firmly, the song moving on kept apart; the lab result and the
  arrangement say playback goes on; a demo that took notes off says so (`caution`); a new scene's
  mix starts from the one playing; the manual: prism ratio by value ranges, triplets from
  multiply (derived).
- **Probe round seventeen (2026-10-02), 16 scenarios (`probe-scenarios-17.json`: re-checks (the hats
  swung alone through a merge, a fade from single bars) and new ones: a lesson with a wrong key
  pressed, limits past the device's (6 bars at 400 bpm), drums asked of track 9, "more space",
  7/8, sending with no device, a wobble bass, two chord options, a song built over five turns and
  played from the bridge, the user's own hits then an edit, "surprise me", the key of a build,
  "faster", downloads):** the merge and copy_bar fixes held; eight calls failed, all on miscounted
  grid lines, each fixed on the next call. Fixes: write_pattern `humanize` (timing and velocity,
  per sound, deterministic; the pattern's quantise goes to 0 so notes play where they sit;
  `quantise` read back and in the change lines); rests past a pattern's end are dropped, and the
  grid description asks for groups of four with | between bars; readings list notes outside a key
  the writer named and the mode one of them makes ("B is outside D minor: … D dorian"); scene lines
  say a track rests on an empty pattern, and a new empty pattern reads "new and empty"; the lab's
  writePattern takes chords by name; the skills: humanize, a groove is the whole pattern's (hats
  alone on T2), a smooth fade from volume locks with the bar menu's shape, LFO sync note values;
  the manual: a new project's tape sends at 99.
- **Probe round eighteen (2026-10-02), 16 scenarios (`probe-scenarios-18.json`: re-checks (humanized
  hats, D minor's dorian B, resting tracks, chord takes from the lab) and new ones: a live
  drummer's feel, everything down a minor third, a punchier kit, a lead turned arpeggio, each
  track explained, a filter opening every two bars, "too repetitive", double-time hats, a bass off
  the kick, call and response, a smooth fade, a snare like a clap):** humanize, the outside-the-key
  reading and the smooth fade (volume locks with the bar menu's shape, from the lab) worked; five
  sessions lost turns to the API reporting "overloaded" mid-stream. Fixes: **the loop asks again,
  twice, when an answer is overloaded before it showed anything** (`overloadRetries`, the browser
  conductor's 2); humanize `late` (a steady lean behind or ahead of the beat); a bass written on
  the kick's steps says which; the groove note says to put hits on the swung steps before
  answering; "live drummer" no longer loads the performance skill; scale alone says 1/2 is double
  time; the skill's open-hat rule says the grid drops the closed hat and to show the grid as it
  came back.
- **Probe round nineteen (2026-10-02), 16 scenarios (`probe-scenarios-19.json`: the five sessions
  round eighteen lost to the API's overload, all completed this time, and new ones: a laid-back
  snare, a bass kept off the kick, a swung beat, a melody backwards, the verse bass an octave up in
  the chorus, a tempo ramp, a sound copied between tracks, a count-in lesson followed by hand,
  vinyl crackle, the user's own presses before the first message, a muddy low end):** two failed
  calls (a JS expression in a grid, a | in the notes form). Fixes: write_pattern `reverse` (alone
  or into a copy, locks and components with their steps); the notes and chords forms take | between
  bars; a drum swap reads "the same rhythm on other sounds (snare 1 → clap 1)"; merge says a line of
  rests takes its sound out; the groove note counts a few swung hits a bar as a swing; the kick
  note says together is a choice of style; the walkthrough status says which keys are held down;
  make_kit's `crackle` voice (vinyl dust, an even bed of pops, also in the preset maker); the manual:
  the tempo is one value a project, no lock or LFO reaches it (derived).
- **Probe round twenty (2026-10-02), 16 scenarios (`probe-scenarios-20.json`: re-checks (a beat
  reversed into a copy, vinyl crackle, notes bar by bar) and new kinds of request: "no, the other
  way", teaching what was just done, slang and typos, French, a remembered tempo, "what can you
  do", loading from a device not connected, a pluck sound, an arp down and faster, the knobs of the
  page on screen, a Bach invention, four songs at once, drums in the chorus alone):** crackle,
  reverse, French (answered in French), memory and "what can you do" all worked; one failed call
  (velocity in a lab write). Fixes: a reversed drum beat mirrors about the downbeat (hits on the
  beat stay on beats, a fill at the end opens the bar); a walkthrough to a value already set lights
  the way to its page and encoder instead of nothing; write_pattern says when chords land on a mono
  track (status tracks carry `playMode`) and when step components sit on steps with no notes; the
  lab's writePattern takes `velocity`; the projects skill says loading from or saving to the unit
  needs MTP mode.
- **Probe round twenty-one (2026-10-02), 18 scenarios (`probe-scenarios-21.json`: re-checks (a tom
  fill reversed, chords on the legato T5, a ratchet on an empty step, a walkthrough to tempo 120, lab
  takes by velocity, loading from the unit) and new kinds: an acid line with slides, euclidean
  rhythms, chords that anticipate the bar, a harmony a third above, "do the same to track 8", "huh?",
  an eight-year-old's song for a dog, black keys only, "delete everything and start over", "make it
  louder" on an empty project, a note tied over the bar line, an engine for a warm pad):** one failed
  call (a 0.01-step note). Fixes: plan_steps says a value is already set wherever its page is (and
  lights the encoder, tempo's too) and plans "new project" (project, hold M1; the planner holds
  keys now); write_pattern leaves out components on steps with no notes and takes them off with
  `none`, says which notes slide on a legato or mono track with portamento up (and plan_steps says
  it once legato or portamento is set: notes that only touch do not slide), reads a harmony against
  the line it moves with ("a third above throughout, 3 minor, 3 major", parallel fifths), states the
  drum reverse rule in numbers, and calls the open-hat drop the grid's choice, not the OP-XY's; the
  replica's change lines and read_sound give envelope stages in seconds (attack 75 is about 24 s),
  read_sound says a filter that is off does nothing; a key named with a sharp spells sharps (D#
  minor); the Now line says when the project holds no notes; "how do X work?" routes to the teaching
  skill, which keeps to one idea and a demonstration; plan_steps reads a loaded sound's pages back;
  the lab's takes read back their drum lines and notes, and its writePattern takes a drum grid by
  sound name; transport's description asks for the click off before playing; the projects skill
  names the project card's buttons.
- **Probe round twenty-two (2026-10-02), 18 scenarios (`probe-scenarios-22.json`: re-checks (slides
  that glide, a fresh project, a harmony a sixth below, a two-second swell, the swing already at 0,
  three lab hat takes, how the arpeggiator works, a roll taken off, F# major) and new kinds: an open
  hat on the last sixteenth, a song built over four turns, polyphony, mono against legato, a
  question-and-answer melody, variation every fourth bar, an external synth on channel 3, Dilla
  swing, a filter opening over four bars):** the re-checks held (new project, harmony read, times in
  seconds, `none`); two failed calls (merge in the lab). Fixes: step locks shown while the replica
  plays pin the step keys first (a bar tap, as on the device), since the keys follow the playhead
  and every lock of a cutoff ramp had landed a bar early, and a show that misses names what it
  missed; write_pattern `bar` with `merge` keeps that bar's other sounds (it took the kick and hats
  of a bar given a snare fill); the lab's take read-backs now cross the worker (its message schema
  dropped them), its writePattern takes `merge`, and its change lines name drum sounds; "groove 0"
  walks to the groove amount (E3) like the plan that sets it; envelope stages take a time ("2 s");
  write_pattern `scale_steps` with key writes a harmony along the scale (a sixth below from
  copy_track); a named key spells its seven notes on seven letters (E# in F# major, Cb in Gb
  major); the groove note names the sounds it leaves straight; the Now line gives the tempo; change
  lines say first when another project opened, and name the bar menu's shape and note length; the
  midi engine's load says the unit's browser did not list it; the manual: mono and legato as the
  replica plays them (derived, the unit check pending).
- **Probe round twenty-three (2026-10-02), 18 scenarios (`probe-scenarios-23.json`: re-checks (a filter
  ramp set while playing, a fill merged into one bar, lab kick takes with merge, a 3 s swell, a third
  above by scale steps, Gb major, swung hats, a synth on channel 2, a walkthrough to groove 40) and
  new kinds: a lesson followed key by key, a busier copy, a bass too loud, a crash every 4 bars, a
  song structure at once, "what bpm is this", Daft Punk without copying, Portuguese funk carioca,
  stop and reset the tempo):** no failed calls; scale steps, Cb, times, bar merges and lab reads all
  held. Fixes: step locks while playing still landed two bars off on the real replica (the pin tap
  went to another track's one-bar pattern, which cannot switch bars): the pin now comes at the first
  lock step, on the lock's track, and a test drives the real replica's animation with the
  simulator's frames (a walkthrough of a lock while playing says to stop first); the project's midi
  page is reachable ("midi channel" with track, or "midi track 6"), and a row two pages share, named
  alone, is refused (track 6's channel set its voices); a slow attack against the notes it sounds
  under is said where notes are written and where the attack is set (a 3 s swell under 2 s notes
  never reaches full level); plan results give turns in detents, not clicks; the Now line says when
  the browser's sound is off; merge's description says a line replaces its sound's line, and bar
  with merge writes one bar's crash without a 64-mark line; the open-hat note tells the agent how to
  say it.
- **Probe round twenty-four (2026-10-02), 18 scenarios (`probe-scenarios-24.json`: re-checks (locks
  on the first step of each bar while playing, track 2 to a drum machine on channel 10, a slow
  attack under short stabs, a crash in bar 1 alone) and new kinds: kick and bass sitting together,
  scenes vs patterns, a melody made more interesting, far-away hats, a counter melody in the gaps,
  an intro adding one part every 2 bars, a kick muted by hand, wider stereo, a rounder bass with
  the notes kept, Hindi hip hop, a voice recorded as a drum, a 3-bar bass against a 4-bar beat, an
  undo, ghost notes and accents):** no failed calls; locks while playing landed on steps 1, 17, 33
  and 49. Fixes: "track 2 midi channel" (the page named last) reaches the midi page, and an unknown
  row lists the rows by page; the preset settings (shift + instrument: width, high pass, velocity
  sensitivity, portamento type, tunings, preset transpose and the mod routing, velocity → cutoff
  for accents that open the filter) are reachable by name, and a plan setting them says the
  replica's sound plays none of them but velocity sensitivity; patterns of different lengths in a
  scene are said to drift while it repeats and to line up again every so many bars, every track
  starting on its first step when the song moves on (the kick note says it drifts only when the
  lengths do not divide); a folder alone ("bass") lists its presets, and a factory preset loaded on
  the replica is said to play as its engine's starting sound (the replica knows TE's presets by
  name); a demo on the record page says the replica's take is pretend and whether it kept one (a
  real-replica test: the rehearsed step and the end screen had disagreed); a sound swapped or
  "rounder" routes to the sound skill, which now sets envelopes by time and names velocity →
  cutoff; device_status with nothing connected drops the device's clock notes; write_arrangement
  says a scene's mute rests a track too; the bars legend and merge are described.
- **Probe round twenty-five (2026-10-02), 18 scenarios (`probe-scenarios-25.json`: re-checks (a pad
  widened, accents opening the filter, a keyboard on channel 3, a 2-bar loop under a 3-bar melody in
  a song, a bassline read back to copy by hand, a half-second fade, a factory bass, a sampling demo,
  a mellower lead) and new kinds: reggaeton, 7/8, transposing everything, hats louder in bar 4 only,
  arpeggiated chords, Japanese drum and bass, saving as "night drive", a bass clash to find, "where
  am I?" after the user's own presses):** no failed calls; width, velocity routing, folder listing
  and the stand-in notes held. Fixes: save as takes the copy's name and types it on the naming
  screen (and "rename" renames), where "night drive" had saved as "project 2" and read back as set
  already (actions are never already set); the system settings are reachable (com → M1: midi clock,
  notes, active channel, keyboard velocity, pitchbend sides…), so the channel-3 keyboard's steps can
  be checked; a chord reading names a part's own chords first and what they make over another
  track's bass apart (a strings part transposed before its bass read Bm7/A for B D F#); a long amp
  release under changing chords is said where notes are written and where the release is set (a
  pad's 3.2 s tail blurred every change into sus chords); drum results list each sound's steps by
  number beside the grid; a load that changes the play mode says so; write_arrangement says when a
  song entry cuts a shorter pattern's loop off (each entry restarts every track, the same scene
  again too); the next message lists the user's own presses on the replica ("arrange, T3", "shift +
  M1", "step 5 + turn E1 +5"); the prompt asks for the user's language; envelope times read "the
  page value 16 (of 0–99)"; the music skill knows the dembow; the sound skill asks for a listen
  before and after a request about how something sounds.
- **Probe round twenty-six (2026-10-02), 18 scenarios (`probe-scenarios-26.json`: re-checks (save as
  "sunrise jam", a rename, a keyboard playing the selected track, MIDI clock out, chords moved while
  the bass waits, a lush pad's changes, a breakbeat's kick steps, a factory preset on a mono line,
  a 3-bar bass in a 4-bar song, "what did I press?") and new kinds: a dembow at 95, Korean lo-fi, a
  pad pumping with the kick, an echo in time, recording with a count-in, loosened hats, a variation
  scene, "what key is this?"):** no failed calls; typed names, the system settings, own chords first
  and the press log held. Fixes: a save shown on the real replica now arrives (project comparisons
  leave out the clocks that run on, which made every save read unsaved a frame later; a test with
  the replica's frames fails without it); the change list tells a rename and a save-as copy from
  another project opening, and a rename says what is stored; a demo that starts playback (a count-in
  shown) stops it again, where "back where it was" had played on and read as the user's playback (a
  real-replica test); read_screen names the settings page open; drum hits read by bar and beat ("2&",
  "3e"); overlapping notes on a mono track are said to cut each other; a duck from a kit that also
  plays hats says it dips on all of them; read_sound gives a delay's repeat time at the tempo; the
  groove note names the steps it moves; envelope notes give the page value, and a stage set by number
  its time (and that a lower release lasts longer); humanize's line names the sounds it moved; a
  keyboard that "sends on channel 5" no longer loads the sound skill.
- **Probe round twenty-seven (2026-10-02), 18 scenarios (`probe-scenarios-27.json`: re-checks (a save
  while playing, a count-in demo then "is it recording?", echo spacing, a bass on a syncopated kick,
  a pad ducked from a kit, a rename then a save, which hits a swing moves) and new kinds: a snare
  roll that speeds up, a 12/8 blues shuffle, the brain in D minor, exporting a wav, Spanish cumbia,
  German techno, everything but the drums turned down, darker hats alone, a song that builds and
  strips back, what M1–M4 do, punch-in fx):** no failed calls; the save arrived while playing, the
  count-in demo left the replica stopped, and the echo time was read off. Fixes: write_pattern's
  description says up front that a closed hat under an open hat is left out (seven agents learned
  it only from the result) and the note reads as a normal hat line; drum results give each sound's
  steps by number again (to write against) beside its beats; a component on a drum step two sounds
  share is said to reach both (a snare roll rolled the hat); plan_steps says when its steps switched
  an off filter on; a save says it lives in the replica's projects folder in this browser; a demo
  that stopped its own playback says so, and rehearsed steps name the transport (a count-in's second
  press reads the same screen); outside 4/4 a write gives the pattern in the meter's bars and that
  the tempo counts quarter notes; a mix-page level is the scene on screen's; merge's description
  shows how to take a sound out.
- **Probe round twenty-eight (2026-10-02), 18 scenarios (`probe-scenarios-28.json`: re-checks (a disco
  beat's hats, a bass on a broken kick's steps, hat rolls on the hats alone, darker chords, a 3/4
  waltz, chords quieter in the verse alone, a play demo, two named saves) and new kinds: afrobeat,
  Italian pop, a slow swell then double tempo, groove vs swing, syncing to Ableton, a melody fixed
  against the chords, a scene copied without the bass, a faster arp, a song's length, a beginner's
  first message):** one failed call (set_sound with no device). Fixes: set_sound's description
  leads with "connected OP-XY only"; a single-note line's reading checks it against the chords
  another track plays under it (chord tones counted, notes on a beat outside the chord named,
  off-beat ones passing notes) where an agent fixing clashes worked it out by hand; a tempo change
  re-checks every track's slow attack against its notes (set_tempo and plan_steps); write_pattern
  says writes that start from a pattern keep its step components; a save as never overwrites a
  name the folder holds; disco's tempo range; a scene's mix is the way to make a part quieter in
  one section.
- **Probe round twenty-nine (2026-10-02), 18 scenarios (`probe-scenarios-29.json`: re-checks (clashes
  between a melody and its chords, a pad sped up to 140, a bass turned down, hats changed around a
  snare roll, a save as onto a name taken, "what did I change?") and new kinds: UK garage, Dutch,
  a final chorus a whole step up, three against four, a lead down an octave, chopping a break,
  sending with no device, soft-loud hats, deep house tempo, clearing a track, a fading outro, a
  step-entry lesson):** two failed calls (the lab's writePattern had no copy, then a take-back with
  nothing to take back); the melody check named F# over G, the tempo change re-flagged the swell,
  and levels went through the key planner. Fixes: the lab's writePattern takes copy and keeps a
  pattern's locks and components through a merge or a copy (a lab merge had dropped them); its set
  says a lock lands on the pattern the track plays; a clear (no notes) keeps the pattern's bars,
  where clearing four bars of chords left one; a save as says the copy is now the open project; the
  router sends "send this to my op-xy" nowhere near the sound skill (FX words make a send); the
  groove rule sits beside plan_steps' groove; the music skill names the new project's swelling pads
  and three against four as a polymeter; a transpose carries the key the pattern was written in
  (or its reading's), "B minor (A minor moved up 2 semitones)", where G D A Bm read as D major.
- **Probe round thirty (2026-10-02), 18 scenarios (`probe-scenarios-30.json`: re-checks (a lab outro
  from copies with a closing filter, a cleared track keeping its bars, a send routed to the device
  skill alone, a swung house beat, three against four, a key change named) and new kinds: jungle,
  Polish, a snare crescendo, a mute in one scene, "what's playing now", a humanized bass, a wobble,
  a reversed fill, a factory reset question, chords read back, tap tempo, a 1-bar beat made 4):**
  four failed calls, all grid miscounts. Fixes: a grid line of whole bars and then rests, short of
  the pattern, plays its hits once and is silent after (a crash on bar 1 alone, open hats in bars
  1–3 with "...." for bar 4, were refused), and the miscount error points at a one-bar line plus
  bar and merge; reverse with bar mirrors that bar alone ("reverse just the fill"); the lab's step
  locks take a pattern (switched to and back, the scenes kept) where an outro's copies took the
  verse's locks; a slash chord's bass is spelled in the key (Gm/A# read in G minor is Gm/Bb); a
  synced LFO speed reads as a note value and a rate ("sync 2: a cycle every 2 sixteenths, an
  eighth"); a named key stays through writes that move no note (E dorian humanized read E minor);
  the music skill's three against four was wrong (a hit every four steps only doubles the beat)
  and now says an accented three-beat figure.
- **Probe round thirty-one (2026-10-02), 18 scenarios (`probe-scenarios-31.json`: re-checks (a
  crash on bar 1 alone, a fill's bar reversed, lab locks on a copy, slash chords in Bb, a wobble's
  rate, D dorian kept) and new kinds: bossa nova, Turkish, double-time hats, a chord per scene,
  accented hats read back, a filter opening across a song's second scene, a kit swap, an external
  synth on T8, "too busy", a 15-step hat, undo twice, "stop everything"):** two failed calls. Fixes:
  panic silences the replica when no OP-XY is connected (playback stopped, every note cut, release
  tails too) where it refused; the lab's writePattern takes key, and the keys its commits name reach
  the readings after; the lab's set takes an envelope stage as a time ("0.3 s"), as plan_steps does
  (one shared reading), and with pattern and area bar sets that pattern's bar menu (a program
  smoothing a song's second pattern had pressed its way onto the first); a plan_steps list that goes
  to another pattern and back counts as landed when the replica holds what the plan left on its
  copy (it read both switches as missed), real misses still named; read_pattern reads in the key
  its write named; a shorter part loops under a longer one in the readings (a one-bar bass under
  four-bar chords was heard under bar 1 alone); drum hits list their velocities; the LFO speed
  lists its sync values and says there are no triplets; make_kit says where each given voice went,
  by key number and note name; the kits skill puts TE's factory kits first (stand-ins on the
  replica), and the music skill has a bossa nova clave and a plainer double-time rule.
- **Probe round thirty-two (2026-10-02), 18 scenarios (`probe-scenarios-32.json`: re-checks (panic
  on the replica, keys named in the lab, envelope times in the lab, one scene's chords swung, a
  one-bar bass under four bars of chords, a made kit's keys, a factory kit, quarter-note-triplet
  wobble) and new kinds: Japanese lo-fi, synthwave, hats and a shaker panned apart, 7/8, a fresh
  project, an arrange lesson followed, slower at the same tempo, chords copied up as a pad, swing on
  the hats alone, phrygian chords):** two failed calls (a lab song listen from entry 0, a grid passed
  as text with code in it). Fixes: chords keep the names they were written by through later writes
  and reads (an Em7 read back as G6 after a groove change; a shadowed variable had made the keep
  path dead); a velocity given with a copy or another change of the pattern as it is sets every
  note's, and velocity alone restyles (a soft pad copied from the strings kept their 70); the lab's
  readSound gives the envelopes in seconds, and its song listen says entries and bars count from 1;
  a line shorter than the chords is checked against each pass of them (a one-bar bass under four
  bars of chords was checked against bar 1's); a song heard across parts goes through the master's
  ceiling where a part's tail overlaps the next (each part was limited alone, and the sum read as
  clipping at the change of scene), one shared limiter curve; a grid line's spare rests at the end
  are refused when a group of it is miscounted (an open hat had moved a step late); the hat note
  says to describe the hats as the grid has them (an agent read "mention it only if" as hiding
  them); the groove's other types are said to move other steps.
- **Probe round thirty-three (2026-10-02), 18 scenarios (`probe-scenarios-33.json`: re-checks
  (chord names through humanize and a read, a quieter octave-down copy, a lab swell checked in
  seconds, a lab song heard across a crash, a riff under longer chords, roll over's moved hits,
  disco hats) and new kinds: Korean house, a reggae one drop, a flute lead, an 8-bar build into a
  drop, sampling from a phone, "I can't hear anything", "make it better", a ii–V–I in Bb, bar two
  made like bar one, a drums-only intro, a save then a variation):** no failed calls. Fixes: chords
  written over lines already there read those lines against them at once (a riff's clash under
  D/F# was found only when the user asked), and the check marks a note a half step above a chord
  tone as a rub, the other outside notes as colours (a 7th, a 9th); a groove on a drum track lists
  every sound's moved steps in full (roll over's list was cut at 16); an octave doubling is no
  longer flagged for parallel octaves; off-grid offsets are listed by step, a chord's notes low to
  high, with how many stay on the grid; a save says what keeps the edits after it (autosave when
  another project opens, or save again); the chord namer knows the jazz voicings of a 13th (no
  fifth, with the ninth; the shell) and m13 (an F13 of F A E♭ G D read as no chord).
- **Probe round thirty-four (2026-10-02), 18 scenarios (`probe-scenarios-34.json`: re-checks
  (chords over a bass reading the bass, the danish groove by sound, an octave doubling, humanized
  chords' offsets, a save then an edit, rootless jazz voicings) and new kinds: Arabic hip hop, a
  trance gate, footwork, a live fill, a mute lesson followed, the top tempo, "what's on track 4", the
  drums swung and the bass straight, a corrected request, a whole-song transpose, one scene looped, a
  ride added):** two failed calls (a gated pad past 120 notes, a ride at scale 1/2 with bars 2).
  Fixes: a lesson's `instrument + T3` mute passed before the user pressed anything, since a mute
  leaves the screen as it was — the walkthrough's music mark now holds the mutes; device_status says
  whether the open project is saved as it stands or changed since its last save; off-grid offsets
  name each note; the note limit counts the chords ("48 chords of about 3 notes"); a step past the
  bars at another track scale says bars counts 16 steps; chords transposed alone say the lines under
  them are read as they stand; transpose with copy_track and key with transpose described; the
  manual states the tempo range, 40–220 BPM.
- **Probe round thirty-five (2026-10-02), 18 scenarios (`probe-scenarios-35.json`: re-checks (the
  guided mute and save, named offsets, the note limit, a ride at scale 1/2, two parts transposed,
  the tempo floor) and new kinds: Hindi hip hop, lo-fi chords with crackle, a sidechained pad, a
  song adding a part each scene, the arpeggio against maestro, reverb on the snare alone, a scene
  copied and changed, MIDI export, a harder kick, half the tempo at the same feel, a melody ending
  on its root):** one failed call (the lab's 120-note limit). The re-checks held: the guided mute
  and save each waited for the press (a guided save had passed at `project`, fixed between rounds
  with the last save in the walkthrough's mark), and device_status read the save. Fixes: the lab's
  note limit counts the chords too, and the music skill says each note of a chord counts; a
  scaled pattern's hits are named by their place in time ("2&+", the thirty-second after the "&");
  off-grid offsets give a step's length in ms; a change undone within an answer reads with its
  value now ("groove amount 0 again, not 40", where an agent read the old line as 40 again); a
  filter switched on by the steps is named by type, with a warning when it is a highpass (an
  agent darkening an epiano turned its highpass on).
- **Probe round thirty-six (2026-10-02), 18 scenarios (`probe-scenarios-36.json`: re-checks (beats
  at track scale 1/2, a swing tried and taken off, a darker epiano, hat offsets in ms) and new
  kinds: a calm beat asked in Greek, an 8 second podcast jingle, a bass on the kick, a counter
  melody, an 80s sound, hats too loud, the brain track, a guided live recording, step components
  for a ten-year-old, a song that fades out, pattern against scene, a 6/8 beat, two tracks' parts
  swapped, a beat cut to its first 2 bars):** two failed calls, both a 6/8 grid written in bars
  of sixteen. The re-checks held: scaled hits named in time, the undone swing read with its value,
  the highpass named and swapped for a ladder. Fixes: a grid miscount in another meter says its
  bar in marks ("In 6/8 a bar is 12 marks: ...... ......"), and a bar a mark short before a hit is
  a miscount, no longer "whole bars and then rests"; bars or length alone cut or lengthen a pattern
  as it is and say what went (an agent resent every note to cut four bars to two); a line between
  another's notes near its register is read as a counter-line (how many start together, the
  intervals and steps there: an agent called 7 of 20 "rarely"), a unison doubling reads as one
  ("an unison throughout"), and lines over two octaves apart go unread as voices (a hook over the
  bass's roots was flagged for parallel octaves); humanize says which sounds it took and which
  stayed, and each offset comes in ms too; an armed record says step 1 flashes red and how notes
  are played here (the mouse, the computer keyboard's Z and Q rows), and a walkthrough ending armed
  says the same (a lesson's take stayed empty); the listening skill gives one drum sound's two
  levels (velocity, the key's sample gain); the fade names its lock ("volume", shift `M2`'s) and
  sets shape; a jingle is a song with loop off (and routes the arrangement skill); swapping two
  tracks' parts is one lab program.
- **Probe round thirty-seven (2026-10-02), 18 scenarios (`probe-scenarios-37.json`: re-checks (a
  12/8 blues, a beat cut to 2 bars, a counter melody in the gaps, the snare alone humanized, a
  guided live bass take, a kick too quiet, a smooth fade, a 4 second sting, a melody and a bass
  swapped) and new kinds: funk carioca asked in Portuguese, trap hat rolls, battery life, the song's
  key, a bass at half speed, a crash once every 4 bars, chords on the off-beats, the key changed
  after the fact, saving to the computer):** two failed calls (a lab program past its 20 s, a grid
  sent as code). Held: the 12/8 grid counted right at once, the cut by bars alone, the counter-line
  reading, humanize by sound in ms, the take's keys, the drum level's two ways. Fixes: **headless
  simulators** (`HeadlessSim`: plan copies, rehearsals, lab forks, diffs, renders) hold plain state
  where the reactive one proxied every read in the browser, so the lab's locks and bar settings run
  about 20 times faster there (a fade program's 16 locks and 4 shapes: 6.5 s → 0.3 s); a song of one
  scene with loop off is a song, played once and said so (a sting read "no song: scene 1 loops");
  write_pattern's `swap` trades two tracks' parts (both agents asked to swap retyped both) and
  `rhythm` restrikes the notes on a line of marks (sixteen off-beat stabs were written by hand); a
  new pattern's locks, shape, groove and quantise are in the change lists, read_pattern gives the
  shape; a compound meter's felt beat against the tempo; a counter-line's notes between the other's
  split into held notes and rests; a cut part says the longer parts it still repeats under; a line
  moved alone says its chord reading is against the chords as they stand; every grid digit's
  velocity listed; a drum step's component reaching every sound said up front; drifts under a
  hundredth in three places; "save it to my computer" routes the app skill, which names the project
  card's download beside the device's MTP copy.
- **Open for the owner:** does a metronome-sourced duck pump on the unit with the click off (run
  sheet check p-duck); the device map names tempo `E3` "swing" where the manual says groove amount
  (rename with an alias in the key planner, then rerun the how-to eval); multiply at `accidental 9`
  (TE's table prints 3 hits, likely a slip for 9; not checked on a unit); a song of one scene with
  loop off plays once and stops on the replica (the loop setting's meaning; not checked on a unit).
- **2026-09-29/30:** Sonnet 5.5 as the default; `read_sound`, `send_project`, the demo run sheet;
  `import_midi` (a whole MIDI file as scenes and a song) after the Brother Louie failure.

## Status (2026-09-29)

- **Keys as the device draws them (2026-09-29):** the manual and the chat draw every key combo as
  the OP-XY's own keys, from the replica's art (`replica/glyphs`: `KeyCombo`, `ControlGlyph`), since
  the device prints digits and pictures, never "M3" or "T5"; the names live in tooltips and
  accessible labels. Pointing at a key rings it on the page's replica (`replicaPointer`). A new
  page, `/manual/keys` ("which key is which"), lays out every key with its name, the keyboard as
  the panel has it; the manual's prose now backticks every bare control name (150 of them), and
  the agent is asked to do the same.
- **Tonight (2026-09-28, night), all on main:** songs and scenes measured on the owner's unit (probe
  log, passive recordings): plain play runs the song from its first scene, outside song mode too; a
  scene selected while the song plays takes over at once and repeats, and one picked while stopped
  is what play starts with and repeats (Test A, a 20-bar take); the replica does both, and plain
  play runs the song. Project
  files now load each pattern's real sound (`readSoundState`, xy-format's lanes) and FX I/II. The
  site: the computer keyboard plays the replica (with hover hints), an encoder turn trail, the
  black composer deck, the metallic connect key, Hugeicons, a `/manual` site (a page per unit with a
  live replica; chat citations open it), a loop-one-scene recipe, the first Playwright e2e tests
  (now in CI) and CI green again. Sound comparison tools are ready for the next session
  (`preset_capture.py`, `compare.svelte.spec.ts`, `preset_compare.py`; QUESTIONS 15, 16).
- **Now: Phase F, faithful emulator + expert agent** (plan below, "Phase F"). The camera sessions
  (`research/59-screen-profiling.md`) showed what the device really draws. Every screen the guide art
  missed is now captured: the sequencer and player screens, the envelope editor, the aux tracks and the
  engines. We also know which pages MIDI can drive. Phase F turns that into the replica, our manual and
  the agent. It runs until the next capture session.
  - **Rebuilt from the captures** (overlays within about half a pixel): the envelope editor, the
    players, the mixer, the bar card and step popups, the octave popup, the tempo page, arrange and
    song mode, the filter and LFO pages, the auxiliary tracks, all eleven engine pages with their
    motion, and the preset browser (shift + M1 on 1.1.33, where an engine loads as one of its
    presets). What the captures leave open is in `QUESTIONS.md` and note 59 §4.
  - **The sound** follows a session recorded on the owner's unit (note 60): each filter type's
    curve and resonance (held to the device within 3.5 dB by a test), the envelopes' time laws and
    curve shapes, the LFO rates and depths, the duck, the drum key's fade-in and the 24 punch-in
    effects (worked out from recordings; a few details wait on the owner). Open: the loop
    crossfade.
  - **The agent** plans exact steps on a copy of the simulator for any page or value, auxiliary and
    mixer values included. It can read them out, play them on the replica, or walk the user through
    them one lit key at a time. It sets whole sounds and song structures up from an idea (eight tested
    recipes) and sets a
    connected device's sound over the verified CCs. A device map exported from the simulator
    (`device_map`) tells it what every page holds: encoders per layer, ranges, CCs, MIDI reach.
    Evals: how-to and idea-to-device cases pass; the regression run is 42/42 Q&A and 18/18 device
    tasks.
- **M0 research, M1 foundations: done.** Core MIDI/TE-SysEx/OP-XY data, design system + shell, device
  layer (Web MIDI, single send choke point, GREET session, mirror, monitor), `/lab`; verified by the
  owner on the live site.
- **M2 replica: done.** Built from TE's panel drawing (D9), on the home page and wired both ways:
  keyboard → notes, play/stop, track select (CC102), pitch bend; back from the device: notes (any
  octave), pitch bend, transport and a clock-driven playhead.
- **M2.5 screen & UI simulator: done.** The core plus six areas (system, sample, sequencer, mixer,
  arrange, auxiliary) cover every page TE's guide draws (35 of 53 illustrated states within 1 % of
  the art) and our own layouts for the rest; the virtual OP-XY plays in the browser (synth engines,
  drum kit, sampler engines, the sequencer's step components and locks, scenes, players, delay and
  reverb). A conformance suite written from TE's guide (68 sequencer cases so far) runs on the bare
  simulator and on the app in Chromium. The work is kept in the browser across reloads (IndexedDB).
  Open: conformance suites for the other areas (in progress), the device checks in `QUESTIONS.md`.
- **The agent on the virtual OP-XY: done.** With no device, the live tools play the replica's
  simulator in the browser; `write_pattern`, `read_pattern` and `write_arrangement` program its
  patterns, scenes and song (always, since the real OP-XY takes no patterns over MIDI), undoable and
  saved. Eval: a beat, a chord progression and a two-scene song, 3/3 exact
  (`evals/agent/RESULTS.md`).
- **Synth engines: rebuilt.** Research (`docs/research/57-synth-engines.md`) and a new synth core:
  band-limited oscillators, TPT filters and the measured envelope law, per sample in an
  AudioWorklet. All eight engines play on it (a "new engines" switch compares them with the first
  ones); 24 voices run 11× faster than real time. **Calibrated on the owner's device** (2026-09-27
  session, `90-device-probe.md`): every engine rebuilt from its measurements (note 57 §3), most
  within about 1 dB per harmonic on the measured settings. Left: the engines' screen animations
  (with the owner's camera), filters and LFOs (sent off during the session).
- **A new project's real sounds** (2026-09-27): the replica's eight tracks now load the presets the
  owner's blank project stores (`knowledge/presets/new-project.json`, `30-presets-samples.md` §11):
  engine values, envelopes, filters and LFOs with their on/off, sends, play modes, octaves, preset
  settings; engines picked without a preset start from the device's values. Older saves reset their
  sounds and keep their patterns. The sound honours the on/off switches and runs element per voice.
  Left: measuring the filters and LFOs (`QUESTIONS.md` 5); TE's drum kits and pad samples stay
  stand-ins.
- **Sequencer against the guide** (2026-09-27): players work on sequenced notes (arpeggio, maestro,
  hold); locks on empty steps and recorded automation move the notes already sounding, smoothed by
  the bar menu's shape; routed tracks move their ramps, random and tonality in the brain's key and
  follow its transposition; arming then play records at once; eleven grooves; bar E2 re-lengths
  step-entered notes; a held [-]/[+] keeps nudging. Left: punch-in FX and tape playback (need their
  own audio), locks on the channel strip (sends, volume, LFO) for sounding notes, and the
  sequencer's screens, which wait for the owner's photos.
- **M3 conductor agent: v1 done.** Opus 5.5 conductor + Sonnet 5 manual expert, typed read/ui/mutate
  tools with approvals and undo, IndexedDB threads, streaming chat with a live activity line. Evals at
  production parity: 42/42 manual Q&A, 18/18 device tasks (`evals/agent/RESULTS.md`).
- **M4 our manual: done.** 165 reworded units, 100% guide coverage, verbatim guard, search.
- **F4, the agent from idea to steps** (2026-09-28): the navigator plans exact keys and turns to any
  instrument page or value, tried on a copy of the simulator. `plan_steps` reads them out or plays
  them on the replica, one setting or a whole sound at a time. Five sound-design recipes and three
  of structure (brain routing, sampling and slicing, a song from scenes) run as written (tested),
  and every control of the device map is plannable. The how-to eval checks the virtual OP-XY's end
  state.
- **M6 native projects: the no-device part is done** (2026-09-28). `src/lib/core/xy/` is the TS port of
  kmorrill/xy-format: container, lane-aware walk, project model, reader, and a template writer that
  keeps every byte it does not own. It writes the Python library's exact bytes on 26 golden op lists
  (17 of them device captures) and reads every lane-free corpus file as the library does. `simToXy`
  (`sim/xy.ts`) compiles the simulator's project (settings, patterns, notes, components, locks, scenes, songs) over
  a template and lists what it cannot carry yet (sounds, players…). The owner's 1.1.33 blank project
  has the 1.1.4 layout. Left: the device session (note 10 §7.7), the transfer path and a UI.
- **M7 preset maker** (2026-09-28): `/presets` turns your own samples into a drum kit, multisample
  or synth sampler preset in the browser, downloads it, or installs it on a connected OP-XY over
  USB (MTP through WebUSB) once the owner confirms. `/lab` browses the unit's storage over MTP,
  read-only, the first step of M6's project read. Left: both on the owner's unit (`QUESTIONS.md`
  11, 12).
- **M8 voice** (2026-09-28): the mic key beside send talks to the agent. OpenAI's realtime model
  (WebRTC, the user's own key, `gpt-realtime-2.1` or mini) is a front desk that hands every
  request to the Claude conductor (`ask_claude`), so the request, its tools, approvals and undo
  show in the conversation, and says the answer back in short. Push-to-talk (hold the key, or
  the backquote key) and hands-free, barge-in, heard and said lines in the chat, spoken
  approvals checked against what the user said (`research/71-voice.md`). Live: the app's
  session mints on both models and a text round trip hands questions to Claude and approvals to
  the user. Left: the owner's try with a real mic (`QUESTIONS.md` 14).
- **M9 listening loop: built, not yet heard on the unit** (2026-09-28, note 61). `listen` records
  the OP-XY's USB audio (or the virtual OP-XY in the browser) and returns what it heard: loudness,
  tone against pink noise, stereo, tempo against the set tempo, timing and swing, where the kicks,
  snares and hats sit, key and chords, and flags such as clipping or off-tempo; `listen_tracks` hears
  each instrument track alone and puts every mute back (on a device only when the app knows them
  all). The conductor is told to listen, critique and revise. Left: the device session (note 61 §9).
- **Next:** T28 with the owner (track MIDI channels → notes out), then M5 composer + live playback and
  the M6 device session. M6 continues by **reading the current project over WebUSB-MTP**: it is the
  only way the replica can load what is on the device (steps, tempo, sounds), since the device never
  reports its knobs or keys over MIDI; `readProject` now decodes what such a pull returns.
- **Device facts (1.1.33):** CC80 = 2 × BPM (40–220), CC9 level mute, CC102/104/105 work, remote keys
  CC106/107 dead; with clock = both it sends FA/FC and continuous F8; notes and pitch bend go out only
  from tracks the project gives a MIDI channel (all off in a fresh project); keys, M-keys and encoders
  only in controller mode. USB audio capture works; MTP (vendor class, PID 0x0021) is readable from our
  own code; the `.xy` header bumped on 1.1.33 (`09 14 07 86`).

## What the research changed

The initial plan was "an agent that sends MIDI". The research turned that into five control planes,
each with a clear job:

| Plane                                       | What it gives us                                                                  | Status on the owner's 1.1.33 unit                                                                 | Research                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Live MIDI** (notes, CC, transport, clock) | play, mix, tempo, scenes, project load, engine/filter/envelope params per track   | ports present; CC map mostly community, needs probing                                             | [20](research/20-midi-control.md)                                   |
| **Remote keys** (CC106/107)                 | press any front-panel key from the computer → the replica drives the real UI      | unknown on 1.1.33 (worked ≤1.0.21 and on 1.1.4) — **spike**                                       | [20 §7](research/20-midi-control.md)                                |
| **TE SysEx** (GREET, FILE)                  | exact firmware version; a filesystem over MIDI with writable `drum/` and `synth/` | **verified** GREET/ECHO/FILE LIST; FILE PUT untested                                              | [60 §4](research/60-firmware.md), [90](research/90-device-probe.md) |
| **Native `.xy` projects**                   | the device's own sequencer: notes, p-locks, step components, scenes, songs        | TS codec + compiler done; the 1.1.33 blank = 1.1.4 layout; authored files untested; transfer open | [10](research/10-xy-format.md)                                      |
| **Presets / samples** (`patch.json` + WAV)  | AI-made drum kits and instruments                                                 | well understood; install path = FILE PUT (spike) or MTP                                           | [30](research/30-presets-samples.md)                                |
| **USB audio**                               | the agent can listen to what the OP-XY plays                                      | class-compliant UAC1 input; capture + analysis built (M9), not yet tried from the browser         | [61](research/61-listening.md), [90](research/90-device-probe.md)   |

Not possible: decompiling firmware (AES-encrypted Blackfin images; key only on device).

## Architecture

Browser-only (static SvelteKit). No backend; users bring their own keys.

```text
┌──────────────────────────────── browser ────────────────────────────────┐
│ UI  replica (digital twin) · agent panel (chat · plan · approvals ·      │
│     revisions · cost) · manual browser · onboarding · device console     │
│                     ▲ state / events             │ intents               │
│ Agent  conductor (Claude via @anthropic-ai/sdk) + subagents              │
│        manual-expert · composer · sound-designer · device-operator       │
│        tools: read / ui / propose / mutate (mutate = approval-gated)     │
│        journal (undo) · memory + threads (IndexedDB) · skills            │
│ Voice  OpenAI realtime (WebRTC) front-end ── ask_claude ──► conductor    │
│                                                                          │
│ Core (pure TS, no DOM, exhaustively tested)                              │
│   midi/     codec, SMF, note/CC tables          (port from MIDI Lab)     │
│   te/       TE SysEx codec + client + DFU deny-list                      │
│   opxy/     controls, CC map, remote keys, device model, firmware profile│
│   music/    SongIR (zod), theory, arranger, MIDI-file import             │
│   xy/       .xy RLE + image map + writer        (port of xy-format, MIT) │
│   presets/  patch.json builder, slicer, pitch detect                     │
│   manual/   schema, loader, search (MiniSearch)                          │
│ Device (browser APIs)                                                    │
│   transport: Web MIDI + safety gate (deny-list, rate limits, echo        │
│   filter, single-flight queue, panic) · session (identity, GREET,        │
│   capabilities) · scheduler (Worker clock, lookahead, paired note-offs)  │
│   · files (TE FILE; MTP later) · audio (getUserMedia on USB audio)       │
└──────────────────────────────────────────────────────────────────────────┘
      Web MIDI / USB ◄──► OP-XY          HTTPS ◄──► api.anthropic.com / api.openai.com
```

Principles (from `VISION.md`): the LLM emits typed intent, deterministic code emits bytes; every
device change is **propose → preview on replica → approve → apply → verify → journal**; firmware is
first-class state; nothing dangerous (DFU, factory reset, project delete) exists as a tool.

## Phase F — Faithful emulator + expert agent (from 2026-09-28)

Goal, in the owner's words: "the smartest possible agent when it comes to doing things on OP-XY".
At the least it shows the user how to do things; beyond that it breaks an idea into the right steps
and helps set complicated things up. And "a perfect emulator where we pretty much 100% copy the
device". The bar is that Teenage Engineering is impressed.

Sources, in order of authority: the device captures (note 59, `research/device/captures/`), then
TE's guide and changelog, then community findings. When the device and the guide disagree, the device
wins and our manual says so.

### F1 — Capture data you can build against

- [x] Tools committed (`camera.command`, `screencap.py`, `envsweep.py`, `stepcap.py`, `envfit.py`),
      note 59, probe log.
- [x] `screencap.py realign`: re-rectify every capture from its raw frame with per-frame drift
      correction (phase correlation on the device body, then ECC). Writes `captures/aligned/` plus
      an index of each frame's drift and match. (The index of page, track and CC state is note 59
      §5.)
- [x] `icontrace.py`: pictograms traced off the aligned frames into
      `knowledge/opxy/device-icons/` for pages TE never drew. `scripts/device-compare.mjs` overlays
      simulator frames on captures and measures the gap.
- [ ] A reference set per page (the best aligned frame of each state) for the tests in F2.

### F2 — The emulator matches the device

Each page is rebuilt from its captures and pinned by a test against a reference image. Order: what the
owner flagged, then what users see most.

1. [x] **Envelope editor:** two envelopes, five handles, drop lines, the amp/filter labels, the
       measured handle positions and curve shapes. Release is a handle position (higher = shorter),
       also in the sound and in stored presets.
2. [x] **Players:** the off state; arpeggio (and its shift layer); hold; maestro; the selection list.
       The list steps on each further press of `player` with shift held. Speeds run from 1/4 to 1/64
       with triplets. The bars rise by pitch rank. Maestro keeps 8 notes.
3. [x] **Bar card** (mini piano roll, bar row, clear labels) and the **step popups** (number box,
       copied, orange while locking, locked values in the top bar). The card is an overlay on the
       page it covers; a held step copies during the hold. Left: the roll's pitch scale (one pixel
       per semitone is ours) and the aux tracks' popups.
4. [x] **Octave popup** (piano plus ±N, "+0", fades).
5. [x] **Mixer:** the FX I/II send overlay, the EQ scene, the saturator ladders, the master page.
       Left: the core M1 strips under the popup (level bar thickness, dark numbers on light
       strips, pan dot position); the VU needle's motion with sound.
6. [x] **Replica polish:** encoder turn arrows that show the real direction (or nothing), and a darker
       body that matches the unit rather than the milky one.
7. [x] **Filter** (types, off, envelope hatch, key-tracking arrow, a type pick returning to M1, shift
       sends) and **LFO** (five types, off). Left: the synced speeds past the four seen, the LFO
       envelope's sign, and decoding a stored destination as six choices.
8. [x] **Arrange and song mode** (footer labels, pattern column, scene box, 32-slot song grid).
       Left: the cross-fades and slides (b1-741, b1-852).
9. [x] **Tempo** (metronome weight by BPM, groove slider, speaker waves, pendulum). Left: what
       turns the jack black and how E4's click treats the level.
10. [x] **Engine pages:** top-bar styles, each engine's picture and its motion (all eight synth
        engines drawn from the captures, moving while notes sound; the three sampler engines' pages
        and shift layers); the preset browser (engine and category views, the view popup, the user
        footer, the device's factory library; saves move to version 6). Left: how 1.1.33 reaches the
        midi engine (listed last here, ours) and the sampler's fade and crossfade sounds.
11. [x] **Aux tracks:** brain M1/M2 (slide), external MIDI (CC slots, LFO), external CV (meter),
        external audio (signal flow), tape, FX I/II (four columns per type); punch-in (the idle
        heartbeat; one still frame per key). Left: the punch-in animations in motion.
12. [x] **Behaviour:** the MIDI reach table (sampler M1 and CV ignore CCs) is in the manual and
        `set_sound` keeps to the verified lanes (the simulator itself takes no CCs); the value
        formats read off the captures are in (tape %, drive 0–20, bank/program crossed at 0, brain
        link, prism ratio steps, the delay's note values, the filter's 0–99 envelope amount).

### F3 — Knowledge

- [x] Manual units updated with what the device showed, marked `verified_on: 1.1.33`: 56 units. They
      cover the envelope semantics, the filter type pick, the MIDI reach, the FX labels per type, the
      aux pages, the value ranges, the player pages and each engine's picture. Contradictions fixed:
      epiano's E3 is tine and E4 punch; the delay's first label is size; the samplers ignore
      CC 12–15.
- [x] `knowledge/midi/cc-map.json`: lanes seen working marked verified, with their display ranges.
      Filter cutoff, tape length and EQ channel 1 are held back by tests that pin them.
- [x] Screen descriptions the agent can use ("what will I see?"): generated from the simulator's pages
      and checked against the captures. Each page of the device map (F4) carries what its screen
      says, with the note-59 section it was rebuilt from; a test holds the map to what the captures
      showed (value lists, ranges, labels, MIDI reach).

### F4 — The agent: from idea to steps

- [x] **Device map:** exported from the simulator. For each page it records how to reach it, the
      parameters per encoder and layer, ranges and formats, the CC lane, and whether MIDI can set it.
      It is data, so the agent never has to guess a key combo. `knowledge/opxy/device-map.json`
      (65 pages, 336 controls, each found by turning it on a copy) from
      `scripts/build-device-map.mjs`; a test fails while it is stale; the agent reads it with
      `device_map`. Every one of its 280 turns names the `plan_steps` parameter that sets it.
- [x] **Navigator** (`src/lib/sim/navigator.ts`): a deterministic path from the replica's current
      state to any page or parameter value, as key presses and encoder turns. Every plan runs on a
      copy of the simulator before it is returned. It covers instrument pages and their shift layers,
      the envelopes, the lists (engine, filter type, LFO type, switching an off module on), tempo,
      mix, arrange and the players; `planSettings` sets several parameters in a row. Values on the
      auxiliary and mixer pages are found by name from the page's description: the navigator turns
      each encoder on a copy to see which one moves the value, so no table has to list them.
      Since 2026-09-28 it plays the whole key grammar (`shift + player → + player` picks the hold
      and maestro players) and reaches what the map listed as out of reach: drum keys' and the
      samplers' settings (by key), values the frame draws but the description leaves out (the
      brain's mode, link and routing, the aux LFOs' speed, CC slots, the arpeggio's play order,
      maestro's hold, COM, the record page), and values set with keys of their own (a preset by
      name, an FX track's effect, arrange's pattern, scene, song and loop, slicing a drum key, the
      bar menu's track scale and bars).
- [x] **Tools:** one `plan_steps` tool gives the exact steps for a page, a value or several
      settings. With `show` it walks the replica through them, step by step, so the virtual OP-XY
      ends up there. `set_sound` sets a connected device's sound parameters over the lane CCs
      verified on 1.1.33, with approval and undo when the app knows the value before.
- [x] **Recipes:** five sound-design recipes (`howto.sidechain-duck`, `pluck`, `pad-swell`,
      `wobble`, `acid-bass`) and three of structure: brain routing (`howto.song-with-brain`),
      sampling and slicing (`howto.slice-a-loop`) and a song from scenes
      (`howto.song-from-scenes`). Their steps carry machine-readable settings (with `area`, a value
      of another page), and `src/lib/sim/recipes.spec.ts` runs every recipe on a new project as
      `plan_steps` would. The pluck and the pad take their values from a new project's factory
      plucks, strings and pad; no factory sound with known values backs the acid bass, wobble or
      duck. Left: recording itself (held `M1`, time-based) stays prose.
- [x] **Evals:** `evals/agent/howto.mjs` checks how-to answers and idea-to-device set-ups against the
      simulator's end state, screen questions asked from elsewhere on the replica, walkthroughs and
      engine changes through the preset browser, and the structure recipes, a drum key and the
      player list (25 cases).

### F5 — Next capture session (with the owner)

The list is in note 59 §4: step components, recording, the system pages, the drum track's pages,
mute/solo, sounds over USB audio (punch-in, tape, filters, LFOs, envelope times). Calibrate on the
tempo page and check every ~30 minutes.

## Milestones

Sized in focused sessions, not calendar time. Each milestone ends with a commit + push and a
Status update here.

### M0 — Research & knowledge ✅ (wrapping up)

Notes 00–90, CC/remote-key/SysEx/firmware/patch-schema data in `knowledge/`, manual scrape (local),
probe scripts, decisions D1–D3, index. Remaining: owner decisions in `QUESTIONS.md`.

### M1 — Foundations

- Repo layout for `src/lib/{core,device,agent,replica,manual,voice}`; lint/test/CI (GitHub Actions:
  lint, check, unit) and GitHub Pages deploy (pattern from MIDI Lab).
- Core: MIDI codec (port MIDI Lab with its 18 known defects fixed), TE SysEx codec/client with DFU
  deny-list (tests from `60-firmware.md` §4.3 vectors), CC map + remote-key loaders from
  `knowledge/midi/*.json`.
- Device: Web MIDI access (SysEx permission flow, hot-plug, Chrome 152 macOS bug detection), safety
  gate, echo filter, session (identity + GREET → firmware profile), panic, fake OP-XY for tests.
- `/lab` dev console: connect, GREET, monitor, send CC/notes, FILE browser (read-only).
- Design system v0: TE tokens (palette, type scale, spacing), fonts (open-licensed equivalents).
- **Device spikes with the owner** (each announced, logged in `90-device-probe.md`):
  1. CC basics on 1.1.33: tempo (CC80 scaling), mute (CC9), volume (CC7), scene (CC85), project (CC86).
  2. Remote keys CC106/107 on 1.1.33 (decides how much of the UI the replica can drive).
  3. Transport + clock out (Start/Stop, F8, no SPP).
  4. FILE PUT → where does a file in `drum/` show up? then DELETE.
  5. MTP mode: USB descriptors + whether Chrome WebUSB can open it; blank 1.1.33 project capture.
  6. USB audio capture of the OP-XY output.

### M2 — Replica v1

Pixel-accurate, interactive **SVG** digital twin (D5), **built from TE's own guide line drawing**
(D9: segment the 740 × 265 panel SVG into per-control shapes keyed by `controls.json`), screen on a
canvas at 480 × 222, no wordmarks (D6): every key,
encoder, LED and label; screen renderer shell; shift layers; mirrors inbound MIDI (notes, clock,
transport); drives the device (notes, CC, remote keys if available); keyboard/touch input;
"animate procedure" API (`animate("shift + M1")`) used by the manual and the agent.

### M2.5 — Screen & UI simulator (D10)

Our own behavioural simulator of the OP-XY interface (modes, pages, shift layers, parameters) and a
screen renderer matching the real 480 × 222 display, built from TE's guide screen illustrations (and
the screen font extracted from them), the manual and device checks. Firmware emulation is impossible
(encrypted). The replica becomes a virtual OP-XY; connected, it syncs tempo/play state/sent-state.

### M3 — Agent v1: teach + control

- Keys screen (provider detected by key prefix; stored locally; never sent anywhere but the provider).
- Conductor harness on `@anthropic-ai/sdk` (D4) with streaming chat UI, plan (`write_todos`),
  approvals sheet, revision timeline + undo, cost meter.
- Manual Q&A: whole manual in a cached system prompt + `search_manual` with citations +
  `show_on_replica` (animated key combos).
- Live-control tools: transport, tempo, groove, mute/solo, volume/pan, scene, project load, engine /
  filter / envelope params, play notes/chords — all through the device queue and approval policy.

### M4 — Our manual (parallelisable from M2 on)

~170 reworded units per the schema in `40-official-docs.md` §8: `knowledge/manual/units/**`,
`controls.json`, changelog digests; zod validation; verbatim-run guard (no 8+ word copies);
coverage test (every guide section maps to ≥1 unit); firmware tags; units checked on the device get
`verified_on: 1.1.33`. Then the app ships our manual instead of the local scrape.

### M5 — Composer + live playback

`SongIR` (song → scenes → patterns → tracks → steps, p-locks, components; pinned conventions),
theory helpers, MIDI-file import, arranger that respects OP-XY limits (8 instrument tracks, drum key
map, 16 patterns/track, scenes, songs), Worker-clocked scheduler with paired note-offs and panic,
audition on the device. Demo: "Brother Louie, multi-scene" and "Moonlight Sonata" played live.

### M6 — Native projects (commit to device)

TS port of `xy-format` (~3k lines; golden tests against the upstream corpus + Python outputs),
`SongIR → .xy` compiler, device verification on 1.1.33 (header, 16 patterns), transfer path (MTP /
Field Kit first; WebUSB-MTP if the spike allows), load via CC86. Upstream the corrections we found
to `kmorrill/xy-format`.

- [x] Codec (`src/lib/core/xy/`): container and RLE, lane-aware walk, project model, `readProject`,
      `writeProject` over a template (1.1.4 or 1.1.33). Fixtures and goldens from the Python library
      (`scripts/xy-fixtures.py`); the full upstream corpus runs locally (note 10 §7.7).
- [x] Simulator → `.xy`: `simToXy(state, template)` with a `skipped` list; the agent's patterns,
      scenes and songs compile note for note. (SongIR does not exist yet: the simulator's model is the
      source.)
- [ ] Device session on 1.1.33: authored files over both templates, 16 patterns, the cutoff lock's
      union mask, save-as round trips (note 10 §7.7).
- [ ] Sounds in the writer: sound block words, presets by donor copy with octaves, drum regions.
- [x] `.xy` → simulator: `xyToSim` (`sim/xy.ts`) loads settings, patterns (notes, components,
      locks), scenes, songs, each track's preset from the library and the mixer; a loaded file
      written again comes back byte for byte (the owner's 1.1.33 project included), and locks in
      columns the replica cannot show stay in the file.
- [x] Transfer (2026-09-28): the caption line's "project" card opens a `.xy` from disk, downloads the
      replica's project, loads the project the OP-XY has open over USB (MTP), and adds the replica's
      project to `projects/user` written over the device's open project (its sounds stay), after a
      confirming click; loads can be undone (`app/project-transfer.svelte.ts`). Tried on an emulated
      unit only (`QUESTIONS.md` 13).
- [x] The unit's own samples (2026-09-29): `readProject` reads each sample engine's 24 regions
      (note 10 §3.5) and `xyToSim` puts them on the drum keys, the sampler and the zones with the
      path as the file id. A project loaded from the OP-XY brings the samples on its drive in the
      same MTP session (lists and reads only, each folder listed once), decoded and handed to the
      replica's sound (`app/device-samples.ts`); TE's factory library (`content/samples/…`) is not
      on the drive, so those sounds stay stand-ins. A file that is missing, not WAV/AIFF or bigger
      than 20 s of 96 kHz float stereo is listed and skipped; a broken connection ends the reading.
      Read files are kept in IndexedDB by path and come back on reload, undo or a `.xy` from disk.
      Left: drum-key settings from the regions (gain, pan, play mode, tune), per-pattern kits, and
      a try on the owner's unit.
- [ ] CC86 load; agent tools for load and save (they need the device's USB permission already
      granted, since only a click may ask for it).

### M7 — Sounds

Preset builder (drum + multisample `patch.json`), slicer (transients, zero crossings), pitch detect,
generated sources; install via FILE PUT if the spike confirms it, otherwise export for Field Kit.

- [x] **Preset maker** (`/presets`, `src/lib/presets`, 2026-09-28): a drum kit, multisample or
      synth sampler from your own WAV, AIFF or anything the browser decodes. Drum hits land on TE's
      factory key layout by name; roots come from `smpl`, `INST`, a note in the name or pitch
      detection (YIN); sustained samples get loop points and a crossfade. Samples are written as the
      device writes them (16-bit, 44.1 kHz, `smpl` root), names and path lengths follow note 30 §3.5,
      and the preset downloads zipped for field kit / MTP. Not yet loaded on a unit (`QUESTIONS.md`
      11).
- [ ] Try the presets on the owner's device; an agent tool that builds one from a request.
- [x] **Slicer** (2026-09-28): a loop cut at its hits (spectral flux, refined where the level jumps,
      each start just before the hit and on a zero crossing when one is near) or into 8/16/24 equal
      parts; the slices go on f3 upwards and choke each other, as the device's slicer sets them.
- [x] **Generated sources** (2026-09-28): sixteen drum-machine voices from typed parameters
      (`core/presets/generate.ts`: kick, snare, clap, hats and cymbals from six squares, toms, congas,
      cowbell…), whole kits in five styles on TE's key order, a "generate a kit" control in the preset
      maker, and the agent's `make_kit`, which leaves a kit it describes in the preset maker.
- [x] **Install over USB** (MTP through WebUSB, 2026-09-28): `core/mtp` (session, policy, installer)
      and `device/mtp` (WebUSB pipe); the preset maker says what it will add and where, and writes
      only after the click. Never deletes, moves or replaces. Tested on an emulated unit only.
- [ ] FILE PUT over SysEx, after the spike (`QUESTIONS.md` 1).

### M8 — Voice

OpenAI realtime (WebRTC) as the voice front-end delegating to the Claude conductor via
`ask_claude`; push-to-talk and hands-free; barge-in; spoken confirmations for approvals.

- [ ] **Move to GPT-Live-1** (`gpt-live-1`, generally available since 2026-09-10; the owner asked,
      parked until voice comes back): full duplex, better tool calling, built to sit in front of
      a backend agent (ours: the conductor). It runs on its own endpoint (`v1/live/sessions`),
      not the Realtime API, so it needs a new session and transport layer; $0.05 a minute.

- [x] **Protocol** (`src/lib/core/voice`, 2026-09-28): the session the app mints (instructions,
      turn taking, `gpt-live-transcribe` with the device's words, three tools), the realtime
      events, and a pure state machine for push-to-talk, hands-free, barge-in, tool outputs and
      transcript lines. Verified against the live API (`evals/voice/smoke.mjs`, note 71 §8).
- [x] **Call** (`src/lib/voice/rtc.ts`): microphone first (never the OP-XY's own input), a 120 s
      client secret minted with the user's key, the WebRTC call and its events channel.
- [x] **Delegation** (`src/lib/voice/bridge.ts`): `ask_claude` is a normal user turn marked voice;
      it returns Claude's answer as speakable sentences, a waiting approval, or "working" (then an
      update); `stop_claude`; spoken approvals through the sheet's own `decide`, counted only on
      the user's own clear yes after the question.
- [x] **UI**: the mic key (hold it, or the backquote key; LED red while the mic is live, breathing while it
      connects or thinks), the voice strip (state, hands-free switch, cost, end), heard and said
      lines in the conversation, the realtime model in settings.
- [ ] The owner's try with a real mic (`QUESTIONS.md` 14); a microphone and voice picker.

### M9 — Listening loop

Capture USB audio; onset/tempo/loudness/spectrum analysis; sequential stem bounce (mute/solo via
CC9); the agent critiques and revises what it hears.

- [x] **Analysis** (`src/lib/core/listen`, note 61): loudness after BS.1770 with gating and range,
      peaks and clipping, tone against pink noise, stereo and a mono low end, onsets, tempo against
      the set tempo, the grid with swing and tightness, the drum picture, key and chords, silence and
      dropouts, and a summary with flags; tested on synthetic signals with known answers.
- [x] **Capture** (`src/lib/device/listen`): the OP-XY's input (only it) or the replica's master
      (`AppSound.listenTap()`), an AudioWorklet recorder, the analysis in a worker; Chromium tests.
- [x] **Tools**: `listen` (read) and `listen_tracks` (the sequential stem take, approved, every mute
      put back; on a device only when the app knows all eight mutes); the prompt's critique loop;
      a listening light in the agent panel.
- [ ] With the owner's unit: the input's name and rate in Chrome, latency, loudness of a reference
      project, tempo and chords on real material; a bar-synchronous take for `listen_tracks`.

### M10 — Launch

Onboarding wizard (capability probe from `20-midi-control.md` §9.2), docs site, demo videos,
accessibility pass, performance budget, attribution/licences, contributing guide, releases.

## Device test backlog

Authoritative lists: `90-device-probe.md` (pending tests), `20-midi-control.md` §11 (34 MIDI tests
with bytes and risk flags), `10-xy-format.md` §8, `30-presets-samples.md` (PUT plan). Every test is
announced to the owner first if it changes device state.

## Risks

| Risk                                                   | Impact                                 | Mitigation                                                                                 |
| ------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------ |
| Remote keys disabled on 1.1.33                         | replica can't drive device menus       | CC/notes for params; `.xy` for programming; show-don't-press guidance                      |
| `.xy` layout changed on 1.1.33 / 16 patterns misbehave | native commit breaks                   | capture blank 1.1.33 project first; golden + device tests; keep ≤9 patterns until verified |
| No project transfer over MIDI                          | "commit to device" needs Field Kit/MTP | guided transfer UX; WebUSB-MTP spike                                                       |
| Web MIDI only in Chromium/Firefox (not Safari)         | reach                                  | clear browser gate; everything else still works                                            |
| Copyright / trademark                                  | project health                         | our own manual (D2), own-drawn replica, no TE photos/fonts shipped, nominative naming      |
| LLM musical accuracy (e.g. real songs)                 | wrong notes                            | MIDI-file import path; theory validators; audition + listening loop                        |
