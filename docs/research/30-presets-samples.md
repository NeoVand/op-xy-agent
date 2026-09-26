# 30 — OP-XY sound content: presets, `patch.json`, samples, slicing, transfer

> Scope: `.preset` folders and `patch.json` (drum, sampler, multisampler, synth engines), sample
> formats and limits, the device folder hierarchy and how projects reference presets, the DSP
> algorithms we need (all of them portable to the browser), and file transfer (MTP / Field Kit /
> WebUSB / TE SysEx FILE). Written 2026-09-26 against OP-XY OS 1.1.33. Machine-readable companion:
> [`knowledge/presets/patch-schema.json`](../../knowledge/presets/patch-schema.json) (JSON Schema
> 2020-12). It validates all 322 device-shipped presets, both device-saved presets and the 95 pytheory
> presets.
>
> **Nothing was sent to the OP-XY for this document.** The only device-side facts I gathered myself
> came from a passive IORegistry read. Device facts from other agents are cited to
> `docs/research/90-device-probe.md`.

**Path aliases used in citations** (everything under `research/repos/` unless marked):

| Alias                    | Repo                                                               | Alias  | Repo                                                   |
| ------------------------ | ------------------------------------------------------------------ | ------ | ------------------------------------------------------ |
| `XYF:`                   | `kmorrill_xy-format/`                                              | `PS:`  | `ish-_te-opxy-patchstudio/`                            |
| `PYT:`                   | `kennethreitz_pytheory-opxy/`                                      | `SIX:` | `sixthlaw_opxy-multisampler-preset-builder/`           |
| `SF2:`                   | `charlesvestal_sf2-to-opxy/`                                       | `VIB:` | `kmorrill_op-xy-vibing/`                               |
| `BUD:`                   | `buba447_opxy-drum-tool/`                                          | `BUM:` | `buba447_OPXY-Multisample-Tool/`                       |
| `SWT:`                   | `matthewjschultz_swift-te/`                                        | `YYU:` | `YYUUGGOO_OP-XY-Drum-Utility/`                         |
| `DC:`                    | `brian3kb_digichain/` (AGPL: facts only)                           | `TEO:` | `paul-sneddon_teopxy/` (GPL: facts only)               |
| `SFZ:`                   | `legsmechanical_opxy-to-sfz/`                                      | `SLC:` | `aliosa27_op-xy-slicer/`                               |
| `FOX:`                   | `foxxyz_op-xy-patch-generator/`                                    | `NIE:` | `niekert_op-xy-drum-builder/`                          |
| `CFC:` / `CFD:` / `CFR:` | `cfurrow7_opxy-converter/` / `_dx7-opxy/` / `_rings-multisampler/` | `XYM:` | `akselele_xympler/`                                    |
| `DMK:`                   | `DimaDake_maschine-multisample-to-op-xy-converter/`                | `LGC:` | `inrainbws_logic_pro_drums_for_opxy/`                  |
| `WEB:`                   | `research/web/` (saved TE pages)                                   | `EPT:` | `research/web/firmware/ep-sample-tool/index.pretty.js` |

**Confidence tags:** **[D]** device evidence (captured `.xy` projects, device-authored files, probes);
**[O]** official TE guide or changelog; **[C]** community-tool consensus; **[H]** hypothesis or
inference. Where sources disagree, the stronger tag wins and the disagreement is noted.

---

## 1. TL;DR

1. **A preset is a folder** `<name>.preset/` holding `patch.json` and its audio files (WAV or AIFF)
   [O][D]. The folder name is the display name. The device writes `patch.json` **minified with keys
   sorted alphabetically**. That holds for all 322 shipped presets and both device-saved files, and
   everything is `"version": 4, "platform": "OP-XY"` [D].
2. **One top-level shape for every engine:** `engine`, `envelope`, `fx` (actually the **M3 filter**),
   `lfo`, `octave`, `platform`, `regions`, `type`, `version` [D]. `type` ∈ `drum | sampler |
multisampler | axis | dissolve | epiano | hardsync | organ | prism | simple | wavetable` (and
   probably `midi`) [D][C][H]. Synth presets have `regions: []` and put P1–P4 in `engine.params[0..3]`
   [D][O].
3. **We now know how region fields load, from device probes** (xy-format's 34 preset-load captures,
   which I decoded further for this doc):
   - `pitch.keycenter` → root byte.
   - `hikey` → zone-top byte.
   - `lokey` → **stored nowhere**.
   - `loop.onrelease:true` → loop type **∞ "loop forever"**. `loop.enabled:false` → **loop off**. Both
     absent → **loop until release**.
   - `tune` = signed **cents**. `gain` = **dB, −30…+20**. Drum `pan` = **−100…+100**. Drum
     `transpose` = **±48 semitones**.
   - Drum `playmode` ∈ `gate | oneshot | group | loop`. Numbers and `"key"` silently become oneshot.
   - `loop.crossfade` is frames, normalised by `framecount`. [D]
4. **Two popular tools misread `loop.onrelease`.** pytheory and sf2-to-opxy treat `true` as "loop while
   held, then play the tail". The device labels that byte ∞ [D].
5. **Multisampler zones fill down.** A zone covers the keys above the previous zone's `hikey`, up to
   and including its own. Up to **24 zones**. No velocity layers or round-robin [O][D][C]. Every factory
   multisample stores the root in the zone slot as MIDI with **`c4.wav` = 60**, so current TE naming is
   C4 = 60. Older device-made files used C3 = 60 [D].
6. **Drum kits** use keys **53–76** (24 pads). **TE's own factory layout** (22 kits, [D]) is kick,
   kick, snare, snare, rim, clap, tamb, shaker, CH, CH, OH, clave, low tom, ride, mid tom, crash, high
   tom, triangle, low conga, high conga, cowbell, guiro, metal, chi. This is the community "standard
   layout" too.
7. **Samples:** WAV or AIFF [O], mono or stereo [C], 16-bit PCM at 44.1 kHz is what the device and
   factory content use [D]. The limit is **20 s per recording** [O]. **64 MB of loaded sample memory**
   applies per project [O]. The device writes a minimal `fmt` + 36-byte `smpl` (root note, no loops) +
   `data` WAV [D]. Pitch comes from WAV metadata first, then from a note in the file name [O]. For
   presets, `patch.json` wins [D].
8. **Device tree over MTP:** `presets/` (category folders plus `snapshot/` plus user folders, any
   depth since 1.1.15), `samples/` (`user/` plus folders), `projects/` [O][D]. When a project uses a
   preset it **copies the sound parameters** but **references sample files by absolute path**
   (`/fat32/presets/<folders>/<name>.preset/<file>.wav`). So never rename, move or overwrite a preset
   that a project uses [D].
9. **Transfer, in order of preference:**
   - **(a) TE SysEx FILE over Web MIDI.** New: the OP-XY answers FILE INIT/LIST and exposes writable
     `drum/` and `synth/` directories [D, 90-device-probe]. Whether uploaded files reach the samplers
     is untested. It needs one owner-approved PUT test (§6.4).
   - **(b) WebUSB MTP.** Still Image (0x06) and vendor classes are _not_ WebUSB-protected, but the
     OP-XY's MTP-mode interface class is unknown. It will not work on Windows (WPD owns the device). MIDI
     is unavailable while in MTP mode.
   - **(c) Always-available fallback.** We write `.preset` folders to a zip or a picked folder, and the
     user drags them into Field Kit (macOS) or Explorer/Files (Windows/Linux).
10. **Everything we need to compute is sample-domain DSP:** trim, zero-crossing snap, normalise,
    onset/transient slicing, pitch detection (MPM), windowed-sinc resampling, RMS-matched loop search,
    WAV/AIFF parsing and writing. All of it ports to TypeScript and runs in a Worker. Do **not** rely on
    `decodeAudioData` for PCM: it resamples to the context rate.

---

## 2. `patch.json` — the complete schema

### 2.1 Evidence base

| Source                                                                                                                                                                                                                                                                                                                   | What it gives                                                                     | Tag |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | --- |
| `XYF:src/presets/presets/*/patch.json` — **322** presets that ship on the device's user partition (`nt-*` names; the corpus records its firmware as 1.1.4; `XYF:src/presets/README.md`)                                                                                                                                  | real values of every field; 10 types                                              | [D] |
| `XYF:src/presets/presetprojs/*.xy` — **139** projects saved after loading each preset; `XYF:docs/logs/2026-06-16_preset_corpus_analysis.md`                                                                                                                                                                              | how each JSON field lands in project bytes                                        | [D] |
| `XYF:src/preset-load-experiments/2026-06-patch-json-fields/` — **34** targeted probes (hikey vs keycenter, loop flags, crossfade, tune, gain, reverse, drum playmode); `XYF:docs/logs/2026-06-17_patch_json_field_experiment.md`                                                                                         | resolves which JSON field means what; I decoded the raw voice-slot bytes for §2.6 | [D] |
| `XYF:src/sampler-project-state/2026-06-15/presets/` — a preset **saved by the device** (`2026-06-15 (1).preset`) + its WAV                                                                                                                                                                                               | canonical device formatting, default loop points, WAV chunk layout                | [D] |
| `XYF:src/factory-preset-captures/firmware-1.1.21/` — 24 projects (18 batches plus 6 Strings) with _built-in_ factory presets loaded on every track                                                                                                                                                                       | factory multisample root notes, drum layouts, internal `content/` paths           | [D] |
| TE guide — sample, instrument, synth engines, how-to, project (`WEB:te-guide-op-xy-sample.html`, `WEB:te-guide-op-xy-instrument.html`, `WEB:te-guides_op-xy_synth-engines.html`, `WEB:te-guides_op-xy_how-to.html`, `WEB:te-guides_op-xy_project.html`) and the downloads/changelog page (`WEB:te-downloads_op-xy.html`) | UI semantics, limits, firmware history                                            | [O] |
| 20+ generators and converters (§9)                                                                                                                                                                                                                                                                                       | conventions that load in practice                                                 | [C] |

### 2.2 Top level (all engines)

