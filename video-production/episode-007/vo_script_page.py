"""Render VO_SCRIPT.md (the handoff reconciled with the filmed takes) as a read-aloud page.

VO paragraphs are big and numbered; filmed on-camera takes are dimmed so Tony
skips them; reworded lines (`~ `) get a gold bar. Output:
Desktop/YouTube/episode-007-raw/EP007-VO-SCRIPT.html

    python episode-007/vo_script_page.py
"""

import html
import re
from pathlib import Path

SRC = Path(__file__).parent / "VO_SCRIPT.md"
OUT = Path.home() / "Desktop" / "YouTube" / "episode-007-raw" / "EP007-VO-SCRIPT.html"


def inline(text):
    return re.sub(r"\*(.+?)\*", r"<i>\1</i>", html.escape(text))


def main():
    lines = SRC.read_text(encoding="utf-8").splitlines()
    body, in_cam, started, n = [], False, False, 0
    for line in lines:
        s = line.strip()
        if s.startswith("# CUT"):
            break
        m = re.match(r"^##\s+(\S+\.wav)\s+·\s+(.+)$", s)
        if m:
            started = True
            body.append(f'<h2><span class="file">{m.group(1)}</span>{inline(m.group(2))}</h2>')
            continue
        if s == "# THREE STANDALONE SHORTS":
            body.append('<h1 class="shorts">Shorts (one file each)</h1>')
            continue
        if not started or not s or s == "---" or s.startswith(">"):
            continue
        if s.startswith("[CAM"):
            in_cam = True
            body.append(f'<div class="cam"><div class="tag">ON CAMERA, already filmed, skip ({html.escape(s[5:-1])})</div>')
            continue
        if s == "[END CAM]":
            in_cam = False
            body.append("</div>")
            continue
        if s == "[VO]":
            continue
        if in_cam:
            body.append(f"<p>{inline(s)}</p>")
        else:
            n += 1
            cls = "vo changed" if s.startswith("~ ") else "vo"
            body.append(f'<p class="{cls}"><span class="n">{n}</span>{inline(s.lstrip("~ "))}</p>')

    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ep 007 VO Script</title>
<style>
:root {{ --bg:#0d1117; --ink:#f2efe6; --dim:#6b7280; --gold:#e8b931; --card:#161b22; }}
body {{ margin:0; background:var(--bg); color:var(--ink); font:28px/1.5 Georgia, serif; }}
main {{ max-width:900px; margin:0 auto; padding:32px 24px 200px; }}
header {{ font:16px/1.4 system-ui, sans-serif; color:var(--dim); border-bottom:1px solid #30363d; padding-bottom:16px; }}
header b {{ color:var(--gold); }}
h1.shorts {{ font:700 22px system-ui, sans-serif; color:var(--gold); margin-top:96px; text-transform:uppercase; letter-spacing:.08em; }}
h2 {{ font:700 30px system-ui, sans-serif; color:var(--gold); margin:72px 0 16px; }}
h2 .file {{ display:block; font:500 15px ui-monospace, monospace; color:var(--dim); margin-bottom:4px; }}
p.vo {{ margin:0 0 22px; position:relative; }}
p.vo .n {{ position:absolute; left:-48px; top:6px; font:600 14px ui-monospace, monospace; color:var(--dim); }}
p.vo.changed {{ border-left:4px solid var(--gold); padding-left:12px; }}
.cam {{ background:var(--card); border-left:4px solid #30363d; padding:12px 18px; margin:0 0 22px; color:var(--dim); font-size:18px; }}
.cam p {{ margin:0 0 6px; }}
.cam .tag {{ font:700 13px system-ui, sans-serif; text-transform:uppercase; letter-spacing:.06em; margin-bottom:8px; }}
@media (max-width:700px) {{ body {{ font-size:22px; }} p.vo .n {{ position:static; margin-right:8px; }} }}
</style></head><body><main>
<header><b>Episode 007 · Every Generation Has Its Own Batman · voiceover</b><br>
Read the big text. Gray boxes are your filmed takes (your actual words), skip them. Gold bar = line reworded so it flows out of a filmed take. One file per section is ideal (01-cold-open.wav ...), but one long recording is fine too. On a flub, pause and restart the sentence; the last clean take wins.</header>
{chr(10).join(body)}
</main></body></html>
"""
    OUT.write_text(page, encoding="utf-8")
    print(OUT, n, "VO paragraphs")


if __name__ == "__main__":
    main()
