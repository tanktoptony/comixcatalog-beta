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
INTRO_DB, BED_DB, ROLLIN_DB = -17.0, -26.0, -27.0
RAMP = 0.8
TITLES = ["second stage turbine blade", "time consumer", "devil in jersey city", "everything evil", "delirium trigger",
          "hearshot kid disaster", "33", "junesong provision", "neverender", "god send conspirator"]
# Where swells start in the source song (seconds). None = detect (see below).
# "skip" = Tony's capture doesn't include that part (the songs' endings, the hidden track): keep the bed there.
SWELL_SRC = {"ee_piano": "skip", "gsc_piano": "skip", "irobot": "skip"}
# Where each track's chapter clip starts in the source file (seconds). None = first onset.
# Track 1: Tony's capture is quiet until the build at about 0:23.
CLIP_SRC = {1: 23.0, 10: 5.0}

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

songs, report = {}, []
for n in range(1, 11):
    p = find_album(n)
    if p:
        x = decode(p)
        songs[n] = (x, 10 ** (-rms_db(x) / 20))  # gain to a 0 dBFS-RMS reference
        report.append(f"track {n}: {os.path.basename(p)} ({len(x)/SR:.0f}s)")
    else:
        report.append(f"track {n}: MISSING (slot keeps the Rollin bed)")

def detect(key):
    if SWELL_SRC.get(key) is not None: return SWELL_SRC[key]
    if key == "ee_piano" and 4 in songs:
        x = songs[4][0]; return max(0, len(x) / SR - 25)
    if key in ("gsc_piano", "irobot") and 10 in songs:
        x = songs[10][0]; e = env_db(x)
        best, run, start = (0, 0), 0, 0
        for i, q in enumerate(e < -55):  # longest quiet run = the gap before the hidden track
            if q:
                if run == 0: start = i
                run += 1
                if run > best[1]: best = (start, run)
            else: run = 0
        gap_start, gap_len = best[0] * 0.5, best[1] * 0.5
        if key == "irobot": return gap_start + gap_len + 0.2 if gap_len > 10 else len(x) / SR - 60
        return max(0, gap_start - 30) if gap_len > 10 else 380.0
    return 0.0

def onset(x, thr=-35):
    e = env_db(x, 0.05)
    return int(np.argmax(e > thr)) * 0.05

# Album clips: each one 5 s or less, full level, short fades. Nothing from the
# album plays under the voice.
clips = []
for m in plan["music"]:
    k = m["kind"]
    if k == "intro" and m["track"] in songs:
        clips.append((m["track"], CLIP_SRC.get(m["track"]) if CLIP_SRC.get(m["track"]) is not None else onset(songs[m["track"]][0]), m["at"], m["dur"], INTRO_DB))
    elif k == "swell" and m["track"] in songs:
        if SWELL_SRC.get(m["key"]) == "skip": report.append(f"swell {m['key']}: not captured, bed only"); continue
        src = detect(m["key"]); report.append(f"swell {m['key']}: source {src:.1f}s")
        clips.append((m["track"], src, m["at"], m["dur"], INTRO_DB - 1))
    elif k == "cold" and 2 in songs:
        clips.append((2, onset(songs[2][0]), m["at"], m["until"] - m["at"], BED_DB + 6))
def limit(seg, ceiling_db=-1.5):
    # Block look-ahead peak limiter (2.5 ms blocks, 80 ms release); nothing below the ceiling is touched.
    c = 10 ** (ceiling_db / 20); blk = int(0.0025 * SR)
    m = np.abs(seg).max(1); nb = int(np.ceil(len(m) / blk))
    pk = np.pad(m, (0, nb * blk - len(m))).reshape(nb, blk).max(1)
    need = np.minimum(1.0, c / (pk + 1e-9)); need = np.minimum(need, np.concatenate([need[1:], [1.0]]))
    rel = np.exp(-1 / 32); g = need.copy()
    for i in range(1, nb): g[i] = need[i] if need[i] < g[i - 1] else min(need[i], rel * g[i - 1] + (1 - rel) * need[i])
    return seg * np.interp(np.arange(len(m)), np.arange(nb) * blk + blk / 2, g)[:, None]

CLIP_RMS_DB = -17.0
for track, src, at, L, db in clips:
    x, _ = songs[track]
    seg = x[int(src * SR): int((src + L) * SR)].copy()
    if not len(seg): continue
    seg *= 10 ** ((min(db, CLIP_RMS_DB) - 20 * np.log10(np.sqrt((seg ** 2).mean()) + 1e-9)) / 20)
    seg = limit(seg)
    tt = np.arange(len(seg)) / SR
    seg *= np.clip(np.minimum(tt / 0.08, (len(seg) / SR - tt) / 0.6), 0, 1)[:, None]
    a0 = int(at * SR); out[a0:a0 + len(seg)] += seg

# Rollin at 5: one continuous bed, dipping under each album clip.
rollin = decode(os.path.join(AUD, "MUSIC_BED_FULL.wav"))
rg = 10 ** ((ROLLIN_DB - rms_db(rollin)) / 20)
r = next(m for m in plan["music"] if m["kind"] == "rollin")
L = r["until"] - r["at"]
dips = [(at - r["at"], at - r["at"] + Ld) for _, _, at, Ld, _ in clips] + [(plan["sting"]["at"] - r["at"], plan["sting"]["at"] - r["at"] + plan["sting"]["dur"])]
def rollin_gain(t):
    g = np.clip(np.minimum(t / 2.0, (L - t) / 4.0), 0, 1) * rg
    for a, b in dips:
        g = g * (1 - 0.85 * np.clip(np.minimum((t - a + 0.4) / 0.4, (b + 0.6 - t) / 0.6), 0, 1))
    return g
def loop_xfade(x, need, xf=SR):
    out_ = x.copy()
    ramp = np.linspace(0, 1, xf, dtype=np.float32)[:, None]
    while len(out_) < need:
        out_[-xf:] = out_[-xf:] * (1 - ramp) + x[:xf] * ramp
        out_ = np.concatenate([out_, x[xf:]])
    return out_
place(loop_xfade(rollin, int((L + 1) * SR)), 0, r["at"], L, rollin_gain)

write(os.path.join(AUD, os.environ.get("MUSIC_OUT", "MUSIC_PROGRAM.wav")), out)
if not os.environ.get("MUSIC_OUT"):
    v = decode(os.path.join(AUD, "VOICE_PROGRAM.wav"))
    write(os.path.join(AUD, "VOICE_PROGRAM.wav"), v)
peak = 20 * np.log10(np.abs(out).max() + 1e-9)
print("\n".join(report))
print(f"MUSIC_PROGRAM.wav {len(out)/SR:.1f}s, peak {peak:.1f} dBFS; voice stereo rewritten")
