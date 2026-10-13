# Ep 003 voice: the least processing that works. Tony rejected the Ep 002
# cleanup chain (clean-voice.py) as tinny, metallic and choppy, and asked for
# level plus a peak limiter only. No EQ, no compression, no noise reduction,
# no gate. The raw OBS take (2026-10-09 20:06) has no gate dropouts and no
# in-speech suppression holes, so there is nothing else to repair.
#
#   python episode-003/voice.py level  <raw.wav> <out.wav>
#   python episode-003/voice.py render <leveled.wav> <narration.edit.js> <out.wav>
#
# level:  mono mix, one fixed gain so speech sits at -15 dBFS RMS, then a
#         -1.5 dBFS peak limiter. Sample-exact timing, so word times from the
#         raw transcript still line up.
# render: plays the edit list (kept takes, shortened pauses) into one file in
#         edited time, with 8 ms fades at every splice so joins never click.
import json
import re
import sys

import numpy as np
import soundfile as sf
from scipy.ndimage import minimum_filter1d

TARGET = -13.0  # speech RMS, dBFS. Ep 002 ran -11.5, but that limits ~2 s of syllables by up to 6 dB here; -13 keeps the limiter light and the music bed comes down instead. Remotion spreads a mono file across both stereo channels at -3 dB, so the file runs hotter than the mix it lands in.


def speech_rms(a, sr):
    hop = int(0.02 * sr)
    n = len(a) // hop
    lv = 20 * np.log10(np.sqrt(np.mean(a[: n * hop].reshape(n, hop) ** 2, axis=1)) + 1e-9)
    loud = lv > np.percentile(lv, 60)
    return 20 * np.log10(np.sqrt(np.mean(a[: n * hop].reshape(n, hop)[loud] ** 2)) + 1e-9)


def peak_limit(x, sr, ceiling_db=-1.5, attack=0.005, release=0.08):
    # A plain look-ahead peak limiter. pedalboard's Limiter is JUCE's, which
    # runs a -10 dB 4:1 compressor ahead of the clipper and adds makeup gain:
    # that is compression, not what Tony asked for. Here the gain is 1.0
    # everywhere except a short smooth dip around each peak over the ceiling.
    c = 10 ** (ceiling_db / 20)
    need = np.minimum(1.0, c / (np.abs(x) + 1e-12))
    a, r = int(attack * sr), int(release * sr)
    # Per-sample: the deepest dip any nearby peak asks for, ramped in over
    # `attack` before it and out over `release` after it.
    g = minimum_filter1d(need, size=a + r + 1, origin=(r - a) // 2)
    k = np.hanning(2 * a + 1)
    k /= k.sum()
    g = np.minimum(np.convolve(g, k, mode="same"), need)
    return (x * g).astype(np.float32), int(np.sum(need < 1))


def level(src, dst):
    x, sr = sf.read(src, dtype="float32")
    if x.ndim > 1:
        x = x.mean(axis=1)
    gain = TARGET - speech_rms(x, sr)
    y, over = peak_limit(x * 10 ** (gain / 20), sr)
    assert len(y) == len(x)
    sf.write(dst, y, sr, subtype="PCM_16")
    print(f"gain {gain:+.1f} dB, {over} samples limited, speech {speech_rms(y, sr):.1f} dBFS, peak {20 * np.log10(np.abs(y).max()):.1f} dBFS")


def render(src, edit_js, dst):
    x, sr = sf.read(src, dtype="float32")
    text = open(edit_js, encoding="utf8").read()
    edit = json.loads(re.sub(r";\s*$", "", re.sub(r"^[\s\S]*?export default ", "", text)))
    total = len(x) / sr
    # Same keep logic as shared/narrationEdit.js applyEdit.
    cuts = sorted([*edit.get("cuts", []), *edit.get("pauses", [])])
    keep, cursor = [], edit.get("start", 0)
    for a, b in cuts:
        if a > cursor + 0.05:
            keep.append((cursor, a))
        cursor = max(cursor, b)
    if cursor < total:
        keep.append((cursor, total))
    fade = int(0.008 * sr)
    ramp = np.linspace(0, 1, fade, dtype=np.float32)
    parts = []
    for a, b in keep:
        seg = x[int(round(a * sr)): int(round(b * sr))].copy()
        if len(seg) > 2 * fade:
            seg[:fade] *= ramp
            seg[-fade:] *= ramp[::-1]
        parts.append(seg)
    y = np.concatenate(parts)
    sf.write(dst, y, sr, subtype="PCM_16")
    print(f"{len(keep)} clips, {len(y) / sr:.2f} s")


if __name__ == "__main__":
    {"level": level, "render": render}[sys.argv[1]](*sys.argv[2:])
