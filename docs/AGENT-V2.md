# Agent v2 — an agent that learns the instrument on the replica, then teaches it or does it

> Written 2026-09-30, after the Brother Louie rehearsals. This is the plan for the AI layer; the
> replica, the device layer and the manual stay. Read with `docs/VISION.md` (the north star) and
> `docs/DECISIONS.md` D12 (the decision this plan carries out).

## Why a second version

**What v1 got right.** A small harness of our own (D4): a streaming loop on the Messages API, typed
tools, an approval gate, a single-flight device queue, a journal, `task` subagents and the device
safety choke point. The evals are real: quality 34/34, how-to 25/25, manual 40/42, device 18/18,
demo moments 10/10. Sonnet 5.5 is a very capable model. The loop is not the problem.

**What failed, and why.** Every new ability arrived as another sentence in the system prompt or
another purpose-built tool:

- **One context for everything.** Every request carries about 5,000 tokens of rules (31 bullet
  paragraphs, each traceable to one incident) and the whole manual, about 90,000 tokens. The rules
  are a maze of special cases. The model navigates between them and fails in the gaps, and the
  prompt's bullet-wall format bleeds into its answers.
- **No way to think with code.** The agent cannot compute. A MIDI file with 5,000 notes is either
  read as text or retyped through tool calls: that blew the output limit. So I wrote
  `import_midi`, then patched its heuristics round after round.
- **No lab.** Apart from `plan_steps`, which tries key paths on a copy of the simulator, the agent
  cannot try something, measure it and try again before it acts or answers.
- **No memory.** D4 promised memory and skills as files; neither was built. Nothing the agent
  learns survives the chat.
- **No grounding.** Nothing checks the answer against what changed: the agent said it set a duck it
  had only planned.
- **Evals of answers, not outcomes.** The judge scores a transcript. Nothing measures whether a
  user, guided by the agent, actually got the OP-XY to do what they wanted.

Brother Louie took about a dozen rounds, and nearly every fix was a new rule or heuristic. That
makes an eval pass without making the agent smarter.

## What we are building

An agent that uses the replica as its lab: it reads the machine, tries ideas on copies of it,
listens to the result, and only then applies the change or teaches the user to make it with their
own hands. It serves the whole range of OP-XY owners, from someone who wants a nice loop in two
minutes to a veteran who sequences external gear. It is honest about what it did, and it gets better
with use.

### Principles

1. **The replica is the lab.** Try on a copy, measure, then apply or teach. Nothing the agent says
   about a sound or an arrangement is a guess when it could have been measured.
2. **Deterministic core, AI on top (kept).** The model writes intent and small programs against
   typed, tested APIs; it never writes bytes. Code does the arithmetic; the model keeps the
   judgment.
3. **Lean context, knowledge on demand.** A short core prompt in prose. Skills load when a task
   calls for them. The manual comes as a map plus the units retrieved for each turn; the full
   manual lives with the manual expert.
4. **Every claim is grounded.** Before the model writes its answer, the harness hands it the exact
   list of what changed. The chat shows the same list with an undo.
5. **It learns.** Skills are curated know-how we ship. Memory is the user's level, gear and taste.
   Lessons come from tasks that needed a correction; evals decide which ones become skills.
6. **Teach or do, at the user's level.** Doing is fast and complete. Teaching lights the keys and
   watches the user's hands. The agent works out which one the user wants, and how deep to go.
7. **Measure outcomes.** Simulated users with goals and skill levels act on the replica; success is
   the replica's state, not a judge's opinion.
8. **The truth triangle.** The device checks the replica (captures, sessions), the replica checks
   the manual (every procedure run on the simulator), and the agent stands on both.

## Architecture

The loop, executor, approvals, device queue, journal and the tools' typed contracts stay. Around
them:

| Piece             | Where                                               | What it does                                                                                                                                                                                                                             |
| ----------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core prompt       | `src/lib/agent/prompts.ts` (`CORE_ROLE`)            | Who the users are, the product, teach vs do, the lab, grounding, the key grammar, when to format, device safety. Prose with reasons, no tool names.                                                                                      |
| Skills            | `knowledge/skills/<name>/SKILL.md` (+ `reference/`) | Procedures with judgment, worked examples, pitfalls, the lab functions to use. The Agent Skills format (the same `SKILL.md` Claude Code, Codex and Deep Agents read).                                                                    |
| Skill runtime     | `src/lib/agent/skills.ts`, tool `skill`             | The index (names and descriptions) sits in the prompt; the model loads a skill's body or a reference file when the task calls for it. The harness announces a skill when the trigger is certain (a MIDI file attached).                  |
| Manual in context | `manual-source.ts`                                  | A/B: the full bundle (v1) or a map (unit ids, titles, one line each) plus the top units retrieved for each user turn (BM25, no extra model call).                                                                                        |
| Lab               | `src/lib/agent/lab/`, tool `run_lab`                | The model's code runs in a sandboxed worker against a typed API over forks of the replica. The last section describes the API.                                                                                                           |
| Grounding         | `src/lib/agent/grounding.ts`                        | A readable diff of the replica against the start of the turn, added after each batch of tool results and shown at the end of the turn.                                                                                                   |
| Memory            | `src/lib/agent/memory.ts`, tool `memory`            | The API's memory tool (`memory_20250818`) on IndexedDB: `/memories/user.md` (level, gear, taste), `/memories/lessons/…`, per-project notes. Never shipped, never shared.                                                                 |
| Subagents         | `subagents.ts`                                      | The manual expert (the full manual in its own context), an arranger (the lab plus a skill, for heavy jobs in isolation) and a checker (the result against the goal). A subagent only exists where its own context or parallel tries pay. |
| Context care      | `loop.ts`                                           | Old lab and tool results are cleared on long threads (context editing); compaction near the limit.                                                                                                                                       |

