# 10 — The native OP-XY project format (`.xy`), via kmorrill/xy-format

> **Scope.** Everything an engineer needs to port the `.xy` reader/writer from
> [`kmorrill/xy-format`](https://github.com/kmorrill/xy-format) (MIT) to TypeScript for our
> browser-only SvelteKit app, without re-reading the upstream repo.
>
> **Upstream snapshot.** Local clone at `research/repos/kmorrill_xy-format` (git-ignored, shallow),
> commit `7a74acc2969d5d822e040dba041c16268770b09f` (2026-09-15, "Fix default scene presence and
> preserve inactive notes during rotation"). Unless noted, every path in this document is relative to
> that repo root.
>
> **Method.** I read the docs, code, tests and corpus; ran the Python test suite
> (1545 passed / 25 skipped); ran corpus-wide scans; built an end-to-end demo spec → `.xy`; and wrote a
> throwaway TypeScript prototype that round-trips the whole corpus and reproduces 17 byte-exact goldens
> (details in §7.6 and Appendix B). The prototype sits in the session scratchpad, not in this repo.
> Nothing was sent to the device.
>
> **Author / date.** OP-XY Agent research, 2026-09-26. Our reference firmware is **OS 1.1.33**
> (`docs/DECISIONS.md` D3). Upstream evidence stops at **1.1.25**, so every claim here still has to be
> re-verified on 1.1.33 (§8).
>
> **Port status (2026-09-28).** The TypeScript port is in `src/lib/core/xy/`: container, lane-aware walk,
> project model, reader, template writer, and `simToXy`, the compiler from the simulator's state. It
> reproduces the Python library byte for byte, 17 device captures included, and walks the owner's
> 1.1.33 blank project, whose layout is the 1.1.4 one. What is ported and verified, and what is left for
> the device session: §7.7.

---

## Contents

1. [TL;DR and confidence levels](#1-tldr-and-confidence-levels)
2. [Container: header, RLE, checksums](#2-container-header-rle-checksums)
3. [Decoded image map](#3-decoded-image-map)
4. [Authoring model](#4-authoring-model)
5. [The MIDI CC map document](#5-the-midi-cc-map-document)
6. [Test corpus inventory (golden fixtures)](#6-test-corpus-inventory-golden-fixtures)
7. [Porting plan to TypeScript](#7-porting-plan-to-typescript)
8. [Open questions / verify on the real device](#8-open-questions--verify-on-the-real-device)
9. [License and attribution](#9-license-and-attribution)

- [Appendix A — Corrections and new findings vs upstream docs](#appendix-a--corrections-and-new-findings-vs-upstream-docs)
- [Appendix B — Validated TypeScript reference code](#appendix-b--validated-typescript-reference-code)
- [Appendix C — Reproduction commands](#appendix-c--reproduction-commands)
- [Appendix D — Factory preset donor library (firmware 1.1.21)](#appendix-d--factory-preset-donor-library-firmware-1121)
- [Appendix E — Upstream files that are legacy and must NOT be ported](#appendix-e--upstream-files-that-are-legacy-and-must-not-be-ported)

---

## 1. TL;DR and confidence levels

**The format is simple.**

```text
.xy file = 8-byte header (DD CC BB AA + 4 version bytes) + ONE byte-level RLE stream to EOF
RLE rule  = after two equal consecutive bytes, the next byte is an extension count
            (that many extra repeats); the extension byte resets pair detection
decoded   = the firmware's in-RAM project struct: little-endian, packed (no alignment),
            count-prefixed vectors; ~290 KB for an empty project, up to a few MB
```

Sources: `README.md`, `xy/rle.py`, `docs/format/record_structure.md` §0, and
`docs/state_of_understanding.md` (entry 2026-06-09).

- There is **no checksum and no length field**. Files the upstream tools authored (copied header plus a
  re-encoded body) load on hardware. Evidence: `output/image-probes/*` device passes in
  `docs/state_of_understanding.md`.
- **Authoring means editing the decoded image the way the firmware would, then re-encoding
  canonically.** Take a known-good baseline (`src/one-off-changes-from-default/unnamed 1.xy`, a blank
  project saved on firmware 1.1.4), set fields, splice 12-byte note records in or out, append 17,876-byte
  pattern structs for extra patterns, write 33-byte scene rows and variable-length song slots, and keep
  every count consistent. The firmware **asserts rather than validates**, so an incoherent state crashes
  it (`docs/engineering/authoring.md`, `docs/debug/crashes.md`).
- The upstream codec round-trips the corpus byte-exactly. **909 of 915** `.xy` files re-encode
  identically. All six failures are legacy tool-generated files in `output/` whose RLE is not canonical.
  Every device-saved file round-trips (my scan, Appendix C).
- The upstream writer reproduces device captures **byte-exactly** from semantic edits: one note, bars,
  gates, tempo, groove, click, MIDI channels, EQ, track scale, engine param, step components, blank
  multi-pattern topologies, and preset donor copy (`tests/test_image_writer.py`). My TS prototype
  reproduces 17 of these byte-exactly.
- **Device-validated end to end** (firmware 1.1.4, June 2026):
  - notes, including the note==velocity case;
  - varied gates;
  - 8 tracks × 9 patterns (1,617 notes) with 9 scenes and a Song 1 chain ("Whitney");
  - a sparse T4-only arrangement with 6 scenes and a song ("Tiesto");
  - scene mutes;
  - preset transfer to a non-native track.

  P-lock rotation and carry behaviour was checked on **1.1.25** in August 2026. Sources:
  `docs/state_of_understanding.md` and `docs/logs/2026-08-26_plock_rotation_carry_curve.md`.

- **Firmware evidence.**
  - Most fixtures are **1.1.4** (header `DD CC BB AA 09 13 03 86`).
  - 24 factory-preset captures are **1.1.21** (header `… 09 13 06 86`, same layout).
  - The 1.1.25 captures are _not_ in the repo.
  - Nothing has been captured on 1.1.33, although the owner's unit reports `os_version:1.1.33` via TE
    SysEx GREET (`docs/research/90-device-probe.md`).
- **16 patterns per track** (OS 1.1.15+). The code allows it (`MAX_PATTERNS_PER_TRACK = 16` in
  `xy/image_writer.py`, `tools/midi_to_xy.py`) and a structural test exists
  (`test_build_arrangement_supports_sixteen_patterns_per_track`). However, **no corpus file has more
  than 9 patterns on a track and no device test of more than 9 is recorded.** Treat it as unverified.
- **I found several upstream mistakes and closed several open items** (Appendix A). The four that
  matter most for the port:
  1. Each pattern struct carries **three performance-automation lanes** after its note vector. This
     fixes structure walking for live-recorded files: 913/915 walk and parse, versus 907 with the
     upstream scanner.
  2. The p-lock "master flag" at `+0x304E` is really an **8-byte union of all step lane masks**
     (41 of 41 device structs agree). The upstream writer gets it wrong for every lane except Param 1.
  3. Sample regions are **128-byte records starting at `+0x393F`**, not at `+0x3957`. This resolves the
     upstream "fade stored on the preceding voice", "shifted layout", and "voice 23 overlaps the preset
     path" puzzles.
  4. The global master mix is **12 aligned Q31 words at `0x65+4k`**, not "EQ at 0x68 with a level byte
     at field start".

  Smaller findings: a per-track keyboard octave array at global `0x3D`; "scene volume" is per-pattern
  volume; the full step-component value enum (from the guide's table); LFO type 6 = duck.

### Confidence legend used below

| Mark  | Meaning                                                                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- |
| **D** | Device-validated: an authored file behaved correctly on hardware, _or_ a semantic edit reproduced a device capture byte-exactly |
| **C** | Corpus-validated: consistent across device-saved captures (paired one-knob diffs), no authored device test                      |
| **P** | Partial: location known; enum, scaling or semantics incomplete                                                                  |
| **H** | Hypothesis (mostly mine): structurally consistent, needs a device capture                                                       |
| **U** | Unknown / opaque: preserve verbatim                                                                                             |
| ★     | New in this report (not in upstream docs, or contradicts them); evidence given                                                  |

### Confidence summary by feature

| Feature                                                                       | Read | Write | Confidence | Notes                                                                                      |
| ----------------------------------------------------------------------------- | ---- | ----- | ---------- | ------------------------------------------------------------------------------------------ |
| Container + RLE                                                               | ✅   | ✅    | **D**      | Round-trips 100% of device files                                                           |
| Tempo, groove type/amount, click, time sig, transpose, voices, MIDI ch        | ✅   | ✅    | **D/C**    | Byte-exact replication for tempo, groove, click and MIDI channel; the rest are PCFG probes |
| Per-track keyboard octave (global `0x3D+t-1`)                                 | ✅   | ✅    | **C★**     | T1 matches 139 of 139 preset projects                                                      |
| Notes (tick, gate, note, vel, flags)                                          | ✅   | ✅    | **D**      | 120 per pattern; negative ticks = pickups                                                  |
| Pattern length 1–64 steps, bars                                               | ✅   | ✅    | **D**      |                                                                                            |
| Multi-pattern (≤9) topology                                                   | ✅   | ✅    | **D**      | j05/j06 byte-exact; Whitney on device                                                      |
| 10–16 patterns per track                                                      | ✅   | ✅    | **H**      | Code only, never on device                                                                 |
| Scenes (pattern select + mutes + flag)                                        | ✅   | ✅    | **D/C**    | Mute boolean (device writes 2)                                                             |
| Song chains (14 slots, loop)                                                  | ✅   | ✅    | **D**      | Variable-length footer to EOF                                                              |
| Step components (14 types, 64 steps)                                          | ✅   | ✅    | **D**      | Byte-exact for pulse; value enum from guide ★                                              |
| P-locks (42 columns × 64 steps)                                               | ✅   | ✅    | **C/D★**   | Union-mask fix ★; carry rule is 1.1.25 **D**                                               |
| Engine id, M1..M4 page words, envelopes, filter, LFO                          | ✅   | ✅    | **C/P**    | Word map solid; many enums partial                                                         |
| Track mixer (vol, pan, sends)                                                 | ✅   | ✅    | **C**      | P2-A probes                                                                                |
| Master EQ / saturator / comp / master vol                                     | ✅   | ✅    | **C★**     | Aligned Q31 words ★                                                                        |
| Preset load via donor copy                                                    | ✅   | ✅    | **D**      | u116 replication; 156 factory donors (1.1.21)                                              |
| Drum kit voices (paths, tune, gain, pan, dir, window)                         | ✅   | ✅    | **C★**     | Record-model correction ★                                                                  |
| One-shot sampler window                                                       | ✅   | ✅    | **C**      |                                                                                            |
| Performance lanes (PB/MW/AT keyframes)                                        | ✅   | ⚠️    | **C★**     | Lane boundaries certain; header semantics partial                                          |
| Aux tracks T9–T16 specifics                                                   | ⚠️   | ⚠️    | **P**      | Brain mask, FX type, sends, filter/LFO words                                               |
| Players (arp/maestro/hold), sound link, multisampler zones, mod-routing enums | ❌   | ❌    | **U**      | Not mapped upstream                                                                        |

---

## 2. Container: header, RLE, checksums

### 2.1 The 8-byte header

| Offset | Size | Observed values                                                                         | Meaning                                                                              | Confidence                                       |
| ------ | ---- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------ |
| 0      | 4    | `DD CC BB AA`                                                                           | Magic                                                                                | **D**                                            |
| 4      | 1    | `09` (all 915 files)                                                                    | Unknown; constant                                                                    | **U**                                            |
| 5      | 1    | `13` (all files in repo); `14` (OS 1.1.33, the owner's blank project)                   | Layout family; selects the global header size (below)                                | **C** (other values from issue #19, not in repo) |
| 6      | 1    | `03` (1.1.4 era, 891 files); `06` (1.1.21 factory captures, 24 files); `07` (OS 1.1.33) | Probably a minor format/firmware revision; the layout is identical for 03, 06 and 07 | **C**/H                                          |
| 7      | 1    | `86` (all files)                                                                        | Unknown; constant                                                                    | **U**                                            |

Sources: `xy/rle.py` (`HEADER_LEN = 8`, `MAGIC`) and my tally over all 915 files (Appendix C).

Header byte 5 selects where Track 1 begins in the decoded image (`xy/image_writer.py`
`TRACK_BASE_BY_FIRMWARE`; `docs/format/decoded_image_map.md`, citing upstream GitHub issue #19, which
validated 1,039 device files):

| header[5]      | Track 1 decoded offset | Notes                                                                                                                  |
| -------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `0x0E`, `0x0F` | 3,933                  | Older firmware (not in repo)                                                                                           |
| `0x10`, `0x11` | 3,433                  | Older firmware (not in repo). 16 bytes smaller, which suspiciously equals the 16-byte per-track MIDI channel array (H) |
| `0x13`         | 3,449 (`0x0D79`)       | Every file in the repo, firmware 1.1.4 through 1.1.21                                                                  |
| `0x14`         | 3,449 (`0x0D79`)       | OS 1.1.33 (2026-09-28): the owner's blank project decodes to the same 289,521 B and walks with the 1.1.4 layout (§7.7) |

**The header is copied verbatim** from the baseline by every writer (`encode_project(header, image)`).
There is no length field. `docs/parse_capability_checklist.md` §1 claims "magic, payload length", which
is wrong. There is no checksum anywhere: edited bodies load on device.

**Porting rule.** Read any header[5] in the table (layout only differs by Track 1's base), but **write
only `0x13`**, the only family with authored-file device evidence. Whether 1.1.33 writes `09 13 06 86`
or something newer is open question Q1. Files authored from the 1.1.4 baseline (`… 03 86`) were
accepted by a 1.1.25 device (`docs/logs/2026-08-26_plock_rotation_carry_curve.md`).

**As ported (2026-09-28).** OS 1.1.33 writes `09 14 07 86`, with the 0x13 layout. The TS writer takes
templates of families `0x13` and `0x14` and keeps the template's header, so a file authored over a
1.1.33 blank project carries the header the device itself writes. It refuses the older families,
whose global header is not mapped. Whether 1.1.33 loads a file authored over the 1.1.4 template is
still Q3.

### 2.2 RLE: exact specification

Source: `xy/rle.py` (98 lines) and `tests/test_rle.py`.

**Decode.** Pairing happens on consecutive _input_ bytes, and an extension byte clears the pair state:

```text
function decode(buf, start=8):
    out = []
    prev = NONE
    i = start
    while i < len(buf):
        b = buf[i]; i += 1
        out.append(b)
        if b == prev:                       # second byte of an equal pair
            if i >= len(buf): error "extension byte missing"
            ext = buf[i]; i += 1            # 0..255 additional repeats
            out.append(b repeated ext times)
            prev = NONE                     # extension byte never pairs with anything
        else:
            prev = b
    return out
```

**Encode.** This is canonical-greedy, which is what the firmware writes:

```text
function encode(data):
    out = []
    i = 0
    while i < len(data):
        v = data[i]; j = i
        while j < len(data) and data[j] == v: j += 1
        k = j - i                           # maximal run length
        while k >= 2:
            c = min(k, 257)                 # 2 literal + ext 255
            out += [v, v, c - 2]
            k -= c
        if k == 1: out += [v]               # lone leftover literal
        i = j
    return out
```

Worked examples (all in `tests/test_rle.py`):

| Decoded                      | Encoded                      | Why                                                                               |
| ---------------------------- | ---------------------------- | --------------------------------------------------------------------------------- |
| `05`                         | `05`                         | Single byte, literal                                                              |
| `05 05`                      | `05 05 00`                   | Pair plus extension 0 (the "note == velocity" case: note 60, vel 60 → `3C 3C 00`) |
| `00 00 00`                   | `00 00 01`                   |                                                                                   |
| `F0 00 00 00` (u32 gate 240) | `F0 00 00 01`                | The legacy "gate token" was just this                                             |
| 600 × `00`                   | `00 00 FF 00 00 FF 00 00 54` | Chunks of 257, 257, 86                                                            |
| —                            | `08 08 02 08 09` → `08×5 09` | Pair state resets after an extension                                              |

Key properties:

- **Any valid RLE decodes; only canonical-greedy re-encodes identically.** One upstream specimen
  (`bleez.xy`, no longer in the repo) had non-greedy splits that "decode fine, re-encode smaller".
  Whether the device accepts non-canonical input was never tested in isolation, so we always emit
  canonical output.
- At the pure RLE level the only undecodable input is an equal pair at the very end with no extension
  byte. Everything else decodes, so corruption shows up _structurally_ as wrong sizes or counts. For
  example, a single-byte edit in `bleez34.xy` created or broke an equal pair, shifted the stream, and
  crashed the device (`docs/format/record_structure.md` §4, "Editing safety rule"). This is also why
  byte-poking the compressed file is never safe: always edit the decoded image.
- Decoded size can be computed in a first pass (sum of `1 + ext`) and allocated once. My TS decoder
  decodes all 915 files (280 MB of images) in 0.5 s under Node.
- Compression ratio is about 30× for an empty project (289,521 B → 9,491 B body).

### 2.3 What "coherent state" means (the only real validation)

The firmware asserts on impossible states, reporting `num_patterns > 0` or
`fixed_vector.h:77 length < thesize` (`docs/debug/crashes.md`). Before writing, a TS writer must
guarantee:

1. The image is exactly `global[3449] + Σ pattern structs + footer`, and the footer is exactly 14 song
   slots ending at EOF (§3.10).
2. Every leader's pattern count is 1..16 (1..9 before 1.1.15), and the number of clone structs that
   follow equals `count − 1`.
3. Every pattern's note count is ≤ 120 and matches the record bytes that follow. The three
   performance-lane count bytes must follow, then the 97-byte fixed tail (§3.7).
4. Scene selections must be `< pattern count` of that track. The upstream spec compiler clamps
   (`docs/format/scenes_songs.md`).
5. Song scene ids must be < 99 and each chain ≤ 96 entries (`ImageProject.set_song_chain`).
6. When copying preset identity, the donor must be a pristine single-pattern zero-note track (crash #4
   in `docs/debug/crashes.md`), and the target must have no notes (Appendix A.9).

---

## 3. Decoded image map

All offsets below are **decoded-image** offsets for layout family `0x13`. "Pattern-relative" offsets are
from a pattern struct's _base_ (defined in §3.4). Types are little-endian. `Q31` means an unsigned
fraction stored as u32, `0x00000000..0x7FFFFFFF` = 0..1.

### 3.1 Top-level layout

```text
image offset   size          content
0x0000         0x95 (149)    ProjectSettings (global fields)                        §3.2
0x0095         3,300         Scene[100], 33 B each                                   §3.3
0x0D79         variable      PatternStruct × Σ(pattern counts):                      §3.4
                               T1 leader, T1 clones…, T2 leader, T2 clones…, … T16
footer         variable      SongSlot[14], variable length, runs to EOF              §3.10
```

Baseline size: `3,449 + 16 × 17,876 + 56 = 289,521` (`docs/format/decoded_image_map.md`). My TS walker
confirms that every device-saved file satisfies this structure once §3.7's lanes are accounted for.
The largest corpus image is 1,452,933 B (Whitney: 8 tracks × 9 patterns).

### 3.2 ProjectSettings (`0x0000..0x0094`)

My variance scan over every device-saved file in `src/` shows that **every byte that ever varies is
explained** by the named fields below. The unknown ranges never changed in the corpus: preserve them
from the baseline.

| Offset       | Size | Type   | Field                                   | Encoding / values                                                                                                                   | Baseline     | Conf                    | Evidence                                                                                                                                       |
| ------------ | ---- | ------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `0x00`       | 2    | u16    | Tempo                                   | Tenths of BPM (1200 = 120.0). 40.0 BPM captured as min                                                                              | `B0 04`      | **D**                   | u4, u5 byte-exact (`tests/test_image_writer.py`)                                                                                               |
| `0x02`       | 1    | i8     | Groove amount                           | −127..+127. One UI detent = ±2 except at the ends                                                                                   | `00`         | **C**                   | `src/project-config-probes/2026-06-global-header` (`hdr-grv-*`)                                                                                |
| `0x03`       | 1    | u8     | Groove type                             | 0 shuffle, 1 half-shuffle, 2 danish, 3 bombora, 4 wobbly, 5 gaussian, 6 accents, 7 island nod, 8 disfunk, 9 roll over, 10 prophetic | `00`         | **D** (8), **C** (rest) | u11 byte-exact; `xy/project_config_inspection.py` `GROOVE_TYPE_NAMES`. Do **not** use `tools/inspect_xy.py`'s legacy table                     |
| `0x04`       | 1    | u8     | Metronome/click volume                  | 0 = off/min (no separate toggle), 0xFF max                                                                                          | `A8`         | **D**                   | u10 byte-exact; `hdr-mclk-*`                                                                                                                   |
| `0x05`       | 1    | —      | Unknown                                 | never varies                                                                                                                        | `00`         | U                       |                                                                                                                                                |
| `0x06`       | 1    | u8     | Active scene (0-based slot)             | The scene count is _not_ stored here                                                                                                | `00`         | **C**                   | `hdr-arr-act*`                                                                                                                                 |
| `0x07`       | 1    | u8     | Active song (0-based)                   | `0x10` = "never selected" sentinel (Song 1)                                                                                         | `10`         | **C**                   | `hdr-arr-song*`, u149/u151                                                                                                                     |
| `0x08`       | 1    | u8     | Scene length mode                       | 0 longest, 1 shortest, 2 time signature                                                                                             | `00`         | **C**                   | `prjconf-g-slen-*`                                                                                                                             |
| `0x09..0x1A` | 18   | —      | Unknown                                 | never varies                                                                                                                        | 0            | U                       |                                                                                                                                                |
| `0x1B`       | 1    | i8     | Project transpose                       | −24..+24 semitones (1.1.21 changelog: "simplified global transpose", re-check)                                                      | `00`         | **C**                   | `prjconf-g-x*`                                                                                                                                 |
| `0x1C`       | 1    | u8     | Time signature                          | `0x10` 3/4, `0x11` 4/4, `0x12` 5/4, `0x13` 6/8, `0x14` 7/8, `0x15` 12/8                                                             | `11`         | **C**                   | `prjconf-t-sig-*`                                                                                                                              |
| `0x1D..0x3C` | 32   | —      | Unknown                                 | never varies (candidate: per-track link/sound-link arrays, H)                                                                       | 0            | U                       |                                                                                                                                                |
| `0x3D..0x4C` | 16   | i8[16] | ★ **Keyboard octave per track T1..T16** | Signed octave offset. Baseline: T3 −1, T4 +1, T6 −1, T10 +4, others 0. Bass presets load at −2                                      | see left     | **C★**                  | T1 equals `patch.json` `octave` in 139/139 `src/presets` pairs; fp01–fp03 (8 bass presets each) all −2; T12 changed in `t12-external-cv` probe |
| `0x4D..0x54` | 8    | u8[8]  | Voice allocation T1..T8                 | 0 auto, 1..8 fixed (24-voice total)                                                                                                 | 0            | **C**                   | `prjconf-v-*`                                                                                                                                  |
| `0x55..0x64` | 16   | u8[16] | MIDI channel T1..T16                    | `0xFF` off, `0..15` = ch 1..16                                                                                                      | `FF…`        | **D**                   | u41 byte-exact                                                                                                                                 |
| `0x65`       | 4    | Q31    | Master EQ low                           | 0 .. 0x7FFFFFFF                                                                                                                     | `0x40000000` | **C★**                  | `src/mixer-probes/2026-06-eq` eq1/eq2                                                                                                          |
| `0x69`       | 4    | Q31    | Master EQ mid                           |                                                                                                                                     | `0x40000000` | **C★**                  | eq3/eq4                                                                                                                                        |
| `0x6D`       | 4    | Q31    | Master EQ high                          |                                                                                                                                     | `0x40000000` | **C★**                  | eq5/eq6                                                                                                                                        |
| `0x71`       | 4    | Q31    | 4th EQ word ("blend"?)                  | The EQ "blend/power" UI did _not_ write here; eq8 set all 3 bands to max                                                            | `0x40000000` | P                       | eq7/eq8                                                                                                                                        |
| `0x75`       | 4    | Q31    | Saturator gain                          |                                                                                                                                     | `0x1999999A` | **C**                   | `2026-06-saturator` sat1/sat2                                                                                                                  |
| `0x79`       | 4    | Q31    | Saturator clip                          |                                                                                                                                     | `0x1999999A` | **C**                   | sat3/sat4                                                                                                                                      |
| `0x7D`       | 4    | Q31    | Saturator tone                          |                                                                                                                                     | `0x40000000` | **C**                   | sat5/sat6                                                                                                                                      |
| `0x81`       | 4    | Q31    | Saturator mix                           |                                                                                                                                     | `0x00000000` | **C**                   | sat8                                                                                                                                           |
| `0x85`       | 4    | Q31    | Master percussion level                 | min is **`0x00A3D70A`**, not 0                                                                                                      | `0x40000000` | **C**                   | `2026-06-static` f10/f11                                                                                                                       |
| `0x89`       | 4    | Q31    | Master melodic level                    | min `0x00A3D70A`                                                                                                                    | `0x40000000` | **C**                   | f12/f13                                                                                                                                        |
| `0x8D`       | 4    | Q31    | Master compressor                       | min `0x00A3D70A`                                                                                                                    | `0x0CCCCCCD` | **C**                   | f14/f15                                                                                                                                        |
| `0x91`       | 4    | Q31    | Master volume                           | min `0x00A3D70A`                                                                                                                    | `0x40000000` | **C**                   | f.., `2026-06-volumes` s5b                                                                                                                     |

> ★ Upstream (`docs/format/decoded_image_map.md`, `xy/master_eq_inspection.py`) describes the EQ as
> "u32 at 0x68 with the level byte at field start, max `0x0000007F`, previous-field spill
> `0xFFFFFF7F`". That is the same bytes read 3 bytes off-alignment. Read at `0x65+4k`, all 12 master
> words are clean Q31 values in every probe (Appendix A.4). The upstream `set_master_eq(low=0)` still
> reproduces u14 because the neighbouring low bytes happen to be zero. Use the aligned model.

**No project name is stored in the image.** The project name is the filename (`docs/logs/2026-06-13_global_header_inspection.md`).

### 3.3 Scene[100] at `0x95` (33 bytes each)

Sources: `docs/format/scenes_songs.md`, `docs/format/record_structure.md` §4, `xy/image_writer.py`
(`SCENE_SLOT0 = 0x95`, `SCENE_SLOT_SIZE = 33`), and `xy/scene_volume_inspection.py`.

```c
struct Scene {                 // slot k at 0x95 + 33*k, k = 0..99
    u8 pattern[16];            // +0x00 0-based pattern index for T1..T16
    u8 mute[16];               // +0x10 0 = unmuted; nonzero = muted (device writes 2)
    u8 flag;                   // +0x20 1 = row present/used; 0 = blank
};
```

- **Scene N lives in slot N−1.** Slot 0 is Scene 1 _and_ the "current selection" row. In a scene-less
  project, creating patterns makes the device write the newly selected pattern index into slot 0 and
  set its flag (u6, u7, j06 show this). **D/C** (P2-E mute probes, `src/scene-probes/2026-06-track-mutes`).
- **Mute is boolean.** Device probe `06_f_mute_enum.xy` wrote 1/2/3 and all displayed as muted. The
  device itself writes 2. **D**.
- **Flag semantics are partial.** 1.1.4 device captures with 8 scenes flag every created scene (mute
  probes), but some older one-off captures with 2–3 scenes (u152–u155) have _no_ flags set. Upstream
  now forces `flag = 1` for every supplied scene (`force_scene_presence=True`). The guide says
  switching to an empty scene duplicates the current one (`knowledge/official/guide/16-arrange.md`).
  **P**; see Q10.
- Upstream's older generator (used for the device-passed Whitney and Tiesto files) put scenes at slot
  k+1 with slot 0 as a separate live row. Those files loaded, but song order was probably off by one.
  The current layout (scene N → slot N−1) matches device-authored files.
- **Scenes store no volumes.** ★ "Scene-stored volume" is really **per-pattern** track volume (§3.6
  word 41). In `s2b-scene2-t1-vol-high.xy` the change landed in _T1's pattern-2 struct_ (the clone that
  scene 2 selects). Upstream's `scene_volume_storage_track(scene, track) = track + scene − 1` is an
  artifact of indexing pattern structs as if they were tracks (Appendix A.6).
- Limits: 99 scenes (guide) with 100 slots in the image. The writer rejects more than 99.

### 3.4 PatternStruct: base, clones, walking

Every track has ≥1 pattern. Each pattern is one full struct holding sequence **and sound state**:
sound is per pattern unless "sound link" is on (`knowledge/official/guide/16-arrange.md`, "sound
link"). The corpus has tracks whose patterns hold different presets (`src/preset-probes/2026-06-app-required/a1-t1-p9.xy`:
T1 P1..P9 = drum/pp … drum/xx).

- **Leader struct.** Starts with a pattern-count byte. Its base size is **17,876 B (`0x45D4`)** with no
  notes and empty lanes.
- **Clone struct** (patterns 2..N). Identical layout **without** the count byte, so 17,875 B base.
  Upstream trick: define a clone's `base = first_byte_offset − 1` so _all_ pattern-relative offsets are
  shared (`pattern_starts_from_image` in `xy/image_writer.py`: `clone_start = pos - 1`). The clone's
  "+0x00" byte is the last byte of the previous struct; never write it.
- **Size of any pattern struct** = `17,876 + 12·noteCount + laneExtra`, where laneExtra = Σ over the 3
  lanes of `(count == 0 ? 0 : 4·count)` (§3.7) ★.
- **Walking.** `pos = trackBase(header)`; for each of 16 tracks: `count = img[pos]`; for p in 1..count:
  `base = (p == 1) ? pos : pos − 1`; `pos = base + size(base)`. After T16, `pos` = footer start.
  Pseudo-code is in Appendix B.

Pattern-relative map (base = leader start, or clone start − 1):

| Offset             | Size  | Type             | Field                                                        | Notes                                                                                                              | Conf                                     |
| ------------------ | ----- | ---------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `+0x0000`          | 1     | u8               | Pattern count (leader only)                                  | 1..16                                                                                                              | **D**                                    |
| `+0x0001`          | 1     | u8               | Pattern length in steps                                      | 1..64. `steps = (bars−1)·16 + finalBarSteps`. 16/32/48/64 = whole bars                                             | **D** (u19, BAR-LEN probes)              |
| `+0x0002`          | 2     | u16              | Default step length (ticks)                                  | 240 default (UI 50), max 480                                                                                       | **C** (`bar-l-*`)                        |
| `+0x0004`          | 2     | —                | Unknown                                                      | never varies                                                                                                       | U                                        |
| `+0x0006`          | 1     | u8               | Track scale                                                  | `0x01` ½×, `0x03` 1×, `0x05` 2×, `0x0E` 16×; others unknown (1.1.25 added x3/x5/x6/x7)                             | **D** for 4 values (u20–u22)             |
| `+0x0007`          | 1     | u8               | Quantization                                                 | UI = `floor(raw·100/255)`; default `0xFF`                                                                          | **C** (`bar-q-*`)                        |
| `+0x0008`          | 1     | i8               | Per-track groove                                             | `3 × index` into the UI sequence, saturated ±0x7F (sequence in `xy/bar_menu_inspection.py`)                        | **C** (`bar-g*`)                         |
| `+0x0009`          | 1     | u8               | Brain route mask (meaningful on T9)                          | bit0=T1..bit7=T8; default `0xFC` on every struct. Per pattern (changelog 1.0.x: "store brain routing per pattern") | **C** (AUX-BRAIN)                        |
| `+0x000A..+0x0010` | 7     | —                | Unknown                                                      | never varies                                                                                                       | U                                        |
| `+0x0011`          | 2     | u16              | "Pristine" field                                             | 8 = never edited; the device writes 0 on an edit (not every one ★, below the table). 1/2 seen too                  | **D** (replications require clearing it) |
| `+0x0013..+0x029F` | 653   | —                | Low preset state (opaque, copied by `set_preset`)            | Contains the fields below                                                                                          | U/P                                      |
| `+0x0014`          | 1     | u8               | Engine id                                                    | table §3.12                                                                                                        | **D**                                    |
| `+0x001C`          | 1     | u8               | LFO type                                                     | 0 tremolo, 1 value, 2 random, 3 element, **6 duck** ★ (u32)                                                        | **C**                                    |
| `+0x0020`          | 1     | u8               | LFO (M4) enabled                                             |                                                                                                                    | **C**                                    |
| `+0x0021`          | 1     | u8               | Filter type                                                  | `0x09` z lowpass, `0x0A` svf, `0x10` ladder, `0x11` z hipass                                                       | **C**                                    |
| `+0x0025`          | 1     | u8               | Filter enabled                                               |                                                                                                                    | **C**                                    |
| `+0x024C`          | 84    | u16[42]          | P-lock current-value row (UI cache)                          | Last value per column; the device clears it on sequence shift                                                      | **C**                                    |
| `+0x02A0`          | 5,376 | u16[64][42]      | P-lock values (§3.9)                                         | Row = step                                                                                                         | **D/C**                                  |
| `+0x17A0..+0x2C4D` | 5,294 | —                | Reserved (always 0 in corpus)                                | `0x24C + 128·84 + 2 = 0x2C4E` hints at room for 128 rows (H)                                                       | U                                        |
| `+0x2C4E`          | 512   | u64[64]          | Per-step p-lock lane mask                                    |                                                                                                                    | **C**                                    |
| `+0x2E4E..+0x304D` | 512   | —                | Reserved (always 0; room for 64 more mask rows)              |                                                                                                                    | U                                        |
| `+0x304E`          | 8     | u64              | ★ **Union of all step lane masks** (upstream: "master flag") |                                                                                                                    | **C★**                                   |
| `+0x3056`          | 1     | u8               | P-lock smoothing/shape                                       | labels unknown                                                                                                     | **C** (`bar-s-*`)                        |
| `+0x3057`          | 1,024 | StepComp[64]     | Step components (§3.8)                                       | 16 B per step                                                                                                      | **D**                                    |
| `+0x3457..+0x3856` | 1,024 | —                | Preset identity (opaque, copied by `set_preset`)             |                                                                                                                    | U                                        |
| `+0x3857`          | 232   | u32[58]          | Sound block, Q31 words (§3.6)                                |                                                                                                                    | **C/P**                                  |
| `+0x393F`          | 3,072 | SampleRegion[24] | ★ Sample/drum regions, 128 B each (§3.5)                     | Ends exactly at `+0x453F`                                                                                          | **C★**                                   |
| `+0x453F`          | 48    | char[48]         | Preset path                                                  | `category/name`, NUL-padded, latin-1. `/` = engine swapped without preset. User presets e.g. `1/nt-106 bass`       | **C** (P1-B)                             |
| `+0x456F`          | 1     | u8               | Note count                                                   | 0..120                                                                                                             | **D**                                    |
| `+0x4570`          | 12·n  | Note[n]          | Note records (§3.7)                                          |                                                                                                                    | **D**                                    |
| after notes        | 3+    | Lane[3]          | ★ Performance lanes PB, MW, AT (§3.7)                        | 1 byte each when empty                                                                                             | **C★**                                   |
| after lanes        | 97    | —                | Fixed tail (engine-specific, e.g. EPiano 22×s16 table)       | Preserve; copied by `set_preset`                                                                                   | U                                        |

★ **Not every edit clears the pristine field** (corpus scan, 2026-09-28). Notes, steps, track scale,
quantisation, groove, note length, components and grid locks all do. Smoothing alone leaves it at 8
(all six `bar-s-*` captures), and so did the hold-recorded locks on the drum tracks T1 and T2 of
u121, where T3–T8 went to 0. Upstream's `set_plock_shape_raw` already leaves it alone. The TS writer
writes the field as the model has it and lets its callers decide (§7.7).

### 3.5 SampleRegion[24] (drum kits, sampler, multisampler) ★

Upstream model (`docs/format/decoded_image_map.md` "Drum sampler table"; `xy/drum_sample_inspection.py`;
`ImageProject.set_drum_voice`): 24 slots × 128 B at `+0x3957`, with header, path, and a numeric tail at
slot `+0x68..+0x7F` (start/loop-start/end/gain). That model needs several ad-hoc rules:

- "fade is stored on the preceding voice";
- "voices 1–23 duplicate sample.end into the previous slot";
- "voice 0's window lives in a pre-table header at `+0x393F`";
- "voice 23's tail overlaps the preset path";
- "`+0x7C` is both this pad's gain and the next pad's fade".

**Corrected model (★, confidence C):** 24 records of 128 B starting at **`+0x393F`**. 24 × 128 = 3,072
= `0x453F − 0x393F`, so the table ends exactly where the preset path begins.

```c
struct SampleRegion {          // region r at pattern + 0x393F + 128*r, r = 0..23
    u32 framecount;            // +0x00 sample length in frames (0 until the device has read the file)
    u32 start;                 // +0x04
    u32 end;                   // +0x08 0xFFFFFFFF = "to end of sample"
    u32 loop_start;            // +0x0C
    u32 loop_end;              // +0x10 0xFFFFFFFF default
    u32 crossfade;             // +0x14 Q31 loop crossfade / drum "fade" (UI n -> n*0x0147AF00, 99 -> 0x7FFFFFFF)
    u8  root;                  // +0x18 0x3C = 60 = neutral. Sampler: pitch = (0x3C-root) + fine/100 semitones
    u8  unk19;                 // +0x19 always 0 so far
    u8  key;                   // +0x1A trigger/hi key. Factory drum kits: 53+r (F3..E5)
    u8  mode;                  // +0x1B drum play mode (0 gate, 1 key/oneshot, 2 group, 3 loop);
                               //       sampler loop bits (0x80 infinite, 0x40 off, 0x00 until release)
    u8  fine;                  // +0x1C sampler fine tune, cents 0..99 (drums: 0)
    i8  gain;                  // +0x1D dB-ish, -30..+20 observed (sampler g8/g9); factory kits trim e.g. -9
    i8  pan;                   // +0x1E -100..+100
    u8  direction;             // +0x1F 0 forward, 1 reverse
    char path[96];             // +0x20 NUL-padded sample path
};
```

Evidence (Appendix A.3):

1. The pan edit (header byte) _and_ the fade edit (window word 5) on the same physical pad (kit `pp`,
   key 53) both land in **record 23** (`src/drum-sample-probes/2026-06-drum-pan-fade/d1…`, `d3…`).
2. In `output/image-probes/cap_drum_params.xy`, every edited header (tune, direction, pan, gain) is
   accompanied by that _same_ record's window being filled in (framecount = end).
3. Factory kits' windows are sane only in this model: framecount == end for resolved samples. In the
   upstream model several baseline voices have `start == end` (silent), which cannot be right.
4. One-shot sampler state (P2-B `g0..g14`) is exactly region 0: window at `+0x393F`, header at
   `+0x3957`, path at `+0x395F`.
5. Upstream's "UI-session residuals" tolerated in the u116 preset test (`+0x3CBF`…) are region 7/9
   `framecount` values the device fills in lazily after reading the WAV.

Sample path families (`docs/format/drum_sample_paths.md`):

- kit-embedded: `/fat32/presets/drum/<kit>.preset/unnamed-<id>.wav`
- user preset: `/fat32/presets/<cat>/<preset>.preset/<file>.wav`
- factory library: `content/samples/<folder>/<name>.wav`, e.g. `content/samples/kick/kick boop a.wav`

Drum voice ↔ note: the region's `key` byte decides which MIDI note triggers it. Factory `boop`/`in phase`
use `key = 53 + r`, so kick = note 53 (F3), matching the keyboard's F3..E5 and CC106 keys 26..49.
User kits can be rotated: in kit `pp`, region 23 holds key 53 and region 0 holds key 54.
`xy/patch_json.py` uses `voice = hikey − 53`. `tools/midi_to_xy.py`'s GM map to **48..71 is 5
semitones off** relative to these key bytes (Q8).

### 3.6 Sound block: 58 Q31 words at `+0x3857 + 4k`

Each M page is 8 words (4 visible knobs + 4 shift/hidden). Values are Q31 (`patch.json` uses Q15,
0..32767; the image stores `q15 << 16`, and the device writes max as `0x7FFFFFFF`). Discrete choices are
stored as knob positions inside `0..0x7FFFFFFF`: read with `floor(raw·N / 2^31)`, write device-captured
values. Sources: `xy/image_writer.py` (`TRK_*` constants), `xy/patch_sound_state.py`,
`docs/format/patch_json_adapter.md`, and decoded_image_map "Exact patch.json preset-load lane map".

| k     | Offset               | Field                                                                                                                                                                                   | patch.json key                 | Conf                                      |
| ----- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------- |
| 0–7   | `+0x3857..+0x3873`   | Engine params 1–8 (M1 visible 1–4, then shift/hidden 5–8). Aux: T11 channel/bank/program, T13 source/drive/–/mix, T14 pitch/speed/length/mix, T9 mode/key/scale/link, T15/T16 FX params | `engine.params[0..7]`          | **D** (u23 param1 = `0x7FFFFFFF`) / **C** |
| 8–11  | `+0x3877..+0x3883`   | Amp envelope A, D, S, R                                                                                                                                                                 | `envelope.amp.*`               | **C**                                     |
| 12    | `+0x3887`            | Play mode: poly `0x15555555`, mono `0x3FFFFFFF` (legato probably `0x6AAAAAAA`, H)                                                                                                       | `engine.playmode`              | **C** (CC28)                              |
| 13    | `+0x388B`            | Portamento amount                                                                                                                                                                       | `engine.portamento.amount`     | **C**                                     |
| 14    | `+0x388F`            | Pitch-bend range                                                                                                                                                                        | `engine.bendrange`             | **C**                                     |
| 15    | `+0x3893`            | Engine (preset) volume                                                                                                                                                                  | `engine.volume`                | **C**                                     |
| 16    | `+0x3897`            | Filter cutoff (aux T13–T16: HPF)                                                                                                                                                        | `fx.params[0]`                 | **C**                                     |
| 17    | `+0x389B`            | Resonance (aux: param 2)                                                                                                                                                                | `fx.params[1]`                 | **C**                                     |
| 18    | `+0x389F`            | Filter env amount (aux: param 3)                                                                                                                                                        | `fx.params[2]`                 | **C**                                     |
| 19    | `+0x38A3`            | Key tracking (aux: LPF)                                                                                                                                                                 | `fx.params[3]`                 | **C**                                     |
| 20    | `+0x38A7`            | Send → T13 ext/aux out                                                                                                                                                                  | `fx.params[4]`                 | **C** (CC36)                              |
| 21    | `+0x38AB`            | Send → T14 tape (inferred by order; baseline `0x7FFFFFFF`; always max after preset loads)                                                                                               | `fx.params[5]`                 | P                                         |
| 22    | `+0x38AF`            | Send → FX I                                                                                                                                                                             | `fx.params[6]`                 | **C** (P2-A)                              |
| 23    | `+0x38B3`            | Send → FX II                                                                                                                                                                            | `fx.params[7]`                 | **C** (P2-A)                              |
| 24–31 | `+0x38B7..+0x38D3`   | LFO params 1–8. Aux: speed, amount, destination, param-dest. CC40/CC41 current values at k=24/25                                                                                        | `lfo.params[0..7]`             | **C/P**                                   |
| 32–35 | `+0x38D7..+0x38E3`   | Filter envelope A, D, S, R                                                                                                                                                              | `envelope.filter.*`            | **C**                                     |
| 36–37 | `+0x38E7`, `+0x38EB` | Unknown                                                                                                                                                                                 |                                | U                                         |
| 38–39 | `+0x38EF`, `+0x38F3` | Unknown. `0x40000000` on T1–T8; aux tracks go `0 → 0x40000000` on first save (upstream "save side effect at +0x38F2/+0x38F6")                                                           |                                | U                                         |
| 40    | `+0x38F7`            | Track pan (center `0x40000000`)                                                                                                                                                         |                                | **C** (P2-A, CC10)                        |
| 41    | `+0x38FB`            | Track volume (default `0x60000000`). **Per pattern** ★. T13: input level                                                                                                                |                                | **C**                                     |
| 42–43 | `+0x38FF`, `+0x3903` | Mod-wheel target / amount                                                                                                                                                               | `engine.modulation.modwheel.*` | P (target enum unknown)                   |
| 44–45 | `+0x3907`, `+0x390B` | Aftertouch target / amount                                                                                                                                                              | `…aftertouch.*`                | P                                         |
| 46–47 | `+0x390F`, `+0x3913` | Pitch-bend target / amount                                                                                                                                                              | `…pitchbend.*`                 | P                                         |
| 48    | `+0x3917`            | Velocity sensitivity                                                                                                                                                                    | `engine.velocity.sensitivity`  | **C** (u82)                               |
| 49    | `+0x391B`            | Portamento type                                                                                                                                                                         | `engine.portamento.type`       | **C**                                     |
| 50    | `+0x391F`            | Tuning scale                                                                                                                                                                            | `engine.tuning.scale`          | **C**                                     |
| 51    | `+0x3923`            | Width                                                                                                                                                                                   | `engine.width`                 | **C**                                     |
| 52    | `+0x3927`            | Unknown (baseline `0x3FFFFFF8`; candidate `engine.transpose`)                                                                                                                           |                                | H                                         |
| 53    | `+0x392B`            | Tuning root                                                                                                                                                                             | `engine.tuning.root`           | **C**                                     |
| 54    | `+0x392F`            | High-pass                                                                                                                                                                               | `engine.highpass`              | **C** (u40)                               |
| 55–56 | `+0x3933`, `+0x3937` | Velocity mod target / amount                                                                                                                                                            | `…velocity.*`                  | P                                         |
| 57    | `+0x393B`            | Unknown                                                                                                                                                                                 |                                | U                                         |

Byte view: the "level byte" upstream sometimes quotes (e.g. volume "byte @ `+0x38FE`") is the MSB of
the word at `+0x38FB`. For UI-ish levels upstream uses `byte<<24`, with 0 → min and `0x7F` →
`0x7FFFFFFF` (`ImageProject._encode_mix_u32_from_byte`).

### 3.7 Notes and performance lanes

**Note record, 12 B** (`docs/format/decoded_image_map.md`; `ImageProject.add_note`):

```c
struct Note {
    i32 tick;      // 480 ticks per step (16th). step s (1-based) = (s-1)*480. Negative = pickup (live take)
    u32 gate;      // ticks. Grid default 240 (half a step); MIDI-recorded 480; long notes e.g. 7680 = 16 steps
    u8  note;      // MIDI note 0..127 (u38 captured 5 and 124 as the keyboard extremes)
    u8  velocity;  // 1..127
    u8  flags[2];  // device writes 0,0 (programmed) or 2,0 (some MIDI-recorded drums, 9 of 2,678 notes);
                   // flags[0]=127 made the device re-trigger (probe 07). Write 0,0.
};
```

- Order: **ascending tick** in 100% of device files (2,678 notes). Within one tick the order is
  arbitrary (u80's F4/G4/A4 chord is stored A, G, F). Upstream `build_arrangement` does **not** sort,
  so sort in the port.
- Micro-timing / nudge is just a non-multiple-of-480 tick (u79, u50). Sequencer resolution is
  1920 PPQN (`docs/reference/opxy_limits.md`).
- The 120-note cap per pattern is enforced by the writer (`test_note_limit_enforced`). It is a
  documented hardware limit, but no 120-note device test is recorded.

**Performance lanes ★** (pitch bend, mod wheel, aftertouch). These immediately follow the note records,
in the order PB, MW, AT:

```text
lane := count:u8                                   # 0 = empty lane (1 byte)
        [ w0:u16  w1:u16  ( t:u16  v:u16 ){count-1} ]   # present iff count > 0
```

- Size of a non-empty lane = `1 + 4·count`.
- Evidence: 913/915 files walk with this rule and the footer then ends exactly at EOF. The two failures
  are legacy tool outputs.
  - The six live-recorded device files that break the upstream scanner (u39, u106–u109, u120) parse
    perfectly.
  - Lane counts: u108 PB sweep `[16,0,0]`, u107 AT sweep `[0,0,16]`, u109 all three `[16,16,16]`,
    u39 hand-played PB `[45,0,0]`, u106 `[0,1,0]`.
- u108 (linear PB ramp, centre → max over 16 steps) decodes as w0 = 0, w1 = 8191, then
  `(t, v) = (480k, 546k)`: exact 480-tick keyframes.
- `w0` / `w1` semantics are partial. Upstream calls them "v0 / vmax" (vmax 8191 PB, 254 MW/AT;
  `docs/format/record_structure.md` §0). In u39, w1 equals the last keyframe's value, so "vmax" may be
  wrong (Q26).
- Authoring: write empty lanes (three `00` bytes). They already exist in the baseline tail. Reading
  user projects **must** parse lanes to find the next struct.

### 3.8 Step components (16 B per step, 64 steps at `+0x3057`)

Source: `docs/format/decoded_image_map.md` ("Step-component slot — FULLY DECODED"),
`ImageProject.set_step_component`, and captures u8/u9/u59–u77/u118/u119. Value semantics ★ come from
the official guide's reference table (`knowledge/official/guide/08-step-components.md` §8.4), where
every column is an accidental key labelled 1..9, 0.

```c
struct StepComp {              // step s at pattern + 0x3057 + 16*(s-1)
    u16 enabled;               // bit b set = component b active on this step
    u8  value[14];             // value[b] = accidental index 1..9 or 0 (the 10th variation)
};
```

| Bit | Component (guide name) | value 1 … 9, 0 (guide §8.4)                                                                                          | Default when enabled (u63/u119) | Capture checks          |
| --- | ---------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------- |
| 0   | pulse                  | repeat step 1..9 times; 0 = random                                                                                   | 4                               | u8 (1), u9 (0) **D**    |
| 1   | pulse hold             | hold step 1..9 times; 0 = random                                                                                     | 4                               | u61 (1)                 |
| 2   | multiply               | divide into 1..8 trigs, 9 = "3" (guide typo?), 0 = random                                                            | 2                               | u66 (4 = ÷4)            |
| 3   | velocity               | force to 4, 8, 16, 32, 64, 100, 112, 127, 0; 0 = random                                                              | 5                               | u67 (0 = random)        |
| 4   | ramp up                | 1–5: 2..6 steps / 1 oct; 6–9, 0: 2..6 steps / 3 oct                                                                  | 4                               | u68 (8 = 4 steps 3 oct) |
| 5   | ramp down              | same layout as ramp up                                                                                               | 4                               | u69 (2 = 3 steps 1 oct) |
| 6   | random                 | same layout as ramp up                                                                                               | 4                               | u70 (3 = 4 steps 1 oct) |
| 7   | portamento             | 10%..90%; 0 = random                                                                                                 | 4                               | u71 (7 = 70%)           |
| 8   | bend                   | down-up, up-down, bump down, bump up, spring out, spring in, fade down, fade up, random 1, random 2                  | 1                               | u72 (1)                 |
| 9   | tonality               | ignore chord prog., transpose only, octave up, fifth up, third up, chromatic up, chromatic down, quantize 33/66/100% | 4                               | u73 (4 = fifth up)      |
| 10  | jump                   | to step 1, 5, 9, 13, +1, −1, ±1, stay, align, random                                                                 | 4                               | u74 (4 = step 13)       |
| 11  | skip parameter lock    | play every 1st..9th p-lock; 0 = random                                                                               | 2                               | u75                     |
| 12  | skip step component    | play every 1st..9th component; 0 = random                                                                            | 2                               | u76 (2)                 |
| 13  | skip trigger           | play every 1st..9th trig; 0 = random                                                                                 | 2                               | u62 (4), u77 (9)        |

`ff 3f` in the mask = all 14 enabled (u63). Upstream calls bits 12/13 `conditional_a`/`conditional_b`;
use the guide names. `set_step_component` ORs the bit, writes `value[bit]`, and clears the pristine
field. Byte-exact against u8 and u59. **D**

### 3.9 P-locks and automation

Sources: `ImageProject.set_plock`, `automate_param`, `rotate_pattern`, `tests/test_image_writer.py`,
`docs/format/decoded_image_map.md` ("P-lock … table"), `docs/state_of_understanding.md` 2026-08-29
entry, and `docs/logs/2026-08-26_plock_rotation_carry_curve.md`.

```text
value cell   pattern + 0x2A0 + 84*(step-1) + 2*col          u16, 0..32767 (Q15); cc→ round(cc/127*32767)
lane mask    pattern + 0x2C4E + 8*(step-1)                   u64: col 1..41 -> bit col-1 ; col 0 -> bit 41
union mask   pattern + 0x304E                                u64 = OR of all 64 step masks   ★
current row  pattern + 0x24C + 2*col                         u16 last value (UI cache)
```

- **A value cell alone is inert.** The device reads the step's lane-mask bit, and an armed zero is a
  real lock distinct from an empty zero cell (2026-08-29 entry). **C**
- **Union mask ★.** In all 41 device structs with p-locks, bytes `+0x304E..+0x3055` equal the OR of the
  64 step masks: u35 param1 → `01`, u115 cutoff → `0x3050 = 01`, u125 → `05 00 01`, and so on.
  Upstream writes `img[+0x304E] = 0x01` for _every_ lane. That is correct only for Param 1 (bit 0).
  For a cutoff lock the device would have `+0x3050 = 01` and `+0x304E = 00`. **Port: recompute the
  union from the masks.** Device impact of the upstream mismatch is unknown (Q6).
- **Carry rule** (firmware 1.1.25, device-verified by front-panel checks, **D**). A lock at step s > 1
  also writes `value − 1` into the _unarmed, zero_ cell of step s−1 (native capture: step 7 `0x7000`
  gave step 6 `0x6FFF`). Step 1 has no wrap-around carry. Every new lock also writes the current-value
  row.
- **Rotation** (1.1.21 changelog: "rotate components and parameter locks along with triggers";
  `rotate_pattern`):
  - notes in `0 ≤ tick < steps·480` rotate modulo the pattern length;
  - masks and step-component rows rotate as rows;
  - non-zero value cells are _copied_ to their destination without clearing the source;
  - armed zeros overwrite;
  - the current row is cleared for armed columns.
- **Column map (42 columns).** Upstream names are in `ImageProject.PLOCK_PARAMS`. The CC evidence is
  from hold-record captures u121–u126, and the machine-readable table is at
  `knowledge/midi/xy-format-cc-map.json` → `plock_columns`.

| Col  | Param             | CC    |     | Col   | Param                             | CC    |
| ---- | ----------------- | ----- | --- | ----- | --------------------------------- | ----- |
| 0    | volume            | 7     |     | 17    | cutoff                            | 32    |
| 1–4  | param 1–4         | 12–15 |     | 18    | resonance                         | 33    |
| 5–8  | _(unmapped)_      | –     |     | 19    | filter env amount                 | 34    |
| 9–12 | amp A/D/S/R       | 20–23 |     | 20    | key tracking                      | 35    |
| 13   | poly/mono/legato  | 28    |     | 21–24 | send ext/tape/FX I/FX II          | 36–39 |
| 14   | portamento        | 29    |     | 25    | LFO (CC40) ★ upstream `lfo_param` | 40    |
| 15   | pitch-bend amount | 30    |     | 26    | LFO (CC41) ★ upstream `lfo_dest`  | 41    |
| 16   | engine volume     | 31    |     | 27–32 | _(unmapped)_                      | –     |
|      |                   |       |     | 33–36 | filter env A/D/S/R                | 24–27 |
|      |                   |       |     | 37–40 | _(unmapped)_                      | –     |
|      |                   |       |     | 41    | pan                               | 10    |

CC9 (mute) is never recorded as a p-lock. The OS 1.1.33 changelog says "fix: unable to add parameter
locks to empty steps", so locks on note-less steps are legitimate device state.

### 3.10 Song footer: SongSlot[14] to EOF

Sources: `ImageProject.get_song_chain` / `set_song_chain`, `docs/format/scenes_songs.md`,
`xy/song_footer_inspection.py`, and u149–u155.

```text
SongSlot := count:u8  sceneId:u8[count] (0-based)  loop:u8 (0 = loop ON, 1 = off)  reserved:u8 (0)
default slot (fresh project) = 01 00 00 00     (song = [scene 1], loop on)   → 14 × 4 = 56 B
```

- The footer is exactly 14 slots and ends at EOF in all 913 walkable files. Upstream's open item about
  an "extra trailing byte on expanded slots" disappears with correct lane-aware walking ★.
- Loop on/off is device-verified A/B (u150 nl/lp, `docs/format/record_structure.md` §5). Those two
  files are referenced but _not present_ in the repo.
- Limits: 14 songs per project (guide §16.4; the workflow chapter's "9 songs" is stale), ≤ 96 scenes
  per song.
- Upstream `build_arrangement` writes Song 1 by assuming the footer is the default 56 bytes
  (`len(image) − 56`). The TS port should parse slots and replace one slot (like `set_song_chain`).

### 3.11 Auxiliary tracks T9–T16

Aux type is fixed by slot; there is no type byte. T9 Brain, T10 Punch-in FX, T11 External MIDI,
T12 External CV, T13 External Audio, T14 Tape, T15 FX I, T16 FX II. They use the same pattern struct,
note vector, p-locks and step components (`docs/parse_capability_checklist.md` §12).

| Track               | Known fields                                                                                                                                                                                                                                     | Conf                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| T9 Brain            | route mask `+0x09`. Sound words k0..3 = mode, key (12 buckets), scale (7 buckets: major, dorian, phrygian, lydian, mixolydian, minor, locrian), link. Notes = transpose events                                                                   | **C** mask; **P** buckets (`xy/brain_inspection.py`) |
| T10 Punch-in FX     | Punch triggers are ordinary notes (low octave = percussion group, high = melodic)                                                                                                                                                                | **C** vector; key → effect map unknown               |
| T11 External MIDI   | k0/k1/k2 channel (16 buckets), bank and program (129 buckets, 0 = off). CC table words at `+0x3877..+0x3896`. LFO destinations off/cc1/cc2 = `0`, `0x3AAAAAA7`, `0x7AAAAAA3`                                                                     | **P**                                                |
| T12 External CV     | Notes = CV pitch (octave via global octave array ★)                                                                                                                                                                                              | **C**                                                |
| T13 External Audio  | k0 source: mic `0`, headset `0x1FFFFFFE`, line `0x46666662`, usb-c `0x5FFFFFFA`, main `0x79999992`. k1 drive, k3 mix, k41 input level. Other tracks' k20 = send to it                                                                            | **C** detents                                        |
| T14 Tape            | k0..3 pitch, speed, length, mix. Other tracks' k21 = send to it                                                                                                                                                                                  | **P**                                                |
| T15 / T16 FX I / II | Engine byte `+0x14`: delay `0x00` (T15 default), reverb `0x05` (T16 default), chorus `0x0C`, phaser `0x0D`, distortion `0x0E`, lofi `0x0F`. k0..3 FX params (delay anchors only). Other tracks' k22/k23 = sends                                  | **C** type; **P** params                             |
| All aux             | Filter words k16 (HPF) / k19 (LPF). LFO words k24–27 (speed, amount, destination, param-dest). Generic LFO destination syn/filter/amp = `0`, `0x4AAAAAA9`, `0x75555553`. Param-dest 1–4 = `0x07FFFFFF`, `0x27FFFFFD`, `0x47FFFFFB`, `0x77FFFFF8` | **C** (AUX-FILTER, AUX-LFO)                          |

Aux T9–T14 carry engine byte `0x12` in the baseline, which is meaningless for them. Bucket boundaries
for PC-authored values are unverified: write device-captured detent values only
(`xy/image_writer.py` `set_aux_*`).

### 3.12 Enumerations

| Enum                               | Values                                                                                                                                                                                                                    | Source                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Engine id (`+0x14`)                | `0x02` sampler, `0x03` drum, `0x06` organ, `0x07` epiano, `0x12` prism, `0x13` hardsync, `0x14` dissolve, `0x16` axis, `0x1D` external MIDI, `0x1E` multisampler, `0x1F` wavetable, `0x20` simple                         | `tools/inspect_xy.py` `ENGINE_NAMES`, `xy/patch_json.py` `ENGINE_IDS`; verified against the 156 factory donors (Appendix D) |
| Default engines (blank project)    | T1 drum/boop, T2 drum/in phase, T3 prism bass/shoulder, T4 epiano pluck/beach bum, T5 dissolve lead/gaussian, T6 hardsync pluck/dielectric, T7 axis strings/draemy, T8 multisampler pad/bandpasser, T15 delay, T16 reverb | baseline decode                                                                                                             |
| FX type (T15/T16 `+0x14`)          | delay 0x00, reverb 0x05, chorus 0x0C, phaser 0x0D, distortion 0x0E, lofi 0x0F                                                                                                                                             | `docs/logs/2026-06-15_t15_fx_i_probe.md`                                                                                    |
| Filter type (`+0x21`)              | z lowpass 0x09, svf 0x0A, ladder 0x10, z hipass 0x11                                                                                                                                                                      | `xy/patch_json.py` `FX_TYPE_BYTES`                                                                                          |
| LFO type (`+0x1C`)                 | tremolo 0, value 1, random 2, element 3, duck 6 ★                                                                                                                                                                         | `xy/patch_json.py` `LFO_TYPE_BYTES`; u32                                                                                    |
| Drum play mode (region `+0x1B`)    | gate 0, key/oneshot 1, group 2, loop 3                                                                                                                                                                                    | patch.json experiment                                                                                                       |
| Sampler loop type (region `+0x1B`) | 0x80 infinite, 0x40 off, 0x00 until release                                                                                                                                                                               | P2-B g12–g14                                                                                                                |

### 3.13 Numeric encodings cheat-sheet

| Quantity                               | Storage         | Conversion                                                                                                                                          |
| -------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tempo                                  | u16 tenths      | `round(bpm·10)`                                                                                                                                     |
| Continuous knobs (sound words, master) | Q31 u32         | `patch.json` q15 → `q15 << 16`; max `0x7FFFFFFF`                                                                                                    |
| UI 0–99 display of a knob (H)          | Q15 of the word | u23 "15" = `0x147A`, "22" = `0x1C29` both fit `floor(q15·100/32768)`                                                                                |
| Mix byte shortcut                      | MSB of Q31      | 0 → min (0 or `0x00A3D70A` for master), `0x7F` → `0x7FFFFFFF`, else `b<<24`                                                                         |
| P-lock                                 | u16 Q15         | `round(cc/127·32767)`                                                                                                                               |
| Ticks                                  | 480 per step    | gate and tick in ticks                                                                                                                              |
| Drum tune                              | root byte       | upstream writes `0x3C + semitones` (±48). Direction vs the sampler's `(0x3C−root)` formula is unresolved (Q9)                                       |
| Drum fade / sampler crossfade          | Q31             | UI n → `n·0x0147AF00`, 99 → `0x7FFFFFFF`. Sampler preset load: `float32(frames·2^31/framecount)` truncated (`encode_sampler_loop_crossfade_frames`) |
| Quantization                           | u8              | UI = `floor(raw·100/255)`; encode `ceil(ui·255/100)`                                                                                                |

---

## 4. Authoring model

### 4.1 Pipeline

```text
MIDI ──tools/midi_to_xy.py──▶ spec JSON ──tools/spec_to_xy_image.py──▶ build_arrangement(baseline, …)
                                                     │                          │
                                         ImageProject edits (tempo, p-locks, presets, mixer…)
                                                     ▼
                                       rle.encode_project(header, image) ──▶ .xy
```

Sources: `docs/engineering/authoring.md`, `docs/tools/spec_to_xy_image.md`, `tools/spec_to_xy_image.py`
(82 lines), and `tools/midi_to_xy.py` (1,240 lines).

### 4.2 The spec JSON (upstream contract, v1)

Documented shape (`docs/tools/spec_to_xy_image.md`):

```json
{
	"version": 1,
	"template": "src/one-off-changes-from-default/unnamed 1.xy",
	"output": "output/from-midi/song.xy",
	"tracks": [
		{
			"track": 1,
			"patterns": [[{ "step": 1, "note": 60, "velocity": 100, "gate_ticks": 480 }], null]
		}
	]
}
```

- Per note: `step` (1-based), `note`, optional `velocity` (default 100), `gate_ticks` (default 240) and
  `tick_offset` (micro-timing). `null` means an empty pattern.
- `spec_to_xy_image` drops notes with velocity < 2 ("ghost placeholders" from the legacy front end),
  drops tracks with no notes unless `--keep-empty-tracks`, then:
  - creates scene k selecting pattern `min(k, len−1)` on every content track;
  - chains Song 1 = scenes 0..n−1 with loop on.
- Patterns may also be `{"notes": [...], "steps": N}` or `{"notes": [...], "bars": N}` when calling
  `build_arrangement` directly.
- The _target_ user-facing contract is much richer: `docs/engineering/json_project_spec_complete.md`
  covers transport, master, settings, per-track sound/mix, patterns with step components and p-locks,
  scenes with mix snapshots, songs, and assets. It is **a draft; nothing compiles it yet**.

The demo spec I compiled (3 tracks × 2 patterns):

```json
{
	"version": 1,
	"template": "src/one-off-changes-from-default/unnamed 1.xy",
	"output": "demo.xy",
	"tracks": [
		{
			"track": 1,
			"patterns": [
				[
					{ "step": 1, "note": 53, "velocity": 110 },
					{ "step": 5, "note": 55, "velocity": 100 },
					{ "step": 9, "note": 53, "velocity": 110 },
					{ "step": 13, "note": 55, "velocity": 100 }
				],
				[
					{ "step": 1, "note": 53, "velocity": 120 },
					{ "step": 3, "note": 61, "velocity": 70 },
					{ "step": 5, "note": 55, "velocity": 100 },
					{ "step": 7, "note": 61, "velocity": 70 },
					{ "step": 9, "note": 53, "velocity": 120 },
					{ "step": 11, "note": 61, "velocity": 70 },
					{ "step": 13, "note": 55, "velocity": 100 },
					{ "step": 15, "note": 61, "velocity": 70 }
				]
			]
		},
		{
			"track": 3,
			"patterns": [
				[
					{ "step": 1, "note": 36, "velocity": 100, "gate_ticks": 960 },
					{ "step": 9, "note": 43, "velocity": 90, "gate_ticks": 960 }
				],
				[
					{ "step": 1, "note": 41, "velocity": 100, "gate_ticks": 1920 },
					{ "step": 9, "note": 43, "velocity": 100, "gate_ticks": 1920 }
				]
			]
		},
		{
			"track": 7,
			"patterns": [
				[
					{ "step": 1, "note": 60, "velocity": 60, "gate_ticks": 7680 },
					{ "step": 1, "note": 64, "velocity": 60, "gate_ticks": 7680 },
					{ "step": 1, "note": 67, "velocity": 60, "gate_ticks": 7680 }
				],
				null
			]
		}
	]
}
```

Result: `spec_to_xy_image.py` wrote 12,472 B (19 notes, 2 scenes, song chain) with SHA-256 `e66a80ad…`.
My TS prototype produces **byte-identical** output from the same spec (§7.6).

I then added edits through `ImageProject`:

- tempo 128;
- groove disfunk +20;
- two cutoff p-locks on T3 P1;
- pulse and skip-component on T1 P2;
- T3 volume;
- 3 explicit scenes with mutes;
- Song 1 `[0,1,0,2]`;
- Song 2 `[2,1]` loop off.

That gives 12,526 B, which re-decodes and inspects cleanly (`tools/inspect_xy.py`). It has **not** been
loaded on hardware (the agent must not touch the device). Suggested first device test: §8 Q2/Q6.

### 4.3 Template/donor approach and unknown-byte preservation

- **Baseline template.** `src/one-off-changes-from-default/unnamed 1.xy` (9,499 B, firmware 1.1.4,
  header `… 09 13 03 86`) is a blank device-saved project with 16 single-pattern, zero-note tracks and
  factory default presets. Everything the writer doesn't touch is preserved verbatim. That includes
  ~10 KB per track of opaque preset state, which is the whole point: **never synthesize opaque bytes**.
- **`build_arrangement(base, track_patterns, scenes, scene_mutes, song_chain, song_loop)`**
  (`xy/image_writer.py` lines 1689–1782). It requires a pristine baseline (no notes, one pattern per
  track):
  1. Copy global bytes `[0, T1base)`.
  2. If no scenes are given, write each multi-pattern track's last pattern index into slot 0 and set
     its flag. Otherwise set `0x06 = len(scenes)−1` and, for scene k, slot `0x95+33k`: selections,
     mute = 2, flag = 1.
  3. For each track, take its baseline 17,876-byte struct as a template. Each pattern becomes a copy
     with steps set, pristine cleared, and notes spliced at `+0x4570` with the count at `+0x456F`. When
     `steps` isn't given, it is inferred as a multiple of 16 covering the max step. Leader = first copy
     with `[0] = count`; clones = remaining copies minus byte 0.
  4. T16 gets the original tail (footer) appended.
  5. Song 1 replaces the first 4 footer bytes.
  6. Encode.

  Consequence: **each clone inherits the leader's sound state** (the template track's preset). Changing
  a pattern's preset means editing that pattern struct.

- **Presets by donor copy** (`ImageProject.set_preset`). Validated against u116 byte-exact except for a
  handful of residual bytes, mostly region framecounts the device fills lazily. It copies
  pattern-relative ranges `[0x13, 0x2A0) ∪ [0x3457, 0x456F) ∪ [0x4570, 17876)` from a pristine donor
  track. Constraints:
  - donor pattern count 1 and 0 notes (enforced);
  - **target must also have 0 notes and empty lanes** (not enforced upstream; call it before adding
    notes, Appendix A.9);
  - it does **not** copy the global per-track octave byte ★. To reproduce "load preset X" faithfully,
    also copy donor `octave[t]`.

  The 1.1.21 factory captures give donors for **all 156 factory presets** (Appendix D).

- **Direct field writes** (preferred where decoded): tempo, groove, notes, steps, scale, quantize,
  groove override, step components, p-locks, engine params, envelopes, filter, sends, mixer, drum
  regions, sampler window, master EQ/sat/levels, MIDI channels, voices, transpose, time signature,
  active scene/song.
- **Edited-flag rule.** Clear the pattern's `+0x11..+0x12` whenever you edit anything inside that
  pattern struct. Byte-exact replications (u2, u8, u19, u23) show the device does this. Global edits
  don't touch it.

### 4.4 Constraints and limits

| Limit              | Value                                      | Enforced by upstream writer?                                  | Device evidence                                                |
| ------------------ | ------------------------------------------ | ------------------------------------------------------------- | -------------------------------------------------------------- |
| Notes per pattern  | 120                                        | ✅ `add_note`, `_pattern_struct`                              | Max seen in a device-passed file: 109 (Tiesto). No 120 test    |
| Steps per pattern  | 1–64 (4 bars × 16)                         | ✅                                                            | BAR-LEN probes                                                 |
| Patterns per track | **16** (1.1.15+; 9 before)                 | ✅ `MAX_PATTERNS_PER_TRACK = 16`                              | Corpus max **9** (j01/j06/j07, Whitney). 16 is unverified (Q2) |
| Scenes             | 99 (100 slots)                             | ✅ ≤ 99                                                       | Mute probes use 8; Whitney uses 9                              |
| Songs              | 14 slots                                   | ✅ `SONG_SLOT_COUNT`                                          | u151 selects song 3                                            |
| Scenes per song    | 96                                         | ✅ `SONG_MAX_CHAIN`                                           | Aurora (untested) uses 14                                      |
| Voices             | 8 per track, 24 total                      | ✅ voice allocation 0..8                                      | `prjconf-v-*`                                                  |
| Tracks             | 16 (8 instrument + 8 aux)                  | structural                                                    |                                                                |
| Scene selection    | < that track's pattern count               | ⚠️ spec compiler clamps; `build_arrangement` only checks < 16 |                                                                |
| Tick               | signed i32; normally 0 ≤ tick < steps·480  | ❌                                                            | Pickups are negative (live takes)                              |
| Velocity           | 1..127 (masked `& 0x7F`)                   | ⚠️ no range check                                             |                                                                |
| Drum voice         | 0..23                                      | ✅                                                            |                                                                |
| Preset path        | < 48 bytes latin-1                         | ✅                                                            |                                                                |
| Sample path        | < 72 bytes upstream (the record has 96, ★) | ✅                                                            |                                                                |

**Does the repo handle 16 patterns?** Structurally yes: the leader count byte is a u8, the walker
accepts 1..16, scene bytes are u8, and midi_to_xy can emit up to 16 four-bar patterns (`--patterns 16`).
There is a dedicated MIDI harness for capturing a 16 × 8 device project (`tools/capture_16pat.py`), but
**no such capture is in the repo** and no authored 10–16-pattern file has a recorded device outcome.
`docs/reference/opxy_limits.md` records "16, increased from 9 in 1.1.15 (2026-07-01)". The README's
"what still needs work" lists "full 16-pattern topology" certification.

### 4.5 The MIDI → spec front end (for reference; port selectively)

`tools/midi_to_xy.py` (uses `mido`):

- Extracts (track, channel) note lanes and scores them for four roles: drum, bass, lead, chord.
- Dedupes near-duplicate lanes (Jaccard ≥ 0.92) and assigns fixed roles: T1/T2 drums, T3 bass,
  T4–T6 leads, T7/T8 chords.
- Assumes 4/4 and cuts 4-bar windows as patterns, auto-detecting up to 16 patterns.
- Quantizes to 16ths and gates to ≥1 step.
- Maps GM drums with a table targeting **48–71**, which is 5 semitones off vs the factory kits' key
  bytes 53–76 (§3.5, Q8).
- Inserts a velocity-1 "placeholder" note at step 1 when the pattern doesn't start there (legacy crash
  avoidance, dropped later by `spec_to_xy_image`).
- Takes tempo from the first `set_tempo`.

For our app the LLM produces musical intent directly, so only the tick/gate conversion
(`xy_tick = midi_tick·1920/tpb`) and the role heuristics are worth porting.

---

## 5. The MIDI CC map document

`docs/reference/opxy_midi_cc_map.md` (72 lines) reproduces the per-track-type CC chart:

- **Instrument tracks.** Two columns: synth engines and sample/multisample. CC 7 volume, 9 mute,
  10 pan, 12–15 params 1–4, 20–27 amp/filter ADSR, 28–31 play mode/portamento/PB amount/engine
  volume, 32–35 cutoff/resonance/env/key-track, 36–39 sends, 40–41 LFO.
- **Aux tracks.** One column per T9–T16. For example: T11 CC12–14 channel/bank/program and CC32–39
  outbound CC value/number; T13 input/drive/mix/HP/LP/sends; T14 speed/tape speed/key scale/mix;
  T15/T16 params 1–4, HP/LP. CC40/41 = LFO everywhere.
- Performance controllers (PB, AT, MW/CC1) are not in the chart. In `.xy` files they become the
  keyframe lanes of §3.7.

The doc's source line ("firmware 09 13 03 86") is the `.xy` header of 1.1.4-era files, not a firmware
version. Another research doc owns MIDI in depth.

**Machine-readable copy:** `knowledge/midi/xy-format-cc-map.json`. It contains:

- the full instrument and aux tables;
- the **CC → p-lock column cross-reference** (42 columns with mask bits and capture evidence);
- the value scaling;
- the global CCs mentioned in the save audit (80–86, 90);
- the experimental CC106/107 remote-keypress map from `tools/analysis/cc106_keys.py`: keys 0–25
  (modes/tracks/M1–M4/player/sample/com/bar), 26–49 keyboard F3..E5, 50–55 transport/shift, 56–71
  steps.

Each block carries source attribution.

---

## 6. Test corpus inventory (golden fixtures)

Totals: **915 `.xy` files, 9.66 MB**. 891 have header `09 13 03 86` (1.1.4 era) and 24 have
`09 13 06 86` (1.1.21). The 11 files under `output/image-probes/` plus 11 under `output/` are
_generated_; everything under `src/` is device-saved. Referenced-but-missing files include
`unnamed 150 nl/lp`, `151 nl/lp`, `154 loop/nl`, `150b`, `152b`, `154b`, `155b`, `unnamed 42–49`, the
1.1.25 rotation captures, `plock_drum_t2.xy` and `bleez*.xy`
(`tests/test_inspector_outputs.py` skips).

### 6.1 Directory inventory

| Path                                                                                                                                                             | #                            | Firmware                           | What it demonstrates                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Tests using it                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/one-off-changes-from-default/`                                                                                                                              | 182                          | 1.1.4-era (header 03)              | **The original one-knob corpus.** Change log: `op-xy_project_change_log.md` (207 lines). Baseline `unnamed 1`; tempo (4, 5); click (10); groove (11, 12); EQ (14–16); bars (17–19); scale (20–22); notes/chords/gates (2, 3, 50–57, 78–81, 92); step components (8, 9, 59–77, 118, 119); engine swaps (34, 85, 91, 94); M-page edits (23–33); mod routing (82–84); MIDI harness and hold-record CC→p-lock (93–100, 120–126); performance lanes (39, 106–109); multi-pattern topologies (6, 7, 102–105b, 114–147 as p01–p10, r01–r10, s01–s09, 02–08, j01–j07, m05/m06/m09, n110); songs/scenes (13, 149–155) | `test_rle.py`, `test_image_writer.py`, `test_container_roundtrip.py`, `test_scene_authoring.py`, `test_song_footer_inspection.py` |
| `src/project-config-probes/2026-06-project-config/`                                                                                                              | 53                           | 1.1.4                              | Groove types, scene length, transpose, time signature, voices, MIDI channels (PCFG)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `test_project_config_inspection.py`                                                                                               |
| `src/project-config-probes/2026-06-global-header/`                                                                                                               | 24                           | 1.1.4                              | Groove amount, click, active scene/song, project name search (HDR)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | same                                                                                                                              |
| `src/bar-menu-probes/2026-06-bar-menu/`                                                                                                                          | 62                           | 1.1.4                              | Default step length, quantize, per-track groove, p-lock shape                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `test_bar_menu_inspection.py`                                                                                                     |
| `src/bar-menu-probes/2026-06-bar-length/`                                                                                                                        | 17                           | 1.1.4                              | Final-bar partial lengths                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | same                                                                                                                              |
| `src/mixer-probes/2026-06-static/`                                                                                                                               | 25                           | 1.1.4                              | Track vol/pan/FX sends, master perc/melody/comp/vol (P2-A)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `test_mixer_static_inspection.py`                                                                                                 |
| `src/mixer-probes/2026-06-eq/`                                                                                                                                   | 9                            | 1.1.4                              | EQ min/max per band, blend/power (P2-F)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `test_master_eq_inspection.py`                                                                                                    |
| `src/mixer-probes/2026-06-saturator/`                                                                                                                            | 9                            | 1.1.4                              | Saturator min/max (P2-G)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `test_master_saturator_inspection.py`                                                                                             |
| `src/scene-probes/2026-06-track-mutes/`                                                                                                                          | 13                           | 1.1.4                              | Scene mutes, scenes 1–8, slot N−1 (P2-E)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `test_scene_track_mute_inspection.py`                                                                                             |
| `src/scene-probes/2026-06-volumes/`                                                                                                                              | 8                            | 1.1.4                              | "Scene volumes" (per-pattern volume ★) (P2-D)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `test_scene_volume_inspection.py`                                                                                                 |
| `src/preset-probes/2026-06-app-required/`                                                                                                                        | 36                           | 1.1.4                              | T1–T4 × P1–P9, a different drum preset per pattern                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `test_project_inspection.py`                                                                                                      |
| `src/preset-probes/2026-06-phase-b/`                                                                                                                             | 40                           | 1.1.4                              | Engine sweep on T1 × bars                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | same                                                                                                                              |
| `src/preset-probes/2026-06-preset-path/`                                                                                                                         | 6                            | 1.1.4                              | Preset path field `+0x453F` (P1-B)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `test_preset_path_structural.py`                                                                                                  |
| `src/drum-sample-probes/2026-06-sample-paths/`                                                                                                                   | 4                            | 1.1.4                              | Factory-library sample path swaps (family C)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `test_drum_sample_inspection.py`                                                                                                  |
| `src/drum-sample-probes/archive-round0-nt-z-fx/`                                                                                                                 | 4                            | 1.1.4                              | User-preset sample path swaps (family B)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `test_drum_sample_inspection_round0.py`                                                                                           |
| `src/drum-sample-probes/2026-06-drum-pan-fade/`                                                                                                                  | 24                           | 1.1.4                              | Pad pan ±100, fade sweep (★ record-model proof)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `test_drum_pan_fade_inspection.py`                                                                                                |
| `src/sampler-probes/2026-06-oneshot/`                                                                                                                            | 25                           | 1.1.4                              | One-shot sampler window, tune, gain, dir, loop type (P2-B)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `test_sampler_sample_inspection.py`                                                                                               |
| `src/sampler-project-state/2026-06-15/`                                                                                                                          | 7                            | 1.1.4                              | Tonal sampler preset/project interplay, unique-value preset map                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `test_sampler_project_state.py`, `test_patch_json.py`                                                                             |
| `src/aux-track-probes/2026-06-t09-brain/`                                                                                                                        | 41                           | 1.1.4                              | Brain mode/key/scale/link/route mask                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `test_t9_brain_inspection.py`                                                                                                     |
| `src/aux-track-probes/2026-06-t10-punch-in-fx/`                                                                                                                  | 3                            | 1.1.4                              | Punch triggers as notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `test_t10_punch_in_fx_inspection.py`                                                                                              |
| `src/aux-track-probes/2026-06-t11-external-midi/`                                                                                                                | 18                           | 1.1.4                              | Channel/bank/program, CC table                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `test_t11_external_midi_inspection.py`, `test_aux_writer.py`                                                                      |
| `src/aux-track-probes/2026-06-t12-external-cv/`                                                                                                                  | 3                            | 1.1.4                              | CV notes, octave                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `test_t12_external_cv_inspection.py`                                                                                              |
| `src/aux-track-probes/2026-06-t13-external-audio/`                                                                                                               | 22                           | 1.1.4                              | Source, drive, level, mix, sends                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `test_t13_external_audio_inspection.py`                                                                                           |
| `src/aux-track-probes/2026-06-t14-tape/`                                                                                                                         | 11                           | 1.1.4                              | Pitch, speed, length, mix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `test_t14_tape_inspection.py`                                                                                                     |
| `src/aux-track-probes/2026-06-t15-fx-i/`, `…t16-fx-ii/`                                                                                                          | 13 + 13                      | 1.1.4                              | FX type enum, delay params                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `test_t15_…`, `test_t16_…`                                                                                                        |
| `src/aux-track-probes/2026-06-aux-filter/`, `…aux-lfo/`                                                                                                          | 7 + 17                       | 1.1.4                              | Shared aux filter/LFO words                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `test_aux_filter_…`, `test_aux_lfo_…`, `test_aux_writer.py`                                                                       |
| `src/presets/presetprojs/` + `src/presets/presets/*.preset/patch.json`                                                                                           | 139 `.xy` + 322 `patch.json` | 1.1.4                              | "nt-" user presets: 139 have a paired project with the preset loaded on T1; the other `patch.json` files have no project yet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `tools/analysis/analyze_preset_corpus.py`                                                                                         |
| `src/preset-load-experiments/2026-06-patch-json-fields/`                                                                                                         | 34 `.xy` (+37 `patch.json`)  | 1.1.4                              | One-field patch.json experiments (play mode strings, loop bits, tune, gain, crossfade, keycenter vs hikey)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `test_patch_json_field_experiment.py`                                                                                             |
| `src/factory-preset-captures/firmware-1.1.21/batches/`                                                                                                           | 18                           | **1.1.21**                         | 142 factory presets, 8 per file, pristine donors                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | (none)                                                                                                                            |
| `src/factory-preset-captures/firmware-1.1.21/strings/`                                                                                                           | 6                            | **1.1.21**                         | 6 Strings factory presets on T8                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | (none)                                                                                                                            |
| `output/image-probes/`                                                                                                                                           | 11                           | generated; device-tested on 1.1.4  | 01 C4 step 5 **D**; 02 note==vel **D**; 03 T3 melody **D**; 04/05 Whitney 8×9 + song **D**; 06 mute enum **D**; 07 note flags **D**; 08 preset → T5 **D**; 09 Tiesto sparse song **D**; 10 Aurora (p-locks, untested); `cap_drum_params` (device capture)                                                                                                                                                                                                                                                                                                                                                    | `test_image_writer.py`, `test_drum_voice_params_inspection.py`                                                                    |
| `output/*.xy`                                                                                                                                                    | 11                           | generated by the legacy raw writer | mp2_* device PASS (historical); 6 have non-canonical RLE; custom_note* have a broken structure                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | negative tests only                                                                                                               |
| `src/json-golden/`, `player-probes/`, `sampler-probes/2026-06-multisampler/`, `drum-sample-probes/2026-06-pad-voice-map/`, `preset-probes/2026-06-preset-t5-p9/` | 0                            | —                                  | Capture plans marked **todo**: players, multisampler zones, and pad map for a non-pp kit are unmapped                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | —                                                                                                                                 |

### 6.2 Recommended golden fixture set for the TS port

Vendor about 60 files (~1.3 MB) into our repo with a manifest (sha256, upstream path, firmware, what it
proves) and the MIT notice (§9).

| Tier                                                  | Files                                                                                                                                                                                                                  | Assertion                                                                                                                                                                  |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G0 codec                                              | all 182 one-offs + 24 factory captures + the 11 image probes                                                                                                                                                           | `encode(decode(f)) == f`; structure walks; footer = 14 slots ending at EOF                                                                                                 |
| G1 semantic replication (byte-exact from `unnamed 1`) | u2, u81, u19, u92, u5, u11, u10, u41, u14–u16 (aligned model), u20–u22, u23, u8, u59, j05, j06                                                                                                                         | edit → bytes equal the capture (the upstream set in `tests/test_image_writer.py` plus EQ)                                                                                  |
| G2 near-exact                                         | u116 (preset to T4/T7/T8), `cap_drum_params` (drum edits)                                                                                                                                                              | equal except the residual bytes upstream allows (`UI_OK` in `test_set_preset_matches_device_kit_load`). Most are region framecounts the device fills lazily (Appendix A.3) |
| G3 parse-only                                         | u35, u115, u120–u126 (p-locks, union mask), u39/u106–u109 (lanes), u63/u118/u119 (components), u149–u155 (songs), mute/volume probes, EQ/sat/static mixer probes, oneshot g0–g14, pp pan/fade, fp01–fp18 (donor index) | the inspector model matches values listed in this doc                                                                                                                      |
| G4 differential vs Python                             | ~30 generated specs (random notes, patterns 1–16, scenes, mutes, songs, p-locks, components)                                                                                                                           | TS bytes == Python bytes, for writer paths where Python is correct (not union mask / region model)                                                                         |

---

## 7. Porting plan to TypeScript

### 7.1 Principles

- **Deterministic core, AI on top** (`docs/VISION.md`). The LLM emits a typed spec, and the TS codec
  compiles it. Never let the model touch bytes.
- **Data-driven field table.** One `FieldDescriptor` table (offset, type, scope, enum, confidence,
  evidence) drives read, write and the inspector JSON. The UI and agent get confidence and firmware
  tags for free (DECISIONS D3).
- **Two views:** raw decoded image (`Uint8Array`) plus a typed `ProjectModel` (JSON) for the agent and
  replica UI. Writes go model → image patches, never a full re-serialization from the model, so
  unknown bytes survive.
- **Undo is sacred.** The image is immutable per revision (copy-on-write `Uint8Array`), and revisions
  are cheap: 0.3–1.5 MB each, or store encoded ~10–90 KB.

### 7.2 Module list and size estimates

| Module (suggest `src/lib/core/xy/`) | Responsibility                                                                                      | LOC (est.)                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------- |
| `rle.ts`                            | `rleDecode` (two-pass alloc), `rleEncode` (canonical greedy)                                        | 70                           |
| `container.ts`                      | Header parse/validate, layout family (header[5] → T1 base), version tag, write policy (`0x13` only) | 60                           |
| `layout.ts`                         | Offset constants, `walkPatterns` (clones + lanes), footer parse/serialize, invariants               | 200                          |
| `image.ts`                          | `XyImage` wrapper: typed get/set (u8/i8/u16/u32/i32/Q31), splice, copy-on-write, pristine clearing  | 150                          |
| `fields.ts`                         | Descriptor tables: global, pattern header, sound words, sample region, enums, confidence            | 350                          |
| `notes.ts`                          | Read/insert/remove/sort notes, 120 cap, validation                                                  | 120                          |
| `plocks.ts`                         | Set/clear lock (value + mask + union + current row + carry), rotate, column table                   | 180                          |
| `stepComponents.ts`                 | Bit/value tables with guide labels, set/clear, rotate                                               | 90                           |
| `scenes.ts`, `songs.ts`             | Scene rows (sel/mute/flag), active scene/song, variable-length song slots                           | 160                          |
| `arrangement.ts`                    | Build from spec: baseline → pattern structs (clones), scenes, songs, per-pattern sound              | 260                          |
| `presets.ts`                        | Donor copy (regions + octave), factory donor index, preset path                                     | 160                          |
| `samples.ts`                        | SampleRegion read/write (drum kit/sampler) with the corrected record model                          | 160                          |
| `lanes.ts`                          | Performance lanes read (write later)                                                                | 80                           |
| `inspect.ts`                        | Image → `ProjectModel` JSON (for agent context and replica), with confidence                        | 350                          |
| `validate.ts`                       | Pre-export invariants (§2.3) + "firmware target" checks (e.g. >9 patterns on <1.1.15)               | 150                          |
| `spec.ts`                           | zod schema for the LLM-facing musical spec, compile to arrangement calls                            | 200                          |
| `assets/`                           | `baseline-1.1.4.xy` (9.5 KB) + factory donors (24 files, 191 KB), lazily loaded                     | data                         |
| tests                               | Unit, corpus, golden, differential, property                                                        | 1,000                        |
| **Total**                           |                                                                                                     | **~3,000 TS + ~1,000 tests** |

### 7.3 MVP (first milestone)

**Goal:** "write notes into N tracks × M patterns + tempo + scenes/mutes + song chain", loadable on the
user's 1.1.33 device.

1. `rle.ts`, `container.ts`, `layout.ts` (walk and footer). Read any device file and round-trip it.
   Test G0 on the whole corpus. The prototype (Appendix B) already passes 909/915 round-trip and
   913/915 walk.
2. `inspect.ts` (subset): tempo, groove, time sig, per-track engine/preset path/octave, patterns
   (steps, notes), scenes, songs. This is enough for the agent to "see" a project pulled from the
   device.
3. `arrangement.ts`: port of `build_arrangement` plus global setters, with G1 goldens. The prototype
   already passes u2, u81, u19, u92, u5, u10, u11, u41, u20–u22, u23, u8, u59, j05, j06, and parity
   with Python's spec compiler (17/17).
4. `validate.ts`, then first device acceptance test (with the owner, per `docs/VISION.md` ground rules):
   a 4-track, 4-pattern, 4-scene song authored from the 1.1.4 baseline. Then the same content authored
   from a **1.1.33** blank baseline pulled from the device (Q1/Q3).

**Milestone 2:**

- step components and p-locks (with the union-mask fix and carry), plus G3 parse checks;
- device test of a cutoff lock (Q6);
- factory preset donors (Appendix D) plus octave copy, with the G2 u116 golden;
- mixer, sends, master and EQ.

**Milestone 3:**

- drum kit regions (record model) and sampler;
- lanes write;
- aux T9–T16 helpers;
- read-only support for header families `0x0E–0x11` (needs fixtures from issue #19 owners).

### 7.4 Tricky parts (where ports go wrong)

1. **Clone base = start − 1.** All pattern-relative offsets must work for clones, and you must never
   write clone "+0x00".
2. **Lanes after notes.** A fixed stride misparses any live-recorded project. Parse the 3 lane counts
   (§3.7).
3. **Footer is variable-length.** Parse the 14 slots and rewrite one slot. Don't use upstream's
   `len − 56` shortcut.
4. **Header family.** Compute the T1 base from header[5]. Refuse to write unknown families.
5. **Q31 alignment.** Global master words at `0x65+4k`, sound words at `+0x3857+4k`. Max is
   `0x7FFFFFFF`; master mins are `0x00A3D70A`.
6. **P-locks.** Value, step mask, union mask, current row, carry. Armed zero ≠ empty. Column 0 maps to
   mask bit 41.
7. **Preset donor copy.** Pristine donor _and_ empty target; copy octave; per-pattern sound.
8. **Sample regions.** Use the 128 B record at `+0x393F`. Upstream's `set_drum_voice` writes
   `start/loop_start/end/gain/fade` into the _neighbouring_ voice's window under our model; port the
   header fields, re-derive the window fields.
9. **Pristine/edited field** `+0x11`: clear on any pattern edit.
10. **Note ordering.** Sort by tick, allow negative ticks, cap at 120.
11. **Scenes.** Scene N at slot N−1; set flags for created scenes; keep `0x06` in range; selections <
    pattern count.
12. **Strings.** Latin-1, NUL-padded. Note 1.1.15 added "mtp: utf8 support" (Q27).
13. **Memory.** 16 tracks × 16 patterns is about 4.6 MB decoded. Fine in-browser. Encode is linear.
14. **Don't trust upstream docs marked "superseded".** Raw-space docs contradict the decoded map (for
    example `docs/format/plocks.md` says the p-lock table is at `+0x3057`, and `step_components.md`
    says 16 slots). See Appendix E.

### 7.5 Golden testing against the Python implementation

- **Pin the oracle.** Upstream commit `7a74acc`. Run with
  `uv venv --python 3.12` + `uv pip install pytest mido` (Appendix C). Upstream runs 1570 tests in 16 s.
- **Fixture vendoring.** Copy the §6.2 set into `src/lib/core/xy/__fixtures__/kmorrill/` with `LICENSE`
  (MIT text) and `manifest.json`. Because `research/repos/` is git-ignored (DECISIONS D1), CI can't rely
  on it. An optional "full corpus" vitest suite runs only when `research/repos/kmorrill_xy-format`
  exists.
- **Differential generator.** Add `scripts/xy-golden/gen.py` (runs under `uv run`, _not_ in CI). It
  takes `specs/*.json`, calls upstream `build_arrangement` and `ImageProject` edits, and writes
  `*.expected.xy` plus a JSON sidecar of the ops. Commit the outputs. Vitest replays the same ops
  through TS and compares bytes. Exclude or mark ops where we intentionally diverge (union mask, region
  model), and assert the _device_ behaviour instead.
- **Property tests.** Random image slices → `decode(encode(x)) == x`. Random specs → TS encode → TS
  inspect → model equality. Random edits keep §2.3 invariants.
- **Device-in-the-loop (manual, with the owner).** For each new write feature: author one file,
  upload, check on the front panel, save-as on device, pull back, and diff decoded images (upstream
  workflow in `docs/parse_capability_checklist.md` "Device roundtrip workflow"). Record outcomes with
  firmware version.

### 7.6 Evidence the port is straightforward

The throwaway prototype (erasable-syntax TS, runs directly on Node 24):

| Check                                             | Result                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------- |
| RLE unit cases from `tests/test_rle.py`           | pass                                                                       |
| Round-trip all 915 files                          | 909 byte-exact (the 6 failures are legacy non-canonical `output/*`), 0.5 s |
| Structure walk + footer                           | 913/915 (the 2 failures are broken legacy `output/custom_note*.xy`)        |
| Byte-exact replication vs device captures         | 14/14 (u2, u81, u19, u92, u5, u11, u10, u41, u20, u21, u22, u23, u8, u59)  |
| `build_arrangement` vs device captures            | 2/2 (j05, j06)                                                             |
| Parity with Python `spec_to_xy_image` (demo spec) | byte-identical                                                             |

The core code is in Appendix B.

### 7.7 What is ported and verified (2026-09-28)

The port lives in `src/lib/core/xy/`: about 1,500 lines of TypeScript for the codec, 400 for `simToXy`
and 1,500 of tests. All of it is pure; `simToXy` lives in `src/lib/sim/xy.ts`, since it reads the simulator. It follows the
plan of §7.2 for the MVP of §7.3, steps 1–3, plus step components and locks from milestone 2. Every
ported file names its upstream source (MIT notice in `NOTICE.md` and
`src/lib/core/xy/fixtures/README.md`). The small `bytes.ts`, `errors.ts` and `index.ts` are not listed.

| Module         | Lines | Upstream source                                                                | What it does                                                                                       |
| -------------- | ----: | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `rle.ts`       |    69 | `xy/rle.py`                                                                    | Two-pass decode, canonical-greedy encode                                                           |
| `container.ts` |    82 | `xy/rle.py`, `TRACK_BASE_BY_FIRMWARE`                                          | Header and magic, layout family → Track 1 base (0x14 added), the families we map                   |
| `layout.ts`    |   230 | `pattern_starts_from_image`, the offset constants                              | Offsets; the lane-aware walk (A.1); the 14 song slots, which must end at EOF (A.7)                 |
| `model.ts`     |   338 | enums of `project_config_inspection`, `PLOCK_PARAMS`, `bar_menu_inspection`    | The project model; lock columns, step components, engines, scales, groove detents, conversions     |
| `read.ts`      |   185 | the inspection modules                                                         | `readProject`: settings, 100 scenes, every pattern's bar settings, notes, components, locks, lanes |
| `write.ts`     |   488 | `ImageProject` setters, `set_plock`, `set_step_component`, `build_arrangement` | `writeProject(model, template)`: writes what differs from the template, keeps every other byte     |
| `sim/xy.ts`    |   394 | —                                                                              | `simToXy(state, template)`: the simulator's project as a file, and what it could not take          |

The model holds the file's own values where the file is exact (ticks, bytes, 0–32767 lock values),
so a project read and written again comes back byte for byte; a pattern's `sound` (engine, preset
path, volume, pan) is read-only. **The writer writes only what differs** from the template's own
reading: a changed note list is rewritten in tick order with its lanes; locks are set or cleared cell,
mask bit, current value and carry (§3.9), then the union mask is recomputed (A.2); a changed step's
components are rewritten; song slots are rebuilt in place. A pattern the template lacks starts as the
track's first pattern there, emptied (locks, current values, carries, components, notes and lanes
cleared; sound kept). The pristine field is written as the model has it: the device's rule depends on
how a pattern was edited (§3.4), so callers decide; `simToXy` clears it for a changed pattern.

**Deliberate differences from upstream:** the union mask (A.2), lane-aware walking (A.1), slots
rewritten whatever their length (A.7), notes sorted by tick (§3.7), family 0x14, and no setters for
the sound block, drum regions or presets yet (milestones 2–3 of §7.3). The legacy raw-space modules
(`xy/container.py`, `structs.py`, `plocks.py`, `step_components.py`) are not ported (Appendix E).

**Verification.**

| Check                                                                       | Result                                                                                                                                                                                                                |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RLE cases of `tests/test_rle.py`, fuzz                                      | pass                                                                                                                                                                                                                  |
| Reader vs the Python library, committed fixtures (`fixtures/expected.json`) | 7/7 files, every field: settings, scenes, songs, each pattern's bar settings, notes, components, locks, union bytes, lane counts                                                                                      |
| Reader vs the Python library, whole corpus (one-off check, 2026-09-28)      | 907/907 lane-free files agree field for field; the 6 with lanes are the ones upstream's scanner misreads                                                                                                              |
| Writer vs the Python library (`fixtures/goldens.json`, 26 op lists)         | 26/26 byte-exact; 17 equal device captures (u2, u5, u8, u10, u11, u19, u20–u22, u41, u59, u81, u92, j05, j06, image probes 01 and 02)                                                                                 |
| Corpus (local only, skipped without the clone)                              | 909/915 re-encode byte-exact (6 legacy outputs are not canonical RLE); 913/915 walk (2 broken legacy); every walkable file reads and writes back unchanged, and carries onto the blank template with its model intact |
| The owner's 1.1.33 blank project (local only)                               | Header `09 14 07 86`; 289,521 B, Track 1 at 3,449, 16 single patterns, the 56-byte footer; round-trips; takes edits as a template                                                                                     |
| `simToXy`                                                                   | A new simulator project writes back as either template, but for the metronome byte; a project the agent writes through the virtual OP-XY reads back note for note                                                     |

**The 1.1.33 blank project against the 1.1.4 one.** Same size and structure; 56 bytes differ: T1's
keyboard octave (−1 where 1.1.4 has 0), scene 1's flag (set on 1.1.33), sound word k57 (`+0x393B`,
`0x3FFFFFE7` on T1–T8 where 1.1.4 has 0), two framecount bytes of T1's region 18, and five
crossfade words of T8's regions (zero on 1.1.33). None of it is sequence data.

**Fixtures** (`src/lib/core/xy/fixtures/`, about 140 KB): the blank 1.1.4 template, four of upstream's
device-tested image probes (01, 02, 06, 07), two projects the library writes from our op lists
(`song.xy`, `locks.xy`), and the JSON above. `scripts/xy-fixtures.py` regenerates them with the
library as the oracle and checks each claimed device equality. No TE factory projects, factory
preset captures, user presets or commercial-song arrangements are committed.

**`simToXy` (the simulator → a file).** It writes tempo, groove type and amount, the metronome, the
project settings (transpose, scene length, time signature, voices, MIDI channels), the keyboard
octaves of tracks whose keys transpose, every track's patterns (length, note length, scale,
quantisation, groove, smoothing, notes with micro-timing and gates, step components, the locks
with a known column: engine parameters 1–4, both envelopes, portamento, engine volume, the filter,
the four sends), the 99 scenes (patterns, mutes) and the 14 songs. Where the template's byte reads
as the simulator's value it stays, so an untouched project writes back as its template. It reports
in `skipped` what the file does not take yet: players, quantisation's on/off switch, the track
scales 3–8, locks of the LFO, play mode, bend, sampler keys, the MIDI program and the auxiliary
pages, and differences from the template in engines, presets, preset settings, mixer levels and
pans, and per-scene mixes. Two simulator facts to settle: its metronome starts off, which the file
can only store as volume 0 (a new device project stores 0xA8, "on", in both firmwares); and its
scenes keep mixes while the file keeps mutes only (volume is per pattern, Q7).

**Left for the device session (with the owner, announced first):**

1. Q3: does 1.1.33 load files authored over the 1.1.4 template, and over its own blank project?
   Start with `simToXy` of a small song over the owner's blank project, then the same over 1.1.4.
2. Q2: 16 patterns on a track (the `sixteen patterns` golden is ready to author).
3. Q6: which union mask plays and displays a cutoff lock (ours is the device's own OR).
4. Save-as on the device and pull back: diff the decoded images of what we wrote and what it saved
   (pristine fields, lock carries, current values, scene flags).
5. The transfer path (Q28) and CC86 loading (Q29).

---

## 8. Open questions / verify on the real device

Device work belongs to the device-probe agent and the owner (`docs/research/90-device-probe.md`). Each
item below is phrased as a concrete capture or test. Read-only pulls of project files over MTP are the
cheapest (Q1).

1. **OS 1.1.33 header and layout.** Pull one blank project saved on 1.1.33. Check header bytes 4..7
   (`09 13 06 86`?), that T1 starts at 3,449, that there are 100 scene slots, the 56-byte footer, and
   that decoded size is 289,521 for a blank project. Then decode the owner's real projects: all must
   walk (lanes!) and round-trip. **Blank project answered (2026-09-28, §7.7):** header
   `09 14 07 86`, T1 at 3,449, 289,521 B, the 56-byte footer; it walks and round-trips. Still open:
   projects with content.
2. **16 patterns per track.** Capture a device project with 16 patterns on one track. Then device-test
   an authored file with 16 patterns on T1 and scenes selecting P16 (upstream never tested >9).
3. **Cross-version acceptance.** Do files authored from the 1.1.4 baseline (header `… 03 86`) load on
   1.1.33? (They loaded on 1.1.25.) Should we author from a 1.1.33 baseline and write its header? Does
   1.1.33 re-save them with a different header[6]?
4. **Meaning of header bytes 4, 6, 7.** Does header[6] track firmware minor versions (03 on 1.1.4, 06
   on 1.1.21)?
5. **Sample region record model ★.** Edit only "start" on one drum pad whose key byte is known, save,
   and diff. Expect the window at `+0x393F + 128·r + 4` of the _same_ record as that pad's header.
6. **P-lock union mask ★.** Author two files with a cutoff lock: one upstream-style (`+0x304E = 1`) and
   one corrected (`+0x3050 = 1`). Check which plays and displays correctly. Also save a device-made
   cutoff lock and confirm the union matches.
7. **Scene volume semantics ★.** In a 2-scene project where the scenes select different patterns, set
   T1 volume differently per pattern. Does switching scenes audibly change volume (per-pattern volume
   hypothesis)? Upstream reported "global mix" on 1.1.4.
8. **Drum note mapping.** On factory `boop`, which sequenced note triggers the kick, 53 (expected) or
   48? Fix midi_to_xy-style GM maps accordingly.
9. **Drum tune direction.** Does byte `0x6C` mean +48 or −48 semitones (sampler root semantics suggest
   a higher root = lower pitch)?
10. **Scene presence and count.** How does the device decide how many scenes exist (flags vs referenced
    vs duplicated-on-switch)? Do authored scenes with `flag = 0` show up?
11. **Sound link storage.** Enable sound link on a track, save, diff (candidates: global `0x1D–0x3C`,
    pattern header).
12. **Players.** Arpeggio, maestro and hold. Three captures (upstream plan in
    `src/player-probes/2026-06/README.md`).
13. **Multisampler zones.** Two-zone capture (plan in `src/sampler-probes/2026-06-multisampler/`).
14. **Global transpose after 1.1.21** ("simplified global transpose"). Is `0x1B` still ±24?
15. **Track scale enum.** Bytes for x3/x4/x5/x6/x7/x8 (1.1.25 added odd scales). Known: ½ `01`, 1 `03`,
    2 `05`, 16 `0E`.
16. **Tempo range and precision.** Max BPM, and whether tenths are honoured on 1.1.33.
17. **120-note edge case.** A 120-note authored pattern. Notes beyond the pattern length; maximum gate.
18. **Velocity 0 / flags.** Behaviour of velocity 0 and of `flags[0]` values (probe 07 re-triggered at
    127).
19. **LFO type enum gaps.** Values 4/5 and the other M4 subfunctions (`+0x38C7..+0x38D6`).
20. **Mod-routing destination enum** for words k42–k47 and k55–k56 (targets) and signed amount scaling.
21. **P-lock columns 5–8, 27–32, 37–40.** What lives there (M1 shift params? LFO shift? mixer?)?
22. **Pattern `+0x11` values 1/2.** UI page? Do they matter when authoring (we write 0)?
23. **FX engine parameter schemas** for reverb, chorus, phaser, distortion and lofi (k0..k7 on
    T15/T16).
24. **Per-pattern sound.** Confirm the device plays each pattern's own preset when sound link is off.
    Confirm the effect of authored clones inheriting the leader's sound.
25. **Words k36–k39, k52, k57** in the sound block (k52 is the transpose candidate).
26. **Performance lane header** (`w0`/`w1` semantics) and whether authored lanes play (automation of
    PB/MW/AT).
27. **UTF-8 in paths/names.** Since 1.1.15 MTP supports UTF-8 names. What encoding does the device use
    inside path fields?
28. **Transfer path.** Normal-mode USB exposes no MTP interface. The device-probe agent found TE's
    SysEx FILE protocol over USB-MIDI, but its tree so far shows only `drum` and `synth` directories and
    **no projects** (`docs/research/90-device-probe.md`, 2026-09-26; GREET also confirms
    `os_version:1.1.33`). Upstream uploads `.xy` files in MTP mode (`tools/mtp_upload.py`, referenced by
    `tools/analysis/cc86_select.py` but _not committed_), and MIDI is unavailable while in MTP mode.
    Open questions:
    - Can `.xy` files be reached over SysEx FILE (another node or page)?
    - Is WebUSB-MTP feasible in the browser?
    - Otherwise, fall back to a File System Access download plus manual copy.
29. **CC86 project select.** Upstream says CC86 value N loads the project whose filename starts with
    the 3-digit prefix N. This is useful for "author → upload → auto-load". Verify on 1.1.33.

---

## 9. License and attribution

- **Upstream license: MIT**, "Copyright (c) 2026 Kevin Morrill" (`LICENSE`). Permissive: we may port,
  translate and redistribute code and data provided the copyright notice and permission text accompany
  "all copies or substantial portions".
- **What to do in our repo:**
  1. Put the MIT text and Kevin Morrill's copyright in `THIRD_PARTY_NOTICES.md` (or
     `src/lib/core/xy/LICENSE-kmorrill`).
  2. Add a header comment in each ported module ("Portions derived from kmorrill/xy-format, MIT").
  3. Keep the notice with vendored fixtures.
  4. Credit the project in the app's About screen and README.
- **Fixtures.** The `.xy` captures are repo content under the same license. They contain no audio, only
  sample _paths_ to files on the owner's device.
- **Factory preset donors (Appendix D).** These are MIT as repo files, but the _parameter values_
  embody Teenage Engineering's factory sound design. They are low-risk: every OP-XY owner has these
  presets, and we only reference them on the owner's own device. Given the "grassroots / TE supportive
  but provides no files" ground rule in `docs/VISION.md`, prefer to (a) fetch them at build time rather
  than bundle them publicly, or (b) ask TE for a nod. Flag this for the owner.
- **Our own work.** This document, the JSON restructuring and the corrections in Appendix A are
  original analysis. The TS prototype in Appendix B is my own code informed by the MIT algorithm.
  Release it under the project's license with the attribution above.
- **Companion repo.** Upstream's `CLAUDE.md`/`AGENTS.md` point to a companion `op-xy-live` repo for
  musical generation, but only by the author's local path (`/Users/kevinmorrill/Documents/op-xy-live`).
  It isn't in the clone, I couldn't confirm it is public, and nothing here depends on it.

---

## Appendix A — Corrections and new findings vs upstream docs

Each item gives the claim, the evidence, and what to do in the port. Scripts are in Appendix C.

**A.1 Performance lanes make pattern size variable (★ closes upstream "resilient boundary scanner" TODO).**

- Upstream (`xy/image_writer.py` `pattern_starts_from_image`) uses
  `size = 17876 + 12·notes` and notes that live recording "appends automation data"
  (`docs/state_of_understanding.md` 2026-07-09).
- Finding: 3 lanes `[count][w0 w1 (t v)×(count−1)]` follow the notes (§3.7). The upstream scanner fails
  on 8 files (6 device-saved); the lane-aware walker fails only on 2 broken legacy outputs.
- Port: always parse lanes.

**A.2 P-lock "master flag" is a union mask.** `+0x304E..+0x3055` = OR of the step masks in 41/41
device structs. Upstream `set_plock` writes `0x304E = 1` for any column, and
`test_set_plock_arms_lane_mask_and_master` asserts that for a cutoff lock, contradicting the device.
The Aurora probe (`docs/logs/2026-06-10_aurora_automation.md`) was built under an even older
"global per-step flag" theory.

**A.3 Sample regions are 128 B records at `+0x393F`.**

- Evidence:
  - pan and fade edits on one pad land in one record (pp kit, d1/d3);
  - edited headers co-occur with their own record's window fill in `cap_drum_params`;
  - factory windows are sane (framecount == end);
  - the one-shot sampler maps exactly onto record 0;
  - the table ends exactly at the preset path;
  - the u116 "UI residuals" are lazily-filled framecounts.
- This retires these upstream rules: "fade stored on preceding voice", "shifted sample-window layout",
  "voice 23 overlaps label", "+0x7C gain/fade shared", "voice 10 loop-start candidate", and "UI session
  bytes at +0x3CBF".
- Upstream's baseline drum readout ("v11 start = end = 16004") is really region 12's framecount/end.

**A.4 Global master words are Q31 at `0x65+4k`.** All nine EQ probes and all nine saturator probes read
as clean `0x00000000` / `0x40000000` / `0x7FFFFFFF` / `0x1999999A` at those offsets. Upstream "spill"
values are misaligned reads.

**A.5 Per-track keyboard octave at global `0x3D + (t−1)`.** 139/139 preset pairs match `patch.json`
`octave` for T1. The factory batches show category-consistent octaves on T1–T8 (bass −2). Upstream
knew only T1.

**A.6 "Scene volume" = per-pattern volume.** In `s2b`, the change is in T1's pattern-2 (clone) struct.
The upstream mapping `T + S − 1` comes from indexing the pattern-struct list as tracks. For the same
reason, `tools/inspect_xy.py`'s "Scene Mix" section mislabels volumes whenever an earlier track has
several patterns. In my demo (T1 with 2 patterns) it printed T3 P1's edited volume as "T04".

**A.7 Footer has no extra byte.** All device files parse as 14 `[count][ids][loop][0]` slots ending at
EOF, including u154 (song 2 = 2 scenes) and u155 (3 scenes).

**A.8 Step-component values = guide accidental index.** Thirteen capture points match
`knowledge/official/guide/08-step-components.md` §8.4. Bits 11/12/13 are skip p-lock, skip component
and skip trigger. Upstream names bits 12/13 `conditional_a/b` and describes u75 as "first four
parameter toggles", but value 4 of bit 11 = "play every 4th p-lock".

**A.9 `set_preset` overwrites notes if the target has any.** It copies `[0x4570, 17876)` at fixed
offsets. If the target has notes, the note records get replaced by donor tail bytes while the count
stays. Call it on empty patterns only (upstream tests do), or copy the donor's 97-byte post-lane tail to
the target's post-lane position.

**A.10 LFO type 6 = duck** (u32: tremolo 0 → 6). **Drum key bytes are 53–76** on factory kits, so
midi_to_xy's 48–71 GM map is offset by 5.

**A.11 P-lock columns 25/26.** Upstream names `lfo_param` (col 25) and `lfo_dest` (col 26). The capture
shows CC41 (the chart's "LFO parameter") in column 26, so column 25 = CC40 (the chart's "LFO
destination"). The names look swapped. Use CC-neutral names.

**A.12 Header bytes are not a payload length.** `docs/parse_capability_checklist.md` §1 says "magic,
payload length". Bytes 4..7 are constant within a firmware family. There is no length or checksum.

**A.13 Minor doc inconsistencies to ignore.**

- `docs/format/plocks.md` "P-lock table base: track struct +0x3057" (wrong; `+0x2A0`).
- `docs/format/step_components.md` "16 step slots" (64).
- `docs/format/header.md` / `tools/inspect_xy.py` legacy groove names and "Pattern Directory"
  (raw-space).
- `docs/format/mod_routing.md` block offsets (raw-space).
- `decoded_image_map.md` listing `0x64` both as T16 MIDI channel and as "global prefix u32".

---

## Appendix B — Validated TypeScript reference code

This is the core of the prototype that passed the §7.6 checks (Node 24, type stripping, no deps). It is
intentionally small; production code should add the field tables, copy-on-write and validation from §7.

```ts
// rle.ts: byte-level RLE used by .xy (after the 8-byte header)
export const MAGIC = [0xdd, 0xcc, 0xbb, 0xaa] as const;
export const HEADER_LEN = 8;
const MAX_RUN = 257; // 2 literal bytes + extension 255

export class XyFormatError extends Error {}

export function rleDecode(buf: Uint8Array, start = 0, end = buf.length): Uint8Array {
	let size = 0; // pass 1: size
	for (let i = start, prev = -1; i < end;) {
		const b = buf[i++];
		size++;
		if (b === prev) {
			if (i >= end) throw new XyFormatError(`extension byte missing at ${i}`);
			size += buf[i++];
			prev = -1;
		} else prev = b;
	}
	const out = new Uint8Array(size); // pass 2: fill
	for (let i = start, o = 0, prev = -1; i < end;) {
		const b = buf[i++];
		out[o++] = b;
		if (b === prev) {
			const ext = buf[i++];
			out.fill(b, o, o + ext);
			o += ext;
			prev = -1;
		} else prev = b;
	}
	return out;
}

export function rleEncode(data: Uint8Array): Uint8Array {
	const out: number[] = [];
	for (let i = 0; i < data.length;) {
		const v = data[i];
		let j = i;
		while (j < data.length && data[j] === v) j++;
		let k = j - i;
		while (k >= 2) {
			const c = Math.min(k, MAX_RUN);
			out.push(v, v, c - 2);
			k -= c;
		}
		if (k) out.push(v);
		i = j;
	}
	return Uint8Array.from(out);
}

export function decodeProject(file: Uint8Array) {
	for (let k = 0; k < 4; k++) if (file[k] !== MAGIC[k]) throw new XyFormatError('bad magic');
	return { header: file.slice(0, HEADER_LEN), image: rleDecode(file, HEADER_LEN) };
}

export function encodeProject(header: Uint8Array, image: Uint8Array): Uint8Array {
	const body = rleEncode(image);
	const out = new Uint8Array(HEADER_LEN + body.length);
	out.set(header.subarray(0, HEADER_LEN), 0);
	out.set(body, HEADER_LEN);
	return out;
}
```

```ts
// layout.ts: structure walk (family 0x13 verified; others from upstream issue #19)
export const PATTERN_BASE = 17876; // 0x45D4
export const OFF_NOTE_COUNT = 0x456f;
export const NOTE_SIZE = 12;
export const TRACK_BASE_BY_HEADER5: Record<number, number> = {
	0x0e: 3933,
	0x0f: 3933,
	0x10: 3433,
	0x11: 3433,
	0x13: 3449
};

/** Bytes used by the 3 performance lanes (PB, MW, AT) that follow the note records. */
export function laneBytes(img: Uint8Array, pos: number) {
	const counts = [0, 0, 0];
	let size = 0;
	for (let l = 0; l < 3; l++) {
		const c = img[pos + size];
		counts[l] = c;
		size += c === 0 ? 1 : 1 + 4 * c; // [count][w0 w1][(t v) x (count-1)]
	}
	return { size, counts };
}

export interface PatternRef {
	track: number;
	pattern: number;
	base: number;
	noteCount: number;
	end: number;
}

export function walkPatterns(header: Uint8Array, img: Uint8Array) {
	const t1 = TRACK_BASE_BY_HEADER5[header[5]];
	if (t1 === undefined)
		throw new XyFormatError(`unknown layout family 0x${header[5].toString(16)}`);
	const patterns: PatternRef[] = [];
	let pos = t1;
	for (let track = 1; track <= 16; track++) {
		const count = img[pos];
		if (count < 1 || count > 16) throw new XyFormatError(`bad pattern count ${count} on T${track}`);
		for (let p = 1; p <= count; p++) {
			const base = p === 1 ? pos : pos - 1; // clones omit the count byte
			const noteCount = img[base + OFF_NOTE_COUNT];
			if (noteCount > 120) throw new XyFormatError('note count > 120');
			const { size } = laneBytes(img, base + OFF_NOTE_COUNT + 1 + noteCount * NOTE_SIZE);
			const end = base + PATTERN_BASE + noteCount * NOTE_SIZE + (size - 3);
			patterns.push({ track, pattern: p, base, noteCount, end });
			pos = end;
		}
	}
	return { patterns, footer: pos };
}

export function parseSongs(img: Uint8Array, footer: number) {
	const songs: { scenes: number[]; loop: boolean }[] = [];
	let o = footer;
	for (let s = 0; s < 14; s++) {
		const c = img[o];
		songs.push({ scenes: Array.from(img.subarray(o + 1, o + 1 + c)), loop: img[o + 1 + c] === 0 });
		o += 1 + c + 2;
	}
	if (o !== img.length) throw new XyFormatError('footer does not end at EOF');
	return songs;
}
```

```ts
// Writer essentials (port of ImageProject.add_note / build_arrangement core)
// - addNote: insert 12-byte record keeping ascending tick; count++ at +0x456F; clear +0x11..+0x12
// - pattern struct for arrangement = copy of the baseline track's 17,876-byte struct:
//     st[+0x01] = steps; st[+0x11..+0x12] = 0 (if notes/steps set); st[+0x456F] = n;
//     splice n*12 note bytes at +0x4570 (before the 3 empty lane bytes + 97-byte tail)
// - leader = first struct with [0] = patternCount; clones = struct.subarray(1)
// - scenes: slot k at 0x95+33k: sel[16], mute[16] (2 = muted), flag = 1; img[0x06] = scenes-1
// - Song 1: replace the first 4-byte default slot (01 00 00 00) with [n, ids..., loop?0:1, 0]
```

---

## Appendix C — Reproduction commands

```bash
# Python oracle (never pip-install globally)
SP=/private/tmp/claude-501/-Users-neo-repos-op-xy-agent/<session>/scratchpad
cd "$SP" && uv venv --python 3.12 xyvenv && VIRTUAL_ENV=$SP/xyvenv uv pip install pytest mido
cd research/repos/kmorrill_xy-format
PYTHONDONTWRITEBYTECODE=1 $SP/xyvenv/bin/python -m pytest -q -p no:cacheprovider
#   -> 1545 passed, 25 skipped (skips: fixtures referenced but not committed)

# End-to-end: spec -> .xy
$SP/xyvenv/bin/python tools/spec_to_xy_image.py demo_spec.json -o demo_raw.xy
$SP/xyvenv/bin/python tools/inspect_xy.py demo_raw.xy

# Header tally
find . -name '*.xy' -print0 | xargs -0 -I{} sh -c 'xxd -s 4 -l 4 -p "{}"' | sort | uniq -c
#   891 09130386, 24 09130686
```

Scratchpad scripts used for the findings (not committed; each is ~50 lines over `xy.rle.decode_project`):

- `corpus_scan.py`: round-trip, topology, footer and engine stats for all files.
- `lane_scan.py`: lane-aware walker (A.1); 913/915 OK.
- `union_mask.py`: union vs OR of step masks (A.2); 41/41.
- The record-model diff over `cap_drum_params` and the pp pan/fade probes (A.3).
- The global variance scan (§3.2) and track-header variance scan (§3.4).
- `ts-proto/{xy,writer,corpus_test,golden_test}.ts`: `node corpus_test.ts <repo>` and
  `node golden_test.ts <repo> <scratch>`.

---

## Appendix D — Factory preset donor library (firmware 1.1.21)

These are pristine donors: 1 pattern, 0 notes, verified by decode. The paths are under
`src/factory-preset-captures/firmware-1.1.21/` (except the 8 defaults in `unnamed 1.xy`, firmware 1.1.4).
Engine ids are per §3.12, and `oct` is the global octave byte for that track (copy it along with the
struct).

- **156 presets:** bass 28, lead 27, keys 26, pluck 23, pad 22, drum 12, organ 11, strings 7.
- **Engines:** sampler 36, prism 21, simple 19, dissolve 14, axis 14, wavetable 13, drum 12,
  multisampler 8, hardsync 7, epiano 6, organ 6.

| Donor file                      | T1                            | T2                            | T3                              | T4                           | T5                            | T6                             | T7                                  | T8                                                                                                                       |
| ------------------------------- | ----------------------------- | ----------------------------- | ------------------------------- | ---------------------------- | ----------------------------- | ------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `unnamed 1.xy` (1.1.4 baseline) | drum/boop (drum,0)            | drum/in phase (drum,0)        | bass/shoulder (prism,−1)        | pluck/beach bum (epiano,+1)  | lead/gaussian (dissolve,0)    | pluck/dielectric (hardsync,−1) | strings/draemy (axis,0)             | pad/bandpasser (multisampler,0)                                                                                          |
| `batches/fp01.xy`               | bass/alloy (prism)            | bass/any time (sampler)       | bass/bark (wavetable)           | bass/belch bass (simple)     | bass/big square (simple)      | bass/blank (simple)            | bass/corduroy (hardsync)            | bass/essex (simple) — all oct −2                                                                                         |
| `fp02`                          | bass/flyby (prism)            | bass/guitar low (sampler)     | bass/haymaker (dissolve)        | bass/iguana (sampler)        | bass/jacket (epiano)          | bass/line check (simple)       | bass/loney bass (dissolve)          | bass/mineral (prism) — all −2                                                                                            |
| `fp03`                          | bass/not fm (wavetable)       | bass/off guard (dissolve)     | bass/pocket (dissolve)          | bass/pressure (simple)       | bass/rear 424 (sampler)       | bass/shark attack (simple)     | bass/sonorous (prism)               | bass/trunk (dissolve) — all −2                                                                                           |
| `fp04`                          | bass/under bron (dissolve,−2) | bass/valves (prism,−2)        | bass/wobbler (wavetable,−2)     | drum/chamine                 | drum/dead spot                | drum/fletcher                  | drum/kerf                           | drum/martini                                                                                                             |
| `fp05`                          | drum/mushroom                 | drum/playwood                 | drum/sugar                      | drum/wood box                | drum/zebra                    | keys/80s lover (sampler)       | keys/ambi piano (sampler)           | keys/corporate (wavetable)                                                                                               |
| `fp06`                          | keys/dark (prism)             | keys/drodezzz (sampler,+1)    | keys/elect piano (sampler)      | keys/electric (hardsync,−1)  | keys/foal (epiano)            | keys/jeans (epiano)            | keys/key keys (simple)              | keys/man stage (prism,−1)                                                                                                |
| `fp07`                          | keys/medieval (prism)         | keys/missing you (simple)     | keys/needs tuning (epiano)      | keys/newshour (sampler)      | keys/piano 1 (sampler,−1)     | keys/piano 2 (sampler,+1)      | keys/refelt piano (multisampler,−1) | keys/shine (prism,−1)                                                                                                    |
| `fp08`                          | keys/slush (prism)            | keys/spacious (wavetable,−1)  | keys/swelvet (prism)            | keys/tonk 5 (prism)          | keys/vintage (multisampler)   | keys/wakeup (prism)            | keys/whurl xy (sampler)             | lead/asinine (wavetable)                                                                                                 |
| `fp09`                          | lead/azimuth (sampler)        | lead/beam (prism)             | lead/bowed (axis)               | lead/burbie (simple,−2)      | lead/dustmite (dissolve)      | lead/far field (sampler,+1)    | lead/gradient (prism)               | lead/insomniac (dissolve)                                                                                                |
| `fp10`                          | lead/low ride (simple,−2)     | lead/massage (simple,−2)      | lead/millinery (simple)         | lead/modulus (wavetable,−1)  | lead/open cell (prism,−2)     | lead/runway (hardsync,−2)      | lead/sad triangle (wavetable)       | lead/saw 101 (sampler)                                                                                                   |
| `fp11`                          | lead/sonar (dissolve,+1)      | lead/spud mate (dissolve)     | lead/swell (hardsync)           | lead/top spin (simple,+1)    | lead/uknowaxel (multisampler) | lead/whirrs (simple,−1)        | lead/wide saw (sampler)             | lead/wool (simple,−1)                                                                                                    |
| `fp12`                          | lead/wub (hardsync,−2)        | organ/chorale (organ)         | organ/chunk (organ,+1)          | organ/dusty org (sampler)    | organ/fm organ (sampler)      | organ/hammy xy3 (sampler)      | organ/harmonium (multisampler,−1)   | organ/joker (sampler)                                                                                                    |
| `fp13`                          | organ/manual (organ,−1)       | organ/meat org (wavetable,+1) | organ/post order (wavetable,+1) | organ/vestigial (organ,+1)   | pad/chambre (axis)            | pad/chuba (wavetable)          | pad/confucius (axis)                | pad/dark choir (sampler)                                                                                                 |
| `fp14`                          | pad/dream choir (sampler)     | pad/frontier (prism,−1)       | pad/kowalski (axis)             | pad/murmel (prism)           | pad/night sky (prism)         | pad/op1 pad (sampler)          | pad/padawan (sampler)               | pad/qiviut (sampler)                                                                                                     |
| `fp15`                          | pad/rich pad (sampler)        | pad/separee (axis)            | pad/spectre (multisampler)      | pad/subsun (multisampler,−2) | pad/there is hope (sampler)   | pad/ulysses (wavetable)        | pad/unravel (dissolve)              | pad/uranium (prism,−1)                                                                                                   |
| `fp16`                          | pad/zafu (wavetable)          | pluck/avant garde (organ,+2)  | pluck/bellissimo (axis)         | pluck/bellonboards (sampler) | pluck/coin (axis,+1)          | pluck/deep luck (simple)       | pluck/dingus (organ,+2)             | pluck/endless (sampler)                                                                                                  |
| `fp17`                          | pluck/guitar (sampler)        | pluck/kvarnofon (sampler,+1)  | pluck/layered (axis)            | pluck/leftovers (epiano)     | pluck/marimba (sampler)       | pluck/odorant (hardsync,−1)    | pluck/on tape (sampler)             | pluck/pale crepe (simple,−1)                                                                                             |
| `fp18`                          | pluck/rally (simple)          | pluck/resobubble (sampler,−1) | pluck/rift (axis)               | pluck/soft tines (dissolve)  | pluck/synth bell (sampler)    | pluck/whorl (dissolve)         | _(default)_                         | _(default)_                                                                                                              |
| `strings/<name>.xy` (T8 only)   |                               |                               |                                 |                              |                               |                                |                                     | ensemble (multisampler), intimate str (sampler), nachtmusik (axis), pointe (axis,−1), soutenu (axis,−1), whitness (axis) |

The capture rules and name list are in `docs/workflows/factory_preset_capture_checklist_1.1.21.md`. The
device corrected `lead/azimith` → `lead/azimuth`. The "nt-" user presets in `src/presets/` form a
second donor set: T1 of each `presetprojs/*.xy`, with `patch.json` alongside. 138 of the 139 are
pristine (1 pattern, 0 notes); one T1 has a note, so it is not a valid donor. Engines: 109 sampler,
12 drum, the rest synths. These are community "nt-" presets, not TE factory presets.

---

## Appendix E — Upstream files that are legacy and must NOT be ported

These describe **compressed-byte (pre-RLE)** models superseded on 2026-06-09. They still pass their own
tests but encode wrong mental models.

- `xy/container.py`, `xy/structs.py`: raw "track blocks", signatures, handles.
- `xy/plocks.py`: raw 5/9/18-byte p-lock "entries", param_ids `0x5C…0xAE`.
- `xy/step_components.py`: raw two-bank encoding, "only steps 1 and 9 work".
- `tools/roundtrip_xy.py`, `tools/read_xy_header.py`, `tools/extract_plocks.py`,
  `tools/analyze_corpus.py`, `tools/corpus_lab.py`: raw-space indexing. `corpus_lab` is still useful
  for its outcome-recording idea.
- The "Pattern Directory"/"Header" sections of `tools/inspect_xy.py`, and its `GROOVE_TYPE_NAMES`.
- `tools/analysis/analyze_step_components_v*.py`, `decode_step_components*.py`,
  `analyze_hybrid_scene_families.py`, `corpus_compare.py`: raw-space archaeology.
- Docs: `docs/format/record_structure.md` §1–§4 (raw grammar, tail codes), the `param_id` tables in
  `docs/format/plocks.md`, `docs/format/step_components.md`, `docs/format/mod_routing.md`,
  `docs/format/header.md` legacy notes, and everything in `docs/logs/` dated before 2026-06-09 (e.g.
  `2026-02-13_agents_legacy_snapshot.md`).

Port instead: `xy/rle.py`, `xy/image_writer.py` (with the Appendix A fixes), the decoded-image read
modules (`project_config_inspection`, `bar_menu_inspection`, `scene_volume_inspection` minus the
volume-routing function, `master_*_inspection` with aligned offsets, `sampler_sample_inspection`,
`drum_sample_inspection` rebased to the record model, `brain_inspection`, `patch_json`,
`patch_sound_state`, `song_footer_inspection`), `tools/spec_to_xy_image.py`, and the useful parts of
`tools/midi_to_xy.py`.
