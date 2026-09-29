# Design language

> How OP-XY Agent looks, moves and speaks, so every screen stays consistent. The source of truth
> for values is [`src/lib/ui/tokens.css`](../src/lib/ui/tokens.css); the live reference is the
> `/styleguide` route. Physical facts (dimensions, colours, grid) come from
> [`research/50-hardware-ui.md`](research/50-hardware-ui.md). Nothing here uses Teenage Engineering
> logos, wordmarks, photos or fonts ([D6](DECISIONS.md)).

## 1. Principles

1. **The instrument sets the rules.** We derive, we don't decorate. Every colour, radius, size and
   duration traces back to a part of the OP-XY or a convention of its screen and printed guide.
2. **Eight greys, one red.** The device's grey ramp is the entire neutral system. Red means _live_:
   recording, writing to the device, destroying something. It is never decoration, a link colour or a
   focus ring.
3. **The tile is the unit.** One tile is the 15.5 mm key pitch, `4rem` on screen. Spacing, key sizes
   and radii are fractions of it, so the app and the instrument share one rhythm.
4. **Keys, not buttons.** Controls are flat tiles carrying raised caps. They travel when pressed and
   snap back. Emphasis climbs the ramp, from dark keys to the one light key.
5. **Light means state.** LEDs are off, dim, white or red. They snap on and decay off. The black
   screen is glass, used for values and anything the device itself would display.
6. **Quiet chrome, loud device.** The replica is the hero. Everything around it recedes: hairlines,
   light lowercase type, no gradients for their own sake, one orchestrated motion per view.
7. **Honest instruments.** The UI always says what is real: _mirroring_ (confirmed by device events)
   versus _simulated_, _coming soon_ versus available. Nothing pretends to work.

## 2. Themes

| Theme                         | Where it comes from                                  | Status      |
| ----------------------------- | ---------------------------------------------------- | ----------- |
| **dark, "anodised"** (`dark`) | the black anodised body, its lit LEDs and its screen | **primary** |
| **light, "guide"** (`light`)  | TE's printed guide: ink line drawings on warm paper  | alternative |

**Why dark is primary.** The device is black aluminium, and the app's hero is that device. On a dark
page the replica, its LED glow and its black screen continue the object instead of sitting on it
like a product shot on a white shop page. Glow only reads on dark. The screen language (black,
warm white, the ramp) is dark-native, and music software is conventionally dark because studios are
dim. TE's website is light, but it is selling the object; we are _using_ it.

**Why light still exists.** Reading long answers and manual pages, printing a how-to, or simply
preferring light. The light theme is not an inversion; it follows the guide's own drawing
conventions:

- Surfaces are paper (`#f7f5f5`) and white, with ink (`#0f0e12`) text and hairlines.
- LEDs are drawn the way the guide draws them: **lit = ink dot, dim = grey, off = hollow**
  (`50-hardware-ui.md` §4.4). A white glow on paper would be invisible.
- The white card becomes an ink-outlined box.
- The device screen and the device materials stay black in both themes: it is a physical object.

**Mechanics.** The theme is `data-theme="dark|light"` on `<html>`. An inline script in
`src/app.html` applies the saved choice (`localStorage['opxy:theme']`) before first paint, and
`Theme` (`src/lib/ui/theme.svelte.ts`) follows and changes it. We deliberately do **not** follow
`prefers-color-scheme` on first visit: the brand is the dark instrument, and the toggle in the header
is one click away. Any subtree can be re-themed with its own `data-theme` attribute.

## 3. Colour

### 3.1 The ramp

The 8 tones of the device's step tiles, encoder caps and screen header bar (values from TE's guide
art). In the dark theme they are the whole neutral system, climbing from panels to text:

| Token         | Hex       | Dark-theme role                                 |
| ------------- | --------- | ----------------------------------------------- |
| `--xy-ramp-0` | `#16161e` | panels (`surface`)                              |
| `--xy-ramp-1` | `#2f2f37` | key tiles, hairlines                            |
| `--xy-ramp-2` | `#484850` | strong lines, selection                         |
| `--xy-ramp-3` | `#616169` | decorative only (fails as text)                 |
| `--xy-ramp-4` | `#7a7a82` | faint text: large or disabled only (4.5:1 edge) |
| `--xy-ramp-5` | `#96969b` | subtle text; **the floor for small text**       |
| `--xy-ramp-6` | `#afafb4` | muted text                                      |
| `--xy-ramp-7` | `#f7f5f5` | text, the light key                             |