### The lab

The model writes a short async JavaScript body; `lab` is in scope. It runs in a Web Worker, with
no network, no storage and no DOM, stopped after a time limit. In Node (tests, evals) it runs
in-process. Everything the lab can do goes through its API:

```ts
interface Lab {
	files: { names(): string[]; midi(name: string): MidiFileNotes };
	fork(from?: Fork): Fork; // a copy of the replica as it stands (or of another fork)
	midi: { shapes(read): TrackShape[]; plan(read, options): ImportPlan; write(fork, plan): void };
	listen(fork: Fork, options?: { seconds?; tracks?: 'each' }): Promise<Heard>; // offline render + analysis
	commit(fork: Fork, label: string): ReplicaDiff; // onto the real replica, with an undo point
	log(...values: unknown[]): void; // what the model reads back (truncated)
}
interface Fork extends VirtualOpxy {
	// the replica's own API on a copy: status, readPattern/writePattern, readArrangement/
	// writeArrangement, readSound, setTempo, setMetronome, plan(goal) …
	set(goal): NavPlan; // a setting reached through the keys on the copy (the navigator)
	press(combo: string): string; // key grammar on the copy; returns what the screen shows
	screen(): string;
	diff(against?: Fork): ReplicaDiff;
}
```

With it the agent can try three arrangements of a MIDI file on three forks, listen to each, keep
the best and commit it. It can reshape patterns for a chorus, transpose a song, humanise hats, build
a breakdown, or tune a filter by ear until the brightness matches "warm". It does this in one
tool call instead of forty. Offline listening reuses the eval ears' renderer (a saved replica state
through the app's own sound in an `OfflineAudioContext`), moved into `src/lib`.

### Skills, the first set

`midi-to-opxy` (the compromises: which parts go where, merges, what to drop, trying mappings in the
lab), `compose-a-beat`, `song-arrangement` (scenes, songs, breakdowns, variations),
`sound-from-an-idea` (reading a sound, changing it by ear), `sidechain-pump`, `teach-a-walkthrough`
(lit keys, the user's pace, checking their hands), `first-five-minutes` (a beginner's first win),
`kit-from-samples` (the preset maker), `device-transfer` (MTP, what travels), `midi-gear` (channels,
clock, external instruments), `sheet-music-and-images`, `listening`.

Each skill says what good looks like and why, the judgment calls, the pitfalls we have seen, and the
lab functions to use. They follow the prompt-audit rules (`.agents/skills/claude-api`): prose for
behaviour, no pressure language, no single gold example.

### Memory and learning

- **Runtime:** the agent reads `/memories/user.md` at the start of a conversation and keeps it
  current (their level, gear, OS, the styles they like, how they like to learn). When the user
  corrects it, it writes a lesson.
- **Developer time (the skill forge):** eval failures and lessons are reviewed; the ones that
  generalise become skill edits, and the evals must improve. Nothing in the core prompt grows
  from one incident.

## Evals

- **Regression (kept):** quality, how-to, manual, device, files, demo; the judge sees what the
  agent saw.
- **Episodes (new, the north star):** `evals/agent/episodes.mjs`. A simulated user with a persona,
  a level and a goal, from "I just got this, make something cool" to "route the arp to my Minilogue
  on channel 3". The simulated user acts on the replica through key presses, reading only its
  screen. Success is checked on the replica's state. We report success rate, turns, cost and time
  per persona.
- **Lab tasks (new):** arrangement and sound tasks whose results are measured.
- **Skill triggers (new):** does the right skill load for a request, and only then.
- **Manual by use (new):** which units the agent retrieves in successful episodes and in failed
  ones; the navigator runs every manual procedure on the simulator and checks it lands.
- **Honesty (new):** claims in answers checked against the grounding diff.

## Phases

Each phase lands with its tests and evals, on `main`, one commit or more.

1. **V2.0 — Plan and baseline.** This document, D12, v1 numbers kept for comparison.
2. **V2.1 — Lean core and skills.** Skill runtime and tool; core prompt rewritten in prose; the
   rules moved into skills; the manual A/B (full vs map plus retrieval). Done when v2 matches or
   beats v1 on the regression evals.
3. **V2.2 — Grounding.** The replica diff after each tool batch and at the end of the turn. Done
   when the honesty check finds no claim the diff does not support.
4. **V2.3 — The lab.** Worker sandbox, forks, commit, offline listening; `midi-to-opxy` moves onto
   it. Done when the lab tasks pass and Brother Louie is arranged by comparing measured options.
5. **V2.4 — Memory.** The memory tool on IndexedDB; user profile and lessons.
6. **V2.5 — Episodes.** Simulated users across the range; the north-star numbers.
7. **V2.6 — Specialists.** Arranger and checker subagents where the numbers show they pay.
8. **V2.7 — The experience.** A change card with undo, readable lab and skill activity, level
   aware teaching that watches the user's keys on the replica and on the device.
9. **V2.8 — Knowledge by use.** The manual audited by the episodes; every procedure checked on the
   simulator; weak units rewritten.

## Risks

- **Retrieval may answer worse than the full manual.** The A/B decides; the full bundle stays as
  a mode.
- **Model-written code in the browser.** The worker gets no network, storage or secrets; it is
  terminated on a time limit; everything it changes goes through `commit`, which is undoable.
- **The replica is not the device.** Where they may differ the knowledge says so (`unverified on
the unit`), and device sessions keep closing the gaps.
- **Simulated users can be too kind.** Varied personas, some impatient or vague; success comes
  from the replica's state, never from the simulated user's word.
