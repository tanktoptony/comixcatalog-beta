# Clean-up for Tony's own narration recordings (not the HeyGen clone, which
# polish-voice.py treats with deliberate grit). Keeps timing sample-exact, so
# a transcript of the raw file still lines up with the cleaned one.
#
#   python scripts/clean-voice.py <in.wav> <out.wav>
#
# Chain: hum notches, high-pass, light stationary noise reduction (profile
# taken from the quietest non-silent frames), mud cut, presence and air,
# a gentle de-ess, two-stage compression, speech up to about -14 dB RMS
# (Episode 001's polished voice level), peaks limited to -1.5 dBFS.
import sys
import numpy as np
import soundfile as sf
import noisereduce as nr
from pedalboard import Pedalboard, HighpassFilter, PeakFilter, HighShelfFilter, Compressor, Limiter, NoiseGate

src, dst = sys.argv[1], sys.argv[2]
x, sr = sf.read(src, dtype="float32")
if x.ndim > 1:
    x = x.mean(axis=1)

hop = int(0.02 * sr)
n = len(x) // hop
db = 20 * np.log10(np.sqrt(np.mean(x[: n * hop].reshape(n, hop) ** 2, axis=1)) + 1e-9)

def speech_rms(a):
    fr = a[: n * hop].reshape(n, hop)
    lv = 20 * np.log10(np.sqrt(np.mean(fr ** 2, axis=1)) + 1e-9)
    loud = lv > np.percentile(lv, 60)
    return 20 * np.log10(np.sqrt(np.mean(fr[loud] ** 2)) + 1e-9)

# Bring speech near working level first so filters and the noise estimate
# operate on sensible numbers.
x = x * 10 ** ((-24 - speech_rms(x)) / 20)

pre = Pedalboard([
    PeakFilter(cutoff_frequency_hz=60, gain_db=-12, q=12),
    PeakFilter(cutoff_frequency_hz=120, gain_db=-8, q=12),
    PeakFilter(cutoff_frequency_hz=180, gain_db=-6, q=12),
    HighpassFilter(80),
])
x = pre(x, sr)

# Noise profile: quiet but not gated frames (room tone between words).
quiet = np.where((db > -88) & (db < np.percentile(db[db > -88], 15)))[0]
if len(quiet) > 50:
    noise = np.concatenate([x[k * hop:(k + 1) * hop] for k in quiet[:3000]])
    x = nr.reduce_noise(y=x, sr=sr, y_noise=noise, stationary=True, prop_decrease=0.6, n_fft=2048)
x = x.astype(np.float32)

tone = Pedalboard([
    PeakFilter(cutoff_frequency_hz=110, gain_db=1.5, q=0.9),    # chest
    PeakFilter(cutoff_frequency_hz=320, gain_db=-3.0, q=1.1),   # mud out
    PeakFilter(cutoff_frequency_hz=3300, gain_db=3.0, q=0.9),   # presence
    PeakFilter(cutoff_frequency_hz=6800, gain_db=-2.5, q=3.0),  # gentle de-ess
    HighShelfFilter(cutoff_frequency_hz=10000, gain_db=2.0),    # air
    Compressor(threshold_db=-30, ratio=3, attack_ms=8, release_ms=90),
])
y = tone(x, sr)
y = y * 10 ** ((-16 - speech_rms(y)) / 20)
y = Pedalboard([Compressor(threshold_db=-20, ratio=2.5, attack_ms=12, release_ms=140), Limiter(threshold_db=-4, release_ms=80)])(y.astype(np.float32), sr)
y = y * 10 ** ((-14 - speech_rms(y)) / 20)
# Compression lifts breaths and room tone; a soft 2:1 expander well under
# speech level puts back most of the raw recording's speech-to-gap distance
# without chopping word tails.
y = Pedalboard([NoiseGate(threshold_db=-27, ratio=2.2, attack_ms=3, release_ms=180)])(y.astype(np.float32), sr)
y = y * 10 ** ((-14 - speech_rms(y)) / 20)
ceiling = 10 ** (-1.5 / 20)
if np.abs(y).max() > ceiling:
    y = Pedalboard([Limiter(threshold_db=-1.5, release_ms=60)])(y.astype(np.float32), sr)
    y = np.clip(y, -ceiling, ceiling)
assert len(y) == len(x), "timing changed"
sf.write(dst, y, sr, subtype="PCM_16")
print(f"{dst}: speech {speech_rms(y):.1f} dB RMS, peak {20 * np.log10(np.abs(y).max()):.1f} dBFS, {len(y) / sr:.1f}s")
