"""Measures the envelope captures (envsweep.py) in the screen's own pixels (480 x 222): where the
selected envelope's five handles sit for each state, and the shape of the curves between them.

Each capture's index (captures/screens/<prefix>.json) names the state it shows. Handles are found
as the only solid squares on the page (lines and text are thinner) and matched to where the state
puts them; each frame is then mapped so its start and end handles and the top land on the same
spot, which takes out any camera drift. Curves are traced along lines across their chord, then
fitted with several shapes in pixel distance.

  uv run --with opencv-python-headless --with numpy --with scipy \
      python research/device/envfit.py [--prefix env2-amp] [--plot]
writes captures/screens/<prefix>-fit.json (and <prefix>-curves.png with --plot).
"""

import json
import pathlib
import sys

import cv2
import numpy as np
from scipy.optimize import minimize

SCREENS = pathlib.Path(__file__).parent / "captures" / "screens"
S = 4  # capture pixels per panel pixel in the -4x images
STAGES = ("attack", "decay", "sustain", "release")


def arg(name, default, cast=str):
    return cast(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else default


# ---- handles ---------------------------------------------------------------------------------

def squares(img: np.ndarray) -> list[tuple[float, float]]:
    """Centres (panel pixels) of the solid squares: handles are 7 px across, lines and letters at
    most 3.5, so an opening 5 px wide keeps only handles."""
    bright = (img > 150).astype(np.uint8)
    solid = cv2.morphologyEx(bright, cv2.MORPH_OPEN, np.ones((5 * S, 5 * S), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(solid)
    out = []
    for i in range(1, count):
        x, y, w, h, area = stats[i]
        if not (5 * S <= w <= 11 * S and 5 * S <= h <= 11 * S and area >= 0.6 * w * h):
            continue
        # the centre of the bright square itself, weighted by brightness over the threshold
        ys, xs = np.nonzero(labels[y:y + h, x:x + w] == i)
        wts = img[y + ys, x + xs].astype(np.float64) - 150
        out.append((float(((x + xs + 0.5) * wts).sum() / wts.sum()) / S,
                    float(((y + ys + 0.5) * wts).sum() / wts.sum()) / S))
    return out


def predict(env: list[int]) -> dict:
    """Where a state puts the five handles, from the first sweep's rough fits (panel pixels)."""
    a, d, s, r = env
    peak_x = 41.0 + 0.907 * a
    sus_y = 201.6 - 1.335 * s
    return {"start": (41.0, 201.6), "peak": (peak_x, 32.8), "decay": (peak_x + 0.78 * d, sus_y),
            "release": (332.7 + 0.84 * r, sus_y), "end": (440.5, 201.6)}


def match(found: list[tuple[float, float]], expected: dict, reach: float = 9.0) -> dict:
    """Each expected handle gets the nearest square within `reach` (handles that coincide on the
    screen share one square)."""
    out = {}
    for name, (ex, ey) in expected.items():
        best = min(found, key=lambda p: (p[0] - ex) ** 2 + (p[1] - ey) ** 2, default=None)
        if best is not None and np.hypot(best[0] - ex, best[1] - ey) <= reach:
            out[name] = best
    return out


# ---- per-frame drift -------------------------------------------------------------------------

LEFT, RIGHT, BOTTOM, TOP = 41.0, 440.5, 201.6, 32.8


def drift(ref: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    """The mean start and end handle over the reference frames: the frame's own axis."""
    starts = np.array([r["start"] for r in ref])
    ends = np.array([r["end"] for r in ref])
    return starts.mean(axis=0), ends.mean(axis=0)


def to_axis(p, start, end, top_y):
    """Panel point -> the graph's own frame: the start at (LEFT, BOTTOM), the end at (RIGHT, BOTTOM),
    the top at TOP (a rotation about the start, x scaled by the baseline, y by the top's height)."""
    p, start, end = np.asarray(p, float), np.asarray(start, float), np.asarray(end, float)
    ux = (end - start) / np.linalg.norm(end - start)
    uy = np.array([-ux[1], ux[0]])  # down the screen
    q = p - start
    along, down = q @ ux, q @ uy
    sx = (RIGHT - LEFT) / np.linalg.norm(end - start)
    sy = (BOTTOM - TOP) / (start @ uy - top_y) if top_y is not None else sx
    return np.array([LEFT + along * sx, BOTTOM + down * sy])


# ---- curves ----------------------------------------------------------------------------------

def bilinear(img: np.ndarray, xs: np.ndarray, ys: np.ndarray) -> np.ndarray:
    x0 = np.clip(np.floor(xs).astype(int), 0, img.shape[1] - 2)
    y0 = np.clip(np.floor(ys).astype(int), 0, img.shape[0] - 2)
    fx, fy = xs - x0, ys - y0
    f = img.astype(np.float64)
    return (f[y0, x0] * (1 - fx) * (1 - fy) + f[y0, x0 + 1] * fx * (1 - fy)
            + f[y0 + 1, x0] * (1 - fx) * fy + f[y0 + 1, x0 + 1] * fx * fy)


def ridge(img: np.ndarray, a, b, avoid, n: int = 80, clear: float = 5.0) -> np.ndarray:
    """The curve's centre line from handle a to handle b (panel pixels): along lines across the
    chord, the brightness centre of the bright run nearest the chord's bulge side. The curves are
    monotonic, so each line meets them once; the drop lines and the other envelope are dim, and
    points within `clear` px of a handle are dropped (the squares hide the line there)."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    d = b - a
    length = np.linalg.norm(d)
    t = d / length
    nrm = np.array([-t[1], t[0]])
    lo, hi = np.minimum(a, b) - 1.5, np.maximum(a, b) + 1.5
    offs = np.arange(-length, length, 0.25 / S * 4)
    pts = []
    for s in np.linspace(0.0, 1.0, n):
        c = a + d * s
        line = c[None, :] + offs[:, None] * nrm[None, :]
        keep = np.all((line >= lo) & (line <= hi), axis=1)
        for h in avoid:
            keep &= np.hypot(line[:, 0] - h[0], line[:, 1] - h[1]) > clear
        if keep.sum() < 3:
            continue
        ln, of = line[keep], offs[keep]
        val = bilinear(img, ln[:, 0] * S - 0.5, ln[:, 1] * S - 0.5)
        bright = val > 150
        if not bright.any():
            continue
        k = int(np.argmax(val))
        i0 = k
        while i0 > 0 and bright[i0 - 1]:
            i0 -= 1
        i1 = k
        while i1 < len(val) - 1 and bright[i1 + 1]:
            i1 += 1
        if i1 - i0 > 12 * S:  # a long run is not a 2 px line crossing
            continue
        w = val[i0:i1 + 1] - 150
        pts.append(c + nrm * float((of[i0:i1 + 1] * w).sum() / w.sum()))
    return np.array(pts)


def dense(curve, n=600):
    return curve(np.linspace(0, 1, n))


def cubic(c1, c2):
    """Normalised cubic from (0,0) to (1,1) through control points c1, c2."""
    c1, c2 = np.asarray(c1, float), np.asarray(c2, float)

    def f(t):
        t = t[:, None]
        return 3 * (1 - t) ** 2 * t * c1 + 3 * (1 - t) * t ** 2 * c2 + t ** 3 * np.array([1.0, 1.0])
    return f


def graph(fn):
    """A curve v = fn(u) over u in [0, 1]."""
    def f(t):
        return np.stack([t, fn(t)], axis=1)
    return f


def expo(k):
    """The exponential approach reaching the end at u = 1: v = (1 - e^-ku) / (1 - e^-k)."""
    return graph(lambda u: (1 - np.exp(-k * u)) / (1 - np.exp(-k)) if abs(k) > 1e-6 else u)


MODELS = {
    # name: (parameter guess, bounds, curve from parameters, axis the start tangent follows)
    "cubic-vh": ([0.6, 0.4], [(0, 1.5), (0, 1.5)], lambda p: cubic((0, p[0]), (1 - p[1], 1))),
    "cubic-free": ([0.05, 0.6, 0.6, 0.95], [(-0.5, 1.5)] * 4,
                   lambda p: cubic((p[0], p[1]), (p[2], p[3]))),
    "quad-corner": ([], [], lambda p: cubic((0, 2 / 3), (1 / 3, 1))),
    "quad-vertical": ([1.0], [(0, 3)], lambda p: cubic((0, 2 / 3 * p[0]),
                                                        (1 / 3, 1 + 2 / 3 * (p[0] - 1)))),
    "exp": ([3.0], [(0.01, 20)], lambda p: expo(p[0])),
}


def fit(points: np.ndarray, a, b, model: str, vertical_first: bool):
    """Best parameters of a model for traced points between a and b, in pixel distance. In the
    normalised frame u runs along the segment's first tangent axis: for a curve that leaves its
    start vertically (all three here), u follows y and v follows x... the frame is chosen so each
    model's (0,0)->(1,1) maps onto a->b with the start tangent along v."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    guess, bounds, make = MODELS[model]

    def to_px(uv):
        # u is the horizontal fraction, v the vertical fraction of the segment
        return a + np.stack([uv[:, 0] * (b[0] - a[0]), uv[:, 1] * (b[1] - a[1])], axis=1)

    def cost(p):
        curve = to_px(dense(make(p)))
        d = points[:, None, :] - curve[None, :, :]
        return float(np.sqrt((d ** 2).sum(axis=2)).min(axis=1).__pow__(2).mean())

    if not guess:
        return [], float(np.sqrt(cost([])))
    res = minimize(cost, guess, method="Nelder-Mead", options={"xatol": 1e-3, "fatol": 1e-4,
                                                               "maxiter": 800})
    return [round(float(v), 4) for v in res.x], float(np.sqrt(res.fun))


# ---- main ------------------------------------------------------------------------------------

def main() -> None:
    prefix = arg("--prefix", "env2-amp")
    index = json.loads((SCREENS / f"{prefix}.json").read_text())
    selected = "amp" if index["plan"] == "amp" else "filter"
    rows = []
    for st in index["states"]:
        if not st["label"].startswith((selected, "ref")):
            continue
        img = cv2.imread(str(SCREENS / st["file"].replace(".png", "-4x.png")), cv2.IMREAD_GRAYSCALE)
        env = st[selected]
        h = match(squares(img), predict(env))
        rows.append({"n": st["n"], "label": st["label"], "env": env, "handles": h, "img": img})
    refs = [r["handles"] for r in rows if r["label"].startswith("ref") and "start" in r["handles"]
            and "end" in r["handles"]]
    start0, end0 = drift(refs)
    print(f"reference start {start0.round(2)}, end {end0.round(2)} over {len(refs)} frames")
    for r in rows:
        h = r["handles"]
        if "start" in h and "end" in h:
            dev = max(np.hypot(*(np.array(h["start"]) - start0)), np.hypot(*(np.array(h["end"]) - end0)))
            if dev > 0.6:
                print(f"  drift {dev:.2f} px at {r['label']}")
    # handle positions in the graph's frame, per stage sweep
    table = {}
    for r in rows:
        h = r["handles"]
        if not {"start", "end", "peak"} <= h.keys():
            continue
        top = h["peak"][1]
        g = {k: to_axis(v, h["start"], h["end"], None) for k, v in h.items()}
        r["graph"] = g
        table.setdefault(r["label"].split("-")[1] if "-" in r["label"] else "ref", []).append(r)
    fits = {}
    for stage in STAGES:
        pts = []
        for r in rows:
            parts = r["label"].split("-")
            if len(parts) != 3 or parts[1] != stage or "graph" not in r:
                continue
            g, v = r["graph"], r["env"][STAGES.index(stage)]
            if stage == "attack":
                y = g["peak"][0]
            elif stage == "decay":
                if "decay" not in g:
                    continue
                y = g["decay"][0] - g["peak"][0]
            elif stage == "sustain":
                if "decay" not in g:
                    continue
                y = g["decay"][1]
            else:
                if "release" not in g:
                    continue
                y = g["release"][0]
            pts.append((v, float(y)))
        pts.sort()
        v = np.array([p[0] for p in pts], float)
        y = np.array([p[1] for p in pts], float)
        slope, icpt = np.polyfit(v, y, 1)
        resid = y - (slope * v + icpt)
        fits[stage] = {"slope": float(slope), "intercept": float(icpt),
                       "max_resid": float(np.abs(resid).max()), "points": pts}
        print(f"{stage:8s} = {icpt:7.2f} + {slope:.4f}*cc   max resid {np.abs(resid).max():.2f}")
        print("   ", " ".join(f"{int(a)}:{b:.1f}({c:+.1f})" for a, b, c in zip(v, y, resid)), flush=True)
    # curve shapes
    shapes = {"attack": [], "decay": [], "release": []}
    traced = {"attack": [], "decay": [], "release": []}
    for r in rows:
        h = r["handles"]
        if not {"start", "peak", "decay", "release", "end"} <= h.keys():
            continue
        avoid = list(h.values())
        for name, (a, b) in {"attack": (h["start"], h["peak"]), "decay": (h["peak"], h["decay"]),
                             "release": (h["release"], h["end"])}.items():
            w, ht = abs(b[0] - a[0]), abs(b[1] - a[1])
            if w < 10 or ht < 10:
                continue
            pts = ridge(r["img"], a, b, avoid)
            if len(pts) < 15:
                continue
            entry = {"n": r["n"], "label": r["label"], "w": round(w, 2), "h": round(ht, 2),
                     "points": len(pts)}
            for model in MODELS:
                p, rms = fit(pts, a, b, model, True)
                entry[model] = {"p": p, "rms": round(rms, 3)}
            shapes[name].append(entry)
            traced[name].append(((pts - np.array(a)) / (np.array(b) - np.array(a))).tolist())
        print(f"  {r['label']:26s}", " ".join(
            f"{k}:{shapes[k][-1]['exp']['p']}/{shapes[k][-1]['cubic-vh']['p']}"
            for k in shapes if shapes[k] and shapes[k][-1]["n"] == r["n"]), flush=True)
    for name, entries in shapes.items():
        if not entries:
            continue
        print(f"{name}: {len(entries)} curves")
        for model in MODELS:
            rms = [e[model]["rms"] for e in entries]
            ps = np.array([e[model]["p"] for e in entries]) if entries[0][model]["p"] else None
            desc = f"median p {np.median(ps, axis=0).round(3).tolist()} spread {ps.std(axis=0).round(3).tolist()}" if ps is not None else ""
            print(f"  {model:14s} rms median {np.median(rms):.3f} max {max(rms):.3f}  {desc}")
    out = SCREENS / f"{prefix}-fit.json"
    for r in rows:
        r.pop("img", None)
        r.pop("graph", None)
    out.write_text(json.dumps({"fits": fits, "shapes": shapes, "rows": rows, "traced": traced}))
    print(out)


if __name__ == "__main__":
    main()