### 3.2 Signal

| Token                    | Hex       | Use                                                  |
| ------------------------ | --------- | ---------------------------------------------------- |
| `--xy-red`               | `#ff4d00` | LEDs, record, live states, destructive confirmations |
| `--xy-red-screen`        | `#e5371b` | red drawn on the device screen (active pattern box)  |
| `--xy-red-text-on-paper` | `#c42e0f` | red **text** in the light theme (5.2:1 on paper)     |

Red appears as a light or a glyph first (an LED, the record dot), as text only for live or
destructive states. On a dark key cap red text is 4.3:1, so on keys red is always a glyph, never a
legend.

### 3.3 Ink, paper and black

`--xy-ink #0f0e12` is the dark page and the light theme's text. `--xy-paper #f7f5f5` is the light
page and the dark theme's text. Pure black `#000` is reserved for the device screen, so the screen
always reads as glass against the page.

### 3.4 Device materials

For the replica and anything depicting hardware. Sampled from studio renders; they never change with
the theme.

| Token                                  | Hex                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| `--xy-mat-body` anodised body          | `#26282c`                                                                      |
| `--xy-mat-rim` rim highlight           | `#45484f`                                                                      |
| `--xy-mat-gap` gap between tiles       | `#08090b`                                                                      |
| `--xy-mat-tile` / `--xy-mat-cap`       | `#2e2f32` / `#2b2c2f` (a cap is a hair darker than its tile)                   |
| `--xy-mat-legend` legend print         | `#ecebe7` (warm off-white)                                                     |
| `--xy-mat-glass` screen bezel          | `#141517`                                                                      |
| `--xy-mat-switch` power-switch tab     | `#d0cecb`                                                                      |
| `--xy-mat-step-1` … `-8` (step pairs)  | `#434448 #5a6066 #707479 #8e9698 #9a9fa3 #afafaf #b7b5b3 #cecbc9`              |
| `--xy-mat-enc-1` … `-4` (encoder caps) | `#45484c` dark grey, `#7c828c` mid grey, `#b5b5b6` light grey, `#e9e9ea` white |

### 3.5 Semantic tokens

Components use these, never raw hex.

| Token                 | Dark          | Light           | Use                         |
| --------------------- | ------------- | --------------- | --------------------------- |
| `--xy-bg`             | ink `#0f0e12` | paper `#f7f5f5` | page                        |
| `--xy-surface`        | ramp-0        | `#ffffff`       | panels (plates)             |
| `--xy-surface-raised` | ramp-1        | `#ffffff`       | raised controls             |
| `--xy-surface-sunken` | `#0a0a0d`     | `#ecebea`       | inputs, wells, slots        |
| `--xy-line`           | ramp-1        | `#e0dede`       | hairlines                   |
| `--xy-line-strong`    | ramp-2        | `#cdcdcd`       | emphasised lines            |
| `--xy-line-control`   | ramp-4        | `#8a8a90`       | input borders (≥ 3:1)       |
| `--xy-fg`             | ramp-7        | ink             | primary text                |
| `--xy-fg-muted`       | ramp-6        | ramp-2          | secondary text              |
| `--xy-fg-subtle`      | ramp-5        | ramp-3          | captions; min. small text   |
| `--xy-fg-faint`       | ramp-4        | ramp-5          | large or disabled text only |
| `--xy-accent`         | red           | red             | LEDs, record, live          |
| `--xy-accent-text`    | red           | `#c42e0f`       | red text                    |
| `--xy-focus`          | ramp-7        | ink             | the focus ring              |
| `--xy-key-*`          | ramp-1 tile   | `#ecebea` tile  | dark key                    |
| `--xy-key-2-*`        | ramp-4/5      | ramp-1/2        | secondary key               |
| `--xy-key-1-*`        | paper cap     | ink cap         | the light (primary) key     |

`prefers-contrast: more` lifts the quiet greys one step and makes hairlines visible.

