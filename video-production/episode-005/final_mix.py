"""Swap the final soundtrack onto a rendered episode without re-rendering.

    .venv python -I episode-005/final_mix.py <rendered mp4> <out mp4>

Remotion's mix is a plain sum of the stems, so this rebuilds the same sum
offline (VOICE_PROGRAM + MUSIC_PROGRAM + the sting, as timeline.js plays
them), checks it for clipping and digital-zero runs, and muxes it onto the
video with -c:v copy. Use after build_music.py has the album in it.
"""
import json, os, subprocess, sys, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FF = os.path.join(ROOT, "node_modules", "@remotion", "compositor-win32-x64-msvc", "ffmpeg.exe")
AUD = os.path.join(ROOT, "public", "episode-005", "audio")
SR = 48000
video, out = sys.argv[1], sys.argv[2]
plan = json.load(open(os.path.join(HERE, "audio-plan.json")))

def decode(path, start=0.0, dur=None):
    args = [FF, "-v", "error", "-ss", str(start), "-i", path] + (["-t", str(dur)] if dur else []) + ["-ac", "2", "-ar", str(SR), "-c:a", "pcm_s16le", "-f", "wav", "-"]
    wav = subprocess.run(args, check=True, capture_output=True).stdout
    d = wav.find(b"data")
    a = np.frombuffer(wav[d + 8:], dtype=np.int16).astype(np.float32) / 32768
    return a[: len(a) // 2 * 2].reshape(-1, 2)

voice = decode(os.path.join(AUD, "VOICE_PROGRAM.wav"))
music = decode(os.path.join(AUD, "MUSIC_PROGRAM.wav"))
n = int(plan["duration"] * SR)
mix = np.zeros((n, 2), dtype=np.float32)
mix[: min(n, len(voice))] += voice[:n]
fo = np.clip((n - np.arange(min(n, len(music)))) / (2 * SR), 0, 1)[:, None]  # music fadeOut: 2 s
mix[: min(n, len(music))] += music[:n] * fo
s = plan["sting"]
sting = decode(os.path.join(AUD, "MUSIC_STING.mp3"), 7.1, s["dur"])
t = np.arange(len(sting)) / SR
sting *= np.clip((s["dur"] - t) / 0.4, 0, 1)[:, None]
a = int(s["at"] * SR)
mix[a: a + len(sting)] += sting

peak = np.abs(mix).max()
mono = np.abs(mix).max(1)
blk = int(0.03 * SR)
zero = (mono[: len(mono) // blk * blk].reshape(-1, blk).max(1) == 0)
zt = [round(i * 0.03, 2) for i in np.flatnonzero(zero)]
runs = []
for z in zt:
    if runs and z - runs[-1][1] < 0.031: runs[-1][1] = z
    else: runs.append([z, z])
print(f"peak {20*np.log10(peak+1e-9):.1f} dBFS; digital-zero runs (>=30 ms): {[(r[0], round(r[1]-r[0]+0.03,2)) for r in runs][:20]}")
if peak > 1: mix *= 0.98 / peak

tmp = os.path.join(AUD, "MIX_FINAL.wav")
with wave.open(tmp, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(mix, -1, 1) * 32767).astype("<i2").tobytes())
subprocess.run([FF, "-v", "error", "-y", "-i", video, "-i", tmp, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "320k", "-shortest", out], check=True)
print("wrote", out)
