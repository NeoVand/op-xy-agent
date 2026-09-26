# Deep Research: Building an AI Assistant That Can Program and Control the Teenage Engineering OP‑XY

## Executive assessment

The project you have in mind is **technically feasible**, but the most important conclusion from this research is that it should **not** be built as “an AI that sends MIDI to the OP‑XY.” MIDI is only one part of the solution.

The OP‑XY exposes several fundamentally different computer-facing surfaces:

| Control plane | What it gives the AI | Best use |
|---|---|---|
| **USB/BLE/TRS MIDI** | Notes, CC parameter changes, mixer control, tempo, scenes, projects, transport, clock | Immediate interaction, auditioning, live performance |
| **Native `.xy` project files** | Actual OP‑XY patterns, notes, gates, velocities, p-locks, step components, scenes, songs, many project/track parameters | **Programming the OP‑XY's native sequencer** |
| **`.preset` + `patch.json` + samples** | Drum kits, sampled instruments, multisamples, sample mapping | AI-generated sounds, drum kits, multisampling |
| **MTP / Field Kit** | Transfer projects, samples and presets between computer and OP‑XY | Deployment and state acquisition |
| **USB audio** | Stereo audio returning from the OP‑XY | Listening, analysis, validation, iterative AI production |

Teenage Engineering officially documents USB MIDI host/device and USB audio host/device support, and the COM subsystem exposes MIDI configuration, controller mode, connected-device settings and MTP file access. citeturn18view2turn18view4

The really important discovery is **`kmorrill/xy-format`**. It has gone considerably farther than the repos in your initial list: it reverse-engineers the native `.xy` project format and can already **author notes, gates, velocities, pattern lengths, parameter locks, step components, engine parameters, scenes, mutes and song chains**, then produce project files intended to load on the device. fileciteturn8file0L2-L2 This changes the architecture completely. Rather than forcing every operation through simulated button presses or live MIDI recording, an AI can potentially construct a complete native OP‑XY composition offline and then copy it to the device.

A second major discovery is **`kmorrill/op-xy-vibing`**, which is already explicitly aimed at making music collaboratively with Claude, Codex or ChatGPT. It stores loops as JSON, runs a Python MIDI conductor, exposes WebSocket control and plays through the OP‑XY over USB-C. fileciteturn7file0L2-L2 It does not yet solve the whole native-project problem, but conceptually it is extremely close to the application you described.

A third is **`jshph/opxy-reactive`**. It is a semantic MIDI backend that turns OP‑XY MIDI into named JSON events over WebSocket and, importantly, has an **`AGENT.md` explicitly written as an interface contract for an AI agent**. It can also send semantic parameter changes back to the OP‑XY. fileciteturn20file0L2-L2 fileciteturn24file0L2-L2

I **did not find a verified public MCP server dedicated specifically to the OP‑XY** despite broad GitHub/web searches. That is not proof that one has never existed or that there is not an unindexed/private project. The curated `awesome-te` directory likewise lists AI-assisted OP‑XY tools but currently places the actual `mcp-koii` project under the EP‑133 K.O. II ecosystem rather than OP‑XY. fileciteturn35file0L2-L2 That EP‑133 project is nevertheless almost a blueprint for the outer MCP layer you need: it exposes MIDI device discovery, connection, notes and patterns as MCP tools to Claude. fileciteturn17file0L2-L2

So the strongest architecture is:

```text
Your voice
   │
   ▼
Speech-to-text
   │
   ▼
LLM musical agent
   │
   ├────────────── Music/project state model ──────────────┐
   │                                                       │
   ▼                                                       ▼
OP-XY MCP / tool server                              deterministic validators
   │
   ├── MIDI control ───────────────► OP-XY live
   │
   ├── .xy project authoring ──────► OP-XY native sequencer
   │
   ├── preset/sample builder ──────► OP-XY samplers
   │
   ├── MTP deployment ─────────────► OP-XY storage
   │
   └── USB-audio capture ◄───────── OP-XY audio
                                      │
                                      ▼
                               AI listens/analyzes
                                      │
                                      └── iterative edits
```

**That is substantially more powerful than a MIDI-only agent.**

## Official OP‑XY documentation and firmware state

As of **September 25, 2026**, the latest firmware published by Teenage Engineering is **OP‑XY OS 1.1.33, released September 2, 2026**. It fixes an inability to add parameter locks to empty steps. The immediately preceding 1.1.32 release on September 1 fixes sequencer stalls during preset/sample browsing, USB-startup problems, step-component clearing, aux-LFO issues and MIDI-engine/arpeggio behavior. citeturn18view0

There is an important documentation mismatch you should encode into the future application's knowledge base: **the current online OP‑XY user guide is labeled v1.1.15**, while the current firmware is 1.1.33. citeturn18view1turn18view0 Consequently, the AI should treat the **online user guide plus the complete firmware changelog** as the authoritative documentation set, not the guide alone.

### Firmware changes that matter to an AI-control application

Your requested starting point, 1.1.3, was released February 10, 2026. It fixed several sequencing/project behaviors, including preservation of step components and p-locks when duplicating pages and a MIDI-track/duck-LFO problem. 1.1.4 followed on February 17. citeturn18view0

The bigger architectural release was **1.1.15 on July 1, 2026**. Among other things it added deeper user-content folder hierarchies, better handling of large user content, preset-folder creation/movement, project templates, a MIDI monitor, improved MTP robustness and UTF‑8 handling, and increased the number of patterns per track **from 9 to 16**. It also fixed MIDI engine and MIDI program-change p-lock behavior. citeturn18view0

That last point matters because some older specifications and community code still assume nine patterns. Any new application should target the firmware capability rather than stale product-page numbers.

Firmware **1.1.0**, released October 15, 2025, is particularly relevant to your sampling ambitions. It introduced the OP‑XY's sample slice mode, drum and synth sampler parameter locks, delayed scene switching and a MIDI command for delayed scene selection. citeturn18view0

Even older changelog entries prove that substantial remote MIDI control has existed for some time. Firmware 1.0.40 specifically fixed a crash caused by **repeated project-load requests via MIDI CC**, while 1.0.29 added incoming/outgoing MIDI clock over BLE and transport relaying between MIDI devices. citeturn18view0

### Documentation the build agent should ingest

The following should be treated as the primary official knowledge corpus:

