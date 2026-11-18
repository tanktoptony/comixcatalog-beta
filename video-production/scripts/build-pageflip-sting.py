"""Sound for the page-flip channel sting (shared/components/pageFlipSting.jsx).

    .venv python -I scripts/build-pageflip-sting.py <episode-id>

One real page-flip transient per leaf, placed where that leaf passes upright,
a sharper flip as the last page lands, and a soft low thump as the splash
fills the frame, with the closing bars of an orchestral intro underneath:
its final hit lands with the thump and its ring-out runs past the picture
(Tony 2026-11-18: retire Funkorama, keep music).

Flip recordings: "Book Flip Sounds" by Voltiment555, OpenGameArt, CC0
(https://opengameart.org/content/book-flip-sounds), unpacked to
Desktop/YouTube/sfx/voltiment-bookflip/. Music: "Production Theme Intro
[Epic Orchestra]" by nene, OpenGameArt, CC0
(https://opengameart.org/content/production-theme-intro-epic-orchestra),
in Desktop/YouTube/sfx/nene-production-intro/. Writes
public/<episode-id>/audio/STING_PAGEFLIP.wav (48 kHz mono, OUT_DUR s: the
picture is 3.0 s, the music tail fades under the next line).
"""
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

SR, FPS, DUR, OUT_DUR = 48000, 30, 3.0, 4.6
MUSIC = Path.home() / "Desktop" / "YouTube" / "sfx" / "nene-production-intro" / "Production_Intro_Theme.wav"
MUSIC_HIT = 9.04  # final orchestral hit in that file (spectral-flux onset)
MUSIC_IN = 0.9    # fade the build in over the first flips
HERE = Path(__file__).resolve().parent.parent
SRC = Path.home() / "Desktop" / "YouTube" / "sfx" / "voltiment-bookflip"
# Must match LEAVES / PUSH / SPLASH_IN in pageFlipSting.jsx.
LEAVES = [(0, 15), (10, 13), (18, 11), (25, 10), (31, 9), (36, 8), (41, 8)]
LAST_LAND = LEAVES[-1][0] + LEAVES[-1][1]
SPLASH_AT = LAST_LAND + 16
FILES = [1, 2, 4, 6, 8, 10, 11]  # one recording per leaf
LAND_FILE = 12


def load(n):
    x, sr = sf.read(SRC / f"BookFlip{n}.wav", dtype="float32")
    x = x.mean(1) if x.ndim > 1 else x
    return np.interp(np.arange(0, len(x) * SR / sr) * sr / SR, np.arange(len(x)), x).astype(np.float32)


def snap(x, length):
    """The loudest part of a flip: from 30 ms before its onset, `length` s long, faded."""
    h = SR // 200
    env = np.sqrt(np.convolve(x ** 2, np.ones(h) / h, "same"))
    onset = int(np.argmax(env > env.max() * 0.25))
    s = max(0, onset - int(0.03 * SR))
    y = x[s:s + int(length * SR)].copy()
    y -= y.mean()
    fi, fo = int(0.004 * SR), min(len(y) // 2, int(0.12 * SR))
    y[:fi] *= np.linspace(0, 1, fi)
    y[-fo:] *= np.linspace(1, 0, fo) ** 2
    return y / (np.abs(y).max() + 1e-9), onset - s


def thump():
    t = np.arange(int(0.6 * SR)) / SR
    f = 42 + 48 * np.exp(-t / 0.05)  # pitch falls 90 -> 42 Hz
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16)
    air = np.random.default_rng(8).standard_normal(len(t)) * np.exp(-t / 0.03)
    air = np.convolve(air, np.ones(48) / 48, "same")  # dull it
    y = body + 0.25 * air
    y[: int(0.003 * SR)] *= np.linspace(0, 1, int(0.003 * SR))
    return (y / np.abs(y).max()).astype(np.float32)


def music(hit_at):
    x, sr = sf.read(MUSIC, dtype="float32")
    x = x.mean(1) if x.ndim > 1 else x
    x = np.interp(np.arange(0, len(x) * SR / sr) * sr / SR, np.arange(len(x)), x).astype(np.float32)
    s = int((MUSIC_HIT - hit_at) * SR)
    y = x[s:s + int(OUT_DUR * SR)].copy()
    fi = int(MUSIC_IN * SR)
    y[:fi] *= np.linspace(0, 1, fi) ** 2
    fo = int(0.9 * SR)
    y[-fo:] *= np.linspace(1, 0, fo)
    return y / (np.abs(y).max() + 1e-9)


def place(out, y, at_s, gain_db, align=0):
    i = int(at_s * SR) - align
    y = y[max(0, -i):]
    i = max(0, i)
    n = min(len(y), len(out) - i)
    out[i:i + n] += y[:n] * 10 ** (gain_db / 20)


def main():
    ep = sys.argv[1]
    out = np.zeros(int(OUT_DUR * SR), np.float32)
    hit = (SPLASH_AT - 3) / FPS
    place(out, music(hit), 0, -6)
    for k, ((s, ln), n) in enumerate(zip(LEAVES, FILES)):
        y, a = snap(load(n), 0.12 + ln * 0.018)  # faster leaves, shorter flips
        place(out, y, (s + ln * 0.45) / FPS, -11 + k * 0.6, a)
    y, a = snap(load(LAND_FILE), 0.22)
    place(out, y, (LAST_LAND - 1) / FPS, -7, a)
    place(out, thump(), hit, -9)
    peak = np.abs(out).max()
    out *= 10 ** (-3 / 20) / peak if peak > 10 ** (-3 / 20) else 1
    dst = HERE / "public" / ep / "audio" / "STING_PAGEFLIP.wav"
    sf.write(dst, out, SR, subtype="PCM_16")
    h = SR // 10
    r = 20 * np.log10(np.sqrt((out[: len(out) // h * h].reshape(-1, h) ** 2).mean(1)) + 1e-9)
    print(f"{dst} peak {20 * np.log10(np.abs(out).max()):.1f} dBFS, loudest 100 ms {r.max():.1f} dBFS RMS")


if __name__ == "__main__":
    main()
