"""Episode 008 voice read: every SCRIPT.md section through Tony's HeyGen
voice clone, one file per section, plus one combined leveled WAV.

    .venv python -I episode-008/build_voice.py [--only 01,05] [--dry]

Tony didn't record this episode (2026-11-17): the whole script, ON CAMERA
lines included, is his clone. Narration is every plain paragraph under a
`### NN-name` heading; `**...**` lines (ON CAMERA / VO cues, SHOW notes, the
sting cue) and `---` are skipped, and *italics* lose their asterisks.

Tony's script has many one-line paragraphs, so consecutive paragraphs are
sent together (blank line between them, up to CHUNK chars per call) instead of
one call each: one call per line gave choppy, flat reads with a fixed gap.
SAY respells names and years for the voice (feedback: years as words);
DISPLAY maps the spoken tokens back for captions.

Same API and cache scheme as episode-006/build_voice.py (cached by text, a
rerun only pays for changed chunks). Writes Desktop/YouTube/episode-008-assets/audio/:
  NN - name.wav            raw TTS, 48 kHz mono, chunks joined with CHUNK_GAP
  NN - name.words.json     word timings for the timeline and captions
  NARRATION_COMBINED.wav   all sections in order (review copy), speech at
                           -13 dBFS RMS, plain look-ahead peak limiter at -1.5
"""
import hashlib
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
VOICE_ID = "7064c951e1c34ae78a765287db940f45"  # Tony's private clone (same as tts-heygen.py)
MODEL = "eleven_v4"
SR = 48000
LEAD, CHUNK_GAP, SECTION_GAP = 0.3, 0.55, 1.0
CHUNK = 700
OUT = Path.home() / "Desktop" / "YouTube" / "episode-008-assets" / "audio"
CACHE = OUT / "tts"

# Written form -> what the voice should say. Order matters (longest first).
SAY = [
    ("ComixCatalog", "Comix Catalog"),
    ("ComicVine", "Comic Vine"),
    ("Tynion", "Tie-nin"),          # /ˈtaɪnən/ (Wikipedia IPA; SKTCHD: "Tie-Nin")
    ("C2E2", "C-two-E-two"),
    ("Angoulême", "Ahn-goo-lem"),
    ("Bellaire", "Bell-air"),
    ("AndWorld", "And World"),
    ("2021", "twenty twenty-one"), ("2022", "twenty twenty-two"), ("2023", "twenty twenty-three"),
    ("2024", "twenty twenty-four"), ("2026", "twenty twenty-six"),
]
# Spoken token sequences -> caption text.
DISPLAY = [
    (["comix", "catalog"], "ComixCatalog"), (["comic", "vine"], "ComicVine"), (["tie-nin"], "Tynion"),
    (["c-two-e-two"], "C2E2"), (["ahn-goo-lem"], "Angoulême"), (["bell-air"], "Bellaire"), (["and", "world"], "AndWorld"),
    (["twenty", "twenty-one"], "2021"), (["twenty", "twenty-two"], "2022"), (["twenty", "twenty-three"], "2023"),
    (["twenty", "twenty-four"], "2024"), (["twenty", "twenty-six"], "2026"),
]


def sections():
    text = (HERE / "SCRIPT.md").read_text(encoding="utf-8")
    out = []
    for block in re.split(r"^### ", text, flags=re.M)[1:]:
        title, _, body = block.partition("\n")
        m = re.match(r"(\d\d)-([\w-]+)", title.strip())
        if not m:
            continue
        paras = []
        for p in re.split(r"\n\s*\n", body):
            p = " ".join(l.strip() for l in p.strip().splitlines())
            if not p or p == "---" or p.startswith("**"):
                continue
            paras.append(p.replace("*", ""))
        out.append((m.group(1), f"{m.group(1)} - {m.group(2).replace('-', ' ')}", paras))
    return out


def chunks(paras):
    out, cur = [], []
    for p in paras:
        if cur and len("\n\n".join(cur + [p])) > CHUNK:
            out.append("\n\n".join(cur))
            cur = []
        cur.append(p)
    if cur:
        out.append("\n\n".join(cur))
    return out


def say(p):
    for a, b in SAY:
        p = p.replace(a, b)
    return p


def bare(w):
    return re.sub(r"[.,!?;:\"']+$", "", w).lower()


def to_display(words):
    out, i = [], 0
    while i < len(words):
        for seq, disp in DISPLAY:
            n = len(seq)
            if [bare(w["w"]) for w in words[i:i + n]] == seq:
                tail = re.search(r"[.,!?;:]+$", words[i + n - 1]["w"])
                out.append({"w": disp + (tail.group(0) if tail else ""), "s": words[i]["s"], "e": words[i + n - 1]["e"]})
                i += n
                break
        else:
            out.append(words[i])
            i += 1
    return out


