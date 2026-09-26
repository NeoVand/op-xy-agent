# OP-XY Agent — Plan

> Living roadmap. North star: [`VISION.md`](VISION.md). What we know: [`research/INDEX.md`](research/INDEX.md).
> Decisions: [`DECISIONS.md`](DECISIONS.md). Questions for the owner: [`QUESTIONS.md`](QUESTIONS.md).
> Update the **Status** block whenever a milestone moves.

## Status (2026-09-26, evening)

- **M0 research: done.** **M1 foundations: done** — core MIDI/TE-SysEx/OP-XY data (1,042 tests), design
  system + shell, device layer (Web MIDI, single send choke point, GREET session, mirror, monitor) and
  `/lab`; verified by the owner on the live site: connect, play/stop, mute work on the real OP-XY.
- **M2 replica: built** from TE's panel drawing (D9; 0.02 mm fit, all 588 paths), `/replica` dev page.
  In progress: replica ⇄ device bridge on the home page.
- **In progress:** M3 conductor agent (Anthropic SDK harness, tools, approvals, undo, chat UI) and M4
  manual tooling + exemplar units (then a fan-out to write ~170 units).
- **Device session 1 facts:** CC80 = 2 × BPM (40–220), CC9 level mute, CC102/104/105 work, remote keys
  CC106/107 dead on 1.1.33, USB audio capture works, MTP (vendor class, PID 0x0021) readable from our own
  code, `.xy` header bumped on 1.1.33 (`09 14 07 86`).

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
