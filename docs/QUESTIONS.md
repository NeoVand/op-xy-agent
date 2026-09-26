# Questions for the owner

Open items that only the owner can answer or approve. Answered items move to the bottom with the
answer and date (and into `DECISIONS.md` when they shape the project).

## Open

1. **Agent harness.** Research (`research/70-agent-harness.md`) recommends our own small harness on
   `@anthropic-ai/sdk`, shaped like Deep Agents (todos, subagents, memory, skills), over Deep Agents
   itself (needs browser shims, 6× the bundle, breaks on Opus 5.5 structured output). Alternative for
   day-one multi-provider text agents: the same harness on the Vercel AI SDK. Which way?
2. **Replica rendering.** Recommendation (`research/50-hardware-ui.md` §6): one millimetre geometry
   model → accessible SVG replica by default + lazy-loaded Three.js 3D view; screen on a canvas at
   native resolution. OK?
3. **FILE PUT test** (writes to the device): upload one tiny file into the SysEx filesystem's
   `drum/` folder, see where it shows up on the OP-XY, then delete it. Plan in
   `research/30-presets-samples.md`. Approve when ready.
4. **Device spike session** (changes live state, all reversible): CC probes (tempo, mute, volume,
   scene), remote keys CC106/107, transport/clock, USB audio capture, MTP mode. Schedule when ready.
5. **Photos & measurements** for the replica: checklist in `research/50-hardware-ui.md` §8 (top-down
   photo, macro shots of LEDs/meter, screens that the guide doesn't illustrate, a few caliper
   measurements). Your photos could be committed if you agree.
6. **Branding.** Show the "OP-XY" logo on the replica, or stay neutral until TE says yes? App name?
7. **Hosting.** GitHub Pages from `main` (like MIDI Lab), or somewhere else?

## Answered

- 2026-09-26 — **Firmware on the device?** OS 1.1.33 (latest). → `DECISIONS.md` D3.
- 2026-09-26 — **Can we ship TE's manual text?** TE is fine as long as it's reworded → we write our own
  agent-friendly manual. → `DECISIONS.md` D2.
- 2026-09-26 — **File-transfer (MTP) test?** Yes, when it's time.
