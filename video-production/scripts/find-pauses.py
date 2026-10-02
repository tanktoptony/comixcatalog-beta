# Find long pauses in a narration recording and print cut ranges that
# shorten each one to KEEP seconds (for narration.edit.js `pauses`).
#
#   python scripts/find-pauses.py <audio.wav> [start] [min_pause] [keep]
#
# Silence is 50 ms windows below -44 dBFS. Each cut leaves KEEP/2 seconds of
# the pause on either side, so word tails and breaths in stay intact.
import sys
import numpy as np
import soundfile as sf

path = sys.argv[1]
start = float(sys.argv[2]) if len(sys.argv) > 2 else 0.0
min_pause = float(sys.argv[3]) if len(sys.argv) > 3 else 0.6
keep = float(sys.argv[4]) if len(sys.argv) > 4 else 0.4
x, sr = sf.read(path, dtype="float32")
if x.ndim > 1:
    x = x.mean(axis=1)
hop = int(0.05 * sr)
n = len(x) // hop
db = 20 * np.log10(np.sqrt(np.mean(x[: n * hop].reshape(n, hop) ** 2, axis=1)) + 1e-9)
quiet = db < -44
cuts = []
i = 0
while i < n:
    if quiet[i]:
        j = i
        while j < n and quiet[j]:
            j += 1
        a, b = i * 0.05, j * 0.05
        if a >= start and j < n and b - a > min_pause:
            cuts.append((round(a + keep / 2, 2), round(b - keep / 2, 2)))
        i = j
    else:
        i += 1
print(f"// {len(cuts)} pauses over {min_pause}s, {sum(b - a for a, b in cuts):.1f}s removed")
print("[" + ", ".join(f"[{a}, {b}]" for a, b in cuts) + "]")
