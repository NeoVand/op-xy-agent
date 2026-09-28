"""The envelope editor's exact geometry and curve shapes, from the realigned `env2-amp` captures
(docs/research/59-screen-profiling.md §2.2). Read-only: works on files.

Each chosen frame is re-rectified at 4x from its raw camera frame with its own drift (from
captures/aligned/index.json, written by `screencap.py realign`). Then:
- the five handles (the only solid squares) give the graph's frame: baseline, top, start, end, and
  the handle size;
- each segment's centre line is traced across its chord (bright pixels only, handles masked), and
  fitted with a cubic that leaves its start vertically and meets its end horizontally (two control
  lengths, as fractions of the segment), and with alternatives for comparison;
- line widths and colours of the selected curve, the other envelope and the drop lines.

  uv run --with opencv-python-headless --with numpy --with scipy \
      python research/device/envshape.py
"""

import json
import pathlib

import cv2
import numpy as np
from scipy.optimize import minimize

import screencap

HERE = pathlib.Path(__file__).parent
SCREENS = HERE / "captures" / "screens"
ALIGNED = HERE / "captures" / "aligned"
S = 4


def frame4(name: str) -> tuple[np.ndarray, np.ndarray]:
    """The capture re-rectified at 4x (grey, colour) with its own drift."""
    index = json.loads((ALIGNED / "index.json").read_text())
    calib = screencap.load_calib()
    d = index[name]
    th = np.radians(d["rot"])
    warp = np.array([[np.cos(th), -np.sin(th), d["dx"]], [np.sin(th), np.cos(th), d["dy"]]])
    corners = np.array(calib["corners"])
    moved = np.hstack([corners, np.ones((4, 1))]) @ warp.T
    raw = cv2.imread(str(SCREENS / f"{name}-raw.jpg"))
    colour = screencap.rectify(raw, {**calib, "corners": moved.tolist()}, S)
    return cv2.cvtColor(colour, cv2.COLOR_BGR2GRAY), colour


