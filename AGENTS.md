## OP-XY Agent — read this first

An open-source, browser-only (static SvelteKit) app: a pixel-perfect interactive replica of the
Teenage Engineering **OP-XY** plus an AI agent that answers anything from the official manual,
teaches, and programs the real device over Web MIDI / USB. Bring-your-own API keys (Claude first,
OpenAI realtime voice second).

**After any context reset, re-read in order:** `docs/VISION.md` (north star) → `docs/PLAN.md`
(roadmap + current phase) → `docs/research/INDEX.md` (what we know and where) → `docs/QUESTIONS.md`.

Where things live:

- `docs/research/NN-*.md` — our research notes (committed). `docs/research/90-device-probe.md` logs
  every message ever sent to the owner's device.
- `knowledge/` — curated machine-readable data the app ships (CC maps, schemas, …).
  `knowledge/official/` is the verbatim scrape of TE's manual: **always git-ignored**, source material
  only. The app ships **our own reworded, agent-friendly manual** (`knowledge/manual/`, see
  `docs/DECISIONS.md` D2). Never commit or ship verbatim TE manual text.
- Reference firmware: **OS 1.1.33** (owner's device). Decisions log: `docs/DECISIONS.md`.
- `research/repos/` — shallow clones of community projects (git-ignored; `scripts/fetch-research.sh`).
  `research/firmware/` — public firmware downloads (git-ignored). `research/device/` — probe scripts.

Rules:

- **Device safety:** read-only probes are fine; announce anything that changes device state (settings,
  projects, files, playback) to the owner first and log it in `90-device-probe.md`. Never flash firmware
  or send firmware-updater SysEx.
- The LLM never writes raw bytes: it emits typed intent; deterministic, tested TS code produces MIDI,
  `.xy` and preset files.
- Never print or commit `.env` values (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`).
- Code from repos without a license is reference-only; MIT code (e.g. `kmorrill/xy-format`) may be
  ported with attribution.
- Commit and push to `main` at milestones (pre-production).

## Project Configuration

- **Language**: TypeScript
- **Package Manager**: pnpm
- **Add-ons**: prettier, eslint, vitest, playwright, tailwindcss, sveltekit-adapter, ai-tools

---

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available Svelte MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.
