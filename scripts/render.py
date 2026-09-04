#!/usr/bin/env python3
"""Render scripts/og-image.html to a JPEG social share card.

    python3 scripts/render.py                       # -> apps/docs/public/lucet-og.jpg
    python3 scripts/render.py path/to/out.jpg
    python3 scripts/render.py --scale 1             # 1200x630 instead of 2400x1260

The page is laid out at 1200x630 CSS pixels and shot at deviceScaleFactor=2,
so the file is 2400x1260 -- the size the card is actually served at, and the
size og:image:width / og:image:height already declare on the docs pages.

FONTS ARE THE HOST'S. og-image.html asks for the system stack and loads no
webfont, by design, which means the faces come from whatever machine runs
this. A Mac gives SF Pro and SF Mono, which is what the card was drawn for;
a bare Linux container gives DejaVu and the card will look wider and softer.
This script says which family it actually got, so a surprising render is
explained rather than mysterious.

Playwright is not a dependency of this repo. If it is missing, this prints
the two commands that install it and the manual fallback, and exits 3.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / "scripts" / "og-image.html"
DEFAULT_OUT = ROOT / "apps" / "docs" / "public" / "lucet-og.jpg"

WIDTH, HEIGHT = 1200, 630
QUALITY = 92

MISSING_PLAYWRIGHT = f"""
Playwright is not installed, so nothing was rendered.

Install it:

    pip install playwright
    playwright install chromium

then run this script again.

Or skip it entirely -- the page needs no server and no assets:

    open {PAGE}

and screenshot the card at {WIDTH}x{HEIGHT} (use a 2x display, or set the
browser zoom to 200% and crop, to land on {WIDTH * 2}x{HEIGHT * 2}).
"""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("out", nargs="?", default=str(DEFAULT_OUT), help="output .jpg path")
    ap.add_argument("--scale", type=int, default=2, help="deviceScaleFactor (default 2)")
    ap.add_argument("--quality", type=int, default=QUALITY, help="JPEG quality 0-100")
    args = ap.parse_args()

    if not PAGE.exists():
        print(f"missing page: {PAGE}", file=sys.stderr)
        return 2

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print(MISSING_PLAYWRIGHT, file=sys.stderr)
        return 3

    out = Path(args.out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(
            viewport={"width": WIDTH, "height": HEIGHT},
            device_scale_factor=args.scale,
        )
        page.goto(PAGE.as_uri())
        # No webfonts to wait on, but fonts.ready still settles the
        # system faces before the shot.
        page.evaluate("() => document.fonts.ready")

        family = page.evaluate(
            "() => { const e = document.createElement('span');"
            "e.style.font = '16px system-ui, -apple-system, sans-serif';"
            "document.body.appendChild(e);"
            "const f = getComputedStyle(e).fontFamily; e.remove(); return f }"
        )

        page.screenshot(path=str(out), type="jpeg", quality=args.quality)
        browser.close()

    kb = out.stat().st_size / 1024
    print(f"wrote {out}")
    print(f"  {WIDTH * args.scale}x{HEIGHT * args.scale}, jpeg q{args.quality}, {kb:.0f} KB")
    print(f"  system-ui resolved to: {family}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
