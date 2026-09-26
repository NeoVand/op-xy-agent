# 80 — MIDI Lab: code and patterns to lift

> Research note, 2026-09-26. Source: `~/repos/midilab` at `6a83a8d` (155 commits, last on
> 2026-08-28). MIDI Lab is the owner's own interactive MIDI course, built on the same stack we use:
> SvelteKit 2, Svelte 5 runes, TS 6, Vite 8, Tailwind 4, vitest 4, Playwright. This was a read-only
> survey. Nothing has been copied into this repo yet, and nothing was sent to any MIDI device.
> Everything below was read from source. Facts from outside the codebase are cited in Appendix B.
> Claims marked **verify** are unconfirmed.

**Scale of what was read.** `src/lib` minus the shadcn primitives is about 39.3k LOC:

| Area                | LOC   |
| ------------------- | ----- |
| `midi/`             | 5.1k  |
| `audio/`            | 2.1k  |
| `music/`            | 0.5k  |
| `components/midi`   | 14.7k |
| `components/shell`  | 1.8k  |
| lesson chrome       | 1.1k  |
| lessons             | 9.7k  |
| curriculum metadata | 1.9k  |

On top of that there are 10.1k LOC of shadcn-svelte in `components/ui`: 55 component folders, of
which only 21 are imported anywhere. Tests are 14 vitest spec files with 124 `it` blocks (some run
once per sample or per melody) and 3 Playwright files with 15 tests. Also read: `README.md`,
`PLAN.md`, `AGENTS.md`, `MOBILE.md`, the three `references/*.md` (skimmed), every config file and
`.github/workflows/deploy.yml`.

---

## 1. TL;DR: the top 10 things to lift, ranked by value

| #   | What                                        | Where (midilab `src/lib/…`)                                                                                                                                  | Why it matters here                                                                                                                                                                                                                                                                                         | Verdict                                                |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1   | **Protocol core**                           | `midi/messages.ts`, `notes.ts`, `constants.ts`, `sysex.ts`, `rpn.ts`, plus `messages.spec.ts`                                                                | The typed `MidiMessage` union, `parse`/`encode`, a running-status stream parser, 14-bit helpers, Identity Request/Reply, and plain-English `describe()`. Pure, no dependencies, tested. This is the "deterministic core" the vision asks for, and `describe()` lets the agent narrate what the device sent. | copy + small fixes (§2.11 #1–#3)                       |
| 2   | **One bus, one send path**                  | `midi/bus.ts`, and the idea behind `midi/engine.svelte.ts`                                                                                                   | Every byte that comes in or goes out passes through a single bus, and a failing subscriber is isolated from the rest. That single choke point is where our "never harm the device" policy, the undo journal, pacing and agent observation all attach.                                                       | bus: copy. engine: rewrite                             |
| 3   | **Web MIDI access store**                   | `midi/access.svelte.ts`                                                                                                                                      | A status machine, permission requested only on a user action, auto-resume through the Permissions API, a separate SysEx gate, hot-plug, remembered ports, no auto-open, and timestamped sends.                                                                                                              | copy + adapt (§3.9)                                    |
| 4   | **High-rate reactive state**                | `midi/monitor.svelte.ts`, `midi/notestate.svelte.ts`, `components/midi/MidiMonitor.svelte`, `ByteInspector.svelte`                                           | A plain ring buffer with one reactive bump per animation frame keeps the UI responsive under 48+ clock messages a second. `noteState` is the seed of the replica's live mirror of the device.                                                                                                               | copy + adapt; restyle the UI                           |
| 5   | **Semantic device profiles**                | `midi/devices/profile.ts`, `components/midi/CcLearn.svelte`, learn mode in `DeviceProfileEditor.svelte`                                                      | `device.set('filter.cutoff', 0.75)` becomes CC, NRPN, RPN or SysEx. This is exactly the tool abstraction `00-initial-deep-research.md` recommends. Learn mode is how we would verify the OP-XY CC map on OS 1.1.33.                                                                                         | adapt the types; replace the OP-XY data                |
| 6   | **Melody notation + public-domain library** | `music/notation.ts`, `music/melodies.ts`, `melodies.spec.ts`                                                                                                 | A strict, human-readable phrase language (`E4 E4 F4 G4 \| G4/2 C4+E4+G4/1`) is a very good format for the LLM to express musical intent in. The 13 melodies (Für Elise, Bach's C-major Prelude, Pachelbel's Canon, The Entertainer and others) come with provenance and double as demo and test content.    | copy + extend (ties, tuplets, quantise to OP-XY steps) |
| 7   | **Agent tool primitives**                   | `components/lesson/Checkpoint.svelte`, `curriculum/progress.svelte.ts`, `SandboxSession` in `sandbox/api.ts`                                                 | A checkpoint is a predicate over the live stream, with a count and a distinct-key rule. That becomes `expectEvent()` for teaching: "press SHIFT+PLAY… got it." `SandboxSession` tracks every timer, subscription and held note so that Stop really stops, which is the model for cancellable agent runs.    | pattern only (~150 LOC new)                            |
| 8   | **Scheduler and clock discipline**          | `midi/clock.svelte.ts`, `midi/player.svelte.ts`, the tick handler in `StepSequencer.svelte`                                                                  | Plan ahead and call `output.send(bytes, t)`, send F8 on exact tick boundaries, measure external clock BPM and jitter σ, and schedule the note-off together with the note-on. It is tied to the AudioContext and to main-thread timers, though (§4).                                                         | pattern; rewrite                                       |
| 9   | **SMF codec**                               | `midi/smf.ts`, `midi/steps.ts`, plus specs                                                                                                                   | Import a `.mid` the user supplies ("put this on track 3") and export what the agent wrote.                                                                                                                                                                                                                  | copy + harden (§2.11 #5–#6)                            |
| 10  | **Delivery and quality scaffolding**        | `.github/workflows/deploy.yml`, the base-path block in `vite.config.ts`, `routes/+layout.ts`, `e2e/*`, the rule-tests, `a11y/roving.ts`, `a11y/momentary.ts` | A Pages deploy gated on check, lint, unit and e2e, with an SPA 404 fallback. "Rule tests" that scan the source. A phone e2e suite at 375×812. Keyboard-grid accessibility that fits the OP-XY's step keys and keybed.                                                                                       | copy + adapt (pnpm, `resolve()`)                       |

**Defects that must not be carried over.** §2.11 lists 18. The five that matter most:

- `encode()` turns a channel-16 Note Off into a channel-1 Note On.
- midilab records Teenage Engineering's SysEx ID as `00 21 0F`. Community TE protocol docs use
  `00 20 76` — **confirmed 2026-09-26: the OP-XY's own Identity Reply carries `00 20 76`** (see
  `docs/research/90-device-probe.md`).
- `SequencePlayer.stop()` can leave notes stuck on hardware.
- The SMF writer throws on tracks larger than roughly 120 KB.
- The master clock stops advancing whenever the AudioContext is suspended.

---

## 2. Module-by-module inventory

**Verdicts.** **copy** means copy as-is. **adapt** means copy and adapt. **pattern** means reuse the
idea only. **skip** means don't bring it. LOC counts exclude spec files.

### 2.1 `src/lib/midi/`: protocol and engine

