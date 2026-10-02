# Broadcast-style voice polish for a narration recording: cleaner low end,
# warm body, presence, air, firm compression, parallel saturation for grit,
# then loudness up to about -12 dB RMS in speech with a -1.2 dBFS ceiling (headroom for
# the music bed).
#
#   python scripts/polish-voice.py <in.wav> <out.wav> [limiter_drive_db]
import sys
import numpy as np
import soundfile as sf
from pedalboard import Pedalboard, HighpassFilter, LowShelfFilter, PeakFilter, HighShelfFilter, Compressor, Distortion, Limiter, Gain

src, dst = sys.argv[1], sys.argv[2]
DRIVE = float(sys.argv[3]) if len(sys.argv) > 3 else 7.0  # dB of limiting
CEILING = 10 ** (-1.2 / 20)
x, sr = sf.read(src, dtype="float32")
if x.ndim > 1:
    x = x.mean(axis=1)

tone = Pedalboard([
    HighpassFilter(85),
    PeakFilter(cutoff_frequency_hz=140, gain_db=2.5, q=0.9),   # chest
    PeakFilter(cutoff_frequency_hz=350, gain_db=-3.5, q=1.0),  # boxiness out
    PeakFilter(cutoff_frequency_hz=3200, gain_db=6.0, q=0.8),  # presence
    HighShelfFilter(cutoff_frequency_hz=8500, gain_db=5.0),    # air
    Compressor(threshold_db=-32, ratio=6, attack_ms=2, release_ms=50),
    Gain(12),
])
dry = tone(x, sr)
# Parallel saturation: a driven copy tucked under the clean one adds
# harmonics (the "radio" edge) without sounding distorted.
grit = Pedalboard([Distortion(drive_db=18), PeakFilter(cutoff_frequency_hz=2000, gain_db=3, q=0.7)])(dry, sr)
grit *= np.sqrt(np.mean(dry ** 2)) / (np.sqrt(np.mean(grit ** 2)) + 1e-9)
y = dry * 0.8 + grit * 0.28
rms = lambda a: 20 * np.log10(np.sqrt(np.mean(a ** 2)) + 1e-9)
y = y * 10 ** ((-16.0 - rms(y)) / 20)
y = Pedalboard([Compressor(threshold_db=-20, ratio=3, attack_ms=10, release_ms=120), Limiter(threshold_db=-DRIVE, release_ms=60)])(y.astype(np.float32), sr)
y = y * (CEILING / np.abs(y).max())
sf.write(dst, y, sr, subtype="PCM_16")
print(f"{dst}: rms {rms(y):.1f} dB, peak {20 * np.log10(np.abs(y).max()):.1f} dBFS, {len(y) / sr:.1f}s")
