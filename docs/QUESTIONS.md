# Questions for the owner

Open items that only the owner can answer or approve. Answered items move to the bottom with the
answer and date (and into `DECISIONS.md` when they shape the project).

## Open

1. **FILE PUT test** (writes to the device): upload one tiny file into the SysEx filesystem's
   `drum/` folder, see where it shows up on the OP-XY, then delete it. Plan in
   `research/30-presets-samples.md`. Approve when ready.
2. **Device spike session** (changes live state, all reversible): CC probes (tempo, mute, volume,
   scene), remote keys CC106/107, transport/clock, USB audio capture, MTP mode. Schedule when ready.
3. **App name.** Keep "OP-XY Agent" or pick something else?
4. **Quick looks at the device** (read-only, nothing sent). The simulator follows TE's guide, but a few
   things only the unit can settle. Each is pinned by a conformance case
   (`src/lib/sim/conformance/sequencer.cases.ts`) or noted in the area's code:
   - Arrange mode: is the label over M1 "new" or "clear"? (TE's text says M1 new, its art the
     reverse.) Same question for the projects folder (shift + project): M1 load or M1 delete?
   - How long must a lit step be held before it copies instead of coming off? (Ours: 0.5 s.)
   - Step component multiply, black key 9: 9 hits, or 3 as TE's table prints?
   - While playing: does the playhead dim a step that has notes, and light an empty one?

## Answered

- 2026-09-26 — **Photos for the replica?** Not needed: build it from TE's guide SVGs (the full-panel
  drawing has every legend and icon). → D9.

- 2026-09-26 — **Licence?** MIT (MIDI Lab code ported here is relicensed under MIT by its owner). → D7.
- 2026-09-26 — **Hosting?** GitHub Pages from `main` via Actions → https://neovand.github.io/op-xy-agent/. → D8.

- 2026-09-26 — **Harness?** Own harness on `@anthropic-ai/sdk`, Deep Agents–shaped. → D4.
- 2026-09-26 — **Replica rendering?** SVG only (no 3D). → D5.
- 2026-09-26 — **Logos?** Neutral until TE says yes. → D6.
- 2026-09-26 — **Firmware on the device?** OS 1.1.33 (latest). → `DECISIONS.md` D3.
- 2026-09-26 — **Can we ship TE's manual text?** TE is fine as long as it's reworded → we write our own
  agent-friendly manual. → `DECISIONS.md` D2.
- 2026-09-26 — **File-transfer (MTP) test?** Yes, when it's time.
