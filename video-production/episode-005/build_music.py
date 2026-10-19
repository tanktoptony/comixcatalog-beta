"""Episode 005 music: MUSIC_PROGRAM.wav from audio-plan.json.

    .venv python -I episode-005/build_music.py [album dir]

- Album excerpts (Tony's own copy of The Second Stage Turbine Blade): each
  track chapter opens at full level, then the same song keeps playing under
  the voice. Swells (the two pianos, IRO-Bot) cut to their spot in the song.
- Rollin at 5 (MUSIC_BED_FULL.wav, Kevin MacLeod, CC BY) under 02, 03, 14, 15.
- Levels: speech is -13 dBFS RMS; intros sit at -16, beds at -26 (about 13 dB
  under the voice), measured per track so loud and quiet songs match.
Also rewrites VOICE_PROGRAM.wav as stereo so Remotion treats both stems alike.
Without an album dir the album slots stay silent (preview only).
"""
import json, os, re, subprocess, sys, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FF = os.path.join(ROOT, "node_modules", "@remotion", "compositor-win32-x64-msvc", "ffmpeg.exe")
AUD = os.path.join(ROOT, "public", "episode-005", "audio")
SR = 48000
INTRO_DB, BED_DB, ROLLIN_DB = -16.0, -26.0, -27.0
RAMP = 0.8
TITLES = ["second stage turbine blade", "time consumer", "devil in jersey city", "everything evil", "delirium trigger",
          "hearshot kid disaster", "33", "junesong provision", "neverender", "god send conspirator"]
# Where swells start in the source song (seconds). None = detect (see below).
SWELL_SRC = {"ee_piano": None, "gsc_piano": None, "irobot": None}

plan = json.load(open(os.path.join(HERE, "audio-plan.json")))
album_dir = sys.argv[1] if len(sys.argv) > 1 else None

def decode(path):
    wav = subprocess.run([FF, "-v", "error", "-i", path, "-ac", "2", "-ar", str(SR), "-c:a", "pcm_s16le", "-f", "wav", "-"],
                         check=True, capture_output=True).stdout
    d = wav.find(b"data")
    a = np.frombuffer(wav[d + 8:], dtype=np.int16).astype(np.float32) / 32768
    return a[: len(a) // 2 * 2].reshape(-1, 2)

def write(path, x):
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())

