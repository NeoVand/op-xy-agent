"""Screen captures from the camera over the OP-XY (docs/research/59-screen-profiling.md).

`camera.command` (run by Terminal.app, which holds the camera permission) keeps writing the latest
camera frame to captures/cam/live.jpg. This tool finds the screen in it once (`calib`), then turns
any frame into the screen's own grid: 960 x 444, twice the panel's 480 x 222, white-balanced so
the display's black is black and its white is white. Read-only: nothing is sent to the device.

Usage (uv run --with opencv-python-headless --with numpy python research/device/screencap.py ...):
  calib [--guess x,y,...]   find the screen's corners in the current frame, from a rough outline
                            (top-left, top-right, bottom-right, bottom-left) or a guess of its own,
                            each side then fitted to the panel's edge; writes captures/cam/calib.json,
                            calib-check.png (the outline) and calib-screen.png (the result)
  calib --lit               refit the corners on a page lit edge to edge (tempo), starting from
                            the saved calibration; the most accurate way (bezel edges are faint)
  check                     on a lit page: how far the screen has moved since calibration
  snap NAME                 the current screen -> captures/screens/NAME.png (and NAME-raw.jpg)
  watch PREFIX [--min S] [--every S]
                            save every screen that changes and then holds still for --min seconds
                            (default 0.3) as captures/screens/PREFIX-NNN.png, with a log in
                            PREFIX.json; with --every, moving screens too, that often; runs until
                            stopped
  record PREFIX             every frame (10 a second) as JPEG into captures/screens/PREFIX/, for
                            animations; runs until stopped
  realign [GLOB]            re-rectify captures that kept a raw frame, each with its own drift
                            (the device slides, the phone re-frames) -> captures/aligned/
"""

import json
import pathlib
import sys
import time

import cv2
import numpy as np

HERE = pathlib.Path(__file__).parent
CAM = HERE / "captures" / "cam"
SCREENS = HERE / "captures" / "screens"
LIVE = CAM / "live.jpg"
CALIB = CAM / "calib.json"
# the panel is 480 x 222; captures are twice that
W, H = 960, 444


def frame() -> np.ndarray:
    """The latest camera frame (BGR); retries while the writer swaps the file."""
    for _ in range(50):
        img = cv2.imread(str(LIVE))
        if img is not None:
            return img
        time.sleep(0.02)
    raise SystemExit(f"no frame in {LIVE}: is camera.command running?")


def order(pts: np.ndarray) -> np.ndarray:
    """Corners as top-left, top-right, bottom-right, bottom-left."""
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1)[:, 0]
    return np.array([pts[s.argmin()], pts[d.argmin()], pts[s.argmax()], pts[d.argmax()]], np.float32)


def find_screen(img: np.ndarray) -> np.ndarray:
    """The lit panel's corners: its black glows a little above the bezel's."""
    grey = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (0, 0), 3)
    # the bezel around the screen is the darkest thing near it: take the level halfway between
    # the bezel and the panel's black, from the frame's own histogram of dark pixels
    dark = grey[grey < 60]
    bezel, black = np.percentile(dark, 20), np.percentile(dark, 60)
    mask = (grey > (bezel + black) / 2).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    # the screen: the largest region that does not touch the frame's edge
    best = None
    for i in range(1, count):
        x, y, w, h, area = stats[i]
        if x == 0 or y == 0 or x + w >= img.shape[1] or y + h >= img.shape[0]:
            continue
        if best is None or area > stats[best][4]:
            best = i
    if best is None:
        raise SystemExit("no screen found; is the whole panel in view?")
    contours, _ = cv2.findContours((labels == best).astype(np.uint8), cv2.RETR_EXTERNAL,
                                   cv2.CHAIN_APPROX_NONE)
    hull = cv2.convexHull(max(contours, key=cv2.contourArea))
    for eps in np.linspace(0.005, 0.05, 40):
        quad = cv2.approxPolyDP(hull, eps * cv2.arcLength(hull, True), True)
        if len(quad) == 4:
            return order(quad[:, 0].astype(np.float32))
    raise SystemExit("could not fit four corners to the screen")


