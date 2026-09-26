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
