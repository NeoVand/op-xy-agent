#!/usr/bin/env python3
"""Regenerate the .xy test fixtures of src/lib/xy/ with kmorrill/xy-format (MIT), the Python library
our TypeScript port follows. It is the oracle: the TS reader must read what it reads, and the TS
writer must write what it writes.

Needs the upstream clone at research/repos/kmorrill_xy-format (scripts/fetch-research.sh), pinned at
commit 7a74acc (docs/research/10-xy-format.md). No dependencies beyond the standard library:

    uv run --quiet python scripts/xy-fixtures.py            # write src/lib/xy/fixtures/
    uv run --quiet python scripts/xy-fixtures.py --check    # exit 1 if anything would change

What it writes (see src/lib/xy/fixtures/README.md):

- the .xy fixtures: the blank template, four of upstream's device-tested image probes, and two
  projects the library writes from our op lists (`song.xy`, `locks.xy`);
- expected.json: every fixture's fields as the library reads them;
- goldens.json: op lists the TS writer replays on the blank template, with the size and SHA-256 of
  what the library writes for each, and the device capture it equals where upstream proved one.

One deliberate difference from the library: it writes the p-lock union mask as 0x01 whatever the
column, where device files hold the OR of the step masks (docs/research/10-xy-format.md A.2). The
generator recomputes the union after every op list, so the goldens hold what the device would.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = ROOT / "research/repos/kmorrill_xy-format"
OUT = ROOT / "src/lib/xy/fixtures"
BASE = UPSTREAM / "src/one-off-changes-from-default/unnamed 1.xy"

if not (UPSTREAM / "xy/image_writer.py").exists():
    sys.exit(f"missing {UPSTREAM}: run scripts/fetch-research.sh first")
sys.path.insert(0, str(UPSTREAM))

from xy.bar_menu_inspection import (  # noqa: E402
    TRACK_DEFAULT_STEP_LENGTH_OFFSET,
    TRACK_GROOVE_OFFSET,
    TRACK_PATTERN_STEPS_OFFSET,
    TRACK_PLOCK_SHAPE_OFFSET,
    TRACK_QUANTIZATION_OFFSET,
)
from xy.image_writer import (  # noqa: E402
    OFF_NOTE_COUNT,
    OFF_PRISTINE,
    SCENE_SLOT0,
    SCENE_SLOT_SIZE,
    ImageProject,
    build_arrangement,
    pattern_starts_from_image,
    track_base_from_header,
)
from xy.project_config_inspection import read_project_config  # noqa: E402
from xy.rle import decode_project  # noqa: E402

# p-lock column -> the library's parameter name (ImageProject.PLOCK_PARAMS maps name -> 2 * column)
LOCK_NAMES = {offset // 2: name for name, offset in ImageProject.PLOCK_PARAMS.items()}
# step component bit -> the library's name
COMPONENT_NAMES = {bit: name for name, bit in ImageProject.STEP_COMPONENTS.items()}

# ─── op lists ───────────────────────────────────────────────────────────────────────────────────
# Tracks, patterns and steps are 1-based, as the library's calls take them. The TS side replays the
# same lists on its model (src/lib/xy/goldens.spec.ts).

SONG_OPS = [
    {
        "op": "arrangement",
        "patterns": {
            "1": [
                [
                    {"step": 1, "note": 53, "velocity": 110},
                    {"step": 5, "note": 55},
                    {"step": 9, "note": 53, "velocity": 110},
                    {"step": 13, "note": 55},
                ],
                [
                    {"step": 1, "note": 53, "velocity": 120},
                    {"step": 3, "note": 61, "velocity": 70},
                    {"step": 5, "note": 55},
                    {"step": 7, "note": 61, "velocity": 70},
                    {"step": 9, "note": 53, "velocity": 120},
                    {"step": 11, "note": 61, "velocity": 70},
                    {"step": 13, "note": 55},
                    {"step": 15, "note": 61, "velocity": 70},
                ],
            ],
            "3": [
                [
                    {"step": 1, "note": 36, "gate_ticks": 960},
                    {"step": 9, "note": 43, "velocity": 90, "gate_ticks": 960, "tick_offset": 30},
                ],
                {
                    "steps": 32,
                    "notes": [
                        {"step": 1, "note": 41, "gate_ticks": 1920},
                        {"step": 17, "note": 43, "gate_ticks": 1920},
                    ],
                },
            ],
            "7": [
                [
                    {"step": 1, "note": 60, "velocity": 60, "gate_ticks": 7680},
                    {"step": 1, "note": 64, "velocity": 60, "gate_ticks": 7680},
                    {"step": 1, "note": 67, "velocity": 60, "gate_ticks": 7680},
                ]
            ],
            "9": [[{"step": 1, "note": 62, "gate_ticks": 7680}]],
        },
        "scenes": [{"1": 0, "3": 0, "7": 0}, {"1": 1, "3": 1, "7": 0}, {"1": 1, "3": 0, "7": 0}],
        "mutes": [[], [7], [3]],
        "song": [0, 1, 0, 2],
    },
    {"op": "tempo", "bpm": 128.5},
    {"op": "groove", "type": 8},
    {"op": "grooveAmount", "amount": 20},
    {"op": "click", "volume": 224},
    {"op": "transpose", "semitones": -3},
    {"op": "sceneLength", "mode": 1},
    {"op": "midiChannel", "track": 3, "channel": 3},
    {"op": "midiChannel", "track": 16, "channel": 10},
    {"op": "voices", "track": 3, "voices": 2},
    {"op": "song", "song": 2, "scenes": [2, 1], "loop": False},
    {"op": "activeSong", "song": 2},
    {"op": "component", "track": 1, "pattern": 2, "step": 3, "kind": "pulse", "value": 2},
    {"op": "component", "track": 1, "pattern": 2, "step": 7, "kind": "skip step component", "value": 3},
    {"op": "component", "track": 1, "pattern": 2, "step": 8, "kind": "pulse hold", "value": 5},
    {"op": "component", "track": 1, "pattern": 2, "step": 8, "kind": "jump", "value": 1},
    {"op": "component", "track": 3, "pattern": 1, "step": 1, "kind": "ramp up", "value": 8},
    {"op": "lock", "track": 3, "pattern": 1, "step": 1, "column": 1, "value": 0x2000},
    {"op": "lock", "track": 3, "pattern": 1, "step": 9, "column": 1, "value": 0x6000},
]

LOCK_OPS = [
    {
        "op": "arrangement",
        "patterns": {
            "2": [[{"step": 1, "note": 53}, {"step": 5, "note": 55}]],
            "4": [[{"step": 1, "note": 60}], [{"step": 1, "note": 64}]],
        },
    },
    {"op": "lock", "track": 2, "pattern": 1, "step": 1, "column": 0, "value": 0x7FFF},
    {"op": "lock", "track": 2, "pattern": 1, "step": 2, "column": 41, "value": 0},
    {"op": "lock", "track": 2, "pattern": 1, "step": 5, "column": 17, "value": 20000},
    {"op": "lock", "track": 2, "pattern": 1, "step": 6, "column": 36, "value": 0x1234},
    {"op": "lock", "track": 4, "pattern": 2, "step": 16, "column": 3, "value": 0x4000},
    {"op": "lock", "track": 4, "pattern": 2, "step": 12, "column": 22, "value": 0x0100},
]


def u35_ops() -> list[dict]:
    """Param 1 automated over T3's 16 steps with the values of device capture unnamed 35."""
    _, cap = decode_project((UPSTREAM / "src/one-off-changes-from-default/unnamed 35.xy").read_bytes())
    t3 = 0xD79 + 2 * 17876
    ops = []
    for k in range(16):
        cell = t3 + 0x2A0 + k * 84 + 2
        value = int.from_bytes(cap[cell : cell + 2], "little")
        ops.append({"op": "lock", "track": 3, "pattern": 1, "step": k + 1, "column": 1, "value": value})
    return ops