def sample(grey: np.ndarray, p: np.ndarray) -> float:
    """The grey level at a sub-pixel point (bilinear)."""
    x, y = float(p[0]), float(p[1])
    x0, y0 = int(np.floor(x)), int(np.floor(y))
    fx, fy = x - x0, y - y0
    a = grey[y0, x0] * (1 - fx) + grey[y0, x0 + 1] * fx
    b = grey[y0 + 1, x0] * (1 - fx) + grey[y0 + 1, x0 + 1] * fx
    return a * (1 - fy) + b * fy


def refine(img: np.ndarray, quad: np.ndarray, reach: int = 30) -> np.ndarray:
    """
    Each side moved onto the panel's own edge: along 40 short profiles across the side, the first
    place (coming from the bezel) where the grey rises halfway to the panel's level, with a straight
    line fitted through them; the corners are where the lines meet.
    """
    grey = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 1.5)
    centre = quad.mean(axis=0)
    lines = []
    for i in range(4):
        a, b = quad[i], quad[(i + 1) % 4]
        d = b - a
        t = d / np.linalg.norm(d)
        n = np.array([t[1], -t[0]], np.float32)
        if np.dot(centre - (a + b) / 2, n) < 0:
            n = -n
        points = []
        offsets = np.arange(-reach, reach + 1, 0.5)
        for s in np.linspace(0.08, 0.92, 40):
            p = a + d * s
            profile = np.array([sample(grey, p + n * o) for o in offsets])
            outside = np.median(profile[offsets < -reach * 0.6])
            inside = np.median(profile[offsets > reach * 0.6])
            if inside - outside < 2:
                continue
            half = (outside + inside) / 2
            for k in range(1, len(profile)):
                if profile[k - 1] < half <= profile[k]:
                    f = (half - profile[k - 1]) / (profile[k] - profile[k - 1])
                    points.append(p + n * (offsets[k - 1] + f * 0.5))
                    break
        if len(points) < 10:
            raise SystemExit(f"side {i}: the edge was not found; give a closer --guess")
        vx, vy, x0, y0 = cv2.fitLine(np.array(points, np.float32), cv2.DIST_HUBER, 0, 0.01, 0.01)[:, 0]
        lines.append((np.array([x0, y0]), np.array([vx, vy])))
    corners = []
    for i in range(4):
        (p1, d1), (p2, d2) = lines[i - 1], lines[i]
        # p1 + u d1 = p2 + v d2
        u, _ = np.linalg.solve(np.array([d1, -d2]).T, p2 - p1)
        corners.append(p1 + u * d1)
    return np.array(corners, np.float32)


def lit_edges(img: np.ndarray, quad: np.ndarray, reach: float = 50) -> tuple[np.ndarray, list]:
    """
    The screen's corners from a page lit edge to edge (the tempo page): along 60 profiles across
    each side of a rough outline, the first rise (from the bezel inward) to halfway between the
    bezel and a narrow band just inside the edge (so the page's own drawing stays out of it); a
    line through them, refitted without points more than 1.5 px off; the corners where the lines
    meet. Returns the corners and each side's (points kept, rms).
    """
    grey = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 1.2)
    centre = quad.mean(axis=0)
    lines, stats = [], []
    offsets = np.arange(-reach, reach + 1, 0.5)
    for i in range(4):
        a, b = quad[i], quad[(i + 1) % 4]
        d = b - a
        t = d / np.linalg.norm(d)
        n = np.array([t[1], -t[0]], np.float32)
        if np.dot(centre - (a + b) / 2, n) < 0:
            n = -n
        points = []
        for s in np.linspace(0.1, 0.9, 60):
            p = a + d * s
            profile = np.array([sample(grey, p + n * o) for o in offsets])
            outside = np.median(profile[offsets < -reach * 0.7])
            # the lit level just inside wherever the edge is: the brightest stretch of 12 px
            run = np.convolve(profile, np.ones(24) / 24, mode="valid")
            lit = run.max()
            if lit - outside < 40:
                continue
            half = (outside + lit) / 2
            # walk outward from that stretch to the first drop below half: the key tops and other
            # light things beyond the bezel never come into it
            k = int(np.argmax(run))
            while k > 0 and profile[k - 1] >= half:
                k -= 1
            if k == 0:
                continue
            f = (half - profile[k - 1]) / (profile[k] - profile[k - 1])
            points.append(p + n * (offsets[k - 1] + f * 0.5))
        pts = np.array(points, np.float32)
        if len(pts) < 20:
            raise SystemExit(f"side {i}: the lit edge was not found; is a lit page (tempo) showing?")
        for _ in range(3):
            vx, vy, x0, y0 = cv2.fitLine(pts, cv2.DIST_HUBER, 0, 0.01, 0.01)[:, 0]
            res = np.abs((pts[:, 0] - x0) * vy - (pts[:, 1] - y0) * vx)
            keep = res <= max(1.5, 2.5 * np.median(res))
            if keep.all():
                break
            pts = pts[keep]
        stats.append((len(pts), float(np.sqrt((res[keep] ** 2).mean()))))
        lines.append((np.array([x0, y0]), np.array([vx, vy])))
    corners = []
    for i in range(4):
        (p1, d1), (p2, d2) = lines[i - 1], lines[i]
        u, _ = np.linalg.solve(np.array([d1, -d2]).T, p2 - p1)
        corners.append(p1 + u * d1)
    return np.array(corners, np.float32), stats


