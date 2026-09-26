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
    presets/   (M7) patch.json builder, slicer
  device/      Browser adapters (Web MIDI, workers, audio). Everything injected for tests:
               access, transport (the single send choke point + policy), monitor, device mirror,
               scheduler + tick worker, session (identity + GREET), expect()
  agent/       (M3) conductor harness on @anthropic-ai/sdk, tools, subagents, approvals, journal
  replica/     (M2) SVG digital twin: geometry model (mm), components, screen canvas, animations
  manual/      (M4) our manual: schema, loader, search
  ui/          design tokens, primitives, shared components
src/routes/    pages: / (app), /lab (device console, dev tool)
test/fakes/    fakes shared by tests (e.g. FakeMIDIAccess with an emulated OP-XY)
knowledge/     committed data the app imports via the `$knowledge` alias
```

Dependency direction: `routes → (replica | agent | manual | ui) → device → core`. `core` imports
nothing outside `core` (and `$knowledge` JSON). Nothing imports `routes`.

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
  explain *why*, not *what*. Match the surrounding code.
- **Knowledge first.** Before writing device-specific logic, read the relevant `docs/research/NN-*.md`
  note; when you learn something new about the device, update the note (and the probe log if it came
  from the device).