def one_offs(name: str) -> str:
    return f"src/one-off-changes-from-default/{name}"


GOLDENS: list[tuple[str, list[dict], str | None]] = [
    ("note on step 1", [{"op": "note", "track": 1, "step": 1, "note": 60}], one_offs("unnamed 2.xy")),
    ("note on step 9", [{"op": "note", "track": 1, "step": 9, "note": 60}], one_offs("unnamed 81.xy")),
    ("note on step 5", [{"op": "note", "track": 1, "step": 5, "note": 60}], "output/image-probes/01_a_img_c4_step5.xy"),
    (
        "note equal to its velocity",
        [{"op": "note", "track": 1, "step": 1, "note": 60, "velocity": 60}],
        "output/image-probes/02_b_img_notevel_60_60.xy",
    ),
    (
        "three notes with gates",
        [
            {"op": "note", "track": 3, "step": 1, "note": 48, "gate": 960},
            {"op": "note", "track": 3, "step": 5, "note": 50, "gate": 1920},
            {"op": "note", "track": 3, "step": 11, "note": 53, "gate": 2880},
        ],
        one_offs("unnamed 92.xy"),
    ),
    (
        "pickup and micro-timed notes on an aux track",
        [
            {"op": "note", "track": 9, "tick": -129, "note": 60, "velocity": 91, "gate": 123},
            {"op": "note", "track": 9, "tick": 490, "note": 124, "velocity": 1, "gate": 7680},
        ],
        None,
    ),
    ("four bars", [{"op": "steps", "track": 1, "steps": 64}], one_offs("unnamed 19.xy")),
    ("a partial last bar", [{"op": "steps", "track": 2, "steps": 24}], None),
    ("tempo 121.2", [{"op": "tempo", "bpm": 121.2}], one_offs("unnamed 5.xy")),
    ("groove disfunk", [{"op": "groove", "type": 8}], one_offs("unnamed 11.xy")),
    ("metronome off", [{"op": "click", "volume": 0}], one_offs("unnamed 10.xy")),
    (
        "midi channels",
        [{"op": "midiChannel", "track": 1, "channel": 1}, {"op": "midiChannel", "track": 16, "channel": 16}],
        one_offs("unnamed 41.xy"),
    ),
    ("track scale 2", [{"op": "scale", "track": 1, "raw": 0x05}], one_offs("unnamed 20.xy")),
    ("track scale 16", [{"op": "scale", "track": 1, "raw": 0x0E}], one_offs("unnamed 21.xy")),
    ("track scale 1/2", [{"op": "scale", "track": 1, "raw": 0x01}], one_offs("unnamed 22.xy")),
    (
        "pulse on step 1",
        [{"op": "component", "track": 1, "pattern": 1, "step": 1, "kind": "pulse", "value": 1}],
        one_offs("unnamed 8.xy"),
    ),
    (
        "pulse on step 9",
        [{"op": "component", "track": 1, "pattern": 1, "step": 9, "kind": "pulse", "value": 1}],
        one_offs("unnamed 59.xy"),
    ),
    (
        "three blank patterns on T2",
        [{"op": "arrangement", "patterns": {"2": [[], [], []]}}],
        one_offs("j05_t2_p3_blank.xy"),
    ),
    (
        "nine blank patterns on T1-T8",
        [{"op": "arrangement", "patterns": {str(t): [[]] * 9 for t in range(1, 9)}}],
        one_offs("j06_all16_p9_blank.xy"),
    ),
    (
        "sixteen patterns and a scene on the last",
        [
            {
                "op": "arrangement",
                "patterns": {"1": [[{"step": p, "note": 40 + p}] for p in range(1, 17)]},
                "scenes": [{"1": 15}],
                "song": [0],
            }
        ],
        None,
    ),
    (
        "project settings",
        [
            {"op": "transpose", "semitones": -5},
            {"op": "timeSignature", "raw": 0x13},
            {"op": "sceneLength", "mode": 2},
            {"op": "voices", "track": 2, "voices": 4},
            {"op": "grooveAmount", "amount": -4},
            {"op": "click", "volume": 255},
            {"op": "midiChannel", "track": 9, "channel": 1},
            {"op": "activeSong", "song": 5},
        ],
        None,
    ),
    (
        "bar menu",
        [
            {"op": "quantize", "track": 1, "raw": 129},
            {"op": "trackGroove", "track": 1, "raw": 0xFA},
            {"op": "noteLength", "track": 1, "ticks": 480},
            {"op": "smoothing", "track": 1, "raw": 0xFB},
            {"op": "smoothing", "track": 5, "raw": 0x08},
        ],
        None,
    ),
    ("param 1 automation (unnamed 35's values)", u35_ops(), None),
    (
        "songs",
        [
            {"op": "song", "song": 1, "scenes": [0, 0, 0], "loop": True},
            {"op": "song", "song": 3, "scenes": [], "loop": False},
            {"op": "song", "song": 14, "scenes": list(range(96)), "loop": True},
        ],
        None,
    ),
]

