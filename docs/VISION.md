# OP-XY Agent — Vision

> This is the north star. Every other doc in `docs/` serves it. If context is ever lost, re-read this
> file, then `docs/PLAN.md`, then `docs/research/INDEX.md`.

## One sentence

The most incredible AI-driven way to learn, play and program a Teenage Engineering **OP-XY**: a
gorgeous, open-source web app with a pixel-perfect interactive replica of the hardware and an agent
that knows the machine inside out, can explain anything, and can do the work for you on the real
device.

## What it must be

1. **A 1:1 replica of the OP-XY.** Every key, encoder, the screen, the labels, the colours — accurate
   enough that someone who owns one feels at home instantly. It is not decoration: it mirrors the
   connected device and can control it (press keys, turn encoders, play notes).
2. **An agent harness, not a chatbot.** Planning, memory, tool execution, sub-tasks (the user favours
   LangChain **Deep Agents**; skills are installed under `.agents/skills/`). It must:
   - **Teach**: answer any OP-XY question from the fully ingested, indexed official manual and
     firmware changelog, citing sections, and show _how_ on the replica ("press shift + …").
   - **Do**: program the device — tracks, patterns, notes, p-locks, step components, scenes, songs,
     sounds, mixer, tempo — e.g. _"program a multi-track, multi-scene arrangement of Modern Talking's
     'Brother Louie'"_ or _"Beethoven's Moonlight Sonata"_.
   - **Control live**: transport, mutes, scenes, parameters, playing notes.
3. **Connected over USB** via Web MIDI (and whatever else USB exposes: MTP, audio). MIDI cable/BLE are
   secondary.
4. **Bring your own key.** The user enters an API key. Claude first; OpenAI realtime voice second.
   Users pick the model.
5. **Teenage Engineering aesthetic in every detail.** Tasteful, precise, playful, pro. The kind of
   thing people immediately want to play with and share.
6. **Open source and excellent code.** Readable, tested, well-documented; a codebase people want to
   contribute to.

## Ground rules

- **Grassroots.** TE staff are supportive but provide no files. Everything comes from public
  sources: the online guide, public firmware downloads, community reverse engineering, and probing
  our own device.
- **Our own manual.** TE is fine with us using the manual's content if it is reworded, so we write our
  own agent-friendly manual (committed, shipped) and keep the verbatim scrape local as source material.
- **Never harm the device.** Read-only probes are fine; anything that changes device state
  (settings, projects, files, firmware) is announced to the user first. Never flash firmware.
- **Deterministic core, AI on top.** The LLM produces typed musical intent; deterministic,
  tested code turns it into MIDI / `.xy` bytes / presets. The model never writes raw bytes.
- **Undo is sacred.** Every agent change is revisioned and reversible.
- **Firmware is first-class state.** Device firmware version, guide version and format profile are
  always known and checked.

## Hardware / environment facts (2026-09-26)

- User's OP-XY is connected over USB, stock settings. USB vendor `teenage engineering`, product
  `OP-XY`, VID `9063` (0x2367), PID `32801` (0x8021).
- Owner's device firmware: **OS 1.1.33** (latest public, 2026-09-02) — our reference firmware.
  Online guide labelled v1.1.15, so changelog entries after 1.1.15 are manual errata.
- Keys in `.env`: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (never commit or print).
- Stack: SvelteKit 2 + Svelte 5 (runes) + TS + Tailwind 4, static adapter, pnpm, vitest, playwright.
- Prior art by the user: `~/repos/midilab` (MIDI Lab course; own MIDI parser, SMF codec, synth).
