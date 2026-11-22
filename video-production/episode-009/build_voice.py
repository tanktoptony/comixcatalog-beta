"""Episode 009 voice read (The Amory Wars Part 3, IKSSE:3): every SCRIPT.md
section through Tony's HeyGen voice clone, one file per section, plus the
three SHORTS.md Shorts. Copied from episode-008/build_voice.py (same chunking,
cache and leveling); only OUT and the respellings changed.

    .venv python -I episode-009/build_voice.py [--only 01,05,short-2] [--dry]
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
OUT = Path.home() / "Desktop" / "YouTube" / "episode-009-assets" / "audio" / "voice"
CACHE = OUT / "tts"

# Written form -> what the voice should say. Order matters (longest first).
SAY = [
    ("ComixCatalog", "Comix Catalog"),
    # Tony 11-21: plain American reads of names, never an accented one. "new-o ikkin".
    ("Newo Ikkin", "New-oh Ick-in"),
    ("Newo", "New-oh"),
    # Tony 11-22: "Wilhelm Ryan like a bad arnold impersonator... blue collar, chicago."
    # Every non-English-looking name gets a plain English spelling before the clone sees it.
    ("Wilhelm", "Willhelm"),
    ("Godder Damm", "Godder Dam"),
    ("Shylos", "Shy-loss"),
    ("Deftinwolf", "Deft-in-wolf"),
    ("Vielar", "Vee-lar"),
    ("Ambellina", "Am-bell-eena"),
    ("Sanchez", "San-chez"),
    ("Kuder", "Koo-der"),
    ("Prise", "Prize"),
    ("Luci", "Lucy"),
    ("IRO-bot", "I-Robot"),
    # Roman numerals: the voice would read "I" as the word I.
    ('"A Lot of Nothing I" through "A Lot of Nothing XI."', '"A Lot of Nothing One" through "A Lot of Nothing Eleven."'),
    ("21:13", "twenty-one thirteen"),
    ("C2E2", "C-two-E-two"),
    ("S.S. Neverender", "S S Neverender"),
]
# Spoken token sequences -> caption text.
DISPLAY = [
    (["comix", "catalog"], "ComixCatalog"),
    (["new-oh", "ick-in's"], "Newo Ikkin's"),
    (["new-oh", "ick-in"], "Newo Ikkin"),
    (["new-oh"], "Newo"),
    (["prize"], "Prise"),
    (["willhelm"], "Wilhelm"),
    (["godder", "dam"], "Godder Damm"),
    (["shy-loss"], "Shylos"),
    (["deft-in-wolf's"], "Deftinwolf's"),
    (["deft-in-wolf"], "Deftinwolf"),
    (["vee-lar"], "Vielar"),
    (["am-bell-eena"], "Ambellina"),
    (["san-chez"], "Sanchez"),
    (["koo-der"], "Kuder"),
    (["twenty-one", "thirteen"], "21:13"),
    (["c-two-e-two"], "C2E2"),
    (["s", "s", "neverender"], "S.S. Neverender"),
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


def shorts():
    """SHORTS.md: `## short-N · title (~40 s)` blocks; `>` lines are visual notes."""
    text = (HERE / "SHORTS.md").read_text(encoding="utf-8")
    out = []
    for block in re.split(r"^## ", text, flags=re.M)[1:]:
        title, _, body = block.partition("\n")
        m = re.match(r"(short-\d)\s*·\s*(.+?)\s*\(~?\d+ s\)", title.strip())
        if not m:
            continue
        paras = [" ".join(l.strip() for l in p.strip().splitlines()) for p in re.split(r"\n\s*\n", body)]
        paras = [p.replace("*", "") for p in paras if p and p != "---" and not p.startswith(">")]
        out.append((m.group(1), f"{m.group(1)} - " + re.sub(r'[<>:"/\|?*,]', "", m.group(2).lower()), paras))
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
    todo = [s for s in sections() + shorts() if not only or s[0] in only]
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
