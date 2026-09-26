# 40 — Official OP–XY documentation: ingest, inventory, gaps and index design

> Status: complete first pass, 2026-09-26. Owner device: OP–XY OS **1.1.33**. Online guide label: **v1.1.15**.
> Verbatim TE material lives only in the git-ignored `knowledge/official/` and `research/web/te/`.
> Everything in this file is our own summary. Per the owner (2026-09-26), TE is fine with us using the
> manual content **as long as it is reworded**, so the verbatim scrape is source material for our own
> agent-friendly manual (§8), which is what we commit and ship.

## TL;DR

- The whole official corpus is small. The online guide has 24 chapters plus an index/front-matter page:
  **~23.5k words**, 110 sections, 498 "cards" (a title, a key diagram and a caption), 1,170 diagram
  references to **474 unique SVGs**, and two real tables. The OS changelog adds 22 versions
  (1.0.9 → 1.1.33, ~2.7k words). Guide, changelog and specs together come to **~42–49k tokens**, and up to
  ~60k on the newer Claude tokenizer.
- **The whole manual fits in one cached system prompt** (current Opus/Sonnet: 1M context; Haiku 4.5:
  200K). Recommendation: put the full (reworded) manual in the system prompt with prompt caching, and add a
  small in-browser BM25 index (MiniSearch) over section chunks for citations, UI lookup and a
  `search_manual` tool. Embeddings are not worth it at this size.
- The guide is labelled v1.1.15 and matches OS 1.1.15 (2026-07-01). Six OS releases since then
  (1.1.17 → 1.1.33) change behaviour the guide doesn't describe. There are also older gaps and
  internal contradictions (e.g. "nine patterns" vs 16; the "external" engine was renamed "midi" in 1.0.15;
  project transpose "including drums" vs the 1.0.9 change). See §5.
- Scraping was clean and reproducible. The site is a React Router app that embeds each page as a
  turbo-stream JSON layout tree, so `scripts/ingest-guide.mjs` decodes that tree instead of parsing HTML.
  A re-run takes about 2 minutes (images are cached). Each page's `source_sha256` shows when TE edits the guide.
- The community `gravitinos/opxy-tutor` Markdown matches our text about 99%, but it has no images,
  anchors, index page, changelog or specs. It keeps nav text and TE's stray characters, and its §8.2
  captions are wrong (duplicated from §7.1). Its bundled PDF is the **v1.0.9** printed guide from
  2024-11, not 1.1.15.

## 1. What was captured and how

### Sources

| Source                        | URL                                                                                             | What we took                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Guide index (front matter)    | https://teenage.engineering/guides/op-xy                                                        | version label, safety/battery/warranty notes, TOC, box contents, regulatory statements → `guide/00-index.md`           |
| 24 guide chapters             | `https://teenage.engineering/guides/op-xy/<slug>` (list in §2)                                  | full text, headings, anchors, tables, every diagram → `guide/NN-slug.md`                                               |
| Downloads / OS changelog      | https://teenage.engineering/downloads/op-xy                                                     | all 22 versions with ISO dates, firmware file URLs, notes, guide deep links → `changelog.md` + `changelog.json`        |
| Product page                  | https://teenage.engineering/products/op-xy                                                      | "technical specifications" block → `specs.md`                                                                          |
| Store page                    | https://teenage.engineering/store/op-xy                                                         | dimensions (288 × 102 × 29 mm) and weight (900 g) → `specs.md`                                                         |
| Press page                    | https://teenage.engineering/press/op-xy                                                         | 11 original press photos (front/back/side 4096², hero and screen 7000 px, close-ups) → `images/press/`                 |
| field kit guide               | https://teenage.engineering/guides/fieldkit                                                     | macOS MTP app; OP–XY enters MTP via com → M4 → `fieldkit.md`                                                           |
| Sound packs page              | https://teenage.engineering/downloads/op-xy/sound-packs                                         | MTP sample-pack install steps → `sound-packs.md`                                                                       |
| Printable guide PDF           | linked from the index (file `OP-XY_printed guide_v1.1.5 (1).pdf`, labelled v1.1.15, 2026-07-01) | 135 pages, 29.6 MB → `research/web/te/pdf/`. Text is Acrobat OCR (noisy); keep it for layout and visual reference only |
| Declaration of conformity PDF | linked from regulatory statements                                                               | → `research/web/te/pdf/`                                                                                               |

Not fetched: `/support/*` (disallowed by robots.txt) and `/apps/field-kit` (404; the live page is `/guides/fieldkit`). The
site map lists exactly the 24 chapter pages the index links to, so there are no hidden chapters. **There is no chapter 13**:
TE's own numbering jumps from 12 to 14, in the web TOC and in the PDF.

### How the site works (the key to a faithful scrape)

- Pages are server-rendered by React Router. The content is in the HTML as a **turbo-stream** payload
  (`window.__reactRouterContext.streamController.enqueue("…")`), and the script decodes it into plain JSON. There is no
  separate API.
- The page body is a layout tree from TE's CMS ("te013"): nodes `{t, a, c}`, where `t` is one of
  `box | txt | svg | cond | table | video | player | …`. `txt` nodes hold rich text `{it: sp|tx|br|ul|ol|li, cls, lnk}`.
  The script ports the renderer's own rules. Top-level spans are `display:block`. Consecutive spans with the same
  style merge with `<br>`. `cond` blocks marked mobile-only are skipped (their images are still archived).
- Headings are just CSS classes (`xl` = section, `l` = card title). Anchors are box ids, and the section id sometimes
  sits just _before_ a heading and sometimes just _after_ it. The script resolves both.
- Tables are grids of bordered boxes. Only two exist: the MIDI CC table and the step-component reference.
- **Every guide diagram is an SVG** (text outlined to paths, so there is no alt text). The site recolours them at render
  time, and we keep `<asset>_original.svg` (vector, so no resolution concern). `images/manifest.json` records, for each
  image, every use: chapter, section, anchor, card title, caption, colour and transform. The CDN pattern is
  `https://assets.teenage.engineering/_img/<current>_<suffix>`.
- The "2. layout" page overlays 14 clickable regions and 14 numbered callouts on the full-panel diagram. The script
  recovers their rectangles by simulating the page's float layout and writes `images/layout-hotspots.json`. We checked it
  against live browser rendering: **all 14 rectangles matched exactly**. This is a direct input for the replica
  (region → guide section).

### Outputs