### 3.6 Contrast (WCAG)

| Pair                           | Ratio     | Verdict             |
| ------------------------------ | --------- | ------------------- |
| paper on ink                   | 17.7      | AAA                 |
| ramp-6 on ink                  | 8.8       | AAA                 |
| ramp-5 on ink / on ramp-0      | 6.5 / 6.1 | AA small text       |
| ramp-4 on ink                  | 4.5       | AA edge: large only |
| legend on dark key cap         | 11.9      | AAA                 |
| ink on ramp-5 (secondary key)  | 6.5       | AA                  |
| red on ink / on dark cap       | 5.8 / 4.3 | text / glyph only   |
| ink on paper                   | 17.7      | AAA                 |
| ramp-3 on paper (light subtle) | 5.7       | AA                  |
| `#c42e0f` on paper             | 5.2       | AA                  |

## 4. Typography

### 4.1 Faces and licences

TE's house face is Univers TE20 Light (Linotype, licensed). We cannot ship it and never will. We set
TE-style strings (`demo 1`, `new save rename config`, `125`, the header-bar numerals) in a dozen
open-licensed grotesques next to TE's own screen art and picked the closest in colour and
proportion:

| Face             | Role                                              | Licence                                           | Package                             |
| ---------------- | ------------------------------------------------- | ------------------------------------------------- | ----------------------------------- |
| **Work Sans**    | everything: UI, legends, headings, readouts       | SIL OFL 1.1, © 2019 The Work Sans Project Authors | `@fontsource-variable/work-sans`    |
| **Red Hat Mono** | code-like content only: bytes, hex, CCs, versions | SIL OFL 1.1, © 2024 The Red Hat Project Authors   | `@fontsource-variable/red-hat-mono` |

Work Sans at weights 250–300 has the same airy colour, open round bowls and narrow light numerals as
the device's screen type; Inter, Geist, Archivo and Roboto Flex read tighter and heavier, Mona Sans
has a single-storey `a`, IBM Plex is too recognisable. Red Hat Mono is light, round like Work Sans,
and has a slashed zero, which matters for hex. Both are variable fonts, self-hosted (no third-party
requests) with the Latin subset preloaded. When the replica needs key legends (M2), outline them from
Work Sans as SVG paths: artwork made with an OFL font is not a derivative font.

### 4.2 Scale

Traditional typographic sizes. The display steps alternate perfect fifths (2:3) and fourths (3:4),
fitting for an instrument. Line heights sit on a 4px grid.