def squares(img: np.ndarray) -> list[dict]:
    """Solid squares (the handles): centre and side in panel px."""
    bright = (img > 150).astype(np.uint8)
    solid = cv2.morphologyEx(bright, cv2.MORPH_OPEN, np.ones((5 * S, 5 * S), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(solid)
    out = []
    for i in range(1, count):
        x, y, w, h, area = stats[i]
        if not (5 * S <= w <= 11 * S and 5 * S <= h <= 11 * S and area >= 0.6 * w * h):
            continue
        # side from the half-maximum extent through the centre row and column
        ys, xs = np.nonzero(labels == i)
        cx, cy = xs.mean(), ys.mean()
        row = img[int(round(cy)), max(int(x) - 8, 0):int(x + w) + 8].astype(float)
        col = img[max(int(y) - 8, 0):int(y + h) + 8, int(round(cx))].astype(float)
        half = lambda p: ((p > (p.max() + np.median(p[:4])) / 2).sum())
        out.append({"x": (cx + 0.5) / S, "y": (cy + 0.5) / S, "w": half(row) / S, "h": half(col) / S})
    return sorted(out, key=lambda s: s["x"])


def bilinear(img, xs, ys):
    x0 = np.clip(np.floor(xs).astype(int), 0, img.shape[1] - 2)
    y0 = np.clip(np.floor(ys).astype(int), 0, img.shape[0] - 2)
    fx, fy = xs - x0, ys - y0
    f = img.astype(np.float64)
    return (f[y0, x0] * (1 - fx) * (1 - fy) + f[y0, x0 + 1] * fx * (1 - fy)
            + f[y0 + 1, x0] * (1 - fx) * fy + f[y0 + 1, x0 + 1] * fx * fy)


def trace(img, a, b, avoid, clear=5.5, n=120, level=215):
    """Centre line of the bright curve from handle a to handle b (panel px), across the chord."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    d = b - a
    length = np.linalg.norm(d)
    t = d / length
    nrm = np.array([-t[1], t[0]])
    lo, hi = np.minimum(a, b) - 1.0, np.maximum(a, b) + 1.0
    offs = np.arange(-length, length, 0.125)
    pts = []
    for s in np.linspace(0, 1, n):
        c = a + d * s
        line = c[None, :] + offs[:, None] * nrm[None, :]
        keep = np.all((line >= lo) & (line <= hi), axis=1)
        for h in avoid:
            keep &= np.hypot(line[:, 0] - h[0], line[:, 1] - h[1]) > clear
        if keep.sum() < 4:
            continue
        ln, of = line[keep], offs[keep]
        val = bilinear(img, ln[:, 0] * S - 0.5, ln[:, 1] * S - 0.5)
        # the selected curve peaks near 240; the other envelope reaches ~197, drop lines ~128
        bright = val > level
        if not bright.any():
            continue
        k = int(np.argmax(val))
        i0 = k
        while i0 > 0 and bright[i0 - 1]:
            i0 -= 1
        i1 = k
        while i1 < len(val) - 1 and bright[i1 + 1]:
            i1 += 1
        if (of[i1] - of[i0]) > 4:  # a 1-2 px line crossing, not a run along it
            continue
        w = val[i0:i1 + 1] - level
        pts.append(c + nrm * float((of[i0:i1 + 1] * w).sum() / w.sum()))
    return np.array(pts)


def cubic(a, c1, c2, b, n=800):
    t = np.linspace(0, 1, n)[:, None]
    return (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * c1 + 3 * (1 - t) * t ** 2 * c2 + t ** 3 * b


def dist(points, poly):
    d = points[:, None, :] - poly[None, :, :]
    return np.sqrt((d ** 2).sum(axis=2)).min(axis=1)


def fit_vh(points, a, b):
    """Vertical start, horizontal end: c1 = a + (0, k1·dy), c2 = b − (k2·dx, 0)."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    dx, dy = b[0] - a[0], b[1] - a[1]

    def cost(p):
        c1 = a + np.array([0, p[0] * dy])
        c2 = b - np.array([p[1] * dx, 0])
        return float((dist(points, cubic(a, c1, c2, b)) ** 2).mean())

    best = min((minimize(cost, g, method="Nelder-Mead", options={"xatol": 1e-4, "fatol": 1e-6})
                for g in ([0.5, 0.5], [0.9, 0.1], [0.2, 0.8])), key=lambda r: r.fun)
    return [round(float(v), 4) for v in best.x], float(np.sqrt(best.fun))


def fit_free(points, a, b):
    """Any cubic between the handles (four control coordinates as fractions of the segment)."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    dx, dy = b[0] - a[0], b[1] - a[1]

    def cost(p):
        c1 = a + np.array([p[0] * dx, p[1] * dy])
        c2 = a + np.array([p[2] * dx, p[3] * dy])
        return float((dist(points, cubic(a, c1, c2, b)) ** 2).mean())

    r = minimize(cost, [0.0, 0.6, 0.6, 1.0], method="Nelder-Mead",
                 options={"xatol": 1e-4, "fatol": 1e-6, "maxiter": 4000})
    return [round(float(v), 4) for v in r.x], float(np.sqrt(r.fun))


def fit_exp(points, a, b):
    """y moves as 1 − e^(−k·u) (normalised), u the horizontal fraction."""
    a, b = np.asarray(a, float), np.asarray(b, float)

    def curve(k):
        u = np.linspace(0, 1, 800)
        v = (1 - np.exp(-k * u)) / (1 - np.exp(-k))
        return np.stack([a[0] + u * (b[0] - a[0]), a[1] + v * (b[1] - a[1])], axis=1)

    r = minimize(lambda p: float((dist(points, curve(p[0])) ** 2).mean()), [4.0], method="Nelder-Mead")
    return [round(float(r.x[0]), 3)], float(np.sqrt(r.fun))


def main() -> None:
    states = json.loads((SCREENS / "env2-amp.json").read_text())["states"]
    by_label = {s["label"]: f"env2-amp-{s['n']:03d}" for s in states}
    # 1. the frame: start and end handles over the reference states
    frames = {}
    for label in ["ref", "amp-attack-127", "amp-attack-064", "amp-decay-127", "amp-sustain-127",
                  "amp-release-000", "amp-x127-127-064-000", "amp-x000-127-000-000",
                  "amp-x127-127-000-000", "amp-x064-064-127-064", "amp-x032-032-100-032"]:
        name = by_label[label]
        grey, colour = frame4(name)
        frames[label] = (name, grey, colour, squares(grey))
    starts, ends, tops, sides = [], [], [], []
    for label, (name, grey, colour, sq) in frames.items():
        print(f"{label:24s} {name}: " + " ".join(f"({s['x']:.2f},{s['y']:.2f} {s['w']:.1f}x{s['h']:.1f})" for s in sq))
        starts.append((sq[0]["x"], sq[0]["y"]))
        ends.append((sq[-1]["x"], sq[-1]["y"]))
        sides += [s["w"] for s in sq] + [s["h"] for s in sq]
        top = [s["y"] for s in sq if s["y"] < 60]
        if top:
            tops.append(min(top))
    starts, ends = np.array(starts), np.array(ends)
    print(f"start handle {starts.mean(axis=0).round(2)} ± {starts.std(axis=0).round(2)}")
    print(f"end handle   {ends.mean(axis=0).round(2)} ± {ends.std(axis=0).round(2)}")
    print(f"top (peak y) {np.mean(tops):.2f} ± {np.std(tops):.2f}; handle side {np.median(sides):.2f}")
    # 2. curves on the long, separate segments
    for label in ["amp-x127-127-064-000", "amp-x127-127-000-000", "amp-x000-127-000-000",
                  "amp-attack-127", "amp-release-000", "amp-x032-032-100-032"]:
        name, grey, colour, sq = frames[label]
        if len(sq) < 5:
            print(label, "handles:", len(sq))
            continue
        st, pk, de, rs, en = [(s["x"], s["y"]) for s in sq[:5]]
        avoid = [st, pk, de, rs, en]
        for seg, (a, b) in {"attack": (st, pk), "decay": (pk, de), "release": (rs, en)}.items():
            if abs(b[0] - a[0]) < 15 or abs(b[1] - a[1]) < 15:
                continue
            pts = trace(grey, a, b, avoid)
            if len(pts) < 20:
                continue
            vh, e_vh = fit_vh(pts, a, b)
            fr, e_fr = fit_free(pts, a, b)
            ex, e_ex = fit_exp(pts, a, b)
            print(f"  {label:22s} {seg:7s} {len(pts):3d} pts  vh {vh} rms {e_vh:.3f} | free {fr} rms {e_fr:.3f} | exp {ex} rms {e_ex:.3f}")
    # 3. widths and colours: across the sustain line and the other envelope's baseline run
    name, grey, colour, sq = frames["amp-x127-127-064-000"]
    de, rs = sq[2], sq[3]
    xm = (de["x"] + rs["x"]) / 2
    col = grey[:, int(xm * S)].astype(float)
    y = de["y"]
    seg = col[int((y - 4) * S):int((y + 4) * S)]
    print(f"sustain line at x {xm:.1f}: FWHM {((seg > (seg.max() + seg.min()) / 2).sum()) / S:.2f} px, peak {seg.max():.0f}")
    bgr = colour[int(y * S) - 1:int(y * S) + 2, int(xm * S) - 4:int(xm * S) + 4].reshape(-1, 3).mean(axis=0)
    print(f"  selected curve colour (BGR, normalised camera) {bgr.round()}")
    base = grey[:, int(300 * S)].astype(float)
    print("  column x=300 profile near the baseline (y, level):",
          [(round(i / S, 2), int(v)) for i, v in enumerate(base) if v > 60 and 190 * S < i < 215 * S][:12])
    for label in ["amp-x127-127-064-000"]:
        pk = sq[1]
        c = grey[int((pk["y"] + 20) * S):int((sq[0]["y"] - 10) * S), :].astype(float)
        x0 = int(pk["x"] * S)
        prof = c[:, x0 - 12:x0 + 13].mean(axis=0)
        print(f"  drop line under the peak: profile {prof.round().astype(int).tolist()}")


if __name__ == "__main__":
    main()