| Resource | URL | Why the agent needs it |
|---|---|---|
| **Current OP‑XY guide** | https://teenage.engineering/guides/op-xy | Master manual/index; currently labeled v1.1.15. citeturn18view1 |
| **Firmware / OS changelog** | https://teenage.engineering/downloads/op-xy | **Canonical source for post-1.1.15 behavior and current 1.1.33 firmware.** citeturn18view0 |
| **Official MIDI CC reference** | https://teenage.engineering/guides/op-xy/midi-references | Official external-control CC mapping. citeturn21view0 |
| **COM / connectivity** | https://teenage.engineering/guides/op-xy/com | USB/BLE MIDI, MIDI settings, controller mode, MIDI monitor, MTP. citeturn18view2 |
| **Sampling / slicing** | https://teenage.engineering/guides/op-xy/sample | Drum sampler, sample slicing, multisampler and sample library. citeturn18view3 |
| **Sequencer** | https://teenage.engineering/guides/op-xy/sequencer | Native sequencing, recording and step concepts. The main guide links this as a core chapter. citeturn18view1 |
| **Projects** | https://teenage.engineering/guides/op-xy/project | Project lifecycle/configuration. The main guide indexes project settings and project folders. citeturn18view1 |
| **Workflow / patterns / scenes / songs** | https://teenage.engineering/guides/op-xy/workflow | Needed for translating requests like “make an intro, chorus and drop.” The main guide explicitly indexes patterns, scenes, songs and projects. citeturn18view1 |
| **Auxiliary / external MIDI** | https://teenage.engineering/guides/op-xy/auxiliary | MIDI engine, eight assignable CCs, CV, audio, tape and FX tracks. citeturn21view2 |
| **Instrument / synth architecture** | https://teenage.engineering/guides/op-xy/instrument | Engine, envelopes, filter, LFO, presets. Indexed by the master guide. citeturn18view1 |
| **Effects** | https://teenage.engineering/guides/op-xy/fx | Needed to give the agent semantic knowledge of FX parameters. Indexed by the master guide. citeturn18view1 |
| **Product specifications** | https://teenage.engineering/products/op-xy | Hardware I/O and broad capability overview. citeturn18view4 |
| **Field Kit** | https://teenage.engineering/apps/field-kit | Especially relevant on macOS for device-content access; community tools also rely on it for OP‑XY preset deployment. fileciteturn12file0L2-L2 |

Teenage Engineering also provides a browser-based **MIDI firmware updater** from the downloads page, and alternatively TE Boot can expose the OP‑XY as a mass-storage device for firmware deployment. citeturn18view0

For an AI application's internal RAG/documentation layer, I would version these resources together as something like:

```text
opxy-knowledge/
  official/
    guide-1.1.15/
    midi-reference/
    firmware-changelog-through-1.1.33/
  reverse-engineering/
    xy-format/
    opxy-reactive/
  presets/
    pytheory/
    op-patchstudio/
    multisample-tools/
```

The **firmware number must be first-class state**. A tool should be able to answer:

```text
device firmware: 1.1.33
guide baseline:   1.1.15
MIDI map profile: 1.1.x
.xy format profile: tested/untested for 1.1.33
```

That will prevent an agent from applying an old workaround to a current device.

## What can actually be controlled from the computer

### Live MIDI control is far more extensive than it initially appears

Teenage Engineering's current official MIDI-reference page states that the OP‑XY has almost all of its controls pre-mapped for external MIDI control. citeturn21view0

The officially documented global controls include:

| MIDI CC | Function | Channel |
|---:|---|---|
| 7 | Track volume | 1–16 |
| 9 | Track mute | 1–16 |
| 10 | Track pan | 1–16 |
| 46 | Track parameters | 1–16 |
| 80 | Tempo | Any |
| 81 | Groove | Any |
| 82 | Scene, delayed switch | Any |
| 83 | Previous scene | Any |
| 84 | Next scene | Any |
| 85 | Scene, immediate | Any |
| 86 | **Project** | Any |
| 90 | EQ | Channels 1–4 |

All take 0–127 values in the official table. citeturn21view0

This means an agent can already perform requests such as:

> “Mute the bass.”

> “Bring track four down 6 dB.”

> “Switch to the next scene at the musical boundary.”

> “Load project 17.”

> “Increase the groove.”

> “Open the filter on the bass during this section.”

without simulating front-panel interaction, provided the appropriate CC and channel mapping is known. citeturn21view0turn11file0

The more detailed community-maintained CC map used by `xy-format` includes instrument-track controls for engine parameters, amp and filter envelopes, voice mode, portamento, pitch-bend amount, filter cutoff/resonance/key tracking, external/tape/FX sends and LFO functions. It also maps auxiliary tracks differently according to role. fileciteturn11file0L2-L2

For instrument tracks, the core map currently documented there is:

```text
CC  7       volume
CC  9       mute
CC 10       pan

CC 12–15    engine parameters 1–4

CC 20–23    amp ADSR
CC 24–27    filter ADSR

CC 28       poly / mono / legato
CC 29       portamento
CC 30       pitch-bend amount
CC 31       engine volume

CC 32       filter cutoff
CC 33       resonance
CC 34       filter envelope amount
CC 35       key tracking

CC 36       external send
CC 37       tape send
CC 38       FX I send
CC 39       FX II send

CC 40–41    LFO functions
```

fileciteturn11file0L2-L2

This is already enough for a rich natural-language control layer:

```text
"make the bass darker"
    ↓
track 3 / filter cutoff ↓

"make it wider and wetter"
    ↓
engine param according to engine
FX sends ↑

"make the pad fade in"
    ↓
amp attack ↑

"mute the percussion until the next section"
    ↓
CC9 now
CC85 or CC82 for arrangement change
```

The application should never expose “CC 32” to the model as its principal abstraction. It should expose:

```json
{
  "tool": "set_parameter",
  "track": "bass",
  "parameter": "filter.cutoff",
  "value": 0.42
}
```

and translate that deterministically into the correct MIDI message.

### The OP‑XY MIDI track is particularly useful

The official Auxiliary guide documents a dedicated external MIDI track that can sequence external notes and has controls for MIDI **channel, bank, program and eight editable MIDI CCs**, with those CC controls themselves sequenceable/recordable; its LFO can modulate parameters on that external MIDI track. citeturn21view2

This matters in both directions. A MIDI-engine track can become a dedicated automation lane between the OP‑XY and an agent environment.

