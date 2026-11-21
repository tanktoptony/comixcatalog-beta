"""Episode 009 soundtrack: the HeyGen section files (build_voice.py) on the
program clock, with Tony's track samples dropped in where SCRIPT.md has a
CLIP line.

    .venv python -I episode-009/build_audio.py

Reads Desktop/YouTube/episode-009-assets/audio/voice/NN - name.wav + .words.json
and audio/iksse3-track-samples.wav (Tony's OBS recording, 2026-11-21: about
15 s of each song, played in album order, split at his ~1.3 s pauses; see
CLIP_SOURCES). Writes:
  public/episode-009/audio/VOICE_PROGRAM.wav  voice only, light de-ess, speech
      at -13 dBFS RMS, plain peak limiter at -1.5 (same as Ep 006 to 008)
  public/episode-009/audio/MUSIC_PROGRAM.wav  the Double Drift bed (same level
      as Ep 008: stored 6 dB down, x0.4) ducked out under the sting and every
      song clip, plus the song clips themselves at full
  episode-009/narration.words.js, episode-009/audio-plan.json

A CLIP is anchored to the paragraph it follows: the section file is split in
the pause after that paragraph's last word and the clip plays in the gap.
Every clip is at most 5 s (Part 2's rule).
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
ASSETS = Path.home() / "Desktop" / "YouTube" / "episode-009-assets" / "audio"
SRC = ASSETS / "voice"
SAMPLES = ASSETS / "iksse3-track-samples.wav"
OUT = ROOT / "public" / "episode-009" / "audio"
SR = 48000

ORDER = [f"{n:02d}" for n in range(1, 16)]
START = 0.6
HOLD = 0.5
STING = 5.6          # page-flip sting (Ep 008 v2 template)
GAP = 0.45
END_CARD = 8.0
CLIP_MAX = 4.8
CLIP_PAD = 0.45      # silence on each side of a clip
CLIP_FADE_IN, CLIP_FADE_OUT = 0.08, 0.5
SONG_RMS_DB = -17.0  # song clips sit a little under the voice (speech -13 dBFS RMS)

# Where each song is in Tony's recording (seconds, between his pauses).
# Only "cuts" is confirmed by a lyric; the rest follow album order (Tony to confirm).
CLIP_SOURCES = {
    "ring": (59.6, 64.1),            # the "Hello Apollo, where should I begin?" line (words at 61.89-63.9)
    "title": (87.40, 102.37),
    "title_open": (87.55, 92.35),    # section 02 asks for the opening guitar: the start of Tony's play of the track
    "title_mid": (95.20, 100.00),    # section 04: a different stretch of the same play
    "cuts": (103.50, 119.11),
    "evils": (120.59, 143.28),
    "crowing": (144.64, 161.51),
    "brs": (162.79, 173.36),
    "camper1": (174.92, 192.84),
    "camper2": (194.15, 209.84),
    "camper3": (213.53, 228.48),
    "afha": (229.77, 242.64),
    "light": (244.04, 269.00),
    "2113": (270.55, 295.29),
}
FIXED = {"ring", "title_open", "title_mid"}  # play this window as is; others pick their loudest 4.8 s

# (section, last words of the paragraph the clip follows, song keys in order)
CLIPS = [
    ("02", "takes me right back there", ["title_open"]),
    ("04", "outside newo ikkin's house", ["ring"]),
    ("04", "who everyone is and where they are", ["title_mid"]),
    ("05", "the lyrics don't always spell it out", ["cuts", "evils"]),
    ("06", "it feels like you went somewhere", ["crowing"]),
    ("07", "listening to the whole record", ["brs"]),
    ("09", "come straight out of the comic", ["camper1"]),
    ("09", "anything about the story", ["camper2"]),
    ("09", "first listening to these records", ["camper3"]),
    ("10", "a lot different back then", ["afha"]),
    ("11", "the whole album start to finish", ["light"]),
    ("12", "connects us to where the series began", ["2113"]),
]
SONG_TITLES = {
    "ring": "The Ring in Return", "title": "In Keeping Secrets of Silent Earth: 3", "title_open": "In Keeping Secrets of Silent Earth: 3", "title_mid": "In Keeping Secrets of Silent Earth: 3", "cuts": "Cuts Marked in the March of Men",
    "evils": "Three Evils (Embodied in Love and Shadow)", "crowing": "The Crowing", "brs": "Blood Red Summer",
    "camper1": "The Camper Velourium I: Faint of Hearts", "camper2": "The Camper Velourium II: Backend of Forever",
    "camper3": "The Camper Velourium III: Al the Killer", "afha": "A Favor House Atlantic", "light": "The Light & the Glass", "2113": "21:13",
}


def norm(t):
    return re.sub(r"[^a-z0-9' ]+", " ", t.lower().replace("-", " ")).split()


def deess(x, lo=5000, hi=10000, max_db=3.0, thresh_db=-4.0):
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
    return x - band + band * 10 ** (-gr / 20)


def speech_rms_db(x):
    frames = x[: len(x) // 960 * 960].reshape(-1, 960)
    r = np.sqrt((frames ** 2).mean(1) + 1e-12)
    loud = r[r > np.percentile(r, 40)]
    return 20 * np.log10(np.sqrt((loud ** 2).mean()))


def limit(x, ceiling_db=-1.5):
    c = 10 ** (ceiling_db / 20)
    b = int(0.0025 * SR)
    pad = b - len(x) % b if len(x) % b else 0
    mono_peak = np.abs(x) if x.ndim == 1 else np.abs(x).max(axis=1)
    peaks = np.concatenate([mono_peak, np.zeros(pad, mono_peak.dtype)]).reshape(-1, b).max(1)
    need = np.minimum(1.0, c / (peaks + 1e-9))
    need = np.minimum(need, np.concatenate([need[1:], [1.0]]))
    rel = np.exp(-1 / (0.08 / 0.0025))
    g = need.copy()
    for i in range(1, len(g)):
        g[i] = min(need[i], rel * g[i - 1] + (1 - rel) * need[i]) if need[i] >= g[i - 1] else need[i]
    gs = np.interp(np.arange(len(g) * b), np.arange(len(g)) * b + b / 2, g)[: len(x)]
    gs = gs.astype(np.float32)
    return x * (gs if x.ndim == 1 else gs[:, None])


def decode_stereo(path):
    wav = subprocess.run([str(FF), "-v", "error", "-i", str(path), "-ac", "2", "-ar", str(SR), "-c:a", "pcm_s16le", "-f", "wav", "-"],
                         check=True, capture_output=True).stdout
    d = wav.find(b"data")
    a = np.frombuffer(wav[d + 8:], dtype=np.int16).astype(np.float32) / 32768
    return a[: len(a) // 2 * 2].reshape(-1, 2)


def pick_window(song, key):
    a, b = CLIP_SOURCES[key]
    if key in FIXED:
        return a, b
    # Loudest CLIP_MAX window, keeping 0.6 s away from Tony's skip points.
    x = song[int((a + 0.6) * SR): int((b - 0.6) * SR)].mean(1)
    hop = int(0.1 * SR)
    win = int(CLIP_MAX * SR)
    best, at = -1, 0
    for i in range(0, max(1, len(x) - win), hop):
        e = float((x[i:i + win] ** 2).mean())
        if e > best:
            best, at = e, i
    s = a + 0.6 + at / SR
    return s, s + CLIP_MAX


def clip_audio(song, key):
    s, e = pick_window(song, key)
    x = song[int(s * SR): int(e * SR)].copy()
    rms = np.sqrt((x ** 2).mean() + 1e-12)
    x *= 10 ** (SONG_RMS_DB / 20) / rms
    n = len(x)
    env = np.ones(n, np.float32)
    fi, fo = int(CLIP_FADE_IN * SR), int(CLIP_FADE_OUT * SR)
    env[:fi] = np.linspace(0, 1, fi)
    env[n - fo:] = np.linspace(1, 0, fo)
    return x * env[:, None], (round(s, 2), round(e, 2))


def split_points(key, words):
    """Times (section clock) where each of this section's clips goes, in order."""
    out = []
    flat = [norm(w["w"]) for w in words]
    toks, owner = [], []
    for i, f in enumerate(flat):
        for t in f:
            toks.append(t)
            owner.append(i)
    for sec, anchor, songs in CLIPS:
        if sec != key:
            continue
        want = norm(anchor)
        hit = [j for j in range(len(toks) - len(want) + 1) if toks[j:j + len(want)] == want]
        if len(hit) != 1:
            raise SystemExit(f"{key}: anchor {anchor!r} matched {len(hit)} times")
        last = owner[hit[0] + len(want) - 1]
        e = words[last]["e"]
        nxt = words[last + 1]["s"] if last + 1 < len(words) else e + 0.6
        out.append((round(e + min(0.35, (nxt - e) / 2), 3), songs))
    return out


