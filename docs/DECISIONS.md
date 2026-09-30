# Decisions

Short, dated records of choices that shape the project. Newest last. Each entry: context → decision →
consequences. Superseded entries stay, marked as such.

## D1 — 2026-09-26 — Keep third-party bulk out of the public repo

- **Context:** the GitHub repo `NeoVand/op-xy-agent` is public. Research pulls in ~40 community repos,
  firmware binaries, TE's manual pages and product photos.
- **Decision:** git-ignore `research/repos/`, `research/firmware/`, `research/web/`,
  `research/ui-reference/` and `knowledge/official/`. Make them reproducible with scripts
  (`scripts/fetch-research.sh`, `scripts/ingest-guide.mjs`). Commit only our own notes, code and data.
- **Consequences:** a fresh clone needs `scripts/fetch-research.sh` to re-create research inputs.

## D2 — 2026-09-26 — Write our own agent-friendly manual; the TE manual is source material only

- **Context:** the owner's contacts at Teenage Engineering are fine with us using the manual's content
  **as long as it is reworded**.
- **Decision:** the verbatim scrape of the official guide stays local (git-ignored) and is used only as
  source material. We author **our own manual in our own words**, structured for agents (atomic facts,
  exact key-combo procedures the replica can animate, parameter tables with ranges/CCs, firmware
  version tags), every unit linked back to the official section it derives from. That manual is
  committed and ships with the app.
- **Consequences:** a "manual authoring" pipeline (LLM-assisted rewrite + human-quality review +
  coverage checks against the source) becomes an explicit work item. The agent answers from our
  manual and links users to the official guide for the original.

## D3 — 2026-09-26 — Target firmware OS 1.1.33

- **Context:** the owner's device runs OS 1.1.33, the latest public release (2026-09-02). The online
  guide is labelled v1.1.15.
- **Decision:** 1.1.33 is the reference firmware for all behaviour, MIDI maps and `.xy` format work.
  Anything documented only for older firmware must be re-verified on the device before we rely on it.
  Changelog entries after 1.1.15 are treated as manual errata.
- **Consequences:** firmware version is first-class state in the app; the `.xy` codec and CC maps
  carry a "verified on" firmware tag.

## D4 — 2026-09-26 — Our own agent harness on the Anthropic SDK

- **Context:** the owner leaned toward LangChain Deep Agents. Browser tests (`research/70-agent-harness.md`)
  showed it needs a Vite define plus a non-concurrency-safe AsyncLocalStorage shim, weighs ~438 KB gzip,
  and fights Opus 5.5 (forced tool choice → 400, history-rewriting summarization vs. prefix-bound
  thinking blocks).
- **Decision (owner):** build our own small "conductor" harness on `@anthropic-ai/sdk`, shaped like
  Deep Agents: `write_todos` planning, `task`-style subagents with isolated context (manual expert,
  composer, sound designer, device operator), memory and skills as files — plus typed tools
  (read/ui/propose/mutate), an approval gate, a single-flight device queue and a revision journal.
  Claude drives all text agents; OpenAI is used for realtime voice only (it delegates to Claude).
- **Consequences:** ~70 KB agent chunk, no polyfills, exact control over caching, thinking and
  citations. Tools stay framework-neutral (zod) so another provider adapter can be added later.

## D5 — 2026-09-26 — SVG-only replica

- **Context:** research proposed one millimetre geometry model driving an SVG replica plus an optional
  lazy Three.js 3D view (`research/50-hardware-ui.md` §6).
- **Decision (owner):** **SVG only.** One mm-accurate geometry model renders a crisp, accessible SVG
  device; the screen is a canvas at native resolution (480 × 222). No 3D view.
- **Consequences:** lighter, faster, pixel-crisp, easier to animate and make accessible. Depth and
  material come from careful SVG shading, not a 3D engine.

## D6 — 2026-09-26 — Neutral branding until TE approves

- **Decision (owner):** draw the device faithfully but without Teenage Engineering or OP-XY wordmarks
  and logos; the app refers to the device in plain text ("for the OP-XY"). Revisit if TE says yes.
- **Consequences:** no TE logos, photos or fonts ship in the app; legends are drawn by us.

## D7 — 2026-09-26 — MIT licence

- **Decision (owner):** the project is MIT-licensed (`LICENSE`). Code ported from the owner's MIDI Lab
  is relicensed under MIT by its owner. Third-party sources and attributions live in `NOTICE.md`;
  every ported file names its source in a header comment.

## D8 — 2026-09-26 — Hosting on GitHub Pages

- **Decision (owner):** deploy the static build to GitHub Pages from `main` via GitHub Actions
  (`.github/workflows/ci.yml`: check → build with `BASE_PATH=/op-xy-agent` → deploy), live at
  https://neovand.github.io/op-xy-agent/.
- **Consequences:** internal links use `resolve()` / `asset()` from `$app/paths`; the adapter writes a
  `404.html` SPA fallback; deploys only happen when type check, lint, unit tests and build pass.

## D9 — 2026-09-26 — Build the replica from TE's own guide drawings