### MIDI configuration and monitoring are first-class device features

COM provides system-level control over whether clock, notes and “other” MIDI messages are sent, received or both; MIDI echo is configurable, and current firmware has a built-in incoming MIDI monitor. COM M2 is generic MIDI-controller mode, while M3 handles connected MIDI devices. citeturn18view2turn18view0

The AI application's setup wizard should therefore perform a capability test rather than assume settings:

```text
detect ports
    ↓
send harmless test CC
    ↓
verify OP-XY response
    ↓
test note I/O
    ↓
test clock
    ↓
test Start / Stop
    ↓
record firmware profile
```

### MIDI is not a complete sequencer-editing API

This is the critical limitation.

`opxy-reactive`'s research indicates that the official CC map is primarily a **receive/control surface**, not a comprehensive bidirectional state protocol. Normal instrument-track encoder movements do not necessarily appear as outbound MIDI. Its implementation therefore distinguishes direct MIDI listening, MIDI echo, a man-in-the-middle bridge for messages that the computer itself sends, and disk/project parsing for static device state. fileciteturn21file0L2-L2

So there is no reason to expect a request such as:

> “Put a kick on steps 1, 5, 9 and 13, add a probability component to step 13, make a second pattern and then build a four-scene song”

to map cleanly onto ordinary CC messages.

That is where `.xy` authoring becomes essential.

### Remote front-panel key simulation is interesting but should be considered experimental

`opxy-reactive` documents reverse-engineered **CC106/CC107 key-down/key-up behavior** with values corresponding to many physical OP‑XY controls: mode keys, M1–M4, track buttons, keyboard notes, Record/Play/Stop, Shift and step buttons. The same research explicitly warns that this behavior has differed across firmware/community reports and recommends probing it on the actual unit. fileciteturn21file0L2-L2

This could eventually be extremely powerful:

```text
AI
 ↓
press SAMPLE
 ↓
press/hold SHIFT
 ↓
select slicer option
 ↓
press keyboard/step controls
```

But I would **not make CC106/107 the foundation of the application**.

On OS 1.1.33, treat it as:

```text
capability: remote_ui_keys
status: unknown until device probe
```

If the probe passes, use it as a bonus tool for workflows for which no semantic API exists.

### Audio return creates a feedback loop

Community stem tools demonstrate computer-controlled OP‑XY playback plus USB-audio capture. `stembounce` sequentially controls track mute state over CC9, controls transport, derives timing from MIDI clock, records USB audio and exports aligned WAV stems. fileciteturn16file0L2-L2

`mofongo/opxy-stems` independently implements essentially the same strategy: mute the eight instrument tracks with CC9, unmute one, send MIDI Start, capture the OP‑XY USB audio and repeat. fileciteturn30file0L2-L2

This gives your agent a crucial capability:

```text
Agent changes song
       ↓
OP-XY plays it
       ↓
USB audio returns
       ↓
audio feature analysis / transcription / critique
       ↓
Agent revises it
```

That is what can turn the system from a one-way “LLM sends notes” demo into a **closed-loop music-production assistant**.

## Existing software, reverse engineering and AI projects

The ecosystem is now large enough that I would strongly advise the implementation agent to **reuse and wrap existing work rather than independently reverse-engineer the machine**.

### The most important projects

| Project | Importance to your goal | What to take from it |
|---|---|---|
| **`kmorrill/xy-format`** | ★★★★★ | Native `.xy` project decoding/authoring |
| **`kmorrill/op-xy-vibing`** | ★★★★★ | Existing AI → JSON → MIDI OP‑XY workflow |
| **`jshph/opxy-reactive`** | ★★★★★ | Semantic MIDI abstraction + agent interface |
| **`squarewave-studio/op-patchstudio`** | ★★★★★ | Drum/multisample preset construction and audio tools |
| **`buba447/OPXY-Multisample-Tool`** | ★★★★☆ | Automated recording and packing of multisamples |
| **`sixthlaw/opxy-multisampler-preset-builder`** | ★★★★☆ | Browser multisample generation and pitch detection |
| **`aliosa27/op-xy-slicer`** | ★★★★☆ | **Transient-detect → slices → OP‑XY preset** workflow |
| **`kennethreitz/pytheory-opxy`** | ★★★★☆ | Programmatic sound generation + reverse-engineered preset knowledge |
| **`om3opr/stembounce`** | ★★★★☆ | MIDI + USB-audio closed-loop control |
| **`benjaminr/mcp-koii`** | ★★★★☆ | Actual Teenage Engineering MCP implementation to adapt |
| **`buba447/LaunchpadPrefs-OPXY`** | ★★★☆☆ | Practical proof of extensive external MIDI performance control |
| **`kazuochi/opxy-deck`** | ★★★☆☆ | Detailed controller-mode mapping and AI-agent integration in the opposite direction |

### `kmorrill/xy-format`: the native project breakthrough

Repository:

https://github.com/kmorrill/xy-format

This should probably become one of the foundational dependencies of your application.

It establishes that an OP‑XY `.xy` file is effectively an eight-byte wrapper plus a byte-level RLE-compressed project image. Once decoded, the project is largely structured data rather than an opaque encrypted/proprietary blob. fileciteturn8file0L2-L2

Its current stack can manipulate substantially more than notes. The README reports support for:

```text
notes
gates
velocity
pattern length
bars
step components
parameter locks
engine parameters
preset donor copies
drum voice parameters
scenes
mutes
song chains
multi-pattern arrangements
```

and can inspect project configuration, preset paths, drum/sampler samples, mixer state, scenes, master EQ and the master saturator. fileciteturn8file0L2-L2

Canonical code paths include:

```text
xy/rle.py
xy/image_writer.py
tools/spec_to_xy_image.py
tools/midi_to_xy.py
tools/inspect_xy.py
tools/corpus_lab.py
```

fileciteturn8file0L2-L2

Its much more detailed capability checklist is invaluable for an agent because it distinguishes fields that are genuinely device-validated from those that are only partially understood:

https://github.com/kmorrill/xy-format/blob/main/docs/parse_capability_checklist.md

For example, the project currently has structured write support for tempo, groove, per-track MIDI channels, project transpose, time signature, voice allocation, notes, pattern length, p-locks, step components and many sampler/drum parameters. At the same time, some areas remain partial, including various parameter enums, portions of multisampler behavior and direct sample-path authoring. fileciteturn25file0L2-L2