def speak(text, key):
    h = hashlib.sha1(f"{VOICE_ID}|{MODEL}|{text}".encode()).hexdigest()[:16]
    meta, audio = CACHE / f"{h}.json", CACHE / f"{h}.mp3"
    if not meta.exists():
        body = json.dumps({"text": text, "voice_id": VOICE_ID, "engine": "elevenlabs", "settings": {"model_id": MODEL}}).encode()
        req = urllib.request.Request("https://api.heygen.com/v3/voices/speech", body, {"X-Api-Key": key, "Content-Type": "application/json"})
        data = json.load(urllib.request.urlopen(req, timeout=300))["data"]
        urllib.request.urlretrieve(data["audio_url"], audio)
        meta.write_text(json.dumps(data))
        print(f"  generated {h} ({len(text)} chars, {data['duration']:.1f}s)")
    data = json.loads(meta.read_text())
    x, sr = sf.read(audio, dtype="float32")
    if x.ndim > 1:
        x = x.mean(axis=1)
    if sr != SR:
        x = np.interp(np.arange(0, len(x) * SR / sr) * sr / SR, np.arange(len(x)), x).astype(np.float32)
    words = [{"w": w["word"], "s": w["start"], "e": w["end"]} for w in data.get("word_timestamps", [])
             if not re.match(r"^(<.*>|\[.*\])$", w["word"].strip())]
    return x, words


def speech_rms_db(x):
    frames = x[: len(x) // 960 * 960].reshape(-1, 960)
    r = np.sqrt((frames ** 2).mean(1) + 1e-12)
    loud = r[r > np.percentile(r, 40)]
    return 20 * np.log10(np.sqrt((loud ** 2).mean()))


def limit(x, ceiling_db=-1.5):
    # Plain look-ahead peak limiter (Ep 005's block version): 2.5 ms blocks,
    # 80 ms release, no compression below the ceiling.
    c = 10 ** (ceiling_db / 20)
    b = int(0.0025 * SR)
    peaks = np.abs(np.concatenate([x, np.zeros(b - len(x) % b if len(x) % b else 0)])).reshape(-1, b).max(1)
    need = np.minimum(1.0, c / (peaks + 1e-9))
    need = np.minimum(need, np.concatenate([need[1:], [1.0]]))
    rel = np.exp(-1 / (0.08 / 0.0025))
    g = need.copy()
    for i in range(1, len(g)):
        g[i] = min(need[i], rel * g[i - 1] + (1 - rel) * need[i]) if need[i] >= g[i - 1] else need[i]
    gs = np.interp(np.arange(len(g) * b), np.arange(len(g)) * b + b / 2, g)[: len(x)]
    return x * gs


def main():
    args = sys.argv[1:]
    only = set(args[args.index("--only") + 1].split(",")) if "--only" in args else None
    dry = "--dry" in args
    todo = [s for s in sections() if not only or s[0] in only]
    if dry:
        total = 0
        for key, name, paras in todo:
            cs = [say(c) for c in chunks(paras)]
            total += sum(len(c) for c in cs)
            print(f"== {name}  ({sum(len(c) for c in cs)} chars, {len(cs)} calls)")
            for c in cs:
                print("   | " + c.replace("\n\n", " / "))
        print(f"total {total} chars")
        return
    CACHE.mkdir(parents=True, exist_ok=True)
    key = os.environ.get("HEYGEN_API_KEY") or (Path.home() / ".heygen-key").read_text().strip()
    for k, name, paras in todo:
        print(name)
        parts, words, t = [np.zeros(int(LEAD * SR), np.float32)], [], LEAD
        for c in chunks(paras):
            x, ws = speak(say(c), key)
            words += [{"w": w["w"], "s": round(t + w["s"], 3), "e": round(t + w["e"], 3)} for w in ws]
            parts += [x, np.zeros(int(CHUNK_GAP * SR), np.float32)]
            t += len(x) / SR + CHUNK_GAP
        sf.write(OUT / f"{name}.wav", np.concatenate(parts), SR, subtype="PCM_16")
        (OUT / f"{name}.words.json").write_text(json.dumps({"duration": round(t, 3), "words": to_display(words)}, indent=0), encoding="utf-8")
        print(f"  {t:.1f}s, {len(words)} words")
    allsec = sections()
    if all((OUT / f"{n}.wav").exists() for _, n, _ in allsec):
        parts = []
        for _, n, _ in allsec:
            x, _ = sf.read(OUT / f"{n}.wav", dtype="float32")
            parts += [x, np.zeros(int(SECTION_GAP * SR), np.float32)]
        full = np.concatenate(parts)
        full = limit(full * 10 ** ((-13 - speech_rms_db(full)) / 20))
        sf.write(OUT / "NARRATION_COMBINED.wav", full, SR, subtype="PCM_16")
        print(f"NARRATION_COMBINED.wav {len(full) / SR / 60:.1f} min, speech {speech_rms_db(full):.1f} dBFS RMS, peak {20 * np.log10(np.abs(full).max()):.1f} dBFS")


if __name__ == "__main__":
    main()
