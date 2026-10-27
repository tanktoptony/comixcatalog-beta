"""Episode 006 soundtrack: the HeyGen section files (build_voice.py) laid out
on the program clock, plus the music bed.

    .venv python -I episode-006/build_audio.py

Reads Desktop/YouTube/episode-006-assets/audio/NN - name.wav + .words.json.
Writes into public/episode-006/audio/:
  VOICE_PROGRAM.wav    voice on the program clock, stereo, light de-ess,
                       speech at -13 dBFS RMS, plain peak limiter at -1.5 dBFS
  MUSIC_BED_FULL.wav   Rollin at 5 (Kevin MacLeod, CC BY) as one continuous bed:
                       the track minus its fade-out tail, 1 s crossfades,
                       long enough for the whole episode (never loop it in Remotion)
  MUSIC_STING.mp3      Funkorama, for the channel sting
and episode-006/narration.words.js (words on the program clock) plus
episode-006/audio-plan.json (section times, sting, end card).

Layout: 01 cold open, a hold while the card slams in, the 2.5 s channel
sting, then 02 (with the optional 02b Avengers: Doomsday line right after
it) through 12, then the end card. Each section file already carries 0.3 s
of lead and a 0.75 s tail, so GAP only adds a breath on top.
"""
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.ndimage import maximum_filter1d
from scipy.signal import butter, sosfiltfilt

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
FF = ROOT / "node_modules" / "@remotion" / "compositor-win32-x64-msvc" / "ffmpeg.exe"
SRC = Path.home() / "Desktop" / "YouTube" / "episode-006-assets" / "audio"
MUSIC_SRC = Path.home() / "Desktop" / "episode-001-assets" / "audio"
OUT = ROOT / "public" / "episode-006" / "audio"
SR = 48000

ORDER = ["01", "02", "02b", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]
START = 0.6          # black-to-picture before the first word
CARD_HOLD = 2.2      # after the cold open: the card slams in and holds on the front
STING = 2.5
GAP = 0.25           # extra breath between sections
GAP_02B = 0.0        # 02b runs straight on from 02 (02 already ends in 0.75 s of tail)
END_CARD = 8.0
BED_BODY = 125.4     # Rollin at 5 before its fade-out tail
XFADE = 1.0


def section_files():
    found = {}
    for f in SRC.glob("*.wav"):
        m = re.match(r"(\d\db?) - ", f.name)
        if m:
            found[m.group(1)] = f
    missing = [k for k in ORDER if k not in found]
    if missing:
        raise SystemExit(f"missing section files: {missing}")
    return found


def deess(x, lo=5000, hi=10000, max_db=3.0, thresh_db=-4.0):
    # Light split-band de-esser: when the 5 to 10 kHz band carries most of the
    # energy (an "s"), turn that band down, at most max_db. Vowels and silence
    # never trip it (at -4 dB it fires on about 10% of speech, the "s" sounds).
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
    print(f"  de-ess: active {np.mean(gr > 0.5) * 100:.1f}% of the time, mean cut there {gr[gr > 0.5].mean() if (gr > 0.5).any() else 0:.1f} dB")
    return x - band + band * 10 ** (-gr / 20)


def speech_rms_db(x):
    frames = x[: len(x) // 960 * 960].reshape(-1, 960)
    r = np.sqrt((frames ** 2).mean(1) + 1e-12)
    loud = r[r > np.percentile(r, 40)]
    return 20 * np.log10(np.sqrt((loud ** 2).mean()))


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


def decode_stereo(path):
    wav = subprocess.run([str(FF), "-v", "error", "-i", str(path), "-ac", "2", "-ar", str(SR), "-c:a", "pcm_s16le", "-f", "wav", "-"],
                         check=True, capture_output=True).stdout
    d = wav.find(b"data")
    a = np.frombuffer(wav[d + 8:], dtype=np.int16).astype(np.float32) / 32768
    return a[: len(a) // 2 * 2].reshape(-1, 2)


def build_bed(seconds):
    src = decode_stereo(MUSIC_SRC / "MUSIC_BED.mp3")[: int(BED_BODY * SR)]
    x = int(XFADE * SR)
    ramp = np.linspace(0, 1, x)[:, None]
    bed = src.copy()
    while len(bed) < seconds * SR:
        bed = np.concatenate([bed[:-x], bed[-x:] * (1 - ramp) + src[:x] * ramp, src[x:]])
    return bed[: int(seconds * SR)]


def main():
    files = section_files()
    OUT.mkdir(parents=True, exist_ok=True)
    t = START
    voice, words, plan_sections = [], [], []
    sting_at = None
    for key in ORDER:
        if key == "02b":
            t -= GAP - GAP_02B
        x, sr = sf.read(files[key], dtype="float32")
        assert sr == SR, (files[key], sr)
        meta = json.loads(files[key].with_suffix(".words.json").read_text(encoding="utf-8"))
        voice.append((t, x))
        words += [{"w": w["w"], "s": round(t + w["s"], 3), "e": round(t + w["e"], 3)} for w in meta["words"]]
        plan_sections.append({"section": key, "at": round(t, 3), "dur": round(len(x) / SR, 3)})
        t += len(x) / SR
        if key == "01":
            t += CARD_HOLD
            sting_at = round(t, 3)
            t += STING
        t += GAP
    last_word = words[-1]["e"]
    end_card = round(last_word + 1.2, 3)
    duration = round(end_card + END_CARD, 3)

    prog = np.zeros(int(duration * SR) + SR, np.float32)
    for at, x in voice:
        i = int(round(at * SR))
        prog[i:i + len(x)] += x
    prog = prog[: int(duration * SR)]
    prog = deess(prog)
    prog = limit(prog * 10 ** ((-13 - speech_rms_db(prog)) / 20))
    sf.write(OUT / "VOICE_PROGRAM.wav", np.stack([prog, prog], 1), SR, subtype="PCM_16")
    print(f"VOICE_PROGRAM.wav {duration / 60:.2f} min, speech {speech_rms_db(prog):.1f} dBFS RMS, peak {20 * np.log10(np.abs(prog).max()):.1f} dBFS")

    sf.write(OUT / "MUSIC_BED_FULL.wav", build_bed(duration + 2), SR, subtype="PCM_16")
    shutil.copyfile(MUSIC_SRC / "MUSIC_STING.mp3", OUT / "MUSIC_STING.mp3")

    plan = {"duration": duration, "start": START, "sting": {"at": sting_at, "dur": STING}, "endCard": end_card, "sections": plan_sections}
    (HERE / "audio-plan.json").write_text(json.dumps(plan, indent=1) + "\n", encoding="utf-8")
    with open(HERE / "narration.words.js", "w", encoding="utf-8") as f:
        f.write("// Generated by episode-006/build_audio.py from the HeyGen word timings. Do not edit by hand.\n")
        f.write("export default " + json.dumps({"duration": duration, "source": "VOICE_PROGRAM.wav", "words": words}, separators=(",", ":")) + ";\n")
    print(f"{len(words)} words, sting at {sting_at}s, end card at {end_card}s, total {duration}s")


if __name__ == "__main__":
    main()
