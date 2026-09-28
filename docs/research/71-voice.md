# 71 — Voice: OpenAI realtime over WebRTC as a front end for the Claude conductor (M8)

> Research date: 2026-09-28. **[docs]** means OpenAI's documentation fetched today; **[tested]**
> means we ran it today against the live API with the owner's key (`evals/voice/smoke.mjs`, no key
> or secret value printed); **[fake]** means covered by our tests against the fake realtime API.
> Builds on note 70 §8, which tested the WebRTC path in Chromium on 2026-09-26. Nothing was sent to
> the OP-XY.

## TL;DR

1. **The flow is unchanged since note 70 and still the documented one for browsers** [docs]: the
   page mints a short-lived client secret (`ek_…`) with the user's key at
   `POST /v1/realtime/client_secrets`, then posts its SDP offer to `POST /v1/realtime/calls` with
   that secret (`Content-Type: application/sdp`); events flow on the `oai-events` data channel. We
   use the user's key for exactly that one call and give the secret 120 s (the API allows
   10–7200 s, default 600): only the SDP exchange, a second later, needs it.
2. **Model: `gpt-realtime-2.1`** (default) or **`gpt-realtime-2.1-mini`** (about a third of the
   price) [docs]. Both accepted the app's exact session, in both modes, on the live API [tested].
3. **OpenAI now also has GPT-Live** (`gpt-live-1` on `POST /v1/live/sessions`, $0.05/min) built for
   exactly "voice front end + backend agent", with a _client delegation_ mode [docs]. We stay on
   the Realtime API: client delegation runs over a server-side sideband WebSocket and its
   delegation event carries no task text; sessions are created by "your application server" with
   the project key; and no push-to-talk controls are documented. Worth a second look if it gains a
   browser path (§10).
4. **Push-to-talk over WebRTC** follows the realtime guide [docs]: turn detection `null`; on key
   down `input_audio_buffer.clear` (plus `response.cancel` and `output_audio_buffer.clear` if the
   voice is talking); on key up `input_audio_buffer.commit`, then `response.create`. We ask for the
   response only once `input_audio_buffer.committed` arrives, so an empty commit
   (`input_audio_buffer_commit_empty`) never triggers a reply to nothing, keep the mic open 250 ms
   after the key comes up, and drop holds under 250 ms (the API wants ≥ 100 ms of audio) [fake].
5. **Hands-free** uses `semantic_vad` with `create_response` and `interrupt_response`. With WebRTC
   "the server will automatically truncate unplayed audio when there's a user interruption" [docs],
   so `conversation.item.truncate` (the WebSocket procedure) is never sent.
6. **Delegation:** one tool, `ask_claude({ request })`, sends the request to the conductor as a
   normal user turn (it shows in the chat, uses the same tools, approvals and undo) and returns at
   the conductor's next stop: its answer, reduced to plain speakable sentences, or a change waiting
   for approval. A request running over 20 s returns `working`; its result comes later as a system
   note ("Update from Claude: …") and a response once the floor is free [fake]. Live, the model
   handed an OP-XY question to `ask_claude` verbatim and said the answer in one sentence [tested].
7. **Spoken approvals** go through the same `Conductor.decide` as the approval sheet, but a yes
   counts only if the user spoke after the question and the transcript of what they said is a
   clear yes (§6). Live, the model put a scripted approval to the user in one sentence and turned
   "Yes, go ahead." into `answer_approval {"approve":true}` [tested].

## 1. Why not the alternatives

| Option                                             | Verdict                                                                                                                                                                                               |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Realtime API, WebRTC, ephemeral secret             | **Chosen.** Documented for browsers; tested in Chromium (note 70) and today; function calling; push-to-talk and VAD; the audio never passes through our code.                                         |
| Realtime API, WebSocket                            | Needs our own audio capture and playback; a browser authenticates through the `openai-insecure-api-key.<key>` subprotocol. Used only by the Node smoke test (text only, with the short-lived secret). |
| GPT-Live (`gpt-live-1`, `/v1/live/sessions`)       | Designed for delegation, but client delegation expects a server-side sideband socket, the delegation event has no task text, and push-to-talk is not documented [docs]. Revisit later.                |
| `@openai/agents-realtime` (note 70: works)         | 262 KB gzip, and its session model would sit between the realtime events and our approval rules. Our own protocol code (a pure state machine plus a small WebRTC adapter) is a few KB.                |
| Cascade (speech-to-text → Claude → text-to-speech) | All-Claude but slower and no barge-in for free; the realtime model's turn-taking is the point.                                                                                                        |

## 2. The session the app asks for [docs, tested]

`sessionConfig()` (`src/lib/core/voice/config.ts`) builds the `session` for the mint and for
`session.update`:

- `type: 'realtime'`, `model`, short `instructions` (a front desk that hands every OP-XY question or
  action to Claude and says results in a sentence or two, in the user's language; never reads
  lists, tables, citations or key-by-key steps aloud; asks for a yes or no when an approval comes
  back and never answers for the user).