def rms_db(x):
    m = x.mean(1) if x.ndim == 2 else x
    f = m[: len(m) // 4800 * 4800].reshape(-1, 4800)
    r = np.sqrt((f ** 2).mean(1) + 1e-12)
    loud = r[r > np.percentile(r, 30)]
    return 20 * np.log10(np.sqrt((loud ** 2).mean()) + 1e-12)

def env_db(x, win=0.5):
    m = np.abs(x).max(1)
    n = int(win * SR)
    f = m[: len(m) // n * n].reshape(-1, n)
    return 20 * np.log10(np.sqrt((f ** 2).mean(1)) + 1e-9)

def find_album(n):
    if not album_dir or not os.path.isdir(album_dir): return None
    for f in sorted(os.listdir(album_dir)):
        name = re.sub(r"[^a-z0-9 ]", " ", f.lower())
        name = re.sub(r"\s+", " ", name)
        num = re.match(r"\s*0?(\d+)\b", name)
        if TITLES[n - 1] in name and (n != 1 or "time" not in name):
            return os.path.join(album_dir, f)
        if num and int(num.group(1)) == n and not any(t in name for i, t in enumerate(TITLES) if i != n - 1 and len(t) > 3):
            return os.path.join(album_dir, f)
    return None

dur = plan["duration"]
out = np.zeros((int(dur * SR) + SR, 2), dtype=np.float32)

def place(src, src_from, at, length, gain_fn):
    s0, n = int(src_from * SR), int(length * SR)
    seg = src[s0:s0 + n]
    if len(seg) == 0: return
    t = np.arange(len(seg)) / SR
    g = gain_fn(t).astype(np.float32)[:, None]
    a = int(at * SR)
    out[a:a + len(seg)] += seg * g

def fades(length, fi=0.05, fo=0.6):
    return lambda t: np.clip(np.minimum(t / max(fi, 1e-3), (length - t) / max(fo, 1e-3)), 0, 1)

# Rollin at 5: one continuous source clock across all its windows.
rollin = decode(os.path.join(AUD, "MUSIC_BED_FULL.wav"))
rg = 10 ** ((ROLLIN_DB - rms_db(rollin)) / 20)
for m in plan["music"]:
    if m["kind"] == "rollin":
        L = m["until"] - m["at"]
        f = fades(L, 1.0, 1.5)
        place(rollin, m["at"] % (len(rollin) / SR - L - 1), m["at"], L, lambda t, f=f: f(t) * rg)

songs, report = {}, []
for n in range(1, 11):
    p = find_album(n)
    if p:
        x = decode(p)
        songs[n] = (x, 10 ** (-rms_db(x) / 20))  # gain to 0 dBFS-RMS reference
        report.append(f"track {n}: {os.path.basename(p)} ({len(x)/SR:.0f}s)")
    else:
        report.append(f"track {n}: MISSING")

def detect(key):
    if SWELL_SRC.get(key) is not None: return SWELL_SRC[key]
    if key == "ee_piano" and 4 in songs:
        x = songs[4][0]; return max(0, len(x) / SR - 30)
    if key in ("gsc_piano", "irobot") and 10 in songs:
        x = songs[10][0]; e = env_db(x)
        quiet = e < -55
        # longest quiet run = the gap before the hidden track
        best, run, start = (0, 0), 0, 0
        for i, q in enumerate(quiet):
            if q:
                if run == 0: start = i
                run += 1
                if run > best[1]: best = (start, run)
            else: run = 0
        gap_start, gap_len = best[0] * 0.5, best[1] * 0.5
        if key == "irobot": return gap_start + gap_len + 0.2 if gap_len > 10 else len(x) / SR - 60
        return max(0, gap_start - 40) if gap_len > 10 else 380.0
    return 0.0

def onset(x, thr=-35):
    e = env_db(x, 0.05)
    i = int(np.argmax(e > thr))
    return i * 0.05

for m in plan["music"]:
    k = m["kind"]
    if k in ("intro", "bed") and m["track"] in songs:
        x, g0 = songs[m["track"]]
        start = onset(x)
        intro = next(i for i in plan["music"] if i["kind"] == "intro" and i["track"] == m["track"])
        if k == "bed":
            # one clock from the intro start; full for the intro, then down to the bed
            L = m["until"] - m["at"]
            swells = [s for s in plan["music"] if s["kind"] == "swell" and s["track"] == m["track"]]
            stop = min([s["at"] for s in swells] + [m["until"]]) - m["at"]
            hi, lo = 10 ** (INTRO_DB / 20) * g0, 10 ** (BED_DB / 20) * g0
            d = intro["dur"]
            def gain(t, d=d, hi=hi, lo=lo, stop=stop):
                g = np.where(t < d, hi, np.where(t < d + RAMP, hi + (lo - hi) * (t - d) / RAMP, lo))
                g = g * np.clip(t / 0.05, 0, 1)
                return g * np.clip((stop - t) / 1.2, 0, 1)
            place(x, start, m["at"], stop, gain)
    elif k == "swell" and m["track"] in songs:
        x, g0 = songs[m["track"]]
        src = detect(m["key"])
        L = m["dur"] + 1.5
        hi, lo = 10 ** ((INTRO_DB - 1) / 20) * g0, 10 ** (BED_DB / 20) * g0
        place(x, src, m["at"] - 0.3, L + 0.3, lambda t, hi=hi, lo=lo, L=L: np.clip(t / 0.4, 0, 1) * np.where(t < L - 1.6, hi, hi * np.clip((L - t) / 1.6, 0, 1)))
        report.append(f"swell {m['key']}: source {src:.1f}s")
    elif k == "cold" and 2 in songs:
        x, g0 = songs[2]
        L = m["until"] - m["at"]
        place(x, onset(x), m["at"], L, lambda t, L=L: np.clip(t / 0.3, 0, 1) * 10 ** ((BED_DB + 4) / 20) * g0 * (t < L - 0.02))
    elif k == "endcard" and 10 in songs:
        x, g0 = songs[10]
        L = m["until"] - m["at"]
        place(x, detect("gsc_piano"), m["at"], L, lambda t, L=L: np.clip(t / 1.0, 0, 1) * np.clip((L - t) / 3, 0, 1) * 10 ** ((INTRO_DB - 2) / 20) * g0)

write(os.path.join(AUD, "MUSIC_PROGRAM.wav"), out)
v = decode(os.path.join(AUD, "VOICE_PROGRAM.wav"))
write(os.path.join(AUD, "VOICE_PROGRAM.wav"), v)
peak = 20 * np.log10(np.abs(out).max() + 1e-9)
print("\n".join(report))
print(f"MUSIC_PROGRAM.wav {len(out)/SR:.1f}s, peak {peak:.1f} dBFS; voice stereo rewritten")
