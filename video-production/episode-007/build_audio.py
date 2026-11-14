"""Episode 007 soundtrack: Tony's VO takes and his on-camera audio on one
program clock, plus the music bed.

    .venv python -I episode-007/build_audio.py

Sources (Desktop/YouTube):
  episode-007-raw/*.m4a                 Tony's VO recordings (phone), several takes per line
  episode-007-assets/vo/*.words.js      their Whisper word timings (medium.en)
  episode-007-assets/camera/clips/*.wav the six bookshelf scenes, cut from
                                        batman_through_the_generations.mp4
  episode-007-assets/camera/clips/*.words.js  clip-level word timings

PROGRAM below is the edit: camera scenes in order, and VO ranges picked from
the takes (the last clean take of a repeated line wins). Each VO range keeps
only the words inside it; pauses longer than MAX_PAUSE inside a range shrink to
MAX_PAUSE, and every range gets LEAD/TAIL of its own room tone.

Writes public/episode-007/audio/VOICE_PROGRAM.wav (VO and camera audio leveled
separately to -13 dBFS speech RMS so they match, VO de-essed for the "s"
sounds, plain peak limiter at -1.5), MUSIC_STING.mp3 is copied by hand;
episode-007/narration.words.js and episode-007/audio-plan.json (piece times,
camera clip placement, sting, end card).
"""
import json
import re
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.ndimage import maximum_filter1d
from scipy.signal import butter, sosfiltfilt

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
FF = ROOT / "node_modules" / "@remotion" / "compositor-win32-x64-msvc" / "ffmpeg.exe"
YT = Path.home() / "Desktop" / "YouTube"
RAW = YT / "episode-007-raw"
VO_WORDS = YT / "episode-007-assets" / "vo"
CAM = YT / "episode-007-assets" / "camera" / "clips"
OUT = ROOT / "public" / "episode-007" / "audio"
SR = 48000

START = 0.4
STING = 2.5
LEAD, TAIL = 0.14, 0.28
MAX_PAUSE = 0.75
GAP = 0.35            # between two VO ranges
CAM_GAP = 0.25        # around a camera scene (the clips carry ~0.3 s of their own pad)
SECTION_GAP = 0.6     # extra breath at a chapter change
END_CARD = 8.0

VO_FILES = {
    "A": "The California Clipper 2.m4a",
    "B": "W Augusta Blvd 2.m4a",
    "C": "W Augusta Blvd 5.m4a",
}

# ("cam", clip) | ("vo", file key, from s, to s) | ("sting",) | ("section", id)
# Times are source-file seconds; a range keeps the words that start inside it.
PROGRAM = [
    ("section", "01"),
    ("cam", "cam1-tamu"),
    ("vo", "A", 2.8, 22.5),
    ("sting",),
    ("section", "02"),
    ("vo", "A", 32.5, 65.5, 32.56),  # second "Let's start in 1986" (after "Doing that again.") onward
    ("cam", "cam2-dkr"),
    ("vo", "A", 67.7, 99.9),
    ("section", "03"),
    ("vo", "A", 101.2, 219.9),
    ("section", "04"),
    ("cam", "cam3-azrael"),
    ("vo", "A", 227.0, 281.0),      # through "Bane breaks his back."
    ("vo", "A", 285.3, 366.9),      # second "Batman number 497" onward
    ("section", "05"),
    ("vo", "A", 374.0, 381.95),
    ("cam", "cam4-owls"),
    ("vo", "A", 382.8, 449.9),
    ("section", "06"),
    ("vo", "B", 8.0, 28.1),         # through "I love it." (skips the "Part 6" slate)
    ("cam", "cam5-absolute"),
    ("vo", "B", 28.1, 148.0),       # "Riddler..." through "He didn't just throw everything out."
    ("vo", "B", 153.0, 186.0),      # clean retake of "He took familiar relationships..." to the end
    ("section", "07"),
    ("vo", "C", 0.5, 27.0),
    ("vo", "C", 33.0, 44.6),        # second take of "has a lot more to him"
    ("cam", "cam6a-close"),
    ("vo", "C", 45.3, 61.0),        # the ComixCatalog mention
    ("cam", "cam6b-signoff"),
]


