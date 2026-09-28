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

GROUPS = {"players": PLAYERS, "tempo": TEMPO, "arrange": ARRANGE, "auxiliary": AUXILIARY}


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
    ink = float(np.percentile(up, 99 if spec["polarity"] == "light" else 1))
    level = (card + ink) / 2
    mask = (up > level) if spec["polarity"] == "light" else (up < level)
    mask = mask.astype(np.uint8) * 255
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
        path = OUT / f"{group}.json"
        path.write_text(json.dumps({"$comment": comment, "format": 1, "icons": icons}, indent="\t") + "\n")
        print(f"wrote {path.relative_to(ROOT)}: {', '.join(icons)}")


if __name__ == "__main__":
    main()