| Key        | Type        | Values / range                                                                                                                  | Default for generators | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`     | string enum | `drum`, `sampler`, `multisampler`, `axis`, `dissolve`, `epiano`, `hardsync`, `organ`, `prism`, `simple`, `wavetable`, (`midi`?) | —                      | Stored as the track's engine byte: sampler 0x02, drum 0x03, organ 0x06, epiano 0x07, prism 0x12, hardsync 0x13, dissolve 0x14, axis 0x16, wavetable 0x1F, simple 0x20 (`XYF:xy/patch_json.py:19-30`) [D]. The 1.1.4 corpus has **no** `multisampler` file, but every generator emits it and op-xy-vibing saw it in device exports (`VIB:docs/opxy-preset-patch-json.md` §1.1) [C]. The external-MIDI engine was renamed `midi` in 1.0.15 (`20-midi-control.md`) and its patches can be saved (1.0.45 changelog). The JSON string is unseen [H]. |
| `version`  | int         | `4`                                                                                                                             | `4`                    | All known files [D].                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `platform` | string      | `"OP-XY"`                                                                                                                       | `"OP-XY"`              | [D]                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `octave`   | int         | factory −3…+2                                                                                                                   | `0`                    | Signed byte, track-global (`XYF:docs/logs/2026-06-16_preset_corpus_analysis.md`) [D]. Bass presets use −1/−2 (factory, `PYT:generate.py:72-103`).                                                                                                                                                                                                                                                                                                                                                                                               |
| `engine`   | object      | §2.3                                                                                                                            | —                      | [D]                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `envelope` | object      | `{amp, filter}` ADSR                                                                                                            | —                      | §2.4 [D]                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `fx`       | object      | the **M3 filter**                                                                                                               | —                      | §2.5 [D]                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `lfo`      | object      | M4 LFO                                                                                                                          | —                      | §2.5 [D]                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `regions`  | array       | per type (§2.6–2.8)                                                                                                             | —                      | Empty for synth engines [D].                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `name`     | string      | —                                                                                                                               | omit                   | **Never written by the device.** Added by PatchStudio (`PS:src/utils/patchGeneration.ts:117,289`), sf2-to-opxy and swift-te, and harmlessly ignored [C].                                                                                                                                                                                                                                                                                                                                                                                        |
| other keys | —           | —                                                                                                                               | omit                   | Unknown keys appear to be tolerated. cfurrow7 writes `rootFolderName` (`CFC:converter.js:706,2024`) [C].                                                                                                                                                                                                                                                                                                                                                                                                                                        |

**Serialisation:** the device writes minified JSON with lexicographically sorted keys at every level,
including inside regions (all 322 corpus files and both device-saved ones) [D]. Community tools
pretty-print and still load [C]. We should emit the device style (§7). All numbers are integers
except `engine.tuning[]` (floats) [D].

### 2.3 `engine`

Every key below appears in all 322 factory files, except `tuning` (25 files) [D]. Most values are
**q15** (0…32767, 16384 ≈ centre). Loading a preset copies them into the project as q16 (`value << 16`)
at fixed track offsets. The offsets are listed in `XYF:docs/logs/2026-06-16_preset_corpus_analysis.md`
[D].

| Key                                                   | Type                         | Observed (322 files)                                                                                                                                 | UI meaning                                                                                                                                                                                                                                                                                                                    | Tag                    |
| ----------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `params`                                              | int[8] q15                   | sample engines: always `16384×8`. Synth engines: `[P1,P2,P3,P4, 7616, 674, 3276, 8192]`                                                              | Synth: P1–P4 = the four M1 encoders (dark / mid / light grey / white), for example axis tone/ratio/shape/tremolo and wavetable table/position/warp/drift (`WEB:te-guides_op-xy_synth-engines.html`). **The tonal sampler ignores `params`:** its M1 block stays centred (`XYF:docs/logs/2026-06-15_sampler_project_state.md`) | [D][O]                 |
| `playmode`                                            | enum                         | poly 258 · mono 63 · legato 1                                                                                                                        | shift+M2 dark grey: poly/mono/legato (`WEB:te-guide-op-xy-instrument.html` §14.2). In the project: poly = `0x15555555`, mono = `0x3FFFFFFF`, so legato is probably `0x6AAAAAAA` (1/6, 3/6, 5/6 of range) [H]                                                                                                                  | [D][O]                 |
| `portamento.amount`                                   | q15                          | 0 (184), 128 (86), …31357                                                                                                                            | shift+M2 mid grey: glide time                                                                                                                                                                                                                                                                                                 | [D][O]                 |
| `portamento.type`                                     | q15                          | 32767 (320), 0 (2)                                                                                                                                   | curve. PatchStudio: 0 = linear, 32767 = exponential (`PS:src/utils/patchGeneration.ts:312-314`)                                                                                                                                                                                                                               | [D][C]                 |
| `bendrange`                                           | q15                          | 8191, 9557, 13433, 13653, 19113, 28671, 32767                                                                                                        | shift+M2 light grey. Every value but one maps to a whole semitone on a 0–24 (or 0–48) scale: 8191→6, 13653→10, 19113→14, 28671→21, 32767→24                                                                                                                                                                                   | [D] values / [H] scale |
| `volume`                                              | q15                          | 9334…25670 (modes 24901, 18348, 23591)                                                                                                               | shift+M2 white: **preset volume**, separate from track level                                                                                                                                                                                                                                                                  | [D][O]                 |
| `velocity.sensitivity`                                | q15                          | 0…32767 (modes 6879, 19660, 26540)                                                                                                                   | preset settings                                                                                                                                                                                                                                                                                                               | [D][O]                 |
| `width`                                               | q15                          | 0 (311), 18432, 3932                                                                                                                                 | preset settings: stereo width                                                                                                                                                                                                                                                                                                 | [D][O]                 |
| `highpass`                                            | q15                          | 0 (288), 509, 1966, 2476                                                                                                                             | preset settings: simple resonance-free HPF, separate from M3                                                                                                                                                                                                                                                                  | [D][O]                 |
| `transpose`                                           | int (semitones)              | 0 (290), 12 (32)                                                                                                                                     | preset transpose. PatchStudio UI allows −36…+36 (`PS:src/components/multisample/MultisampleAdvancedSettings.tsx:286-287`). The two raw project words fit a linear ±36.5 scale [H]. xy-format does not write it                                                                                                                | [D][C]                 |
| `tuning.root`                                         | q15 enum                     | 0, 3932, 9175                                                                                                                                        | tuning root                                                                                                                                                                                                                                                                                                                   | [D] / meaning [H]      |
| `tuning.scale`                                        | q15 enum                     | 0, 3045, 4259, 5570, 7209, 25000                                                                                                                     | tuning selector. The device offers 11 user tunings (`instrument.html` §14.5)                                                                                                                                                                                                                                                  | [D][O]                 |
| `tuning`                                              | float[12], optional          | always the same table `[0, −14.57, −5.68, 11.79, −4.31, 2.33, −12.78, −2.85, 7.71, −6.71, 9.92, −9.73]`, only with `tuning.scale` 4259 or 5570       | a per-pitch-class cents table (a user tuning). Not found in the project bytes (`XYF:docs/logs/2026-06-16_preset_corpus_analysis.md`)                                                                                                                                                                                          | [D] / [H]              |
| `modulation.{aftertouch,modwheel,pitchbend,velocity}` | `{amount: q15, target: q15}` | amount 16383/16384 = zero (signed around centre), target 0 = none, others encoded ids (4096, 6144, 10240, 16711, 17694, 18022, 19005, 20480, 28672…) | preset-settings "mod" page. The destination id table is **not decoded**. Pass it through unchanged                                                                                                                                                                                                                            | [D] / ids [H]          |

### 2.4 `envelope`

`{"amp": {attack, decay, sustain, release}, "filter": {attack, decay, sustain, release}}`, all q15
[D]. On-device these are the M2 ADSRs, with amp and filter pages toggled by an encoder click [O].

- Community calibration (`SF2:src/sf2_to_opxy/converter.py:14-62`, method in `SF2:tools/`): recording
  the device gives **attack/decay seconds ≈ 0.01037·e^(10.4687·v/32767)**, so 50 % ≈ 2 s and 100 %
  ≈ 365 s [C]. Their release fit comes out _inverted_ (32767 → 2.4 s, 0 → 16.3 s). It was measured with
  a looping probe, so treat it as unverified. `SFZ:converter/envelope.py:1-54` reuses both curves.
- Factory defaults: drums use amp `{0, 0, 32767, 0}` (sustain full, no release: 43/43 kits).
  Samplers mostly use decay 20000 / sustain 30000 or 32767 / release ≈ 25248 [D].
- Multisample community default: amp `{0, 20295, 14989, 16383}` (buba447 lineage, `BUD:lib/audio_tools.js:194-206`).
  pytheory uses `{0, 2457, 32767, 14395}` for looped sustains [C].

### 2.5 `fx` (M3 **filter**) and `lfo` (M4)

| Block | Key            | Values                                                    | Meaning                                                                                                                                                                                                 | Tag                          |
| ----- | -------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `fx`  | `active`       | bool                                                      | filter on/off; project byte `track+0x25`                                                                                                                                                                | [D]                          |
|       | `type`         | `z lowpass` 186 · `ladder` 100 · `svf` 22 · `z hipass` 14 | project byte `track+0x21`: z lowpass 9, svf 10, ladder 16, z hipass 17. The gaps suggest more models may exist                                                                                          | [D]                          |
|       | `params[0..3]` | q15                                                       | cutoff, resonance, envelope amount, key tracking (the M3 encoders, `instrument.html` §14.3)                                                                                                             | [H] (order from UI)          |
|       | `params[4..7]` | `[0, 32767, 0, 0]` on every sampler/drum preset           | probably the shift+M3 sends aux / tape / fx I / fx II. `params[5]` is stored as max in every capture. sf2-to-opxy writes chorus → `[6]` and reverb → `[7]` (`SF2:src/sf2_to_opxy/opxy_writer.py:89-96`) | [D] storage / [H][C] meaning |
| `lfo` | `active`       | bool                                                      | project byte `track+0x20`                                                                                                                                                                               | [D]                          |
|       | `type`         | `random` 175 · `tremolo` 121 · `value` 18 · `element` 8   | project byte `track+0x1C`: tremolo 0, value 1, random 2, element 3. `duck` was added in OS 1.1.0 [O]; its JSON string is unseen                                                                         | [D]                          |
|       | `params[0..7]` | q15                                                       | per-type controls: speed/source, amount, destination, parameter, then sub-functions                                                                                                                     | [H]                          |

### 2.6 Regions: how each field reaches the device (decoded)

Each loaded region fills one 128-byte **voice slot** in the project (24 slots at `track+0x3957`,
`XYF:docs/format/drum_sample_paths.md`). I decoded the first 8 slot bytes in every probe capture under
`XYF:src/preset-load-experiments/2026-06-patch-json-fields/presetprojs/` (script in this session; the
bytes are reproducible with `XYF:xy/rle.py` and a search for `probe.wav`):

| Probe                                         | JSON                           | slot bytes `+0..+7`              | Conclusion                           |
| --------------------------------------------- | ------------------------------ | -------------------------------- | ------------------------------------ |
| `skey-hikey-64`                               | hikey 64, keycenter 60         | `3c 00 40 80 …`                  | **+0x00 = keycenter, +0x02 = hikey** |
| `skey-conflict-h48-p72`                       | hikey 48, keycenter 72         | `48 00 30 80 …`                  | confirms both                        |
| `skey-lokey-12`                               | lokey 12                       | `3c 00 3c 80 …`                  | **lokey is stored nowhere**          |
| `slt-missing-onrelease`                       | neither loop flag              | `… 3c 00 …`                      | loop byte `0x00`                     |
| `slt-missing-enabled`                         | onrelease true                 | `… 3c 80 …`                      | `0x80`                               |
| `slt-enabled-false`                           | enabled false + onrelease true | `… 3c c0 …`                      | `0xC0`                               |
| `sfld-tune-neg5` / `-pos4`                    | tune −5 / 4                    | `+0x04 = fb / 04`                | signed cents                         |
| `sfld-gain-064`                               | gain 64                        | `+0x05 = 40`                     | raw byte (no clamp)                  |
| `sfld-reverse-true`                           | reverse true                   | `+0x07 = 01`                     | direction                            |
| `dpm-str-gate / oneshot / key / group / loop` | drum playmode                  | `+0x03 = 00 / 01 / 01 / 02 / 03` | `key` is not a real value            |
| `dpm-num-0…4`                                 | numeric playmode               | `+0x03 = 01` for all             | numbers → default                    |

Separately, xy-format's _direct-edit_ probes (the owner changed the loop type on the device and saved)
label the same loop byte **`0x80` = infinite, `0x40` = off, `0x00` = until release**
(`XYF:docs/logs/2026-06-12_sampler_oneshot_inspection.md`; `XYF:xy/sampler_sample_inspection.py:52-54`)
[D]. The same probes give the on-device ranges: sampler gain byte min `0xE2` (−30) and max `0x14`
(+20); drum pan ±100 (`XYF:docs/logs/2026-06-12_drum_pan_fade_inspection.md`); drum per-key fade UI
0–99 [D].

**Loop semantics (resolved):**

| `loop.enabled`  | `loop.onrelease` | byte   | On device                                                                    | Use for                                                                                |
| --------------- | ---------------- | ------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| absent          | `true`           | `0x80` | **∞ loop forever** (loops through the release; the amp release fades it out) | sustained pads/organs; the factory default (227/227) and the device's own save default |
| absent / `true` | absent / `false` | `0x00` | **loop until release**, then plays on past `loop.end` to `sample.end`        | "sustain + natural tail"                                                               |
| `false`         | absent / `false` | `0x40` | **loop off**                                                                 | one-shots, plucks, drums-as-instrument                                                 |
| `false`         | `true`           | `0xC0` | probably off (both bits set). Untested                                       | avoid                                                                                  |

The guide lists the three loop types: "loop forever (which will use the looped section even upon
release), loop until release and loop off" (`WEB:te-guide-op-xy-sample.html` §18.1/§18.3) [O].
pytheory's notes (`PYT:opxy-preset-notes.md:62-80`) and sf2-to-opxy's SF2 mapping
(`SF2:src/sf2_to_opxy/sf2_reader.py:464-474`: SF2 mode 3 "loop while held, then remainder" →
`onrelease:true`) treat `onrelease:true` as _until release_. opxy-to-sfz reads it as continuous
(`SFZ:converter/patch.py:51-62`), which the device bytes agree with. With a long amp release the two
can sound alike, which is probably why the confusion survived. Separately, when loop end equals sample
end the device behaves like loop off (`XYF:docs/logs/2026-06-12_sampler_oneshot_inspection.md`) [D].

### 2.7 Region fields by type

**Common frame fields** (u32 frame indices at the WAV's own sample rate) [D]:

| Key            | Req. | Rule                                  | Notes                                                                                                                                                                                                                                                                           |
| -------------- | ---- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sample`       | yes  | file name inside the `.preset` folder | no subfolders seen. `.wav`, `.aif`, `.aiff` [O]                                                                                                                                                                                                                                 |
| `framecount`   | yes  | = frames in the file                  | factory: `sample.end == framecount` in 1029/1029 drum and 227/227 sampler regions [D]. It is also the crossfade denominator. Several tools compute it wrongly: foxxyz uses `(bytes − 88)/2` (`FOX:cli/generate.js:67-68`), and aliosa27 writes placeholders (`SLC:xy.py:76-83`) |
| `sample.start` | no   | 0 ≤ start < end                       | absent = 0. Used by 8 sampler regions and one drum kit [D]                                                                                                                                                                                                                      |
| `sample.end`   | yes  | start < end ≤ framecount              | trimming the end is allowed                                                                                                                                                                                                                                                     |

**`drum`** (1…24 regions; factory kits have 23 or 24 and may leave keys empty) [D]:

