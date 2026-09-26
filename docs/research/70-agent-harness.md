# 70 — Agent harness: Deep Agents in the browser, alternatives, models, voice, caching, BYO keys

> Research date: 2026-09-26. **[tested]** means we ran it today, either in headless Chromium 151 against
> the live APIs with the owner's keys or in Node 24, and the numbers come from that run. **[docs]** means
> vendor documentation fetched today. **[source]** means we read the package source. **[estimate]**
> means arithmetic or a third-party figure. No key values appear in this document or in any output we
> kept. Nothing was sent to the OP-XY.

## TL;DR

1. **Deep Agents does run in a browser, but not out of the box.** Stock `deepagents@1.14.1` bundles
   under Vite 8 through its `browser` export, then the page crashes on load with
   `ReferenceError: process is not defined` (picomatch, pulled in by micromatch). One Vite `define`
   fixes that. After it, planning (`write_todos`) and the virtual filesystem work, but **subagents
   (`task`) and HITL (`interruptOn`) throw**, because LangGraph relies on `AsyncLocalStorage` and
   browsers don't have it. A 20-line stack-based ALS shim (the same trick `@openai/agents-core`
   ships for browsers) makes all of it work: interrupt/resume, parallel subagents, streaming, and live
   Claude Sonnet 5, Haiku 4.5 and Opus 5.5 [tested]. What it costs: about **438 KB gzip**, or 538 KB
   with `@langchain/openai`; a shim that doesn't truly isolate concurrent branches; and a LangChain
   layer that trails Claude's newest API rules. For example, LangChain's default structured output
   **returns HTTP 400 on Opus 5.5** [tested], and once a thread grows long enough, Deep Agents'
   built-in summarization rewrites history, which Opus 5.5's thinking-block prefix check can reject
   [docs].
2. **Recommendation: build our own small harness on `@anthropic-ai/sdk@0.128.0` and shape it like
   Deep Agents.** The SDK's tool runner plus streaming comes to **about 70 KB gzip including zod**,
   needs no polyfills, and was verified in Chromium with streaming, prompt caching and in-tool
   approvals on Sonnet 5 and Opus 5.5 [tested]. From Deep Agents we keep the ideas: a conductor with
   `write_todos`, `task`-style subagents with isolated context (manual expert, composer, sound
   designer, device operator), memory files and skills as files. We add what Deep Agents doesn't give
   us: typed tools classed read/ui/propose/mutate, a HITL gate, a serialized device queue, and a
   revision journal for undo. Tools stay framework-neutral (zod) so an AI SDK or Deep Agents adapter
   is still possible later.
3. **Claude works from the browser** [tested]. `api.anthropic.com` returns `access-control-allow-origin: *`
   when the request carries `anthropic-dangerous-direct-browser-access: true` (in the SDK:
   `dangerouslyAllowBrowser: true`). Without that header it returns 401 "CORS requests must set …".
   Messages, count_tokens and models allow CORS. **The Files API and Batches don't** (their preflight
   returns 400).
4. **Default model: `claude-opus-5-5`**, released 2026-09-22: $4/$20 per MTok, cache reads $0.20,
   1M-token context, thinking always on, no forced tool use, default effort `medium` [docs].
   `claude-sonnet-5` ($2/$10) for most subagents, `claude-haiku-4-5` for cheap and fast work, and
   `claude-fable-5-1` ($10/$50) for the hardest composition jobs.
5. **Manual caching.** The ingested TE guide is 106k tokens raw and **69.5k tokens once image links
   are stripped**, as 159 `search_result` blocks [tested]. When cached, it adds about **$0.014 per
   model call** on Opus 5.5 or Sonnet 5, and answers carry `search_result_location` citations that
   point at section URLs [tested].
6. **Voice: OpenAI Realtime over WebRTC, directly from the browser** [tested end to end]. The page
   mints an ephemeral `ek_…` secret with the user's key (0.65 s) and exchanges SDP (1.0 s).
   `gpt-realtime-2.1` called our `ask_claude` function about 1.2 s after the request and spoke the
   result about 1 s after we returned it. The voice model is the front end and delegates to the
   Claude conductor. `@openai/agents-realtime@0.18.0` also works in the browser [tested]. The Claude
   API still has no speech input or output [docs, Models API].
7. **Incidental finding: the two key labels in `.env` are swapped.** `ANTHROPIC_API_KEY` holds an
   OpenAI `sk-proj-…` key and `OPENAI_API_KEY` holds an Anthropic `sk-ant-…` key. Our scripts pick
   keys by prefix, and the app's key screen should detect the provider the same way.
   **Fixed 2026-09-26:** the names in `.env` were swapped back by prefix (values untouched, never printed).

---

## 1. What we tested

| Item              | Value                                                                                                                                                                                                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bundler           | Vite 8.3.1 (Rolldown 1.2.11), production build, `target: es2022`, same major as the app                                                                                                                                                                                                                     |
| Browser           | Chromium headless shell 151.0.7922.34, driven by Playwright 1.63.0 on macOS arm64; fake mic for voice                                                                                                                                                                                                       |
| Node              | 24.21.0, pnpm 12.4.2                                                                                                                                                                                                                                                                                        |
| Deep Agents stack | `deepagents@1.14.1`, `langchain@1.5.12`, `@langchain/core@1.2.12`, `@langchain/langgraph@1.4.18`, `@langchain/langgraph-checkpoint@1.1.5`, `@langchain/langgraph-sdk@1.12.0`, `@langchain/anthropic@1.5.11` (pins `@anthropic-ai/sdk@^0.122.0`), `@langchain/openai@1.5.13`, `langsmith@0.9.0`, `zod@4.6.5` |
| Alternatives      | `@anthropic-ai/sdk@0.128.0`, `ai@7.0.116` + `@ai-sdk/anthropic@4.0.65` + `@ai-sdk/openai@4.0.78` + `@ai-sdk/svelte@5.0.116`, `@openai/agents@0.18.0`, `@openai/agents-realtime@0.18.0`, `openai@7.23.0`, `@anthropic-ai/claude-agent-sdk@0.3.283` (metadata only)                                           |
| Test code         | Scratch Vite app, not committed. The essential snippets are in the appendix                                                                                                                                                                                                                                 |

The Deep Agents test is one agent: a custom `set_tempo` tool (a pretend device change that needs
approval), a `search_manual` tool, a `manual-expert` subagent, `todoListMiddleware`, `MemorySaver`,
`InMemoryStore`, and a `CompositeBackend` that routes `/memories/` to `StoreBackend` and everything
else to `StateBackend`. It runs two ways: a scripted chat model for deterministic offline runs, and
live `ChatAnthropic`.

## 2. Deep Agents JS in the browser: evidence

### 2.1 Packaging [source]

