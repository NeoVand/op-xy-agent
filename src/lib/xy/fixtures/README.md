# `.xy` test fixtures

Test data for `src/lib/xy/`, written by or taken from
[kmorrill/xy-format](https://github.com/kmorrill/xy-format) (MIT, Copyright (c) 2026 Kevin
Morrill; licence below), the Python library our TypeScript port follows. Regenerate everything with
the upstream clone in place (`scripts/fetch-research.sh`):

```bash
uv run --quiet python scripts/xy-fixtures.py            # write
pnpm exec prettier --write src/lib/xy/fixtures          # format the JSON
uv run --quiet python scripts/xy-fixtures.py --check    # verify
```

| File                        | What it is                                                                                                                                                                                                                               | Upstream source                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `blank-1.1.4.xy`            | The template: a blank project saved on an OP-XY running OS 1.1.4, re-encoded by the library (byte-identical). Every upstream writer path starts from it                                                                                  | `src/one-off-changes-from-default/unnamed 1.xy` |
| `01_a_img_c4_step5.xy`      | One C4 on step 5 of T1. Written by upstream's image writer; loaded and played correctly on an OS 1.1.4 device                                                                                                                            | `output/image-probes/`                          |
| `02_b_img_notevel_60_60.xy` | A note whose velocity equals its pitch (the RLE pair `3C 3C 00`). Device-tested, as above                                                                                                                                                | `output/image-probes/`                          |
| `06_f_mute_enum.xy`         | Scene 2 with mute bytes 1, 2 and 3; the device showed all three muted                                                                                                                                                                    | `output/image-probes/`                          |
| `07_g_note_flags.xy`        | Four notes with different flag bytes (127 made the device re-trigger)                                                                                                                                                                    | `output/image-probes/`                          |
| `song.xy`                   | Written by the library from `SONG_OPS` in `scripts/xy-fixtures.py`: our own drum patterns, bass line and chord over four tracks and two patterns, three scenes with mutes, two songs, tempo, groove, settings, step components and locks | ours, via `xy/image_writer.py`                  |
| `locks.xy`                  | Written by the library from `LOCK_OPS`: locks on columns 0 (volume, mask bit 41), 3, 17, 22, 36 and 41, an armed zero, and locks on a second pattern                                                                                     | ours, via `xy/image_writer.py`                  |
| `expected.json`             | Every fixture's fields as the library reads them: `read.spec.ts` checks our reader against it                                                                                                                                            | `scripts/xy-fixtures.py`                        |
| `goldens.json`              | 26 op lists with the size and SHA-256 of what the library writes for each; `goldens.spec.ts` replays them through our writer. 17 equal a device capture (`equals`), which the generator checks                                           | `scripts/xy-fixtures.py`                        |

One deliberate difference from the library: it writes the p-lock union mask at pattern `+0x304E` as
`0x01` whatever the column, where device files hold the OR of the step masks (note 10, Appendix A.2).
The generator recomputes the union, so the goldens hold what the device would.

## Why these files are safe to commit

- **No audio, no factory songs.** A `.xy` file holds no samples. The blank project's two drum kits
  and the bandpasser pad point at the device's own factory library by path only (for example
  `content/samples/kick/kick boop a.wav`).
- **The only Teenage Engineering content** is the blank project's eight default instrument presets
  (engine parameters and preset names), present in every file here since every writer starts from it.
  The app already ships the same values in `knowledge/presets/new-project.json`.
- **Not included:** TE's factory demo projects, the factory preset captures (upstream's
  `src/factory-preset-captures/`), the community "nt-" user presets, and upstream's Whitney, Tiesto and
  Aurora probes, which are arrangements of commercial songs.
- Total size: about 140 KB, this file included.

## Licence of kmorrill/xy-format

```text
MIT License

Copyright (c) 2026 Kevin Morrill

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
