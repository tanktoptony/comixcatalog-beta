"""Episode 005 soundtrack: Tony's section files laid out on the program
timeline, with slots for the album excerpts the script calls for.

    .venv python -I episode-005/build_audio.py <voice dir> <album dir or -> <tx dir>

<tx dir> holds faster-whisper word lists (<section file base>.json) for the
voice files. Writes into public/episode-005/audio/:
  VOICE_PROGRAM.wav   voice only, leveled, on the program clock
  MUSIC_PROGRAM.wav   album excerpts + Rollin at 5 bed (only when <album dir> has the tracks)
and episode-005/narration.words.js (words on the program clock) plus
episode-005/audio-plan.json (every voice clip and music event with times).

Mix numbers follow Ep 003/004: speech at -13 dBFS RMS through a plain
look-ahead peak limiter at -1.5 dBFS; the bed sits about 12 dB under speech.
"""
import json, os, re, subprocess, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FF = os.path.join(ROOT, "node_modules", "@remotion", "compositor-win32-x64-msvc", "ffmpeg.exe")
OUT = os.path.join(ROOT, "public", "episode-005", "audio")
SR = 48000

voice_dir, album_dir, tx_dir = sys.argv[1], sys.argv[2], sys.argv[3]

# Section order, the words that start part B (after the song intro), and extra
# music moments. Times in seconds.
INTRO = 9.0          # album intro at full level before part B
GAP = 0.7            # breath between sections
TAIL = 1.5           # song keeps going after the last word, fading
SECTIONS = [
    ("01", None), ("02", None), ("03", None),
    ("04", {"track": 1, "split": "So let's use that minute", "intro": 7.0}),
    ("05", {"track": 2, "split": "This is where it starts"}),
    ("06", {"track": 3, "split": "That's Claudio yelling"}),
    ("07", {"track": 4, "split": "The lyrics name the", "outro": ("ee_piano", 7.0)}),
    ("08", {"track": 5, "split": "This song sounds like"}),
    ("09", {"track": 6, "split": "This one's got Mayo"}),
    ("10", {"track": 7, "split": "This is Patrick"}),
    ("11", {"track": 8, "split": "This one reads like"}),
    ("12", {"track": 9, "split": "Another letter"}),
    ("13", {"track": 10, "split": "dear Mariah", "breaks": [("And then after a long", "gsc_piano", 9.0)], "outro": ("irobot", 8.0)}),
    ("14", None), ("15", None),
]
STING = 2.5
END_CARD = 8.0

def decode(path, mono=True):
    # Remotion's ffmpeg has no raw f32 muxer; read 16-bit WAV from a pipe.
    wav = subprocess.run([FF, "-v", "error", "-i", path, "-ac", "1" if mono else "2", "-ar", str(SR), "-c:a", "pcm_s16le", "-f", "wav", "-"],
                         check=True, capture_output=True).stdout
    d = wav.find(b"data")
    a = np.frombuffer(wav[d + 8:], dtype=np.int16).astype(np.float32) / 32768
    return a if mono else a[: len(a) // 2 * 2].reshape(-1, 2)

def write_wav(path, x):
    import wave
    x = np.clip(x, -1, 1)
    ch = 1 if x.ndim == 1 else x.shape[1]
    with wave.open(path, "wb") as w:
        w.setnchannels(ch); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype("<i2").tobytes())

