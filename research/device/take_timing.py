"""Where each message of a preset_capture.py take landed in its recording, to a millisecond or two.

The recorder's stamps (`frame`) count the audio delivered when a message was sent, and PortAudio
delivers the OP-XY's input in blocks of 4096 frames, so they run up to 93 ms early. The send times
(`t`, perf_counter) are exact and keep pace with the audio clock (44100.5-44101.1 frames a second
over two minutes), so a message sent at t sits at 44100 t + c, c the stamps' latest lead (the
moment a block had just come in), plus the unit's own latency, which is steady (12-15 ms from note
on to sound, measured on notes that start from silence with a sharp attack).
"""

import numpy as np

RATE = 44100


def placed(take: dict, audio: np.ndarray | None = None, rate: int = RATE) -> tuple[list[dict], float]:
    """The take's stamps with `at` (recording frame, float) added, and the latency used (frames).
    Without audio the latency is taken as 13 ms."""
    stamps = take["stamps"]
    c = max(s["frame"] - rate * s["t"] for s in stamps)
    latency = 0.013 * rate
    if audio is not None:
        latency = measured_latency(stamps, audio, c, rate) or latency
    out = [{**s, "at": rate * s["t"] + c + latency} for s in stamps]
    return out, latency


def measured_latency(stamps: list[dict], audio: np.ndarray, c: float, rate: int) -> float | None:
    """The median lag from note on to sound over notes that start from silence, sharp ones only."""
    x = np.abs(audio.mean(axis=1) if audio.ndim > 1 else audio)
    env = np.convolve(x, np.ones(44) / 44, "same")
    lags = []
    for s in stamps:
        if s["bytes"][0] & 0xF0 != 0x90:
            continue
        f = int(round(rate * s["t"] + c))
        pre, post = env[max(0, f - rate // 20) : f], env[f : f + rate // 5]
        if len(post) < rate // 5 or len(pre) == 0 or pre.max() > 1e-3:
            continue
        i = int(np.argmax(post > max(post.max() * 0.05, 10 ** (-55 / 20))))
        if i < 0.04 * rate:
            lags.append(i)
    return float(np.median(lags)) if lags else None


def note_ons(stamps: list[dict], channel: int) -> list[dict]:
    return [s for s in stamps if s["bytes"][0] == 0x90 | (channel - 1)]
