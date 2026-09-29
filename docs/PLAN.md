# OP-XY Agent — Plan

> Living roadmap. North star: [`VISION.md`](VISION.md). What we know: [`research/INDEX.md`](research/INDEX.md).
> Decisions: [`DECISIONS.md`](DECISIONS.md). Questions for the owner: [`QUESTIONS.md`](QUESTIONS.md).
> Update the **Status** block whenever a milestone moves.

## Status (2026-09-28)

- **Tonight (2026-09-28, night), all on main:** songs and scenes measured on the owner's unit (probe
  log, passive recordings): plain play runs the song from its first scene, outside song mode too; a
  scene selected while the song plays takes over at once and repeats (the replica does the same;
  whether a scene picked while stopped changes where play starts is Test A, pending). Project
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
