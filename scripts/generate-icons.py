#!/usr/bin/env python3
"""Regenerate the Kublau app icons: a white K on a rounded brand-blue square.

    python3 scripts/generate-icons.py           # favicon only
    python3 scripts/generate-icons.py --all     # favicon + the PWA icon set

Everything is drawn at 1024px and downscaled with LANCZOS so the small sizes
stay crisp. Needs Pillow (`pip install pillow`) and a system Arial Bold; the
app's font stack resolves to Helvetica/Arial on every platform we ship to, so
the mark matches the product typography.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BRAND_BLUE = (0x30, 0x6D, 0xF6, 255)
WHITE = (255, 255, 255, 255)
FONT_PATH = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

# Fractions of the canvas, so every size looks identical.
CORNER_RADIUS = 0.22
GLYPH_HEIGHT = 0.60
# Maskable icons are cropped to a circle by Android, so the mark has to sit
# inside the safe zone (80% of the canvas) and the blue must bleed to the edge.
MASKABLE_GLYPH_HEIGHT = 0.46

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "public" / "icons"


def draw(size: int, *, radius: float = CORNER_RADIUS, glyph: float = GLYPH_HEIGHT) -> Image.Image:
    """One icon: rounded blue square with a centred white K."""
    canvas = 1024
    im = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, canvas - 1, canvas - 1], radius=int(canvas * radius), fill=BRAND_BLUE)

    font = ImageFont.truetype(FONT_PATH, int(canvas * glyph))
    # Centre on the glyph's ink box, not on its metrics: a K carries side
    # bearings and no descender, so metric centring sits visibly low.
    left, top, right, bottom = d.textbbox((0, 0), "K", font=font)
    d.text(((canvas - (right - left)) / 2 - left, (canvas - (bottom - top)) / 2 - top), "K", font=font, fill=WHITE)
    return im.resize((size, size), Image.LANCZOS)


def write_favicon() -> None:
    """`public/favicon.ico` — 16/32/48/64 in one file for every browser chrome."""
    sizes = [16, 32, 48, 64]
    base = draw(256)
    out = ROOT / "public" / "favicon.ico"
    base.save(out, format="ICO", sizes=[(s, s) for s in sizes])
    print(f"favicon.ico ({', '.join(f'{s}x{s}' for s in sizes)})")


def write_pwa_icons() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    for name, size in (("icon-64.png", 64), ("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)):
        draw(size).save(ICONS / name)
        print(f"icons/{name}")
    # Full-bleed square + smaller glyph: Android crops this one to a circle.
    draw(512, radius=0.0, glyph=MASKABLE_GLYPH_HEIGHT).save(ICONS / "icon-512-maskable.png")
    print("icons/icon-512-maskable.png")


if __name__ == "__main__":
    write_favicon()
    if "--all" in sys.argv:
        write_pwa_icons()
