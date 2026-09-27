# Notices and attributions

OP-XY Agent is released under the [MIT License](LICENSE). It is an independent project, not
affiliated with or endorsed by Teenage Engineering. "OP-XY" and "teenage engineering" are
trademarks of their owner and are used here only to describe compatibility.

## Code adapted or ported from other projects

| Source                                                                            | Licence                                         | What we use                                                                   | Where                                                                          |
| --------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [MIDI Lab](https://github.com/NeoVand/midilab) (NeoVand)                          | the owner's own code, relicensed here under MIT | MIDI protocol core, SMF codec, notation, melodies, harmony, Web MIDI patterns | `src/lib/core/midi/`, `src/lib/core/music/` (files carry a provenance comment) |
| [kmorrill/xy-format](https://github.com/kmorrill/xy-format) (Kevin Morrill)       | MIT                                             | `.xy` project format knowledge; TS port planned (M6)                          | `docs/research/10-xy-format.md`; later `src/lib/core/xy/`                      |
| [kmorrill/op-xy-vibing](https://github.com/kmorrill/op-xy-vibing) (Kevin Morrill) | MIT                                             | live-loop IR and scheduling ideas                                             | `docs/research/20-midi-control.md`                                             |

Every ported file names its source in a header comment. Projects without a licence (for example
`jshph/opxy-reactive`, `benjaminr/mcp-koii`) were read for facts only; none of their code is used.

## Replica artwork

The replica's geometry and its key legends and icons are derived from the full-panel line drawing in
Teenage Engineering's public [OP-XY guide](https://teenage.engineering/guides/op-xy/layout)
(`scripts/build-replica-art.mjs` → `src/lib/replica/art.generated.ts`), with the OP–XY wordmarks
removed. Used with the maintainer's understanding that TE supports this project; the artwork is kept
swappable ([DECISIONS D9](docs/DECISIONS.md)).

## Screen art and screen font

The simulated display (`src/lib/sim/screen/`) is drawn to match the screen illustrations in Teenage
Engineering's public [OP-XY guide](https://teenage.engineering/guides/op-xy). The layouts, colours
and measurements in `docs/research/55-screen.md` come from them. `scripts/extract-screen-font.mjs`
derives two data files from the same illustrations:

- `knowledge/opxy/screen-font.json`: outlines of the lettering TE drew on its screens (63 glyphs).
  The letterforms are TE's screen typeface, which resembles a light Univers; its design belongs to its
  owners.
- `knowledge/opxy/screen-icons.json`: the pictograms and engine pictures.

Characters the illustrations never show are drawn in Work Sans. Like the replica artwork, this is
used with the maintainer's understanding that TE supports the project, and it stays swappable
([DECISIONS D9, D10](docs/DECISIONS.md)).

## Fonts

| Font                                                                   | Licence                   | Use                               |
| ---------------------------------------------------------------------- | ------------------------- | --------------------------------- |
| [Work Sans](https://github.com/weiweihuanghuang/Work-Sans) (Wei Huang) | SIL Open Font License 1.1 | all interface text                |
| [Red Hat Mono](https://github.com/RedHatOfficial/RedHatFont) (Red Hat) | SIL Open Font License 1.1 | bytes, hex and technical readouts |

Both are self-hosted through `@fontsource-variable`. The replica's **screen** text is different: it uses
glyph outlines traced from Teenage Engineering's guide screen illustrations (see "Screen art and screen
font" above). Those shapes appear to come from Linotype's Univers, which TE licenses; they are included
by the maintainer's decision ([DECISIONS D11](docs/DECISIONS.md)) and will be replaced with an open
look-alike if a rights holder objects.

## Facts and data

Device facts come from Teenage Engineering's public guide and firmware release notes (paraphrased in
our own words — the verbatim manual is never redistributed), community reverse engineering credited
in `docs/research/`, and probes of the maintainer's own device (`docs/research/90-device-probe.md`).
TE's photos and logos are not included in the app; see the Fonts section for the screen glyphs.
