#!/usr/bin/env python3
"""Traces pictograms off the device's own screen, from the realigned camera captures
(research/device/captures/aligned, git-ignored; docs/research/59-screen-profiling.md), into
knowledge/opxy/device-icons/<group>.json in the format of knowledge/opxy/screen-icons.json.

TE's guide draws none of the player pages, so their pictograms are traced here: each icon's frames
are averaged (the screen is still in them), upsampled 4×, cut at the level halfway between the
card and the pictogram (where a blurred edge sits), and the outlines simplified to within about a
tenth of a pixel. Coordinates are design pixels (480 × 220) relative to the icon's box, which is
the card it sits on, so a page draws it at the card's corner. The lit capture spans 222 rows, so
y is scaled by 220/222.

    uv run --with opencv-python-headless --with numpy research/device/icontrace.py [--show DIR]
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
ALIGNED = ROOT / "research/device/captures/aligned"
OUT = ROOT / "knowledge/opxy/device-icons"
K = 220 / 222  # panel rows → design rows
UP = 4  # upsampling of the 2× captures: 8 samples per panel pixel

# The player page's four 50 × 50 cards (design px), E1…E4.
CARD_X = [135, 188, 241, 294]
CARD_Y = 20


def frames(*numbers: int | range) -> list[str]:
    out: list[str] = []
    for n in numbers:
        out += [f"b1-{i:03d}" for i in (n if isinstance(n, range) else [n])]
    return out


# name → frames, card (0–3) or box (x, y, w, h design px), region inside the box to trace
# (x0, y0, x1, y1, relative to the box), polarity ('light' shapes on a darker card or 'dark' on a
# lighter one) and, where grey tells them apart poorly, the channel to trace ('r')
PLAYERS = {
    "player.pattern.up": dict(frames=frames(314, 335, 336, 339, 342, 343, 346, 347, 350, 351),
                              card=1, region=(2, 8, 48, 42), polarity="light"),
    "player.pattern.down": dict(frames=frames(334), card=1, region=(2, 8, 48, 42), polarity="light"),
    "player.pattern.updown": dict(frames=frames(328), card=1, region=(0, 8, 50, 42), polarity="light"),
    "player.pattern.repeat": dict(frames=frames(329, 333), card=1, region=(0, 8, 50, 42),
                                  polarity="light"),
    "player.pattern.random": dict(frames=frames(331), card=1, region=(2, 4, 48, 46), polarity="light"),
    "player.pattern.order": dict(frames=frames(330), card=1, region=(2, 8, 48, 42), polarity="light"),
    "player.hand": dict(frames=frames(344, 355, 356, 374, 375, 376, 377, 378), card=3,
                        region=(3, 3, 47, 47), polarity="dark"),
    # maestro's cards sit wider apart than the arpeggio's: its first is at x 130
    "player.roll": dict(frames=frames(range(443, 450)), box=(130, 20, 50, 50), region=(8, 4, 34, 46),
                        polarity="light"),
    # pale blue on the light grey card: the red channel tells them apart best
    "player.glide": dict(frames=frames(range(357, 366)), card=2, region=(4, 12, 48, 40), polarity="dark",
                         channel="r"),
    "player.arrow": dict(frames=frames(314, 317, 326, 327, 330, 336, 346, 347, 350), box=(347, 14, 22, 26),
                         region=(0, 0, 22, 26), polarity="light"),
}

# The tempo page (docs/research/59-screen-profiling.md §2.11): the speaker is smaller than TE's
# guide art draws it, with a gap between its box and horn and no bar at the horn's end. Traced on
# the still frames at 120 BPM, black on the page's light grey.
TEMPO_STILL = ["steps-693-tempo-start", "steps-699-tempo-bpm-cc80-060", "steps-704-tempo-groove-cc81-064",
               "steps-708-tempo-restore-cc81-064", "steps-709-tempo-restore-cc80-060"] + frames(
    3891, 3901, 3912, 3913, 3914, 3915)
TEMPO = {
    "tempo.device.speaker": dict(frames=TEMPO_STILL, box=(376, 44, 30, 38), region=(0, 0, 30, 38), polarity="dark"),
    "tempo.device.jack": dict(frames=TEMPO_STILL, box=(372, 144, 52, 22), region=(0, 0, 52, 22), polarity="dark"),
}

# Arrange's song mode (docs/research/59-screen-profiling.md §2.9): the loop sign at the header's
# left is a rounded loop with an arrowhead pointing left along its top, not the boxed arrow of TE's
# art. Ink on the white header, traced on the settled song-mode frames. Named arrange.device.* so
# TE's own arrange.* pictograms stay what they are.
SONG_STILL = frames(845, 846, 848, 853, 859, 862, 864, 870)
ARRANGE = {
    "arrange.device.loop": dict(frames=SONG_STILL, box=(8, 2, 32, 20), region=(0, 0, 32, 20), polarity="dark"),
}

# The auxiliary tracks (docs/research/59-screen-profiling.md §2.13), both ink on white cards:
# - the brain's manual card: an open hand where auto shows TE's head (the CC sweeps steps-713…739,
#   in manual, well aligned);
# - the LFO's amp destination: a speaker with a small wave (steps-941…949, the external audio
#   track's M4 with amp in the middle row). Those frames sit 1.15 px right of true (the camera
#   moved at 00:28; research 59 §1.3), so the box is where the card appears in them.
AUX_MANUAL = [f"steps-{n}-brain-m1-{s}" for n, s in [
    (713, "manual-cc12-000"), (714, "cc13-000"), (719, "cc13-080"), (722, "cc13-127"),
    (725, "cc14-032"), (728, "cc14-080"), (731, "cc14-127"), (733, "cc15-032"), (736, "cc15-127")]]
AUX_AMP = [f"steps-{n}-auxlfo-m4-speed-again-cc40-{v:03d}" for n, v in [
    (941, 0), (942, 16), (943, 32), (944, 48), (945, 64), (946, 80), (947, 96), (948, 112), (949, 127)]]
AUXILIARY = {
    "auxiliary.hand": dict(frames=AUX_MANUAL, box=(0, 80, 65, 65), region=(1, 2, 64, 64.5), polarity="dark"),
    "auxiliary.amp": dict(frames=AUX_AMP, box=(241.15, 80, 60, 60), region=(8, 4, 52, 36), polarity="dark"),
}

# The punch-in page (research 59 §2.13): every keyboard key plays its own animation on the 40 × 18
# dot matrix. One frame of each is read off the 10 fps recordings of every key
# (captures/screens/punch-white and punch-black, rectified at 2× like the aligned frames), dot by
# dot: lit (about 250 there) or unlit (about 41). The recordings name no keys: each holds 14 (white)
# or 10 (black) animations between idle stretches, taken here in keyboard order, as the owner played
# them left to right. Keyboard key (0 = F3 … 23 = E5) → frame.
PUNCH_WHITE = {0: 358, 2: 430, 4: 455, 6: 542, 7: 600, 9: 652, 11: 695,
               12: 747, 14: 852, 16: 882, 18: 929, 19: 992, 21: 1058, 23: 1102}
PUNCH_BLACK = {1: 281, 3: 336, 5: 406, 8: 467, 10: 535, 13: 640, 15: 677, 17: 768, 20: 855, 22: 901}
# the recordings' dot centres in capture pixels: first column, column pitch, first row, row pitch
PUNCH_LATTICE = (12.93, 23.975, 10.9, 23.904)


def punch_patterns() -> dict:
    screens = ROOT / "research/device/captures/screens"
    x0, px, y0, py = PUNCH_LATTICE
    out = {}
    for rec, table in (("punch-white", PUNCH_WHITE), ("punch-black", PUNCH_BLACK)):
        for key, n in table.items():
            img = cv2.imread(str(screens / rec / f"{n:05d}.jpg"), cv2.IMREAD_GRAYSCALE)
            if img is None:
                raise SystemExit(f"no recording frame {rec}/{n:05d}")
            g = img.astype(np.float32)
            grid = []
            for j in range(18):
                y = int(round(y0 + py * j))
                cells = [g[y - 4:y + 5, int(round(x0 + px * i)) - 4:int(round(x0 + px * i)) + 5].mean()
                         for i in range(40)]
                grid.append("".join("2" if level > 150 else "1" for level in cells))
            # TE's grid (auxiliary-021's dog): 12 px cells from (0.49, 2.2), unlit panel, lit white
            out[f"auxiliary.punch.{key}"] = {"cell": 12, "x": 0.49, "y": 2.2,
                                             "colors": ["#16161e", "#f7f5f5"], "grid": grid}
    return {name: out[name] for name in sorted(out, key=lambda name: int(name.rsplit(".", 1)[1]))}


# groups whose file also carries cell patterns, and what reads them
PATTERN_GROUPS = {"auxiliary": punch_patterns}


def steps(*patterns: str) -> list[str]:
    """The CC-sweep captures matching glob patterns (steps-NNN-<label>-ccXX-VVV)."""
    out: list[str] = []
    for p in patterns:
        out += sorted(f.stem for f in ALIGNED.glob(f"steps-{p}.png"))
    return out


# The LFO pages (docs/research/59-screen-profiling.md §2.4): pictograms TE's guide art never drew,
# or drew otherwise. Each box is the card it sits on: value's and random's speed card (60, 50),
# element's source card (60, 50) around its black disc, tremolo's shape card (330, 110), element's
# destination card at the column's selected place (240, 80), duck's source card (90, 50); random's
# step wave sits on the black under its speed card. Ink on white, except the white source icons on
# element's disc and random's pale step wave.
SPEED_CARD = (60, 50, 120, 120)
SOURCE_DISC = (34, 34, 86, 86)  # around the disc (r 24) at the card's centre, masked to it
DISC = (60, 60, 24)
NOTE_REGION = (20, 22, 100, 102)  # clear of the count (top right) and random's rule (bottom)
AMP_CARD = steps("*-lfo-element-cc42-096", "*-lfo-element-cc42-112", "*-lfo-element-cc42-127")
MODULES = {
    "lfo.note.32nd": dict(frames=steps("*-lfo-value-cc40-000", "*-lfo-random-cc40-000"), box=SPEED_CARD,
                          region=NOTE_REGION, polarity="dark"),
    "lfo.note.16th": dict(frames=steps("*-lfo-value-cc40-016", "*-lfo-random-cc40-016"), box=SPEED_CARD,
                          region=NOTE_REGION, polarity="dark"),
    "lfo.note.quarter": dict(frames=steps("*-lfo-value-cc40-032", "*-lfo-random-cc40-032", "*-lfo-value-start",
                                          "*-lfo-random-start"), box=SPEED_CARD, region=NOTE_REGION,
                             polarity="dark"),
    "lfo.note.whole": dict(frames=steps("*-lfo-value-cc40-048", "*-lfo-random-cc40-048"), box=SPEED_CARD,
                           region=NOTE_REGION, polarity="dark"),
    "lfo.shape": dict(frames=steps("*-lfo-tremolo-cc4[0-3]-*", "*-lfo-m4-start"), box=(330, 110, 60, 60),
                      region=(4, 4, 56, 56), polarity="dark"),
    "lfo.source.gyro": dict(frames=steps("*-lfo-element-cc40-000", "*-lfo-element-cc40-016"), box=SPEED_CARD,
                            region=SOURCE_DISC, circle=DISC, polarity="light"),
    "lfo.source.mic": dict(frames=steps("*-lfo-element-cc40-032", "*-lfo-element-cc40-048"), box=SPEED_CARD,
                           region=SOURCE_DISC, circle=DISC, polarity="light"),
    "lfo.source.envelope": dict(frames=steps("*-lfo-element-cc40-064", "*-lfo-element-cc40-080",
                                             "*-lfo-element-start"), box=SPEED_CARD, region=SOURCE_DISC,
                                circle=DISC, polarity="light"),
    "lfo.source.sum": dict(frames=steps("*-lfo-element-cc40-096", "*-lfo-element-cc40-112",
                                        "*-lfo-element-cc40-127"), box=SPEED_CARD, region=SOURCE_DISC,
                           circle=DISC, polarity="light"),
    # the speaker and its small wave apart: the wave's thin line is paler than the speaker
    "lfo.dest.amp": dict(frames=AMP_CARD, box=(240, 80, 60, 60), region=(6, 5, 31, 31), polarity="dark"),
    "lfo.dest.amp.wave": dict(frames=AMP_CARD, box=(240, 80, 60, 60), region=(31, 6, 53, 28), polarity="dark"),
    "lfo.duck.metronome": dict(frames=steps("*-lfo-duck-cc40-127", "*-lfo-duck-cc41-*"), box=(90, 50, 120, 120),
                               region=(44, 30, 80, 80), polarity="dark"),
    "lfo.random": dict(frames=steps("*-lfo-random-*"), box=(60, 170, 120, 50), region=(10, 1, 110, 42),
                       polarity="light"),
}

# The sampler engines' M1 pages (docs/research/59-screen-profiling.md §2.5): the header pictograms,
# white on black, bolder than TE's guide art (sampler.*) draws them. Traced on the synth sampler's
# shift layer (b1-2673…2699, the best aligned frames), the multisampler's (b1-2754…2762) and, for
# the play modes only the drum sampler shows, its settled frames (b1-2440…2458 at rest, b1-2519…2532
# the other modes). Those last frames sit (−1.0, −0.43) px from the rest frames at the icon (their
# lanes and badges say the same), so their boxes are moved by as much: every box is where the page
# draws its icon, in the rest frames' place.
DRUM_REST = frames(range(2440, 2459))
SYNTH_SHIFT = frames(range(2678, 2700))
# White on black, the half level sits about 0.7 px outside a shape's edge: the screen font's digits
# measure 1.5 px wider and taller than their outlines, the white handles 1.4 px wider than TE's
# 10 px boxes. The ∞'s dark strokes are widened a little the other way (ours: 0.3 px).
GLARE = -0.7
SAMPLER = {
    "sampler.device.note": dict(frames=SYNTH_SHIFT, box=(102, 2, 12, 21), region=(0, 0, 12, 21),
                                polarity="light", grow=GLARE),
    "sampler.device.play.oneshot": dict(frames=DRUM_REST, box=(438, 1, 42, 22), region=(0, 0, 42, 22),
                                        polarity="light", grow=GLARE),
    "sampler.device.play.key": dict(frames=frames(2519, 2520, 2526, 2532), box=(437, 0.57, 42, 22),
                                    region=(0, 0, 42, 22), polarity="light", grow=GLARE),
    "sampler.device.play.group": dict(frames=frames(2521, 2525), box=(437, 0.57, 42, 22), region=(0, 0, 42, 22),
                                      polarity="light", grow=GLARE),
    "sampler.device.play.loop": dict(frames=frames(2522, 2523, 2524, 2530), box=(437, 0.57, 42, 22),
                                     region=(0, 0, 42, 22), polarity="light", grow=GLARE),
    "sampler.device.direction.forward": dict(frames=frames(2673, 2674) + SYNTH_SHIFT, box=(1, 1, 38, 23),
                                             region=(0, 0, 38, 23), polarity="light", grow=GLARE),
    "sampler.device.direction.backward": dict(frames=frames(2675, 2676, 2677, 2754), box=(1, 1, 38, 23),
                                              region=(0, 0, 38, 23), polarity="light", grow=GLARE),
    # the drum sampler's fade and the samplers' loop crossfade share this ramp (the drum's frames match
    # it to 0.96 IoU); traced on the better aligned synth sampler frames
    "sampler.device.ramp": dict(frames=SYNTH_SHIFT, box=(253, 1, 55, 23), region=(0, 0, 55, 23),
                                polarity="light", grow=GLARE),
    # the loop-forever sign cut out of the crossfade ramp: dark strokes on the white
    "sampler.device.forever": dict(frames=frames(range(2755, 2763)), box=(285, 8, 18, 11), region=(0, 0, 18, 11),
                                   polarity="dark", grow=0.3),
    "sampler.device.percent": dict(frames=frames(range(2689, 2700)), box=(334, 1, 18, 23), region=(0, 0, 18, 23),
                                   polarity="light", grow=GLARE),
}

GROUPS = {"players": PLAYERS, "tempo": TEMPO, "arrange": ARRANGE, "auxiliary": AUXILIARY, "modules": MODULES,
          "sampler": SAMPLER}


def grey(name: str, channel: str = "grey") -> np.ndarray:
    img = cv2.imread(str(ALIGNED / f"{name}.png"))
    if img is None:
        raise SystemExit(f"no capture {name}")
    if channel == "r":
        return img[:, :, 2].astype(np.float32)
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)


def trace(spec: dict, name: str, show: Path | None) -> dict:
    if "card" in spec:
        bx, by, bw, bh = CARD_X[spec["card"]], CARD_Y, 50, 50
    else:
        bx, by, bw, bh = spec["box"]
    rx0, ry0, rx1, ry1 = spec["region"]
    # the region in capture pixels (2 per panel pixel; design rows → panel rows)
    cx0, cx1 = int(round((bx + rx0) * 2)), int(round((bx + rx1) * 2))
    cy0, cy1 = int(round((by + ry0) / K * 2)), int(round((by + ry1) / K * 2))
    stack = np.mean([grey(f, spec.get("channel", "grey"))[cy0:cy1, cx0:cx1] for f in spec["frames"]], axis=0)
    up = cv2.resize(stack, None, fx=UP, fy=UP, interpolation=cv2.INTER_CUBIC)
    up = cv2.GaussianBlur(up, (0, 0), 1.0)
    ring = np.concatenate([up[:3].ravel(), up[-3:].ravel(), up[:, :3].ravel(), up[:, -3:].ravel()])
    card = float(np.median(ring))
    if "circle" in spec:
        # a pictogram on a disc (x, y, r relative to the box): the disc's own shade just inside its
        # rim is the background, and everything outside the disc is taken as that shade
        ccx, ccy, cr = spec["circle"]
        jj, ii = np.mgrid[0:up.shape[0], 0:up.shape[1]]
        dx = (ii + 0.5) / (2 * UP) + cx0 / 2 - bx - ccx
        dy = ((jj + 0.5) / (2 * UP) + cy0 / 2) * K - by - ccy
        dist = np.hypot(dx, dy)
        card = float(np.median(up[(dist > cr - 3) & (dist < cr - 1)]))
        up = np.where(dist > cr - 1, card, up)
    ink = float(np.percentile(up, 99 if spec["polarity"] == "light" else 1))
    level = (card + ink) / 2
    mask = (up > level) if spec["polarity"] == "light" else (up < level)
    mask = mask.astype(np.uint8) * 255
    if spec.get("grow"):
        # the camera's glare puts a bright shape's half level about 0.7 px outside its edge (a dark
        # shape's inside it): `grow` (design px, negative to shrink) moves the outline back
        r = int(round(abs(spec["grow"]) * 2 * UP))
        disk = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
        mask = cv2.dilate(mask, disk) if spec["grow"] > 0 else cv2.erode(mask, disk)
    contours, _ = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    parts = []
    for c in contours:
        if cv2.contourArea(c) < (2 * UP) ** 2:  # under a panel pixel
            continue
        c = cv2.approxPolyDP(c, 0.12 * 2 * UP, True)[:, 0, :].astype(np.float64)
        # upsampled pixel → panel px, then relative to the box in design px
        px = (c[:, 0] + 0.5) / (2 * UP) + cx0 / 2
        py = (c[:, 1] + 0.5) / (2 * UP) + cy0 / 2
        xs, ys = px - bx, py * K - by
        parts.append("M" + " ".join(f"{x:.2f} {y:.2f}" for x, y in zip(xs, ys)) + "Z")
    if show:
        over = cv2.cvtColor(np.clip(up, 0, 255).astype(np.uint8), cv2.COLOR_GRAY2BGR)
        cv2.drawContours(over, contours, -1, (0, 0, 255), 1)
        cv2.imwrite(str(show / f"{name}.png"), over)
    return {"w": bw, "h": bh, "shapes": [{"d": " ".join(parts), "fill": "#f7f5f5", "evenodd": True}]}


def main() -> None:
    show = Path(sys.argv[sys.argv.index("--show") + 1]) if "--show" in sys.argv else None
    if show:
        show.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    comment = ("Traced by research/device/icontrace.py from camera captures of the owner's OP-XY "
               "(OS 1.1.33) screen (docs/research/59-screen-profiling.md). Do not edit by hand. Units: "
               "design pixels (480 × 220), origin at each icon's box (the card it sits on); pages "
               "recolour the fill.")
    # --group NAME traces one group only (the others' files stay as they are)
    only = sys.argv[sys.argv.index("--group") + 1] if "--group" in sys.argv else None
    for group, specs in GROUPS.items():
        if only and group != only:
            continue
        icons = {name: trace(spec, name, show) for name, spec in specs.items()}
        data = {"$comment": comment, "format": 1, "icons": icons}
        if group in PATTERN_GROUPS:
            # pictures read dot by dot off a cell grid (the punch-in matrix)
            data["$comment"] += " Patterns: one character per dot, 1 unlit and 2 lit."
            data["patterns"] = PATTERN_GROUPS[group]()
        path = OUT / f"{group}.json"
        # a pattern's two colours on one line, as the repository's formatter writes them
        text = re.sub(r'\[\s+("#[0-9a-f]{6}"),\s+("#[0-9a-f]{6}")\s+\]', r"[\1, \2]", json.dumps(data, indent="\t"))
        path.write_text(text + "\n")
        print(f"wrote {path.relative_to(ROOT)}: {', '.join([*icons, *data.get('patterns', {})])}")


if __name__ == "__main__":
    main()
