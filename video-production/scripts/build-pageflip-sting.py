"""Sound for the page-flip channel sting (shared/components/pageFlipSting.jsx).

    .venv python -I scripts/build-pageflip-sting.py <episode-id>

One real page-flip transient per leaf, placed where that leaf passes upright,
a sharper flip as the last page lands, and a soft low thump as the splash
fills the frame, with the closing bars of an orchestral intro underneath:
its final hit lands as the badge lifts and its ring-out runs past the picture
(Tony 2026-11-18: retire Funkorama, keep music). v2 (slower): the music comes
in after the track's earlier accent (file 6.0-6.4 s, louder than the final
hit), so the first slow page turn is paper only, and a soft noise riser sits
under the camera push.

Flip recordings: "Book Flip Sounds" by Voltiment555, OpenGameArt, CC0
(https://opengameart.org/content/book-flip-sounds), unpacked to
Desktop/YouTube/sfx/voltiment-bookflip/. Music: "Production Theme Intro
[Epic Orchestra]" by nene, OpenGameArt, CC0
(https://opengameart.org/content/production-theme-intro-epic-orchestra),
in Desktop/YouTube/sfx/nene-production-intro/. Writes
public/<episode-id>/audio/STING_PAGEFLIP.wav (48 kHz mono, OUT_DUR s: the
picture slot is 4.8 s, the music tail fades under the next line).
"""
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

SR, FPS, OUT_DUR = 48000, 30, 5.6
MUSIC = Path.home() / "Desktop" / "YouTube" / "sfx" / "nene-production-intro" / "Production_Intro_Theme.wav"
MUSIC_HIT = 9.04  # final orchestral hit in that file (spectral-flux onset)
MUSIC_FROM = 6.45  # just after the track's earlier accent
MUSIC_IN = 0.45    # fade-in
HERE = Path(__file__).resolve().parent.parent
SRC = Path.home() / "Desktop" / "YouTube" / "sfx" / "voltiment-bookflip"
# Must match LEAVES / PUSH / HIT in pageFlipSting.jsx.
LEAVES = [(6, 24), (26, 18), (40, 15), (52, 12), (61, 11), (69, 10), (76, 10)]
LAST_LAND = LEAVES[-1][0] + LEAVES[-1][1]  # 86
PUSH = (LAST_LAND - 2, LAST_LAND + 26)
HIT = PUSH[1]  # 112
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
    s = int(MUSIC_FROM * SR)
    y = x[s:s + int((OUT_DUR - (hit_at - (MUSIC_HIT - MUSIC_FROM))) * SR)].copy()
    fi = int(MUSIC_IN * SR)
    y[:fi] *= np.linspace(0, 1, fi) ** 2
    fo = int(0.9 * SR)
    y[-fo:] *= np.linspace(1, 0, fo)
    return y / (np.abs(y).max() + 1e-9)


def riser(length):
    """Soft air that brightens and swells into the hit."""
    n = int(length * SR)
    w = np.random.default_rng(3).standard_normal(n).astype(np.float32)
    out, lp, t = np.zeros(n, np.float32), 0.0, np.arange(n) / n
    a = 0.004 + 0.12 * t ** 2  # one-pole low-pass opening up
    for i in range(n):
        lp += a[i] * (w[i] - lp)
        out[i] = lp
    out *= t ** 2.2
    out[-int(0.01 * SR):] *= np.linspace(1, 0, int(0.01 * SR))
    return out / (np.abs(out).max() + 1e-9)


def place(out, y, at_s, gain_db, align=0):
    i = int(at_s * SR) - align
    y = y[max(0, -i):]
    i = max(0, i)
    n = min(len(y), len(out) - i)
    out[i:i + n] += y[:n] * 10 ** (gain_db / 20)


def main():
    ep = sys.argv[1]
    out = np.zeros(int(OUT_DUR * SR), np.float32)
    hit = (HIT - 1) / FPS
    place(out, music(hit), hit - (MUSIC_HIT - MUSIC_FROM), -6)
    for k, ((s, ln), n) in enumerate(zip(LEAVES, FILES)):
        y, a = snap(load(n), 0.12 + ln * 0.018)  # faster leaves, shorter flips
        place(out, y, (s + ln * 0.45) / FPS, -9 if k < 2 else -11 + (k - 2) * 0.6, a)
    place(out, riser((HIT - PUSH[0]) / FPS), PUSH[0] / FPS, -24)
    # Faint room air under the paper-only opening, so the sting never sits on
    # digital silence while the bed is ducked; it fades as the music arrives.
    room = np.convolve(np.random.default_rng(5).standard_normal(int(2.0 * SR)), np.ones(64) / 64, "same").astype(np.float32)
    env = np.minimum(1, np.arange(len(room)) / (0.08 * SR)) * np.clip((2.0 - np.arange(len(room)) / SR) / 0.8, 0, 1)
    place(out, room * env / (np.abs(room).max() + 1e-9), 0, -40)
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