Other essential reading from this repo:

```text
https://github.com/kmorrill/xy-format
https://github.com/kmorrill/xy-format/blob/main/docs/state_of_understanding.md
https://github.com/kmorrill/xy-format/blob/main/docs/parse_capability_checklist.md
https://github.com/kmorrill/xy-format/blob/main/docs/format/decoded_image_map.md
https://github.com/kmorrill/xy-format/blob/main/docs/engineering/authoring.md
https://github.com/kmorrill/xy-format/blob/main/docs/reference/opxy_midi_cc_map.md
```

The implementation principle should be:

> **Do not have the LLM write `.xy` bytes. Have the LLM produce a typed musical specification, and let `xy-format` deterministically compile it into `.xy`.**

### `kmorrill/op-xy-vibing`: closest existing AI prototype

Repository:

https://github.com/kmorrill/op-xy-vibing

This project explicitly describes itself as allowing a user to create music collaboratively with **Claude, Codex or ChatGPT** and an OP‑XY in real time. An editable JSON loop feeds a Python conductor that sends it to the OP‑XY over USB-C MIDI, while WebSocket and web interfaces permit live updates. fileciteturn7file0L2-L2

Its architecture is almost exactly the right prototype:

```text
Human ⇄ LLM / Agent
          │
          ▼
      Conductor
        ├── HTTP UI
        ├── WebSocket API
        ├── atomic file editing
        ├── Git-backed iteration
        └── MIDI playback engine
                    │
                    ▼
                  OP-XY
```

fileciteturn7file0L2-L2

It additionally includes evolving preset/drop export tooling, creates copy-ready `.preset` directories and explicitly warns implementers about atomic writes, stuck-note prevention and MIDI safety. fileciteturn7file0L2-L2

For your application I would reuse its **loop IR, scheduling ideas and live-edit architecture**, but extend it so a composition has two execution targets:

```text
SongSpec
  ├── Live target     → MIDI conductor
  └── Native target   → xy-format → project.xy
```

That would let the AI audition ideas instantly and then “commit” them to a standalone OP‑XY project.

### `jshph/opxy-reactive`: semantic OP‑XY middleware

Repository:

https://github.com/jshph/opxy-reactive

The project connects to the OP‑XY over USB MIDI and turns raw MIDI into labeled semantic events such as track/engine/parameter names, then broadcasts normalized JSON over WebSocket. fileciteturn20file0L2-L2

Especially important:

https://github.com/jshph/opxy-reactive/blob/master/AGENT.md

That file is deliberately a **contract for a consuming AI agent**, including event schemas, address namespaces, parameter labels and write-back operations. fileciteturn24file0L2-L2

Its design document should also be mandatory reading:

https://github.com/jshph/opxy-reactive/blob/master/DESIGN.md

It proposes four complementary state/control strategies:

```text
direct MIDI listening
MIDI man-in-the-middle
MIDI echo
disk/project-file inspection
```

fileciteturn21file0L2-L2

That is almost exactly the architecture I recommend for your device adapter.

### Your supplied sample/preset tools

**PyTheory OP‑XY**

https://github.com/kennethreitz/pytheory-opxy

This is much more interesting than merely being a preset pack. It synthesizes sounds algorithmically, generates OP‑XY multisampled instruments and drum kits and includes reverse-engineering notes for the OP‑XY preset format. fileciteturn12file0L2-L2

The crucial developer document is:

```text
https://github.com/kennethreitz/pytheory-opxy/blob/main/opxy-preset-notes.md
```

An AI sound-generation subsystem should study this code because it demonstrates:

```text
algorithmic source sound
         ↓
render samples
         ↓
construct OP-XY preset
         ↓
deploy to OP-XY
```

That is directly analogous to your proposed “AI creates sounds for me” flow. fileciteturn12file0L2-L2

**OP-PatchStudio**

https://github.com/squarewave-studio/op-patchstudio

The open-source web version is now described by its author as legacy, with new development moving to a desktop application, but the repository remains an unusually rich implementation reference. fileciteturn13file0L2-L2

It contains logic for 24-slot drum presets, up-to-24-zone multisamples, waveform trimming, zero-crossing snapping, loop points, resampling, bit-depth/channel conversion, WAV metadata parsing, gain and normalization, recording, envelopes, tuning and patch generation. fileciteturn13file0L2-L2

For your agent, its **non-UI audio and patch-generation functions** are the valuable part.

**OP‑XY Multisampler Preset Builder**

https://github.com/sixthlaw/opxy-multisampler-preset-builder

This project can detect note names from filenames or audio pitch, map samples onto keyboard zones, resample audio and generate compatible `patch.json` structures. fileciteturn15file0L2-L2

**buba447 Drum Tool**

https://github.com/buba447/opxy-drum-tool

This is an early static web drum/multisample generator and served as the foundation/inspiration for subsequent tools including OP-PatchStudio. The repository contains separate drum and multisample interfaces. fileciteturn14file0L2-L2

Its associated dedicated multisample tooling is even more relevant:

https://github.com/buba447/OPXY-Multisample-Tool

It can automatically record a series of notes from an external MIDI instrument or DAW, construct OP‑XY multisample JSON and package the sample files into the correct preset hierarchy. fileciteturn28file0L2-L2

That means an eventual agent could say:

> “Sample this hardware synth every minor third across four octaves and turn it into an OP‑XY instrument.”

and automate most of that process.

### A very important slicer you had not listed

**`aliosa27/op-xy-slicer`**

https://github.com/aliosa27/op-xy-slicer

This one directly addresses the workflow you described. It takes WAV or MP3 input, detects transients, divides the recording into slices and creates OP‑XY `.preset` directories with `patch.json` metadata. fileciteturn26file0L2-L2

Conceptually:

```text
AI/generated audio
       ↓
transient detection
       ↓
slice boundaries
       ↓
individual audio files
       ↓
OP-XY drum preset
       ↓
24 playable keys
```

This should absolutely be studied or reimplemented as a deterministic tool in your agent.

The OP‑XY itself has an official slicer with **transient, even and tap** modes, so an agent-side slicer can mirror the device's conceptual workflow while doing the work on the computer. citeturn18view3

### Additional high-value ecosystem projects

The curated `awesome-te` project is probably the best directory to monitor:

https://github.com/bnjreece/awesome-te

