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
   - ~~Arrange mode: M1 "new" or "clear"?~~ **New** (camera, 2026-09-28; M4 reads clear with one
     pattern, delete with more). Still open: the projects folder (shift + project), M1 load or delete?
   - ~~How long must a lit step be held before it copies instead of coming off?~~ About half a
     second, and the copy happens during the hold, when "copied" appears (camera, 2026-09-28).
   - Step component multiply, black key 9: 9 hits, or 3 as TE's table prints?
   - While playing: does the playhead dim a step that has notes, and light an empty one?
   - ~~How do you switch a filter or an LFO off, and what does its page show then?~~ `M3` / `M4`
     again on its own page; the page dims under an "off" box (camera, 2026-09-28).
   - On a new project's T3, hold shift on M2: does portamento read `00` or `off`, and what does the
     bend range read (we expect 2 semitones)? On T8 (we expect an octave)?
   - ~~Are presets inside a category listed alphabetically, or in some other order?~~ By name,
     factory and user presets together (camera, 2026-09-28; note 59 §2.6).
5. ~~**Filter and LFO session**~~ Done on 2026-09-28 (note 60): the four filters, both envelopes'
   time laws, the LFO rates and depths and the duck, measured and now in the replica's sound.
   Still open from it: the synced LFO steps between the multiples of 8, the random LFO's steps and
   env card, element's depth, and the filter envelope's own times (assumed the amp envelope's).
   Original ask (changes device state the same way as the engine session: CCs and
   notes on a new throwaway project; nothing saved, loaded or deleted). The engines were measured
   with filters and LFOs off; the four filters (slopes, resonance, envelope depth) and the LFO shapes
   need their own sweeps. The replica now plays a new project's real presets, several of which lean
   on these (T3's closed svf opened by its envelope, T6's ladder, the tremolos and element LFOs on
   T4–T8), so this is now the biggest gap between the replica's sounds and the device's. The same
   session should time the envelopes' decay and release: we apply the attack's law to them, which
   gives T3's bass a 44 s release. Approve when ready, and say whether loading three test samples (impulse,
   noise, sine) as presets is fine for the filter measurements.
6. ~~**Photos of the sequencer's screens**~~ Captured by camera on 2026-09-28 (note 59): bar card, held
   steps and locks, the players. Still to capture: step components and the recording screens.
   Original ask (read-only; a phone photo each). None of our sources shows
   them, so ours are invented: holding **bar** on a pattern with notes; holding a **step** with
   notes, and one with a parameter lock; **shift + a step**, then a white key; the **arpeggio** or
   **maestro** page; the screen while **recording**.
7. **The sampler's loop crossfade** (the fade is settled: a fixed-time fade-in from the start
   marker, 0.95 s at 99, now in the replica; note 60 §5). The crossfade tops out at 75 % and is
   drawn over the end of the loop, but "80s lover" changes over time by itself, so its sound was not
   isolated. A plain sustained sample (a held synth note recorded into the sampler, say) looped at
   crossfade 0 and 75 % would settle it.
8. **Punch-in FX and the tape** (read-only). Their screens are captured (10 fps, every punch-in key;
   note 59) and the replica now draws them: the idle heartbeat and a still of each key's animation,
   matched to keys by the order they were pressed (please confirm the order if you remember it).
   The punch-in effects are now worked out from the recordings (note 60 §6: mute, stutter, two
   repeats, pan, octave, follow, the fills and ramps, short, soft attack, random) and the replica
   plays them. Still open, each quick to hear on the unit: does G repeat on the drums; does the
   upper G♯ (pan) follow tilting the unit; what does B (follow) do; do the drum fills (C, D) play
   with the transport stopped; how far do the ramps climb, and by what intervals does random jump.
   The tape's sounds are still needed: its patterns (aux T6) light up but make no sound, and a short
   phone video of its clips, or notes on them, would let us build them.
9. **Wavetable tables: our approach, and the eighth table's name.** Our wavetable frames are
   formulas fitted to the device's harmonics, not its data. For crush, geometric and basic the
   fitted rules reproduce the device's frames closely; drawbars uses a measured registration (nine
   bar levels per tenth of position). Fine to ship as is (D2 by analogy), or should ours diverge?
   And the eighth table, never seen on screen: we call it "primes" (a sine joined by the prime
   harmonics); what does the device call it?
10. **The midi engine on OS 1.1.33** (read-only look). shift + M1 brings up the preset browser, and
    its engine view listed eleven engines with no midi (note 59 §2.6), yet TE's guide still runs
    instrument tracks on the external (midi) engine. How does 1.1.33 put a track on midi: is it
    listed once a midi preset exists, is it further down a list we did not scroll, or is it gone?
    Until we know, the replica lists midi after the eleven (ours). Two smaller things while there:
    which key loads a preset (E2, E3 or E4 all fit the guide) and where shift + Tn opens the browser
    (the track's preset, or where it was last left).
11. **Does the device load our presets?** (writes files over MTP; nothing else changes). The preset
    maker (`/presets`) writes kits and multisamples the way the device writes its own (note 30 §3),
    but none has been tried on a unit yet. Install one drum kit and one multisample into
    `presets/mine/` (with "install on the op-xy…" in Chrome, or by hand with field kit), then check
    each loads, plays in tune on its keys, loops as set, and survives a project save and reload.
    Also worth a look: whether a `.preset` put straight into `presets/` (no folder) shows up at all.
12. ~~**MTP from the browser**~~ Works on the owner's unit in Chrome (2026-09-28, `90-device-probe.md`):
    device info, storage, listings, a 49 KB download of the open project (TE's factory project
    "agent"), and the OP-XY left MTP mode by itself on disconnect. The Claude app's built-in browser
    cannot do it (no WebUSB device picker).
13. **Projects to and from the device** — half answered (2026-09-28, `90-device-probe.md`): "load
    from the op-xy" brought TE's factory project "agent" into the replica, and "save to the op-xy…"
    wrote it back as `projects/user/test 1.xy`, which opened and played like the original on the
    unit. Still open: a project the replica changed (authored notes) playing on the unit, 16
    patterns, the cutoff lock. Original ask (the save writes one new file; nothing is replaced). With
    the OP-XY in MTP mode: "project" under the replica → "load from the op-xy" should bring the open
    project into the replica (tempo, patterns, scenes, songs, presets). Then "save to the op-xy…"
    as `test 1` adds `projects/user/test 1.xy`, written over the open project. On the device: does
    `test 1` show in the project list and open, and does it play the replica's patterns with the
    device's sounds? (note 10 §7.7 lists what else to check: 16 patterns, the cutoff lock.)
14. **Voice with a real mic** (nothing goes to the device unless you approve a change). With both
    keys in settings, hold the mic key beside send (or the backquote key) and ask something; then
    try hands-free (the switch in the voice strip), talking over the voice, and a change by voice
    ("set the tempo to 96", then "yes"). Three things to settle: is a spoken yes fine for device
    changes (it now counts only when your own words read as a clear yes after the question;
    otherwise voice would only announce and wait for a tap), `gpt-realtime-2.1` or mini as the
    default, and whether the strip names the right microphone with the OP-XY plugged in (the app
    skips the OP-XY's own input; note 71).

## Answered

- 2026-09-27 — **Synth calibration session?** Approved in chat and run: a new project, filters,
  LFOs and FX off and flat envelopes set by hand; CCs 12–15, CC102 and notes only. Every engine
  refit from the captures (note 57 §3; `docs/research/90-device-probe.md`).

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