def main():
    files = {}
    for f in SRC.glob("*.wav"):
        m = re.match(r"(\d\d) - ", f.name)
        if m:
            files[m.group(1)] = f
    missing = [k for k in ORDER if k not in files]
    if missing:
        raise SystemExit(f"missing section files: {missing}")
    OUT.mkdir(parents=True, exist_ok=True)
    song = decode_stereo(SAMPLES)

    t = START
    voice, words, plan_sections, plan_clips = [], [], [], []
    sting_at = None
    for key in ORDER:
        x, sr = sf.read(files[key], dtype="float32")
        assert sr == SR, (files[key], sr)
        meta = json.loads(files[key].with_suffix(".words.json").read_text(encoding="utf-8"))
        sw = meta["words"]
        cuts = split_points(key, sw)
        plan_sections.append({"section": key, "at": round(t, 3)})
        pos, shift = 0.0, 0.0  # pos: section clock already placed; shift: clip time inserted so far
        for at_sec, songs in cuts + [(len(x) / SR, None)]:
            piece = x[int(pos * SR): int(at_sec * SR)]
            voice.append((t + pos + shift, piece))
            words += [{"w": w["w"], "s": round(t + shift + w["s"], 3), "e": round(t + shift + w["e"], 3)} for w in sw if pos <= w["s"] < at_sec]
            if songs:
                c_at = t + at_sec + shift + CLIP_PAD
                for i, k in enumerate(songs):
                    audio, window = clip_audio(song, k)
                    plan_clips.append({"song": k, "title": SONG_TITLES[k], "at": round(c_at, 3), "dur": round(len(audio) / SR, 3), "section": key, "source": window})
                    c_at += len(audio) / SR + (CLIP_PAD if i < len(songs) - 1 else 0)
                shift = c_at + CLIP_PAD - (t + at_sec)
            pos = at_sec
        plan_sections[-1]["dur"] = round(len(x) / SR + shift, 3)
        t += len(x) / SR + shift
        if key == "01":
            t += HOLD
            sting_at = round(t, 3)
            t += STING
        t += GAP

    end_card = round(words[-1]["e"] + 1.2, 3)
    duration = round(end_card + END_CARD, 3)
    n = int(duration * SR)

    prog = np.zeros(n + SR, np.float32)
    for at, x in voice:
        i = int(round(at * SR))
        prog[i:i + len(x)] += x
    prog = prog[:n]
    prog = deess(prog)
    prog = limit(prog * 10 ** ((-13 - speech_rms_db(prog)) / 20))
    sf.write(OUT / "VOICE_PROGRAM.wav", np.stack([prog, prog], 1), SR, subtype="PCM_16")
    print(f"VOICE_PROGRAM.wav {duration / 60:.2f} min, speech {speech_rms_db(prog):.1f} dBFS RMS, peak {20 * np.log10(np.abs(prog).max()):.1f} dBFS")

    # Bed at Ep 008's level, ducked under the sting and every clip.
    bed, _ = sf.read(OUT / "MUSIC_BED_DOUBLE_DRIFT.wav", dtype="float32", frames=n)
    if len(bed) < n:
        raise SystemExit("bed shorter than the episode")
    tt = (np.arange(n) / SR).astype(np.float32)
    gain = np.full(n, 0.4, np.float32)
    fade_in, fade_out = 2.0, 4.0
    gain *= np.clip(tt / fade_in, 0, 1) * np.clip((duration - tt) / fade_out, 0, 1)
    duck = np.ones(n, np.float32)
    ramp = 0.3
    # The bed reaches zero exactly as a clip starts (the clip fades in over it)
    # and comes back up while the sting's tail is still sounding, so neither
    # edge leaves digital silence (qc flagged 350 ms holes before each clip).
    for a, b in [(sting_at, sting_at + STING - 0.5)] + [(c["at"] + 0.06, c["at"] + c["dur"] - 0.2) for c in plan_clips]:
        down = np.clip((a - tt) / ramp, 0, 1)
        up = np.clip((tt - b) / ramp, 0, 1)
        duck = np.minimum(duck, np.maximum(down, up))
    music = (bed * (gain * duck).astype(np.float32)[:, None]).astype(np.float32)
    for c in plan_clips:
        audio, _ = clip_audio(song, c["song"])
        i = int(round(c["at"] * SR))
        music[i:i + len(audio)] += audio
    music = limit(music)
    sf.write(OUT / "MUSIC_PROGRAM.wav", music, SR, subtype="PCM_16")
    print(f"MUSIC_PROGRAM.wav with {len(plan_clips)} song clips")

    plan = {"duration": duration, "start": START, "sting": {"at": sting_at, "dur": STING}, "endCard": end_card,
            "sections": plan_sections, "clips": plan_clips}
    (HERE / "audio-plan.json").write_text(json.dumps(plan, indent=1) + "\n", encoding="utf-8")
    with open(HERE / "narration.words.js", "w", encoding="utf-8") as f:
        f.write("// Generated by episode-009/build_audio.py from the HeyGen word timings. Do not edit by hand.\n")
        f.write("export default " + json.dumps({"duration": duration, "source": "VOICE_PROGRAM.wav", "words": words}, separators=(",", ":")) + ";\n")
    for c in plan_clips:
        print(f"  {c['at']:7.2f}s  {c['dur']:.1f}s  {c['title']}  (sample {c['source'][0]}-{c['source'][1]})")
    print(f"{len(words)} words, sting at {sting_at}s, end card at {end_card}s, total {duration}s ({duration / 60:.2f} min)")


if __name__ == "__main__":
    main()