# ─── the op interpreter (library calls) ─────────────────────────────────────────────────────────


def _pattern_list(patterns: dict[str, list]) -> dict[int, list]:
    return {int(track): list(pats) for track, pats in patterns.items()}


def build(ops: list[dict]) -> bytes:
    """Run an op list through the library, then set the union masks the device would hold."""
    rest = ops
    if ops and ops[0]["op"] == "arrangement":
        first = ops[0]
        scenes = first.get("scenes")
        data = build_arrangement(
            str(BASE),
            _pattern_list(first["patterns"]),
            scenes=[{int(t): p for t, p in row.items()} for row in scenes] if scenes else None,
            scene_mutes=first.get("mutes"),
            song_chain=first.get("song"),
            song_loop=first.get("loop", True),
        )
        project = ImageProject.from_bytes(data)
        rest = ops[1:]
    else:
        project = ImageProject.from_file(str(BASE))
    for op in rest:
        apply(project, op)
    fix_unions(project)
    return project.to_bytes()


def apply(p: ImageProject, op: dict) -> None:
    kind = op["op"]
    if kind == "tempo":
        p.set_tempo(op["bpm"])
    elif kind == "groove":
        p.set_groove(op["type"])
    elif kind == "grooveAmount":
        p.set_groove_amount(op["amount"])
    elif kind == "click":
        p.set_click_volume(op["volume"])
    elif kind == "transpose":
        p.set_project_transpose(op["semitones"])
    elif kind == "timeSignature":
        p.set_time_signature(op["raw"])
    elif kind == "sceneLength":
        p.set_scene_length_mode(op["mode"])
    elif kind == "voices":
        p.set_voice_allocation(op["track"], op["voices"])
    elif kind == "midiChannel":
        p.set_midi_channel(op["track"], op["channel"])
    elif kind == "activeSong":
        p.set_active_song(op["song"])
    elif kind == "song":
        p.set_song_chain(op["song"], op["scenes"], loop=op["loop"])
    elif kind == "steps":
        p.set_pattern_steps(op["track"], op["steps"])
    elif kind == "scale":
        # the library reads 0.5 / 1 / 2 / 16 as scales and anything else as a raw byte
        scales = {raw: scale for scale, raw in p.SCALE_BYTES.items()}
        if op["raw"] not in scales and op["raw"] in p.SCALE_BYTES:
            raise ValueError(f"raw scale {op['raw']} would be read as a scale")
        p.set_track_scale(op["track"], scales.get(op["raw"], op["raw"]))
    elif kind == "quantize":
        p.set_track_quantization_raw(op["track"], op["raw"])
    elif kind == "trackGroove":
        p.set_track_groove_raw(op["track"], op["raw"])
    elif kind == "noteLength":
        p.set_default_step_length_ticks(op["track"], op["ticks"])
    elif kind == "smoothing":
        p.set_plock_shape_raw(op["track"], op["raw"])
    elif kind == "note":
        p.add_note(
            op["track"],
            step=op.get("step"),
            tick=op.get("tick"),
            note=op["note"],
            velocity=op.get("velocity", 100),
            gate=op.get("gate", 240),
        )
    elif kind == "component":
        bit = ["pulse", "pulse hold", "multiply", "velocity", "ramp up", "ramp down", "random",
               "portamento", "bend", "tonality", "jump", "skip parameter lock",
               "skip step component", "skip trigger"].index(op["kind"])
        p.set_step_component(op["track"], op["step"], COMPONENT_NAMES[bit], op["value"], pattern=op["pattern"])
    elif kind == "lock":
        p.set_plock(op["track"], op["step"], LOCK_NAMES[op["column"]], op["value"], pattern=op["pattern"])
    else:
        raise ValueError(f"unknown op {kind}")