- **Context:** the owner pointed out that TE's online guide already contains everything the replica
  needs: a full-panel vector line drawing (`research/ui-reference/guide-svg/layout/001_*.svg`,
  viewBox 740 × 265, 588 paths — every key, legend, number, icon, the speaker grille, volume knob,
  encoders and screen outline) plus ~470 more SVG illustrations, including screen pages. Photos and
  caliper measurements are not needed.
- **Decision (owner):** derive the replica's geometry and its legend/icon artwork from these guide
  SVGs (TE is supportive of the project; the owner's call). We segment the drawing into per-control
  shapes keyed by `knowledge/opxy/controls.json` ids and restyle them (materials, LEDs, press
  states) in our own SVG components. Guide screen illustrations are the reference for our screen
  renderer. Attribution goes in `NOTICE.md`; the artwork stays swappable. D6 still holds for the
  "OP–XY"/TE wordmarks (left off until TE says yes).
- **Not reused:** `mitchivin/te-opxy` (Three.js replica) has no licence and its author did not publish
  the source, so its code and models stay reference-only unless its author grants permission; the
  replica is SVG-only anyway (D5).

## D10 — 2026-09-26 — Our own OP-XY UI simulator instead of firmware emulation

- **Context:** the owner asked whether we could decompile the firmware and run a full simulator so the
  replica's screen shows exactly what the device shows. All public firmware is AES-encrypted with a
  device-held key and a signature trailer (`research/60-firmware.md`); recovering the key would need a
  hardware attack on the owner's unit, and there is no usable emulator for the dual-Blackfin + DSP
  platform anyway.
- **Decision:** build our own behavioural simulator of the OP-XY's user interface (modes, pages, shift
  layers, parameter values, sequencer basics) plus a screen renderer that matches the real display,
  derived from TE's public guide screen illustrations (their outlined text also gives us the screen
  font; covered by D9), the manual, and checks against the owner's device. `mitchivin/te-opxy` stays
  reference-only.
- **Consequences:** the replica becomes a true virtual OP-XY for learning and for the agent to rehearse
  procedures. When a device is connected the simulator syncs what the device reports (tempo, play
  state, what the app itself sent); it cannot mirror the real screen or encoder moves, which the
  OP-XY does not transmit. New work item "M2.5 screen & UI simulator" (`research/55-screen.md`).

## D11 — 2026-09-26 — Ship the screen glyphs traced from TE's guide art

- **Context:** the screen simulator (D10) renders text with glyph outlines extracted from TE's guide
  screen illustrations (`scripts/extract-screen-font.mjs` → `knowledge/opxy/screen-font.json`, 63
  glyphs). They appear to be Linotype's Univers, which TE licenses, so publishing them in the public MIT
  repo could count as redistributing a commercial font.
- **Decision (owner):** ship the traced glyphs for the most faithful screen (pages match TE's art within
  about 1% of pixels). Credited in `NOTICE.md`, with a commitment to swap in an open look-alike if a
  rights holder objects. The app's own UI text stays on open fonts (Work Sans, Red Hat Mono).
- **Consequences:** keep the font pipeline swappable (one module, `src/lib/sim/screen/font.ts`, reads the
  glyph data), so a replacement face needs only a new data file.

## D12 — 2026-09-30 — Agent v2: skills, a lab on the replica, grounding, memory, outcome evals

- **Context:** v1 (D4) built the loop, tools, approvals, subagents and the device queue, but not the
  skills and memory D4 promised. Every lesson became a rule in the system prompt (31 bullet
  paragraphs, ~5,000 tokens) beside the whole manual (~90,000 tokens) on every request, and every
  hard task became a purpose-built tool. The Brother Louie rehearsals (about a dozen rounds of rule
  and heuristic patches) showed the limit: the agent could not compute, could not try things before
  acting, remembered nothing, and could claim changes it had not made. The owner asked for a step
  back: "an agent that can spawn subagents that can write code and validate, … have a plan, … have
  memory", skills instead of "a ginormous amount of text in its context".
- **Decision (owner, "go ahead and make this awesome"):** keep our browser harness (it runs where
  the OP-XY and the replica are; Codex and the Claude Agent SDK need a backend, and Deep Agents in the
  browser failed in D4) and build the missing layer natively: a prose core prompt; skills in the
  Agent Skills `SKILL.md` format, loaded on demand; a lab where model-written code runs in a
  sandboxed worker against forks of the replica, with offline listening and an undoable commit; a
  per-turn diff of the replica that grounds every answer; the API's memory tool on IndexedDB; the
  manual as a map plus per-turn retrieval (A/B against the full bundle); specialist subagents where
  their own context pays; episodes with simulated users as the outcome metric. Plan:
  `docs/AGENT-V2.md`.
- **Consequences:** new modules `src/lib/agent/{skills,grounding,memory}.ts` and `src/lib/agent/lab/`,
  skills under `knowledge/skills/`, evals `evals/agent/episodes.*`. The core prompt stops growing
  from single incidents; fixes go into skills, tools' contracts or code, and must move an eval. The
  full-manual mode stays available until retrieval matches it.