| Path                                     | Committed?   | Content                                                                                                                                                                |
| ---------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/ingest-guide.mjs`               | yes          | Re-runnable scraper/converter (Node ≥ 20, no deps). `--offline` rebuilds from the raw cache; `--no-assets` skips downloads                                             |
| `research/web/te/`                       | no (ignored) | raw HTML + decoded JSON per page, `sitemap.txt`, renderer JS/CSS used for reverse-engineering, PDFs                                                                    |
| `knowledge/official/guide/NN-slug.md`    | no (ignored) | 25 files, YAML front-matter (title, chapter, source_url, guide_version, fetched_at, source_sha256, words, tokens_est, images, sections with anchors and URLs, anchors) |
| `knowledge/official/images/`             | no (ignored) | 474 SVGs (5.4 MB), `press/` (11 photos, 52 MB), `manifest.json`, `layout-hotspots.json`                                                                                |
| `knowledge/official/changelog.{md,json}` | no (ignored) | full changelog                                                                                                                                                         |
| `knowledge/official/specs.md`            | no (ignored) | product, store and guide specs, box contents, regulatory IDs, discrepancies                                                                                            |
| `knowledge/official/chunks.jsonl`        | no (ignored) | 159 section-level retrieval units with metadata (see §6)                                                                                                               |
| `knowledge/official/index.json`          | no (ignored) | corpus stats, chapter list, per-page hashes, warnings                                                                                                                  |

Fidelity notes: navigation ("back to index", "next/previous chapter") is removed. Three stray one-character CMS
artifacts are dropped and logged ("§" in layout; "|" and "z" in tempo). TE's own typos and copy errors are **kept**
(see §5.3).

Re-run: `node scripts/ingest-guide.mjs`. It fetches about 33 pages with a 1 s delay and reuses already-downloaded
images and PDFs. Compare `source_sha256` or the guide label in `index.json` to detect TE updates.

## 2. Chapter inventory

Counts: words · H2 sections · cards (H3) · diagram references. Summaries are ours.

| #   | Chapter                                                                         | Size                 | Summary                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00  | [index / front matter](https://teenage.engineering/guides/op-xy)                | 1,804 w · 2 · 2 · 7  | Guide cover: version label and printable-PDF link; safety, charging, temperature and cleaning notes; warranty. Then the chapter index, the four items in the box, the regulatory block (model **TE033AS001**, FCC/ISED IDs, 2.4 GHz band, 10 dBm EIRP, SAR values) and a licence notice for the bundled sounds.                                                                                                                                                |
| 01  | [hardware overview](https://teenage.engineering/guides/op-xy/hardware-overview) | 483 · 5 · 0 · 8      | Physical tour: power switch, USB-C charging (charge at least every 6 months), speaker and volume, pressure-sensitive pitchbend. Right-side I/O: line out; multi-out with six modes (MIDI, CV+gate, sync8/16/24, audio); TRS MIDI in; line in. Mic and level meter (hold com to show battery). Ends with the spec list and electrical characteristics.                                                                                                          |
| 02  | [layout](https://teenage.engineering/guides/op-xy/layout)                       | 842 · 14 · 14 · 31   | Annotated top-panel diagram with 14 numbered regions, then one short section per control group: 4 main modes, M1–M4, 8 track buttons, 16-step sequencer, transport (record/play/stop/minus/plus/shift), 24-key keyboard, sample, projects, tempo, com, players, bar, volume, four grayscale encoders. This is the replica's control inventory.                                                                                                                 |
| 03  | [guide conventions](https://teenage.engineering/guides/op-xy/guide-conventions) | 149 · 0 · 11 · 14    | Legend of the press types shown in the diagrams: single, combo (hold + press), sequence, hold, rotate/click encoder, hold + rotate, "all encoders", keyboard notes, chords. This is the basis for our key notation (§4).                                                                                                                                                                                                                                       |
| 04  | [get started](https://teenage.engineering/guides/op-xy/get-started)             | 1,171 · 4 · 0 · 70   | Four-step tutorial from a new project (default sounds on tracks 1–8): step-sequence a drum beat (single-sound view, a multiply component), live-record a bassline (arming, adding bars, clearing, automation and smoothing), add chords at a slower track scale, then perform punch-in FX.                                                                                                                                                                     |
| 05  | [main modes and modules](https://teenage.engineering/guides/op-xy/main-modes)   | 264 · 2 · 8 · 11     | The four modes as stages of a track (instrument = compose, auxiliary, arrange, mix) and the M1–M4 module pages inside each mode. Holding shift reveals extra parameters.                                                                                                                                                                                                                                                                                       |
| 06  | [track buttons](https://teenage.engineering/guides/op-xy/track-buttons)         | 201 · 2 · 3 · 8      | 8 buttons address 8 instrument tracks and 8 auxiliary tracks (lit white vs red). shift + track picks a preset. Holding one track button and pressing others links up to four tracks.                                                                                                                                                                                                                                                                           |
| 07  | [sequencer](https://teenage.engineering/guides/op-xy/sequencer)                 | 1,448 · 4 · 31 · 81  | Core sequencing: key → step, chords, edit/extend/nudge steps, single-sound view, sequence shift (rotate trigs, 1.1.15), p-locks, clear, undo, copy step, octave shift. Live recording (arm, overdub, automation, record lock, count-in) and step recording. The bar menu: track scale, up to 4 bars, duplicate, sequence length, quantisation, note length, groove, shape/smoothing, clear notes/params/all, lock bar screen.                                  |
| 08  | [step components](https://teenage.engineering/guides/op-xy/step-components)     | 1,257 · 4 · 7 · 38   | Per-step modifiers: add with shift + steps + a natural key, choose the value with an accidental, remove the same way. Describes the 14 components (pulse, pulse hold, multiply, velocity, ramp up/down, random, portamento, bend, tonality, jump, skip parameter/component/trig). A 14 × 10 reference table gives each accidental's value.                                                                                                                     |
| 09  | [players](https://teenage.engineering/guides/op-xy/players)                     | 359 · 3 · 13 · 26    | Per-track players, toggled with the player key (shift + player changes style). Arpeggio: speed, pattern, range, hold, and a shift layer for note length, style, glide and stereo. Maestro: record a chord with shift + keys, then transpose it by playing. Hold: latch notes until the next note.                                                                                                                                                              |
| 10  | [project](https://teenage.engineering/guides/op-xy/project)                     | 680 · 3 · 20 · 26    | Project view (M1 new, M2 save/version, shift + M2 save as, M3 rename, M4 configure, hold M4 delete). Projects folder (factory, user, templates, autosaves, history). System usage indicators for voices, CPU and sample memory (1.1.15). Project settings: general transpose, tempo/time signature, allocation of the 24 voices, per-track MIDI channels.                                                                                                      |
| 11  | [tempo](https://teenage.engineering/guides/op-xy/tempo)                         | 287 · 2 · 12 · 14    | Tempo screen: tap tempo, BPM, groove type, swing/shuffle amount, metronome level and on/off. Describes the seven grooves (shuffle, half shuffle, bombora, wobbly, gaussian, accents, island nod).                                                                                                                                                                                                                                                              |
| 12  | [workflow](https://teenage.engineering/guides/op-xy/workflow)                   | 210 · 2 · 0 · 2      | Concept model (patterns ≤ 120 notes, 99 scenes, songs, projects) and a suggested song-building flow. Still says **nine** patterns per track, which is stale (16 since 1.1.15).                                                                                                                                                                                                                                                                                 |
| 14  | [instrument](https://teenage.engineering/guides/op-xy/instrument)               | 2,213 · 6 · 82 · 136 | The four instrument modules. M1 engine (shift + M1 to choose). M2 amp/filter envelopes plus play mode, portamento, bend range, preset volume. M3 filter (shift + M3 changes type; shift layer holds sends to aux out, tape, FX I/II). M4 LFO with five types (duck, element, random, tremolo, value). Preset settings (mod routing, tunings). Preset browser (folders, cut/paste/rename/delete; hold a track button + M1–M4 to scramble, copy, paste or save). |
| 15  | [auxiliary](https://teenage.engineering/guides/op-xy/auxiliary)                 | 2,243 · 7 · 59 · 154 | The 8 aux tracks: T1 brain (auto/manual key detection, transposes routed tracks), T2 punch-in FX (also playable with shift + keys on any instrument track), T3 external MIDI (channel/bank/program, 8 CCs, LFO), T4 external CV (tip = CV, ring = gate), T5 external audio (input, drive/level/mix, routing), T6 tape (re-play and mangle internal audio), T7/T8 FX I/II sends.                                                                                |
| 16  | [arrange](https://teenage.engineering/guides/op-xy/arrange)                     | 848 · 4 · 27 · 39    | Patterns per track (M1 new, M2 copy, M3 paste, M4 remove; max 16), sound link and link track. Scenes: 99, selected with shift + accidentals, with clone/copy/paste/reset and queued (delayed) switching. Song mode: up to 96 scene slots, several songs on the naturals, song copy/paste.                                                                                                                                                                      |
| 17  | [mix](https://teenage.engineering/guides/op-xy/mix)                             | 694 · 5 · 26 · 58    | M1: per-track level, pan and FX I/II sends; mute (shift + track, or hold instrument/auxiliary + track); solo (hold track). M2 master EQ (low/mid/high/blend, click to reset). M3 master saturator. M4 master (percussion/melodic group levels, compressor, output level). Signal-flow diagram.                                                                                                                                                                 |
| 18  | [sample](https://teenage.engineering/guides/op-xy/sample)                       | 2,218 · 4 · 88 · 147 | Sampling from any screen (source, channel, gain, threshold). One-shot synth sampler (points, direction, tune, crossfade, gain, loop type). Drum sampler (24 keys, per-key edit, copy/paste, multi-select, slicing with transient/even/tap modes from 1.1.0). Multisampler (zones). Sample library browser.                                                                                                                                                     |
| 19  | [com](https://teenage.engineering/guides/op-xy/com)                             | 834 · 5 · 28 · 40    | COM hub: multi-out mode and BLE MIDI. System settings: system, keyboard velocity and detune, MIDI clock/notes/echo, clock, pitchbend calibration, battery, MIDI monitor. MIDI controller mode (channel, knob mode, octave keys). Devices list. MTP mode (M4).                                                                                                                                                                                                  |
| 20  | [synth engines](https://teenage.engineering/guides/op-xy/synth-engines)         | 1,004 · 9 · 36 · 92  | Character and encoder map of the 8 engines (axis, dissolve, epiano, hardsync, organ, prism, simple, wavetable). Also "external", which turns an instrument track into a MIDI track; the changelog renamed it "midi" in 1.0.15.                                                                                                                                                                                                                                 |
| 21  | [fx](https://teenage.engineering/guides/op-xy/fx)                               | 726 · 6 · 25 · 53    | The six send effects for FX I/II (chorus, delay, distortion, lofi, phaser, reverb) with every encoder's role. Picked with shift + FX track.                                                                                                                                                                                                                                                                                                                    |
| 22  | [how to](https://teenage.engineering/guides/op-xy/how-to)                       | 3,138 · 12 · 3 · 107 | Twelve recipes: velocity; MIDI synth; CV/gate; vintage drum-machine sync; pocket operator sync; external FX loop; MIDI keyboard (incl. mod wheel/aftertouch routing); USB audio interface; pitchbend as mod source; backup; loading samples; writing a song fast with brain.                                                                                                                                                                                   |
| 23  | [midi cc reference](https://teenage.engineering/guides/op-xy/midi-references)   | 99 · 0 · 0 · 0       | A 12-row CC table: track volume 7, mute 9, pan 10, "track parameters" 46, tempo 80, groove 81, delayed scene 82, previous/next scene 83/84, scene 85, project 86, eq 90. **Not a full CC map.**                                                                                                                                                                                                                                                                |
| 24  | [te boot](https://teenage.engineering/guides/op-xy/te-boot)                     | 288 · 5 · 1 · 8      | Bootloader: hold com at power-on. T1 firmware update (mass storage), T7 factory reset, T8 function test / system menu (incl. volume-pot recalibration). Power-cycle to exit.                                                                                                                                                                                                                                                                                   |
| 25  | [credits](https://teenage.engineering/guides/op-xy/credits)                     | 66 · 0 · 2 · 0       | Testers and content contributors.                                                                                                                                                                                                                                                                                                                                                                                                                              |

Extras: [field kit](https://teenage.engineering/guides/fieldkit) (340 words, together with sound packs),
[sound packs](https://teenage.engineering/downloads/op-xy/sound-packs), specs (product/store/guide).

## 3. Size and context budget

| Set                             |      Words |        Chars (no image refs) |                                                                  Tokens (est.) |
| ------------------------------- | ---------: | ---------------------------: | -----------------------------------------------------------------------------: |
| Guide, 25 pages                 |     23,378 | 147.6k (136.9k without URLs) |                                                                        36k–41k |
| Guide without index/credits     |     21,527 |                       126.0k |                                                                        33k–38k |
| Changelog (22 versions)         |      2,715 |                        20.3k |                                                                      4.8k–5.5k |
| Specs + field kit + sound packs |        833 |                         6.0k |                                                                      1.4k–1.6k |
| **Everything**                  | **26,926** |                     **174k** | **42k–49k** (≈60k on the Opus 4.7+ tokenizer, which uses ~1–1.35× more tokens) |

Estimates use 3.3–3.8 characters per token. **Measure exactly with `POST /v1/messages/count_tokens`** against the model the
app uses (counts are model-specific). We did not call the API here, to avoid using the owner's key. The raw
Markdown is 259k characters including image refs and anchors, but those are for the UI and should be stripped from
prompt text. Diagrams: 1,170 references to 474 unique SVGs (5.4 MB). Chunks: 159 (median ~160 tokens, p90 ~550).

## 4. Key combos (replica "how-to" data)

Notation (proposed for our manual and the replica's animation engine):

- `A + B`: hold A, press B (TE's "combo press"). `A + B + C`: hold A and B, press C.
- `A → B`: press A, then press B (TE's "sequence press"). `hold A`: long press.
- `turn E1…E4` / `click E1…E4`: encoders left to right = dark gray, mid gray, light gray, white.
  `shift + turn E2` = hold shift while turning E2.
- `T1…T8` = track buttons. `step n` = sequencer step n (1–16). `key` = any keyboard key.
  `natural` / `accidental` = white / black keys. `[-]` / `[+]` = the minus/plus buttons.
- In auxiliary mode: T1 brain, T2 punch-in FX, T3 external MIDI, T4 external CV, T5 external audio, T6 tape,
  T7 FX I, T8 FX II. T1, T2, T3, T5, T6, T7 and T8 are stated in the guide; T4 follows from the section order.

**System, modes, tracks**

| Action                                         | Keys                                           | §                                                                                                                                                                  |
| ---------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Show battery level on the meter                | `hold com`                                     | [1.3](https://teenage.engineering/guides/op-xy/hardware-overview#inputs-outputs)                                                                                   |
| Enter a main mode                              | `instrument` / `auxiliary` / `arrange` / `mix` | [5.1](https://teenage.engineering/guides/op-xy/main-modes)                                                                                                         |
| Switch module page                             | `M1`…`M4`                                      | [5.2](https://teenage.engineering/guides/op-xy/main-modes)                                                                                                         |
| Show a page's extra (shift-layer) parameters   | `hold shift`                                   | [5.2](https://teenage.engineering/guides/op-xy/main-modes)                                                                                                         |
| Select track                                   | `T1`…`T8`                                      | [6.1](https://teenage.engineering/guides/op-xy/track-buttons)                                                                                                      |
| Pick preset / sample pack / engine for a track | `shift + Tn`                                   | [6.1](https://teenage.engineering/guides/op-xy/track-buttons), [14.6](https://teenage.engineering/guides/op-xy/instrument#view-and-create-preset)                  |
| Link up to 4 tracks                            | `Tn + Tm (+ …)` (hold the leading track)       | [6.2](https://teenage.engineering/guides/op-xy/track-buttons)                                                                                                      |
| Toggle instrument/aux tracks in arrange or mix | `arrange` (in arrange) / `mix` (in mix)        | [16.1](https://teenage.engineering/guides/op-xy/arrange#switching-tracks-and-patterns), [17.1](https://teenage.engineering/guides/op-xy/mix#levels-pans-and-sends) |
| Undo (one level)                               | `shift + record`                               | [7.1](https://teenage.engineering/guides/op-xy/sequencer#step-sequencing)                                                                                          |
| Octave down/up (keyboard)                      | `[-]` / `[+]`                                  | [2](https://teenage.engineering/guides/op-xy/layout#transport-controls)                                                                                            |
| Stop, then stop again to silence all           | `stop` → `stop`                                | [2](https://teenage.engineering/guides/op-xy/layout#transport-controls)                                                                                            |
| Play from start (second press)                 | `play` → `play`                                | [2](https://teenage.engineering/guides/op-xy/layout#transport-controls)                                                                                            |
| Tap tempo                                      | `tempo` (tap repeatedly)                       | [11](https://teenage.engineering/guides/op-xy/tempo)                                                                                                               |

**Sequencer and bar**

| Action                                              | Keys                                                  | §                                                                                                                |
| --------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Step-enter last played note                         | `key` → `step n`                                      | [7.1](https://teenage.engineering/guides/op-xy/sequencer#step-sequencing)                                        |
| Enter a chord on a step                             | `key + key + … + step n`, or `step n + keys`          | 7.1                                                                                                              |
| Inspect / edit a step's notes                       | `hold step n`; `step n + key` toggles that note       | 7.1                                                                                                              |
| Extend note length (press again: full/overlap)      | `step n + step m`                                     | 7.1                                                                                                              |
| Nudge step off-grid (needs quantise < 100)          | `step n + [-]/[+]`                                    | 7.1                                                                                                              |
| View/sequence one sound only                        | `key + record`, or `key + step n`                     | 7.1                                                                                                              |
| Shift (rotate) the track's sequence                 | `Tn + [-]/[+]`                                        | [7.1 #rotate-trigs-functionality](https://teenage.engineering/guides/op-xy/sequencer#rotate-trigs-functionality) |
| Parameter lock                                      | `step n + turn E1…E4`                                 | 7.1                                                                                                              |
| Copy / paste a step                                 | `hold step n` (copy) → release → `step m` (empty)     | 7.1                                                                                                              |
| Clear track                                         | `record + stop` (hold until LEDs fill)                | 7.1, 7.3                                                                                                         |
| Sequence octave (synth) / semitone (drum)           | `shift + [-]/[+]`                                     | 7.1                                                                                                              |
| Live record                                         | `record + play`                                       | [7.2](https://teenage.engineering/guides/op-xy/sequencer#live-recording)                                         |
| Overdub while playing / automate a knob             | `hold record` (+ `turn E1…E4`)                        | 7.2                                                                                                              |
| Latch record mode                                   | `record + play` while playing                         | 7.2                                                                                                              |
| Count-in before recording                           | `record + play` → `play`                              | 7.2                                                                                                              |
| Step record (stopped); skip / back a step           | `hold record` + keys; `record + [+]` / `record + [-]` | [7.3](https://teenage.engineering/guides/op-xy/sequencer#step-recording)                                         |
| Track scale                                         | `bar + accidental`                                    | [7.4](https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar)                                        |
| Add / remove bar (max 4)                            | `bar + [+]` / `bar + [-]`                             | 7.4                                                                                                              |
| Duplicate current bar                               | `bar + shift + [+]`                                   | 7.4                                                                                                              |
| Sequence length (steps in last bar)                 | `bar + step n`                                        | 7.4                                                                                                              |
| Switch visible bar                                  | `bar` (tap)                                           | 7.4                                                                                                              |
| Quantise / note length / groove / shape (smoothing) | `bar + turn E1` / `E2` / `E3` / `E4`                  | 7.2, 7.4                                                                                                         |
| Clear notes / p-locks / everything in pattern       | `bar + M1` / `bar + M2` / `bar + M4`                  | 7.4                                                                                                              |
| Lock the bar screen open                            | `shift + bar`                                         | 7.4                                                                                                              |

**Step components and players**

| Action                                   | Keys                                                                                             | §                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Add a step component                     | `shift + step n (…)` → `+ natural` (component) → `+ accidental` (value), all while holding shift | [8.2](https://teenage.engineering/guides/op-xy/step-components#adding-step-components-to-a-sequence) |
| Remove a step component                  | `shift + step n + same natural`                                                                  | 8.2                                                                                                  |
| Open / enable player                     | `player` → `player`                                                                              | [9](https://teenage.engineering/guides/op-xy/players#players)                                        |
| Change player type                       | `shift + player`                                                                                 | 9                                                                                                    |
| Arp speed / pattern / range / hold       | `turn E1` / `E2` / `E3` / `E4`                                                                   | [9.1](https://teenage.engineering/guides/op-xy/players#arpeggio)                                     |
| Arp note length / style / glide / stereo | `shift + turn E1` / `E2` / `E3` / `E4`                                                           | 9.1                                                                                                  |
| Record a maestro chord                   | `shift + keys`                                                                                   | [9.2](https://teenage.engineering/guides/op-xy/players#maestro)                                      |
| Release held notes (hold player)         | `stop`, or `player` to disable                                                                   | [9.3](https://teenage.engineering/guides/op-xy/players#hold)                                         |

**Instrument tracks and presets**

| Action                                               | Keys                                             | §                                                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Choose engine (synth, drum, sampler, MIDI)           | `shift + M1`                                     | [14.1](https://teenage.engineering/guides/op-xy/instrument#engine), [20](https://teenage.engineering/guides/op-xy/synth-engines) |
| Amp ↔ filter envelope                                | `click E1…E4` (on M2)                            | [14.2](https://teenage.engineering/guides/op-xy/instrument#envelopes)                                                            |
| Play mode / portamento / bend range / preset volume  | `hold shift` on M2 + `turn E1…E4`                | 14.2                                                                                                                             |
| Change filter type                                   | `shift + M3`                                     | [14.3](https://teenage.engineering/guides/op-xy/instrument#filter)                                                               |
| Track sends (aux out, tape, FX I, FX II)             | `hold shift` on M3 + `turn E1…E4`                | 14.3                                                                                                                             |
| Change LFO type                                      | `shift + M4`                                     | [14.4](https://teenage.engineering/guides/op-xy/instrument#lfo)                                                                  |
| LFO sub-functions                                    | `click E1…E4`, or `shift + turn E1…E4`           | 14.4                                                                                                                             |
| Preset settings (mod routing, tuning)                | `shift + instrument`                             | [14.5](https://teenage.engineering/guides/op-xy/instrument#preset-settings)                                                      |
| Scramble / copy / paste / save a track's sound       | `Tn + M1` / `Tn + M2` / `Tn + M3` / `Tn + M4`    | [14.6](https://teenage.engineering/guides/op-xy/instrument#view-and-create-preset)                                               |
| Save to the same snapshot instead of a new one       | shift variant of save (1.1.17, **not in guide**) | changelog 1.1.17                                                                                                                 |
| Preset browser: new / rename / delete (empty) folder | `shift + M1` / `shift + M3` / `shift + M4`       | 14.6                                                                                                                             |

**Auxiliary, FX, sampling**

| Action                                            | Keys                                         | §                                                                                                                            |
| ------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Punch-in FX from any instrument track             | `shift + key` (record with `record` running) | [15.2](https://teenage.engineering/guides/op-xy/auxiliary#punch-in-fx)                                                       |
| Enable/select a MIDI CC on external MIDI          | `shift + turn E1…E4`                         | [15.3](https://teenage.engineering/guides/op-xy/auxiliary#external-midi)                                                     |
| Aux-track sends: tape / FX I / FX II              | `shift + turn E2` / `E3` / `E4`              | 15.5–15.6                                                                                                                    |
| Choose the effect in a send slot                  | `shift + T7` (FX I) / `shift + T8` (FX II)   | [15.7](https://teenage.engineering/guides/op-xy/auxiliary#fx-i-and-fx-ii), [21](https://teenage.engineering/guides/op-xy/fx) |
| FX I → FX II send                                 | on T7: `shift + turn E4`                     | 15.7                                                                                                                         |
| Sample from any screen; record                    | `sample`; `hold M1`                          | [18](https://teenage.engineering/guides/op-xy/sample)                                                                        |
| Leave sample mode                                 | press the lit track button                   | 18                                                                                                                           |
| Input channel                                     | `shift + turn E1`                            | 18                                                                                                                           |
| Direction / tune / crossfade (or pan/fade) / gain | `shift + turn E1` / `E2` / `E3` / `E4`       | [18.1](https://teenage.engineering/guides/op-xy/sample#one-shot-synth-sampler)–18.3                                          |
| Loop type                                         | `shift + click E3`                           | 18.1, 18.3                                                                                                                   |
| Drum sampler: copy / paste / multi-select a key   | `key + M2` / `key + M3` / `key + M4`         | [18.2](https://teenage.engineering/guides/op-xy/sample#drum-sampler)                                                         |
| Slice the sample on a key; delete a slice         | `key + M1`; `shift + key`                    | [18.2 #sample-slicer](https://teenage.engineering/guides/op-xy/sample#sample-slicer)                                         |
| Sample library                                    | `shift + sample`                             | [18.4](https://teenage.engineering/guides/op-xy/sample#sample-folder)                                                        |
| Browse samples for a key                          | `key + sample` (1.1.0, **not in guide**)     | changelog 1.1.0                                                                                                              |

**Arrange, song, mix**

| Action                                     | Keys                                                                 | §                                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| New / copy / paste / remove pattern        | `M1` / `M2` / `M3` / `M4` (in arrange)                               | [16.2](https://teenage.engineering/guides/op-xy/arrange#edit-controls)                 |
| Move between patterns / mute track         | `turn E4` / `click E4`                                               | [16.1](https://teenage.engineering/guides/op-xy/arrange#switching-tracks-and-patterns) |
| Sound link on/off                          | `turn E3` or `click E3`                                              | [16.1 #sound-link](https://teenage.engineering/guides/op-xy/arrange#sound-link)        |
| Choose link source pattern                 | `turn E4` (select) → `shift + turn/click E3`                         | 16.1                                                                                   |
| Select scene 1–9 / 10–99                   | `shift + accidental`; `shift + d#` → digits on accidentals           | [16.3](https://teenage.engineering/guides/op-xy/arrange#scenes)                        |
| Clone / copy / paste / reset scene         | `shift + M1` / `M2` / `M3` / `M4`                                    | 16.3                                                                                   |
| Queue next scene (delayed switch)          | `shift + play` → `accidental`                                        | 16.3                                                                                   |
| Enter song mode                            | `shift + arrange` (in arrange)                                       | [16.4](https://teenage.engineering/guides/op-xy/arrange#song-mode)                     |
| Add scenes to song order                   | `shift + accidentals`                                                | 16.4                                                                                   |
| Clear song order / navigate / delete scene | `shift + M1` / `shift + M2, M3` / `shift + M4`                       | 16.4                                                                                   |
| Select song; copy / paste song             | `shift + natural`; then `M2` / `M3`                                  | 16.4                                                                                   |
| Cue a future scene while playing           | `shift + [-]/[+]`                                                    | 16.4                                                                                   |
| Mute / unmute track                        | `shift + Tn` (in mix); shortcut `instrument + Tn` / `auxiliary + Tn` | [17.1](https://teenage.engineering/guides/op-xy/mix#levels-pans-and-sends)             |
| Solo track(s)                              | `hold Tn (…)` in mix                                                 | 17.1                                                                                   |
| Reset EQ band / all EQ                     | `click E1…E3` / `click E4` (on M2)                                   | [17.2](https://teenage.engineering/guides/op-xy/mix#eq)                                |

**Project, tempo, COM, TE boot**

| Action                                                           | Keys                                                                     | §                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Project view: new / save (version) / rename / configure / delete | `hold M1` / `M2` / `M3` / `M4` / `hold M4`                               | [10.1](https://teenage.engineering/guides/op-xy/project#rename)            |
| Save as                                                          | `shift + M2`                                                             | 10.1                                                                       |
| Projects folder (factory, user, templates, autosaves)            | `shift + project`                                                        | [10.2](https://teenage.engineering/guides/op-xy/project#project-folder)    |
| Tempo / groove type / swing-shuffle / metronome                  | `tempo` → `turn E1` / `E2` / `E3` / `E4` (`click E4` = metronome on/off) | [11.1](https://teenage.engineering/guides/op-xy/tempo#edit-tempo)          |
| COM: system settings / MIDI controller / devices / MTP           | `com` → `M1` / `M2` / `M3` / `M4`                                        | [19](https://teenage.engineering/guides/op-xy/com)                         |
| Controller mode: channel / knob mode / octave keys; exit         | `shift + turn E1` / `E2` / `E3`; `shift + com`                           | [19.3](https://teenage.engineering/guides/op-xy/com#midi-controller-moder) |
| MTP eject                                                        | `M4` (in MTP)                                                            | [19.5](https://teenage.engineering/guides/op-xy/com#mtp)                   |
| Enter TE boot                                                    | `hold com` while switching power on                                      | [24](https://teenage.engineering/guides/op-xy/te-boot)                     |
| TE boot: firmware update / factory reset / function test         | `T1` / `T7` / `T8`                                                       | 24.1–24.3                                                                  |
| Reset volume-pot calibration                                     | `T8` → `M2` (or `T2`)                                                    | 24.3 (second)                                                              |

That is 95 rows. The same notation, applied to all ~250 encoder mappings (248 "rotate the … knob" sentences in the
guide), fills the `parameters` blocks of §8.

## 5. Guide (v1.1.15) vs firmware (OS 1.1.33)

The guide label v1.1.15 and the printable PDF (created 2026-07-01) line up with OS 1.1.15 (2026-07-01). The 1.1.15
changelog even links underlined items to new guide anchors (`project#system-usage-indicators`,
`project#project-folder`, `sequencer#rotate-trigs-functionality`, `com#midi-monitor`). All seven changelog deep links
resolve to anchors in our scrape. Six OS releases have shipped since.

### 5.1 Post-1.1.15 changes the guide doesn't reflect

| OS     | Change (paraphrased)                                                                                                                | Guide status                                                                                                          | Chapter   |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------- |
| 1.1.17 | save to the same preset snapshot instead of a new one (hold shift)                                                                  | missing (save preset only shows `Tn + M4`)                                                                            | 14        |
| 1.1.17 | "make default" option for project templates                                                                                         | missing (templates only via MTP)                                                                                      | 10        |
| 1.1.17 | system setting for sample preview                                                                                                   | missing from system-settings list                                                                                     | 19        |
| 1.1.17 | sustain pedal no longer affects arpeggio notes                                                                                      | the sustain pedal (added in 1.1.15) is **not documented at all**                                                      | 9, 14, 19 |
| 1.1.21 | rotating a sequence also rotates step components and p-locks                                                                        | "sequence shift" describes notes only                                                                                 | 7         |
| 1.1.21 | simplified global transpose                                                                                                         | the guide calls it project "general" transpose; wording and semantics unverified                                      | 10        |
| 1.1.21 | held arp notes stop on pattern switch                                                                                               | behaviour detail absent                                                                                               | 9         |
| 1.1.25 | quantisation grid for odd track scales (x3, x5, x6, x7)                                                                             | the track-scale list (1, 2, 3, 4, 6, 8, 16, 1/2) lacks 5, 7, 1/5, 1/7 (1/5 and 1/7 are named in the 1.0.15 changelog) | 7         |
| 1.1.25 | a new pattern inherits the current player type                                                                                      | missing                                                                                                               | 16, 9     |
| 1.1.25 | voice-stealing indicator reworked (shows all audible steals)                                                                        | the guide's description ("blinks red", visible at ≥17 voices) may be stale                                            | 10        |
| 1.1.25 | hold player stops with a normal note-off and release                                                                                | behaviour detail absent                                                                                               | 9         |
| 1.1.32 | fixes only (sequencer stalls while browsing, USB start-up, components cleared while holding a step, aux LFO UI, MIDI engine vs arp) | n/a (no doc change)                                                                                                   | —         |
| 1.1.33 | fix: couldn't add p-locks to empty steps                                                                                            | n/a, but the agent should know it works on ≥ 1.1.33                                                                   | 7         |

### 5.2 Older gaps and contradictions (true even for 1.1.15)

- **Engine naming:** the changelog renamed the "external" engine to "midi" in 1.0.15. §20.4 and how-to §22.2 still say
  "external", and 1.1.x changelogs call it the "MIDI engine".
- **Patterns per track:** §12.1 says nine and §16.2 says 16 (the 1.1.15 change). The product page also still says
  "9 patterns per track".
- **Project transpose:** §10.3 says it includes drums, but the 1.0.9 changelog stopped applying global transpose to
  drums. Verify on the device.
- **Undocumented features:** the sustain pedal (1.1.15), the scene-length calculation project setting (1.1.0),
  browsing samples with key + sample (1.1.0), accelerometer modulation (product page only; no guide text), and the
  filter type names (no guide text names the filter types).
- **MIDI CC map:** the official table has 12 rows ("track parameters: 46" is ambiguous). Full per-parameter CCs
  must come from community research and device probing (see `00-initial-deep-research.md`, CC106/107).
- **Display:** the product page says 480 × 222 px; guide §1.4 says 480 × 220.

### 5.3 TE errata we keep verbatim (and our manual must not copy)

- The index TOC lists 22.1–22.11, but the how-to chapter has 22.12. te-boot has two sections numbered 24.3, and the
  function test and pot-reset both say "track button 8".
- Caption copy errors. Instrument "track send" says "modify the play mode". Sample "pan" describes tuning and
  "sample fade" describes loop crossfade. Guide conventions has two "sequence press" cards and swapped keyboard captions.
  The fx "distortion" card repeats its first sentence.
- The step-component table's multiply row gives "divide into 3 trigs" for key 9. The sound-packs page says
  com → **T4** for MTP, while field kit and §19 say **M4** (T4 is OP–1 field naming).
- The downloads page's anchor for 1.0.29 is `#1.0.28` (box-id typo). The "click to download" text link on the index
  points to the **v1.1.0** PDF; the surrounding box links the 1.1.15 file.

### 5.4 Chapters to treat as out of date for OS 1.1.33

`07 sequencer` (track scales, rotate semantics), `09 players` (sustain, hold/arp details), `10 project` (templates,
transpose, voice indicator), `12 workflow` (nine patterns), `14 instrument` (snapshot save, sustain), `16 arrange`
(player inheritance), `19 com` (sample-preview setting, sustain pedal), `20 synth engines` ("external" → "midi"),
`23 midi references` (incomplete). The agent must layer changelog facts newer than 1.1.15 over the guide and say so
when it does.

## 6. Index / RAG design for a browser-only app

**Recommendation: full-context first, lexical index second, no embeddings (for now).**

1. **Whole manual in the cached system prompt.** At ~45–60k tokens (our reworded manual will be similar or smaller),
   the full manual plus the post-1.1.15 changelog digest fits easily in current Opus/Sonnet (1M) and Haiku 4.5 (200K).
   Layout: `tools` → `system: [instructions][manual bundle]` with **one explicit `cache_control` breakpoint at the end
   of the manual**. Volatile context (device firmware, connected state, the user's question) goes _after_ that
   breakpoint, and automatic caching covers the growing conversation.
   - Caching facts to design around: default TTL 5 min (optional 1 h); max 4 breakpoints; cache reads ≈ 0.1× input
     price; writes 1.25× (5 min) or 2× (1 h). A 5-minute cache pays off from the second request. The minimum cacheable
     prefix is 512–4096 tokens depending on model, far below our size. Caches are per workspace **and per model**, so
     letting users switch models means a separate cache write per model.
   - Warm on app open with a `max_tokens: 0` request. In a live session, normal turns keep a 5-minute cache warm. For
     bursty use, 1-hour TTL or periodic re-warm.
   - The prefix must be byte-stable: build `manual.md` deterministically at build time (sorted, no timestamps).
2. **Local BM25 index (MiniSearch, ~7 KB gz lib) over section chunks.** This powers:
   - `search_manual(query)` / `get_section(id)` tools, so the agent quotes the exact unit and anchor (grounding and
     citations) without re-reading the whole prompt;
   - the UI's "show me where" (open the section, highlight the replica controls from the unit's procedure);
   - offline and free lookups (no API call) and fallback for users on small-context models.
   - Chunking: one chunk per H2 section; split sections over ~900 tokens at H3 card groups of ≤ 600 tokens. Carry
     chapter, section, anchor URL, sub-anchors, image list and firmware status. `knowledge/official/chunks.jsonl`
     already does this for the verbatim guide (159 chunks, median ~160 tokens, p90 ~550). Rebuild the same shape from
     our reworded units (§8) and ship `static/manual/index.json` (serialized MiniSearch, a few hundred KB).
   - Boost `title` and `aliases`. Add a synonym table: p-lock ↔ parameter lock, ratchet ↔ multiply, arp ↔ arpeggio,
     mixer ↔ mix, send FX ↔ FX I/II, MIDI engine ↔ external, etc.
3. **Embeddings: not needed.** 160–200 units of jargon-dense text do very well with BM25 plus aliases. The Anthropic API
   has no embeddings endpoint, so a local model (transformers.js, 20–30 MB download) or a second provider would be
   needed. Revisit only if a retrieval eval (a question set with expected unit ids) shows misses that aliases can't fix.
4. **Versioning:** every unit carries `firmware_min` / `changed_in`. The system prompt states the device's firmware
   (read over MIDI/USB at connect), and the agent prefers facts valid for that version.

## 7. Comparison with `gravitinos/opxy-tutor`

- **How it was made:** a single 130 KB Markdown file (`manuals/op-xy-guide.md`, 22k words) "converted from the chapter
  pages", committed by an AI agent on 2026-07-02, the day after the v1.1.15 guide went live. No script is included,
  so it can't be reproduced. Chapter markers are HTML comments. The PDF next to it is the **v1.0.9** printed guide
  (Illustrator export, 2024-11-14, 114 pp, text outlined), which doesn't match the Markdown.
- **Agreement:** same 24 chapters. A sentence-level diff against our scrape shows about 99% identical text.
- **Missing from opxy-tutor:** the index/front-matter page (~1.8k words: safety, box contents, regulatory, IP notice);
  all 1,170 diagram references; section anchors, URLs and front-matter; the changelog; specs; field kit and sound
  packs; images; layout geometry.
- **Noise in opxy-tutor:** "previous chapter / next chapter" in every chapter, and TE's stray characters kept
  (e.g. "notes.z").
- **Error in opxy-tutor:** in §8.2 (adding step components) the first four captions are copies of §7.1 captions
  ("to select a note to step sequence…"). The live page has the correct text, which is what we have. It was either a
  stale TE bug that has since been fixed or a conversion slip. Either way, don't trust that section there.
- **Missing from ours relative to opxy-tutor:** nothing substantive.

## 8. Proposed schema for our reworded, agent-friendly manual

Goals: (1) **our own words** throughout; (2) atomic facts with provenance (`source_url#anchor`); (3) procedures in the
exact key notation of §4, so the replica can animate them; (4) parameter tables per screen; (5) firmware-aware
(`firmware_min`, `changed_in`); (6) small enough to live whole in a cached prompt and to index with BM25.

**Unit** = one topic an agent answers about: about one guide H2 section, or one sub-feature with its own controls
(an LFO type, a synth engine, a step component, a how-to recipe, a changelog-only feature).

```yaml
# knowledge/manual/units/sequencer/parameter-locks.md  (front-matter; the body holds a short prose explanation)
id: sequencer.parameter-locks
title: Parameter locks
aliases: [p-lock, plock, step automation, locked parameter]
area: sequencer
context: { modes: [instrument, auxiliary], screens: [M1, M2, M3, M4] } # where it applies
summary: Store a per-step value for a module parameter; the track jumps to it whenever that step plays.
status: current # current | outdated-in-guide | changelog-only | unverified
firmware:
  { min: '1.0.9', changed_in: ['1.1.21', '1.1.33'], guide_version: '1.1.15', verified_on: null }
facts:
  - id: record
    text: Hold a step and turn any encoder to lock that parameter on the step.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
  - id: scope
    text: All four module pages can be locked; player settings cannot.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
  - id: rotate
    text: Rotating a sequence also moves its p-locks and step components.
    source: https://teenage.engineering/downloads/op-xy#1.1.21
    firmware_min: '1.1.21'
  - id: empty-steps
    text: Locks can be added to empty steps (a bug blocking this was fixed in 1.1.33).
    source: https://teenage.engineering/downloads/op-xy#1.1.33
    firmware_min: '1.1.33'
procedures:
  - id: add
    goal: Lock a value on one step
    preconditions: [track selected, module page showing the parameter]
    steps: [{ keys: 'step 5 + turn E2', note: 'any step, any encoder' }]
    result: The step now carries the locked value.
    source: https://teenage.engineering/guides/op-xy/sequencer#step-sequencing
  - id: smooth
    goal: Glide between locks instead of jumping
    steps: [{ keys: 'bar + turn E4' }]
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
  - id: clear
    goal: Remove all locks in the pattern
    steps: [{ keys: 'bar + M2' }]
    source: https://teenage.engineering/guides/op-xy/sequencer#extend-with-bar
parameters: [] # for screen units: [{screen: "M3", encoder: E1, layer: base|shift, name, range, default, cc}]
related: [sequencer.live-recording, sequencer.bar, step-components.skip-parameter-lock]
images: [673739c8b9430e5e32f3e437_original.svg] # reference only (TE asset), never shipped
```

- **Keys grammar:** `chord := key (" + " key)*`, `seq := chord (" → " chord)*`, `key := control | "turn " enc | "click " enc`.
  `control ∈ {shift, record, play, stop, [-], [+], M1–M4, T1–T8, step 1–16, key <note>, natural <n>, accidental <n>,
instrument, auxiliary, arrange, mix, project, tempo, sample, com, player, bar, volume, pitchbend, power}`,
  `enc ∈ {E1–E4}`. One `controls.json` maps each control id to the replica element id, the guide wording
  ("dark gray knob") and, where known, the MIDI note/CC. Then "shift + M1" is parsed once and animated by the replica.
- **Parameters:** per screen and encoder: name, range (in display units), default, shift layer, CC (if known),
  `source`. The guide gives ~250 encoder mappings but almost no ranges or defaults. Those come from the device (screens)
  and community CC maps and are marked `status: unverified` until checked.
- **Validation and build:** a zod schema validates all front-matter in CI. A build script emits
  `build/manual.json` (for the app), `build/manual.md` (a deterministic prompt bundle, units grouped by area) and
  `build/minisearch.json`. Tests assert that every `source` anchor exists in the current scrape (`index.json` anchors)
  and every `keys` string parses.
- **File layout:**

  ```text
  knowledge/manual/                 # committed, ours
    README.md                       # voice/style guide, notation, status legend
    controls.json                   # control ids ↔ replica elements ↔ guide names ↔ MIDI
    units/<area>/<unit>.md          # ~170 units, front-matter + short prose
    changelog/<version>.md          # our digest per OS release, facts tagged firmware_min
    build/ (generated, ignored)     # manual.json, manual.md, minisearch.json
  ```

- **Size estimate:** 110 guide sections and 498 cards come to **~170 units** (range 150–200). By area: hardware/system
  ~20, sequencer ~14, step components ~15, players ~4, project ~7, tempo ~3, instrument ~14, synth engines 9,
  samplers ~7, auxiliary ~8, fx 6, arrange ~5, mix ~6, MIDI/sync ~4, how-to 12, changelog-only ~10, concepts and
  conventions ~6. Contents: roughly 1,000–1,300 atomic facts (the guide has ~1,470 sentences), ~200 procedures
  (§4 already covers 95) and ~250 parameter rows. Reworded prose should land at or below the source's ~40k tokens.
- **Authoring loop:** for each unit, draft from the verbatim chunk(s) with Claude using a "reword, don't quote;
  atomize; use key grammar" prompt. Then validate, then review by diff against the source (a guard: flag any 8+ word
  run copied verbatim). Units flagged in §5 get checked on the owner's 1.1.33 unit, and `firmware.verified_on` is set.

## 9. Open questions and next steps

1. Redistribution of **images**: the owner's clearance covers reworded text. TE diagrams and press photos stay local
   reference material (the replica draws its own assets) unless TE confirms otherwise.
2. Build the full **MIDI CC / key-remote map** from device probing plus community repos. The official table is
   minimal (§5.2).
3. **Verify on OS 1.1.33** the §5 items: global transpose vs drums, track scales 5/7/1/5/1/7, sustain-pedal settings,
   sample-preview setting, snapshot save, voice indicator.
4. Nice-to-have: a nightly/weekly job running `ingest-guide.mjs --no-assets` that diffs `index.json`
   (hashes + guide label + latest OS version), so we notice TE updates quickly.