def fix_unions(p: ImageProject) -> None:
    """The device's union mask at +0x304E: the OR of the 64 step lane masks."""
    for base in pattern_starts_from_image(p.image, track_base_from_header(p.header)):
        union = 0
        for step in range(64):
            at = base + p.PLOCK_STEP_MASK + 8 * step
            union |= int.from_bytes(p.image[at : at + 8], "little")
        p.image[base + p.PLOCK_MASTER : base + p.PLOCK_MASTER + 8] = union.to_bytes(8, "little")


# ─── reading (the fields the TS reader must agree on) ───────────────────────────────────────────


def s8(value: int) -> int:
    return value - 0x100 if value >= 0x80 else value


def read_fields(data: bytes) -> dict:
    p = ImageProject.from_bytes(data)
    img = p.image
    config = read_project_config(p)
    starts = pattern_starts_from_image(img, track_base_from_header(p.header))
    tracks = []
    index = 0
    for _track in range(16):
        count = img[starts[index]]
        tracks.append([read_pattern(p, base) for base in starts[index : index + count]])
        index += count
    scenes = []
    for slot in range(100):
        row = img[SCENE_SLOT0 + slot * SCENE_SLOT_SIZE : SCENE_SLOT0 + (slot + 1) * SCENE_SLOT_SIZE]
        if any(row):
            scenes.append([slot, list(row[:16]), list(row[16:32]), row[32]])
    return {
        "header": p.header.hex(),
        "imageSize": len(img),
        "settings": {
            "tempoTenths": int.from_bytes(img[0:2], "little"),
            "grooveAmount": config.groove_amount,
            "grooveType": config.groove_type_raw,
            "clickVolume": config.click_volume_raw,
            "activeScene": config.active_scene_raw,
            "activeSongRaw": config.active_song_raw,
            "sceneLength": config.scene_length_raw,
            "transpose": config.transpose_semitones,
            "timeSignature": config.time_signature_raw,
            "octaves": [s8(img[0x3D + t]) for t in range(16)],
            "voices": [voices or 0 for voices in config.voice_allocations],
            "midiChannels": list(config.midi_channels),
        },
        "scenes": scenes,
        "songs": [list(p.get_song_chain(song)) for song in range(1, 15)],
        "tracks": tracks,
    }