def calib_lit(save: bool) -> None:
    """Refits the corners on a lit page (see lit_edges), starting from the saved calibration;
    with `save`, stores them (keeping the saved black and white levels) and the frame as the
    reference for later drift checks; otherwise only reports how far the screen has moved."""
    img = frame()
    old = load_calib()
    rough = np.array(old["corners"], np.float32)
    corners, stats = lit_edges(img, rough)
    for i, (count, rms) in enumerate(stats):
        print(f"side {i}: {count} edge points, rms {rms:.2f} px")
    shift = corners - rough
    print("moved (camera px):", " ".join(f"({dx:+.1f},{dy:+.1f})" for dx, dy in shift))
    if not save:
        return
    data = {**old, "corners": corners.tolist(), "method": "lit", "at": time.strftime("%Y-%m-%d %H:%M:%S")}
    CALIB.write_text(json.dumps(data, indent=1))
    cv2.imwrite(str(CAM / "calib-raw.jpg"), img)
    check = img.copy()
    cv2.polylines(check, [corners.astype(np.int32)], True, (0, 0, 255), 1)
    cv2.imwrite(str(CAM / "calib-check.png"), check)
    screen = rectify(img, data)
    cv2.imwrite(str(CAM / "calib-screen.png"), screen)
    lit = cv2.cvtColor(screen, cv2.COLOR_BGR2GRAY) > 90
    rows, cols = np.nonzero(lit[:, 480])[0], np.nonzero(lit[222])[0]
    print(f"lit area in the new frame: x {cols.min()}..{cols.max()}, y {rows.min()}..{rows.max()} "
          f"(0..{W - 1}, 0..{H - 1} when exact)")


def load_calib() -> dict:
    if not CALIB.exists():
        raise SystemExit("run calib first")
    return json.loads(CALIB.read_text())


def rectify(img: np.ndarray, calib: dict, scale: int = 2) -> np.ndarray:
    """The screen on its own grid (`scale` capture pixels per panel pixel), the display's black
    and white stretched to 0 and 255."""
    corners = np.array(calib["corners"], np.float32)
    w, h = 480 * scale, 222 * scale
    target = np.array([[0, 0], [w, 0], [w, h], [0, h]], np.float32)
    warped = cv2.warpPerspective(img.astype(np.float32), cv2.getPerspectiveTransform(corners, target),
                                 (w, h), flags=cv2.INTER_AREA if scale <= 2 else cv2.INTER_CUBIC)
    lo = np.array(calib["black"], np.float32)
    hi = np.array(calib["white"], np.float32)
    out = (warped - lo) / np.maximum(hi - lo, 1) * 255
    return np.clip(out, 0, 255).astype(np.uint8)