It explicitly curates working Teenage Engineering-specific reverse-engineering and software projects rather than trying to index every GitHub repository. fileciteturn35file0L2-L2

Its OP‑XY section additionally identifies:

| Project | URL | Role |
|---|---|---|
| OP‑XY Drum Builder | https://github.com/niekert/op-xy-drum-builder | Custom sample drum racks; its README confirms direct OP‑XY drum-preset creation. fileciteturn36file0L2-L2 |
| SF2 → OP‑XY | https://github.com/charlesvestal/sf2-to-opxy | Converts SoundFont instruments/drums into OP‑XY presets, preserving useful mapping/envelope/loop data. fileciteturn37file0L2-L2 |
| OP‑XY → SFZ | https://github.com/legsmechanical/opxy-to-sfz | Useful for reverse conversion/inspection. Listed by the curated directory. fileciteturn35file0L2-L2 |
| DX7 → OP‑XY | https://github.com/cfurrow7/dx7-opxy | Converts DX7 SysEx-derived material. Listed by the curated directory. fileciteturn35file0L2-L2 |
| Maschine → OP‑XY | https://github.com/DimaDake/maschine-multisample-to-op-xy-converter | Existing multisample conversion path. fileciteturn35file0L2-L2 |
| Logic/GarageBand kits | https://github.com/inrainbws/logic_pro_drums_for_opxy | Sample/preset conversion source. fileciteturn35file0L2-L2 |
| vjxy | https://vjxy.app | OP‑XY MIDI-driven visual software; useful as another MIDI integration reference. fileciteturn35file0L2-L2 |

`charlesvestal/sf2-to-opxy` is particularly sophisticated: it supports multisample zone selection, drum mapping, preserved loop points, envelope conversion, FX-send mapping, choke-group interpretation and calibration workflows against recordings made by the real OP‑XY. fileciteturn37file0L2-L2 That test methodology is exactly the sort of thing the new agent should borrow.

### Hardware controllers prove useful CC behavior

`buba447/LaunchpadPrefs-OPXY`

https://github.com/buba447/LaunchpadPrefs-OPXY

maps a Novation Launchpad to OP‑XY scene changes, master EQ, punch-in FX and momentary track mutes. fileciteturn29file0L2-L2

This is valuable because it is a practical hardware demonstration that several remote-control concepts are usable musically, rather than merely theoretical entries in a MIDI table.

### AI projects operating in the opposite direction are still useful

`kazuochi/opxy-deck`

https://github.com/kazuochi/opxy-deck

does the inverse of your goal: it puts the OP‑XY in controller mode and uses its buttons/encoders to operate Claude Code, Codex and other applications. It includes a captured OP‑XY controller-mode control map and an agent-editable JSON mapping system. fileciteturn31file0L2-L2

It is useful for understanding **OP‑XY → AI** control, while your project provides **AI → OP‑XY** control. Combining the two ideas eventually enables a genuinely collaborative instrument:

```text
OP-XY gesture ─────► agent
                        │
voice ─────────────────►│
                        │
                        ▼
                    musical plan
                        │
                        ▼
                    OP-XY changes
```

### Documentation-as-agent-context already exists

`gravitinos/opxy-tutor`

https://github.com/gravitinos/opxy-tutor

packages the OP‑XY guide into a Claude Code learning workspace, including Markdown-converted manuals and a teaching skill. fileciteturn32file0L2-L2

The application itself is not a hardware-control layer, but its organization is useful for your future agent's RAG corpus.

## Native sequencing, generated samples and slicing

This is where the different technologies can be combined into the product you actually described.

### Programming an entire native song

Suppose you say:

> “Give me a 124 BPM dark electro track. Four-on-the-floor kick, syncopated bass, small chord stabs. Make four scenes: intro, groove, breakdown and final drop. Add a little probability on the hats. Increase the reverb send in the breakdown.”

The LLM should **not** respond by immediately spraying MIDI messages.

It should first create a deterministic intermediate representation:

```json
{
  "tempo": 124,
  "tracks": [
    {
      "id": 1,
      "role": "kick",
      "engine": "drum",
      "pattern": [...]
    },
    {
      "id": 2,
      "role": "hats",
      "pattern": [...],
      "components": [...]
    },
    {
      "id": 3,
      "role": "bass",
      "engine": "prism",
      "notes": [...]
    }
  ],
  "scenes": [...],
  "song": [...],
  "automation": [...]
}
```

Then two renderers operate on the same object:

```text
                        ┌──► MIDI renderer ─► hear it immediately
SongSpec / ProjectSpec ─┤
                        └──► XY renderer ───► native OP-XY project
```

`op-xy-vibing` already demonstrates the first model, while `xy-format` supplies most of the machinery for the second. fileciteturn7file0L2-L2 fileciteturn8file0L2-L2

This division is extremely important.

**Live mode** gives near-instant musical iteration.

**Commit-to-device mode** means that when you unplug the computer, the OP‑XY itself contains the composition.

### Creating a drum kit from AI-generated audio

For your proposed workflow:

> “Generate gritty percussion, slice it and put it across my OP‑XY keys.”

I recommend:

```text
Prompt
  ↓
sample/audio generator
  ↓
WAV
  ↓
audio analysis
  ├── transient detection
  ├── zero-crossing refinement
  ├── loudness / peak normalization
  └── silence trimming
  ↓
1–24 slices
  ↓
semantic classification
  ├── kick
  ├── snare
  ├── closed hat
  ├── open hat
  ├── percussion
  └── FX
  ↓
OP-XY drum patch builder
  ↓
<name>.preset/
   patch.json
   slice-01.wav
   slice-02.wav
   ...
  ↓
MTP
  ↓
OP-XY presets/
```

The slicing portion is demonstrated by `op-xy-slicer`, while OP-PatchStudio supplies substantially richer waveform, normalization, zero-crossing and preset-generation logic. fileciteturn26file0L2-L2 fileciteturn13file0L2-L2

The agent can go beyond today's utilities because it knows musical semantics. Instead of simply assigning slice 1 to key 1, it could analyze the sounds and decide:

```text
key 1   strongest kick
key 2   alternative kick
key 3   snare
key 4   clap
key 5   closed hat
key 6   open hat
...
```

That semantic assignment would be an AI layer on top of deterministic preset generation.

### Creating a playable instrument from generated samples

For a melodic instrument:

