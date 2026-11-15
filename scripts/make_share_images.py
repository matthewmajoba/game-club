"""Make the link-preview image (og-image.png) and app icons from the site's look.
Run: python scripts/make_share_images.py   (needs Pillow; uses Windows' Impact font)"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "img"
IMPACT = "C:/Windows/Fonts/impact.ttf"
VERDANA_B = "C:/Windows/Fonts/verdanab.ttf"


def tile(src, w, h, scale):
    t = Image.open(src).convert("RGB")
    t = t.resize((int(t.width * scale), int(t.height * scale)), Image.LANCZOS)
    out = Image.new("RGB", (w, h))
    for y in range(0, h, t.height):
        for x in range(0, w, t.width):
            out.paste(t, (x, y))
    return out


def vgrad(w, h, stops):
    g = Image.new("RGB", (1, h))
    for y in range(h):
        p = y / max(1, h - 1)
        for i in range(len(stops) - 1):
            (p0, c0), (p1, c1) = stops[i], stops[i + 1]
            if p0 <= p <= p1:
                k = (p - p0) / (p1 - p0 or 1)
                g.putpixel((0, y), tuple(int(c0[j] + (c1[j] - c0[j]) * k) for j in range(3)))
                break
    return g.resize((w, h))


def wordart(text, size):
    """Fiery gradient Impact text with stacked 3D shadow + glow, skewed like the site logo."""
    font = ImageFont.truetype(IMPACT, size)
    l, t, r, b = font.getbbox(text)
    w, h = r - l + 60, b - t + 60
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).text((30 - l, 30 - t), text, font=font, fill=255)
    layer = Image.new("RGBA", (w + 30, h + 30), (0, 0, 0, 0))
    glow = Image.new("RGBA", layer.size, (255, 80, 0, 0))
    glow.putalpha(mask.resize(mask.size).filter(ImageFilter.GaussianBlur(14)).point(lambda a: int(a * 0.8)).crop((0, 0) + layer.size) if False else Image.new("L", layer.size, 0))
    g = Image.new("L", layer.size, 0); g.paste(mask.filter(ImageFilter.GaussianBlur(16)), (6, 6))
    glow.putalpha(g.point(lambda a: int(a * 0.85)))
    layer = Image.alpha_composite(layer, glow)
    for i, col in [(9, (26, 0, 16)), (6, (58, 8, 32)), (3, (122, 16, 48))]:
        sh = Image.new("RGBA", layer.size, col + (255,))
        a = Image.new("L", layer.size, 0); a.paste(mask, (i, i))
        sh.putalpha(a)
        layer = Image.alpha_composite(layer, sh)
    fill = vgrad(layer.width, layer.height, [(0, (255, 251, 208)), (.3, (255, 229, 63)), (.55, (255, 154, 0)), (.85, (255, 45, 85)), (1, (255, 45, 85))]).convert("RGBA")
    a = Image.new("L", layer.size, 0); a.paste(mask, (0, 0))
    fill.putalpha(a)
    edge = Image.new("RGBA", layer.size, (255, 255, 255, 255))
    ea = Image.new("L", layer.size, 0); ea.paste(mask.filter(ImageFilter.MaxFilter(3)), (0, 0))
    edge.putalpha(ea)
    layer = Image.alpha_composite(layer, edge)
    layer = Image.alpha_composite(layer, fill)
    # skew right like the CSS skewX(-10deg) and stretch a bit taller
    k = 0.18
    layer = layer.transform((int(layer.width + layer.height * k), layer.height), Image.AFFINE, (1, k, -layer.height * k, 0, 1, 0), Image.BICUBIC)
    return layer.resize((layer.width, int(layer.height * 1.1)), Image.LANCZOS)


def framed(w, h, border, inner_fill):
    base = tile(IMG / "checker-tile.jpg", w, h, 0.42)
    d = ImageDraw.Draw(base)
    d.rectangle([border, border, w - border - 1, h - border - 1], fill=inner_fill)
    # lime dashed stitch just inside the checker frame
    s = border + 5
    for x in range(s, w - s, 18):
        d.line([(x, s), (min(x + 10, w - s), s)], fill=(57, 255, 20), width=3)
        d.line([(x, h - s), (min(x + 10, w - s), h - s)], fill=(57, 255, 20), width=3)
    for y in range(s, h - s, 18):
        d.line([(s, y), (s, min(y + 10, h - s))], fill=(57, 255, 20), width=3)
        d.line([(w - s, y), (w - s, min(y + 10, h - s))], fill=(57, 255, 20), width=3)
    return base


def og():
    W, H = 1200, 630
    bg = tile(IMG / "neon-tile.jpg", W, H, 0.7)
    card_w, card_h = 1040, 470
    card = framed(card_w, card_h, 22, (12, 10, 32))
    glow = Image.new("RGBA", (card_w, card_h), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([card_w * .1, -card_h * .6, card_w * .9, card_h * .55], fill=(60, 45, 140, 120))
    card = Image.alpha_composite(card.convert("RGBA"), glow.filter(ImageFilter.GaussianBlur(60)))
    logo = wordart("GAME CLUB", 210)
    card.alpha_composite(logo, ((card_w - logo.width) // 2, 40))
    d = ImageDraw.Draw(card)
    f = ImageFont.truetype(VERDANA_B, 30)
    star_f = ImageFont.truetype("C:/Windows/Fonts/seguisym.ttf", 30)
    tag = "LIKE BOOK CLUB BUT FOR GAMES"
    tw = d.textlength(tag, font=f)
    sw_ = d.textlength("★", font=star_f)
    x0 = (card_w - tw - 2 * (sw_ + 14)) / 2
    y0 = card_h - 120
    d.text((x0, y0 - 2), "★", font=star_f, fill=(255, 204, 0))
    d.text((x0 + sw_ + 14, y0), tag, font=f, fill=(57, 255, 20))
    d.text((x0 + sw_ + 28 + tw, y0 - 2), "★", font=star_f, fill=(255, 204, 0))
    f2 = ImageFont.truetype(VERDANA_B, 22)
    sub = "pick a game  ·  vote with your 3 flames  ·  chat  ·  play"
    sw = d.textlength(sub, font=f2)
    d.text(((card_w - sw) / 2, card_h - 70), sub, font=f2, fill=(255, 207, 63))
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rectangle([(W - card_w) // 2 + 10, (H - card_h) // 2 + 14, (W + card_w) // 2 + 10, (H + card_h) // 2 + 14], fill=(0, 0, 0, 170))
    out = Image.alpha_composite(bg.convert("RGBA"), shadow.filter(ImageFilter.GaussianBlur(14)))
    out.alpha_composite(card, ((W - card_w) // 2, (H - card_h) // 2))
    out.convert("RGB").save(IMG / "og-image.jpg", quality=84, optimize=True, progressive=True)


def icon(size, path):
    s = 512
    base = framed(s, s, 34, (12, 10, 32)).convert("RGBA")
    logo = wordart("GC", 330)
    logo.thumbnail((s - 120, s - 120), Image.LANCZOS)
    base.alpha_composite(logo, ((s - logo.width) // 2, (s - logo.height) // 2))
    base.convert("RGB").resize((size, size), Image.LANCZOS).save(path, optimize=True)


if __name__ == "__main__":
    og()
    icon(180, IMG / "apple-touch-icon.png")
    icon(192, IMG / "icon-192.png")
    icon(512, IMG / "icon-512.png")
    icon(32, IMG / "favicon-32.png")
    print("made og-image.png + icons in img/")