| File                      | LOC | What it does                                                                                                                                                                                                                                                                                            | Depends on                                     | Tests                                                                                                                                                                                                       | Quality notes                                                                                                                                                                                                                                                                                                                                                                                             | Verdict                                   |
| ------------------------- | --: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `messages.ts`             | 697 | A 19-kind `MidiMessage` union. `parse`, `encode`, `RunningStatusParser`, `dataByteCount`, `combine14`/`split14`, bend↔unit conversion, hex and binary formatting, `family()` (7 colour families), `magnitude()`, `shortLabel()`, `describe()` (sentences, with CC-specific wording and SysEx headlines) | `constants`, `notes`                           | `messages.spec.ts`: round trip for 9 message types, velocity-0 as Note Off, LSB-first bend, SysEx framing, running status (including real-time bytes interleaved and byte-at-a-time input), CC ≥ 120 family | Excellent docblocks. The wire channel (0–15) is kept lexically separate from the display channel (`ch1()`). **But:** `encode()` never validates `channel` and silently clamps data bytes, and SysEx payloads are not checked. `FAMILY_CLASS` (Tailwind class names) lives in the protocol file. `describe()` assumes General MIDI: it names CC 32 "Bank Select LSB", which is filter cutoff on the OP-XY. | **adapt**                                 |
| `notes.ts`                | 186 | Note names (♯/♭/ASCII), C3 vs C4 octave convention, frequency↔note, `parseNoteName`, interval names                                                                                                                                                                                                     | none                                           | indirectly, via `harmony.spec`                                                                                                                                                                              | Clean and pure                                                                                                                                                                                                                                                                                                                                                                                            | **copy**                                  |
| `constants.ts`            | 633 | Full CC table with categories and the 14-bit pairs, RPN table, GM programs, families and drums, 1- and 3-byte manufacturer IDs with `manufacturerName()`                                                                                                                                                | none                                           | none directly                                                                                                                                                                                               | Lists TE under `'21:0f'`. The EP-133 protocol writeup uses `00 20 76` (§2.11 #2). The GM tables are conventions, not OP-XY semantics.                                                                                                                                                                                                                                                                     | **adapt** (one-line fix)                  |
| `sysex.ts`                | 162 | `identityRequest()`, `parseIdentityReply()` (1- and 3-byte IDs, family and member LSB-first, 4 version bytes), Roland checksum, `validateSysEx()`, loose hex parse and format, `describeSysEx()`                                                                                                        | `constants`                                    | none                                                                                                                                                                                                        | Good. `parseHexString` silently drops an odd trailing nibble.                                                                                                                                                                                                                                                                                                                                             | **copy**, add an outgoing allowlist       |
| `rpn.ts`                  | 169 | `parameterEdit`, `rpn`, `nrpn`, `setBendRange` (each ends with RPN-null), streaming `RpnParser`                                                                                                                                                                                                         | `messages`                                     | none                                                                                                                                                                                                        | Clean. Low priority: the OP-XY is reported to be CC-only.                                                                                                                                                                                                                                                                                                                                                 | **copy** (later)                          |
| `bus.ts`                  |  57 | Global pub/sub of `MidiEvent {id, time, portId, portName, direction, bytes, message}`. A throwing listener cannot stop the stream.                                                                                                                                                                      | `messages` (type only)                         | none                                                                                                                                                                                                        | Tiny and right. The ID counter is module-global.                                                                                                                                                                                                                                                                                                                                                          | **copy**, add `source` and `cause` fields |
| `access.svelte.ts`        | 265 | Web MIDI access store (§3)                                                                                                                                                                                                                                                                              | `$app/environment`, bus, messages, persist     | none                                                                                                                                                                                                        | Side effect in the constructor. Never calls `close()` on a port. Surfaces raw error text only.                                                                                                                                                                                                                                                                                                            | **adapt**                                 |
| `engine.svelte.ts`        | 267 | Output list (internal synth plus hardware), fan-out `send`/`sendBytes`/`sendAll`, note/CC/program/bend helpers, an `onLocalSend` tap, three-stage panic                                                                                                                                                 | access, bus, messages, synth, gm, audio, clock | none                                                                                                                                                                                                        | Hard-wired to the audio singletons. Emits one bus event _per output_, so the monitor shows duplicates. `panic(true)` fires 2,112 messages with no pacing.                                                                                                                                                                                                                                                 | **pattern**; rewrite                      |
| `monitor.svelte.ts`       | 268 | 4,000-event ring buffer. Filters by family, direction, channel, port, search text, and hiding real-time messages. Per-family decaying activity meters, in/out flow LEDs, messages per second, TSV export. One `version` bump per rAF. Restarts on `visibilitychange`.                                   | bus, messages                                  | none                                                                                                                                                                                                        | The key performance pattern. `#rateWindow` grows while the tab is hidden. Dead `since` variable.                                                                                                                                                                                                                                                                                                          | **adapt**                                 |
| `notestate.svelte.ts`     | 188 | Per channel: held notes with velocity, CC values, bend, pressure, program, last activity. `held`, `channelOf`, `usedChannels`. Updates coalesced per rAF.                                                                                                                                               | bus                                            | none                                                                                                                                                                                                        | Starts itself on import. Ignores poly aftertouch and sustain.                                                                                                                                                                                                                                                                                                                                             | **adapt** into the OP-XY mirror           |
| `clock.svelte.ts`         | 298 | `Transport`: BPM, loop, a 96-PPQ lookahead scheduler, MIDI clock out, an external-clock follower (BPM, σ jitter, presence watchdog, Start/Continue/Stop/SPP), tap tempo, `audioToPerf()`                                                                                                                | audio engine, bus                              | none                                                                                                                                                                                                        | §4                                                                                                                                                                                                                                                                                                                                                                                                        | **pattern**                               |
| `player.svelte.ts`        | 176 | `SequencePlayer`: lookahead playback of timed events, looping without drift, one-demo-at-a-time registry, cleanup via `onDestroy`. `notesToEvents()`.                                                                                                                                                   | audio, engine, clock                           | none                                                                                                                                                                                                        | `stop()` can leave notes stuck on hardware (§2.11 #8)                                                                                                                                                                                                                                                                                                                                                     | **pattern**                               |
| `router.svelte.ts`        | 252 | Patchbay routes: channel filter and remap, transpose, velocity scale, split range, family filter. Refuses loops, drives the flow animation, persists routes.                                                                                                                                            | bus, access, messages, synth, engine, persist  | none                                                                                                                                                                                                        | The pure `transform()` inside is reusable                                                                                                                                                                                                                                                                                                                                                                 | **pattern**; copy `transform()`           |
| `smf.ts`                  | 423 | SMF read and write: VLQ, chunks, running status, meta decoding (text, tempo, time signature, key signature), SysEx, a format-1 writer with a conductor track, `summarise()`, `flatten()`                                                                                                                | messages                                       | `smf.spec.ts`: the spec's VLQ vectors, round trip, End of Track                                                                                                                                             | Writer can throw a RangeError, no bounds checks, tempo map ignored (§2.11 #5–#6)                                                                                                                                                                                                                                                                                                                          | **adapt**                                 |
| `steps.ts`                |  63 | Step grid to SMF as a pure function (muted parts are omitted)                                                                                                                                                                                                                                           | smf                                            | `steps.spec.ts` (6)                                                                                                                                                                                         | A good example of pulling export logic out of a component into a tested function                                                                                                                                                                                                                                                                                                                          | **pattern**                               |
| `devices/profile.ts`      | 310 | `ParamProtocol` (cc, nrpn, rpn, or SysEx template with checksum), `Parameter` (id, range, unit, group, `unverified`), `DeviceProfile`, `Device.set()`, `selectProgram()`, `explain()`. Built-in profiles: GM, OP-XY, OP-1 field.                                                                        | messages, rpn, sysex                           | none                                                                                                                                                                                                        | The abstraction is right; the OP-XY data is thin: 13 CCs, all `unverified`, one channel, no per-track or global scope, tempo treated as linear 0–127.                                                                                                                                                                                                                                                     | **adapt**                                 |
| `devices/store.svelte.ts` |  82 | Built-in plus user profiles; select, duplicate, JSON import and export; persisted                                                                                                                                                                                                                       | persist                                        | none                                                                                                                                                                                                        | Fine                                                                                                                                                                                                                                                                                                                                                                                                      | **pattern**                               |
| `harmony.ts`              | 238 | Chord names from pitch classes, correct enharmonic spelling, VexFlow key strings                                                                                                                                                                                                                        | notes                                          | `harmony.spec.ts` (21)                                                                                                                                                                                      | High quality                                                                                                                                                                                                                                                                                                                                                                                              | **copy**, into `music/`                   |
| `mpe.ts`                  | 177 | MPE zones, MCM, round-robin allocator                                                                                                                                                                                                                                                                   | messages, rpn                                  | none                                                                                                                                                                                                        | No OP-XY use case                                                                                                                                                                                                                                                                                                                                                                                         | **skip**                                  |
| `ump.ts`                  | 198 | MIDI 1.0 to UMP words, MIDI 2.0 scaling                                                                                                                                                                                                                                                                 | messages                                       | none                                                                                                                                                                                                        | Web MIDI is MIDI 1.0 only                                                                                                                                                                                                                                                                                                                                                                                 | **skip**                                  |
| `channelcolour.ts`        |  19 | 16 channel hues; lightness comes from `--channel-l`                                                                                                                                                                                                                                                     | none                                           | none                                                                                                                                                                                                        | Nice idea: one hue per track                                                                                                                                                                                                                                                                                                                                                                              | **pattern**                               |

### 2.2 `src/lib/audio/`: the built-in instruments

| File                     |      LOC | What it does                                                                                                                                                                                                                                                                     | Notes                                                                                                                                                                     | Verdict                                    |
| ------------------------ | -------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `engine.ts`              |      229 | Lazy AudioContext. Master → limiter → analyser, a generated impulse-response reverb and a feedback delay. `prime()` builds the graph while still suspended; `resume()`; meters, waveform and spectrum. The `SynthHost` interface lets the synth run on an `OfflineAudioContext`. | Solid. We only need it for demo mode, or for monitoring the OP-XY's USB audio.                                                                                            | **adapt** (optional)                       |
| `synth.ts`               |      699 | 16-channel subtractive synth: 2 oscillators plus noise, filter, ADSR, LFO, pan, sends. GM2 Sound Controllers as a relative time scale, RPN bend range, sustain, aftertouch, 48-voice stealing, a voice reaper.                                                                   | Very good (the `cancelAndHoldAtTime` release fix is documented). Tests: `synth.spec.ts` (timeScale) and the browser render tests.                                         | **adapt** only for a no-hardware demo mode |
| `presets.ts`, `drums.ts` | 292, 204 | 16 family presets; a synthesised GM kit                                                                                                                                                                                                                                          | Go with `synth.ts`                                                                                                                                                        | same                                       |
| `gm.svelte.ts`           |      271 | smplr soundfont loader per program, with the synth covering while samples load                                                                                                                                                                                                   | Fetches samples over the network at runtime; the OP-XY has its own sounds                                                                                                 | **skip**                                   |
| `metronome.svelte.ts`    |       95 | Audible click scheduled from transport ticks                                                                                                                                                                                                                                     | Fine                                                                                                                                                                      | **pattern**                                |
| `render.ts`              |      277 | Offline render, peak envelope, log-frequency STFT, a hand-written radix-2 `fft()`                                                                                                                                                                                                | `fft()` is tested against known signals in `render.spec.ts`; the offline render is tested in a real browser in `render.svelte.spec.ts`. Useful for analysing OP-XY audio. | **copy** `fft()` + spec only               |

### 2.3 `src/lib/music/`, `patterns/`, `sandbox/`

| File                | LOC | What it does                                                                                                                                                                                                                                                            | Notes                                                                                                                             | Verdict          |
| ------------------- | --: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `music/notation.ts` | 136 | Phrase language to `NoteSpec[]` in beats. Chords (`C4+E4+G4`), rests (`_`), durations that persist until changed, accent (`>`), ghost (`-`), staccato (`.`), transpose that raises a range error instead of clamping. Helpers `after()`, `together()`, `phraseBeats()`. | Strict errors are exactly right for LLM output. Imports `NoteSpec` from `player.svelte.ts`; decouple that.                        | **adapt**        |
| `music/melodies.ts` | 401 | 13 public-domain melodies with composer, year, BPM, `beatsPerBar`, GM program, tags and `verified` provenance (Mutopia). `melodyNotes()`, `round()`.                                                                                                                    | `melodies.spec.ts` checks range, velocity and overlaps for every melody                                                           | **copy**         |
| `patterns/index.ts` | 309 | TidalCycles/Strudel-style mini-notation: sequences, `[]`, `*`, `!`, `<>`, `,`, Euclidean `(p,s,r)`. Bjorklund's algorithm, scales, drum aliases.                                                                                                                        | `patterns.spec.ts` (12). Good for generative parts ("5-of-16 hats").                                                              | **copy** (later) |
| `sandbox/api.ts`    | 246 | API for the user's JavaScript console. `SandboxSession` tracks timers, intervals, bus subscriptions and held notes, and `dispose()` releases them all. `run()` executes the code via `new Function`.                                                                    | The tracking model is the valuable part. `new Function` must never run model output (vision: "the model never writes raw bytes"). | **pattern**      |

### 2.4 Stores, accessibility, hooks, utilities

| File                         | LOC | What it does                                                                                                                                                                 | Verdict                                                                                                          |
| ---------------------------- | --: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `stores/persist.ts`          |  27 | Prefixed localStorage JSON `load`/`save`/`remove`; never throws                                                                                                              | **copy** (prefix `opxy:`)                                                                                        |
| `stores/settings.svelte.ts`  |  87 | Theme (light, dark, system) with a flip that freezes transitions for one frame; octave convention; dock state; reduce-motion seeded from the OS; autosave via `$effect.root` | **adapt**                                                                                                        |
| `stores/device.svelte.ts`    |  55 | `narrow`, `coarse` and `portrait` media-query store; `phone = narrow && coarse` ("how you touch it" is a separate question from "how wide")                                  | **copy**, renamed `viewport.svelte.ts` so "device" can mean the OP-XY                                            |
| `stores/shortcuts.svelte.ts` |  62 | Space, ⌘K, ⌘. and backtick, with an `isTypingTarget` guard (buttons own Space and Enter)                                                                                     | **adapt**                                                                                                        |
| `a11y/roving.ts`             | 154 | Roving-tabindex grid action: visual-order option, `MutationObserver`, `revision`                                                                                             | **copy** (or convert to `{@attach}`); fits the OP-XY's step keys and keybed                                      |
| `a11y/momentary.ts`          |  35 | A pointer press does not take focus, so the next key press still plays a note                                                                                                | **copy**                                                                                                         |
| `hooks/is-mobile.svelte.ts`  |   9 | shadcn `MediaQuery` subclass; duplicates the device store                                                                                                                    | **skip**                                                                                                         |
| `utils.ts`                   |  51 | `cn()`, shadcn type helpers, `capturePointer()` (defensive), `downloadFile()` (revokes the object URL on the next tick)                                                      | **adapt**: take the two DOM helpers                                                                              |
| `nav.ts`                     |  28 | `path()` prefix for base-path hosting; `nav.spec.ts` scans source for root-relative `href`s                                                                                  | **skip**: use `resolve()` from `$app/paths`, because `base` is deprecated in the SvelteKit 2.70.3 installed here |

### 2.5 Curriculum and lesson chrome

| File                                                                                                                                         |              LOC | What it does                                                                                                                                             | Verdict                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `curriculum/progress.svelte.ts`                                                                                                              |              108 | Persisted checkpoint completion, a registry of mounted checkpoints, manual override                                                                      | **pattern** (progress for OP-XY lessons)                      |
| `components/lesson/Checkpoint.svelte`                                                                                                        |              120 | Predicate over bus events, `count`, distinct `key`, success flash, manual tick when hardware won't cooperate                                             | **pattern**: the core of `expectEvent()`                      |
| `curriculum/registry.ts`                                                                                                                     |              580 | 7 acts × 38 lessons of metadata; `curriculum.spec.ts` checks the registry and the files agree                                                            | **pattern** (guided tours)                                    |
| `curriculum/glossary.ts`                                                                                                                     |              718 | ~100 terms with categories and aliases, shown inline via `Term.svelte`                                                                                   | **pattern** (OP-XY glossary)                                  |
| `curriculum/references.ts`                                                                                                                   |              431 | Bibliography. `references.spec.ts` asserts unique IDs, unique and parseable URLs, a publisher and note on each entry, and that every cited key resolves. | **pattern**: the same discipline for manual-section citations |
| `curriculum/lessons/*.svelte`                                                                                                                | 9,711 (38 files) | General MIDI course content (a handful of OP-XY mentions)                                                                                                | **skip** (content; link out)                                  |
| Other lesson chrome: `Callout`, `Chain`, `Figure`, `Further`, `LessonShell`, `Quiz`, `Ref`, `Section`, `Term`, `Timeline`, `TryThis`, `Xref` |            1,122 | Lesson layout kit                                                                                                                                        | **pattern**                                                   |

### 2.6 `src/lib/components/midi/` (64 widgets, 14.7k LOC)

**Live data and diagnostics.** These are developer-panel candidates.

| File                                                    |               LOC | Verdict and why                                                                                                                                                                                                                                          |
| ------------------------------------------------------- | ----------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MidiMonitor.svelte`                                    |               370 | **adapt**. Toolbar (freeze, clear, filter popover, search, rate), sticky header that stays visible when empty, Δt column, port column shown only when it changes, value bars from `magnitude()`. Needs restyling off shadcn and probably virtualisation. |
| `ByteInspector.svelte`                                  |               363 | **adapt** (optional). Hex → bits → status/channel nibbles → sentence.                                                                                                                                                                                    |
| `ActivityStrip.svelte`                                  |                78 | **adapt**. Per-family decaying meters; can become device activity LEDs.                                                                                                                                                                                  |
| `ChannelState.svelte`                                   |               168 | **adapt**. The "where you are, not what happened" view; maps to a per-track state view.                                                                                                                                                                  |
| `WireView.svelte`                                       |               341 | **pattern**. Canvas with one lane per channel, value on the Y axis. Can show the agent's CC automation as curves.                                                                                                                                        |
| `CcLearn.svelte`                                        |               123 | **adapt**. Lists every CC seen with channel and min/max range. Our tool for verifying the OP-XY CC map on 1.1.33.                                                                                                                                        |
| `SysExLab.svelte`                                       |               165 | **adapt**, behind a dev flag, with the allowlist.                                                                                                                                                                                                        |
| `LatencyTest.svelte`                                    |               178 | **adapt**: fix the keyed `{#each}` (§2.11 #11). Needs a loopback.                                                                                                                                                                                        |
| `JitterPlot.svelte`                                     |                67 | **adapt**: fix the keyed `{#each}`. Shows how steady the OP-XY's clock is.                                                                                                                                                                               |
| `SchedulerLab.svelte`                                   |               194 | **pattern**. Naive vs lookahead playback with a 120 ms main-thread "stress" button. A good model for our scheduler demo and test page.                                                                                                                   |
| `ClockLab.svelte`                                       |               149 | **pattern**                                                                                                                                                                                                                                              |
| `Troubleshooter.svelte`                                 |               293 | **pattern**. A decision tree ordered by cost of each check, which becomes an OP-XY connection troubleshooter.                                                                                                                                            |
| `DevicePanel.svelte`                                    |               254 | **pattern**. Covers every permission state with good copy and the SysEx explanation (§3).                                                                                                                                                                |
| `RigDiagram.svelte`                                     |               431 | **pattern**. Groups ports into physical devices by name; packets travel the cable in their family colour. Makes a delightful connect screen.                                                                                                             |
| `DeviceProfileEditor.svelte`                            |               381 | **pattern**. Learn mode: arm it, move a knob, the CC or NRPN becomes a named parameter.                                                                                                                                                                  |
| `TempoField.svelte`                                     |               110 | **adapt**. Drag, type or tap the tempo.                                                                                                                                                                                                                  |
| `MessageBuilder`, `MidiFileLab`, `Patchbay`, `WireLoad` | 256, 285, 467, 99 | **pattern** or **skip** for v1                                                                                                                                                                                                                           |

**Instrument inputs.** Take the logic for the replica; don't take the visuals.

| File                                      |           LOC | Verdict and why                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------- | ------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Keyboard.svelte`                         |           521 | **pattern**. Worth keeping: a map from pointer ID to note, velocity taken from where the key is hit vertically, an Ableton-style typing row where a key is always released by the note it started, Enter/Space activation, and a window that narrows until keys are at least 34 px under a coarse pointer. The piano visuals don't match the OP-XY. Slide-to-play is probably broken (§2.11 #12). |
| `Knob.svelte`                             |           247 | **pattern**. Vertical drag over 180 px for the full range, Shift for ¼ speed, the wheel works only when focused, Arrow/Page/Home/End keys, ARIA slider. The OP-XY's encoders are endless, so we need a _relative_ encoder variant.                                                                                                                                                                |
| `PadGrid.svelte`, `Fader.svelte`          |      123, 120 | **pattern**                                                                                                                                                                                                                                                                                                                                                                                       |
| `StepSequencer.svelte`                    |           513 | **pattern**. Roving grid with paint-drag, a transport "owner" held in `<script module>`, and note-offs scheduled together with note-ons.                                                                                                                                                                                                                                                          |
| `PianoRoll`, `EuclidCircle`, `PatternLab` | 328, 250, 387 | **pattern** (later)                                                                                                                                                                                                                                                                                                                                                                               |
| `Wheel.svelte`                            |           155 | **skip** unless needed                                                                                                                                                                                                                                                                                                                                                                            |

**Music and teaching visuals.**

| File                                                                                                                                                                                                                                                            | LOC | Verdict and why                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Staff.svelte`                                                                                                                                                                                                                                                  | 214 | **pattern**. Lazy `import('vexflow/bravura')`; redraws on theme change via a `MutationObserver`. Can show what the agent is about to program.                          |
| `NowPlaying.svelte`                                                                                                                                                                                                                                             | 146 | **pattern**. Notation, chord symbol, intervals and note numbers together.                                                                                              |
| `Scope.svelte`                                                                                                                                                                                                                                                  | 271 | **pattern**. audioMotion-analyzer with 1/12-octave bands, colours read from CSS variables, band density reduced on narrow screens. Reusable for the OP-XY's USB audio. |
| `InstrumentPanel.svelte`                                                                                                                                                                                                                                        | 299 | **pattern** (idea only). "An enclosure, not a dashboard": hairlines between zones instead of cards, which is the right instinct for a hardware replica.                |
| `EnvelopeLab.svelte`                                                                                                                                                                                                                                            | 861 | **pattern** (principle only). "What is drawn is what is scheduled."                                                                                                    |
| The other ~30 (`ChordLab`, `CircleOfFifths`, `Harmonics`, `TuningLab`, `MpeLab`, `ZoneMap`, `RpnLab`, `GrooveLab`, `CableFigure`, `CurrentLoop`, `PortRouting`, `SoundVsData`, `VoicePicker`, `VoiceStrip`, `ProgramBrowser`, `EngineToggle`, `CodeSandbox`, …) |     | **skip**: specific to GM or to the course                                                                                                                              |

### 2.7 Shell, UI kit, routes

**Shell components.**

| File                                      |     LOC | Verdict and why                                                                                                                                                                                                    |
| ----------------------------------------- | ------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `EngineDock.svelte`                       |     600 | **pattern**. Always present: transport, ports, activity, panic. Resizable, with a persisted height that is clamped to the current window every time it is read. Our equivalent is a device-and-agent status strip. |
| `CommandPalette.svelte`                   |     290 | **pattern**. ⌘K is a natural entry point for agent commands.                                                                                                                                                       |
| `Rail.svelte`, `TabBar.svelte`            | 177, 82 | **pattern**. Side rail on desktop swaps to a bottom bar at `md`.                                                                                                                                                   |
| `PageHeader`, `EmptyState`, `SearchField` |         | **pattern**                                                                                                                                                                                                        |
| `CourseMap`, `SignalPath`, `ToolFigure`   |         | **skip**                                                                                                                                                                                                           |

**UI kit and routes.**

| File                            |    LOC | Verdict and why                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------- | -----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/ui/**`              | 10,136 | **skip**. shadcn-svelte generated with style `mira`, base colour `mist` and hugeicons. Only these 21 are imported: button (73 imports), slider, textarea, switch, popover, label, tooltip, separator, input, tabs, select, toggle, native-select, spinner, sonner, skeleton, sheet, input-group, dialog, command, badge. We want TE-styled primitives, built on headless bits-ui only where needed. |
| `routes/layout.css`             |    675 | **pattern** (§6). Keep the token architecture; throw away the values.                                                                                                                                                                                                                                                                                                                               |
| `routes/+layout.svelte`         |     97 | **pattern**. Singletons started once in `onMount`, an `h-dvh` shell, global shortcuts.                                                                                                                                                                                                                                                                                                              |
| `routes/+layout.ts`             |      6 | **copy**: `ssr = false`, `prerender = false`, `trailingSlash = 'never'`.                                                                                                                                                                                                                                                                                                                            |
| `src/app.html`                  |        | **adapt**: `viewport-fit=cover`, `theme-color` per scheme, static OG tags (nothing is rendered on a server, so the head a crawler sees is this file).                                                                                                                                                                                                                                               |
| `routes/settings/+page.svelte`  |    277 | **pattern**. A "Stored data" section that lists and clears everything kept locally. Important once users store an API key.                                                                                                                                                                                                                                                                          |
| `routes/reference/+page.svelte` |    777 | **pattern** for an OP-XY CC-map reference page.                                                                                                                                                                                                                                                                                                                                                     |

### 2.8 Tests and CI

**Unit tests.** The `server` project runs in node, the `client` project in real Chromium. Suites:

| Suite                        | What it checks                                  |
| ---------------------------- | ----------------------------------------------- |
| `messages`                   | codec                                           |
| `smf`, `steps`               | file codec                                      |
| `patterns`                   | mini-notation                                   |
| `harmony`                    | chord naming                                    |
| `melodies`                   | range and overlap for every melody              |
| `synth`                      | timeScale                                       |
| `render`                     | FFT                                             |
| `render.svelte`              | real `OfflineAudioContext` in the browser       |
| `curriculum`, `references`   | the registry and citations agree with the files |
| `nav`, `focus`, `icon-scale` | rule tests that scan the source                 |

`expect.requireAssertions: true` is set.

**E2E tests.** `smoke` (7 tests: every surface loads, a key press produces a decoded message). `lessons` (every lesson renders; any `pageerror` or console error fails the run). `mobile` (6 tests at 375×812 with touch: tab-bar targets ≥ 44 px, key width ≥ 28 px, headings scale down).

**Untested.** `access`, `engine`, `bus`, `clock`, `player`, `monitor`, `notestate`, `router`, `sysex`, `rpn` and `profile`. Most importantly, **no e2e test ever exercises a MIDI port**, because headless Chromium has none, so only the fallback path is covered. We need a fake Web MIDI implementation (§5.3).

**CI (`deploy.yml`).** On a push to `main` or a manual run: Node 22, `npm ci`, install Playwright Chromium, `check` and `lint`, unit then e2e (before the build, so e2e doesn't leave a `build/` without the base path), build with `BASE_PATH=/<repo>`, `cp build/index.html build/404.html` as the SPA fallback, `configure-pages` with `enablement: true`, upload, deploy. Concurrency group `pages` with `cancel-in-progress: false`.

### 2.9 Defects and pitfalls found while reading (fix these when porting)

1. **Channel is not validated in `messages.ts` `encode()`.** It computes `Status.NoteOff | msg.channel` without a range check. With `channel: 16`, a human-numbered channel passed by mistake, the result is `0x80 | 0x10 = 0x90`: a **Note On on channel 1**. A CC on 16 likewise becomes a Program Change. For an LLM-driven pipeline this must be a thrown error at the boundary. Masking with `& 0x0f` would not fix it; it would just send to the wrong channel.
2. **The TE manufacturer ID in `constants.ts` is wrong.** It is listed under `'21:0f'`. A community protocol writeup for TE's EP-133 frames every message as `F0 00 20 76 …`. With the current table the OP-XY's Identity Reply would print as "unknown (00 20 76)". Fix it to `'20:76'`, then confirm against the OP-XY's own reply (the device-probe work in `research/device/identity.py`).
3. **Silent clamping in `encode()`.** `clamp7` quietly clamps out-of-range values (note 130 becomes 127), and SysEx payload bytes of `0x80` or more are not rejected. Validate and reject instead. The notation parser already takes this stance and throws.
4. **Presentation mixed into the protocol.** `messages.ts` holds Tailwind class names, and `describe()` and `shortLabel()` assume GM. Split them, and make the description profile-aware (on the OP-XY, CC 32 is filter cutoff).
5. **`smf.ts` `writeMidiFile` can throw.** `out.push(...chunk('MTrk', b))` spreads a whole track into function arguments. In V8 this throws `RangeError: Maximum call stack size exceeded` somewhere between 120k and 150k bytes (reproduced in Node: 120k works, 150k throws). Use a growable `Uint8Array` writer.
6. **`smf.ts` reader has several gaps.**
   - There are no bounds checks, so a truncated file reads `undefined`.
   - The header comment says it reuses `RunningStatusParser`; it doesn't.
   - Text meta events are decoded as UTF-8, but files are often Latin-1.
   - SMPTE time division is "normalised" to ticks per second.
   - `summarise()` and `flatten()` ignore the tempo map: the last tempo wins and playback drops tempo changes.
7. **`clock.svelte.ts` master clock problems** (details in §4).
   - Time comes from `AudioContext.currentTime`, which stays frozen while the context is suspended and needs a user gesture to resume.
   - Ticks come from main-thread `setInterval`, which Chrome throttles in hidden tabs.
   - When the timer wakes late, every missed tick is sent in one burst with timestamps already in the past.
   - Start, Stop and SPP go out "now" instead of on the tick grid.
   - External ticks are stamped with `performance.now()` rather than the event's own timestamp.
8. **`player.svelte.ts` `stop()` can leave notes stuck on hardware.** It sends CC 123 immediately, but Note Ons already queued with future timestamps (up to 150 ms ahead) still arrive after it. Chrome has no `MIDIOutput.clear()` to cancel them. The internal synth is unaffected because Web Audio events can be cancelled. `StepSequencer` avoids the problem by scheduling each note-off together with its note-on.
9. **`access.svelte.ts` gaps.**
   - Ports are never `close()`d. Setting `onmidimessage = null` leaves the port open, and on Windows an open port may lock other apps out (verify).
   - Ports are remembered by ID only.
   - There is no `PermissionStatus.onchange` handling and no SysEx auto-resume.
   - Errors are stored as raw message strings, and send failures only reach `console.error`.
10. **`engine.svelte.ts` `panic(thorough)`** sends 64 CCs plus 2,048 Note Offs in one burst, which risks overflowing the device's input buffer. It also emits duplicate bus events, one per output.
11. **Duplicate keys in `JitterPlot.svelte` and `LatencyTest.svelte`.** Both key `{#each}` by the measured value, `(v)` and `(s)`. Interval values from coarsened timestamps (100 µs steps in Chrome) will repeat, which is a Svelte `each_key_duplicate` failure. Key by index.
12. **`Keyboard.svelte` glissando probably doesn't work.** It calls `setPointerCapture` on pointerdown and then relies on `pointerenter` from neighbouring keys to slide between notes. While a pointer is captured, boundary events aren't sent to other elements, so sliding likely does nothing (verify). Use `document.elementFromPoint` inside `pointermove` instead.
13. **`monitor.svelte.ts` minor issues.** `#rateWindow` is only trimmed in rAF, so it grows without bound while hidden; the `since` variable is dead; and it calls `splice` on every event once at capacity.
14. **Deprecated paths API.** `nav.ts` builds links from `base` in `$app/paths`, which is deprecated in favour of `resolve()`, and the `svelte/no-navigation-without-resolve` lint rule is turned off.
15. **`routes/lab/monitor/+page.svelte` `exportTsv()`** revokes its object URL synchronously, which is the exact bug `utils.downloadFile()` exists to avoid.
16. **The `OP_XY` profile is not usable data.** It is one channel with 13 CCs, all unverified, no per-track model, and no BPM semantics for CC 80. Replace it.
17. **`sandbox/api.ts` runs code via `new Function`.** That is fine for a user's own console and must never be used for model output.
18. **`router.svelte.ts` has no echo detection.** The OP-XY has a configurable MIDI echo, so our own notes can come back to us as input. Direction tagging prevents infinite loops but not double counting.

---

## 3. Web MIDI handling worth keeping

### 3.1 Status machine (`access.svelte.ts`)

`status` moves through `unsupported → idle → requesting → granted | denied`, and `error` holds the
browser's message. `unsupported` is set when `'requestMIDIAccess' in navigator` is false. The UI is
driven entirely by `status`:

- `DevicePanel.svelte` shows a "Connect MIDI" button with "Asking…" while pending.
- When the browser lacks Web MIDI, it shows an honest explanation plus "everything else still works".
- When no inputs are found, it says "Plug something in — the list updates itself".

### 3.2 Permission flow, including SysEx

- **Nothing is requested on load.** Current Chromium prompts for _any_ MIDI access, so
  `request(false)` only runs from a user action.
- **Auto-resume.** The constructor calls `navigator.permissions.query({ name: 'midi' })`. If the
  result is `granted`, it re-requests without a prompt. Firefox throws on the unknown permission name;
  that is caught, and the user simply clicks Connect.
- **The request itself** is `navigator.requestMIDIAccess({ sysex, software: true })`.
- **SysEx is a second, separate gate.** `enableSysEx()` re-requests with `sysex: true` (a second
  prompt), then restores every port that was being listened to. The UI explains why: SysEx "can reach
  a device's firmware".
- **SysEx sending is careful.** `SysExLab` refuses malformed messages (`validateSysEx`: F0…F7 framing
  with only data bytes in between) and sends only on an explicit button press.

**Add for us:**

- Query `{ name: 'midi', sysex: true }` so a SysEx grant can also auto-resume.
- Subscribe to `PermissionStatus.onchange`.
- Decide whether we need SysEx at all. Identity Request/Reply is SysEx, so if the OP-XY answers it we
  need the gate. If we can do without, we avoid Chrome's much scarier "control and reprogram your
  MIDI devices" prompt.

### 3.3 Browser support and the Safari fallback

caniuse (September 2026):

- **Not supported:** Safari on macOS and iOS, and Firefox for Android.
- **Supported:** Chrome 43+, Edge 79+, Firefox 108+.

midilab degrades to its built-in synth. For us, the replica and the agent's teaching mode should
work in Safari with no device, like MIDI Lab. Also check `isSecureContext`: on plain http the API is
missing, and today that case shows the misleading "no Web MIDI in this browser" message.

### 3.4 Ports: naming, pairing, remembering

- **`PortInfo`.** Fields are `{ id, name ('Unnamed port' fallback), manufacturer, version, type,
state, connection, virtual }`. It keeps the difference between `state` (whether the device is
  physically present) and `connection` (`open`, `closed`, or `pending`, which means opened but the
  device is currently unplugged).
- **Nothing is auto-opened** ("how MIDI loops are born"). The IDs of inputs the user opened are
  remembered in `midilab:listening` and reopened only if still present.
- **Grouping into devices.** `RigDiagram` treats inputs and outputs with the same `name` as one box,
  and guesses the transport from keywords in the name (bluetooth/ble/widi, network/rtp, usb,
  iac/virtual/loop).
- **What we need instead.** Auto-detect the OP-XY with a regex like `/op[-\s]?xy/i` on `name` and/or
  "teenage" in `manufacturer`. Web MIDI does not expose USB VID/PID, so confirm the real port strings
  on each OS from `research/device/`. Pair its input and output, and remember
  `{name, manufacturer}` rather than only `id`, since IDs aren't guaranteed stable across operating
  systems or re-plugs. Exact-name pairing can break on Windows-style names such as
  `MIDIIN2 (…)`/`MIDIOUT2 (…)`.

### 3.5 Hot-plug

`access.onstatechange = () => refresh()` rebuilds both port lists, drops listeners for ports that
disappeared, and re-listens to remembered ports that came back. The spec already reconnects a port
that was left `pending`, so this is belt and braces. Keep it, and add a device-health store:
connected or reconnecting, time of the last message received, last send error.

### 3.6 Receiving

`port.onmidimessage = handler`. Per the spec, setting the handler implicitly opens the port. Each
event is emitted on the bus as `{ time: event.timeStamp || performance.now(), portId, portName,
direction: 'in', bytes, message: parse(bytes) }`. Web MIDI delivers one complete message per event,
so `parse()` is enough; `RunningStatusParser` is only needed for files and raw streams.

For us, call `open()` and `close()` explicitly. Setting `onmidimessage` allows a single owner per
port, so use `addEventListener` if more than one consumer needs the port.

### 3.7 Sending and error states

`sendRaw(portId, bytes, at?)` calls `port.send(bytes, at)` inside a try/catch, returns `false` on
failure, and logs to `console.error`. `at` is in the `performance.now()` domain. What the spec says
can go wrong, and what we should do about it:

| Call                | Error (current spec)                                     | Meaning                                                                | midilab                       | We should                                                                 |
| ------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------- |
| `requestMIDIAccess` | `NotAllowedError`                                        | the user, a setting, or Permissions Policy denied access               | `denied` with the raw message | Say where to re-enable it (the site-settings lock icon) and offer a retry |
|                     | `InvalidStateError` / `NotSupportedError` / `AbortError` | the system MIDI layer failed / other failure / page is navigating away | same                          | Show a distinct message; allow a retry                                    |
| `send`              | `TypeError`                                              | invalid bytes (running status, a data byte ≥ 0x80)                     | logged                        | Can't happen if `encode()` validates; treat as a bug                      |
|                     | `NotAllowedError`                                        | SysEx sent without SysEx permission                                    | logged                        | Gate in our policy layer before sending                                   |
|                     | `InvalidStateError`                                      | port disconnected                                                      | logged                        | Mark the device as reconnecting and queue or drop per policy              |

Timestamps that are omitted, zero, or in the past mean "as soon as possible", and messages with the
same timestamp keep their order. `MIDIOutput.clear()` exists only in Firefox 108+, not in
Chrome/Edge, so in Chrome a timestamped message cannot be recalled once it has been handed over.

### 3.8 Safety posture to keep

- No auto-open.
- A separate SysEx gate, and validation before any send.
- Routes publish their output as `out`, so they can never feed themselves, and a route back to its
  source port is refused outright.
- Panic is three stages: CC 64=0, CC 123, CC 120, CC 121, then optional explicit Note Offs.
- The Troubleshooter's rule: check the free, common problems first.

### 3.9 Checklist of gaps to close for the OP-XY

1. OP-XY auto-detection and in/out pairing, remembered by name and manufacturer.
2. Explicit `open()` and `close()`, and release ports when idle (verify Windows exclusivity).
3. Error-name mapping, plus a device-health store surfaced in the UI.
4. SysEx permission query and `onchange`; an allowlist for outgoing SysEx (Identity Request only by
   default).
5. An outbound policy layer. Every send passes validate → allow/confirm/deny → pace → journal. This
   comes straight from the vision's ground rules. For example, CC 86 (project load) and anything
   else that changes device state is announced first.
6. Echo detection, for when the OP-XY's COM echo setting is on.
7. An `isSecureContext` check.
8. Use `MIDIOutput.clear()` when it exists (Firefox).

---

## 4. Timing and scheduling

### 4.1 What midilab does

**`Transport` (`clock.svelte.ts`).**

- **Scheduling loop.** A 25 ms `setInterval` looks 120 ms ahead. Internal resolution is PPQ 96.
  Each tick carries `audioTime` (`AudioContext.currentTime`) and
  `perfTime = audioToPerf(audioTime)`.
- **Clock correlation.** `audioToPerf` correlates the two clocks with
  `ctx.getOutputTimestamp()` (`performanceTime + (t − contextTime)·1000`). That lines MIDI up with
  the moment the audio is actually _heard_, output latency included. When correlation isn't
  available it falls back to sampling `currentTime`.
- **Clock out.** When `sendClock` is on, F8 goes out every 4 internal ticks (96/24) with
  `perfTime`. Start (FA), Continue (FB), Stop (FC) and SPP (`F2 00 00` on rewind) are sent at
  `performance.now()`.
- **Loop and tempo.** Looping wraps the tick counter. Tempo changes take effect at the next
  unscheduled tick, so up to 120 ms late. Tap tempo averages the last 4 intervals.
- **External-clock follower.** Deltas come from each F8's `event.timeStamp`. Gaps of 200 ms or more
  are ignored. A rolling window of 96 intervals gives `BPM = 60000 / (mean·24)` and jitter as σ, once
  at least 8 samples exist. A presence watchdog drops "present" after 1 s without clock.
  Start/Continue/Stop/SPP drive `playing` and `tick`, and one F8 advances the tick by 4.

**`SequencePlayer` (`player.svelte.ts`).** Same discipline with 150 ms of lookahead. Loops advance
the origin arithmetically so wake-up lateness doesn't accumulate, and only one demo sounds at a time.

**`StepSequencer`.** Places every step at the tick's own timestamp and schedules the note-off at the
same moment as the note-on (0.85 × step), so stopping never leaves a note hanging.

**Demonstration tools.** `SchedulerLab` compares naive `setTimeout` playback with lookahead playback
under a 120 ms main-thread stall. `LatencyTest` measures round-trip time through a loopback over 24
probes (note 126 on channel 16).

### 4.2 Suitability for driving the OP-XY (notes, CCs, parameter moves)

The discipline is right and should be kept: never fire from a timer, always
`output.send(bytes, t)` with a planned timestamp, and pair note-offs with note-ons. Four changes are
needed:

1. **Drop the AudioContext as master clock.** A suspended context's `currentTime` doesn't move, so
   the scheduler plans about 0.12 s and then stalls. Resuming needs a user gesture, and
   agent-initiated playback often happens after that short activation window has expired. For
   hardware-only use, schedule in the `performance.now()` domain, which is the domain Web MIDI
   timestamps already use. Keep `audioToPerf` only as an adapter for an optional preview synth.
2. **Get the tick off the main thread.** Chrome checks timers in hidden pages once a second, and once
   a minute after 5 minutes hidden, chained, silent. A page that made sound in the last 30 s is
   exempt. With a 120 ms lookahead, a 1 s wake-up creates gaps, and because midilab schedules
   past-due ticks in a burst, the device then receives a pile of late notes and F8s at once. Drive
   ticks from a dedicated Worker the way Tone.js does (verify the behaviour with our own hidden-tab
   test). When late, re-synchronise instead of bursting. A longer horizon while hidden is a partial
   fix only: Chrome cannot `clear()`, so a long horizon makes Stop and tempo changes lag.
3. **Stop and cancel semantics.** Keep a ledger of sounding notes and a `scheduledUntil` high-water
   mark. On stop, stop scheduling, then send offs for sounding notes, or All Notes Off per channel in
   use, timestamped at `max(now, scheduledUntil) + ε`. This fixes §2.11 #8. Use `clear()` where it
   exists.
4. **Pacing.** Bursts such as panic, a full parameter snapshot, or re-sending CCs after undo should
   go through a pacer (for example ≤ 1 message per ms, with CC coalescing), since USB-MIDI buffers
   are finite.

### 4.3 Suitability as a MIDI clock master for the OP-XY

In a foreground tab, midilab's F8 stream is correct: every tick is timestamped on the grid, and once
queued its delivery no longer depends on our main thread, so jitter comes mostly from the OS MIDI
stack. What's missing for a robust master:

- The worker ticker, and resync instead of bursting (above).
- Alignment. Send FA at t₀ with the first F8 also at t₀. midilab sends Start "now" and the first F8
  about 50 ms plus output latency later.
- Send SPP before Continue.
- Send FC after the last queued F8, or accept the ordering gap and document it.
- Keep clock running while stopped, if the OP-XY wants it for its tempo display (verify).
- **Detect two masters.** If F8 arrives from the OP-XY while we are sending clock, warn about two
  clock masters. The OP-XY's COM settings choose whether clock is sent and received.
- Measure our outgoing clock jitter with a loopback, using `JitterPlot` on the returning stream.
- A tempo ramp API, so the agent can say "accelerando to 128 over 4 bars".

### 4.4 Following the OP-XY's clock (the replica's playhead)

The follower (§4.1) is directly useful: it can keep the replica's step LEDs and bar/beat readout in
sync with the device.

Improvements:

- Emit ticks with the event's own timestamp.
- Interpolate between F8s (a PLL-style smoother) rather than jumping 4 PPQ at a time.
- Keep the σ jitter and presence watchdog as they are; they make good diagnostics.

### 4.5 Recommended shape (new code, informed by midilab)

```ts
interface Clock {
	now(): number;
} // ms, performance.now() domain; fake in tests
interface Ticker {
	start(cb: () => void, everyMs: number): () => void;
} // Worker-backed; fake in tests
interface Sink {
	send(bytes: number[], atMs: number): void;
} // wraps MIDIOutput.send

class Scheduler {
	constructor(
		clock: Clock,
		ticker: Ticker,
		sink: Sink,
		opts?: { lookaheadMs?: number; tickMs?: number }
	);
	add(ev: { at: number; bytes: number[]; off?: { at: number; bytes: number[] } }): void; // offs ride with ons
	stop(): void; // stop planning; release the ledger at max(now, scheduledUntil) + 1 ms
}
```

Test it with vitest fake timers and a recording `Sink`:

- no tick is emitted late or twice;
- tempo changes land on the next tick;
- stop releases every sounding note;
- being 1 s behind causes a resync, not a burst;
- clock ticks at 120 BPM are exactly 20.833 ms apart.

---

## 5. Svelte 5 conventions, code style, lint and test

### 5.1 What midilab does

- **Class-based singleton stores in `*.svelte.ts`.**
  - `$state` fields hold what the UI renders.
  - `#private` fields hold non-reactive internals: handlers, buffers, timers.
  - Getters provide derived values; `$derived` is not used inside classes.
  - Each module exports one instance, e.g. `export const midiAccess = new MidiAccessStore()`.
  - **No Svelte context anywhere.** This is safe because the app is an SPA (`ssr = false`), so there
    is no cross-request leakage.
- **Lifecycle.** Idempotent `start(): () => void` methods that return a stop function, called once
  from the root layout's `onMount` (engine, monitor, router, metronome). One exception is a side
  effect: `noteState` starts itself on import. Several modules also call into the browser at import
  or in their constructor.
- **High-frequency data.** A non-reactive buffer plus `version = $state(0)` bumped once per rAF.
  Getters read `void this.version` to subscribe. The rAF loop is restarted on `visibilitychange`.
  Svelte's built-in `createSubscriber` (`svelte/reactivity`) is not used.
- **Persistence.** `persist.load()` initialises `$state`; `$effect.root` in constructors autosaves;
  `$state.snapshot` is used before serialising.
- **Components.**
  - `interface Props` + `$props()` with defaults, `$bindable`, and `class: className` passed through
    `cn()`.
  - `$derived.by`, `untrack`, `{@const}`, and `<script module>` for state shared across instances.
  - Svelte actions (`use:rovingGrid`, `use:momentary`); attachments (`{@attach}`) are not used.
  - Maps and Sets are deliberately non-reactive, and the `svelte/prefer-svelte-reactivity` lint rule
    is off.
- **House style.** Long "why" docblocks at the top of every module and around every non-obvious
  decision, often telling the story of the bug that shaped the code. British spelling ("colour",
  "synthesiser"). TypeScript strict throughout.
- **Tooling.**
  - **Prettier:** tabs, single quotes, no trailing commas, 100 columns, `prettier-plugin-svelte` and
    `prettier-plugin-tailwindcss` with `tailwindStylesheet`.
  - **ESLint (flat config):** js, ts and svelte recommended configs, plus prettier.
  - **vitest 4:** two projects. `client` runs `*.svelte.spec.ts` in Chromium via
    `@vitest/browser-playwright`; `server` runs `*.spec.ts` in node. `requireAssertions` is on.
  - **Playwright:** `*.e2e.ts`, run against `build && preview` on port 4173.

### 5.2 Config comparison with this repo

| Aspect          | midilab                                                                                                                                                                            | op-xy-agent today                                                          | Recommendation                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Package manager | npm (`package-lock.json`, `npm ci` in CI)                                                                                                                                          | pnpm (`pnpm-lock.yaml`, `pnpm-workspace.yaml` with `allowBuilds: esbuild`) | Keep pnpm. Adapt CI and add a `packageManager` field for `pnpm/action-setup`.                                                    |
| Versions        | svelte ^5.56.1, kit ^2.63, vite ^8.0.16, TS ^6.0.3, vitest ^4.1.8, tailwind ^4.3, eslint ^10.4                                                                                     | **identical ranges** (kit 2.70.3 installed)                                | Code ports with no version friction.                                                                                             |
| Svelte config   | Inside `vite.config.ts`: `sveltekit({ compilerOptions.runes, adapter: adapter({ fallback: 'index.html' }), paths: { base } })`; a validated `BASE_PATH`; `server.port` from `PORT` | Same `sveltekit({...})` pattern, but no fallback, no paths, no PORT        | Merge midilab's base-path block, `fallback`, and `PORT`.                                                                         |
| Prettier        | tabs / single / none / 100 / svelte + tailwind; `.prettierignore` adds `references/`                                                                                               | **identical**                                                              | Keep. Ignore `research/` and `knowledge/` if they hold third-party text.                                                         |
| ESLint          | Recommended, plus `no-navigation-without-resolve: off`, `prefer-svelte-reactivity: off`, overrides for `ui/**` and `CodeSandbox`                                                   | Recommended only                                                           | Keep ours stricter. Use `resolve()`; turn off `prefer-svelte-reactivity` only under `src/lib/midi/**` hot paths, with a comment. |
| Vitest          | client + server projects, `requireAssertions`                                                                                                                                      | **identical**                                                              | Keep. Add fake-timer scheduler tests and a fake-MIDI test harness.                                                               |
| Playwright      | build+preview on 4173; separate mobile file using `test.use`                                                                                                                       | **identical** base config                                                  | Add a mobile suite and the `pageerror`/console sweep.                                                                            |
| Tailwind        | v4, `tw-animate-css`, `shadcn-svelte/tailwind.css`, fontsource Inter + JetBrains Mono                                                                                              | v4 with `@tailwindcss/forms` + `@tailwindcss/typography`                   | Keep typography: agent answers and manual excerpts render as prose. Drop forms unless used.                                      |
| `app.html`      | `viewport-fit=cover`, per-scheme `theme-color`, static OG tags                                                                                                                     | sv default                                                                 | Adopt, with our own metadata.                                                                                                    |
| `+layout.ts`    | `ssr = false`, `prerender = false`, `trailingSlash = 'never'`                                                                                                                      | none                                                                       | Adopt. Everything is client-side (Web MIDI, BYOK agent).                                                                         |
| CI/deploy       | `deploy.yml` to GitHub Pages                                                                                                                                                       | none                                                                       | Port it with pnpm (§7, item 31).                                                                                                 |
| Agent tooling   | `.claude/launch.json` (`autoPort`), shadcn skill, `.cursor` svelte MCP                                                                                                             | `.claude/settings.json` (svelte plugin), Deep Agents skills                | Add a `launch.json` running `pnpm dev`. Skip the shadcn skill.                                                                   |

### 5.3 Adopt, modernise, avoid

**Adopt:**

- The identical formatting, lint and test setup (already in place).
- Singletons for the one-per-app things: MIDI access, device, transport.
- `start()` returning a stop function, started from the root layout.
- The rAF-coalesced `version` pattern for streams.
- Strict validation at the boundary between intent and bytes.
- The rule-test idea: tests that scan the source for violations of a written rule.
- `pageerror`/console-error e2e sweeps.
- Phone-viewport e2e tests.
- "Why" docblocks, somewhat tighter than midilab's.

**Modernise:**

- **Split `src/lib/midi` into layers.** `core/` holds pure TypeScript with no `$app/*` imports, no
  runes and no DOM, so node tests and the agent runtime can import it. `web/` holds thin reactive
  adapters over it.
- **Use factories with injected dependencies**, for example
  `createMidiAccess({ requestMIDIAccess, permissions })`, with the singleton built from browser
  defaults. No side effects on import.
- **Use `createSubscriber`** for views backed by the bus.
- **Use attachments (`{@attach}`)** instead of actions in new code.
- **Use `resolve()`** instead of a hand-written `path()`.
- **Add a fake Web MIDI for tests.** A `page.addInitScript` stub for `navigator.requestMIDIAccess`
  that emulates an OP-XY input/output pair, so e2e covers the connected path. midilab never tested
  it.

**Avoid:**

- Side-effectful imports.
- One bus event per output.
- Silent clamping.
- `new Function` anywhere near model output.

---

## 6. UI and design-system notes

The new app wants a Teenage Engineering / OP-XY look, not shadcn defaults. Port midilab's _system_
and none of its _look_.

**What midilab uses.**

- shadcn-svelte 1.x (`mira` style, `mist` base colour, translucent menus) on bits-ui 2.
- tailwind-variants, tailwind-merge, tw-animate-css.
- Hugeicons (free set).
- Inter Variable and JetBrains Mono Variable via fontsource.
- mode-watcher is installed, but its own theme store is what actually runs.
- sonner, vaul, paneforge, embla, formsnap/superforms and layerchart are installed, and mostly
  unused.

**Tokens in `layout.css`.**

- **oklch semantic tokens** using shadcn names, defined on `:root` and `.dark`. They are wired into
  Tailwind via `@theme inline`, which bakes each token's value into the utility.
- **A message-colour language:** 7 family hues plus `-bg` tints. In light mode they are all at one
  lightness (L 0.5), so none shouts louder than another. In dark mode they are retuned.
- **A separate channel axis:** 16 hues whose lightness comes from `--channel-l`.
- **Structural tokens:** `--wire`, `--grid-line(-strong)`, `--staff-line`,
  `--surface-sunken/raised`, `--key-white/black`, `--ring-on-key-white/black`, `--readout`, `--ok`,
  `--warn`.

**Typography.**

- **One ~1.18 ladder** that _redefines_ Tailwind's steps rather than adding new ones: 9/10/11/13/15/
  17/21/26/32/40 px. It lives in a non-inline `@theme` so it can be retuned per breakpoint; below
  `md` the display sizes shrink by about 20%.
- **`body` is 13 px.**
- **`.tnum`** gives tabular numerals with a slashed zero.
- **`.label`** is the uppercase micro-label (10 px, 0.07em tracking), used only as a structural
  caption.
- **Prose measure is `--measure: 33rem`**, applied by default to lesson and workbench paragraphs.
- **Mono is set at 0.92em inside prose.**

**Rules worth adopting whatever the look.** These come from PLAN.md §7 and `layout.css`:

- A fixed ladder with no in-between sizes, enforced the way `icon-scale.spec.ts` enforces the four
  icon sizes (11, 14, 18, 22).
- A radius ladder (xs 2 px to full), with the bare `rounded` utility banned.
- Three surface levels in both themes. Chrome is recessed relative to content.
- Contrast is _measured_ (≥ 4.5:1 for text, ≥ 3:1 for focus rings) rather than judged. There is no
  faint third text tier. PLAN mentions a canvas-based checker, but it is not in the repo.
- **Physical objects keep their colours in both themes.** "Ivory stays ivory when the page goes dark",
  with focus rings tuned to the key surface. This is exactly the replica's situation.
- Every custom control is a real control: a `button` or `role=slider`, with Enter/Space and arrow
  keys working. Grids are a single tab stop.
- A pointer press does not take focus away from where you are playing.
- Reduce-motion is seeded from the OS, while meters keep moving via rAF.
- `h-dvh`, safe-area utilities, and a 44 px `touch-target` pseudo-element.
- Empty states say what is missing, what the panel will do once it isn't, and offer the one action
  that fixes it.

**What not to bring:**

- The shadcn `mira` skin and its 55 generated components.
- Inter as the voice of the product.
- Hugeicons as the icon language.
- Cards everywhere. MIDI Lab itself moved away from them: `InstrumentPanel`'s "enclosure, not
  dashboard" and the "take the cards off the lab tiles" commits.

**Implications for TE/OP-XY.**

- Derive the accent and family palette from the OP-XY's own printed and encoder colours, measured
  from the device and photos. Keep the idea of family hue versus channel/track hue.
- Choose a licence-clean typeface pairing for the device-label style and the screen (design research
  item). TE's own fonts are presumably not redistributable (verify).
- Draw custom pictograms that match the device's printed icons.
- Where accessible primitives are needed (Dialog, Popover, Tooltip, Tabs, Command), use headless
  bits-ui, styled from scratch.

---

## 7. Port list (for later; nothing has been copied)

**Target layout.** It proposes this layering, following §5.3.

```
src/lib/midi/
  core/      pure TS: messages, notes, constants, sysex, rpn, smf, bus, route, validate, policy
  web/       browser adapters: access, output (send path), monitor, device-state, scheduler, tick-worker,
             clock-follower, expect, session
  devices/   profile.ts (types + adapter), opxy.ts (researched OP-XY profile)
src/lib/music/   notation, melodies, harmony, (patterns later)
src/lib/a11y/    roving, momentary
test/fakes/      fake-midi.ts (FakeMIDIAccess with an "OP-XY" port pair), used by unit and e2e tests
```

Every copied file gets a provenance line, e.g. `// Adapted from MIDI Lab (NeoVand/midilab), src/lib/midi/…`.
midilab has no LICENSE file. It is the owner's own code, so relicensing it under this repo's open
source licence is the owner's call; record that decision in the repo (a NOTICE file).

| #   | From (`midilab/…`)                                                                                          | To (`op-xy-agent/…`)                                                                         | Verdict                 | Required changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Tests                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/lib/midi/messages.ts`                                                                                  | `src/lib/midi/core/messages.ts`                                                              | adapt                   | (a) Move `FAMILY_CLASS`, `familyClasses`, `familyColor`, `FAMILY_LABELS` to `src/lib/ui/midi-colours.ts`; keep `family()`. (b) `encode()` and a new `assertValid()` reject a non-integer channel outside 0–15, data outside 0–127, and SysEx payload bytes ≥ 0x80, with a typed `MidiRangeError`; keep `clamp7` for UI controls only. (c) Make `describe()`/`shortLabel()` accept a profile for CC names, and make GM wording opt-in. (d) Remove the redundant ternary in `RunningStatusParser`. | Port `messages.spec.ts`. Add: channel 16 is rejected; a SysEx `0x80` byte is rejected; `describe()` with the OP-XY profile.                                                     |
| 2   | `src/lib/midi/notes.ts`                                                                                     | `core/notes.ts`                                                                              | copy                    | None. Check which octave label (C3 or C4) the OP-XY screen uses for note 60 and set the default.                                                                                                                                                                                                                                                                                                                                                                                                 | Add a small spec (`parseNoteName` ↔ `noteName` round trip).                                                                                                                     |
| 3   | `src/lib/midi/constants.ts`                                                                                 | `core/constants.ts`                                                                          | adapt                   | Replace the `'21:0f'` TE entry with `'20:76': 'Teenage Engineering'`, then confirm via Identity Reply. Label the CC table as the GM convention layer.                                                                                                                                                                                                                                                                                                                                            | Test `manufacturerName([0,0x20,0x76])`.                                                                                                                                         |
| 4   | `src/lib/midi/sysex.ts`                                                                                     | `core/sysex.ts`                                                                              | copy                    | Add `isAllowedOutgoingSysEx(bytes)` (allowlist: the Universal Identity Request only).                                                                                                                                                                                                                                                                                                                                                                                                            | A TE-shaped Identity Reply fixture; `validateSysEx` cases.                                                                                                                      |
| 5   | `src/lib/midi/rpn.ts`                                                                                       | `core/rpn.ts`                                                                                | copy                    | None. Low priority.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Round trip `rpn()` through `RpnParser`.                                                                                                                                         |
| 6   | `src/lib/midi/bus.ts`                                                                                       | `core/bus.ts`                                                                                | adapt                   | Add `source: 'device' \| 'user' \| 'replica' \| 'agent' \| 'system'` and an optional `cause` (agent tool-call ID, for undo and audit). Make the ID counter per instance.                                                                                                                                                                                                                                                                                                                         | Listener isolation; ordering.                                                                                                                                                   |
| 7   | `src/lib/midi/smf.ts`                                                                                       | `core/smf.ts`                                                                                | adapt                   | A growable `Uint8Array` writer (no spreading into `push`); a bounds-checked reader with typed errors; a tempo map with `tickToMs()`; a Latin-1 fallback for text meta; keep SMPTE but flag it; fix the stale header comment.                                                                                                                                                                                                                                                                     | Port `smf.spec.ts`. Add: running status inside tracks, SysEx events, a truncated file throwing a typed error, a 200 KB track writing and reading back, a tempo change mid-file. |
| 8   | `src/lib/midi/router.svelte.ts` (`transform`, `passes`, `MessageFilters`, `ALL_PASS` only)                  | `core/route.ts`                                                                              | adapt                   | Extract the pure functions; drop the `Router` class for now (a possible future "keyboard → OP-XY thru").                                                                                                                                                                                                                                                                                                                                                                                         | Transpose out of range yields null; remap; split range.                                                                                                                         |
| 9   | `src/lib/midi/harmony.ts` + spec                                                                            | `src/lib/music/harmony.ts`                                                                   | copy                    | None.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Port `harmony.spec.ts`.                                                                                                                                                         |
| 10  | `src/lib/midi/access.svelte.ts`                                                                             | `web/access.svelte.ts`                                                                       | adapt                   | (a) Factory with injected `requestMIDIAccess` and `permissions`, and an explicit `init()` instead of the constructor side effect. (b) OP-XY detection and in/out pairing; remember `{name, manufacturer}`. (c) Explicit `open()` and `close()`; close on idle and `pagehide`. (d) Query `{name:'midi', sysex:true}` and subscribe to `onchange`. (e) Error-name mapping to guidance; send failures go to a `health` store. (f) An `isSecureContext` branch.                                      | Unit tests with `FakeMIDIAccess`: grant, deny, hot-plug (connect/disconnect/pending), re-listen, and the SysEx upgrade restoring listeners.                                     |
| 11  | `src/lib/midi/engine.svelte.ts`                                                                             | `web/output.svelte.ts`                                                                       | pattern (rewrite)       | A single `send(msgs, {at, cause})` choke point: validate → policy (allow, confirm, or deny; state-changing CCs such as project load need user confirmation; SysEx must be allowlisted) → pacer → undo journal → `port.send` → **one** bus event with `targets[]`. Keep the `onLocalSend` idea. `panic()` is paced and scoped to channels in use. The preview synth is an optional target, not hard-wired.                                                                                        | Policy denies SysEx that isn't allowlisted; the journal records inverses; the pacer spaces a burst of 2,000.                                                                    |
| 12  | `src/lib/midi/monitor.svelte.ts`                                                                            | `web/monitor.svelte.ts`                                                                      | adapt                   | Trim `#rateWindow` on ingest; delete dead code; search over `describe()` text; optionally `createSubscriber`; no auto-start.                                                                                                                                                                                                                                                                                                                                                                     | Unit test with a fake rAF: capacity, filters, export.                                                                                                                           |
| 13  | `src/lib/midi/notestate.svelte.ts`                                                                          | `web/device-state.svelte.ts`                                                                 | adapt                   | Becomes the OP-XY mirror: a track↔channel map from the profile; add sustain and poly aftertouch; map the last CC value to semantic parameters through the profile; no start on import.                                                                                                                                                                                                                                                                                                           | Held notes, CC 123 clearing, per-track parameter view.                                                                                                                          |
| 14  | `src/lib/midi/clock.svelte.ts`, `player.svelte.ts`, `StepSequencer.svelte` tick handler                     | `web/scheduler.ts`, `web/tick-worker.ts`, `web/transport.svelte.ts`, `web/clock-follower.ts` | pattern (rewrite)       | Per §4.5: `performance.now()` domain; worker ticks; note-offs carried with note-ons; a `scheduledUntil` high-water mark and flush on stop; resync instead of bursting; FA/F8 alignment; SPP before FB; two-master detection. The follower uses event timestamps and interpolates. Keep the midilab tap-tempo and σ-jitter maths.                                                                                                                                                                 | Fake timers plus a recording sink (§4.5 list).                                                                                                                                  |
| 15  | `src/lib/midi/devices/profile.ts`                                                                           | `devices/profile.ts` + new `devices/opxy.ts`                                                 | adapt                   | Extend the types with `scope: 'track' \| 'global'` (global CCs such as 80–86 are "any channel"); `trackTypes`; a per-track channel map; `firmware: {min, max}`; `valueMap` (enum, BPM curve, dB); `provenance: 'manual' \| 'community' \| 'probed'` plus the firmware version it was verified on; `stateChanging: boolean` for the policy layer. Replace midilab's `OP_XY` data with the researched map (`00-initial-deep-research.md`) as it gets verified.                                     | `set()` for each protocol kind; clamping vs rejection; `explain()`.                                                                                                             |
| 16  | `Checkpoint.svelte` + `progress.svelte.ts` (pattern)                                                        | `web/expect.ts`                                                                              | pattern (new)           | `expectEvent(test, { count, key, timeoutMs, signal }): Promise<MidiEvent[]>`, with errors in the predicate isolated. The UI checkpoint and the agent's "wait for the user" tool both build on it.                                                                                                                                                                                                                                                                                                | Resolves on the nth distinct key; timeout; abort.                                                                                                                               |
| 17  | `SandboxSession` in `sandbox/api.ts` (pattern)                                                              | `web/session.ts`                                                                             | pattern (new)           | Tracks timers, subscriptions, scheduled events and held notes for one agent run or tool call; `dispose()` cancels and releases through the scheduler flush. No code evaluation.                                                                                                                                                                                                                                                                                                                  | Dispose releases everything.                                                                                                                                                    |
| 18  | `src/lib/music/notation.ts`                                                                                 | `src/lib/music/notation.ts`                                                                  | adapt                   | Move `NoteSpec` into `music/types.ts`. Add ties, tuplets, explicit velocity (`C4@96`) and bar-count validation. Add `quantiseToSteps(notes, {stepsPerBar: 16, …})` for the OP-XY grid. Keep the strict errors. Document the grammar in the agent's tool schema.                                                                                                                                                                                                                                  | Port the parser part of `melodies.spec.ts`; add quantiser cases.                                                                                                                |
| 19  | `src/lib/music/melodies.ts` + spec                                                                          | `src/lib/music/melodies.ts`                                                                  | copy                    | None (keep the provenance fields). Import `NoteSpec` from `types.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                            | Port `melodies.spec.ts`.                                                                                                                                                        |
| 20  | `src/lib/a11y/roving.ts`, `momentary.ts`                                                                    | `src/lib/a11y/`                                                                              | copy                    | Optionally convert to `{@attach}`.                                                                                                                                                                                                                                                                                                                                                                                                                                                               | A browser-mode spec for arrow movement.                                                                                                                                         |
| 21  | `src/lib/utils.ts` (`capturePointer`, `downloadFile`)                                                       | `src/lib/utils/dom.ts`                                                                       | copy                    | None.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | none                                                                                                                                                                            |
| 22  | `src/lib/stores/persist.ts`, `stores/device.svelte.ts`                                                      | `src/lib/stores/persist.ts`, `stores/viewport.svelte.ts`                                     | copy                    | Change the prefix to `opxy:`; rename device → viewport.                                                                                                                                                                                                                                                                                                                                                                                                                                          | none                                                                                                                                                                            |
| 23  | `components/midi/MidiMonitor.svelte`, `ByteInspector.svelte`, `ActivityStrip.svelte`, `ChannelState.svelte` | `src/lib/components/devtools/`                                                               | adapt                   | Restyle off shadcn (headless bits-ui or native elements); virtualise the list; use the one-event-per-message bus.                                                                                                                                                                                                                                                                                                                                                                                | Browser-mode render test with a fake bus.                                                                                                                                       |
| 24  | `components/midi/CcLearn.svelte`, `SysExLab.svelte`, `TempoField.svelte`                                    | `src/lib/components/devtools/`                                                               | adapt                   | SysExLab behind a dev flag, allowlist enforced. CcLearn feeds the OP-XY map verification workflow.                                                                                                                                                                                                                                                                                                                                                                                               | none                                                                                                                                                                            |
| 25  | `components/midi/JitterPlot.svelte`, `LatencyTest.svelte`                                                   | `src/lib/components/devtools/`                                                               | adapt                   | Key `{#each}` by index; LatencyTest targets the paired OP-XY ports (only works if echo or thru is on; verify).                                                                                                                                                                                                                                                                                                                                                                                   | none                                                                                                                                                                            |
| 26  | `Keyboard.svelte`, `Knob.svelte`, `PadGrid.svelte`, `Fader.svelte` (logic only)                             | `src/lib/replica/input/keybed.ts`, `encoder.ts`                                              | pattern                 | Extract the multi-pointer map, velocity-from-hit-position, typing row (release by the note started), and Enter/Space activation. Slide-to-play via `elementFromPoint`. The encoder is relative, with Shift for fine steps and the wheel only when focused. OP-XY-styled visuals are new.                                                                                                                                                                                                         | Browser-mode pointer tests.                                                                                                                                                     |
| 27  | `Scope.svelte` (pattern)                                                                                    | `src/lib/components/audio/Spectrum.svelte`                                                   | pattern                 | audioMotion-analyzer on a `MediaStreamSource` from the OP-XY USB audio (echo cancellation, noise suppression and AGC off); theme colours read from CSS variables.                                                                                                                                                                                                                                                                                                                                | none                                                                                                                                                                            |
| 28  | `src/lib/audio/render.ts` (`fft` only) + `render.spec.ts` (FFT part)                                        | `src/lib/audio/fft.ts`                                                                       | copy                    | None.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Port the four FFT tests.                                                                                                                                                        |
| 29  | `src/lib/audio/engine.ts`, `synth.ts`, `presets.ts`, `drums.ts` (+ `synth.spec.ts`)                         | `src/lib/audio/`                                                                             | adapt (optional, later) | Only if we ship a no-hardware demo mode. Remove the GM/smplr coupling.                                                                                                                                                                                                                                                                                                                                                                                                                           | Port `synth.spec.ts` and `render.svelte.spec.ts`.                                                                                                                               |
| 30  | `src/routes/+layout.ts`; `src/app.html` viewport and theme-color lines                                      | same paths                                                                                   | copy / adapt            | Our own title, description and OG image.                                                                                                                                                                                                                                                                                                                                                                                                                                                         | none                                                                                                                                                                            |
| 31  | `.github/workflows/deploy.yml`                                                                              | `.github/workflows/deploy.yml`                                                               | adapt                   | `pnpm/action-setup@v4` plus a `packageManager` field; `setup-node@v5` with `cache: pnpm`; `pnpm install --frozen-lockfile`; `pnpm exec playwright install --with-deps chromium`; `pnpm check && pnpm lint`; `pnpm test:unit --run && pnpm exec playwright test`; `BASE_PATH=/${{ github.event.repository.name }} pnpm build`; `cp build/index.html build/404.html`; keep the Pages actions and concurrency block. No secrets are needed (bring your own key).                                    | CI itself                                                                                                                                                                       |
| 32  | midilab `vite.config.ts` (BASE_PATH block, `adapter({ fallback })`, `server.port`), `.claude/launch.json`   | our `vite.config.ts`, `.claude/launch.json`                                                  | adapt                   | Merge them. `launch.json` runs `pnpm run dev` with `autoPort`. Switch the Playwright `webServer` command to `pnpm build && pnpm preview`.                                                                                                                                                                                                                                                                                                                                                        | none                                                                                                                                                                            |
| 33  | `e2e/smoke.e2e.ts`, `lessons.e2e.ts` (the error sweep), `mobile.e2e.ts`                                     | `e2e/`                                                                                       | pattern                 | Add a `fake-midi` init script emulating an OP-XY pair and cover connect, send, receive and hot-plug. Keep a phone-size project.                                                                                                                                                                                                                                                                                                                                                                  | New                                                                                                                                                                             |
| 34  | `components/focus.spec.ts`, `icon-scale.spec.ts`, `curriculum/references.spec.ts`                           | `src/lib/**`                                                                                 | pattern                 | Rule tests tuned to our design system; a citation registry for manual sections (every cited section ID exists, and every URL is unique and parseable).                                                                                                                                                                                                                                                                                                                                           | New                                                                                                                                                                             |

**Order of work:**

1. Items 1–9 (the pure core) and 16–19, all with their tests. That is roughly one focused session.
2. Items 10–15 plus the fake MIDI implementation (10, 11 and 14 are the real design work).
3. Items 20–27 alongside replica and UI work.
4. Items 28–34 as delivery needs them.

---

## Appendix A: OP-XY claims found in midilab (unverified; hand to the device-probe work)

midilab's own `PLAN.md` §9 flags its reference docs as AI-generated and partly unverified. The
claims:

- **Sequencer resolution:** 1920 PPQN internally (lessons `midi-clock`, `ppqn-and-groove`).
- **Transport:** CC 104 = play, CC 105 = stop (`references/midi deep research claude.md` §2.1).
- **CC map:** cutoff 32, resonance 33, amp ADSR 20–23, filter ADSR 24–27, volume 7, pan 10, tempo 80.
  This agrees with the `xy-format` map in `00-initial-deep-research.md`. Documented control is by CC,
  not NRPN.
- **Physical ports and sync:** TRS MIDI is Type A. USB-C works as MIDI host and device. BLE MIDI
  carries notes and clock. The OP-XY can be clock leader or follower.
- **Program Change:** a possible off-by-one, community-reported.
- **External MIDI track:** auxiliary track 3; M1 sets channel, bank and program; M2 and M3 hold eight
  CCs.
- **SysEx manufacturer ID:** TE's ID should be `00 20 76` (see §2.9 #2). Confirm it against the
  OP-XY's Identity Reply, if it answers one at all.

## Appendix B: Sources outside the codebase

- caniuse, Web MIDI API support table (Safari macOS/iOS unsupported; Chrome 43+, Edge 79+,
  Firefox 108+; Firefox Android unsupported): https://caniuse.com/midi
- MDN browser-compat-data, `MIDIOutput.clear` (Chrome `false`, Firefox `108`):
  https://github.com/mdn/browser-compat-data/blob/main/api/MIDIOutput.json
- W3C Web MIDI API (error names for `requestMIDIAccess` and `send`; past or zero timestamps mean
  "as soon as possible"; implicit open via `onmidimessage`; `pending` connection state):
  https://webaudio.github.io/web-midi-api/
- Chrome timer throttling in hidden pages (1 s basic, 1 min intensive; pages that made sound in the
  last 30 s are exempt): https://developer.chrome.com/blog/timer-throttling-in-chrome-88
- TE SysEx header `F0 00 20 76 …` (EP-133 community protocol writeup):
  https://github.com/ZacharySBrown/ep133-ppak/blob/main/PROTOCOL.md
- The `$app/paths` deprecations (`base` and `assets` in favour of `resolve()` and `asset()`) come
  from the SvelteKit 2.70.3 installed in this repo:
  `node_modules/@sveltejs/kit/src/runtime/app/paths/public.d.ts`
