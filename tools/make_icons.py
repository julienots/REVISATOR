"""Génère l'icône de l'app (livre ouvert + éclair) aux différentes densités Android."""
import os, sys
from PIL import Image, ImageDraw

root = sys.argv[1]
S = 1024
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
grad = Image.new("RGBA", (S, S))
gd = ImageDraw.Draw(grad)
for y in range(S):
    t = y / S
    gd.line([(0, y), (S, y)], fill=(int(79 + (124 - 79) * t), int(70 + (58 - 70) * t), int(229 + (237 - 229) * t), 255))
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([40, 40, S - 40, S - 40], radius=220, fill=255)
img.paste(grad, (0, 0), mask)
d = ImageDraw.Draw(img)
# Livre ouvert
d.polygon([(190, 330), (500, 390), (500, 800), (190, 740)], fill="white")
d.polygon([(834, 330), (524, 390), (524, 800), (834, 740)], fill="white")
for k in range(4):
    y = 470 + k * 70
    d.line([(240, y - 30 + k * 4), (450, y + k * 6)], fill=(200, 196, 250), width=18)
# Éclair
d.polygon([(640, 180), (520, 470), (610, 470), (540, 700), (760, 380), (660, 380), (740, 180)], fill=(251, 191, 36))
for name, px in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
    out = os.path.join(root, f"mipmap-{name}")
    os.makedirs(out, exist_ok=True)
    img.resize((px, px), Image.LANCZOS).save(os.path.join(out, "ic_launcher.png"))
img.resize((512, 512), Image.LANCZOS).save(os.path.join(root, "..", "icon-512.png"))