def speech_rms_db(x):
    frames = x[: len(x) // 960 * 960].reshape(-1, 960)
    r = np.sqrt((frames ** 2).mean(1) + 1e-12)
    loud = r[r > np.percentile(r, 40)]
    return 20 * np.log10(np.sqrt((loud ** 2).mean()))

def limit_fast(x, ceiling_db=-1.5):
    # Block version of the limiter: 2.5 ms blocks, gain = min needed over this
    # and next block, linear between blocks. No compression below the ceiling.
    c = 10 ** (ceiling_db / 20)
    b = int(0.0025 * SR)
    m = len(x) // b * b
    peaks = np.abs(np.concatenate([x, np.zeros(b - len(x) % b if len(x) % b else 0)])).reshape(-1, b).max(1)
    need = np.minimum(1.0, c / (peaks + 1e-9))
    need = np.minimum(need, np.concatenate([need[1:], [1.0]]))
    # 80 ms release
    rel = np.exp(-1 / (0.08 / 0.0025))
    g = need.copy()
    for i in range(1, len(g)):
        g[i] = min(need[i], rel * g[i - 1] + (1 - rel) * need[i]) if need[i] >= g[i - 1] else need[i]
    gs = np.interp(np.arange(len(g) * b), np.arange(len(g)) * b + b / 2, g)[: len(x)]
    return x * gs

def norm(w):
    return re.sub(r"[^a-z0-9']", "", w.lower())

def find_split(words, phrase):
    p = [norm(t) for t in phrase.split()]
    toks = [norm(w["w"]) for w in words]
    for i in range(len(toks) - len(p) + 1):
        if toks[i:i + len(p)] == p:
            return i
    raise SystemExit(f"split phrase not found: {phrase!r}")

files = {f[:2]: f for f in os.listdir(voice_dir) if re.match(r"\d\d ", f)}
os.makedirs(OUT, exist_ok=True)

voice_parts, words_out, plan, music = [], [], [], []
t = 0.6
for sid, cfg in SECTIONS:
    f = files[sid]
    base = os.path.splitext(f)[0] if f.lower().endswith(".mp3") else f
    x = decode(os.path.join(voice_dir, f))
    gain = 10 ** ((-13 - speech_rms_db(x)) / 20)
    x = x * gain
    w = json.load(open(os.path.join(tx_dir, base + ".json")))
    last_end = w[-1]["e"]
    cuts = [0.0]
    events = []
    if cfg:
        i = find_split(w, cfg["split"])
        cuts.append((w[i - 1]["e"] + w[i]["s"]) / 2)
        events.append(("intro", cfg.get("intro", INTRO), None))
        for phrase, key, dur in cfg.get("breaks", []):
            j = find_split(w, phrase)
            cuts.append((w[j - 1]["e"] + w[j]["s"]) / 2)
            events.append(("swell", dur, key))
    cuts.append(min(len(x) / SR, last_end + 0.25))
    sec_start = t
    song_at = None
    for k in range(len(cuts) - 1):
        a, b = cuts[k], cuts[k + 1]
        voice_parts.append((t, x[int(a * SR):int(b * SR)]))
        for ww in w:
            if a <= ww["s"] < b:
                words_out.append({"w": ww["w"], "s": round(t + ww["s"] - a, 3), "e": round(t + ww["e"] - a, 3), "sec": sid})
        plan.append({"section": sid, "clip": k, "at": round(t, 3), "from": round(a, 3), "to": round(b, 3)})
        t += b - a
        if k < len(events):
            kind, dur, key = events[k]
            t += 0.3
            if kind == "intro":
                song_at = t
                music.append({"kind": "intro", "track": cfg["track"], "at": round(t, 3), "dur": dur})
            else:
                music.append({"kind": "swell", "key": key, "track": cfg["track"], "at": round(t, 3), "dur": dur})
            t += dur + 0.2
    if cfg:
        music.append({"kind": "bed", "track": cfg["track"], "at": round(song_at, 3), "until": round(t + TAIL, 3)})
        if "outro" in cfg:
            key, dur = cfg["outro"]
            t += 0.4
            music.append({"kind": "swell", "key": key, "track": cfg["track"], "at": round(t, 3), "dur": dur})
            t += dur
    elif sid != "01":
        music.append({"kind": "rollin", "section": sid, "at": round(sec_start, 3), "until": round(t + 0.5, 3)})
    if sid == "01":
        sting_at = t + 0.35
        music.append({"kind": "cold", "track": 2, "at": round(max(0.6, t - 2.2), 3), "until": round(sting_at, 3)})
        t = sting_at + STING + 0.35
    else:
        t += GAP
end_at = t
duration = end_at + END_CARD
music.append({"kind": "endcard", "track": 10, "at": round(end_at - 1.0, 3), "until": round(duration, 3)})

voice = np.zeros(int(duration * SR) + SR)
for at, seg in voice_parts:
    s = int(at * SR)
    fade = np.ones(len(seg)); n = min(240, len(seg) // 2)
    fade[:n] = np.linspace(0, 1, n); fade[-n:] = np.linspace(1, 0, n)
    voice[s:s + len(seg)] += seg * fade
voice = limit_fast(voice)
write_wav(os.path.join(OUT, "VOICE_PROGRAM.wav"), voice)

with open(os.path.join(HERE, "narration.words.js"), "w", encoding="utf-8") as fh:
    fh.write("// Generated by build_audio.py: Tony's section files on the program clock.\n")
    fh.write("export default " + json.dumps({"duration": round(duration, 3), "source": "VOICE_PROGRAM.wav", "words": words_out}) + ";\n")
json.dump({"duration": round(duration, 3), "sting": {"at": round(sting_at, 3), "dur": STING}, "endCard": round(end_at, 3),
           "voice": plan, "music": music}, open(os.path.join(HERE, "audio-plan.json"), "w"), indent=1)
print(f"program {duration:.1f}s ({duration/60:.1f} min), sting at {sting_at:.2f}, end card at {end_at:.2f}, {len(words_out)} words")
