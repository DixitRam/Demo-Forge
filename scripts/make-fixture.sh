#!/usr/bin/env bash
# Builds a synthetic DemoForge bundle with markers at exactly known normalised
# coordinates, so you can confirm by eye that each zoom lands dead centre on
# its marker. Output: fixture/recording.webm + fixture/demo.json
set -euo pipefail

OUT="${1:-fixture}"
mkdir -p "$OUT"
FONT=$(fc-match -f '%{file}' DejaVuSans)
W=1280; H=720

FILTER=$(python3 - <<'PY'
W, H = 1280, 720
marks = [("A", 0.30, 0.30), ("B", 0.70, 0.35), ("C", 0.35, 0.70), ("D", 0.65, 0.65)]
parts = []
for _, nx, ny in marks:
    cx, cy = nx * W, ny * H
    parts.append(f"drawbox=x={cx-60:.0f}:y={cy-40:.0f}:w=120:h=80:color=0x38bdf8@0.9:t=fill")
    parts.append(f"drawbox=x={cx-3:.0f}:y={cy-3:.0f}:w=6:h=6:color=0xff0000:t=fill")
print(",".join(parts))
PY
)

ffmpeg -y -f lavfi -i "color=c=0x0f172a:s=${W}x${H}:d=14:r=30" \
  -vf "$FILTER,drawtext=fontfile=$FONT:text='%{eif\\:t*1000\\:d} ms':x=20:y=20:fontsize=36:fontcolor=white" \
  -c:v libvpx-vp9 -b:v 1500k -pix_fmt yuv420p "$OUT/recording.webm" -loglevel error

python3 - "$OUT" <<'PY'
import json, sys
W, H = 1280, 720
def click(t, nx, ny, w, h, tag, text):
    return {"t": t, "type": "click", "xNorm": nx, "yNorm": ny,
            "el": {"tag": tag, "text": text,
                   "rect": {"x": nx*W - w/2, "y": ny*H - h/2, "w": w, "h": h}}}
rec = {
  "source": "extension",
  "createdAt": "2026-08-23T12:00:00.000Z",
  "video": {"durationMs": 14000, "width": W, "height": H, "mime": "video/webm;codecs=vp9"},
  "viewport": {"w": W, "h": H, "dpr": 1},
  "audioTrack": False,
  "events": [
    click(2000,  0.30, 0.30, 120, 80, "button", "Marker A"),
    click(5000,  0.70, 0.35, 120, 80, "button", "Marker B"),
    click(5120,  0.70, 0.35, 120, 80, "button", "Marker B"),   # merges with above
    {"t": 6500, "type": "scroll", "xNorm": 0.5, "yNorm": 0.4},
    click(8000,  0.35, 0.70, 120, 80, "button", "Marker C"),
    click(11000, 0.65, 0.65, 120, 80, "button", "Marker D"),
    click(13000, 0.50, 0.50, 1280, 700, "div", "Giant panel"),  # 97% -> skipped
  ],
}
json.dump(rec, open(f"{sys.argv[1]}/demo.json", "w"), indent=2)
PY

echo "wrote $OUT/recording.webm + $OUT/demo.json"
