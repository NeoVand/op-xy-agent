# OP-XY Agent — Plan

> Living roadmap. North star: [`VISION.md`](VISION.md). What we know: [`research/INDEX.md`](research/INDEX.md).
> Decisions: [`DECISIONS.md`](DECISIONS.md). Questions for the owner: [`QUESTIONS.md`](QUESTIONS.md).
> Update the **Status** block whenever a milestone moves.

## Status (2026-09-28)

- **Now: Phase F, faithful emulator + expert agent** (plan below, "Phase F"). The camera sessions
  (`research/59-screen-profiling.md`) showed what the device really draws. Every screen the guide art
  missed is now captured: the sequencer and player screens, the envelope editor, the aux tracks and the
  engines. We also know which pages MIDI can drive. Phase F turns that into the replica, our manual and
  the agent. It runs until the next capture session.
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
- **M4 our manual: done.** 163 reworded units, 100% guide coverage, verbatim guard, search.
- **F4, the agent from idea to steps** (2026-09-28): the navigator plans exact keys and turns to any
  instrument page or value, tried on a copy of the simulator. `plan_steps` reads them out or plays
  them on the replica, one setting or a whole sound at a time. Five sound-design recipes run as
  written (tested). The how-to eval checks the virtual OP-XY's end state.
- **Next:** T28 with the owner (track MIDI channels → notes out), then M5 composer + live playback and
  M6 native projects. M6 starts by **reading the current project over WebUSB-MTP**: it is the only way
  the replica can load what is on the device (steps, tempo, sounds), since the device never reports
  its knobs or keys over MIDI.
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
| **Native `.xy` projects**                   | the device's own sequencer: notes, p-locks, step components, scenes, songs        | format well understood (device-validated on 1.1.4); nothing checked on 1.1.33; transfer path open | [10](research/10-xy-format.md)                                      |
| **Presets / samples** (`patch.json` + WAV)  | AI-made drum kits and instruments                                                 | well understood; install path = FILE PUT (spike) or MTP                                           | [30](research/30-presets-samples.md)                                |
| **USB audio**                               | the agent can listen to what the OP-XY plays                                      | class-compliant UAC1 input; untested                                                              | [90](research/90-device-probe.md)                                   |

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
7. [ ] **Filter** (types, off, envelope hatch, key-tracking arrow, a type pick returning to M1, shift
       sends) and **LFO** (five types, off).
8. [x] **Arrange and song mode** (footer labels, pattern column, scene box, 32-slot song grid).
       Left: the cross-fades and slides (b1-741, b1-852).
9. [x] **Tempo** (metronome weight by BPM, groove slider, speaker waves, pendulum). Left: what
       turns the jack black and how E4's click treats the level.
10. [ ] **Engine pages:** top-bar styles, each engine's picture and its motion; sampler pages and their
        shift layers; the preset browser.
11. [ ] **Aux tracks:** brain M1/M2 (slide), external MIDI (CC slots, LFO), external CV (meter),
        external audio (signal flow), tape, FX I/II (four columns per type); punch-in animations.
12. [ ] **Behaviour:** the MIDI reach table (sampler M1 and CV ignore CCs); value formats read off the
        captures (tape %, drive 0–20, bank/program crossed at 0, brain link, prism ratio steps).

### F3 — Knowledge

- [x] Manual units updated with what the device showed, marked `verified_on: 1.1.33`: 56 units. They
      cover the envelope semantics, the filter type pick, the MIDI reach, the FX labels per type, the
      aux pages, the value ranges, the player pages and each engine's picture. Contradictions fixed:
      epiano's E3 is tine and E4 punch; the delay's first label is size; the samplers ignore
      CC 12–15.
- [x] `knowledge/midi/cc-map.json`: lanes seen working marked verified, with their display ranges.
      Filter cutoff, tape length and EQ channel 1 are held back by tests that pin them.
- [ ] Screen descriptions the agent can use ("what will I see?"): generated from the simulator's pages
      and checked against the captures.

### F4 — The agent: from idea to steps

- [ ] **Device map:** exported from the simulator. For each page it records how to reach it, the
      parameters per encoder and layer, ranges and formats, the CC lane, and whether MIDI can set it.
      It is data, so the agent never has to guess a key combo.
- [x] **Navigator** (`src/lib/sim/navigator.ts`): a deterministic path from the replica's current
      state to any page or parameter value, as key presses and encoder turns. Every plan runs on a
      copy of the simulator before it is returned. It covers instrument pages and their shift layers,
      the envelopes, the lists (engine, filter type, LFO type, switching an off module on), tempo,
      mix, arrange and the players; `planSettings` sets several parameters in a row. Values on the
      auxiliary and mixer pages are found by name from the page's description: the navigator turns
      each encoder on a copy to see which one moves the value, so no table has to list them.
- [x] **Tools:** one `plan_steps` tool gives the exact steps for a page, a value or several
      settings. With `show` it walks the replica through them, step by step, so the virtual OP-XY
      ends up there. `set_sound` sets a connected device's sound parameters over the lane CCs
      verified on 1.1.33, with approval and undo when the app knows the value before.
- [x] **Recipes:** five sound-design recipes (`howto.sidechain-duck`, `pluck`, `pad-swell`,
      `wobble`, `acid-bass`). Their steps carry machine-readable settings, and
      `src/lib/sim/recipes.spec.ts` runs every recipe on a new project. Left: brain routing,
      sampling and slicing, and a song from scenes as runnable recipes (the prose units exist), and
      values taken from the factory presets.
- [x] **Evals:** `evals/agent/howto.mjs` checks how-to answers and idea-to-device set-ups against the
      simulator's end state, and screen questions asked from elsewhere on the replica (12 cases).

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

### M7 — Sounds

Preset builder (drum + multisample `patch.json`), slicer (transients, zero crossings), pitch detect,
generated sources; install via FILE PUT if the spike confirms it, otherwise export for Field Kit.

### M8 — Voice

OpenAI realtime (WebRTC) as the voice front-end delegating to the Claude conductor via
`ask_claude`; push-to-talk and hands-free; barge-in; spoken confirmations for approvals.

### M9 — Listening loop

Capture USB audio; onset/tempo/loudness/spectrum analysis; sequential stem bounce (mute/solo via
CC9); the agent critiques and revises what it hears.

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