def read_pattern(p: ImageProject, base: int) -> dict:
    img = p.image
    count = img[base + OFF_NOTE_COUNT]
    notes = []
    for k in range(count):
        at = base + OFF_NOTE_COUNT + 1 + 12 * k
        notes.append([
            int.from_bytes(img[at : at + 4], "little", signed=True),
            int.from_bytes(img[at + 4 : at + 8], "little"),
            img[at + 8],
            img[at + 9],
            int.from_bytes(img[at + 10 : at + 12], "little"),
        ])
    lanes = base + OFF_NOTE_COUNT + 1 + 12 * count
    components = []
    for step in range(64):
        row = base + p.TRK_STEPCOMP + 16 * step
        mask = int.from_bytes(img[row : row + 2], "little")
        components += [[step, bit, img[row + 2 + bit]] for bit in range(14) if mask >> bit & 1]
    locks = []
    for step in range(64):
        at = base + p.PLOCK_STEP_MASK + 8 * step
        mask = int.from_bytes(img[at : at + 8], "little")
        for column in range(42):
            if mask >> p._plock_mask_bit(column) & 1:
                cell = base + p.TRK_PLOCK + 84 * step + 2 * column
                locks.append([step, column, int.from_bytes(img[cell : cell + 2], "little")])
    return {
        "steps": img[base + TRACK_PATTERN_STEPS_OFFSET],
        "noteLength": int.from_bytes(
            img[base + TRACK_DEFAULT_STEP_LENGTH_OFFSET : base + TRACK_DEFAULT_STEP_LENGTH_OFFSET + 2], "little"
        ),
        "scale": img[base + p.TRK_SCALE],
        "quantize": img[base + TRACK_QUANTIZATION_OFFSET],
        "groove": s8(img[base + TRACK_GROOVE_OFFSET]),
        "smoothing": img[base + TRACK_PLOCK_SHAPE_OFFSET],
        "pristine": int.from_bytes(img[base + OFF_PRISTINE : base + OFF_PRISTINE + 2], "little"),
        "engine": img[base + p.TRK_ENGINE],
        "preset": img[base + p.PRESET_PATH : base + p.PRESET_PATH + p.PRESET_PATH_MAX]
        .split(b"\0")[0]
        .decode("latin1"),
        "notes": notes,
        "components": components,
        "locks": locks,
        "union": img[base + p.PLOCK_MASTER : base + p.PLOCK_MASTER + 8].hex(),
        "lanes": list(img[lanes : lanes + 3]),
    }