def fresh(count: int = 1, timeout: float = 3.0) -> list[np.ndarray]:
    """The next `count` frames the camera writes (each one new, not a re-read of the last)."""
    frames, seen = [], LIVE.stat().st_mtime_ns if LIVE.exists() else None
    end = time.time() + timeout
    while len(frames) < count and time.time() < end:
        now = LIVE.stat().st_mtime_ns
        if now != seen:
            img = cv2.imread(str(LIVE))
            if img is not None:
                frames.append(img)
                seen = now
                continue
        time.sleep(0.015)
    if not frames:
        raise SystemExit(f"no new frames in {LIVE}: is camera.command running?")
    return frames


def changed_pixels(a: np.ndarray, b: np.ndarray) -> int:
    """How many pixels of two rectified screens differ by more than 40 levels (camera noise on a
    still screen stays under 5)."""
    ga = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY).astype(np.int16)
    gb = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY).astype(np.int16)
    return int((np.abs(ga - gb) > 40).sum())


def settle(before: np.ndarray, calib: dict, least: float = 0.5, most: float = 1.8) -> dict:
    """Waits for the screen to show a change against `before` and hold still across two new
    frames (or, when nothing visible changes, `most` seconds): the camera runs half a second or
    more behind. Returns what it saw."""
    t0 = time.time()
    last, moved = None, False
    while True:
        (img,) = fresh(1)
        screen = rectify(img, calib)
        t = time.time() - t0
        moved = moved or changed_pixels(screen, before) > 30
        still = last is not None and changed_pixels(screen, last) <= 5
        if t >= least and still and (moved or t >= most):
            return {"latency": round(t, 2), "changed": moved}
        if t > most + 2.5:
            return {"latency": round(t, 2), "changed": moved, "unsettled": True}
        last = screen


def calib(guess: str | None) -> None:
    img = frame()
    rough = (
        np.array([float(v) for v in guess.split(",")], np.float32).reshape(4, 2)
        if guess
        else find_screen(img)
    )
    corners = refine(img, rough)
    target = np.array([[0, 0], [W, 0], [W, H], [0, H]], np.float32)
    warped = cv2.warpPerspective(img, cv2.getPerspectiveTransform(corners, target), (W, H))
    # white balance from the page itself: its darkest and brightest tenth of a percent
    flat = warped.reshape(-1, 3).astype(np.float32)
    lum = flat.mean(axis=1)
    black = flat[lum <= np.percentile(lum, 5)].mean(axis=0)
    white = flat[lum >= np.percentile(lum, 99.9)].mean(axis=0)
    data = {"corners": corners.tolist(), "black": black.tolist(), "white": white.tolist(),
            "size": [W, H], "at": time.strftime("%Y-%m-%d %H:%M:%S")}
    CALIB.write_text(json.dumps(data, indent=1))
    check = img.copy()
    cv2.polylines(check, [corners.astype(np.int32)], True, (0, 0, 255), 2)
    cv2.imwrite(str(CAM / "calib-check.png"), check)
    cv2.imwrite(str(CAM / "calib-screen.png"), rectify(img, data))
    print(json.dumps(data))


def snap(name: str) -> None:
    SCREENS.mkdir(parents=True, exist_ok=True)
    img = frame()
    cv2.imwrite(str(SCREENS / f"{name}-raw.jpg"), img)
    cv2.imwrite(str(SCREENS / f"{name}.png"), rectify(img, load_calib()))
    print(SCREENS / f"{name}.png")