```text
source model / synthesizer / external hardware
            ↓
C2 C3 C4 C5 C6 ... samples
            ↓
pitch detection
            ↓
root-note / region assignment
            ↓
loop detection
            ↓
crossfade + envelope
            ↓
multisampler patch
            ↓
OP-XY
```

The ecosystem already provides most of this machinery.

`buba447/OPXY-Multisample-Tool` can automatically record notes from MIDI gear or a DAW and package the result. fileciteturn28file0L2-L2

`sixthlaw/opxy-multisampler-preset-builder` provides pitch identification and OP‑XY `patch.json` generation. fileciteturn15file0L2-L2

`pytheory-opxy` proves that sounds can be generated algorithmically and turned into complete OP‑XY sample instruments. fileciteturn12file0L2-L2

`sf2-to-opxy` contains sophisticated region, loop, envelope and calibration code. fileciteturn37file0L2-L2

The official OP‑XY multisampler supports up to **24 zones**, with zone mapping and editable start/loop/end behavior, while the sample browser can derive pitch information from WAV metadata or filenames. citeturn18view3

### Native OP‑XY slice-mode automation is the weaker area

The OP‑XY's own slicer provides transient, even and tap slicing. citeturn18view3

However, community `.xy` reverse engineering does **not yet give the same degree of confidence for all multisampler/slicing fields that it gives for ordinary notes and p-locks**. The `xy-format` README explicitly lists multisampler zones/slicing and the user `.preset` format among areas that are not yet completely decoded. fileciteturn8file0L2-L2

Therefore, for the first application version, I would **not remotely navigate the on-device slicer**.

Instead:

```text
slice on computer
       ↓
construct known-good .preset
       ↓
copy preset to OP-XY
```

That is much easier to test, undo and make deterministic.

Later, verified CC106/107 remote-key control could provide an optional “operate the OP‑XY UI like a human” mode.

### Associating new presets with generated projects

This is one of the remaining engineering details requiring care.

`xy-format` can already manipulate preset identities through donor-region copying and can structurally read preset paths, but its capability matrix does not yet describe every direct preset/sample-path write as a polished public API. fileciteturn25file0L2-L2

The safe initial strategy is therefore template-based:

```text
known-good OP-XY template project
             │
             ├── valid drum track
             ├── valid sampler track
             └── known preset structures
             ↓
xy-format edits musical/project state
             ↓
preset generator creates actual content
             ↓
deployment layer ensures referenced paths exist
```

Avoid inventing unknown binary fields.

That template-preservation philosophy is also consistent with `xy-format`'s recommendation to begin with a known-good project close to the desired state, alter decoded semantic fields and preserve unknown bytes. fileciteturn8file0L2-L2

## Recommended AI and MCP architecture

I would build this as **an OP‑XY service first, MCP second, and voice UI third**.

That separation is important. The device-control subsystem should work perfectly from tests and a CLI before an LLM is allowed to call it.

MCP is a good outer interface because its purpose is precisely to expose tools and resources to AI applications through a standardized protocol. citeturn17search1

### Core service architecture

```text
┌─────────────────────────────────────────────────────────┐
│                    Voice application                    │
│                                                         │
│  microphone → STT → conversational agent → response    │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                    OP-XY MCP server                     │
│                                                         │
│  resources                 tools                        │
│  ─────────                 ─────                        │
│  manual                    compose                      │
│  MIDI map                  modify                       │
│  firmware                  audition                     │
│  current project           deploy                       │
│  preset library            analyze                      │
└─────────────┬──────────────┬──────────────┬─────────────┘
              │              │              │
              ▼              ▼              ▼
        Device State      Music IR      Audio Engine
              │              │              │
       ┌──────┼──────┐       │              │
       ▼      ▼      ▼       ▼              ▼
     MIDI    MTP   project  preset         USB
                   codec    builder        audio
       │      │      │       │              │
       └──────┴──────┴───────┴──────────────┘
                         │
                         ▼
                       OP-XY
```

### MCP/tool surface I would expose

The agent should receive **semantic tools**, not low-level bytes.

| Tool family | Example calls |
|---|---|
| Device | `device.list`, `device.connect`, `device.info`, `device.capabilities`, `device.probe` |
| MIDI | `midi.note`, `midi.chord`, `midi.cc`, `midi.panic`, `midi.start`, `midi.stop` |
| Tracks | `track.volume`, `track.pan`, `track.mute`, `track.select` |
| Sound | `sound.set_engine_parameter`, `sound.filter`, `sound.envelope`, `sound.send` |
| Arrangement | `scene.select`, `scene.next`, `project.load`, `tempo.set`, `groove.set` |
| Composition | `pattern.create`, `pattern.add_note`, `pattern.automate`, `pattern.add_component` |
| Native projects | `project.inspect`, `project.compile`, `project.validate`, `project.diff`, `project.backup` |
| Sampling | `sample.record`, `sample.generate`, `sample.slice`, `sample.detect_transients` |
| Presets | `preset.build_drum`, `preset.build_multisample`, `preset.validate` |
| Storage | `files.list`, `files.push_preset`, `files.push_project`, `files.backup` |
| Audio | `audio.record`, `audio.analyze`, `audio.bounce_stems`, `audio.compare` |

Internally only a few of those should be autonomous LLM operations.

For example:

```json
{
  "name": "pattern.add_note",
  "arguments": {
    "track": 3,
    "pattern": 2,
    "pitch": 43,
    "step": 7,
    "velocity": 104,
    "gate": 0.82
  }
}
```

might eventually compile into an `.xy` edit through `xy-format`.

The model does not need to know the byte offset.

### Separate intention from execution

A very important design decision is to give the model a high-level composition API:

```text
create_drum_pattern()
write_bassline()
generate_chord_progression()
make_variation()
create_scene()
arrange_song()
humanize()
```

rather than asking it to call 200 `add_note` tools individually.

The high-level call could produce a `PatternSpec`, which a deterministic compiler validates.

For example:

```json
{
  "role": "hihat",
  "length": "1bar",
  "division": "1/16",
  "hits": [1, 3, 5, 7, 9, 11, 13, 15],
  "velocity_curve": [83, 58, 91, 61, 86, 54, 94, 63],
  "swing": 0.12,
  "components": {
    "15": {
      "probability": 0.62
    }
  }
}
```

Then:

```text
LLM
 ↓
PatternSpec
 ↓
schema validation
 ↓
musical validation
 ↓
xy-format
 ↓
decoded-image validation
 ↓
.xy
```

