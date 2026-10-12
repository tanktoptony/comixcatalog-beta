# Minimal-processing voice cleanup for recordings that already went through
# OBS noise suppression and a noise gate (Ep 002, 2026-10-09). Tony heard
# clean-voice.py's result as tinny, metallic and choppy: stacked spectral
# noise reduction and a second gate make that worse. This chain does only
# what the recording lacks, and keeps timing sample-exact.
#
#   python scripts/gentle-voice.py <in.wav> <out.wav>
#
# 1. Level up, low-cut at 70 Hz, a small low-mid warmth lift, no treble boost.
# 2. Gentle 2:1 compression and a peak limiter. No noise reduction, no gate.
# 3. Room-tone fill: OBS's gate leaves digital silence between words, which
#    sounds like the audio cutting out. A faint noise bed shaped like the
#    recording's own room tone runs under the whole track (about 55 dB under
#    speech), so the background never drops to nothing.
import sys
import numpy as np
import soundfile as sf
from pedalboard import Pedalboard, HighpassFilter, PeakFilter, Compressor, Limiter

src, dst = sys.argv[1], sys.argv[2]
x, sr = sf.read(src, dtype="float32")
if x.ndim > 1:
    x = x.mean(axis=1)
hop = int(0.02 * sr)
n = len(x) // hop

def speech_rms(a):
    fr = a[: n * hop].reshape(n, hop)
    lv = 20 * np.log10(np.sqrt(np.mean(fr ** 2, axis=1)) + 1e-9)
    loud = lv > np.percentile(lv, 60)
    return 20 * np.log10(np.sqrt(np.mean(fr[loud] ** 2)) + 1e-9)

x = x * 10 ** ((-20 - speech_rms(x)) / 20)
y = Pedalboard([
    HighpassFilter(70),
    PeakFilter(cutoff_frequency_hz=220, gain_db=1.5, q=0.8),   # a little body
    PeakFilter(cutoff_frequency_hz=2500, gain_db=-1.0, q=1.0), # soften harshness
    Compressor(threshold_db=-24, ratio=2, attack_ms=15, release_ms=200),
])(x, sr)
y = y * 10 ** ((-14 - speech_rms(y)) / 20)
y = Pedalboard([Limiter(threshold_db=-1.5, release_ms=100)])(y.astype(np.float32), sr)

# Room tone: spectrum of the quietest non-gated frames, as shaped noise.
lv = 20 * np.log10(np.sqrt(np.mean(y[: n * hop].reshape(n, hop) ** 2, axis=1)) + 1e-9)
quiet = np.where((lv > -90) & (lv < np.percentile(lv[lv > -90], 12)))[0]
seg = np.concatenate([y[k * hop:(k + 1) * hop] for k in quiet[:2000]]) if len(quiet) > 50 else np.random.randn(sr).astype(np.float32) * 1e-4
mag = np.abs(np.fft.rfft(seg[: 4096 * (len(seg) // 4096)].reshape(-1, 4096) * np.hanning(4096), axis=1)).mean(axis=0)
noise = np.random.default_rng(7).standard_normal(len(y)).astype(np.float32)
blocks = []
for k in range(0, len(noise), 4096):
    b = noise[k:k + 4096]
    B = np.fft.rfft(b, 4096) * mag
    blocks.append(np.fft.irfft(B, 4096)[: len(b)])
bed = np.concatenate(blocks).astype(np.float32)
bed = bed * 10 ** ((speech_rms(y) - 55 - 20 * np.log10(np.sqrt(np.mean(bed ** 2)) + 1e-9)) / 20)
y = y + bed
peak = np.abs(y).max()
if peak > 10 ** (-1 / 20):
    y = y * (10 ** (-1 / 20) / peak)
assert len(y) == len(x)
sf.write(dst, y.astype(np.float32), sr, subtype="PCM_16")
print(f"{dst}: speech {speech_rms(y):.1f} dB RMS, peak {20 * np.log10(np.abs(y).max()):.1f} dBFS")