| Key                   | Type / range                    | Factory values    | Meaning                                                                                                                                                                                                                                                                                                          |
| --------------------- | ------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hikey`               | int 53…76                       | one per key       | key assignment → slot `+0x02` [D]. Clean kits load voice = hikey − 53 (`XYF:docs/format/patch_json_adapter.md`)                                                                                                                                                                                                  |
| `lokey`               | = hikey                         | = hikey           | ignored                                                                                                                                                                                                                                                                                                          |
| `pitch.keycenter`     | 60                              | 60 (1029/1029)    | keep 60. For drums slot `+0x00` = 0x3C + transpose, so other values are untested                                                                                                                                                                                                                                 |
| `playmode`            | `gate`·`oneshot`·`group`·`loop` | oneshot (all)     | UI names: **key** (plays while held) = `gate`, oneshot, **mute group** (choke) = `group`, loop. Bytes 0/1/2/3 [D]. There is **one** mute group per kit (`SF2:README.md` "single mute group") [C]. The device slicer makes slices choke each other [O]. Since 1.0.32 the device defaults long samples to gate [O] |
| `transpose`           | int −48…+48                     | 0                 | semitones (`XYF:xy/image_writer.py:1371`; `PS:src/components/drum/DrumSampleSettingsModal.tsx:442-443`) [D][C]                                                                                                                                                                                                   |
| `tune`                | int                             | 0                 | xy-format uses it as semitones only when `transpose` is absent. Unit unverified [H]                                                                                                                                                                                                                              |
| `pan`                 | int −100…+100                   | 0                 | [D] probe + PatchStudio UI (`…DrumSampleSettingsModal.tsx:491-492`)                                                                                                                                                                                                                                              |
| `gain`                | int dB −30…+20                  | 1…11 (44 regions) | [C] PatchStudio UI (`…:467-468`) and teopxy's OP-1 mapping (`TEO:teopxy.py:59-100`); [D] sampler byte limits                                                                                                                                                                                                     |
| `reverse`             | bool                            | false             | slot `+0x07`                                                                                                                                                                                                                                                                                                     |
| `fade.in`, `fade.out` | int ≥ 0                         | 0 always          | the on-device per-key "sample fade" is 0–99 and is stored on the _previous_ slot (`XYF:docs/logs/2026-06-12_drum_pan_fade_inspection.md`). JSON units unverified. Leave 0                                                                                                                                        |

**`sampler`** (one-shot synth sampler, exactly **1** region) and **`multisampler`** (1…**24**
regions) share the "tonal" region shape [D][O]:

| Key                      | Req.         | Type / range            | Meaning                                                                                                                                                                                                                                                                                                                                 |
| ------------------------ | ------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pitch.keycenter`        | yes          | MIDI 0…127              | root note → slot `+0x00`. Authoritative for presets [D]                                                                                                                                                                                                                                                                                 |
| `hikey`                  | yes          | MIDI 0…127              | **top key of the zone** → slot `+0x02` [D]. The device and factory write `hikey == pitch.keycenter` [D]. A one-zone `sampler` is not limited by it: factory `hikey:60` presets play above C4 [D]. What happens above the last zone's `hikey` is untested; generators set it to 127 [C]                                                  |
| `lokey`                  | no           | —                       | ignored. The device omits it on save (`XYF:src/sampler-project-state/2026-06-15/presets/smp_default_2026-06-15.preset/patch.json`); factory writes 0 [D]                                                                                                                                                                                |
| `loop.start`, `loop.end` | yes          | frames                  | after on-device sampling the defaults are **⌊0.2·framecount⌋ / ⌊0.8·framecount⌋** (device-saved preset: 19761/79045 of 98807; 128/152 exported multisampler regions, `VIB:docs/opxy-preset-patch-json.md` §6.3.1) [D][C]. Whether `loop.end` is inclusive or exclusive is untested (SF2 offers `--loop-end-offset −1`, `SF2:README.md`) |
| `loop.crossfade`         | yes          | frames                  | loaded as `int(float32(xf·2³¹/framecount))`, clamped to `0x7FFFFFFF`, and shown as a % of the whole sample (`XYF:docs/logs/2026-06-17_patch_json_field_experiment.md`) [D]. Factory values reach 272672 and sometimes exceed `loop.start` or the loop length (10/227). Keep `xf ≤ min(loop.start, loop.end − loop.start)`               |
| `loop.onrelease`         | yes (device) | bool                    | §2.6: `true` = ∞                                                                                                                                                                                                                                                                                                                        |
| `loop.enabled`           | no           | bool                    | `false` = off. Never present in factory files. **Always write it explicitly** for one-shot material                                                                                                                                                                                                                                     |
| `tune`                   | yes          | int cents (signed byte) | factory always 0. Assume ±99 is safe [D][H]                                                                                                                                                                                                                                                                                             |
| `gain`                   | no           | int dB −30…+20          | factory −5…12 (18 regions) [D]                                                                                                                                                                                                                                                                                                          |
| `reverse`                | yes          | bool                    | [D]                                                                                                                                                                                                                                                                                                                                     |

Constraints JSON Schema cannot express (enforced in our validator, §7):
`0 ≤ sample.start < sample.end ≤ framecount`, `sample.start ≤ loop.start < loop.end ≤ sample.end`,
multisampler `hikey` strictly ascending in array order, and at most one region per drum key.

### 2.8 Synth-engine presets