The LLM should never directly manipulate:

```text
RLE
binary offsets
raw patch offsets
MTP destructive operations
```

unless operating through deterministic code.

### Use `opxy-reactive` as the semantic live bridge

Its address style is very close to what the MCP service needs:

```text
/track/3/filter/cutoff
/track/3/engine/1
/track/1/note
/fx/1/param/2
/clock
```

fileciteturn24file0L2-L2

A clean architecture would therefore be:

```text
MCP semantic tool
       ↓
OP-XY domain service
       ↓
opxy-reactive-style semantic address
       ↓
MIDI translation
       ↓
OP-XY
```

while project tools call `xy-format` instead.

### Adapt `mcp-koii`, but do not stop there

`benjaminr/mcp-koii`

https://github.com/benjaminr/mcp-koii

already demonstrates an MCP server for another Teenage Engineering sampler. Its tools cover listing MIDI ports, connecting, playing notes and creating patterns from natural-language requests. fileciteturn17file0L2-L2

An OP‑XY MCP should take that basic architecture and expand it dramatically:

```text
mcp-koii concept
       +
opxy-reactive semantics
       +
op-xy-vibing live conductor
       +
xy-format project compiler
       +
OP-PatchStudio/preset generation
       +
MTP deployment
       +
USB-audio analysis
       =
your application
```

That is the central synthesis of this research.

### State management will determine whether the agent is good or frustrating

The agent must keep a canonical representation of:

```text
device
  firmware
  connectivity
  MIDI configuration

project
  tempo
  groove
  scenes
  songs

tracks
  role/name
  engine
  preset
  pattern
  mixer
  FX
  MIDI channel

presets
  sample references
  regions
  envelopes

history
  previous state
  edits
  deployment status
```

Without this, commands such as:

> “Make that bass pattern less busy.”

or:

> “Use the kit we made earlier, but put the snare from the second version on key five.”

become difficult because the LLM has no authoritative reference for “that” or “earlier.”

Use an immutable edit history:

```text
Project revision 17
   ↓
AI proposes revision 18
   ↓
diff
   ↓
validate
   ↓
audition
   ↓
accept
```

This also enables the most important safety command in an AI-controlled musical device:

> “Undo that.”

### Add closed-loop listening

Eventually the agent should evaluate rendered audio instead of assuming that MIDI/project data produced the intended musical result.

A useful loop is:

```text
compose
 ↓
audition through OP-XY
 ↓
record USB audio
 ↓
analyze:
   tempo
   onset positions
   spectral balance
   loudness
   silence
   clipping
   rough stem activity
 ↓
compare against request
 ↓
modify
```

`stembounce` and `opxy-stems` already demonstrate how computer MIDI control and USB-audio recording can be combined. fileciteturn16file0L2-L2 fileciteturn30file0L2-L2

For particularly difficult validation, the agent could temporarily solo tracks and analyze them separately.

## Build priorities, unresolved gaps and definitive source map

### What I would build first

The fastest path to something genuinely useful is not to start with “full autonomous album creation.” Start with a layered system whose capabilities remain useful as later layers are added.

**Foundation**

Build a daemon/service that can reliably discover the OP‑XY, send notes and CCs, receive clock/notes, send transport, switch scenes/projects and issue a MIDI panic. Base the semantic map on the official MIDI reference and `opxy-reactive`. citeturn21view0 fileciteturn20file0L2-L2

**Live AI composer**

Adopt the JSON intermediate-representation concept from `op-xy-vibing`. Let the agent compose a pattern, hear it immediately through the OP‑XY and change it conversationally. fileciteturn7file0L2-L2

At that point you already have:

> “Give me a broken-beat drum groove at 118.”

> “Move the snare later.”

> “Double the hats.”

> “Make the bass answer the kick.”

> “Open the filter during the final two bars.”

**Preset and sample tools**

Add a unified drum/multisample generator based on the techniques in OP-PatchStudio, sixthlaw, buba447, PyTheory and `op-xy-slicer`. fileciteturn13file0L2-L2 fileciteturn15file0L2-L2 fileciteturn28file0L2-L2 fileciteturn26file0L2-L2

Then these become realistic:

> “Turn this recording into a drum rack.”

> “Find the transients and put the strongest 16 hits on the keyboard.”

> “Sample this VST every octave and turn it into an OP‑XY multisample.”

> “Generate a glassy bell instrument for me.”

**Native project compiler**

Wrap `xy-format` behind your own stable API and create native OP‑XY projects instead of leaving the sequence on the host. fileciteturn8file0L2-L2

This unlocks the critical command:

> “Put everything we've made onto the OP‑XY so I can unplug the computer.”

**MTP deployment**

Add project/preset/sample backup and deployment. The official COM workflow exposes MTP for computer file access and explicitly treats it as the mechanism for managing samples, presets and projects. citeturn18view2

Because macOS MTP handling differs from Windows/Linux and Teenage Engineering expects Field Kit there, this subsystem should use platform-specific adapters rather than contaminate the musical core with OS-specific assumptions. citeturn18view2

**MCP and voice**

Only after those device operations are deterministic should they be exposed as MCP tools. MCP is well suited to this because it standardizes tool and resource exposure to AI hosts. citeturn17search1

Speech then becomes merely another input:

```text
speech
 ↓
text
 ↓
same agent
 ↓
same MCP tools
```

### Feasibility matrix for your ultimate vision

| Desired capability | Feasibility now | Best mechanism |
|---|---:|---|
| AI plays the OP‑XY | **High** | USB MIDI |
| AI changes volume/pan/mute | **High** | MIDI CC 7/9/10 |
| AI controls filter/envelopes/engine parameters | **High** | MIDI CC semantic layer |
| AI controls tempo/groove | **High** | CC80/81 |
| AI launches scenes | **High** | CC82–85 |
| AI loads projects | **High** | CC86 |
| AI controls transport | **High** | MIDI realtime transport |
| AI creates host-side sequences | **High** | `op-xy-vibing`-style conductor |
| AI creates **native OP‑XY sequences** | **High but community/reverse-engineered** | `xy-format` |
| AI creates p-locks | **High but community/reverse-engineered** | `xy-format` |
| AI creates step components | **High but community/reverse-engineered** | `xy-format` |
| AI creates scenes/song arrangements | **High but community/reverse-engineered** | `xy-format` |
| AI creates drum presets | **High** | patch/preset builders |
| AI creates multisamples | **High** | patch/preset builders |
| AI automatically slices generated audio | **High off-device** | transient analysis → drum preset |
| AI performs every native slice operation through the screen | **Experimental** | remote-key automation if firmware permits |
| AI reads every physical knob move | **No / partial** | MIDI does not expose all normal-track encoder activity according to current reverse engineering |
| AI reads complete internal state continuously | **Partial** | MIDI + `.xy` parsing + own sent-state cache |
| AI obtains simultaneous native USB stems | **No known direct interface** | sequential mute/solo bounce |
| AI hears and judges output | **High** | USB audio + analysis |
| AI exposes everything to Claude/ChatGPT/etc. via MCP | **High** | new OP‑XY MCP layer |