# ─── output ─────────────────────────────────────────────────────────────────────────────────────

PROBES = [
    "01_a_img_c4_step5.xy",
    "02_b_img_notevel_60_60.xy",
    "06_f_mute_enum.xy",
    "07_g_note_flags.xy",
]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def generate() -> tuple[dict[str, bytes], dict, list]:
    files: dict[str, bytes] = {}
    blank = build([])
    if blank != BASE.read_bytes():
        raise SystemExit("the library no longer re-encodes the baseline byte for byte")
    files["blank-1.1.4.xy"] = blank
    for name in PROBES:
        files[name] = (UPSTREAM / "output/image-probes" / name).read_bytes()
    files["song.xy"] = build(SONG_OPS)
    files["locks.xy"] = build(LOCK_OPS)
    expected = {name: read_fields(data) for name, data in sorted(files.items())}
    goldens = []
    for name, ops, device in GOLDENS:
        data = build(ops)
        entry = {"name": name, "ops": ops, "size": len(data), "sha256": sha256(data)}
        if device:
            if (UPSTREAM / device).read_bytes() != data:
                raise SystemExit(f"golden {name!r} no longer equals {device}")
            entry["equals"] = device
        goldens.append(entry)
    for name, data, ops in (("song.xy", files["song.xy"], SONG_OPS), ("locks.xy", files["locks.xy"], LOCK_OPS)):
        goldens.append({"name": name, "ops": ops, "size": len(data), "sha256": sha256(data), "fixture": name})
    return files, expected, goldens


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="compare instead of writing")
    args = parser.parse_args()
    files, expected, goldens = generate()
    documents = {"expected.json": expected, "goldens.json": goldens}
    if args.check:
        stale = [name for name, data in files.items() if not (OUT / name).exists() or (OUT / name).read_bytes() != data]
        stale += [
            name
            for name, doc in documents.items()
            if not (OUT / name).exists() or json.loads((OUT / name).read_text()) != json.loads(json.dumps(doc))
        ]
        if stale:
            print("stale:", ", ".join(stale))
            return 1
        print(f"src/lib/xy/fixtures is up to date ({len(files)} .xy files, {len(goldens)} goldens)")
        return 0
    OUT.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        (OUT / name).write_bytes(data)
    for name, doc in documents.items():
        (OUT / name).write_text(json.dumps(doc, indent="\t") + "\n")
    print(f"wrote {len(files)} .xy files and {len(goldens)} goldens to {OUT.relative_to(ROOT)}")
    print("run `pnpm exec prettier --write src/lib/xy/fixtures` to format the JSON")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