`axis` 10, `epiano` 10, `organ` 9, `prism` 8, `dissolve` 6, `simple` 6, `hardsync` 2, `wavetable` 1 in
the corpus [D]. `regions: []` [D]. `engine.params[0..3]` hold P1–P4 and `[4..7]` hold the constants
`7616, 674, 3276, 8192` [D]. Filter, LFO, envelope and preset settings are identical in shape to the
sample engines. xy-format cannot yet author them into projects: "unsupported preset types still need
opaque engine tails" (`XYF:docs/format/patch_json_adapter.md`). As **files** they are trivial to
generate. Whether the device accepts arbitrary P1–P4 values in a user-made synth preset is untested
(§8 #12), though nothing suggests validation beyond the range.

### 2.9 Where the tools agree and disagree

| Topic             | Device                                                                      | buba447 → PatchStudio → swift-te / xympler / DimaDake                                                   | pytheory                                                    | sixthlaw                                                                | sf2-to-opxy                                                       | digichain                                               | others                                                              |
| ----------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| multi-zone `type` | (`multisampler` in exports)                                                 | `multisampler`                                                                                          | `multisampler`                                              | `multisampler`                                                          | `multisampler`                                                    | `multisampler`                                          | cfurrow7 `multisampler`                                             |
| zone keys         | `lokey` omitted or 0, `hikey`=root, sorted                                  | `lokey`=prev+1, `hikey`=root, last=127 ("fill down"; `PS:src/utils/patchGeneration.ts:338-358,480-483`) | `lokey` 0, `hikey`=midpoint (`PYT:generate.py:289-335`)     | `lokey` 0, `hikey`=next root−1 ("fill up"; `SIX:src/main.js:1614-1650`) | midpoints with `lokey` (`SF2:src/sf2_to_opxy/selection.py:56-70`) | `lokey` 0, `hikey`=root (`DC:src/resources.js:247-263`) | cfurrow7 midpoints (`CFC:converter.js:633-662`)                     |
| default loop      | 20 % / 80 %, ∞                                                              | 10 % / 90 % (`PS:…patchGeneration.ts:369-370`), enabled + onrelease **true** (∞)                        | RMS-matched loop, onrelease true; one-shots `enabled:false` | loop 0..end, enabled false                                              | SF2 loops                                                         | 0..end, onrelease false                                 | buba447-py 25 % / 75 % (`BUM:Helpers.py:47-50`)                     |
| audio             | 44.1 k / 16-bit / mono + `smpl`                                             | keep original or 11/22/44.1 k, 8/12/16/24-bit, writes `smpl` (`PS:src/utils/wavExport.ts:57-173`)       | 44.1 k / 16 / mono, no `smpl`                               | **stereo** 44.1 k (22.05 / 48 optional), no `smpl`                      | **22.05 k** default, 16-bit                                       | target rate, AIFF or WAV                                | vibing stereo 44.1 k via ffmpeg                                     |
| drum template     | factory kits: `playmode` mono, `transpose` 12 / `octave` −1 on half of them | `playmode` poly, amp `{0,0,32767,1000}` (`BUD:lib/audio_tools.js:243-275`)                              | same as buba447                                             | —                                                                       | same as buba447                                                   | own template                                            | foxxyz and niekert copy a factory drum preset (`FOX:template.json`) |
| JSON style        | minified, sorted                                                            | pretty, + `name`                                                                                        | pretty                                                      | minified                                                                | pretty, + `name`                                                  | minified                                                | —                                                                   |

**Misconceptions to avoid** (sources in brackets):

- "22 kHz is the OP-XY's native rate" (`SIX:README.md:18`). False. Device recordings and factory
  framecounts are 44.1 kHz; for example `spectre` zones are exactly 176400 frames = 4.0 s.
- "Numeric drum playmode" or `"key"` [D: both silently become oneshot].
- "`hikey`/`lokey` bound a one-shot sampler" [D: no].
- "Loop end must be before sample end to loop" [D: loop end = sample end ⇒ behaves like off].
- The YYUUGGOO `opxy json doc.md` "spec" (underscored keys, milliseconds, `z_lowpass`) is speculative
  and contradicted by every real file (op-xy-vibing already flags it: `VIB:docs/opxy-preset-patch-json.md` §0).
- "Filenames ≤ 14 chars" (`PYT:opxy-preset-notes.md:242`). This is a community heuristic, not a limit:
  factory samples are named like `241204-1 2-c#4-0.wav` and pytheory's own folders reach 17 chars (§3.5).

### 2.10 Annotated real examples

**(a) Device-saved one-shot sampler preset** (`XYF:src/sampler-project-state/2026-06-15/presets/smp_default_2026-06-15.preset/patch.json`,
originally `presets/snapshot/2026-06-15 (1).preset`) [D]. Reformatted here; the device writes it on one line:

```jsonc
{
	"engine": {
		"bendrange": 0,
		"highpass": 7110,
		"modulation": {
			"aftertouch": { "amount": 16383, "target": 0 },
			"modwheel": { "amount": 24576, "target": 6144 },
			"pitchbend": { "amount": 16383, "target": 0 },
			"velocity": { "amount": 16383, "target": 0 }
		},
		"params": [16384, 16384, 16384, 16384, 16384, 16384, 16384, 16384], // ignored by the tonal sampler
		"playmode": "poly",
		"portamento.amount": 0,
		"portamento.type": 32767,
		"transpose": 0,
		"tuning.root": 0,
		"tuning.scale": 0,
		"velocity.sensitivity": 32767,
		"volume": 22970,
		"width": 0
	},
	"envelope": {
		"amp": { "attack": 16640, "decay": 14519, "release": 9983, "sustain": 25004 },
		"filter": { "attack": 21247, "decay": 32767, "release": 10240, "sustain": 32767 }
	},
	"fx": { "active": false, "params": [8888, 0, 5632, 32767, 0, 0, 0, 0], "type": "ladder" }, // M3 filter
	"lfo": { "active": true, "params": [21077, 28159, 5205, 0, 0, 0, 0, 0], "type": "element" },
	"octave": 0,
	"platform": "OP-XY",
	"regions": [
		{
			"framecount": 98807, // 2.2405 s @ 44.1 kHz, mono 16-bit
			"hikey": 60, // == keycenter; no "lokey" at all
			"loop.crossfade": 0,
			"loop.end": 79045, // floor(0.8 * 98807)
			"loop.onrelease": true, // 0x80 = loop forever (device default)
			"loop.start": 19761, // floor(0.2 * 98807)
			"pitch.keycenter": 60, // sampled on the key the device calls "c4"
			"reverse": false,
			"sample": "unnamed1-c4-0.wav",
			"sample.end": 98807,
			"tune": 0
		}
	],
	"type": "sampler",
	"version": 4
}
```

**(b) Shipped drum kit** `nt-kicks 01` (`XYF:src/presets/presets/nt-kicks 01.preset/patch.json`, 24
regions, 2 shown) [D]:

```jsonc
{"engine":{"bendrange":8191, … ,"playmode":"mono",  // factory kits are often mono
           "velocity.sensitivity":19660,"volume":24900,"width":0},
 "envelope":{"amp":{"attack":0,"decay":0,"release":0,"sustain":32767},  // gate-like amp env
             "filter":{"attack":0,"decay":0,"release":0,"sustain":0}},
 "fx":{"active":true,"params":[27770,0,81,0,0,32767,0,0],"type":"ladder"},
 "lfo":{"active":false,"params":[8704,24242,19114,14335,0,0,0,0],"type":"value"},
 "octave":0,"platform":"OP-XY",
 "regions":[
  {"fade.in":0,"fade.out":0,"framecount":18173,"gain":5,          // +5 dB
   "hikey":53,"lokey":53,"pan":0,"pitch.keycenter":60,
   "playmode":"oneshot","reverse":false,
   "sample":"unnamed-f2-6.wav",   // device-generated name, note "f2" = MIDI 53 (old C3=60 naming)
   "sample.end":18173,"transpose":0,"tune":0},
  {"fade.in":0,"fade.out":0,"framecount":18023,"hikey":54,"lokey":54,"pan":0,
   "pitch.keycenter":60,"playmode":"oneshot","reverse":false,"sample":"unnamed-f#2-5.wav",
   "sample.end":18023,"transpose":0,"tune":0} /* … 22 more, keys 55–76 */],
 "type":"drum","version":4}
```

**(c) Shipped synth-sampler preset** `nt-106 bass` (region only) [D]:
`{"framecount":70224,"gain":4,"hikey":60,"lokey":0,"loop.crossfade":0,"loop.end":62108,"loop.onrelease":true,"loop.start":31097,"pitch.keycenter":60,"reverse":false,"sample":"241204-1 2-c3-2.wav","sample.end":70224,"tune":0}`.
The sample's name says `c3` but the root is 60. The 2024-era device naming was C3 = 60.

**(d) Synth-engine preset** `nt-woody` (axis) [D]:
`"params":[26246,20410,29004,5808,7616,674,3276,8192]` (tone, ratio, shape, tremolo, then the
constant tail), `"fx":{"active":true,"params":[10178,27291,6705,12120,0,21954,5119,11262],"type":"z hipass"}`,
`"regions":[]`.

**(e) Community multisampler region, pytheory looped sustain** (`PYT:opxy-samples/pytheory/*/patch.json`,
written by `PYT:generate.py:289-335`) [C]:

```jsonc
{
	"framecount": 110250,
	"hikey": 54,
	"lokey": 0, // midpoint split between C3(48) and C4(60)
	"loop.crossfade": 21723, // 33 % of the loop length
	"loop.end": 88731,
	"loop.onrelease": true, // = ∞ on the device, not "until release"
	"loop.start": 18683, // RMS-matched, snapped to a rising zero crossing
	"pitch.keycenter": 48,
	"reverse": false,
	"sample": "c3.wav",
	"sample.end": 110250,
	"tune": 0
}
```

### 2.11 Firmware notes that affect presets and samples

Paraphrased from `WEB:te-downloads_op-xy.html` [O]:

| OS              | Date          | Item                                                                                                                                                                                                  |
| --------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0.9           | 2024-11-14    | filter envelope was not saved for drums; don't apply global transpose to drums; fix for different sampled presets in different patterns on the same track                                             |
| 1.0.15          | 2024-12-18    | handle invalid WAV headers better; external engine renamed `midi`                                                                                                                                     |
| 1.0.21          | 2025-01-16    | MTP: moving files supported                                                                                                                                                                           |
| 1.0.25          | 2025-02-03    | **max loaded sample memory raised to 64 MB**; faster startup with many user presets; **better pitch detection from file names**                                                                       |
| 1.0.29          | 2025-02-25    | more characters allowed in MTP file names. **Withdrawn**: corrupted files > 64 KB copied _off_ the device                                                                                             |
| 1.0.32          | 2025-03-11    | MTP export corruption fixed; **long samples default to gate**; empty preset folders hidden from the sample browser                                                                                    |
| 1.0.38          | 2025-04-01    | fix incorrect note name in the multisample browser (likely the C3 → C4 naming change, [H])                                                                                                            |
| 1.0.40          | 2025-05-06    | fix saving snapshots after renaming the snapshot folder                                                                                                                                               |
| 1.0.45          | 2025-06-27    | **base note stored in WAV metadata when sampling**; fix sampler looping when loop out = sample end; MTP root folders can no longer be moved                                                           |
| 1.1.0           | 2025-10-15    | **sample slice mode**; drum and synth sampler p-locks; fix drum key fade-out in group mode; fix looping drum samples stopping                                                                         |
| 1.1.3           | 2026-02-10    | fix samples not loading after sample memory fills                                                                                                                                                     |
| 1.1.15          | 2026-07-01    | **deeper user-content folders**, faster handling of large data; add/move **preset folders** on device; sample browser groups samples used by user presets; **sample memory indicator**; **MTP UTF-8** |
| 1.1.17 / 1.1.18 | 2026-07-05/06 | "save to same snapshot" (hold shift); fix for that clearing preset samples                                                                                                                            |
| 1.1.25          | 2026-08-19    | better multisample + global transpose; better UX when user preset folders share names with factory ones                                                                                               |
| 1.1.32          | 2026-09-01    | fix sequencer stalls while browsing presets and samples                                                                                                                                               |

---

## 3. Sample requirements

### 3.1 Formats

| Property             | What we know                                                                                                                                                                                                                                                                                                                                  | Tag       | Recommendation for generated content                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Container            | WAV and AIFF: "OP–XY supports both aiff and wav files" (`WEB:te-guide-op-xy-sample.html` §18.4; how-to 22.11)                                                                                                                                                                                                                                 | [O]       | **WAV** (RIFF, little-endian). digichain can also emit `.aif` inside presets (`DC:src/main.js:2831-2836`)                     |
| Codec                | PCM. The device writes format tag 1 (plain PCM, 16-byte `fmt`) [D]. WAVE_FORMAT_EXTENSIBLE and float are untested                                                                                                                                                                                                                             | [D]       | PCM, `fmt` size 16                                                                                                            |
| Sample rate          | device recordings are 44 100 Hz [D]. Factory framecounts are round at 44.1 k (e.g. 176400 = 4.0 s, 220500 = 5.0 s) [D]. 22 050 is used by sf2-to-opxy (default, `SF2:README.md`) and suggested by buba447 (`BUM:README.md:122`) [C]. 11 025 is offered by PatchStudio and DimaDake. 48 000 is offered by sixthlaw and untested                | [D][C]    | **44 100**. Offer a 22 050 "lite" mode for long pads (halves memory). Avoid 48 k until tested (§8 #4)                         |
| Bit depth            | 16-bit in all device and factory material [D]. 24-bit is offered by PatchStudio/sixthlaw [C]. PatchStudio's "12-bit" and "8-bit" exports are reduced-resolution audio in 16-bit/8-bit containers (`PS:src/utils/wavExport.ts:233-258`)                                                                                                        | [D][C]    | **16-bit**. If you want lo-fi, quantise inside a 16-bit container                                                             |
| Channels             | mono and stereo both load. sixthlaw and vibing always write stereo (`SIX:src/main.js:1227-1262`, `VIB:tools/generate_latin_trap_presets.py`); cfurrow7: "mono and stereo" (`CFC:README.md`). Device recordings seen so far are mono                                                                                                           | [C][D]    | **mono by default** (half the memory). Stereo only when the source's image matters                                            |
| Max length           | "for all samplers, samples can be a maximum of 20 seconds in length" (recording; `sample.html` §18) [O]. Longest factory sample 774 845 frames = 17.6 s [D]. digichain truncates at 20 s (`DC:changelog.md:90`); buba447 lists 20 s max (`BUD:multisample-tool.html:54`) [C]. The frame fields are u32, so the format itself has no limit [D] | [O][D][C] | **≤ 20 s hard cap**. Typical: drums ≤ 2 s, tonal zones 3–8 s (sixthlaw's pitch-aware 10 s → 3 s, `SIX:src/main.js:1275-1288`) |
| Loaded sample memory | "increased max loaded sample memory to 64 MB" (1.0.25) [O]. The indicator appears above 70 % (`WEB:te-guides_op-xy_project.html` §10) [O]. The budget covers every sample referenced by the project (presets can differ per pattern) [H]                                                                                                      | [O]       | budget = Σ frames × channels × 2 B (assumes 16-bit internal [H]); warn at 70 % of 64 MiB                                      |
| Per-preset size      | PatchStudio enforces 8 MB (`PS:src/utils/audio.ts:11`, `constants.ts:8`), which fits "64 MB / 8 tracks". Not a device rule: pytheory's largest preset is 4.4 MB                                                                                                                                                                               | [C]       | soft warning at 8 MiB                                                                                                         |

### 3.2 Counts and structure limits

| Limit                         | Value                                                                                                                                                                                                                                                    | Tag    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Multisampler zones            | **24** ("enough for around 3 samples per octave", `sample.html` §18.3)                                                                                                                                                                                   | [O]    |
| Drum keys                     | **24**, MIDI 53–76 (the two-octave keyboard, F…E)                                                                                                                                                                                                        | [O][D] |
| Slices                        | ≤ 24: slices "automatically fill out the musical keyboard and … choke each other" (`sample.html` §18.2 slicing)                                                                                                                                          | [O]    |
| Velocity layers / round robin | **not supported**: "Multiple velocities are not supported" (`BUD:multisample-tool.html:56`); "The OPXY does not currently support velocity mappings" (`BUM:PackSamples.py:19`). sixthlaw splits layers into separate presets (`SIX:src/main.js:295-382`) | [C]    |
| Mute (choke) groups           | one per kit (`playmode:"group"`) (`SF2:README.md`)                                                                                                                                                                                                       | [C]    |
| Sampler zones                 | exactly 1 (extra regions are ignored per `PYT:opxy-preset-notes.md:37`)                                                                                                                                                                                  | [D][C] |
| Voices                        | 24 total, 8 per track max (`XYF:docs/reference/opxy_limits.md`; project guide)                                                                                                                                                                           | [O][C] |

### 3.3 WAV metadata the OP-XY writes and reads

The device's own WAV (`XYF:src/sampler-project-state/2026-06-15/presets/*/unnamed1-c4-0.wav`, parsed
in this session) [D]:

```
RIFF(197694) WAVE
  fmt  16  PCM, 1 ch, 44100 Hz, 16-bit
  smpl 36  manufacturer 0, product 0, samplePeriod 0, MIDIUnityNote 60 (0x3C), pitchFraction 0,
           SMPTE 0/0, numSampleLoops 0, samplerData 0          ← root note, no loop records
  data 197614  (98807 frames)
```

That is a 12 + 24 + 44 + 8 = **88-byte header**. It explains foxxyz's hard-coded `(bytes − 88)/2`
(`FOX:cli/generate.js:67-68`), which was clearly derived from device WAVs.

| Chunk / field                                       | Read by OP-XY?                                                                                                                                                                                               | Tag              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| `smpl.MIDIUnityNote`                                | **yes**: "the pitch of a sample can be set within the wav file's meta data" (`sample.html` §18.4). Written on sampling since 1.0.45                                                                          | [O][D]           |
| `smpl` loop records                                 | unknown. The device writes none. PatchStudio writes one forward loop (and sets `dwStart = loopStart − 1`, an off-by-one bug that underflows to `0xFFFFFFFF` at start 0; `PS:src/utils/wavExport.ts:149-150`) | [H]              |
| file-name note                                      | fallback when there is no metadata: "OP–XY will look at the name … for example 'a3'" [O]; improved in 1.0.25 [O]                                                                                             | [O]              |
| `LIST/INFO`, `bext`, `iXML`, `cue `, `acid`, `JUNK` | unknown; "handle invalid wav file headers better" (1.0.15)                                                                                                                                                   | [H] → strip them |
| AIFF `INST` base note / `MARK` loops                | unknown (PatchStudio parses both: `PS:src/utils/aifParser.ts:189,249,311`)                                                                                                                                   | [H]              |
| for **presets**                                     | `patch.json` `pitch.keycenter`, loop and window fields are authoritative. pytheory's WAVs have no `smpl` at all and load fine                                                                                | [D][C]           |

**Recommendation:** write exactly `fmt`(16) + `smpl`(36, unity note = root, no loops) + `data`, like
the device. This keeps files valid when they are later loaded outside a preset (the sample browser
groups preset samples, 1.1.15).

### 3.4 Note names in file names (the octave question)

| Evidence                                                                                                                                                                                                                               | Convention              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Factory multisamples (fw 1.1.21 captures): zone root byte for `c4.wav` = 60, `c2.wav` = 36, `g#6.wav` = 92, across 6 instruments (decoded in this session from `XYF:src/factory-preset-captures/firmware-1.1.21/batches/fp07.xy` etc.) | **C4 = 60** [D]         |
| Device recording (2026): `unnamed1-c4-0.wav`, `smpl` unity 60, keycenter 60                                                                                                                                                            | **C4 = 60** [D]         |
| Shipped `nt-*` presets (made on the device in Dec 2024, "241204-…"): `unnamed-c3-51.wav` with keycenter 60 (165 cases); drum files `f2…e4` on keys 53–76                                                                               | **C3 = 60** [D]         |
| Changelog 1.0.38: "fix incorrect note name in multisample browser"                                                                                                                                                                     | probably the switch [H] |
| Tools: buba447/PatchStudio default C3 = 60 with a C4 option (`PS:src/utils/audio.ts:725-765`); sixthlaw and cfurrow7 use C4 = 60 (`SIX:src/main.js:416-453`)                                                                           | split [C]               |

**Recommendation:** name files `…-c4.wav`-style with **C4 = 60** (the current device and factory
convention), always write `smpl` unity note and `pitch.keycenter`, and confirm the file-name fallback
on the owner's device (§8 #1). When _parsing_ user files, try in order: `smpl` → AIFF `INST` → name
(C4 = 60 default, user toggle) → pitch detection (§5).

### 3.5 Naming rules

| Source                          | Rule                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Official (sample how-to 22.11)  | "only alphanumeric characters and some special characters are supported (-, # and space)" [O]                                                                                                                                                                                                                                              |
| Official (project how-to 22.10) | project names: "all utf8 characters are supported" [O] (the post-1.1.15 guide)                                                                                                                                                                                                                                                             |
| Firmware                        | 1.0.29 "more types of characters in mtp filenames"; 1.1.15 "mtp: utf8 support" [O]                                                                                                                                                                                                                                                         |
| Community                       | `[a-zA-Z0-9 #\-().]` (`BUD:lib/audio_tools.js:93-95`, `PS:src/utils/audio.ts:681-702`, `BUM:Helpers.py:13-17`). digichain maps anything else to `-` (`DC:src/editor.js:30-34`). "≤ 14 chars" (pytheory, sixthlaw `SIX:src/main.js:1264-1273`, digichain `DC:src/main.js:2807`) [C]                                                         |
| Reality check                   | factory/shipped names: lowercase with spaces, digits, `-`, `#`, `()` (`nt-halls of the damned`, `2026-06-15 (1)`, `241204-1 2-c#4-0.wav`) [D]. pytheory: 43/95 folder names contain `_`, up to 17 chars [C]                                                                                                                                |
| Project string buffers          | xy-format's writer allows a **48-byte** preset label (`<folders>/<name>`) and a **72-byte** sample path per voice slot (`XYF:xy/image_writer.py:1367-1368,1375`). The slot has 96 bytes between `+0x08` and `+0x68`. The longest real path seen is 67 bytes (`/fat32/presets/1/nt-halls of the damned.preset/241204-1 2-c3-18.wav`) [D][H] |
| Filesystem                      | FAT32 (`/fat32/…` paths) [D]: case-insensitive, forbids `" * / : < > ? \ \|`                                                                                                                                                                                                                                                               |

**Our rule** (conservative, valid on every firmware since 1.0.x):

- Folder and preset names match `^[a-z0-9][a-z0-9 #()-]{0,23}$`.
- Sample stems match `^[a-z0-9][a-z0-9#-]{0,15}$`, plus `.wav`.
- ASCII only, lowercase, unique case-insensitively.
- `/fat32/presets/<folders>/<name>.preset/<file>` stays ≤ 71 bytes, and `<folders>/<name>` stays ≤ 47.

Loosen these only after the owner-device tests (§8 #9).

---

## 4. Device folder hierarchy and how projects reference presets

### 4.1 What MTP shows

```
<device root>                         firmware path: /fat32/
├── presets/                          "presets, projects and samples" (how-to 22.10/22.11) [O]
│   ├── drum/ bass/ bells/ fx/ keys/ lead/ pad/ perc/ pluck/ strings/ synth/ wind/ …
│   │     └── <name>.preset/          top-level folder = CATEGORY in the preset browser. Folders with
│   │                                 factory category names merge with factory presets (1.1.25) [D][O]
│   ├── snapshot/                     "save preset" (hold track + M4) writes "<yyyy-mm-dd> (n).preset"
│   │                                 here (XYF:docs/logs/2026-06-15_sampler_project_state.md) [D]
│   └── <user folders>/…              any depth since 1.1.15 (one level before: BUM:README.md:136);
│                                     created on device (shift+M1) or over MTP [O]
├── samples/
│   ├── user/                         on-device recordings land here (drum sampler, multisampler,
│   │                                 SAMPLE key); "clear" only unassigns, deletion needs MTP [O]
│   └── <folders>/                    shown as [folder] in the sample library [O]
└── projects/
    └── user/ … *.xy + backups/       history files; copy both to back a project up [O]
        (the device browser also lists factory projects and templates/) [O]

Referenced by projects but outside /fat32 (so probably not visible over MTP [H]): content/samples/<category>/<name>.wav
(factory library: kick, snare, clap, hihat, cymbal, tom, perc, shaker, conga, synth, plus per-instrument
folders such as "refelt piano", "harmonium", "ensemble") [D, strings in XYF:src/factory-preset-captures/]
```

- The 322 `nt-*` presets live on the user partition under category folders:
  `/fat32/presets/drum/nt-aeroplane.preset`, `…/fx/nt-z-fx.preset`, and `wind/`, `bells/`, `synth/`
  (`XYF:docs/logs/2026-06-09_app_preset_probe_inspection.md`) [D]. They are **preinstalled user
  content**: deletable and overwritable. Core factory presets (`drum/boop`, `bandpasser`,
  `refelt piano`…) point at internal `content/` samples.
- Factory categories on 1.1.21: Bass, Drum, Keys, Lead, Organ, Pad, Pluck, Strings (+ FX, Wind,
  Bells…) (`XYF:docs/workflows/factory_preset_capture_checklist_1.1.21.md`) [D]. The browser toggles
  category view and engine view (`instrument.html` §14.6) [O].
- Root folders are fixed: "don't allow moving mtp folders from one root folder to another" (1.0.45) [O].

### 4.2 How a project points at a preset (decoded `.xy`)

[D], from `XYF:docs/logs/2026-06-12_preset_path_structural.md`, `…_drum_sample_path_inspection.md`
and `…_sampler_project_state.md`:

1. **Track preset label** (48-byte field at `track+0x453F`): `<folder path under presets>/<name>`
   without `.preset`. Examples: `drum/boop`, `bass/nt-106 bass`, `snapshot/2026-06-15 (1)`,
   `1/nt-106 bass` (user folder "1"). A bare `/` means an engine with no preset.
2. **Per-voice sample path** (voice slot `+0x08`), three families:
   - `/fat32/presets/<folders>/<name>.preset/<file>.wav` for a user preset's own sample, or for a
     sample picked from _another_ preset;
   - `content/samples/<cat>/<file>.wav` for the factory library;
   - `/fat32/samples/user/<file>.wav` for a sample assigned straight from the library.
3. **The sound itself is copied.** Loading a preset writes its engine, envelope, filter, LFO,
   modulation and sample-window values into the project. The project does **not** re-read
   `patch.json`.
4. **Saving a track as a preset** copies the samples into the new `snapshot/…preset` folder and
   repoints the project's paths there.

**Consequences for our deploy policy:**

- Preset folders are **immutable** once deployed. A new version gets a new folder name (e.g.
  `acid bass 2`). Editing `patch.json` in place does not update existing projects. Overwriting a WAV
  in place _silently changes_ every project that uses it.
- **Never rename, move or delete** a preset folder without first scanning `projects/**.xy` for its
  label and paths. xy-format's RLE decoder plus a string scan is enough (`XYF:xy/rle.py`).
- Keep all our content under one collection folder (`presets/op-xy agent/…` or per-session folders)
  so it is easy to find, back up and remove. Mind the 47/71-byte budgets from §3.5.

---

## 5. Algorithms catalogue

All of these are pure sample-domain maths on `Float32Array` channels. They port to TypeScript and run
in a Web Worker (vitest can test them in Node with no browser). **Rule:** parse PCM WAV/AIFF
ourselves. `AudioContext.decodeAudioData` resamples to the context rate, which loses the exact frame
count. Use it only for compressed input (MP3/FLAC/OGG) through an `OfflineAudioContext` at the target
rate.

| Task                             | Best implementation in corpus (file:line)                                                                                                                                                                                                                                                                                                                               | Method                                           | Browser portability → our plan                                                                                                                                                                                                                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **WAV parse + `smpl`**           | `PS:src/utils/audio.ts:94-221` (`parseWavHeader`, `parseSmplChunk`: unity note at +12, first loop at +36)                                                                                                                                                                                                                                                               | chunk walk with even-byte padding                | trivial. Rewrite in TS and add 24-bit, 32-bit float, EXTENSIBLE, odd-size padding and `LIST` skipping                                                                                                                                                                                                               |
| **AIFF parse**                   | `PS:src/utils/aifParser.ts:8,92,189,249,311` (80-bit float rate, COMM, MARK, INST); `YYU:app.js:135-265`                                                                                                                                                                                                                                                                | big-endian chunk walk                            | trivial (YYU has no licence, so reimplement)                                                                                                                                                                                                                                                                        |
| **WAV write (device layout)**    | `PS:src/utils/wavExport.ts:57-173` (fmt + `smpl` + data; mind the loop −1 bug at 149-150)                                                                                                                                                                                                                                                                               | —                                                | trivial. Our writer emits `smpl` 36 bytes by default and 60 with an optional loop                                                                                                                                                                                                                                   |
| **Resample**                     | `SF2:src/sf2_to_opxy/audio.py:31-160` (Blackman windowed-sinc FIR, both numpy and pure Python); Web Audio versions: `PS:src/utils/wavExport.ts:9-22`, `SIX:src/main.js:939-956`, `BUD:lib/audio_tools.js:4-39`                                                                                                                                                          | polyphase windowed sinc vs `OfflineAudioContext` | OfflineAudioContext quality and length rounding vary by engine, so it is not reproducible. → **libsamplerate-js** (MIT wrapper, BSD-2 libsamplerate, WASM) or our own ~150-line TS windowed-sinc. Scale frame positions (loops, slices) by the exact ratio                                                          |
| **Channel convert**              | `PS:src/utils/audio.ts:430-470`                                                                                                                                                                                                                                                                                                                                         | average L+R                                      | trivial. Our option: mid-sum (−3 dB) vs L+R/2                                                                                                                                                                                                                                                                       |
| **Peak normalise**               | `PS:src/utils/audio.ts:243-291`; `SIX:src/main.js:1074-1093` (−3.5 dB target to avoid hot presets)                                                                                                                                                                                                                                                                      | global peak across channels                      | trivial. **Group mode** for multisamples: one gain for the whole preset, which keeps the natural keyboard dynamics (`SFZ:converter/audio.py:84-107`). Per-sample mode for drums                                                                                                                                     |
| **Limit**                        | `PS:src/utils/audio.ts:299-340`; `SIX:src/main.js:1095-1129`                                                                                                                                                                                                                                                                                                            | DynamicsCompressor, ratio 20, 1 ms               | engine-dependent. → a simple look-ahead peak limiter in TS (deterministic)                                                                                                                                                                                                                                          |
| **Silence trim**                 | `SIX:src/main.js:1023-1072` (−50 dB, transient-aware start with 2 ms pre-roll, 0.5 s tail pad); `LGC:splice_and_export.py:170-275` (RMS windows, −60 dB end, 100 ms minimum silence); `PYT:generate.py:148-163` (−80 dB + 5 % fade)                                                                                                                                     | threshold ± hysteresis                           | trivial. Defaults: start −50 dBFS peak with 2 ms pre-roll; end −60 dBFS RMS(10 ms) with 50 ms tail + fade                                                                                                                                                                                                           |
| **Fades**                        | `SIX:src/main.js:1131-1180` (5 ms linear in, equal-power 10 % out; truncation fade)                                                                                                                                                                                                                                                                                     | —                                                | trivial                                                                                                                                                                                                                                                                                                             |
| **Zero-crossing snap**           | `PS:src/utils/audio.ts:515-655` (minimum \|x\| within ±N, threshold 0.001, bounded by in/out); `PYT:generate.py:211-219` (nearest _rising_ crossing); `SF2:src/sf2_to_opxy/converter.py:204-300` (multichannel max-abs, keeps start < end)                                                                                                                              | local search                                     | trivial. Use the rising crossing of the mono sum for loop points and minimum \|x\| for trims. Search ±1000 frames                                                                                                                                                                                                   |
| **Onset / transient detection**  | `SIX:src/main.js:961-1021` (3 ms RMS derivative, first jump > 5 % of max, above −50 dB), fine for the _first_ attack; `YYU:app.js:515-583` (2.5 ms peak envelope, 3-tap smoothing, adaptive threshold = median + 1.5·MAD + sensitivity, local maxima, minimum spacing) for _multiple_ slices; `SLC:xy.py:9-49` (librosa onset_strength + peak_pick, 200 ms minimum gap) | energy vs spectral flux                          | → TS spectral flux (fft.js or meyda, both MIT: log-magnitude positive differences, adaptive median threshold, peak pick) with an energy fallback. Snap each onset back to the preceding zero crossing and −2 ms. Cap at 24                                                                                          |
| **Slicing**                      | even: `YYU:app.js:503-513`; transient: above; device modes transient / even / tap (`sample.html` §18.2); timing-based splice of a rendered sequence: `LGC:splice_and_export.py:357-420` (cut at the known note-on times minus a 20 ms guard)                                                                                                                            | —                                                | trivial. Add **grid slicing** (BPM × subdivision) for loops, and "rendered hits" slicing for audio we generate or capture ourselves (Web Audio or OP-XY USB audio)                                                                                                                                                  |
| **Loop-point finding**           | `PYT:generate.py:203-286` (restrict to the region above 25 % of peak RMS, skip 150 ms of attack, pick start/end with matching 50 ms RMS, snap to rising zero crossings, crossfade = 33 % of loop)                                                                                                                                                                       | RMS matching                                     | O(n²/step²) but fine at 10 ms steps. → add a **normalised cross-correlation** refinement around the candidate end (matches waveform shape, not just level) and period-aware snapping from the pitch estimate. The device crossfades at runtime (`loop.crossfade`), so we need not bake the crossfade into the audio |
| **Pitch detection**              | `SIX:src/main.js:456-526` (pitchy MPM, clarity > 0.8, first 1 s; YIN fallback via pitchfinder)                                                                                                                                                                                                                                                                          | McLeod pitch method / YIN                        | pitchy is **MIT**, use it. pitchfinder is **GPL-3.0**: do not ship it; write YIN from the paper if needed. Analyse the steady part (skip the attack), take the median over frames, report cents offset → `tune`                                                                                                     |
| **Note name parsing**            | `PS:src/utils/audio.ts:704-765` (first note-or-number after the base name, C3/C4 toggle); `SIX:src/main.js:416-453` (last note match, then 21–108 number)                                                                                                                                                                                                               | regex                                            | trivial. Prefer the last match and support `b`/`#`/negative octaves                                                                                                                                                                                                                                                 |
| **Zone assignment**              | fill-down `PS:…patchGeneration.ts:338-358`; midpoint `PYT:generate.py:289-335`, `SF2:…selection.py:56-70`; fill-up `SIX:src/main.js:1614-1650`                                                                                                                                                                                                                          | —                                                | trivial. Default **midpoint** (smallest worst-case transposition); option "TE fill-down" (hikey = root, the device's own convention)                                                                                                                                                                                |
| **Zone down-select to 24**       | `SF2:…selection.py:24-53` (even targets across A0–C8, nearest root); `SIX:src/main.js:1361-1409`                                                                                                                                                                                                                                                                        | greedy nearest                                   | trivial. Prefer keeping the extremes plus even spacing in semitones                                                                                                                                                                                                                                                 |
| **Velocity / RR grouping**       | `SIX:src/main.js:295-382` (suffix patterns `_RR1`, `_V1`, `_f`/`_mf`…)                                                                                                                                                                                                                                                                                                  | regex grouping                                   | trivial → pick one layer (for example ~101 velocity like `SF2:README.md`) or export one preset per layer                                                                                                                                                                                                            |
| **Envelope time ↔ value**        | `SF2:src/sf2_to_opxy/converter.py:14-62` + calibration `SF2:tools/generate_calibration_presets.py`, `SF2:tools/analyze_envelope.py` (onset detection in a recording, 10–90 % attack, release to 10 %)                                                                                                                                                                   | curve fit                                        | trivial. **Re-run the calibration ourselves** over USB audio (§8 #14)                                                                                                                                                                                                                                               |
| **Size and memory estimate**     | `PS:src/utils/audio.ts:489-512`                                                                                                                                                                                                                                                                                                                                         | 44 B header + frames × ch × bytes                | trivial. Use real header sizes and a project-level memory estimate                                                                                                                                                                                                                                                  |
| **Drum role tagging** (AI layer) | none in corpus; filename keywords in `TEO:teopxy.py` (standard layout) and `NIE:`                                                                                                                                                                                                                                                                                       | —                                                | spectral centroid / decay / noisiness features (meyda) plus an LLM for names. Map to the TE layout (§7.4)                                                                                                                                                                                                           |

**Libraries to avoid** (licence): essentia.js (AGPL-3.0), aubio/aubiojs (GPL), pitchfinder (GPL-3.0).
**Good:** pitchy (MIT), fft.js (MIT), meyda (MIT), libsamplerate-js (MIT), fflate (MIT) or JSZip (MIT/GPL dual).

---

## 6. File transfer

### 6.1 Device modes and hard constraints

- **Normal mode**: the OP-XY enumerates as a class-compliant UAC1 audio + USB-MIDI device. It has 4
  interfaces, all class 0x01 (AudioControl, 2× AudioStreaming, MIDIStreaming). There is **no MTP
  interface** (`docs/research/90-device-probe.md`; I confirmed it passively with `ioreg`) [D]. WebUSB
  cannot claim any of these interfaces because Audio is a protected class (§6.3). Use Web MIDI and
  `getUserMedia` instead.
- **MTP mode**: enter it with COM → M4, only while connected to a computer. Exit (eject) with M4
  (`WEB:te-guides_op-xy_how-to.html` §22.10/22.11) [O]. The device re-enumerates; the MTP descriptor
  (class, PID) is **not yet captured** (§8 #2).
- **MIDI is unavailable in MTP mode**: "Is the OP-XY connected and NOT in MTP mode?" and "Exit MTP
  mode required for MIDI" (`XYF:tools/analysis/cc86_select.py:81,252-257`) [C]. MTP deploys and live
  MIDI are separate phases.
- **Field Kit can switch the device into MTP mode itself** ("click the icon to the left of the
  product name", `WEB:te-guides_fieldkit.html`) [O]. The strings in the installed app
  (`/Applications/field kit.app`, v2.0.1 build 218, read-only inspection) show how: `MIDIClient`,
  `TeSysExCommand`, `TeSysExGreetResponse`, `sendMidiGreet()`, "exclusive usb access, trying Core
  MIDI", `_disconnectIfStartedMTPInApp`. So a TE SysEx command enters MTP. It also bundles
  **`libmtp.dylib` and `libusb.dylib`** and has **no FileProvider or Finder mount**: files only move
  through its own window (upload, download, rename, delete, new folder, drag and drop) [D].
- **Firmware:** backups made on OS 1.0.29 may be corrupt (files > 64 KB read off the device) [O].
  Folders deeper than one level need ≥ 1.1.15 [O][C]. Check the version with TE GREET
  (`os_version:1.1.33`, `90-device-probe.md`) before any transfer.

### 6.2 Platforms

| Platform | Native MTP                                                                                               | Human path                                                        | Can the browser do it directly?                                                                                                                                                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| macOS    | **no**: "macOS does not have native support … we released field kit" (`WEB:te-guides_fieldkit.html`) [O] | Field Kit (free, Mac App Store); OpenMTP / MacDroid (third party) | Only via WebUSB (§6.3). Field Kit must be quit (it takes exclusive USB access). If the MTP interface is class 0x06, Photos / Image Capture / Preview (`ptpcamerad`) may also grab it, so quit those too (droidfiletransfer README) [C]                 |
| Windows  | yes (WPD; shows in Explorer) [O]                                                                         | drag and drop in Explorer                                         | **No** WebUSB: the WPD/MTP driver owns the interface. Replacing it (Zadig/WinUSB) is unacceptable UX (droidfiletransfer: "Windows: unsupported") [C]. Explorer's MTP view is not a filesystem path, so the File System Access API cannot target it [H] |
| Linux    | yes (gvfs-mtp, kio-mtp, jmtpfs/simple-mtpfs) [O]                                                         | file manager                                                      | WebUSB, with a udev rule and gvfs not holding the device [C]. Or File System Access into the gvfs FUSE mount `/run/user/<uid>/gvfs/mtp:host=…` [H]                                                                                                     |
| ChromeOS | Files app                                                                                                | —                                                                 | as Linux [H]                                                                                                                                                                                                                                           |

### 6.3 WebUSB + MTP

- **Protected interface classes** (WHATWG WebUSB spec, `WEB:webusb-spec.html`): 0x01 Audio, 0x03
  HID, 0x08 Mass Storage, 0x09 Hub, 0x0B Smart Card, 0x0E Video, 0x10 Audio/Video, 0xE0 Wireless
  Controller. **Still Image 0x06 (PTP/MTP) and vendor 0xFF are claimable.** A browser Android MTP
  tool proves this works in Chrome on macOS (github.com/droidfiletransfer/droidfiletransfer). WebUSB
  exists only in Chromium browsers.
- **Unknown until tested:** the OP-XY's MTP interface class and PID (§8 #2). If it is 0x06 or 0xFF,
  WebUSB can work on macOS and Linux.
- **Libraries:**
  - `webmtp` (npm, BSD-2-Clause, tidepool-org): JS, WebUSB and node-usb. Read-focused; only reads are
    documented.
  - `libmtp-web` (github.com/fstanis/libmtp-web, LGPL-2.1): libmtp compiled to WASM behind a
    File-System-Access-shaped API with writes. Needs JS Promise Integration. Very young (3 commits).
  - droidfiletransfer's `mtp.js` (AGPL-3.0): streaming SendObject, 512 KiB chunks,
    GetObjectPropList fallback. Facts only.
- **Plan:** write our own small TS PTP/MTP client (~1 k LOC + mock-device tests):
  - 12-byte container `{len u32, type u16 (1 cmd, 2 data, 3 resp, 4 event), code u16, txn u32}`;
  - ops: OpenSession 0x1002, CloseSession 0x1003, GetStorageIDs 0x1004, GetObjectHandles 0x1007,
    GetObjectInfo 0x1008, GetObject 0x1009, DeleteObject 0x100B, SendObjectInfo 0x100C, SendObject
    0x100D, MoveObject 0x1019, Get/SetObjectPropValue 0x9803/0x9804 (rename via ObjectFileName
    0xDC07); folders are object format 0x3001 (Association);
  - stream uploads from `File`, cancel only at file boundaries (droidfiletransfer notes that PTP cancel
    leaves Android unresponsive).
  - Gate the whole backend behind a capability probe.

### 6.4 NEW — TE SysEx FILE over Web MIDI (`drum/`, `synth/`)

**What the owner's OP-XY (OS 1.1.33) answered** (other agent's probe, `docs/research/90-device-probe.md`) [D]:

- GREET works.
- FILE INIT (flags 0, max response 4 MiB) returns status 0, data `0C 00 02 00 00`, i.e. a chunk size
  of **128 KiB**.
- LIST node 0 returns **`drum` (id 1)** and **`synth` (id 2)**, both flags `dir|read|write`, size 0.
- LIST 1 and LIST 2 are **empty** (the unit has no user content).
- SETTINGS is not supported.

**How TE's own web tool uses this protocol.** The EP sample tool's bundle, saved at `EPT`
(proprietary: facts only), shows:

- **Framing:**
  - PUT-init `[02 00 flags fileId:u16 parentId:u16 size:u32 name(≤54 chars) 00][inline metadata JSON]`,
    then data pages `[02 01 page:u16 bytes…]`. An empty page means EOF.
  - The init reply carries the assigned file id (`EPT:22814-22849`).
  - `put()` ORs capability flags (READ = 4) with FILE = 1 (DIR = 2 for folders) (`EPT:23299-23324`).
    ep-series-sysex notes that "flags 0x04 alone is rejected".
  - Data per page = `(n − 12) − ⌊(n − 12)/8⌋` with `n = chunk − 6` (`EPT:23478-23485`). That is
    **114 673 bytes (≈ 112 KiB) of raw data per SysEx message** with the OP-XY's 128 KiB chunk.
  - DELETE is `[06 fileId]`. INFO is `[0B fileId]`. METADATA is SET `[07 01 id json 00]`, paged SET
    `[07 04 …]`, GET `[07 02 id page:u16 key? 00]` (`EPT:22892-23075`).
  - TE's handler subscribes to file events (INIT flag 1), serialises every request behind one mutex,
    and defaults to a 1 s timeout (`EPT:23202-23229`).
- **Uploading a sound** (`EPT:35880-35945`):
  1. Resolve the directory node (`/sounds` on EP devices).
  2. On first use, **read the directory node's metadata** to learn accepted `formats` (`pcm`/`s16`,
     `channels`, `samplerate.range`, `samplerate.native`) (`EPT:36299-36303`, `35880-35893`).
  3. Send **raw interleaved s16 PCM, not a WAV**. When the source is already device-format WAV, the
     tool just slices out the `data` chunk.
  4. The inline PUT metadata is `{channels, samplerate, format?, name?, crc?}`.
  5. Then METADATA SET the "teenage meta": `sound.rootnote` (1–127), `sound.loopstart`/`sound.loopend`
     (frames), `sound.bpm`, `sound.pitch` (±12), `sound.pan` (±16), `sound.amplitude` (0–200),
     `envelope.attack`/`envelope.release` (0–255), `sound.playmode`, `time.mode` (`EPT:35771-35812`).
  6. Re-INIT.
  - Names are normalised to ≤ 16 lowercase ASCII characters (`EPT:36391-36402`). Input is limited to
    ≤ 40 s (`EPT:35911-35913`).
- **Community EP-133 findings** (kmorrill/ep-series-sysex `docs/file-protocol.md`,
  ZacharySBrown/ep133-ppak `PROTOCOL.md`; facts only) [C]:
  - Sample slots take raw PCM plus metadata written after upload. `channels`, `samplerate`, `format`
    and `crc` are read-only once set. Names are ≤ 20 ASCII. `sound.playmode` must be written together
    with `envelope.release`.
  - **Safety:**
    - "The FILE subsystem is globally single-threaded"; overlapping sessions (even two readers) wedge
      the device ("err lfs 6327", i.e. LittleFS).
    - A client killed mid-stream leaves session state that survives FILE_INIT: **power-cycle before
      the next write**.
    - Reading past EOF corrupts the session.
    - Allow about 6 s to settle after writes.

**What `drum/` and `synth/` probably are (hypotheses, ranked):**

1. **H1: a sound-import area split by engine family**, TE's EP "sounds" model adapted to the OP-XY.
   `drum/` would hold one-shots for the drum sampler and `synth/` pitched samples for the synth
   sampler and multisampler. The payload would be raw s16 PCM (maybe WAV) plus EP-style metadata
   (`sound.rootnote`, `sound.loopstart`…) or the OP-XY region vocabulary (`pitch.keycenter`,
   `loop.start`…; TE already shares dotted keys such as `sample.start` across products). Uploaded
   files would appear in the sample library, perhaps as `[drum]` / `[synth]` folders.
2. **H2: a filtered view of _user presets_** by engine class. Both folders are empty because this unit
   has no user presets. Uploads would then be `<name>.preset` directories (PUT with DIR) containing
   `patch.json` + WAVs.
3. **H3: a window onto part of `/fat32`.** Weak evidence against it: MTP always shows `samples/user`
   and `presets/`, and these names don't match.

**Read-only discovery first** (only read-class commands; owner present; nothing else talking to
the device):

| #   | Step                                                                                                                                                                                                                  | Tells us                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| R1  | METADATA GET on nodes 1, 2 (and 0), page 0… (exactly what TE's tool does on connect)                                                                                                                                  | accepted `formats`, sample rate, channels; any `type` hints                                   |
| R2  | INFO on 1, 2                                                                                                                                                                                                          | parent, flags (is `delete`/`move`/`playback` offered?)                                        |
| R3  | **Owner records a 1 s sample in the drum sampler** (ordinary device use, no host writes), then LIST 1 and 2. If a file appeared: INFO → METADATA GET → GET **only after INFO confirms the id, and never past `size`** | whether the tree is the sample library; the device's own metadata vocabulary; raw PCM vs RIFF |
| R4  | Same with a synth-sampler recording, then **save preset** (track + M4); LIST again                                                                                                                                    | tests H2 (do presets appear?)                                                                 |
| R5  | Owner enters MTP; list `presets/`, `samples/`                                                                                                                                                                         | how the FILE tree maps onto `/fat32`                                                          |

**Minimal reversible PUT test.** Run it only after R1–R5, with explicit owner approval, one client
only, and Field Kit and TE web tools closed. It writes ≤ 64 KB to the device:

| #    | Action                     | Detail                                                                                                                                                                                                                                                                      |
| ---- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0   | Backup                     | owner copies `presets/`, `samples/`, `projects/` off the device via Field Kit (MTP), then exits MTP                                                                                                                                                                         |
| P1   | INIT                       | `01 01 00 40 00 00` (subscribe, 4 MiB), as TE's tool does. Record the chunk size                                                                                                                                                                                            |
| P2   | PUT into `drum` (parent 1) | name `zz probe`; flags `0x05` (FILE\|READ); fileId 0 (device assigns); inline `{"channels":1,"samplerate":<R1 native or 44100>,"format":"s16"}`; payload = 0.5 s, −12 dBFS, 1 kHz sine, mono s16 (44 100 bytes at 44.1 k: one data page) + EOF page. Record the returned id |
| P3   | Verify                     | LIST 1 (entry + size); INFO id; METADATA GET id (which keys did the device add?); watch for a `FILE_ADDED` event                                                                                                                                                            |
| P4   | Observe on device          | sample library (shift+SAMPLE), drum-key assignment (note key + SAMPLE), preset browser: where does `zz probe` appear, and does it sound right (pitch, length)?                                                                                                              |
| P5   | Clean up                   | DELETE `06 <id>`; LIST 1 confirms; device UI confirms. Wait 6 s between steps                                                                                                                                                                                               |
| P6   | Branch                     | If P2 is refused or the file never appears in the UI: repeat P2–P5 once with a WAV container (`fmt`+`smpl`+`data`) under a new name. Then try `synth` (parent 2) with a tonal sample and `{"sound.rootnote":60}`, and separately `{"pitch.keycenter":60}` via METADATA SET  |
| P7   | H2 only                    | PUT a DIR (`0x06` = DIR\|READ) `zz probe.preset` under 2, then `patch.json` + WAV inside it; check the preset browser; delete the children, then the directory                                                                                                              |
| stop |                            | any unexpected status, UI hang or error → stop, power-cycle, report. Never resume a half-sent PUT without a power cycle                                                                                                                                                     |

**Decision.** If FILE installs sounds, or better, presets, it becomes the **primary** backend:

- no mode switch;
- live MIDI keeps working;
- it rides on the Web MIDI + SysEx permission we already need (Chrome, Edge, Opera, and Firefox with
  its site-permission add-on; not Safari).

If it only accepts loose samples (H1), our "sound" deploys (drum hits, one-shots) use FILE, while full
presets (`patch.json` with zones, loops, envelopes) still need MTP or the manual path. In that case the
agent can still build and preview the preset in the browser and tell the user which sample goes on
which key.

### 6.5 Always-available fallback (manual)

- **Layouts seen in the corpus:**
  - PatchStudio: files at the zip root, downloaded as `name.preset.zip`
    (`PS:src/hooks/usePatchGeneration.ts:34,76`). macOS Archive Utility then creates `name.preset/`.
  - sixthlaw, foxxyz, cfurrow7: a `name.preset/` folder inside the zip.
  - niekert: `drumbuilder/name.preset/` (a collection folder that becomes a browser category).
  - vibing: a device-root-shaped tree `presets/<drop>/…` + `projects/` with a manifest
    (`VIB:README.md:25-51`).
- **Ours:** zip root = `<collection>/` (e.g. `op-xy agent/`) holding the `.preset` folders, plus
  `READ ME.txt`. Build it with fflate (no `__MACOSX` or `.DS_Store`) and deterministic entry order.
  Chromium also gets **"save to folder…"** (`showDirectoryPicker`), which writes the same tree into a
  folder the user chooses, so there is nothing to unzip.
- **Guided steps**, shown on the replica: COM → M4 → (mac) open Field Kit → drag `<collection>` onto
  `presets/` → M4 to eject. The presets appear in a category named after the folder. On the device,
  pasting refuses a same-name preset (`instrument.html` §14.6) [O]. What Field Kit or Explorer do when
  a dropped folder name already exists (merge, replace, prompt) is untested, so always ship new names.
  Very old firmware needed a power cycle after copying (`BUM:README.md:143`).

---

## 7. Recommended design: the TypeScript preset-builder module

**Principles** (VISION): deterministic core; the LLM emits typed intent, never bytes; everything is
testable in vitest without a browser; heavy DSP runs in a Worker; every device write goes through
an explicit, revertible deploy plan.

```
src/lib/sound/
  audio/     pcm.ts (PcmBuffer)  wav.ts (parse/write, device layout)  aiff.ts  decode.ts (compressed → OfflineAudioContext)
  dsp/       resample.ts  mix.ts  normalize.ts  limiter.ts  trim.ts  fade.ts  zerocross.ts
             onsets.ts  slice.ts  loop.ts  pitch.ts (pitchy)  features.ts (meyda-style, for drum-role tagging)
  preset/    types.ts (generated from knowledge/presets/patch-schema.json)  defaults.ts  serialize.ts
             validate.ts  names.ts  layout.ts (TE drum roles)  build-drum.ts  build-multisample.ts
             build-sampler.ts  build-slices.ts  memory.ts  package.ts
  transfer/  backend.ts  manual.ts (zip + folder)  te-file.ts (SysEx FILE, experimental)
             webusb-mtp.ts (experimental)  deploy.ts (plan, diff, immutability, reference scan)
  worker/    sound.worker.ts  (RPC facade over dsp/ + preset/)
```

```ts
// PatchJson, Engine, FilterBlock, Adsr, ValidationResult, DeployResult: preset/types.ts
// (generated from knowledge/presets/patch-schema.json with json-schema-to-typescript, plus hand-written results)

// ---------- audio ----------
export interface PcmBuffer {
	sampleRate: number;
	channels: Float32Array[];
} // planar float
export interface SampleMeta {
	rootNote?: number;
	loop?: { start: number; end: number };
	source: 'wav' | 'aiff' | 'compressed';
	bitDepth?: number;
	name: string;
}
export function parseAudio(
	bytes: ArrayBuffer,
	name: string
): Promise<{ pcm: PcmBuffer; meta: SampleMeta }>;
export function encodeWav(
	pcm: PcmBuffer,
	o?: { bitDepth?: 16 | 24; rootNote?: number; loop?: { start: number; end: number } }
): Uint8Array; // fmt(16) + smpl(36|60) + data

// ---------- dsp (all pure; frame positions are integers) ----------
export const dsp: {
	resample(p: PcmBuffer, rate: number, q?: 'best' | 'fast'): PcmBuffer; // libsamplerate-js or TS sinc
	toMono(p: PcmBuffer, law?: 'avg' | 'minus3dB'): PcmBuffer;
	trim(
		p: PcmBuffer,
		o?: { startDb?: number; endDb?: number; preRollMs?: number; tailMs?: number }
	): { pcm: PcmBuffer; offset: number };
	normalize(ps: PcmBuffer[], o: { targetDb: number; mode: 'each' | 'group' }): PcmBuffer[];
	fade(p: PcmBuffer, o: { inMs?: number; outMs?: number; curve?: 'lin' | 'equalPower' }): PcmBuffer;
	zeroCross(
		p: PcmBuffer,
		frame: number,
		o?: { dir?: -1 | 0 | 1; rising?: boolean; max?: number }
	): number;
	onsets(p: PcmBuffer, o?: { sensitivity?: number; minGapMs?: number; max?: number }): number[];
	slices(
		p: PcmBuffer,
		o: { mode: 'transient' | 'even' | 'grid'; count?: number; bpm?: number; div?: number }
	): { start: number; end: number }[];
	findLoop(
		p: PcmBuffer,
		o?: { minSec?: number; skipAttackSec?: number; periodHz?: number }
	): { start: number; end: number; crossfade: number } | null;
	pitch(p: PcmBuffer): { midi: number; cents: number; hz: number; clarity: number } | null;
};

// ---------- preset specs (what the agent/UI produces) ----------
export type SampleRef = { id: string }; // resolved by a SampleStore (IndexedDB/OPFS)
export type DrumRole =
	| 'kick'
	| 'kick2'
	| 'snare'
	| 'snare2'
	| 'rim'
	| 'clap'
	| 'tamb'
	| 'shaker'
	| 'hatClosed'
	| 'hatClosed2'
	| 'hatOpen'
	| 'clave'
	| 'tomLow'
	| 'ride'
	| 'tomMid'
	| 'crash'
	| 'tomHigh'
	| 'triangle'
	| 'congaLow'
	| 'congaHigh'
	| 'cowbell'
	| 'guiro'
	| 'metal'
	| 'chi'; // = TE factory keys 53..76 (§7.4)
export interface DrumPad {
	key: number | DrumRole;
	sample: SampleRef;
	playmode?: 'oneshot' | 'gate' | 'group' | 'loop';
	transpose?: number;
	gain?: number;
	pan?: number;
	reverse?: boolean;
	trim?: { start?: number; end?: number };
}
export interface DrumKitSpec {
	name: string;
	folder: string;
	pads: DrumPad[];
	engine?: Partial<Engine>;
	fx?: Partial<FilterBlock>;
}
export interface Zone {
	sample: SampleRef;
	root?: number /* else smpl → name → pitch() */;
	tuneCents?: number;
	loop?:
		| 'auto'
		| 'off'
		| 'until-release'
		| 'forever'
		| { start: number; end: number; crossfade?: number };
}
export interface MultisampleSpec {
	name: string;
	folder: string;
	zones: Zone[]; // ≤ 24
	mapping?: 'midpoint' | 'fill-down';
	normalize?: 'group' | 'each' | 'none';
	playmode?: 'poly' | 'mono' | 'legato';
	ampEnv?: Partial<Adsr>;
	octave?: number;
}
export interface BuildOptions {
	sampleRate?: 44100 | 22050;
	channels?: 'mono' | 'keep';
	bitDepth?: 16;
	maxSeconds?: number /* default 20 */;
	naming?: 'strict' | 'relaxed';
}

// ---------- outputs ----------
export interface PresetPackage {
	folder: string;
	name: string;
	patch: PatchJson;
	files: Map<string, Uint8Array>; // 'patch.json' + audio, ready for any backend
	report: { warnings: string[]; bytes: number; sampleMemoryBytes: number; zones: number };
}
export function buildDrumKit(s: DrumKitSpec, o?: BuildOptions): Promise<PresetPackage>;
export function buildMultisample(s: MultisampleSpec, o?: BuildOptions): Promise<PresetPackage>;
export function buildSampler(
	s: Omit<MultisampleSpec, 'zones' | 'mapping'> & { zone: Zone },
	o?: BuildOptions
): Promise<PresetPackage>;
export function buildSliceKit(
	s: {
		name: string;
		folder: string;
		source: SampleRef;
		slicing: Parameters<typeof dsp.slices>[1];
		choke?: boolean;
		shareFile?: false; /* until §8 #11 */
	},
	o?: BuildOptions
): Promise<PresetPackage>;

export function serializePatch(p: PatchJson): string; // device-canonical (see below)
export function validatePackage(pkg: PresetPackage, ctx?: { firmware?: string }): ValidationResult; // ajv(schema) + cross-field + limits + names/path budgets
export function packageToZip(pkgs: PresetPackage[], collection: string): Blob;
export function writeToDirectory(
	dir: FileSystemDirectoryHandle,
	pkgs: PresetPackage[],
	collection: string
): Promise<void>;

// ---------- transfer ----------
export interface TransferBackend {
	id: 'manual' | 'fs-access' | 'te-file' | 'webusb-mtp';
	probe(): Promise<{
		available: boolean;
		canPresets: boolean;
		canSamples: boolean;
		reason?: string;
	}>;
	deploy(
		plan: DeployPlan,
		onProgress?: (done: number, total: number) => void
	): Promise<DeployResult>;
}
export interface DeployPlan {
	firmware: string;
	creates: { path: string; bytes: number }[];
	refusesOverwrite: true;
	referencedBy?: Record<string, string[]>; /* from projects scan */
}
```

### 7.1 Build rules (the deterministic core)

1. **Canonical `patch.json`.** Keys sorted at every level, no whitespace, integers as-is, floats as
   `0.0` for zero and `toFixed(3)` otherwise. This reproduces **all 323 device-authored files
   byte-for-byte** (tested in this session; the one mismatch in the corpus is xy-format's hand-made
   probe). Golden test: parse → serialise → bytes equal for every file in
   `XYF:src/presets/presets/`.
2. **Defaults.** Start from the factory-modal template for the type (§2.3–2.5 tables; drums:
   amp `{0, 0, 32767, 0}`, `fx` inactive; samplers: factory filter/LFO blocks inactive) and apply the
   spec on top. Never emit `name` or unknown keys.
3. **Audio.** Parse, then mono (optional), resample to 44.1 k with the exact ratio, trim, then fade.
   Normalise (group mode for multisamples), limit to −0.3 dBFS, quantise to 16-bit with TPDF dither,
   and write the device-layout WAV with `smpl` root.
4. **Regions.**
   - `framecount` = `sample.end` = actual frames. `sample.start` only when trimmed virtually.
   - Tonal: `hikey` from the chosen mapping (midpoint default; last zone 127); `lokey` = previous
     `hikey` + 1 (harmless and self-documenting); `pitch.keycenter` = root; `tune` = −cents from pitch
     detection when the root is inferred.
   - Loops: `forever` → `onrelease:true`; `until-release` → both flags omitted; `off` → `enabled:false`
     (+ `onrelease:false`).
   - `auto`: sustained material gets `dsp.findLoop` with the crossfade clamped to
     `min(loop.start, len)`; one-shots get off.
   - Drum: `lokey = hikey = key`, `pitch.keycenter` 60, factory-typical field set with all 13 keys.
5. **Validate** before packaging:
   - JSON Schema, then cross-field rules (§2.7);
   - ≤ 24 regions, one per drum key, ascending `hikey`;
   - every file exists and is ≤ 20 s at ≤ 44.1 kHz;
   - names and path budgets (§3.5);
   - project memory estimate vs 64 MiB, and preset size vs 8 MiB (soft).
6. **Deploy.** Immutable folders. Refuse to overwrite. Before any delete or rename, scan projects for
   references (§4.2). Always offer "download instead".

### 7.2 Tests that pin the format (vitest, no device)

- **Serializer golden test.** Parse and re-serialise every device-authored `patch.json` (322 shipped
  plus the device-saved one); the bytes must be identical.
- **Schema acceptance.** The whole corpus plus pytheory must validate. The 9 out-of-range xy-format
  probe files must be rejected with the right messages.
- **WAV writer.** Mono 16-bit output must produce exactly the device's 88-byte header layout
  (`fmt` 16, `smpl` 36, `data`), and parse(write(x)) = x.
- **DSP.**
  - resampler: frame-count maths and sine THD+N;
  - onsets: synthetic click trains (precision/recall at ±5 ms);
  - pitch: synthetic tones at MIDI 24–96 (within ±5 cents) plus detuned samples;
  - loop finder: a boundary-discontinuity metric on sustained synthetic tones;
  - trim and fades: sample-exact expectations.
- **Builders.** Property tests (fast-check, MIT) for the invariants in §2.7 and §3.5: ≤ 24 zones,
  ascending `hikey`, frame bounds, name and path budgets. Snapshot a drum kit and a multisample built
  from fixed synthetic inputs, so any drift is caught.

### 7.3 Agent tool surface (typed intents → the functions above)

| Tool                                                | Input (JSON)                                  | Output                                            | Writes?                                       |
| --------------------------------------------------- | --------------------------------------------- | ------------------------------------------------- | --------------------------------------------- |
| `sample.analyze`                                    | `{sample}`                                    | pitch, loudness, onsets, duration, suggested role | no                                            |
| `sample.slice`                                      | `{sample, mode, count?, bpm?}`                | slice list + previews                             | no                                            |
| `preset.build_drum_kit`                             | `DrumKitSpec` (roles allowed instead of keys) | `PresetPackage` summary + audition link           | no                                            |
| `preset.build_multisample` / `preset.build_sampler` | `MultisampleSpec`                             | package summary                                   | no                                            |
| `preset.validate`                                   | `{package}`                                   | errors/warnings with fixes                        | no                                            |
| `files.plan_deploy`                                 | `{packages, backend?}`                        | `DeployPlan` (paths, sizes, conflicts)            | no                                            |
| `files.deploy`                                      | `{planId}`                                    | result                                            | **yes → requires explicit user confirmation** |

The agent can also _render_ sounds (Web Audio synthesis, like pytheory's offline renders) or
_capture_ them. The OP-XY is a USB audio input, so "resample the OP-XY's own engines or an external
synth into a multisample" works like `BUM:RecordSamples.py`: play a MIDI note, record USB audio, trim,
and slice by the known note times (like `LGC:`).

### 7.4 TE drum layout (use it for role → key)

Derived from 22 factory kits (`XYF:src/factory-preset-captures/firmware-1.1.21/`, key byte → sample
category, decoded in this session) [D]. Identical to the community "standard layout"
(`PYT:opxy-preset-notes.md` "Drum Kit Layout"; `BUD:`).

| Key | Note (C4=60) | Role                                        | Key | Note | Role                         |
| --- | ------------ | ------------------------------------------- | --- | ---- | ---------------------------- |
| 53  | F3           | kick                                        | 65  | F4   | low tom                      |
| 54  | F♯3          | kick 2                                      | 66  | F♯4  | ride                         |
| 55  | G3           | snare                                       | 67  | G4   | mid tom                      |
| 56  | G♯3          | snare 2                                     | 68  | G♯4  | crash                        |
| 57  | A3           | rim                                         | 69  | A4   | high tom                     |
| 58  | A♯3          | clap                                        | 70  | A♯4  | triangle                     |
| 59  | B3           | tambourine (sometimes shaker)               | 71  | B4   | low conga                    |
| 60  | C4           | shaker                                      | 72  | C5   | high conga                   |
| 61  | C♯4          | closed hat                                  | 73  | C♯5  | cowbell                      |
| 62  | D4           | closed hat 2                                | 74  | D5   | guiro                        |
| 63  | D♯4          | open hat (use `group` with 61/62 for choke) | 75  | D♯5  | metal / aux (sometimes clap) |
| 64  | E4           | clave                                       | 76  | E5   | chi / aux (sometimes clap)   |

---

## 8. Open questions and device tests

Each test needs the owner. Anything that writes is marked ✍︎ and needs explicit approval, backups
first.

1. **File-name octave convention on 1.1.33.** Is `probe-a3.wav` (no `smpl`) read as MIDI 57 (C4 = 60)
   or 69 (C3 = 60)? Use MTP ✍︎ to add it to `samples/`, then load it in the synth sampler and check the
   root on screen.
2. **MTP-mode USB descriptor** (owner enters MTP; we read `ioreg` passively): interface class /
   subclass / protocol, PID, endpoints. Then test whether Chrome WebUSB can `claimInterface` on macOS
   (with Field Kit and Photos closed) and on Linux.
3. **TE FILE semantics** of `drum/` and `synth/`: R1–R5, then P0–P7 ✍︎ (§6.4). Also measure throughput
   and the largest accepted file.
4. **Audio format acceptance inside presets** ✍︎: 22.05 / 48 kHz, 24-bit, stereo, AIFF, 32-bit float,
   WAVE_FORMAT_EXTENSIBLE. Check correct pitch and length and the effect on sample memory.
5. **Length > 20 s inside a preset** ✍︎: loads, truncates, or is rejected?
6. **Multisampler zone rules** ✍︎: notes above the last `hikey`; unsorted `hikey`; duplicate `hikey`;
   25+ regions (ignored or refused?).
7. **Loop edge cases** ✍︎: the `0xC0` combination; `loop.end` inclusive vs exclusive (single-cycle
   loop click test); crossfade > `loop.start`.
8. **Does the device ever re-read `patch.json`** for a project that references it? Edit the file after
   assignment ✍︎ and reload the project. Expected: no.
9. **Naming limits** ✍︎: preset names 24/32/48 characters (display and label truncation); underscores;
   UTF-8 (post-1.1.15); sample paths > 72 and > 96 bytes; what a saved project stores.
10. **Drum field units** ✍︎: `fade.in`/`fade.out`, `tune`, `pitch.keycenter` ≠ 60; `engine.playmode`
    mono vs poly on a kit (does mono choke every pad?); `gain` outside −30…+20.
11. **Slice kits sharing one WAV** ✍︎ (many drum regions, one file, different `sample.start`/`end`,
    as digichain does): does it play correctly, and is memory counted once? What does the device's own
    slicer save? (Owner slices on device, saves the preset, and we read `patch.json` over MTP.)
12. **User-made synth presets** ✍︎: arbitrary P1–P4 accepted? Meaning of `params[4..7]`?
13. **`bendrange` scale:** read the on-screen value for the factory presets that use 8191, 13653 and
    32767 (read-only: just browse).
14. **Envelope calibration via USB audio** (send notes; record the OP-XY audio input). This redoes
    sf2-to-opxy's attack/decay fit and fixes the release fit. Harmless, but announce it (it plays
    sound).
15. **Missing samples:** rename a preset folder ✍︎ that a project uses. Is it silent? An error? Is it
    re-linked?
16. **Import tolerance** ✍︎: `name`/unknown keys and missing optional keys (`tune`, `loop.crossfade`).
    This decides how strict the importer must be.
17. **Unseen enum strings**: `lfo.type` for duck, the `midi` engine `type`, extra filter models. Save
    presets using them on device and read them back over MTP.
18. **Field Kit's "enter MTP" SysEx:** capture it with the owner's consent (a USB/MIDI monitor while
    pressing the Field Kit button). That would allow one-click MTP from the browser. Never send DFU
    (`60-firmware.md` §8).
19. **`engine.tuning[]` and the `tuning.scale` enum** (read-only: browse tunings and compare with
    presets).
20. **Sample-memory accounting**: stereo = 2×? 24-bit stored as 16? Does the budget cover all
    patterns' presets? Watch the on-screen memory indicator while loading test presets ✍︎.

---

## 9. Repos read and what we may reuse

| Repo (under `research/repos/`)                                                                                                                              | Licence (evidence)                                                                      | Last commit | What we may reuse                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kmorrill_xy-format`                                                                                                                                        | **MIT** (`LICENSE`)                                                                     | 2026-09-15  | Code and analysis with attribution (RLE codec, preset/project mappings). The corpus `patch.json` files are **TE's shipped content**: use them locally for tests; don't redistribute bulk copies |
| `ish-_te-opxy-patchstudio`                                                                                                                                  | **MIT** (`LICENSE`: Joseph Holland; portions Brandon Withrow)                           | 2025-09-22  | Code with attribution (WAV/AIFF parsers, zero-crossing, patch generation). Fix the `smpl` loop off-by-one                                                                                       |
| `buba447_opxy-drum-tool`                                                                                                                                    | **MIT** (`LICENSE`)                                                                     | 2025-06-26  | Code with attribution (templates are the ancestry of most tools)                                                                                                                                |
| `buba447_OPXY-Multisample-Tool`                                                                                                                             | MIT stated in README and docstring; **no LICENSE file**                                 | 2025-01-11  | Ideas and facts; small snippets with attribution are low-risk                                                                                                                                   |
| `kennethreitz_pytheory-opxy`                                                                                                                                | **none** (no LICENSE; the `pytheory` dependency is separate)                            | 2026-04-02  | Facts and algorithms only (reimplement the RMS loop finder). Don't copy code or ship its audio                                                                                                  |
| `sixthlaw_opxy-multisampler-preset-builder`                                                                                                                 | MIT in `package.json` and README; no LICENSE file. **Depends on pitchfinder (GPL-3.0)** | 2025-11-26  | Ideas and facts. Reimplement; use pitchy (MIT), not pitchfinder                                                                                                                                 |
| `aliosa27_op-xy-slicer`                                                                                                                                     | README claims MIT; no LICENSE file                                                      | 2024-12-21  | Facts only (librosa approach)                                                                                                                                                                   |
| `niekert_op-xy-drum-builder`                                                                                                                                | **none**                                                                                | 2025-08-31  | Facts only                                                                                                                                                                                      |
| `charlesvestal_sf2-to-opxy`                                                                                                                                 | **MIT** (`LICENSE`)                                                                     | 2026-02-05  | Code with attribution (calibration method, SF2 mapping, sinc resampler design)                                                                                                                  |
| `matthewjschultz_swift-te`                                                                                                                                  | **MIT** (`LICENSE`, `NOTICE.md`)                                                        | 2026-08-10  | Code with attribution (a Swift port of PatchStudio knowledge)                                                                                                                                   |
| `brian3kb_digichain`                                                                                                                                        | **AGPL-3.0**                                                                            | 2026-09-01  | **Facts only** (XY export shapes, name sanitising rules, slice-kit approach)                                                                                                                    |
| `foxxyz_op-xy-patch-generator`                                                                                                                              | **MIT** (`cli/LICENSE`, README)                                                         | 2025-02-01  | Code with attribution (little to reuse; its framecount maths is wrong)                                                                                                                          |
| `YYUUGGOO_OP-XY-Drum-Utility`                                                                                                                               | **none**                                                                                | 2026-03-01  | Facts only (MAD-threshold slicer idea). Its `opxy json doc.md` is unreliable                                                                                                                    |
| `paul-sneddon_teopxy`                                                                                                                                       | **GPL-3.0**                                                                             | 2024-12-02  | **Facts only** (OP-1 → OP-XY value mappings: playmode, gain)                                                                                                                                    |
| `legsmechanical_opxy-to-sfz`                                                                                                                                | **none**                                                                                | 2026-05-18  | Facts only (its reading of loop fields and group normalisation)                                                                                                                                 |
| `cfurrow7_dx7-opxy`                                                                                                                                         | MIT (`package.json`, README; fork of spacejam/tv7-js)                                   | 2026-01-28  | Check the upstream licence before any reuse. Facts only for now                                                                                                                                 |
| `cfurrow7_opxy-converter`                                                                                                                                   | "Free to use and modify" (README; no LICENSE file)                                      | 2026-01-11  | Facts only (ambiguous licence)                                                                                                                                                                  |
| `cfurrow7_rings-multisampler`                                                                                                                               | MIT stated in README; no LICENSE file                                                   | 2026-01-29  | Facts only                                                                                                                                                                                      |
| `akselele_xympler`                                                                                                                                          | **MIT** (`LICENSE`)                                                                     | 2026-07-18  | Code with attribution (a PatchStudio derivative)                                                                                                                                                |
| `DimaDake_maschine-multisample-to-op-xy-converter`                                                                                                          | **Apache-2.0** (`LICENSE`; `package.json` says ISC, and the LICENSE file governs)       | 2025-11-05  | Code under Apache-2.0 (keep NOTICE); little to reuse                                                                                                                                            |
| `inrainbws_logic_pro_drums_for_opxy`                                                                                                                        | **none** (and Logic content is Apple's)                                                 | 2025-12-08  | Facts only (timing-based splice workflow)                                                                                                                                                       |
| `kmorrill_op-xy-vibing`                                                                                                                                     | **MIT** (`LICENSE`)                                                                     | 2026-06-14  | Code and docs with attribution (drop-export layout; exported-preset observations)                                                                                                               |
| TE EP sample tool bundle (`research/web/firmware/ep-sample-tool/`)                                                                                          | proprietary TE                                                                          | —           | **Facts only** (protocol interoperability)                                                                                                                                                      |
| Field Kit app (`/Applications/field kit.app`)                                                                                                               | proprietary TE                                                                          | v2.0.1      | Facts only (from `strings`)                                                                                                                                                                     |
| External: webmtp (BSD-2), libmtp-web (LGPL-2.1), droidfiletransfer (AGPL-3.0), kmorrill/ep-series-sysex and ZacharySBrown/ep133-ppak (licences not checked) | as stated                                                                               | —           | webmtp is usable; libmtp-web is usable as a separately loaded module; the rest are facts only                                                                                                   |

---

## 10. Reproducing the key findings

- **Field value census and schema validation.** Walk `XYF:src/presets/presets/*/patch.json` with
  Python. Validate with `jsonschema` against `knowledge/presets/patch-schema.json`: 322/322 shipped,
  2/2 device-saved and 95/95 pytheory files pass. The only failures are the 9 deliberately
  out-of-range probe files (numeric or `"key"` playmode, gain 64/127).
- **Voice-slot bytes.** `from xy.rle import decode; img = decode(open(f,'rb').read(), 8)`, then
  find `probe.wav` (or `content/samples/…`); the slot starts 8 bytes before the path. Read `+0x00`
  (root / tune centre), `+0x02` (hikey / key), `+0x03` (loop or playmode flags), `+0x04` (tune),
  `+0x05` (gain), `+0x07` (reverse).
- **Canonical JSON.** `json.dumps(j, sort_keys=True, separators=(',',':'))` plus the `tuning` float
  rule reproduces 323/323 device files.
- **Device WAV layout.** Walk the RIFF chunks of
  `XYF:src/sampler-project-state/2026-06-15/presets/*/unnamed1-c4-0.wav`.