The distinction between **“High” and “High but community/reverse-engineered”** is important. `.xy` authoring is exceptionally promising, but it is not an official Teenage Engineering SDK. `xy-format` itself uses evidence tiers and device probes precisely because firmware changes can move or reinterpret binary data. fileciteturn25file0L2-L2

### Open questions that should become automated device tests

There are several areas where this investigation found promising evidence but not enough to make them architectural assumptions.

**OS 1.1.33 `.xy` certification.** The latest firmware is newer than several of the reverse-engineering repo's documented probe campaigns. Every generated-project fixture should therefore be regression-tested against 1.1.33 before calling the feature production-safe. citeturn18view0 fileciteturn8file0L2-L2

**CC106/CC107 remote keys.** The current reverse-engineering design has an extensive proposed key map but itself describes firmware-dependent/community disagreement. Probe it on your exact machine and firmware; do not make native UI automation depend upon it. fileciteturn21file0L2-L2

**Complete preset-path writing.** Some preset association operations are implemented through known-good donor/template data rather than a completely abstract high-level filesystem-preset writer. Keep template/donor workflows until this surface is more completely decoded. fileciteturn25file0L2-L2

**Multisampler/slice internals.** Preset generators understand enough to create useful multisample instruments, but the native project representation of every slicing/multisampling function remains less comprehensively mapped than ordinary sequencer notes. fileciteturn8file0L2-L2

**MTP automation on macOS.** Official documentation gives a user-facing MTP/Field Kit workflow, not a public programming API. The application needs its own OS-specific file-transfer adapter or a human-assisted transfer mode. citeturn18view2

### Definitive reading list for the coding agent

This is the corpus I would give the implementation agent before it writes the architecture.

| Priority | Resource |
|---|---|
| **Essential** | https://teenage.engineering/downloads/op-xy |
| **Essential** | https://teenage.engineering/guides/op-xy |
| **Essential** | https://teenage.engineering/guides/op-xy/midi-references |
| **Essential** | https://teenage.engineering/guides/op-xy/com |
| **Essential** | https://teenage.engineering/guides/op-xy/sample |
| **Essential** | https://teenage.engineering/guides/op-xy/auxiliary |
| **Essential** | https://github.com/kmorrill/xy-format |
| **Essential** | https://github.com/kmorrill/xy-format/blob/main/docs/parse_capability_checklist.md |
| **Essential** | https://github.com/kmorrill/xy-format/blob/main/docs/format/decoded_image_map.md |
| **Essential** | https://github.com/kmorrill/xy-format/blob/main/docs/engineering/authoring.md |
| **Essential** | https://github.com/kmorrill/xy-format/blob/main/docs/reference/opxy_midi_cc_map.md |
| **Essential** | https://github.com/kmorrill/op-xy-vibing |
| **Essential** | https://github.com/jshph/opxy-reactive |
| **Essential** | https://github.com/jshph/opxy-reactive/blob/master/DESIGN.md |
| **Essential** | https://github.com/jshph/opxy-reactive/blob/master/AGENT.md |
| **Preset/sampling** | https://github.com/squarewave-studio/op-patchstudio |
| **Preset/sampling** | https://github.com/buba447/opxy-drum-tool |
| **Preset/sampling** | https://github.com/buba447/OPXY-Multisample-Tool |
| **Preset/sampling** | https://github.com/sixthlaw/opxy-multisampler-preset-builder |
| **Preset/sampling** | https://github.com/kennethreitz/pytheory-opxy |
| **Preset format notes** | https://github.com/kennethreitz/pytheory-opxy/blob/main/opxy-preset-notes.md |
| **Slicing** | https://github.com/aliosa27/op-xy-slicer |
| **Drum presets** | https://github.com/niekert/op-xy-drum-builder |
| **Conversion reference** | https://github.com/charlesvestal/sf2-to-opxy |
| **Audio feedback** | https://github.com/om3opr/stembounce |
| **Audio feedback** | https://github.com/mofongo/opxy-stems |
| **Hardware MIDI proof** | https://github.com/buba447/LaunchpadPrefs-OPXY |
| **Controller-mode research** | https://github.com/kazuochi/opxy-deck |
| **MCP architecture precedent** | https://github.com/benjaminr/mcp-koii |
| **Ecosystem index** | https://github.com/bnjreece/awesome-te |
| **Agent/manual corpus idea** | https://github.com/gravitinos/opxy-tutor |
| **MCP specification** | https://modelcontextprotocol.io/ |

The four repositories you originally provided are therefore only one slice of the ecosystem. The most consequential additions are **`xy-format` for native project authoring, `op-xy-vibing` for AI-assisted live composition, `opxy-reactive` for a semantic bidirectional MIDI/agent interface, `op-xy-slicer` for the exact generated-audio slicing workflow you described, and `mcp-koii` as the concrete MCP pattern to adapt**. fileciteturn8file0L2-L2 fileciteturn7file0L2-L2 fileciteturn20file0L2-L2 fileciteturn26file0L2-L2 fileciteturn17file0L2-L2

The resulting application should therefore be conceived not as a MIDI chatbot but as an **OP‑XY operating layer for AI**: one semantic model of a song, one deterministic device service, several backends for MIDI/project/preset/storage/audio, and an MCP interface on top. That architecture is capable of progressing from “play a beat for me” all the way to the goal you described: **speak to an AI, have it create or obtain sounds, slice and map them, design native patterns and parameter locks, construct scenes and songs, deploy the resulting assets to the OP‑XY, audition the hardware output, listen to the result and continue refining the music conversationally.**