# Architecture & code conventions

> How the code is organised and the rules every contributor (human or agent) follows. The product
> architecture and roadmap are in [`PLAN.md`](PLAN.md); decisions in [`DECISIONS.md`](DECISIONS.md).

## Layers

```text
src/lib/
  core/        PURE TypeScript. No DOM, no Svelte, no window/navigator, no Web MIDI, no timers
               unless injected. Deterministic, exhaustively unit-tested in Node.
    midi/      MIDI 1.0 messages, parser/encoder, notes, constants, SysEx helpers, SMF, event bus
    te/        TE SysEx protocol: packed-7 codec, framing, commands (GREET, ECHO, FILE…),
               transport-agnostic request/response client, outgoing deny-list (DFU etc.)
    opxy/      The OP-XY as data: controls inventory, tracks/channels, CC map, remote keys,
               firmware profile — loaded from knowledge/*.json and validated with zod
    music/     notation, melodies, harmony; later SongIR, arranger, MIDI-file import
    xy/        (M6) the device's .xy project files, ported from kmorrill/xy-format: container and
               RLE, project model, reader, template writer (sim/xy.ts compiles the simulator's
               project into one)
    presets/   (M7) sample presets: WAV/AIFF in and out, resampling, pitch and loop finding,
               patch.json, the drum/multisample/sampler builder, slicer, generated drum voices and
               kits, zip (the page is /presets)
    mtp/       MTP with the OP-XY in MTP mode: containers, datasets, a session over any byte pipe,
               the write policy (reads; new files only after approval; never delete/move), installPreset
    dsp/       shared signal processing (the FFT)
    voice/     (M8) OpenAI realtime as the voice speaks it: the session it mints, events, its three
               tools, the state machine (turns, barge-in, tool outputs, transcript lines), mic pick
    listen/    (M9) hearing a recording: loudness (BS.1770), tone, stereo, onsets, tempo, grid and
               swing, key and chords, silence and dropouts, and the summary the agent reads
  device/      Browser adapters (Web MIDI, workers, audio). Everything injected for tests:
               access, transport (the single send choke point + policy), monitor, device mirror,
               scheduler + tick worker, session (identity + GREET), expect(), mtp (WebUSB pipe),
               listen (the OP-XY's USB audio or the replica's master, an AudioWorklet recorder,
               the analysis in a worker)
  app/         Glue between features, e.g. the replica ⇄ device bridge (replica keys → notes/transport/
               track select through the transport; device notes/clock → replica LEDs), app-wide contexts,
               project transfer (.xy files from disk or the device over MTP, and back), and the
               device samples a loaded project names (read over MTP, kept in IndexedDB by path)
  agent/       (M3) conductor harness on @anthropic-ai/sdk, tools, subagents, approvals, journal
  voice/       (M8) the voice front end: WebRTC call (rtc), VoiceSession, the ask_claude bridge to the
               conductor, spoken summaries, the mic key and voice strip
  replica/     (M2) SVG digital twin: geometry model (mm), components, screen canvas, animations
  sim/         (M2.5) the virtual OP-XY: state, input → state, frames → the screen's pages (drawn
               from TE's art and the device captures), the sequencer, the navigator (exact steps
               to any page or value, tried on a copy of the simulator), and xy.ts (the project as a
               .xy file, M6)
  sound/       the replica's sound in the browser: synth engines, drum kit, samplers, effects
  manual/      (M4) our manual: schema, loader, search
  ui/          design tokens, primitives, shared components
src/routes/    pages: / (app), /presets (preset maker), /lab (device console, dev tool)
test/fakes/    fakes shared by tests (e.g. FakeMIDIAccess with an emulated OP-XY)
knowledge/     committed data the app imports via the `$knowledge` alias
```

Dependency direction: `routes → app → (replica | agent | manual | ui) → (sim | sound) → device →
core`. `voice` sits over `agent` (it hands requests to the conductor; `agent` never imports
`voice`). `core` imports nothing outside `core` (and `$knowledge` JSON). Nothing imports `routes`.

## Voice (M8)

OpenAI's realtime model over WebRTC is a front desk; Claude does the work (`research/71-voice.md`).
The user's OpenAI key mints one short-lived client secret per call; the call runs on that secret.
`core/voice/machine.ts` makes every decision (push-to-talk commits, hands-free VAD, barge-in with
`response.cancel` + `output_audio_buffer.clear`, when an owed response is asked for, transcript
lines); `voice/session.svelte.ts` carries events between it, the call (`voice/rtc.ts`, every browser
API injected), the conductor and the UI. `ask_claude` sends the request to the conductor as a
normal user turn marked voice, so tools, approvals and undo are the chat's own. A spoken approval
goes through the same `Conductor.decide` as the sheet, and counts only when the user spoke after
the question and their transcript is a clear yes; "allow for this session" is never offered by
voice. Heard and said lines reach the chat through `Conductor.voiceLine` and are never sent to
Claude.