- Since 1.11.0, `deepagents` publishes `browser` and `./browser` exports (`dist/browser.js`). That
  entry leaves out `FilesystemBackend`, `LocalShellBackend`, the skills and config loaders
  (`node:fs`, `node:child_process`) and agent-memory middleware. `@langchain/langgraph` sends the
  `browser` condition to `dist/web.js`, which skips the `node:async_hooks` setup, and `langchain` has
  a `browser` entry too.
- The browser entry still imports `micromatch` (and through it `picomatch` and `braces`), `yaml`,
  `langsmith` and `langsmith/experimental/sandbox`. Vite externalizes these Node built-ins as empty
  stubs: `node:fs`/`node:path` (from the `@anthropic-ai/sdk@0.122` credential chain), `util`
  (micromatch, fill-range), `path` (picomatch) and `node:fs/promises` (langsmith sandbox). They are
  harmless at runtime except for picomatch's top-level `process.platform` read, and `util.inspect`
  on micromatch error paths.
- Peer ranges: `deepagents` wants `langsmith >=0.7.1 <0.10.0`, but the latest langsmith is 0.10.5,
  so pin 0.9.0. The todo middleware has been **opt-in since 1.12.0**, the base system prompt has
  been blank since 1.12.0, and four minor versions shipped in nine weeks (1.11.0 on 2026-07-16 to
  1.14.0 on 2026-09-18, plus 11 patch releases through 1.14.1). The installed
  `.agents/skills/deep-agents-*` still say todos are on by default and default to
  `claude-sonnet-4-5-20250929`, so treat them as stale. `@langchain/anthropic@1.5.11` has no model
  profile for `claude-opus-5-5` yet, so summarization falls back to a 170k-token trigger that keeps
  6 messages.

### 2.2 Runtime results in Chromium [tested]

| Capability                                                                              | Stock build                                                                           | + `process.platform`/`process.version` define           | + define + ALS shim                                                                                                            |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Page loads                                                                              | ❌ `ReferenceError: process is not defined` at module init (picomatch via micromatch) | ✅                                                      | ✅                                                                                                                             |
| `write_todos` (add `todoListMiddleware()` yourself)                                     | —                                                                                     | ✅                                                      | ✅                                                                                                                             |
| Virtual FS (`StateBackend`, `write_file`)                                               | —                                                                                     | ✅                                                      | ✅                                                                                                                             |
| `/memories/` routed to `StoreBackend(InMemoryStore)` (use the factory form `(rt) => …`) | —                                                                                     | ✅                                                      | ✅                                                                                                                             |
| Subagent via `task`                                                                     | —                                                                                     | ❌ `Config not retrievable… getCurrentTaskInput`        | ✅ (the 1-line patch also fixes it without the shim)                                                                           |
| Two subagents in parallel                                                               | —                                                                                     | ❌                                                      | ✅ (no cross-talk seen; not tested with the patch alone)                                                                       |
| HITL `interruptOn` → `__interrupt__` → `Command({resume:{decisions}})`                  | —                                                                                     | ❌ `Called interrupt() outside the context of a graph.` | ✅ **shim only** (also two actions in one interrupt, which needs one decision per action)                                      |
| HITL as an awaited confirm inside the tool (no framework interrupt)                     | —                                                                                     | ✅                                                      | ✅                                                                                                                             |
| Streaming `streamMode: ["updates","messages"]`, `subgraphs: true`                       | —                                                                                     | ✅                                                      | ✅                                                                                                                             |
| Live `ChatAnthropic` (CORS header added automatically)                                  | —                                                                                     | —                                                       | ✅ Sonnet 5: first chunk 1,230 ms · Haiku 4.5: 644 ms · Opus 5.5: 1,357 ms, each run doing subagent → tool → approval → answer |

Why the fixes are needed [source]: `runTask` in `deepagents` calls `getCurrentTaskInput()` without
arguments. LangChain's HITL middleware calls LangGraph `interrupt()`, and the zero-argument
`StateBackend`/`StoreBackend` call `getConfig()`/`getStore()`. All of these read the run config
from `AsyncLocalStorage`. `@langchain/core` falls back to a mock ALS that stores nothing, so in the
browser they throw.

Two ways to fix it:

- **Patch.** `getCurrentTaskInput(config)` inside `runTask` (the tool already has `config`) fixes
  subagents. Use backend factories so the backends receive `rt` explicitly. Do HITL inside the tool
  rather than with `interruptOn`.
- **Shim.** Register a stack-based ALS under `Symbol.for("ls:tracing_async_local_storage")` (see the
  appendix). It works because the context stays pushed until the callback's promise settles. It is
  **not** a real async context: two branches running interleaved could read each other's config. Our
  parallel test passed, but that is luck, not a guarantee. It also depends on an internal global
  symbol. Native `AsyncContext` isn't there: `typeof AsyncContext === "undefined"` in Chromium 151.

### 2.3 Where Deep Agents clashes with current Claude semantics

