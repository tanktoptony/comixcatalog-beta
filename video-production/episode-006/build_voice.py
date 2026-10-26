"""Episode 006 voice read: every SCRIPT.md section through Tony's HeyGen
voice clone, one file per section, plus one combined leveled WAV.

    python -I episode-006/build_voice.py [--only 01,short-1] [--dry]

Narration is every plain paragraph in a `## NN-name.wav` section: SHOW notes
(`>`), the channel-sting cue and other `[...]` notes are skipped, except the
`[OPTIONAL ...]` Avengers: Doomsday line, which gets its own file (02b) so the
edit can keep or drop it. SAY respells names for the voice; captions map them
back (DISPLAY).

Same API call and cache scheme as scripts/tts-heygen.py (one call per
paragraph, cached by text, so a rerun only pays for changed paragraphs).
Writes to Desktop/YouTube/episode-006-assets/audio/:
  NN - name.wav            raw TTS, 48 kHz mono, paragraphs joined with PARA_GAP
  NN - name.words.json     word timings for the timeline and captions
  NARRATION_COMBINED.wav   sections 01-12 in order, speech at -13 dBFS RMS,
                           plain look-ahead peak limiter at -1.5 dBFS
--dry prints the text that would be sent and its size without calling HeyGen.
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
LEAD, PARA_GAP, SECTION_GAP = 0.3, 0.75, 1.0
OUT = Path.home() / "Desktop" / "YouTube" / "episode-006-assets" / "audio"
CACHE = OUT / "tts"

# Written form -> what the voice should say.
SAY = [
    ("ComixCatalog", "Comix Catalog"),
    ("S.H.I.E.L.D.", "Shield"),
    ("Ribić", "Ribich"),
    ("Mignola", "Minyola"),
    ("A. Standard.", "Ay. Standard."),
    ("The card only rates A.", "The card only rates Ay."),
    ("That's A. Now B.", "That's Ay. Now B."),
]
# Spoken token sequences -> caption text.
DISPLAY = [
    (["comix", "catalog"], "ComixCatalog"), (["shield"], "S.H.I.E.L.D."), (["ribich"], "Ribić"),
    (["minyola"], "Mignola"), (["ay"], "A"),
]


def sections():
    text = (HERE / "SCRIPT.md").read_text(encoding="utf-8")
    out = []
    for block in re.split(r"^## ", text, flags=re.M)[1:]:
        title, _, body = block.partition("\n")
        m = re.match(r"((\d\d|short-\d)[\w-]*)\.wav\s*·\s*(.+)", title.strip())
        if not m:
            continue
        key, label = m.group(2), m.group(3).strip().strip('"')
        paras, optional = [], []
        for p in re.split(r"\n\s*\n", body.split("\n# Shorts")[0]):
            p = " ".join(l.strip() for l in p.strip().splitlines())
            if not p or p == "---" or p.startswith(">"):
                continue
            if p.startswith("[OPTIONAL"):
                optional.append(p.split(":", 1)[1].rstrip("]").strip())
            elif not p.startswith("["):
                paras.append(p)
        name = f"{key} - " + re.sub(r'[<>:"/\|?*,]', "", label.lower())
        out.append((key, name, paras))
        if optional:
            out.append((key + "b", f"{key}b - optional doomsday line", optional))
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
        for key, name, paras in todo:
            print(f"== {name}  ({sum(len(say(p)) for p in paras)} chars)")
            for p in paras:
                print("   " + say(p))
        print(f"total {sum(len(say(p)) for _, _, ps in todo for p in ps)} chars, {sum(len(ps) for _, _, ps in todo)} paragraphs")
        return
    CACHE.mkdir(parents=True, exist_ok=True)
    key = os.environ.get("HEYGEN_API_KEY") or (Path.home() / ".heygen-key").read_text().strip()
    built = {}
    for k, name, paras in todo:
        print(name)
        chunks, words, t = [np.zeros(int(LEAD * SR), np.float32)], [], LEAD
        for p in paras:
            x, ws = speak(say(p), key)
            words += [{"w": w["w"], "s": round(t + w["s"], 3), "e": round(t + w["e"], 3)} for w in ws]
            chunks += [x, np.zeros(int(PARA_GAP * SR), np.float32)]
            t += len(x) / SR + PARA_GAP
        audio = np.concatenate(chunks)
        sf.write(OUT / f"{name}.wav", audio, SR, subtype="PCM_16")
        (OUT / f"{name}.words.json").write_text(json.dumps({"duration": round(t, 3), "words": to_display(words)}, indent=0), encoding="utf-8")
        built[k] = audio
        print(f"  {t:.1f}s, {len(words)} words")
    main_keys = [k for k, _, _ in sections() if k.isdigit()]
    if all((OUT / f"{n}.wav").exists() for k, n, _ in sections() if k in main_keys):
        parts = []
        for k, n, _ in sections():
            if k in main_keys:
                x, _ = sf.read(OUT / f"{n}.wav", dtype="float32")
                parts += [x, np.zeros(int(SECTION_GAP * SR), np.float32)]
        full = np.concatenate(parts)
        full = limit(full * 10 ** ((-13 - speech_rms_db(full)) / 20))
        sf.write(OUT / "NARRATION_COMBINED.wav", full, SR, subtype="PCM_16")
        print(f"NARRATION_COMBINED.wav {len(full) / SR / 60:.1f} min, speech {speech_rms_db(full):.1f} dBFS RMS, peak {20 * np.log10(np.abs(full).max()):.1f} dBFS")


if __name__ == "__main__":
    main()
