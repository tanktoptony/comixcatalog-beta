"""Episode 009 Shorts: the three HeyGen Short reads (build_voice.py, from
SHORTS.md) laid end to end on one clock (4 s apart), so one timeline
(shorts-timeline.js) holds all three and ShortClip cuts each one out by beat.
Same shape as episode-008/build_shorts_audio.py, plus song clips from Tony's
samples per his SHORTS.md notes:

  short-1: a "21:13" clip before the last line ("And the title? ...").
  short-2: opens on the record's own "Hello Apollo, where should I begin?"
           (The Ring in Return) instead of the voice reading it.

    .venv python -I episode-009/build_shorts_audio.py

Writes public/episode-009/audio/SHORTS_VOICE.wav and SHORTS_MUSIC.wav,
episode-009/shorts.words.js and episode-009/shorts-plan.json.
"""
import json
import re
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I drops the script dir
from build_audio import CLIP_PAD, HERE, OUT, SAMPLES, SR, SRC, clip_audio, decode_stereo, deess, limit, speech_rms_db

GAP = 4.0
RING_LYRIC = (2.29, 4.30)  # "Hello Apollo, where should I begin?" inside the ring clip (sample 61.89-63.90)


def rms_db(x, pct=30):
    m = x.mean(1) if x.ndim == 2 else x
    f = m[: len(m) // 960 * 960].reshape(-1, 960)
    r = np.sqrt((f ** 2).mean(1) + 1e-12)
    loud = r[r > np.percentile(r, pct)]
    return 20 * np.log10(np.sqrt((loud ** 2).mean()))


def bare(w):
    return re.sub(r"[^a-z0-9']", "", w.lower())


def find(words, seq):
    seq = [bare(s) for s in seq.split()]
    for i in range(len(words) - len(seq) + 1):
        if [bare(w["w"]) for w in words[i:i + len(seq)]] == seq:
            return i
    raise SystemExit(f"not found: {seq}")


def stereo(x):
    return np.stack([x, x], 1) if x.ndim == 1 else x


def main():
    song = decode_stereo(SAMPLES)
    t, parts, words, plan, clips = 0.5, [], [], [], []
    for k in (1, 2, 3):
        [wav] = SRC.glob(f"short-{k} - *.wav")
        x, sr = sf.read(wav, dtype="float32")
        assert sr == SR, (wav, sr)
        ws = json.loads(wav.with_suffix(".words.json").read_text(encoding="utf-8"))["words"]
        x = deess(x)
        x = limit(x * 10 ** ((-13 - speech_rms_db(x)) / 20))
        x = stereo(x)
        if k == 1:
            # Clip goes in the pause before "And the title?"
            i = find(ws, "And the title")
            cut = (ws[i - 1]["e"] + ws[i]["s"]) / 2
            c, src = clip_audio(song, "2113")
            ins = np.concatenate([np.zeros((int(CLIP_PAD * SR), 2), np.float32), c, np.zeros((int(CLIP_PAD * SR), 2), np.float32)])
            shift = len(ins) / SR
            clips.append({"short": 1, "song": "21:13", "at": round(t + cut + CLIP_PAD, 3), "dur": round(len(c) / SR, 3), "sample": src})
            x = np.concatenate([x[: int(cut * SR)], ins, x[int(cut * SR):]])
            ws = [w if w["s"] < cut else {**w, "s": w["s"] + shift, "e": w["e"] + shift} for w in ws]
        if k == 2:
            # The record says the first line; the voice picks up at "That's the first spoken line".
            i = find(ws, "That's the first spoken line")
            cut = (ws[i - 1]["e"] + ws[i]["s"]) / 2
            c, src = clip_audio(song, "ring")
            lead = len(c) / SR + 0.25
            clips.append({"short": 2, "song": "The Ring in Return", "at": round(t, 3), "dur": round(len(c) / SR, 3), "sample": src})
            sung = ws[:i]
            n = sum(len(w["w"]) for w in sung)
            a, b = RING_LYRIC
            pos, lyric = a, []
            for w in sung:
                d = (b - a) * len(w["w"]) / n
                lyric.append({"w": w["w"], "s": round(pos, 3), "e": round(pos + d * 0.9, 3)})
                pos += d
            x = np.concatenate([c, np.zeros((int(0.25 * SR), 2), np.float32), x[int(cut * SR):]])
            ws = lyric + [{**w, "s": w["s"] - cut + lead, "e": w["e"] - cut + lead} for w in ws[i:]]
        parts.append((t, x))
        words += [{"w": w["w"], "s": round(t + w["s"], 3), "e": round(t + w["e"], 3), "short": k} for w in ws]
        end = t + ws[-1]["e"] + 0.4
        plan.append({"short": k, "file": wav.name, "at": round(t, 3), "end": round(end, 3)})
        t = t + len(x) / SR + GAP
    dur = round(t, 3)
    voice = np.zeros((int(dur * SR) + SR, 2), np.float32)
    for at, x in parts:
        i = int(round(at * SR))
        voice[i:i + len(x)] += x
    # Song clips peak above the voice: one limiter gain for both channels (from their max).
    peak = np.abs(voice).max(1)
    voice = voice * (limit(peak) / np.maximum(peak, 1e-9))[:, None]
    sf.write(OUT / "SHORTS_VOICE.wav", voice, SR, subtype="PCM_16")

    bed, _ = sf.read(OUT / "MUSIC_BED_DOUBLE_DRIFT.wav", dtype="float32")
    bed = bed * 10 ** ((-27 - rms_db(bed)) / 20)
    music = np.zeros((len(voice), 2), np.float32)
    for p in plan:
        a, b = int((p["at"] - 0.4) * SR), int((p["end"] + 2.6) * SR)
        seg = bed[: b - a]
        tt = np.arange(len(seg)) / SR
        g = np.clip(np.minimum(tt / 0.4, (len(seg) / SR - tt) / 1.2), 0, 1)
        # Duck the bed under each song clip (the clip is music already).
        for c in clips:
            if c["short"] == p["short"]:
                ca, cb = c["at"] - (p["at"] - 0.4), c["at"] - (p["at"] - 0.4) + c["dur"]
                g = g * np.clip(np.maximum((ca - tt) / 0.3, (tt - cb) / 0.5), 0.05, 1)
        music[a:a + len(seg)] += seg * g[:, None]
    sf.write(OUT / "SHORTS_MUSIC.wav", music, SR, subtype="PCM_16")

    with open(HERE / "shorts.words.js", "w", encoding="utf-8") as fh:
        fh.write("// Generated by episode-009/build_shorts_audio.py. Do not edit by hand.\n")
        fh.write("export default " + json.dumps({"duration": dur, "words": words}, separators=(",", ":"), ensure_ascii=False) + ";\n")
    (HERE / "shorts-plan.json").write_text(json.dumps({"duration": dur, "shorts": plan, "clips": clips}, indent=1) + "\n", encoding="utf-8")
    for p in plan:
        print(f"Short {p['short']}: {p['end'] - p['at']:.1f}s (+2.6 end card)")
    for c in clips:
        print(f"  clip short-{c['short']} {c['song']} at {c['at']}s, {c['dur']}s, sample {c['sample']}")
    print(f"voice speech {speech_rms_db(voice.mean(1)):.1f} dBFS RMS, peak {20 * np.log10(np.abs(voice).max()):.1f} dBFS")


if __name__ == "__main__":
    main()
