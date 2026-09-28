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
    xy/        (M6) .xy codec, ported from kmorrill/xy-format
    presets/   (M7) sample presets: WAV/AIFF in and out, resampling, pitch and loop finding,
               patch.json, the drum/multisample/sampler builder, zip (the page is /presets)
  device/      Browser adapters (Web MIDI, workers, audio). Everything injected for tests:
               access, transport (the single send choke point + policy), monitor, device mirror,
               scheduler + tick worker, session (identity + GREET), expect()
  app/         Glue between features, e.g. the replica ⇄ device bridge (replica keys → notes/transport/
               track select through the transport; device notes/clock → replica LEDs), app-wide contexts
  agent/       (M3) conductor harness on @anthropic-ai/sdk, tools, subagents, approvals, journal
  replica/     (M2) SVG digital twin: geometry model (mm), components, screen canvas, animations
  sim/         (M2.5) the virtual OP-XY: state, input → state, frames → the screen's pages (drawn
               from TE's art and the device captures), the sequencer, and the navigator
               (exact steps to any page or value, tried on a copy of the simulator)
  sound/       the replica's sound in the browser: synth engines, drum kit, samplers, effects
  manual/      (M4) our manual: schema, loader, search
  ui/          design tokens, primitives, shared components
src/routes/    pages: / (app), /presets (preset maker), /lab (device console, dev tool)
test/fakes/    fakes shared by tests (e.g. FakeMIDIAccess with an emulated OP-XY)
knowledge/     committed data the app imports via the `$knowledge` alias
```

Dependency direction: `routes → app → (replica | agent | manual | ui) → (sim | sound) → device →
core`. `core` imports nothing outside `core` (and `$knowledge` JSON). Nothing imports `routes`.

## The agent: from an idea to steps

- **Navigator** (`sim/navigator.ts`): from where the simulator stands to a page, a parameter value,
  several values in a row (`planSettings`), or a value an auxiliary or mixer page shows
  (`planPageValue`, which finds the encoder by turning each one on a copy). Every plan is run on a
  copy of the simulator before it is returned, so its steps are known to work. Each step says what
  the screen shows after it.
- **`plan_steps`** reads the plan out, plays it on the replica (`show`, which leaves the virtual
  OP-XY there), or hands it to the walkthrough (`guide`, `app/guide.svelte.ts`). The walkthrough
  lights one step at a time and moves on when the replica's screen shows where the step leads.
- **Recipes** (`knowledge/manual/units/howto/*`) mark the steps that set values
  (`set: { param, value }`); `sim/recipes.spec.ts` runs every recipe on a new project.
- **Device**: `set_sound` sends a connected OP-XY's sound parameters over the lane CCs verified on
  OS 1.1.33, through the transport with approval; the other device tools cover tempo, mutes, track
  select, transport, note previews and panic. Patterns, scenes and songs are written to the virtual
  OP-XY only, since the device takes none over MIDI.
- **Evals** (`evals/agent/`): manual Q&A and device tasks (`run.mjs`), how-to and idea-to-device
  cases checked against the simulator's end state (`howto.mjs`), programming the virtual OP-XY
  (`virtual.mjs`), files (`files.mjs`). Results in `evals/agent/RESULTS.md`.

## Rules

- **Safety is enforced in one place.** Every outgoing MIDI byte goes through
  `device/transport` → policy (`core/te/policy.ts` deny-list + rate limits + approvals). No other
  module may call `MIDIOutput.send`. DFU (TE cmd 0x03), 0x7F and undocumented TE commands can never
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