def watch(prefix: str, hold: float, every: float | None = None) -> None:
    """Saves each new screen once it has held still for `hold` seconds. A change is 20 or more
    pixels moving by over 40 levels (a digit ticking over is enough; camera noise stays under 5).
    Each save averages the still frames and keeps one raw camera frame for re-rectifying. With
    `every`, a screen that keeps moving (playback, a running arpeggio) is also saved that often."""
    SCREENS.mkdir(parents=True, exist_ok=True)
    data = load_calib()
    log_path = SCREENS / f"{prefix}.json"
    log = json.loads(log_path.read_text()) if log_path.exists() else []
    saved, saved_at = None, 0.0
    still, since = [], 0.0
    n = len(log)
    print(f"watching -> {SCREENS}/{prefix}-NNN.png (stop with ctrl-c)", flush=True)
    while True:
        (raw,) = fresh(1)
        screen = rectify(raw, data)
        if not still or changed_pixels(screen, still[-1][1]) > 5:
            still, since = [(raw, screen)], time.time()
            if every and time.time() - saved_at >= every and (
                    saved is None or changed_pixels(screen, saved) >= 20):
                n += 1
                name = f"{prefix}-{n:03d}"
                cv2.imwrite(str(SCREENS / f"{name}.png"), screen)
                cv2.imwrite(str(SCREENS / f"{name}-raw.jpg"), raw)
                log.append({"file": f"{name}.png", "time": time.strftime("%H:%M:%S"), "moving": True})
                log_path.write_text(json.dumps(log, indent=1))
                saved, saved_at = screen, time.time()
                print(f"{name}.png {log[-1]['time']} (moving)", flush=True)
            continue
        still = (still + [(raw, screen)])[-5:]
        if time.time() - since >= hold and (saved is None or changed_pixels(screen, saved) >= 20):
            n += 1
            name = f"{prefix}-{n:03d}"
            mean = np.mean([r.astype(np.float32) for r, _ in still], axis=0)
            cv2.imwrite(str(SCREENS / f"{name}.png"), rectify(mean, data))
            cv2.imwrite(str(SCREENS / f"{name}-raw.jpg"), raw)
            log.append({"file": f"{name}.png", "time": time.strftime("%H:%M:%S")})
            log_path.write_text(json.dumps(log, indent=1))
            saved, saved_at = screen, time.time()
            print(f"{name}.png {log[-1]['time']}", flush=True)


ALIGNED = HERE / "captures" / "aligned"


def body_mask(shape: tuple, corners: np.ndarray) -> np.ndarray:
    """The device around the screen (a wide band outside it): what drift is measured on. The screen
    itself changes from frame to frame, so it is masked, generously, in case it moved."""
    mask = np.zeros(shape, np.uint8)
    x0, y0 = int(corners[:, 0].min()) - 300, int(corners[:, 1].min()) - 250
    x1, y1 = int(corners[:, 0].max()) + 300, int(corners[:, 1].max()) + 300
    mask[max(y0, 0):y1, max(x0, 0):x1] = 1
    cv2.fillPoly(mask, [corners.astype(np.int32)], 0)
    return cv2.erode(mask, np.ones((121, 121), np.uint8))


