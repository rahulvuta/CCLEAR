"""Generate the CCLEAR app icon and platform assets from a single geometric mark."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
assets = root / 'assets'
assets.mkdir(exist_ok=True)
size = 1024
scale = 4
canvas = Image.new('RGBA', (size * scale, size * scale), (0, 0, 0, 0))
draw = ImageDraw.Draw(canvas)

# A cobalt tile with a small point of attention in the letter's opening.
margin = 54 * scale
draw.rounded_rectangle((margin, margin, (size - 54) * scale, (size - 54) * scale), radius=222 * scale, fill='#485FC5')
font_path = '/System/Library/Fonts/SFNS.ttf'
font = ImageFont.truetype(font_path if Path(font_path).exists() else 'DejaVuSans.ttf', 760 * scale)
draw.text((202 * scale, 48 * scale), 'C', font=font, fill='#FFFFFF')
r = 48
draw.ellipse(((759-r)*scale, (514-r)*scale, (759+r)*scale, (514+r)*scale), fill='#FFD697')

icon = canvas.resize((size, size), Image.Resampling.LANCZOS)
icon.save(assets / 'icon.png')
icon.save(assets / 'icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