| Issue                                                                                                                                                                                                                           | Evidence                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Opus 5.5 and Fable 5.1 reject `tool_choice` `any`/`tool`                                                                                                                                                                        | `ChatAnthropic(...).withStructuredOutput(schema)` returns **400** `tool_choice: type "tool" and "any" are not supported for this model` [tested]; `method: "jsonSchema"` works [tested]. `createAgent` sets `toolChoice = "any"` whenever a `ToolStrategy` response format is present [source]                                                                    |
| Opus 5.5 thinking blocks are bound to the prefix. For accounts created on or after 2026-08-31, replaying a block after any change to `system`, `tools` or an earlier message returns 400 unless `drop_block` is opted in [docs] | Deep Agents always installs a summarization middleware that rewrites history once its threshold is reached (85% of the model profile's context, or 170k tokens for models without a profile), and its skills/memory middlewares inject text into the system prompt [source]. Both break the append-only discipline Opus 5.5 wants and invalidate the prompt cache |
| Opus 5.5 returns the notes it writes between tool calls as `thinking` blocks, empty unless `thinking.display` is `"updates"` (beta) or `"summarized"` [docs]                                                                    | Needs a pass-through for `thinking` config; LangChain lags the SDK here (`@anthropic-ai/sdk` 0.122 vs 0.128)                                                                                                                                                                                                                                                      |
| Durable interrupts and checkpoints are server-side machinery                                                                                                                                                                    | In a single-page app the run lives in memory, and an awaited confirm inside the tool is simpler and works everywhere [tested]                                                                                                                                                                                                                                     |

### 2.4 Features Deep Agents gives us, and how each maps to the browser

- **Planning:** `write_todos` via `todoListMiddleware()` (opt-in). Works [tested].
- **Backends:** `StateBackend` is an in-memory VFS scoped to the thread (works). `StoreBackend` sits
  on a LangGraph `BaseStore` (works with `InMemoryStore`). `CompositeBackend` routes by path prefix
  (works). `FilesystemBackend`, `LocalShellBackend` and sandboxes are Node or remote only.
- **IndexedDB persistence:** nothing built in. Write `class IdbStore extends BaseStore { batch(ops) }`
  for StoreBackend and memories, plus `class IdbSaver extends BaseCheckpointSaver` implementing
  `getTuple/list/put/putWrites/deleteThread` for checkpoints and interrupts. Each is roughly
  150 lines on `idb@8.0.3`.
- **Subagents:** `task(description, subagent_type)` runs a fresh, stateless agent with its own
  prompt and tools, and returns its final message. It needs the ALS fix [tested].
- **HITL:** `interruptOn: { tool: true | {allowedDecisions} }` plus a checkpointer. Decisions are
  `approve | edit | reject(message)`, one per action request. Needs ALS [tested].
- **Streaming:** `agent.stream(input, {streamMode:["messages","updates","custom"], subgraphs:true})`
  yields `[namespace, mode, data]`, covering token chunks, node updates (tool calls and results) and
  subagent namespaces. `streamEvents(..., {version:"v3"})` adds `run.subagents` and `run.toolCalls`
  projections [source].
- **Bundle size:** see §3.

## 3. Alternatives, compared

Bundle sizes are app-mode Vite builds of a minimal entry that uses each SDK's agent loop with one
tool. Everything is tree-shaken and gzipped at level 9 [tested]. zod alone is 81 KB min / 23 KB gzip
and is included in every row.

| Option                                                                                                         | Browser                                                                                                        | Harness features                                                                                                                                                                 | Claude fidelity                                                                                                                                                                               | Multi-provider       | Size (min / gzip)                                           | Maturity                                                                                                 |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **`@anthropic-ai/sdk` 0.128.0**: tool runner (`client.beta.messages.toolRunner`, `betaZodTool`) or manual loop | ✅ with `dangerouslyAllowBrowser: true`; no polyfills [tested]                                                 | Loop, streaming, `setMessagesParams`/`pushMessages` hooks, `compactBeforeNextTurn()`, `max_iterations`, memory-tool helper (`betaMemoryTool`). No planning or subagents built in | Complete, same day as API changes: caching, citations/`search_result`, compaction, thinking display, strict tools, fallbacks, mid-conversation system messages                                | Claude only          | raw streaming 189 / **49 KB**; tool runner 261 / **70 KB**  | First-party; tool runner is beta                                                                         |
| **Vercel AI SDK 7** (`ai` + `@ai-sdk/anthropic` + `@ai-sdk/openai` + `@ai-sdk/svelte`)                         | ✅. Add the dangerous-direct-browser header yourself (not automatic) [source]                                  | `streamText`/`ToolLoopAgent`, `stopWhen`, `toolApproval` (HITL), `DirectChatTransport` for in-process agents, Svelte 5 `Chat` class                                              | Very current through `providerOptions` (cache control, citations/search_result, compaction, `display: updates`, fallbacks, `tool_addition`) [source], one abstraction away from native blocks | ✅ 40+ providers     | 669 / **163 KB** (two providers)                            | Very active (v7.0.116)                                                                                   |
| **Deep Agents JS** (LangChain + LangGraph)                                                                     | ⚠️ needs define + ALS shim or patch (§2)                                                                       | Richest: todos, VFS, subagents, HITL, skills, memory, summarization, checkpoints                                                                                                 | Lags. Forced `tool_choice` paths, history-rewriting middleware, pinned older SDK                                                                                                              | ✅                   | Anthropic: 1,576 / **438 KB**; + OpenAI: 2,035 / **538 KB** | Fast-moving (1.11.0 on Jul 16 to 1.14.0 on Sep 18); minor releases change defaults                       |
| **OpenAI Agents SDK JS** (`@openai/agents`)                                                                    | ✅ builds cleanly for the browser [tested build, not run]; ships browser shims, including a stack ALS [source] | Agents, handoffs, guardrails, tool approvals, tracing                                                                                                                            | Claude only through an `aisdk()` adapter (`@openai/agents-extensions`)                                                                                                                        | ⚠️                   | 1,336 / **342 KB**                                          | v0.18                                                                                                    |
| **OpenAI Agents Realtime** (`@openai/agents-realtime`)                                                         | ✅ WebRTC transport [tested]                                                                                   | Voice agent, function tools, `backgroundResult()`, approvals, interruptions                                                                                                      | n/a (voice)                                                                                                                                                                                   | OpenAI realtime only | 962 / **262 KB**                                            | v0.18                                                                                                    |
| **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`)                                                        | ❌ Node ≥18 plus per-OS native binaries; drives the Claude Code executable [npm metadata]                      | Full Claude Code harness                                                                                                                                                         | —                                                                                                                                                                                             | —                    | —                                                           | Not an option for a static site                                                                          |
| **Claude Managed Agents**                                                                                      | — hosted service; CORS not checked                                                                             | Rich. Anthropic hosts the loop and a sandbox container, and state lives server-side in the user's org                                                                            | Native                                                                                                                                                                                        | Claude only          | —                                                           | Wrong shape: our tools run in the browser on Web MIDI, and it bills session runtime ($0.08/session-hour) |

### Recommendation

Build **"conductor"**, a Claude-first harness of roughly 1–2k lines of our own TypeScript on
`@anthropic-ai/sdk`. The reasons, in order:

1. **Correctness on the models we'll ship.** Opus 5.5 needs append-only transcripts, thinking blocks
   passed back byte for byte, no forced tool choice, a `thinking.display` choice, and compaction in
   the documented shapes. The raw SDK gives us exact control. With LangChain we'd be fighting its
   abstractions, as §2.3 shows.
2. **No polyfills, no internal-symbol shim, and a bundle a sixth the size.** The whole agent panel
   can load lazily in a single 70 KB chunk.
3. **Deep Agents' built-in tools don't fit our job.** Its tools are aimed at coding agents (`ls`,
   `grep`, `edit_file`, `execute`). Our valuable tools are custom: device state, typed musical IR,
   change sets, the replica UI. We would still write everything that matters.
4. **We keep the good ideas.** Tool names like `write_todos` and `task` stay, so prompts, skills and
   docs carry over and a Deep Agents adapter remains possible.

**Fallback positions.** If the owner wants multi-provider text agents on day one, build the same
conductor on AI SDK 7 (163 KB) with `DirectChatTransport` plus `@ai-sdk/svelte`. If the owner
insists on Deep Agents, use the recipe in §2.2 and the appendix: pin versions, add the define and
the ALS shim, use `method: "jsonSchema"` / `providerStrategy` for structured output, disable or
replace summarization with server-side compaction, and do HITL inside tools.

## 4. Architecture sketch

```
┌────────────────────────── browser (SvelteKit static) ───────────────────────────┐
│  UI: replica · chat · plan (todos) · approval sheet · revision timeline · cost  │
│        ▲ typed AgentEvent stream                  │ user actions / approvals    │
│  ┌─────┴──────────────────────────────────────────▼────────────────────────┐    │
│  │ conductor (Claude, default claude-opus-5-5)                              │   │
│  │  loop: stream → tool_use → policy gate → run → tool_result (append-only)│    │
│  │  tools: write_todos · task(subagent) · search_manual · read_device_state │   │
│  │         propose_changeset · apply_changeset* · undo* · show_on_replica   │   │
│  │  subagents (fresh context, own prompt/tools/model/effort):               │   │
│  │    manual-expert · composer · sound-designer · device-operator           │   │
│  └───┬───────────────┬────────────────────┬─────────────────────┬──────────┘    │
│      │ tool registry │ approvals (HITL)   │ journal (undo/redo) │ memory (IDB)  │
│  ┌───▼───────────────▼────────────────────▼─────────────────────▼──────────┐    │
│  │ deterministic core: IR → MIDI / .xy / presets (tested, no LLM)          │    │
│  │ device queue (single-flight) → Web MIDI (OP-XY) · later MTP / audio      │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│  voice: @openai/agents-realtime (WebRTC) ── ask_claude ──► conductor             │
└─────────────┬──────────────────────────────────────────┬────────────────────────┘
      HTTPS + CORS                                  WebRTC / HTTPS
    api.anthropic.com                        api.openai.com (realtime)
                                  (* = mutate tools, gated by approval)
```

**Tool registry.** Tools are declared once with a zod schema and sent to the API as strict JSON
Schema (`strict: true`, `additionalProperties: false`). We validate with zod again on our side,
because strict schemas drop numeric ranges.

```ts
defineTool({
	name: 'set_tempo',
	kind: 'mutate', // 'read' | 'ui' | 'propose' | 'mutate' → default policy
	description: 'Set the project tempo (BPM). Changes device state; the user must approve.',
	input: z.object({ bpm: z.number().min(40).max(220) }).strict(),
	preview: (i, s) => ({ label: `Tempo ${s.tempo} → ${i.bpm} BPM`, replica: ['tempo'] }),
	inverse: (i, before) => ({ name: 'set_tempo', input: { bpm: before.tempo } }),
	run: (i, ctx) => ctx.device.setTempo(i.bpm)
});
```

The registry is sorted by name so the `tools` prefix is byte-stable for caching. Nothing dangerous
is exposed as a tool at all: no firmware, factory reset or project deletion.

**The model never writes bytes.** The composer and sound designer emit typed IR (Song → Scene →
Pattern → Track → Step with p-locks and step components; engine and preset parameters) through a
strict `submit_*` tool or `output_config.format`. SDK `messages.parse` with `zodOutputFormat`
returns schema-valid IR on Opus 5.5 [tested]. The IR must pin its conventions, such as 1-based
steps: in our test Opus returned 0-based steps when the schema didn't say.

**Changes follow propose → preview → approve → apply → verify → journal.**

- The device operator diffs the IR against the device state model and builds a `ChangeSet`.
- The replica shows ghosted changes.
- `apply_changeset` awaits `approvals.request()`, a Svelte sheet that offers approve, edit, reject
  with a note, or "allow this category for the session". A rejection returns an `is_error`
  `tool_result` carrying the user's note.
- Approved sets run through a **single-flight device queue**. Opus 5.5 happily issues parallel tool
  calls: in our test it ran the manual lookup and `set_tempo` in the same turn [tested], so ordering
  must be enforced in our code, not left to the prompt.
- Every applied set appends a revision
  `{rev, parent, changeset, inverse, stateHashBefore/After, firmware, threadId, toolCallId}`.
  Undo applies `inverse`. File-level changes (`.xy`) keep before and after snapshots in OPFS.

**Subagents** are just nested loops with their own system prompt, tool subset, model and effort,
and a fresh transcript. They return a compact report and never share the conductor's transcript,
which keeps the conductor's cache intact.

| Subagent        | Model / effort                                   | Tools                                                             | Output                                                       |
| --------------- | ------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| manual-expert   | Sonnet 5 / low (Haiku 4.5 for speed)             | `search_manual`, `show_on_replica`                                | cited answer plus key-combo steps for the replica to animate |
| composer        | Opus 5.5 / high (Fable 5.1 for big arrangements) | theory helpers, MIDI-file import, `validate_ir` (deterministic)   | `SongIR`                                                     |
| sound-designer  | Sonnet 5 / medium                                | engine/param tables, `validate_sound`                             | `SoundIR`                                                    |
| device-operator | Sonnet 5 / low                                   | `read_device_state`, `compile_changeset` (deterministic), dry run | `ChangeSet` (never applies)                                  |

**Planning.** `write_todos` holds typed plan state that the UI renders. The conductor writes it
first for multi-step jobs such as "Brother Louie, multi-scene", then follows analyse → structure →
per-scene patterns → sounds → mix → change set → apply → verify.

**Memory.**

- Threads are stored as append-only content-block arrays in IndexedDB.
- Long-term facts (preferences, device quirks, firmware) use Claude's memory tool
  (`memory_20250818`, `betaMemoryTool(handlers)`) with a `/memories/*` IndexedDB backend.
- Skills are `SKILL.md` playbooks shipped with the app. Their one-line descriptions are listed in
  the frozen system prompt and a `load_skill` tool loads the body on demand.
- Scratch files live in a per-thread VFS.
- Long threads use server-side compaction (`compact_20260112`, or compact-on-demand beta
  `compact-2026-09-04`), which is the shape Opus 5.5's preserved-thinking rules accept.

**Event stream to the UI.**

```ts
type AgentEvent =
	| { type: 'text'; agent: string; delta: string }
	| { type: 'progress'; agent: string; text: string } // thinking blocks with display "updates"
	| { type: 'tool_start' | 'tool_end'; agent: string; id: string; name: string; data: unknown }
	| { type: 'todos'; items: Todo[] }
	| { type: 'approval'; id: string; actions: ProposedAction[]; preview: ChangeSet }
	| { type: 'revision'; rev: Revision }
	| { type: 'usage'; agent: string; model: string; usage: Usage; usd: number }
	| { type: 'error' | 'done'; agent: string; detail: unknown };
```

Source these from SDK stream events. Set `eager_input_streaming: true` on tools whose IR payloads
are large so the UI can show progress while the IR is being written.

**Model API hygiene (Opus 5.5).**

- Omit `thinking` or send `{type:"adaptive", display:"updates"}` (beta
  `thinking-display-updates-2026-08-18`), and pass thinking blocks back unchanged.
- Use `tool_choice: auto` only.
- Set effort per route: conductor `medium`/`high`, subagents `low`.
- Handle `stop_reason: "refusal"`, with server-side fallback `fallbacks: "default"` (beta
  `server-side-fallback-2026-07-01`).
- Deliver dynamic state (device connected, firmware, current pattern) as **mid-conversation system
  messages**. Opus 5.5 supports them; Sonnet 5 doesn't, so use a `<system-reminder>` text block there.

**Threading.** Keep the agent on the main thread at first, because the work is network-bound. Web
MIDI isn't available in Workers, so moving the agent off the main thread later would need a
postMessage bridge to the device.

## 5. Model matrix (2026-09-26)

Claude models available to the owner's key, from `GET /v1/models` [tested]: `claude-opus-5-5`,
`claude-fable-5-1`, `claude-opus-5`, `claude-sonnet-5`, `claude-fable-5`, `claude-opus-4-8`,
`claude-opus-4-7`, `claude-sonnet-4-6`, `claude-opus-4-6`, `claude-opus-4-5-20251101`,
`claude-haiku-4-5-20251001`, `claude-sonnet-4-5-20250929`. The claude-api skill's cached table
(2026-06-24) predates Opus 5.5, so the app should build its model picker from the Models API
(`max_input_tokens`, `max_tokens`, `capabilities`).

| Provider / model                                                    | Context / max out | $ per MTok: in · 5m write · 1h write · cache read · out                        | Thinking · default effort          | Tools                                    | Voice   | Role                                      |
| ------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------ | ---------------------------------- | ---------------------------------------- | ------- | ----------------------------------------- |
| Anthropic `claude-opus-5-5`                                         | 1M / 128K         | 4 · 5 · 8 · 0.20 · 20                                                          | adaptive, always on · medium       | ✅ no forced `tool_choice`; strict tools | ❌      | **conductor, composer**                   |
| Anthropic `claude-sonnet-5`                                         | 1M / 128K         | 2 · 2.50 · 4 · 0.20 · 10                                                       | adaptive · high                    | ✅                                       | ❌      | subagents, budget conductor               |
| Anthropic `claude-haiku-4-5`                                        | 200K / 64K        | 1 · 1.25 · 2 · 0.10 · 5                                                        | extended (`budget_tokens`) · n/a   | ✅                                       | ❌      | fast lookups (cache minimum 4,096 tokens) |
| Anthropic `claude-fable-5-1`                                        | 1M / 128K         | 10 · 12.50 · 20 · 0.25 · 50                                                    | adaptive, always on · high         | ✅ no forced `tool_choice`               | ❌      | hardest arrangements                      |
| Anthropic `claude-opus-5` (legacy)                                  | 1M / 128K         | 5 · 6.25 · 10 · 0.50 · 25                                                      | adaptive, can be disabled at ≤high | ✅                                       | ❌      | —                                         |
| OpenAI `gpt-realtime-2.1`                                           | 128K / 32K        | text 4 · cached 0.40 · out 24; **audio 32 · cached 0.40 · out 64**; image in 5 | reasoning effort minimal–xhigh     | ✅ function calling                      | ✅      | **voice front-end**                       |
| OpenAI `gpt-realtime-2.1-mini`                                      | —                 | text 0.60 · 0.06 · 2.40; **audio 10 · 0.30 · 20**                              | configurable                       | ✅                                       | ✅      | cheap voice                               |
| OpenAI `gpt-transcribe` / `gpt-live-transcribe` / `gpt-4o-mini-tts` | —                 | $0.0045/min · $0.017/min · text in 0.60 + audio out 12 per MTok                | —                                  | —                                        | STT/TTS | cascaded "Claude-brain" voice             |

Other facts [docs]: fast mode for Opus 5.5 costs $8/$40. The Batch API halves prices but isn't
CORS-enabled. `inference_geo: "us"` multiplies prices by 1.1. The 1M context is billed at standard
rates. Cache minimums are 512 tokens (Opus 5.5, Fable 5.1), 1,024 (Sonnet 5) and 4,096 (Haiku 4.5).
Cache reads don't count toward input-token rate limits on most models. The Models API shows no audio
capability for any Claude model [tested]. OpenAI realtime models available to the owner's key:
`gpt-realtime`, `-1.5`, `-2`, `-2.1`, `-2.1-mini`, `-2025-08-28`, `-mini`, `-mini-2025-12-15`,
`-translate`, `-whisper` [tested].

## 6. Claude from the browser [tested]

- **CORS.**
  - A preflight to `/v1/messages`, `/v1/messages/count_tokens` or `/v1/models` returns 200 with
    `access-control-allow-origin: *` and allows `x-api-key`, `anthropic-version`,
    `anthropic-dangerous-direct-browser-access` and `content-type`.
  - A real request with `Origin` but without the dangerous header returns
    **401 "CORS requests must set 'anthropic-dangerous-direct-browser-access' header"**. With the
    header it returns 200.
  - `/v1/files` and `/v1/messages/batches` preflights return **400 with no ACAO**, so they can't be
    used from a static site. Send the manual inline and rely on caching.
- **SDK in the page.** `new Anthropic({ apiKey, dangerouslyAllowBrowser: true })` sends the header.
  `@langchain/anthropic` hard-codes it; `@ai-sdk/anthropic` does not.
- **Streaming.** SSE (`text/event-stream`) streams through CORS fine.
  - Deep Agents: first chunk after 0.64–1.36 s.
  - SDK tool runner on Opus 5.5: first delta at 1.13 s; a 2-turn tool loop took 3.7 s.
  - SDK tool runner on Sonnet 5: 1.98 s to first delta; 3 turns took 4.5 s.
- **Grounding.** `search_result` blocks with `citations: {enabled: true}` returned
  `search_result_location` citations carrying `source`, `title` and `cited_text` (Sonnet 5).
  Citations can't be combined with `output_config.format`. Manual answers and IR extraction are
  separate calls anyway.
- **Key check.** Validate a key with `GET /v1/models`, which is free, returns the models the key can
  use, and is CORS-enabled.

## 7. Prompt-caching plan for the manual

**Measured size** [tested, Anthropic `count_tokens`]:

| Source                                                        | Size   | Opus 5.5 / Sonnet 5 tokens | Haiku 4.5 tokens |
| ------------------------------------------------------------- | ------ | -------------------------- | ---------------- |
| 25 guide chapters (`knowledge/official/guide/*.md`, raw)      | 258 KB | 105,815                    | 86,659           |
| + changelog + specs                                           | 288 KB | 117,524                    | 95,321           |
| `chunks.jsonl` (159 chunks) raw text                          | —      | 87,142                     | —                |
| **Same, image links stripped, as 159 `search_result` blocks** | —      | **69,484**                 | ≈57k [estimate]  |

The manual we write ourselves (DECISIONS D2) will likely land at 50–90k tokens. It fits every model,
including Haiku's 200K.

**Placement.** Render order is `tools` → `system` → `messages`.

1. `tools`: stable and sorted.
2. `system`: the frozen conductor instructions. No dates, no device state, no per-user data.
3. `messages[0]` (user): the manual as `search_result` blocks (`source` = our unit URL or ID, with a
   link to the official section; `title`; `citations: {enabled: true}`), with an explicit
   `cache_control` on **the last manual block**.
4. Then the conversation, with top-level automatic caching for the growing tail. That uses 2 of the
   4 breakpoints.

Dynamic state goes in later messages as mid-conversation system messages (Opus 5.5) or
`<system-reminder>` text (Sonnet 5). The prefix is never edited. Subagents that need the whole
manual reuse the exact same `messages[0]` bytes. Every model has its own cache, so a Sonnet
manual-expert keeps a separate entry.

**Costs at 69.5k tokens** [estimate from docs prices; cache behaviour tested]:

| Model            | Cold write (5 min) | Write (1 h) | Warm read per call | Uncached per call |
| ---------------- | ------------------ | ----------- | ------------------ | ----------------- |
| Opus 5.5         | $0.35              | $0.56       | **$0.014**         | $0.28             |
| Sonnet 5         | $0.17              | $0.28       | **$0.014**         | $0.14             |
| Haiku 4.5 (≈57k) | $0.07              | $0.11       | $0.006             | $0.06             |
| Fable 5.1        | $0.87              | $1.39       | $0.017             | $0.69             |

A 10-call agent task on Opus 5.5 therefore spends about $0.14 re-reading the manual.

**Measured.** With the manual in context on Sonnet 5, time to first token was 1,060 ms on the cold
write and 955 ms on the warm read. `cache_creation_input_tokens` was 69,514, then
`cache_read_input_tokens` was 69,514 [tested]. A 16.8k-token system prompt showed the same
write-then-read pattern [tested].

**TTL policy.**

- Default 5-minute TTL while the user is active.
- Pre-warm with a `max_tokens: 0` request, no stream, when the agent panel opens.
- While the tab is visible and the user was active in the last ~20 minutes, send a keep-alive
  `max_tokens: 0` re-send every ~4.5 minutes ($0.014 each). That beats paying the 1-hour write for
  short pauses.
- Use 1-hour TTL only for "leave it open all evening" sessions.
- Verify in CI: a second identical request must show `cache_read_input_tokens > 0`. Use cache
  diagnostics (beta `cache-diagnosis-2026-04-07`) when debugging misses.

**Alternative if cost or latency matters.** Keep the conductor lean (instructions plus a ~5k-token
manual digest) and give it `search_manual`, a local MiniSearch/BM25 index over our manual units that
returns 3–6 `search_result` blocks with citations. Route global "how does X relate to Y" questions
to the manual-expert subagent holding the full cached manual. Pick between the two plans with evals.

**Bandwidth caveat.** Every request re-uploads the full prompt, about 300 KB of JSON with the
manual, because caching saves compute, not upload, and the Files API is not CORS-enabled. That is
fine on broadband but worth watching on mobile.

## 8. Voice architecture

**The transport tested in the browser is WebRTC** [tested].

- The page `POST`s `https://api.openai.com/v1/realtime/client_secrets` with the user's key and a
  session config (model, instructions, voice, tools). The response is `ek_…` (35 characters),
  expiring after the `expires_after` we asked for (600 s). CORS is `*` and it took 645 ms from the
  browser.
- The page then `POST`s its SDP offer to `/v1/realtime/calls` with the ephemeral key
  (`Content-Type: application/sdp`). That returned 201 in 993 ms with an audio track and the
  `oai-events` data channel open about 2.0 s after start.
- The function-call round trip went like this:
  - The model first spoke a filler ("I'll pass that along…").
  - It then emitted `response.function_call_arguments.done` for `ask_claude` with the verbatim
    request about 1.2 s after `response.create`.
  - After our `function_call_output` and a new `response.create`, it spoke the result about 1 s
    later.
  - Turn usage was 378 text tokens in, 59 text plus 68 audio tokens out.
- `@openai/agents-realtime` (`RealtimeAgent` + `RealtimeSession`, WebRTC by default in browsers)
  did the same: connected in 1.17 s including the mint, executed the tool in the browser, and spoke
  the result at 4.0 s.
- WebSocket from a browser has to authenticate through the `openai-insecure-api-key.<key>`
  subprotocol [source] and needs its own audio plumbing. Prefer WebRTC.

**OpenAI's guidance is "use standard API keys only on the server"** [docs]. With BYO keys the key is
already in the user's browser, so our mitigation is to use the standard key for exactly one call, the
mint, and do everything else with the short-lived `ek_`.

**Bridge to Claude: the voice model is the front end.** It has a few instant local tools
(transport, "what's on screen", highlight a key) and one delegation tool:

```ts
tool({
	name: 'ask_claude',
	description: 'Delegate any OP-XY / music request to the Claude agent and read back its answer.',
	parameters: z.object({ request: z.string() }),
	execute: async ({ request }) => {
		const run = conductor.start(request, { channel: 'voice' }); // same harness as chat
		const quick = await Promise.race([run.done, sleep(6000).then(() => null)]);
		if (quick) return quick.spokenSummary; // short answer, spoken now
		run.done.then((r) => session.sendMessage(`[agent result] ${r.spokenSummary}`)); // spoken later
		return 'Working on it — I will report back.'; // keep the conversation flowing
	}
});
```

- **Approvals by voice.** The conductor's approval request appears in the UI and is also sent to
  the voice session ("Change tempo to 120?"). The user can click, or say yes, which the voice model
  turns into a `resolve_approval({id, decision})` call. Whether a spoken yes alone may authorize
  project or sound changes is an open question (§12).
- **Mic selection is required.** The OP-XY enumerates as a USB audio input (see `90-device-probe.md`), so
  `getUserMedia({audio:true})` may grab the synth instead of the mic. Always choose `deviceId`
  explicitly. Recommend headphones, or push-to-talk (`turn_detection: null` with manual commit),
  while the OP-XY plays through speakers.
- **Latency.** Mint (can be done early) 0.65 s, SDP 1.0 s, spoken acknowledgement about 1.2 s. The
  Claude leg adds about 1 s to first token plus the tool loop, so the filler covers it.
- **Cost** [estimate]. About 600 input-audio tokens and 1,200 output-audio tokens per minute gives
  gpt-realtime-2.1 roughly $0.02/min for listening and $0.08/min for speaking. Mini is about
  3× cheaper. Long sessions grow 2–5× without cached input. Claude costs come on top per delegated
  request.
- **Anthropic voice.** The Claude API is text and image in, text out, and its Models API lists no
  audio capability [tested, docs]. Claude's consumer apps have a voice mode with model choice since
  July 2026 (TechCrunch), but there is no developer realtime speech API. A "Claude-brain" voice
  therefore means a cascade: STT (`gpt-live-transcribe`/`gpt-realtime-whisper`, or the Web Speech
  API) → Claude → TTS (`gpt-4o-mini-tts`, or `speechSynthesis`). It is slower but fully Claude. The
  Claude cookbook shows the same pattern with ElevenLabs.

## 9. Security notes for BYO keys on a static site

- **Where keys go.** Keys are sent only to `api.anthropic.com` and `api.openai.com`, over HTTPS in
  headers. No proxy, no telemetry, never in URLs, and never in exported transcripts or debug
  bundles. The key screen lists these endpoints.
- **Storage.** Default to memory or `sessionStorage`. A "Remember on this device" toggle stores the
  key in IndexedDB, optionally encrypted with AES-GCM under a passphrase-derived key (PBKDF2). Offer
  "Forget keys". Be honest in the UI that no browser storage protects against script running on our
  own origin. The real defenses are below.
- **XSS and supply chain are the threat.**
  - **Strict CSP.** SvelteKit `kit.csp` in hash mode emits a meta CSP for prerendered pages:
    `default-src 'self'; script-src 'self'; connect-src 'self' https://api.anthropic.com https://api.openai.com; object-src 'none'; base-uri 'none'; form-action 'none'`.
    `connect-src` limits where injected code can `fetch` a key to.
  - No third-party scripts or analytics.
  - Pin exact versions with the lockfile, keep pnpm's default blocking of build scripts, and
    consider pnpm's `minimumReleaseAge`.
  - Render model and markdown output sanitized, with no `{@html}` of raw model text.
  - GitHub Pages can't set headers (no `frame-ancestors`). Cloudflare or Netlify can.
- **Least privilege.**
  - Anthropic: a dedicated workspace with a spend limit and a key scoped to it.
  - OpenAI: a project key restricted to what voice needs, with a monthly budget.
  - Realtime uses ephemeral `ek_` secrets with short TTLs.
- **Detect and validate keys.**
  - Identify the provider by prefix: `sk-ant-` is Anthropic; `sk-proj-` or other `sk-` is OpenAI.
    The owner's `.env` shows why this matters.
  - Validate with free `GET /v1/models` calls.
  - Surface 401/403/429 errors plainly, including rate-limit tier hints: realtime Tier 1 is 40k TPM.
- **Device safety is independent of the model.** Mutate tools are always gated in code. Nothing
  irreversible is exposed as a tool. Treat imported files and names as untrusted text that can't
  grant permissions.

## 10. Packages (exact versions, 2026-09-26)

| Package                                                                                                                                                                                                                  | Version                                                                          | Why                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `@anthropic-ai/sdk`                                                                                                                                                                                                      | **0.128.0**                                                                      | Harness: messages, streaming, tool runner, parse, memory tool, compaction        |
| `zod`                                                                                                                                                                                                                    | **4.6.5**                                                                        | Tool and IR schemas                                                              |
| `@openai/agents-realtime`                                                                                                                                                                                                | **0.18.0**                                                                       | Voice session (WebRTC), tools, approvals (pulls in `@openai/agents-core@0.18.0`) |
| `idb`                                                                                                                                                                                                                    | **8.0.3**                                                                        | IndexedDB wrapper (threads, memories, VFS, journal, settings)                    |
| `minisearch`                                                                                                                                                                                                             | **7.2.0**                                                                        | Local manual retrieval for `search_manual` (alternative: `@orama/orama@3.1.18`)  |
| _(optional)_ `ai` / `@ai-sdk/anthropic` / `@ai-sdk/openai` / `@ai-sdk/svelte`                                                                                                                                            | 7.0.116 / 4.0.65 / 4.0.78 / 5.0.116                                              | Only if multi-provider text agents become a requirement                          |
| _(if Deep Agents)_ `deepagents` + `langchain` + `@langchain/core` + `@langchain/langgraph` + `@langchain/langgraph-checkpoint` + `@langchain/langgraph-sdk` + `@langchain/anthropic` + `@langchain/openai` + `langsmith` | 1.14.1 · 1.5.12 · 1.2.12 · 1.4.18 · 1.1.5 · 1.12.0 · 1.5.11 · 1.5.13 · **0.9.0** | langsmith must stay below 0.10 because of the peer range                         |
| _(not usable)_ `@anthropic-ai/claude-agent-sdk`                                                                                                                                                                          | 0.3.283                                                                          | Node plus native binaries                                                        |

`openai@7.23.0` isn't needed: minting a client secret is one `fetch`.

## 11. Live smoke test (no secrets) [tested]

Keys were read from `.env` into memory only, selected by prefix because the labels are swapped, and
every line of output was scrubbed of key values.

| Check                                                   | Result                                                                                                                                                |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude, one strict tool, `claude-opus-5`, effort low    | `stop_reason: tool_use` → `set_tempo {"bpm":96}` (430 input / 51 output tokens, 2.6 s), then a tool result → `end_turn` "Tempo is now 96 BPM."        |
| Claude on `claude-opus-5-5`, both harnesses in Chromium | Deep Agents (ChatAnthropic) and the SDK tool runner both completed tool loops with approvals                                                          |
| Structured output on `claude-opus-5-5`                  | SDK `messages.parse` + `zodOutputFormat` ✅. LangChain `withStructuredOutput` default ❌ 400 (forced `tool_choice`); `method: "jsonSchema"` ✅        |
| Prompt caching                                          | Sonnet 5, 16.8k and 69.5k-token prefixes: writes then reads as expected                                                                               |
| `search_result` citations                               | ✅ `search_result_location` with source and title                                                                                                     |
| OpenAI `GET /v1/models`                                 | 132 models, 10 of them realtime (§5)                                                                                                                  |
| Mint realtime client secret                             | HTTP 200 in 694 ms (Node) and 645 ms (browser). Fields `value` (`ek_…`), `expires_at` (+600 s), `session` (echoes model `gpt-realtime-2.1` and tools) |
| CORS preflights                                         | Anthropic messages, models, count_tokens and OpenAI client_secrets, calls, responses, models: all `*`. Anthropic files and batches: blocked           |

## 12. Open questions

1. Was the owner's Anthropic org created on or after 2026-08-31? If so, the Opus 5.5 prefix check
   is enforced by default. We design append-only either way.
2. Default conductor: Opus 5.5 (quality) or Sonnet 5 (half price, lower latency)? Decide with evals
   on real OP-XY tasks: teach, program, live control.
3. Manual strategy: full cached manual in the conductor, or a lean conductor with retrieval plus a
   manual-expert subagent? This depends on the size of our reworded manual (D2).
4. Voice: `gpt-realtime-2.1` or `-mini` by default? May a spoken "yes" approve device changes, or
   must it be a click? Push-to-talk by default in a music app?
5. Do users need non-Claude text models for the main agent? If yes, add an AI SDK provider adapter.
6. Key storage default (session only or remembered) and the passphrase UX.
7. Hosting: GitHub Pages (meta CSP only) or Cloudflare/Netlify (full security headers)?
8. Undo for live MIDI changes needs device read-back to verify state. Which parameters can be read
   back over MIDI on OS 1.1.33? (Links to the device-probe work.)
9. Observability: a local trace viewer in IndexedDB, or an opt-in export (OTel or LangSmith with
   the user's own key)?
10. The ALS shim idea could be upstreamed to LangChain as a documented browser mode, or
    `deepagents` could fix `runTask` to pass `config`. Worth filing an issue if the owner wants
    Deep Agents kept viable.

---

## Appendix — reproduction snippets

**Vite fix #1: picomatch reads `process.*` at module init.**

```ts
// vite.config.ts
define: { 'process.platform': JSON.stringify('browser'), 'process.version': JSON.stringify('v22.0.0') }
```

**Fix #2a: stack-based ALS shim.** Install once before running an agent. Not isolated across
concurrent branches.

```ts
class StackALS<T> {
	#stack: { ctx: T | undefined }[] = [];
	getStore() {
		return this.#stack.at(-1)?.ctx;
	}
	run<R>(ctx: T, fn: () => R): R {
		const e = { ctx };
		this.#stack.push(e);
		const restore = () => {
			const i = this.#stack.lastIndexOf(e);
			if (i !== -1) this.#stack.splice(i, 1);
		};
		try {
			const r: any = fn();
			if (r && typeof r.then === 'function')
				return r.then(
					(v: any) => (restore(), v),
					(err: any) => {
						restore();
						throw err;
					}
				);
			restore();
			return r;
		} catch (err) {
			restore();
			throw err;
		}
	}
	enterWith(ctx: T) {
		const top = this.#stack.at(-1);
		if (top) top.ctx = ctx;
		else this.#stack.push({ ctx });
	}
}
(globalThis as any)[Symbol.for('ls:tracing_async_local_storage')] ??= new StackALS();
```

**Fix #2b: patch instead of the shim, for subagents only.** In `deepagents/dist/*` inside `runTask`,
replace `getCurrentTaskInput()` with `getCurrentTaskInput(config)`. Do HITL inside the tool instead
of `interruptOn`, and use backend factories:
`backend: (rt) => new CompositeBackend(new StateBackend(rt), { '/memories/': new StoreBackend(rt) })`.

**Recommended harness core: browser, SDK tool runner, approval inside the tool** (ran on Sonnet 5
and Opus 5.5).

```ts
const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
const setTempo = betaZodTool({
	name: 'set_tempo',
	description: 'Set tempo (BPM). Changes device state; the user must approve.',
	inputSchema: z.object({ bpm: z.number().min(40).max(220) }),
	run: async ({ bpm }) =>
		(await approvals.request(`set_tempo(${bpm})`)) ? device.setTempo(bpm) : 'User declined.'
});
const runner = client.beta.messages.toolRunner({
	model: 'claude-opus-5-5',
	max_tokens: 16000,
	stream: true,
	max_iterations: 12,
	system: [{ type: 'text', text: FROZEN_SYSTEM }],
	tools: [setTempo, searchManual],
	messages: [
		{
			role: 'user',
			content: [
				...manualSearchResults /* last one has cache_control */,
				{ type: 'text', text: question }
			]
		}
	]
});
for await (const stream of runner) for await (const ev of stream) emitToUi(ev);
```

**Realtime from the browser: mint, then WebRTC** (ran on `gpt-realtime-2.1`).

```ts
const { value: ek } = await (
	await fetch('https://api.openai.com/v1/realtime/client_secrets', {
		method: 'POST',
		headers: { Authorization: `Bearer ${userKey}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			expires_after: { anchor: 'created_at', seconds: 600 },
			session: {
				type: 'realtime',
				model: 'gpt-realtime-2.1',
				instructions,
				audio: { output: { voice: 'marin' } },
				tools
			}
		})
	})
).json();
const pc = new RTCPeerConnection();
pc.addTrack(micTrack);
const dc = pc.createDataChannel('oai-events');
await pc.setLocalDescription(await pc.createOffer());
const answer = await (
	await fetch('https://api.openai.com/v1/realtime/calls', {
		method: 'POST',
		body: pc.localDescription!.sdp,
		headers: { Authorization: `Bearer ${ek}`, 'Content-Type': 'application/sdp' }
	})
).text();
await pc.setRemoteDescription({ type: 'answer', sdp: answer });
// dc: on 'response.function_call_arguments.done' → run tool → send function_call_output + response.create
```

Sources: [Claude models overview](https://platform.claude.com/docs/en/about-claude/models/overview) ·
[Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing) ·
[Claude Opus 5.5](https://platform.claude.com/docs/en/models/opus-5-5/overview) ·
[What's new in Opus 5.5](https://platform.claude.com/docs/en/models/opus-5-5/whats-new-opus-5-5) ·
[Opus 5.5 migration guide](https://platform.claude.com/docs/en/models/opus-5-5/migration-guide) ·
[OpenAI pricing](https://developers.openai.com/api/docs/pricing) ·
[gpt-realtime-2.1](https://developers.openai.com/api/docs/models/gpt-realtime-2.1) ·
[OpenAI Realtime WebRTC guide](https://developers.openai.com/api/docs/guides/realtime-webrtc) ·
[GPT-Realtime-2.1 release (MarkTechPost)](https://www.marktechpost.com/2026/07/06/openai-gpt-realtime-2-1-mini-reasoning-realtime-api/) ·
[Realtime cost-per-minute math (Layer3 Labs)](https://www.layer3labs.io/guides/openai-realtime-api-pricing) ·
[Claude voice mode update (TechCrunch)](https://techcrunch.com/2026/07/23/anthropic-updates-claude-voice-mode-with-more-capable-models/) ·
[Claude cookbook: ElevenLabs voice](https://platform.claude.com/cookbook/third-party-elevenlabs-low-latency-stt-claude-tts) ·
`langchain-ai/deepagentsjs` @ `9a64a17` (2026-09-24), locally at `research/repos/langchain-ai_deepagentsjs`.
