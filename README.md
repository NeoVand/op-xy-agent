# OP-XY Agent

An open-source web app for learning, playing and programming the Teenage Engineering **OP-XY**. It
pairs an interactive replica of the hardware with an AI agent that knows the machine inside out.

**[Open the app →](https://neovand.github.io/op-xy-agent/)**

It is pre-production and moving fast. The roadmap is in [`docs/PLAN.md`](docs/PLAN.md) and the north
star in [`docs/VISION.md`](docs/VISION.md).

## What it does

- **A replica you can play.** The replica is built from the panel drawing in TE's public guide, so
  every key, encoder, LED and legend sits where it does on the device. Its screen runs our own
  simulator of the OP-XY's interface: the four modes, M1–M4 with their shift layers, engine / filter /
  LFO pickers, tempo, project, COM and the mixer. Pages are drawn at the display's 480 × 222 pixels
  in the device's screen font. Where the guide has no picture, or the device differs from it, they
  are rebuilt from camera captures of a real unit, to within about half a pixel. It plays, too: the
  synth engines (calibrated against the device's audio), the drum kit and the sequencer sound in the
  browser, and your work is kept across reloads.
- **Connect your OP-XY over USB.** Connection uses Web MIDI (Chrome, Edge). The replica mirrors
  what the device plays (notes in any octave, pitch bend, transport, a clock-driven playhead). It
  also drives the device: notes, play/stop and track select. The agent can also set the tempo, mute
  tracks and set a track's sound (engine values, envelopes, filter, level, pan).
- **An agent that teaches and does.** Claude answers from our own reworded manual and cites the
  section. For "how do I…" it gives the exact keys and encoder turns from where you are, tried on the
  simulator first. It can play them on the replica, or walk you through them: the next key lights,
  and the replica waits until you press it. It turns ideas into settings: "make the bass pump with
  the kick" or "a plucky bass". It reads the simulated screen and controls the device. Every change
  asks for your approval and can be undone. You can attach sheet music (photos or
  PDFs), MIDI files or text (ABC, lyrics, notes), and the agent reads them and plays them. Without
  a device it plays the virtual OP-XY on screen, and it can program it: patterns note by note,
  scenes and a song, which you then hear in the browser.
- **Bring your own key.** API keys are kept in your browser and sent only to their provider
  (Anthropic for the agent; an OpenAI key will power voice). There is no server: the app is static
  files.

## Safety with your device

Every byte sent to the device goes through one choke point with a deny-list. Firmware-update
messages are blocked outright, and the app never writes files to the device without asking.
Anything that changes device state is announced first. The log of everything our own tests sent to a
real OP-XY is in [`docs/research/90-device-probe.md`](docs/research/90-device-probe.md).

## Develop

You need Node 24 and pnpm.

```bash
pnpm install
```

```bash
pnpm dev
```

```bash
pnpm check && pnpm lint && pnpm test:unit --run
```

Some research inputs are downloaded rather than committed: TE's public guide pages and pictures, and
community repositories read for reference. The app builds without them. The knowledge scripts and
the dev comparison bench on `/replica` need them:

```bash
scripts/fetch-research.sh
```

Start with [`AGENTS.md`](AGENTS.md), which covers the rules for humans and coding agents alike, and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), which covers the layers, the safety choke point and
the conventions.

| Path               | What                                                                                |
| ------------------ | ----------------------------------------------------------------------------------- |
| `src/lib/core/`    | pure TypeScript: MIDI, TE SysEx, the OP-XY as data, music theory                    |
| `src/lib/device/`  | Web MIDI, the send choke point and its policy, session, mirror, scheduler           |
| `src/lib/replica/` | the SVG replica and its screen canvas                                               |
| `src/lib/sim/`     | the UI simulator: state, pages, areas, the screen renderer                          |
| `src/lib/agent/`   | the agent: conductor, tools, approvals, attachments                                 |
| `src/lib/manual/`  | our manual: loader and search                                                       |
| `knowledge/`       | data the app ships: controls, CC map, screen font and icons, our manual (`manual/`) |
| `docs/`            | vision, plan, decisions, architecture, research notes                               |

## Credits and licence

MIT, see [`LICENSE`](LICENSE). Adapted code and artwork sources are listed in [`NOTICE.md`](NOTICE.md).

OP-XY Agent is an independent project, not affiliated with or endorsed by Teenage Engineering.
"OP-XY" and "teenage engineering" are their owner's trademarks, used here only to describe
compatibility. The manual the app ships is our own wording; TE's guide text is never committed.