## The agent: from an idea to steps

- **Navigator** (`sim/navigator.ts`): from where the simulator stands to a page, a parameter value,
  several settings in a row (`planSettings`), or a value any page shows by the name its screen uses
  (`planPageValue`: the description's values and those the frame draws, `frameValues`; it finds the
  encoder by turning each one on a copy, or the click or key that switches the value). A few values
  have keys of their own (the player list, a preset, an FX track's effect, arrange's patterns,
  scenes and song, slicing, the bar menu). Steps use the whole key grammar, held chords and `→ +`
  included. Every plan is run on a copy of the simulator before it is returned, so its steps are
  known to work. Each step says what the screen shows after it. `sim/settings.ts` turns a setting
  as plan_steps and the recipes write it into the navigator's goal.
- **`plan_steps`** reads the plan out, plays it on the replica (`show`, which leaves the virtual
  OP-XY there), or hands it to the walkthrough (`guide`, `app/guide.svelte.ts`). The walkthrough
  lights one step at a time and moves on when the replica's screen shows where the step leads.
- **Device map** (`sim/device-map.ts` → `knowledge/opxy/device-map.json`, rebuilt with
  `node scripts/build-device-map.mjs`; a test fails while it is stale): every page with its keys
  from a new project, what its screen says, and each encoder per layer (found by turning it on a
  copy) with its range, display format, CC and MIDI reach on OS 1.1.33. The agent reads it with
  `device_map`.
- **Recipes** (`knowledge/manual/units/howto/*`) mark the steps that set values
  (`set: { param, value }`, with `area`, `track`, `page` and `key` when the value is another page's);
  `sim/recipes.spec.ts` runs every recipe on a new project, as plan_steps would.
- **Device**: `set_sound` sends a connected OP-XY's sound parameters over the lane CCs verified on
  OS 1.1.33, through the transport with approval; the other device tools cover tempo, mutes, track
  select, transport, note previews and panic. Patterns, scenes and songs are written to the virtual
  OP-XY only, since the device takes none over MIDI.
- **Evals** (`evals/agent/`): manual Q&A and device tasks (`run.mjs`), how-to and idea-to-device
  cases checked against the simulator's end state (`howto.mjs`), programming the virtual OP-XY
  (`virtual.mjs`), files (`files.mjs`). Results in `evals/agent/RESULTS.md`.
- **Listening** (note 61): `listen` records the OP-XY's USB audio or the replica's sound
  (`ListenHost` in the environment; `device/listen` in the browser) and hands the model the
  summary of `core/listen`; `listen_tracks` hears tracks alone through the mutes (CC9 on a device,
  through the transport) with approval, and puts every mute back in a `finally`.

## Rules

- **Safety is enforced in one place.** Every outgoing MIDI byte goes through
  `device/transport` → policy (`core/te/policy.ts` deny-list + rate limits + approvals). No other
  module may call `MIDIOutput.send`. Over MTP, every operation goes through `core/mtp/policy.ts`: reads,
  and new files or folders only after the owner approved that write; delete, move, overwrite,
  format and reset are never sent. DFU (TE cmd 0x03), 0x7F and undocumented TE commands can never
  be sent. State-changing operations are journalled with an inverse.
- **The LLM never produces bytes.** It emits typed, zod-validated intent; core code compiles it.
- **Firmware-aware data.** Facts carry `confidence` (verified / official / community / derived /
  speculative) and, when checked, `verifiedOn: '1.1.33'`.
- **TypeScript strict**, ESM, named exports (Svelte components excepted). No `any` in `core`.
  Byte buffers are `Uint8Array`; MIDI data values are validated (0–127, channels 0–15) and invalid
  input throws typed errors (`class XError extends Error { name = 'XError' }`), never clamps silently
  (clamping is a UI concern).
- **Svelte 5 runes** only. Stateful browser modules are classes in `*.svelte.ts` with `$state` fields;
  dependencies are injected via constructor/context, never grabbed from globals at import time.
  No side effects on import.
- **Tests next to code**: `foo.ts` → `foo.spec.ts` (Node project); components → `*.svelte.spec.ts`
  (browser project). Core modules aim for full branch coverage. Real device captures used as fixtures
  must have serial numbers redacted.
- **Provenance.** Code adapted from elsewhere starts with a comment naming the source and licence,
  e.g. `// Adapted from MIDI Lab (NeoVand/midilab) src/lib/midi/messages.ts` or
  `// Ported from kmorrill/xy-format (MIT) xy/rle.py`. Unlicensed repos are reference-only: facts may be
  used, code may not.
- **Style**: Prettier (tabs, single quotes, width 100) + ESLint; JSDoc on every export; comments
  explain _why_, not _what_. Match the surrounding code.
- **Knowledge first.** Before writing device-specific logic, read the relevant `docs/research/NN-*.md`
  note; when you learn something new about the device, update the note (and the probe log if it came
  from the device).
