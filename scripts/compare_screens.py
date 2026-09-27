"""Scores our 2x screen renders against TE's guide pictures (see compare-screens.mjs).

Reads a JSON list of {id, page, expected, ours, guide, image} on stdin. Our render (960 x 440)
goes on a black 960 x 444 canvas one screen row down (TE's 220 rows centred in 222); the guide
picture is fitted to the same canvas. The best alignment within +-3 px (the guide pictures are
cropped slightly differently) gives the mean absolute luminance difference (0-1). Each comparison
image stacks ours, TE's and the difference (red) for looking at. Prints the results as JSON.
"""

import json
import sys

import numpy as np
from PIL import Image

W, H = 960, 444


def canvas(img, dy):
    out = Image.new("RGB", (W, H), (0, 0, 0))
    out.paste(img.convert("RGB"), (0, dy))
    return out


def lum(img):
    a = np.asarray(img, dtype=np.float32)
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def score(pair):
    try:
        ours = canvas(Image.open(pair["ours"]), 2)
        guide_raw = Image.open(pair["guide"]).convert("RGB")
    except FileNotFoundError as e:
        return {**pair, "error": f"missing {e.filename}"}
    guide = guide_raw.resize((W, round(guide_raw.height * W / guide_raw.width)))
    a = lum(ours)
    best = None
    for dy in range(-3, 4):
        for dx in range(-3, 4):
            g = Image.new("RGB", (W, H), (0, 0, 0))
            g.paste(guide, (dx, dy + (H - guide.height) // 2))
            mad = float(np.mean(np.abs(a - lum(g))) / 255)
            if best is None or mad < best[0]:
                best = (mad, dx, dy, g)
    mad, dx, dy, g = best
    diff = np.abs(np.asarray(ours, dtype=np.int16) - np.asarray(g, dtype=np.int16)).max(axis=2)
    red = np.zeros((H, W, 3), dtype=np.uint8)
    red[..., 0] = np.clip(diff * 2, 0, 255)
    sheet = Image.new("RGB", (W, H * 3 + 8), (40, 40, 40))
    sheet.paste(ours, (0, 0))
    sheet.paste(g, (0, H + 4))
    sheet.paste(Image.fromarray(red), (0, 2 * H + 8))
    sheet.save(pair["image"])
    return {**pair, "mad": mad, "offset": f"{dx:+d},{dy:+d}"}


print(json.dumps([score(p) for p in json.load(sys.stdin)]))