- `output_modalities: ['audio']`, `audio.output.voice: 'marin'`.
- `audio.input.noise_reduction: { type: 'near_field' }` (a person at a laptop or headset).
- `audio.input.transcription: { model: 'gpt-live-transcribe', keywords: [...] }`: the guide's
  recommended model, which streams deltas; `keywords` carries the device's words (OP-XY, M1–M4,
  shift, arpeggio, maestro, brain, punch-in, p-lock, the engine names…), which a general model
  mishears.
- `audio.input.turn_detection`: `null` (push-to-talk) or
  `{ type: 'semantic_vad', eagerness: 'auto', create_response: true, interrupt_response: true }`.
- `tools` (below), `tool_choice: 'auto'`, `max_output_tokens: 2048` (a spoken reply cannot run on),
  `reasoning: { effort: 'low' }` where the model takes it (a model that refuses the field gets one
  more mint without it).

Switching mode in a live call is a `session.update` with only
`{ type: 'realtime', audio: { input: { turn_detection } } }` ("only the fields that are present
are updated; to clear `turn_detection`, pass `null`" [docs]). Voice and model cannot change in a
live session [docs]; a new model applies from the next call.

## 3. Events used [docs]

Client → server: `session.update`, `input_audio_buffer.clear`, `input_audio_buffer.commit`,
`response.create`, `response.cancel` (optionally with `response_id`), `output_audio_buffer.clear`
(WebRTC/SIP only: "cut off the current audio response"), `conversation.item.create` with a
`function_call_output` (`call_id`, `output` JSON) or a `system` message.

Server → client (GA names): `session.created|updated`, `input_audio_buffer.speech_started|
speech_stopped|committed|cleared`, `conversation.item.added` (the server confirms items we add, as
seen live), `conversation.item.input_audio_transcription.delta|completed|failed`,
`conversation.item.truncated`, `response.created|done` (status `completed|cancelled|failed|
incomplete`, `usage` with text/audio/cached token details), `response.output_item.done` (a
`function_call` item with `name`, `call_id`, `arguments`, `status`),
`response.function_call_arguments.done`, `response.output_audio_transcript.delta|done`,
`response.output_text.delta|done`, and WebRTC's `output_audio_buffer.started|stopped|cleared`.
Everything else (audio deltas, rate limits) is dropped by `parseServerEvent`. Benign error codes
handled without a word: `input_audio_buffer_commit_empty`,
`conversation_already_has_active_response`, `response_cancel_not_active`.

## 4. Tools and what they return

| Tool                                  | Does                                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------- |
| `ask_claude({ request })`             | The request goes to the conductor as a user turn marked `via: 'voice'`.             |
| `answer_approval({ approve, note? })` | The user's spoken yes or no to the pending approval, checked (§6), then `decide`.   |
| `stop_claude()`                       | `Conductor.stop()` (aborts the run, cancels a pending approval, stops device work). |

Results are JSON with a `status`: `done` (`answer`, `changes` applied), `needs_approval`
(`changes`, `instruction`), `working`, `not_confirmed` (`heard`), `no_approval`, `busy`, `stopped`,
`error`. The answer is Claude's text after the request, read by the chat's own markdown parser into
plain sentences (`speakable`): combos spelled for the ear (`shift + M1` → "shift plus M1",
`E2` → "encoder 2"), citations dropped, code and tables left to the screen, cut near 700
characters at a sentence end with "More is on screen." Claude itself is told, with each spoken
request, that a one- or two-sentence summary will be said and the full answer stays on screen (a
note in the conversation's tail, so the cached prefix is untouched).

## 5. The state machine

All decisions live in `stepVoice()` (`src/lib/core/voice/machine.ts`), a pure function from
(state, input) to (state, client events, transcript lines, tool calls, mic open). The browser
session only carries events. Rules worth knowing:

- **Phases** for the UI: idle, connecting, listening, user-speaking, thinking, speaking, error.
- **Owed responses.** A tool output or a late result makes a response owed. It is asked for when
  the floor is free: no response running or requested, no commit pending, nobody holding the key
  or talking, no audio playing, and (hands-free) no user turn the server is about to answer by
  itself. A response the server starts covers only items it had confirmed with
  `conversation.item.added` before `response.created`; anything later is asked for again. If our
  `response.create` meets `conversation_already_has_active_response`, what it was to cover waits
  for that response's end.
- **Barge-in with the key:** `response.cancel` (if a response runs) + `output_audio_buffer.clear`
  (if audio plays) + `input_audio_buffer.clear`; a response that starts while the key is held is
  cancelled by id. The voice's line on screen is marked "cut off". With VAD only the line changes.
- **Transcript lines:** user lines from `speech_started` / `committed` / transcription deltas,
  finished on `completed` or `failed`; the voice's lines from its transcript deltas, finished when
  its audio stops (or at `response.done` when none played), or cut off. They go into the
  conversation through `Conductor.voiceLine()` and are saved with the thread; Claude never sees
  them.

## 6. Approvals by voice

The approval gate is unchanged: a mutate tool waits in `PolicyGate`, the sheet shows the request.
When the conductor stops at an approval during a voice request, `ask_claude` returns
`needs_approval` and the voice asks for a yes or no. `answer_approval` then passes the answer to the
same `Conductor.decide()` the sheet uses, marked `via: 'voice'` in the chat ("approved by voice:
tempo 120 → 96 bpm"), but only when:

1. the pending approval is the one the voice put to the user,
2. the user has spoken since (a committed audio turn after the question), and
3. for a yes, the transcript of their latest turn is a clear yes (`spokenAnswer`: whole-word yes
   forms in a few languages, and any no word vetoes: "yes, wait" is a no). The bridge waits up to
   2.5 s for that transcript.

Otherwise nothing changes and the voice hears `not_confirmed`. A no needs only 1 and 2 (refusing
is the safe direction); the user's words go to Claude as the rejection note. "Allow for this
session" is never offered by voice. The user can always tap the sheet; if they do while the voice
waits, the run's end is announced as an update.

## 7. Microphone

`getUserMedia` with echo cancellation, noise suppression and auto gain. The OP-XY enumerates as a
USB audio input (note 90), so if the opened track's label names the OP-XY, the app enumerates the
inputs and reopens the first other one (`pickMicrophone`) [fake]. In push-to-talk the track is
enabled only while the key is held (a disabled track sends silence; the buffer is cleared on the
next press).

## 8. Live smoke test, 2026-09-28 [tested]

`node evals/voice/smoke.mjs --env <.env>`:

| Check                                                         | Result                                                                                                               |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Mint, gpt-realtime-2.1 and -mini, push-to-talk and hands-free | 4 × HTTP 200 in 206–851 ms; session echoed with the model, `semantic_vad` or none, the three tools; expires in 120 s |
| WebSocket on the client secret (text only)                    | opens                                                                                                                |
| "What does shift plus M1 do on my OP-XY?"                     | `ask_claude {"request":"What does shift plus M1 do on my OP-XY?"}`                                                   |
| Our `function_call_output`                                    | confirmed by `conversation.item.added`; then one spoken-style sentence summarising the scripted answer               |
| "Set the tempo to 96." → scripted `needs_approval`            | "This will change the tempo from 120 to 96 bpm. Do you want me to apply that—yes or no?" (no premature answer)       |
| "Yes, go ahead."                                              | `answer_approval {"approve":true}`                                                                                   |
| Tokens per response                                           | 835–1,093 (text; instructions and tools included)                                                                    |

Not run live today: the WebRTC audio path itself (Node has no WebRTC). Note 70 ran it in Chromium
with a fake mic on 2026-09-26; a run with a real mic in the app is the owner's check (§10).

## 9. Costs

From note 70 §5/§8: gpt-realtime-2.1 audio in $32, out $64, text in $4, cached $0.40, out $24 per
million tokens, roughly $0.02 a minute listening and $0.08 speaking; mini about a third. The strip
shows the call's cost from `response.done` usage; input transcription is billed apart per minute
($0.017/min for gpt-live-transcribe, note 70), so the figure is a lower bound. Claude's work is on
the conductor's meter as usual.

## 10. Open

1. **Owner check with a real mic** in Chrome: push-to-talk, hands-free, barge-in, a spoken
   approval. Also: does the OP-XY show up as the default input on the owner's Mac (the picker
   skips it, untested on hardware)?
2. **Spoken approvals:** note 70 §12 asked whether a spoken yes may approve device changes; this
   milestone allows it with the checks in §6. Confirm, or make voice announce and wait for a tap.
3. A microphone picker (today: the default, never the OP-XY) and a voice picker (`marin`).
4. GPT-Live's client delegation, if it gains a browser path with push-to-talk.

## Sources

[Realtime WebRTC guide](https://developers.openai.com/api/docs/guides/realtime-webrtc) ·
[Realtime conversations (VAD, push-to-talk, interruption, function calling)](https://developers.openai.com/api/docs/guides/realtime-conversations) ·
[Voice activity detection](https://developers.openai.com/api/docs/guides/realtime-vad) ·
[Realtime transcription](https://developers.openai.com/api/docs/guides/realtime-transcription) ·
[Client secrets reference](https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets/methods/create) ·
[Client events](https://developers.openai.com/api/reference/resources/realtime/client-events) ·
[Server events](https://developers.openai.com/api/reference/resources/realtime/server-events) ·
[gpt-realtime-2.1](https://developers.openai.com/api/docs/models/gpt-realtime-2.1) ·
[GPT-Live](https://developers.openai.com/api/docs/guides/live) ·
[GPT-Live delegation](https://developers.openai.com/api/docs/guides/live-delegation) ·
[GPT-Live sessions](https://developers.openai.com/api/docs/guides/live-conversations) ·
[gpt-live-1](https://developers.openai.com/api/docs/models/gpt-live-1) ·
[Community: commit of an empty buffer](https://community.openai.com/t/realtime-api-error-committing-input-audio-buffer-the-buffer-is-empty/975381) ·
[Community: "already has an active response"](https://community.openai.com/t/realtime-api-server-response-error-message-conversation-already-has-an-active-response/1005582).