def decode_mono(path):
    wav = subprocess.run([str(FF), "-nostdin", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-c:a", "pcm_s16le", "-f", "wav", "-"],
                         check=True, capture_output=True).stdout
    d = wav.find(b"data")
    return np.frombuffer(wav[d + 8:], dtype=np.int16).astype(np.float32) / 32768


def decode_stereo(path):
    wav = subprocess.run([str(FF), "-nostdin", "-v", "error", "-i", str(path), "-ac", "2", "-ar", str(SR), "-c:a", "pcm_s16le", "-f", "wav", "-"],
                         check=True, capture_output=True).stdout
    d = wav.find(b"data")
    a = np.frombuffer(wav[d + 8:], dtype=np.int16).astype(np.float32) / 32768
    return a[: len(a) // 2 * 2].reshape(-1, 2)


def load_words(path):
    t = path.read_text(encoding="utf-8")
    return json.loads(t[t.index("{"): t.rindex("}") + 1])["words"]


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", Path(name).stem.lower()).strip("-")


def deess(x, lo=4500, hi=10000, max_db=5.0, thresh_db=-6.0):
    # Split-band de-esser (Ep 006's, set firmer for Tony's "s" sounds): when the
    # 4.5 to 10 kHz band carries most of the energy, turn that band down, at most max_db.
    sos = butter(4, [lo, hi], btype="bandpass", fs=SR, output="sos")
    band = sosfiltfilt(sos, x)
    n = int(0.003 * SR)
    k = np.ones(n) / n
    env = np.sqrt(np.convolve(band ** 2, k, mode="same") + 1e-12)
    full = np.sqrt(np.convolve(x ** 2, k, mode="same") + 1e-12)
    gr = np.clip(20 * np.log10(env / full) - thresh_db, 0, max_db) * (full > 10 ** (-45 / 20))
    gr = maximum_filter1d(gr, int(0.004 * SR))
    m = int(0.012 * SR)
    gr = np.convolve(gr, np.ones(m) / m, mode="same")
    on = gr > 0.5
    print(f"  de-ess: active {on.mean() * 100:.1f}% of the time, mean cut there {gr[on].mean() if on.any() else 0:.1f} dB")
    return x - band + band * 10 ** (-gr / 20)


def speech_rms_db(x):
    frames = x[: len(x) // 960 * 960].reshape(-1, 960)
    r = np.sqrt((frames ** 2).mean(1) + 1e-12)
    loud = r[r > np.percentile(r, 40)]
    return 20 * np.log10(np.sqrt((loud ** 2).mean()))


def level(x, target=-13.0):
    return x * 10 ** ((target - speech_rms_db(x)) / 20)


def limit(x, ceiling_db=-1.5):
    # Plain look-ahead peak limiter (Ep 005): 2.5 ms blocks, 80 ms release, no compression below the ceiling.
    c = 10 ** (ceiling_db / 20)
    b = int(0.0025 * SR)
    peaks = np.abs(np.concatenate([x, np.zeros(b - len(x) % b if len(x) % b else 0)])).reshape(-1, b).max(1)
    need = np.minimum(1.0, c / (peaks + 1e-9))
    need = np.minimum(need, np.concatenate([need[1:], [1.0]]))
    rel = np.exp(-1 / (0.08 / 0.0025))
    g = need.copy()
    for i in range(1, len(g)):
        g[i] = min(need[i], rel * g[i - 1] + (1 - rel) * need[i]) if need[i] >= g[i - 1] else need[i]
    gs = np.interp(np.arange(len(g) * b), np.arange(len(g)) * b + b / 2, g)[: len(x)]
    return x * gs


def fade(x, ms=12):
    n = min(len(x) // 2, int(ms / 1000 * SR))
    if n:
        r = np.linspace(0, 1, n, dtype=np.float32)
        x = x.copy()
        x[:n] *= r
        x[-n:] *= r[::-1]
    return x


def vo_range(audio, words, a, b, floor=0.0):
    """Audio and words for the words starting in [a, b), long pauses shortened.
    `floor` = earliest audio sample to use (a retake that follows a flub too closely for LEAD)."""
    ws = [w for w in words if a <= w["s"] < b]
    if not ws:
        raise SystemExit(f"no words in {a}-{b}")
    # Split into runs at long pauses; each run keeps LEAD/TAIL, runs join at MAX_PAUSE.
    runs, cur = [], [ws[0]]
    for w in ws[1:]:
        if w["s"] - cur[-1]["e"] > MAX_PAUSE + LEAD + TAIL:
            runs.append(cur)
            cur = [w]
        else:
            cur.append(w)
    runs.append(cur)
    chunks, out_words, t = [], [], 0.0
    for i, run in enumerate(runs):
        s0 = max(floor, run[0]["s"] - LEAD)
        s1 = run[-1]["e"] + TAIL
        if i + 1 < len(runs):
            s1 = min(s1, runs[i + 1][0]["s"] - LEAD)
        seg = fade(audio[int(s0 * SR): int(s1 * SR)])
        out_words += [{"w": w["w"], "s": round(t + w["s"] - s0, 3), "e": round(t + w["e"] - s0, 3)} for w in run]
        chunks.append(seg)
        t += len(seg) / SR
        if i + 1 < len(runs):
            gap = MAX_PAUSE - LEAD - TAIL
            chunks.append(np.zeros(int(gap * SR), np.float32))
            t += gap
    return np.concatenate(chunks), out_words


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    vo_audio = {k: level(decode_mono(RAW / f)) for k, f in VO_FILES.items() if (RAW / f).exists()}
    vo_words = {k: load_words(VO_WORDS / f"{slug(f)}.words.js") for k, f in VO_FILES.items() if k in vo_audio}

    t = START
    pieces, words, plan_pieces, sections, cams = [], [], [], [], []
    sting_at, prev = None, None
    for item in PROGRAM:
        kind = item[0]
        if kind == "section":
            if prev is not None:
                t += SECTION_GAP
            sections.append({"section": item[1], "at": round(t, 3)})
            continue
        if kind == "sting":
            t += 0.5
            sting_at = round(t, 3)
            t += STING + 0.3
            prev = "sting"
            continue
        if kind == "cam":
            if prev == "vo":
                t += CAM_GAP
            x = level(decode_mono(CAM / f"{item[1]}.wav"))
            ws = load_words(CAM / f"{item[1]}.words.js")
            cams.append({"clip": item[1], "at": round(t, 3), "dur": round(len(x) / SR, 3)})
            src = "cam"
        else:
            if prev == "vo":
                t += GAP
            elif prev == "cam":
                t += CAM_GAP
            x, ws = vo_range(vo_audio[item[1]], vo_words[item[1]], item[2], item[3], *item[4:])
            x = deess(x)
            src = "vo"
        pieces.append((t, x))
        words += [{"w": w["w"], "s": round(t + w["s"], 3), "e": round(t + w["e"], 3), **({"cam": 1} if src == "cam" else {})} for w in ws]
        plan_pieces.append({"kind": src, "ref": item[1] if src == "cam" else f"{item[1]} {item[2]}-{item[3]}", "at": round(t, 3), "dur": round(len(x) / SR, 3)})
        t += len(x) / SR
        prev = src

    end_card = round(t + 1.0, 3)
    duration = round(end_card + END_CARD, 3)
    prog = np.zeros(int(duration * SR) + SR, np.float32)
    for at, x in pieces:
        i = int(round(at * SR))
        prog[i:i + len(x)] += x
    prog = limit(prog[: int(duration * SR)])
    sf.write(OUT / "VOICE_PROGRAM.wav", np.stack([prog, prog], 1), SR, subtype="PCM_16")
    print(f"VOICE_PROGRAM.wav {duration / 60:.2f} min, speech {speech_rms_db(prog):.1f} dBFS RMS, peak {20 * np.log10(np.abs(prog).max()):.1f} dBFS")

    plan = {"duration": duration, "start": START, "sting": {"at": sting_at, "dur": STING}, "endCard": end_card,
            "sections": sections, "cams": cams, "pieces": plan_pieces}
    (HERE / "audio-plan.json").write_text(json.dumps(plan, indent=1) + "\n", encoding="utf-8")
    with open(HERE / "narration.words.js", "w", encoding="utf-8") as f:
        f.write("// Generated by episode-007/build_audio.py from the Whisper word timings. Do not edit by hand.\n")
        f.write("export default " + json.dumps({"duration": duration, "source": "VOICE_PROGRAM.wav", "words": words}, separators=(",", ":")) + ";\n")
    print(f"{len(words)} words, {len(cams)} camera scenes, sting at {sting_at}s, end card at {end_card}s, total {duration}s")


if __name__ == "__main__":
    main()