def drift(ref: np.ndarray, img: np.ndarray, mask: np.ndarray) -> tuple[np.ndarray, float]:
    """The 2 × 3 warp taking reference-frame points to this frame's (rotation + translation), from
    phase correlation at quarter scale (catches large moves) refined by ECC at half scale; and the
    ECC correlation (1 is perfect)."""

    def masked(g: np.ndarray) -> np.ndarray:
        return np.where(mask > 0, g, g[mask > 0].mean()).astype(np.float32)

    small = lambda g: cv2.resize(g, (g.shape[1] // 4, g.shape[0] // 4), interpolation=cv2.INTER_AREA)
    a, b = small(masked(ref)), small(masked(img))
    (dx, dy), _ = cv2.phaseCorrelate(a, b, cv2.createHanningWindow(a.shape[::-1], cv2.CV_32F))
    half = lambda g: cv2.GaussianBlur(cv2.resize(g, (g.shape[1] // 2, g.shape[0] // 2),
                                                 interpolation=cv2.INTER_AREA), (0, 0), 1.5)
    warp = np.array([[1, 0, dx * 2], [0, 1, dy * 2]], np.float32)
    mask_half = cv2.resize(mask, (mask.shape[1] // 2, mask.shape[0] // 2), interpolation=cv2.INTER_NEAREST)
    try:
        cc, warp = cv2.findTransformECC(half(ref.astype(np.float32)), half(img.astype(np.float32)), warp,
                                        cv2.MOTION_EUCLIDEAN,
                                        (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 80, 1e-5),
                                        mask_half, 5)
    except cv2.error:
        cc = 0.0
    warp[:, 2] *= 2
    return warp, float(cc)


def _realign_one(job: tuple) -> dict:
    raw_path, calib_data, ref_path = job
    ref = cv2.cvtColor(cv2.imread(str(ref_path)), cv2.COLOR_BGR2GRAY)
    corners = np.array(calib_data["corners"], np.float32)
    mask = body_mask(ref.shape, corners)
    img = cv2.imread(str(raw_path))
    if img is None:
        return {"raw": raw_path.name, "error": "unreadable"}
    warp, cc = drift(ref, cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), mask)
    moved = np.hstack([corners, np.ones((4, 1), np.float32)]) @ warp.T
    data = {**calib_data, "corners": moved.tolist()}
    name = raw_path.name.replace("-raw.jpg", "")
    cv2.imwrite(str(ALIGNED / f"{name}.png"), rectify(img, data))
    return {"name": name, "dx": round(float(warp[0, 2]), 2), "dy": round(float(warp[1, 2]), 2),
            "rot": round(float(np.degrees(np.arctan2(warp[1, 0], warp[0, 0]))), 3), "ecc": round(cc, 3)}


def realign(pattern: str) -> None:
    """Re-rectifies every capture that kept its raw frame (captures/screens/*-raw.jpg matching
    `pattern`) with its own drift from the calibration frame, into captures/aligned/NAME.png, with
    each frame's drift in aligned/index.json."""
    from multiprocessing import Pool

    ALIGNED.mkdir(parents=True, exist_ok=True)
    data = load_calib()
    ref = CAM / "calib-raw.jpg"
    if not ref.exists():
        raise SystemExit("no calib-raw.jpg: run calib --lit first")
    raws = sorted(SCREENS.glob(f"{pattern}-raw.jpg"))
    index_path = ALIGNED / "index.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else {}
    with Pool() as pool:
        for i, row in enumerate(pool.imap_unordered(_realign_one, [(r, data, ref) for r in raws], 8)):
            if "name" in row:
                index[row.pop("name")] = row
            if i % 200 == 0:
                print(f"{i}/{len(raws)}", flush=True)
                index_path.write_text(json.dumps(index, indent=0, sort_keys=True))
    index_path.write_text(json.dumps(index, indent=0, sort_keys=True))
    weak = {k: v for k, v in index.items() if v["ecc"] < 0.6}
    print(f"{len(raws)} frames realigned into {ALIGNED}; {len(weak)} with a weak match (ecc < 0.6)")


def record(prefix: str) -> None:
    """Every camera frame (ten a second), rectified, as JPEG into captures/screens/PREFIX/, with
    the time of each in PREFIX/frames.json: for animations. Runs until stopped."""
    out = SCREENS / prefix
    out.mkdir(parents=True, exist_ok=True)
    data = load_calib()
    log, n = [], 0
    print(f"recording -> {out}/NNNNN.jpg (stop with ctrl-c)", flush=True)
    try:
        while True:
            (raw,) = fresh(1)
            n += 1
            cv2.imwrite(str(out / f"{n:05d}.jpg"), rectify(raw, data), [cv2.IMWRITE_JPEG_QUALITY, 92])
            log.append({"n": n, "t": round(time.time(), 3)})
            if n % 50 == 0:
                (out / "frames.json").write_text(json.dumps(log))
    finally:
        (out / "frames.json").write_text(json.dumps(log))


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        raise SystemExit(__doc__)
    if args[0] == "calib" and "--lit" in args:
        calib_lit(save=True)
    elif args[0] == "check":
        calib_lit(save=False)
    elif args[0] == "calib":
        calib(args[args.index("--guess") + 1] if "--guess" in args else None)
    elif args[0] == "snap" and len(args) > 1:
        snap(args[1])
    elif args[0] == "realign":
        realign(args[1] if len(args) > 1 else "*")
    elif args[0] == "record" and len(args) > 1:
        record(args[1])
    elif args[0] == "watch" and len(args) > 1:
        hold = float(args[args.index("--min") + 1]) if "--min" in args else 0.3
        every = float(args[args.index("--every") + 1]) if "--every" in args else None
        watch(args[1], hold, every)
    else:
        raise SystemExit(__doc__)