| Token  | Size / line | Weight | Use                                       |
| ------ | ----------- | ------ | ----------------------------------------- |
| `5xl`  | 96 / 96     | 250    | hero readouts                             |
| `4xl`  | 72 / 72     | 250    | large readouts                            |
| `3xl`  | 48 / 52     | 250    | page titles, readouts                     |
| `2xl`  | 36 / 40     | 300    | section titles, the stage title           |
| `xl`   | 24 / 32     | 300    | panel titles, empty states                |
| `lg`   | 18 / 28     | 400    | lead text (the device screen's body size) |
| `base` | 16 / 24     | 400    | reading text: answers, manual             |
| `sm`   | 14 / 20     | 400    | keys, inputs, lists                       |
| `xs`   | 12 / 16     | 450    | labels, legends                           |
| `2xs`  | 11 / 16     | 450    | status bar, captions                      |

### 4.3 Rules

- **Light at display sizes, regular for reading.** 250 at 48px and up, 300 at 24–36px, 400 for text,
  450 to keep 11–12px labels crisp on dark, 500 at most for emphasis. **No bold**; the Tailwind
  theme does not even define it.
- **Lowercase UI, sentence-case sentences.** Labels, keys, headings and status are lowercase, like the
  device. Full sentences (help text, agent answers) keep normal sentence case. Never use
  `text-transform`: write the case you mean, so `OP-XY`, `M1` and `USB-C` survive where they belong.
- **No all-caps labels,** except where the device itself prints caps (`BAR`, `FX`, `CV`).
- **Tabular numerals** for anything that changes (`font-variant-numeric: tabular-nums`); readouts get
  it automatically.
- **Mono only for code.** A byte dump or a version string is mono; a label is not.
- Display sizes track slightly tight (`-0.012em`), tiny labels slightly open (`+0.01em`).
- Keep reading lines under ~70 characters (`max-width` around `36rem`).

## 5. Space and layout

The OP-XY is a 17 × 6 grid of 15.5 mm tiles with a ~0.9 mm gap. **One tile = `4rem` (64px)** and
**the gap = 1/16 tile = `0.25rem`**, which is exactly Tailwind's spacing unit: `p-4` is a quarter
tile, `gap-1` the key gap, `size-pitch` a whole tile.

| Step | px  | Tile fraction                 |
| ---- | --- | ----------------------------- |
| 1    | 4   | 1/16, the gap between keys    |
| 2    | 8   | 1/8                           |
| 3    | 12  | 3/16                          |
| 4    | 16  | 1/4                           |
| 6    | 24  | 3/8                           |
| 8    | 32  | 1/2                           |
| 12   | 48  | 3/4                           |
| 16   | 64  | 1 tile                        |
| 24   | 96  | 1½, a wide accidental tile    |
| 32   | 128 | 2, an encoder or speaker tile |

**Key geometry** keeps the device's proportions: keycap = 0.606 of its tile, LED window = 0.113 of a
tile at twelve o'clock on the cap. `IconButton` at `lg` is one tile, true to scale.

**App shell.** Header `3.5rem`, status bar `2rem` (half a tile), agent column `24rem` (6 tiles). The
device stage is framed at the body's exact **285 : 102** aspect (`--xy-body-aspect`), and text under
it aligns to the device's own tile grid (4.41 mm in from the left, 17.09 mm from the right). One
column below `68.75rem`; phones get 16px gutters and no horizontal scroll.

## 6. Shape and depth

Every radius and shadow belongs to a physical part, so hierarchy is built in.

| Radius               | Value | From                              | Use                           |
| -------------------- | ----- | --------------------------------- | ----------------------------- |
| `--xy-radius-card`   | 4px   | white cards on the screen         | cards, tooltips               |
| `--xy-radius-tile`   | 5px   | the 1.25 mm tile corner           | keys, inputs, panels, chips   |
| `--xy-radius-screen` | 8px   | the display's rounded active area | screen surfaces, readouts     |
| `--xy-radius-body`   | 20px  | the 5 mm body corner              | only things that are the body |
| `--xy-radius-cap`    | round | keycaps                           | caps, LEDs, dots              |

Panels are groups of tiles, so they take the tile radius, not the body radius. Soft 16–24px corners
everywhere would make it a generic app.

| Shadow                    | Meaning                                         |
| ------------------------- | ----------------------------------------------- |
| `--xy-shadow-plate`       | a panel: hairline edge, faint top light         |
| `--xy-shadow-tile`        | a tile raised 2.4 mm, with its gap outline      |
| `--xy-shadow-cap`         | a cap raised 2 mm more: rim light, contact ring |
| `--xy-shadow-cap-pressed` | travel spent: the shadow collapses              |
| `--xy-shadow-recess`      | slots and inputs cut into the plate             |
| `--xy-shadow-float`       | the only thing that floats: menus, popovers     |
| `--xy-glow-white/red`     | lit LEDs                                        |

Light caps (the primary key) cast a soft contact shadow instead of a dark ring
(`--xy-key-1-shadow`).

## 7. Motion

Mechanical, not springy. Nothing floats in, nothing bounces for fun.

| Token              | ms  | Use                                                     |
| ------------------ | --- | ------------------------------------------------------- |
| `--xy-dur-press`   | 50  | a key goes down (`--xy-ease-press`)                     |
| `--xy-dur-release` | 140 | it comes back with a tiny rebound (`--xy-ease-release`) |
| `--xy-dur-led-on`  | 30  | LED attack                                              |
| `--xy-dur-led-off` | 260 | LED decay (`--xy-ease-decay`)                           |
| `--xy-dur-step`    | 55  | one step of a playhead chase                            |
| `--xy-dur-quick`   | 120 | hover and colour changes                                |
| `--xy-dur-base`    | 200 | small UI changes                                        |
| `--xy-dur-slow`    | 360 | panels opening                                          |

- Keys: the pressed state owns the fast attack, the rest state owns the slower release, so one CSS
  transition gives both directions.
- LEDs: lit states own the 30 ms attack, the off state owns the 260 ms decay. A chase therefore
  leaves a short trail by itself.
- Blinks are hard square waves (`steps(1)`), like hardware.
- **One orchestrated moment per view.** On the home page it is the playhead sweeping the step row
  once. Everything else moves only in answer to the user.
- `prefers-reduced-motion`: every duration collapses to 0 and blinking stops. State still changes;
  nothing travels.

## 8. Components

All live in `src/lib/ui/` and are exported from `$lib/ui`.

- **Button** — a key: tile + stadium cap. `variant`: `key` (default, dark), `secondary` (mid grey),
  `primary` (the light key, **at most one per view**), `ghost`. `size`: `sm` 32px, `md` 40px, `lg`
  48px. `pressed` + `toggle` makes a latching key whose LED lights. `busy` blinks the LED. `href`
  renders a link: build internal hrefs with `resolve()` from `$app/paths`. For something that is
  not available _yet_, use `aria-disabled="true"` plus a visible "coming soon" note (it stays
  focusable and explains itself); use `disabled` only when it can never work in this context.
- **IconButton** — the device key: square tile, round cap, optional LED window. `label` is required;
  it is the accessible name and the tooltip. Sizes 36 / 48 / 64px (`lg` is one tile).
- **Switch** — the power slider: recessed slot, light-grey tab; the LED lights when on. For settings
  that apply immediately. Label it in lowercase.
- **Panel** — `plate` carries controls; `screen` is black glass (both themes) for values and device
  content; `card` is the screen's white card, reserved for the one thing that needs a decision
  (approvals, results); `sunken` for inputs, logs and wells. Panels differ by material; never stack
  identical cards to fill space.
- **Readout** — `screen`: label with encoder dot, large thin tabular numeral, unit. `cell`: one
  label/value pair of the engine header bar; four cells (encoders 1–4) make the 8-tone header.
  Text flips to ink on the light cells for contrast.
- **Legend** — small device-voice text. Sizes `2xs`/`xs`/`sm`; tones `fg`, `muted`, `subtle`,
  `print` (key legends), `accent` (live only).
- **KeyCombo** (`$lib/replica`) — a combo in the manual's key grammar drawn as the device's own
  keys, from the replica's art (`replica/glyphs`): `shift + M1` is the shift key, a plus and the
  key printed 1; encoders are their coloured knobs (with arrows when turned); `Tn` is a track key
  marked n. The device prints digits and pictures, never "M3" or "T5", so the names live in the
  tooltip and the accessible label. `onpoint` + `replicaPointer(replica)` ring the pointed keys on
  a replica. Use it everywhere a combo appears: manual, agent answers, hints.
- **Led** — `off | dim | white | red`, optional `blink`. Never the only cue: pair with text or give
  it a `label`.
- **EncoderDot** — the screen's encoder colour dot; use wherever a value maps to an encoder.
- **Divider** — `hairline` or `groove` (the machined recess between tiles).
- **tooltip** — `{@attach tooltip('text')}`: a tiny black screen, plain lowercase text, hover delay
  450 ms, instant on keyboard focus, Escape closes. Never put essential information only in a
  tooltip (touch users won't see it).
- **Icon** — our own 24-unit icons (`icons.ts`). Add new ones there, drawn in the same few-stroke
  style. No third-party or TE artwork.
- **Shell** (`src/lib/ui/shell/`) — `AppHeader`, `StatusBar` (cells, not dot-joined strings),
  `DeviceStage` (mounts the replica via `children`; takes `onconnect` from the device layer),
  `DevicePlaceholder` (deliberately abstract until M2), `AgentPanel`, `ThemeToggle`, and the
  `ShellStatus` context that the device layer will feed.

## 9. Do and don't

**Do**

- Reach for a semantic token (`--xy-fg-subtle`, `bg-surface`) before a ramp step, and a ramp step
  before any hex.
- Size and space things in tile fractions; align content to the grid.
- Say state with an LED plus words: `● no device`, not a coloured word alone.
- Keep one light key per view, and one orchestrated motion per view.
- Write labels in lowercase and sentences in sentence case.
- Label everything the way the device does ("track 3", "M1", "dark grey encoder").

**Don't**

- Don't use red for links, focus, success, branding or "primary". Red is live.
- Don't add greys, blues, greens or brand colours; the Tailwind palette is removed on purpose.
- Don't use bold, all-caps eyebrows, mono for labels, or `→` appended to link text.
- Don't join meta strings with middle dots; give each value its own cell or line.
- Don't round everything 16px or wrap everything in identical shadowed cards.
- Don't animate on scroll or on load except the one moment; don't loop decorative motion.
- Don't draw the device half-accurately. Until the M2 replica exists, use `DevicePlaceholder`.
- Don't use TE logos, the OP-XY wordmark, TE photos or Univers anywhere in the app.
- Don't make buttons that look active but do nothing.

## 10. Using the tokens

- **Component CSS:** `var(--xy-…)` directly (every token is prefixed `--xy-`, so nothing collides with
  Tailwind).
- **Tailwind 4:** `src/routes/layout.css` maps the tokens with `@theme inline`, so utilities
  reference the variables and re-theme with any `[data-theme]` subtree. Available: colours
  (`bg-surface`, `text-fg-muted`, `border-line`, `bg-ramp-3`, `text-accent-text`, `bg-screen`,
  `bg-mat-body`, …), `font-sans` / `font-mono`, `text-2xs` … `text-5xl`, `font-thin|light|normal|medium`,
  `rounded-card|tile|screen|body|cap`, `shadow-plate|tile|cap|cap-pressed|float|glow-white|glow-red`,
  `inset-shadow-recess`, `ease-press|release|standard|exit|decay`, spacing multiples plus
  `pitch` and `gap` (`size-pitch`, `gap-gap`). Variants `dark:` and `light:` key off `data-theme`.
  Tailwind's default palette, radii, shadows and heavy weights are removed.
- **Long text:** `class="prose prose-xy"`.
- **Forms plugin** runs in `class` strategy: nothing is restyled unless it opts in with `form-*`.

## 11. Accessibility

- One focus style everywhere: a 2px warm-white ring (ink on paper) with 2px offset; never removed.
- Small text never below ramp-5 on dark (6.5:1) or ramp-3 on paper (5.7:1).
- Everything is operable by keyboard; icon keys have names; switches use `role="switch"`; latching
  keys use `aria-pressed`; a skip link leads to the main content.
- Colour is never the only cue (LEDs come with words; red states also change text).
- Reduced motion and increased contrast are honoured through the tokens, not per component.
- Touch targets: the whole tile is the hit area, as on the device (at least 36px, usually 40–64px).

## 12. Open questions for the owner

1. **App name casing.** The UI writes "op-xy agent" in lowercase (TE's voice); titles and meta use
   "OP-XY Agent". Keep both, or one everywhere?
2. **Light theme for the replica (M2).** Proposal: in the light theme the replica renders as
   guide-style line art (ink outlines, legends in ink), not a black slab on paper.
3. **First visit.** Dark by default, ignoring the OS setting (current), or follow
   `prefers-color-scheme`?
4. **Fonts.** Happy with Work Sans + Red Hat Mono, or compare against a specific face you like?
5. **Calibration.** Material tones are sampled from renders; your straight-on photos of the real unit
   (LEDs lit, legends, screen) would let us tune `--xy-mat-*` and the LED glow.

## 13. Files

| Path                                                               | What                                                 |
| ------------------------------------------------------------------ | ---------------------------------------------------- |
| `src/lib/ui/tokens.css`                                            | all tokens, both themes, reduced motion, contrast    |
| `src/routes/layout.css`                                            | Tailwind setup, `@theme inline` mapping, base styles |
| `src/lib/ui/*.svelte`, `index.ts`                                  | primitives                                           |
| `src/lib/ui/theme.svelte.ts`, `tooltip.ts`, `icons.ts`, `types.ts` | helpers                                              |
| `src/lib/ui/shell/`                                                | app shell components and `ShellStatus`               |
| `src/app.html`                                                     | pre-paint theme script, theme colour                 |
| `static/favicon.svg`, `apple-touch-icon.png`                       | our key-and-LED mark (no TE marks)                   |
| `src/routes/styleguide/`                                           | the living styleguide                                |
